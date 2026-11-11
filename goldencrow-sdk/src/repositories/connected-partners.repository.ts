import { FieldPath } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import {
  CONNECTED_PARTNERS_COLLECTION,
  PartnerIdSchema,
  PartnerInputSchema,
  PartnerLinkIdSchema,
  PartnerAppSnapshotSchema,
  PartnerOrganizationSnapshotSchema,
  StoredPartnerSchema,
  type PartnerAppSnapshot,
  type PartnerOrganizationSnapshot,
  type PartnerIndividualPublisherSnapshot,
  type PartnerLinkOption,
  type PartnerLinkOptionsPage,
  type StoredPartner,
  type Partner,
  type PartnerInput,
  type PartnersPage,
} from "../contracts/connected-partners.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";

const PAGE_SIZE = 20;
const ORGANIZATIONS_COLLECTION = "feed_organizations";
const INDIVIDUALS_COLLECTION = "feed_individuals";
const APPS_COLLECTION = "app_configs";

function collection(context: AdminContext) {
  if (!context.isBootstrap) {
    throw new AdminRepositoryError("GOD MODE access required", 403);
  }
  return adminDbFor("mydnamap").collection(CONNECTED_PARTNERS_COLLECTION);
}

function validId(id: string) {
  const result = PartnerIdSchema.safeParse(id);
  if (!result.success) throw new AdminRepositoryError("Invalid partner ID", 400);
  return result.data;
}

function appSnapshot(id: string, data: Record<string, unknown> | undefined) {
  if (
    data?.publisherKind !== "organization" &&
    data?.publisherKind !== "individual"
  ) return null;
  const parsed = PartnerAppSnapshotSchema.safeParse({
    id,
    publisherKind: data.publisherKind,
    publisherId: data.publisherId,
    publisherName: data.publisherName,
    status: data.status,
    ...(typeof data.appProviderIdentifier === "string" && data.appProviderIdentifier.trim()
      ? { appProviderIdentifier: data.appProviderIdentifier.trim() }
      : {}),
  });
  return parsed.success ? parsed.data : null;
}

type LinkReader = {
  organization: (id: string) => Promise<PartnerOrganizationSnapshot | null>;
  individual: (id: string) => Promise<PartnerIndividualPublisherSnapshot | null>;
  app: (id: string) => Promise<PartnerAppSnapshot | null>;
};

// Repeated links are read once per page. Snapshots never determine live status.
function linkReader(): LinkReader {
  const db = adminDbFor("mydnamap");
  const publishers = new Map<string, Promise<PartnerOrganizationSnapshot | null>>();
  const apps = new Map<string, Promise<PartnerAppSnapshot | null>>();
  function publisher(collectionName: string, id: string) {
    const key = `${collectionName}/${id}`;
    if (!publishers.has(key)) {
      publishers.set(key, (async () => {
        const doc = await db.collection(collectionName).doc(id).get();
        const parsed = PartnerOrganizationSnapshotSchema.safeParse({
          id,
          name: doc.data()?.name,
        });
        return doc.exists && parsed.success ? parsed.data : null;
      })());
    }
    return publishers.get(key)!;
  }
  return {
    organization: (id) => publisher(ORGANIZATIONS_COLLECTION, id),
    individual: (id) => publisher(INDIVIDUALS_COLLECTION, id),
    app(id) {
      if (!PartnerLinkIdSchema.safeParse(id).success) return Promise.resolve(null);
      if (!apps.has(id)) {
        apps.set(id, (async () => {
          const doc = await db.collection(APPS_COLLECTION).doc(id).get();
          return doc.exists ? appSnapshot(id, doc.data()) : null;
        })());
      }
      return apps.get(id)!;
    },
  };
}

