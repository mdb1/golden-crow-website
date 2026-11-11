import { FieldPath, type Query } from "firebase-admin/firestore";
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
  type PartnerLinkOptionsPage,
  type StoredPartner,
  type Partner,
  type PartnerInput,
  type PartnersPage,
} from "../contracts/connected-partners.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";

const PAGE_SIZE = 20;

function collection(context: AdminContext) {
  if (!context.isBootstrap) {
    throw new AdminRepositoryError("GOD MODE access required", 403);
  }
  return adminDbFor("mydnamap").collection(CONNECTED_PARTNERS_COLLECTION);
}

function validId(id: string) {
  const result = PartnerIdSchema.safeParse(id);
  if (!result.success)
    throw new AdminRepositoryError("Invalid partner ID", 400);
  return result.data;
}

type LinkReader = {
  organization: (id: string) => Promise<PartnerOrganizationSnapshot | null>;
  app: (id: string) => Promise<PartnerAppSnapshot | null>;
};

// Reads are scoped to the linked documents, with repeated links deduplicated
// within a page. Stored snapshots never determine the current app status.
function linkReader(): LinkReader {
  const db = adminDbFor("mydnamap");
  const organizations = new Map<string, Promise<PartnerOrganizationSnapshot | null>>();
  const apps = new Map<string, Promise<PartnerAppSnapshot | null>>();
  return {
    organization(id) {
      if (!organizations.has(id)) organizations.set(id, (async () => {
        const doc = await db.collection("feed_organizations").doc(id).get();
        const parsed = PartnerOrganizationSnapshotSchema.safeParse({ id, name: doc.data()?.name });
        return doc.exists && parsed.success ? parsed.data : null;
      })());
      return organizations.get(id)!;
    },
    app(id) {
      if (!apps.has(id)) apps.set(id, (async () => {
        const doc = await db.collection("app_configs").doc(id).get();
        const data = doc.data();
        if (!doc.exists || data?.publisherKind !== "organization") return null;
        const parsed = PartnerAppSnapshotSchema.safeParse({
          id, publisherId: data.publisherId, publisherName: data.publisherName, status: data.status,
        });
        return parsed.success ? parsed.data : null;
      })());
      return apps.get(id)!;
    },
  };
}

async function toPartner(id: string, data: unknown, reader: LinkReader): Promise<Partner> {
  const stored = StoredPartnerSchema.parse(data);
  const [linkedOrganization, app] = await Promise.all([
    stored.linkedOrganizationId ? reader.organization(stored.linkedOrganizationId) : null,
    stored.linkedAppId ? reader.app(stored.linkedAppId) : null,
  ]);
  return {
    ...stored, id, linkedOrganization,
    linkedApp: app?.publisherId === stored.linkedOrganizationId ? app : null,
  };
}

async function preparePartner(input: PartnerInput): Promise<StoredPartner> {
  const data = PartnerInputSchema.parse(input);
  const reader = linkReader();
  const linkedApp = data.linkedAppId ? await reader.app(data.linkedAppId) : null;
  if (data.linkedAppId && !linkedApp) {
    throw new AdminRepositoryError("Linked organization app not found", 400);
  }
  if (linkedApp) {
    if (data.linkedOrganizationId && data.linkedOrganizationId !== linkedApp.publisherId) {
      throw new AdminRepositoryError("Linked app belongs to a different organization", 400);
    }
    data.linkedOrganizationId = linkedApp.publisherId;
  }
  const linkedOrganization = data.linkedOrganizationId
    ? await reader.organization(data.linkedOrganizationId) : null;
  if (data.linkedOrganizationId && !linkedOrganization) {
    throw new AdminRepositoryError("Linked organization not found", 400);
  }
  return {
    ...data,
    linkedOrganizationSnapshot: linkedOrganization,
    linkedAppSnapshot: linkedApp,
  };
}

function preparedResponse(id: string, data: StoredPartner): Partner {
  return {
    ...data, id,
    linkedOrganization: data.linkedOrganizationSnapshot,
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
    nextCursor:
      snapshot.docs.length > PAGE_SIZE ? docs[docs.length - 1]!.id : null,
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

export async function listPartnerLinkOptions(
  context: AdminContext,
  options: { kind: "organization" | "app"; cursor?: string; organizationId?: string },
): Promise<PartnerLinkOptionsPage> {
  collection(context);
  const db = adminDbFor("mydnamap");
  const cursor = options.cursor ? PartnerLinkIdSchema.parse(options.cursor) : undefined;
  if (options.kind === "app" && options.organizationId) {
    // Organization app IDs are canonical and deterministic. This direct read
    // avoids scanning unrelated apps or introducing a composite index.
    const organizationId = PartnerLinkIdSchema.parse(options.organizationId);
    const app = await linkReader().app(`organization_${organizationId}`);
    return {
      items: app && app.publisherId === organizationId && (!cursor || app.id > cursor)
        ? [{ id: app.id, name: app.publisherName, publisherId: app.publisherId, status: app.status }] : [],
      nextCursor: null,
    };
  }
  let query: Query = db.collection(options.kind === "organization" ? "feed_organizations" : "app_configs");
  if (options.kind === "app") query = query.where("publisherKind", "==", "organization");
  query = query.orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const docs = snapshot.docs.slice(0, PAGE_SIZE);
  return {
    items: docs.flatMap((doc) => {
      const data = doc.data();
      if (options.kind === "organization") {
        const parsed = PartnerOrganizationSnapshotSchema.safeParse({ id: doc.id, name: data.name });
        return parsed.success ? [{ id: parsed.data.id, name: parsed.data.name }] : [];
      }
      const parsed = PartnerAppSnapshotSchema.safeParse({
        id: doc.id, publisherId: data.publisherId, publisherName: data.publisherName, status: data.status,
      });
      return parsed.success ? [{
        id: parsed.data.id, name: parsed.data.publisherName,
        publisherId: parsed.data.publisherId, status: parsed.data.status,
      }] : [];
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