async function toPartner(
  id: string,
  data: unknown,
  reader: LinkReader,
): Promise<Partner> {
  const stored = StoredPartnerSchema.parse(data);
  const [linkedOrganization, linkedIndividualPublisher, app] = await Promise.all([
    stored.linkedOrganizationId
      ? reader.organization(stored.linkedOrganizationId) : null,
    stored.linkedIndividualPublisherId
      ? reader.individual(stored.linkedIndividualPublisherId) : null,
    stored.linkedAppId ? reader.app(stored.linkedAppId) : null,
  ]);
  const appOwner = app?.publisherKind === "individual"
    ? linkedIndividualPublisher : linkedOrganization;
  return {
    ...stored,
    id,
    linkedOrganization,
    linkedIndividualPublisher,
    linkedApp: app && appOwner?.id === app.publisherId ? app : null,
  };
}

async function preparePartner(input: PartnerInput): Promise<StoredPartner> {
  const data = PartnerInputSchema.parse(input);
  const reader = linkReader();
  const linkedApp = data.linkedAppId ? await reader.app(data.linkedAppId) : null;
  if (data.linkedAppId && !linkedApp) {
    throw new AdminRepositoryError("Linked app not found", 400);
  }
  if (linkedApp) {
    const ownerKey = linkedApp.publisherKind === "individual"
      ? "linkedIndividualPublisherId" : "linkedOrganizationId";
    if (data[ownerKey] && data[ownerKey] !== linkedApp.publisherId) {
      const ownerLabel = linkedApp.publisherKind === "individual"
        ? "individual publisher" : "organization";
      throw new AdminRepositoryError(
        `Linked app belongs to a different ${ownerLabel}`,
        400,
      );
    }
    data[ownerKey] = linkedApp.publisherId;
  }
  const [linkedOrganization, linkedIndividualPublisher] = await Promise.all([
    data.linkedOrganizationId ? reader.organization(data.linkedOrganizationId) : null,
    data.linkedIndividualPublisherId
      ? reader.individual(data.linkedIndividualPublisherId) : null,
  ]);
  if (data.linkedOrganizationId && !linkedOrganization) {
    throw new AdminRepositoryError("Linked organization not found", 400);
  }
  if (data.linkedIndividualPublisherId && !linkedIndividualPublisher) {
    throw new AdminRepositoryError("Linked individual publisher not found", 400);
  }
  return {
    ...data,
    linkedOrganizationSnapshot: linkedOrganization,
    linkedIndividualPublisherSnapshot: linkedIndividualPublisher,
    linkedAppSnapshot: linkedApp,
  };
}

function preparedResponse(id: string, data: StoredPartner): Partner {
  return {
    ...data,
    id,
    linkedOrganization: data.linkedOrganizationSnapshot,
    linkedIndividualPublisher: data.linkedIndividualPublisherSnapshot,
    linkedApp: data.linkedAppSnapshot,
  };
}

export async function listPartners(
  context: AdminContext,
  cursor?: string,
): Promise<PartnersPage> {
  let query = collection(context).orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(validId(cursor));
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const docs = snapshot.docs.slice(0, PAGE_SIZE);
  const reader = linkReader();
  return {
    items: await Promise.all(docs.map((doc) => toPartner(doc.id, doc.data(), reader))),
    nextCursor: snapshot.docs.length > PAGE_SIZE ? docs[docs.length - 1]!.id : null,
  };
}

export async function getPartner(
  context: AdminContext,
  id: string,
): Promise<Partner> {
  const doc = await collection(context).doc(validId(id)).get();
  if (!doc.exists) throw new AdminRepositoryError("Partner not found", 404);
  return toPartner(doc.id, doc.data(), linkReader());
}

export async function createPartner(
  context: AdminContext,
  input: PartnerInput,
): Promise<Partner> {
  const partners = collection(context);
  const data = await preparePartner(input);
  const ref = partners.doc();
  await ref.create(data);
  return preparedResponse(ref.id, data);
}

export async function updatePartner(
  context: AdminContext,
  id: string,
  input: PartnerInput,
): Promise<Partner> {
  const ref = collection(context).doc(validId(id));
  const data = await preparePartner(input);
  // update() preserves the not-found precondition even if deletion races a save.
  try {
    await ref.update(data);
  } catch (error) {
    if ((error as { code?: number }).code === 5) {
      throw new AdminRepositoryError("Partner not found", 404);
    }
    throw error;
  }
  return preparedResponse(id, data);
}

function appOption(app: PartnerAppSnapshot): PartnerLinkOption {
  return {
    id: app.id,
    name: app.publisherName,
    publisherKind: app.publisherKind,
    publisherId: app.publisherId,
    status: app.status,
    ...(app.appProviderIdentifier ? { appProviderIdentifier: app.appProviderIdentifier } : {}),
  };
}

type LinkOptions = {
  kind: "organization" | "individual" | "app";
  cursor?: string;
  organizationId?: string;
  individualPublisherId?: string;
  id?: string;
};

function appMatchesScope(app: PartnerAppSnapshot, options: LinkOptions) {
  if (!options.organizationId && !options.individualPublisherId) return true;
  return app.publisherKind === "organization"
    ? app.publisherId === options.organizationId
    : app.publisherId === options.individualPublisherId;
}

export async function listPartnerLinkOptions(
  context: AdminContext,
  options: LinkOptions,
): Promise<PartnerLinkOptionsPage> {
  collection(context);
  const db = adminDbFor("mydnamap");
  const reader = linkReader();
  const cursor = options.cursor
    ? PartnerLinkIdSchema.parse(options.cursor) : undefined;
  const publisherCollection = options.kind === "organization"
    ? ORGANIZATIONS_COLLECTION : INDIVIDUALS_COLLECTION;
  if (options.id) {
    const id = PartnerLinkIdSchema.parse(options.id);
    if (options.kind !== "app") {
      const publisher = options.kind === "organization"
        ? await reader.organization(id) : await reader.individual(id);
      return { items: publisher ? [publisher] : [], nextCursor: null };
    }
    let app = await reader.app(id);
    if (!app) {
      // An exact public app identifier is also accepted without scanning configs.
      const matches = await db.collection(APPS_COLLECTION)
        .where("appProviderIdentifier", "==", id)
        .limit(2)
        .get();
      if (matches.docs.length > 1) {
        throw new AdminRepositoryError(
          "This app ID matches more than one app. Use the app document ID.",
          400,
        );
      }
      const match = matches.docs[0];
      app = match ? appSnapshot(match.id, match.data()) : null;
    }
    return { items: app ? [appOption(app)] : [], nextCursor: null };
  }
  if (
    options.kind === "app" &&
    (options.organizationId || options.individualPublisherId)
  ) {
    // Canonical app config IDs allow at most two direct reads for selected publishers.
    const apps = await Promise.all([
      ...(options.organizationId
        ? [reader.app(`organization_${PartnerLinkIdSchema.parse(options.organizationId)}`)]
        : []),
      ...(options.individualPublisherId
        ? [reader.app(`individual_${PartnerLinkIdSchema.parse(options.individualPublisherId)}`)]
        : []),
    ]);
    return {
      items: apps
        .filter((app): app is PartnerAppSnapshot => Boolean(
          app && appMatchesScope(app, options) && (!cursor || app.id > cursor),
        ))
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(appOption),
      nextCursor: null,
    };
  }
  let query = db.collection(
    options.kind === "app" ? APPS_COLLECTION : publisherCollection,
  ).orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const docs = snapshot.docs.slice(0, PAGE_SIZE);
  return {
    items: docs.flatMap((doc) => {
      const data = doc.data();
      if (options.kind !== "app") {
        const parsed = PartnerOrganizationSnapshotSchema.safeParse({
          id: doc.id,
          name: data.name,
        });
        return parsed.success ? [parsed.data] : [];
      }
      const app = appSnapshot(doc.id, data);
      return app ? [appOption(app)] : [];
    }),
    nextCursor: snapshot.docs.length > PAGE_SIZE ? docs[docs.length - 1]!.id : null,
  };
}

export async function deletePartners(context: AdminContext, ids: string[]) {
  const partners = collection(context);
  const uniqueIds = [...new Set(ids.map(validId))];
  if (uniqueIds.length < 1 || uniqueIds.length > 500) {
    throw new AdminRepositoryError("Select between 1 and 500 partners", 400);
  }
  const batch = adminDbFor("mydnamap").batch();
  for (const id of uniqueIds) batch.delete(partners.doc(id));
  await batch.commit();
  return { deletedIds: uniqueIds };
}
