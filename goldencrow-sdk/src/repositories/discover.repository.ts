import {
  FieldPath,
  FieldValue,
  Timestamp,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { AdminRepositoryError } from "./admin-errors.js";
import type {
  AdminContext,
  DiscoverFeedItemRecord,
  DiscoverFeedStatus,
  DiscoverFeedType,
  DiscoverListPage,
  DiscoverOrganizationRecord,
  DiscoverOrganizationStatus,
  DiscoverOrganizationType,
} from "../types/sdk.types.js";

const adminDb = adminDbFor("mydnamap");

const ORGANIZATIONS_COLLECTION = "feed_organizations";
const FEED_ITEMS_COLLECTION = "feed_items";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const ORGANIZATION_STATUSES = new Set<DiscoverOrganizationStatus>([
  "active",
  "inactive",
  "archived",
]);
const ORGANIZATION_TYPES = new Set<DiscoverOrganizationType>([
  "foundation",
  "hospital",
  "university",
  "laboratory",
  "research_institute",
  "patient_advocacy_group",
  "public_health_agency",
  "conference_organizer",
  "company",
  "other",
]);
const FEED_TYPES = new Set<DiscoverFeedType>([
  "news",
  "research_update",
  "upcoming_event",
  "opportunity",
]);
const FEED_STATUSES = new Set<DiscoverFeedStatus>([
  "draft",
  "in_review",
  "scheduled",
  "published",
  "archived",
]);
const VALIDATED_STATUSES = new Set<DiscoverFeedStatus>([
  "in_review",
  "scheduled",
  "published",
]);
const SNAPSHOT_SYNC_STATUSES = new Set<DiscoverFeedStatus>([
  "draft",
  "scheduled",
  "published",
]);

type PageCursor = {
  updatedAtMillis: number;
  id: string;
};

type OrganizationInput = {
  name?: unknown;
  imageUrl?: unknown;
  status?: unknown;
  slug?: unknown;
  websiteUrl?: unknown;
  description?: unknown;
  countryCode?: unknown;
  organizationType?: unknown;
  verified?: unknown;
  contactEmail?: unknown;
  internalNotes?: unknown;
};

type FeedItemInput = {
  publisherOrganizationId?: unknown;
  type?: unknown;
  status?: unknown;
  publishedAt?: unknown;
  scheduledFor?: unknown;
  sourceUrl?: unknown;
  editorialNotes?: unknown;
  tags?: unknown;
  locale?: unknown;
  priority?: unknown;
  expiresAt?: unknown;
  news?: unknown;
  research_update?: unknown;
  upcoming_event?: unknown;
  opportunity?: unknown;
};

function requireFullAdmin(context: AdminContext) {
  if (context.role !== "full_admin") {
    throw new AdminRepositoryError("Full admin access required.", 403);
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeNullableString(value: unknown): string | null {
  return normalizeOptionalString(value) ?? null;
}

function normalizeRequiredString(value: unknown, label: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new AdminRepositoryError(`${label} is required.`, 400);
  }

  return normalized;
}

function normalizeHttpsUrl(value: unknown, label: string): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new AdminRepositoryError(`${label} must be a valid HTTPS URL.`, 400);
  }

  if (url.protocol !== "https:") {
    throw new AdminRepositoryError(`${label} must use HTTPS.`, 400);
  }

  return url.toString();
}

function normalizeOptionalEmail(value: unknown, label: string): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AdminRepositoryError(`${label} must be a valid email.`, 400);
  }

  return normalized;
}

function normalizeCountryCode(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toUpperCase() : undefined;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "on";
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeTimestamp(value: unknown, label: string): Timestamp | null {
  if (value == null || value === "") {
    return null;
  }

  if (value instanceof Timestamp) {
    return value;
  }

  const candidate =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;

  if (!candidate || Number.isNaN(candidate.getTime())) {
    throw new AdminRepositoryError(`${label} must be a valid date/time.`, 400);
  }

  return Timestamp.fromDate(candidate);
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function serializePayloadValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializePayloadValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializePayloadValue(entry),
      ]),
    );
  }

  return value;
}

function withoutUndefined<T>(value: T): T {
  if (value instanceof Timestamp || value instanceof FieldValue) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => withoutUndefined(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, withoutUndefined(entry)]),
    ) as T;
  }

  return value;
}

function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): PageCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      updatedAtMillis?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed.updatedAtMillis === "number" &&
      Number.isFinite(parsed.updatedAtMillis) &&
      typeof parsed.id === "string" &&
      parsed.id
    ) {
      return { updatedAtMillis: parsed.updatedAtMillis, id: parsed.id };
    }
  } catch {
    return null;
  }

  return null;
}

function resolvePageSize(limit: unknown) {
  const parsed = normalizeNumber(limit, DEFAULT_PAGE_SIZE);
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PAGE_SIZE);
}

function cursorFromDoc(doc: QueryDocumentSnapshot): PageCursor | null {
  const updatedAt = doc.data().updatedAt;
  const updatedAtIso = timestampToIso(updatedAt);
  if (!updatedAtIso) {
    return null;
  }

  return {
    updatedAtMillis: new Date(updatedAtIso).getTime(),
    id: doc.id,
  };
}

function toOrganizationRecord(doc: QueryDocumentSnapshot): DiscoverOrganizationRecord {
  const data = doc.data() as Record<string, unknown>;
  const status = ORGANIZATION_STATUSES.has(data.status as DiscoverOrganizationStatus)
    ? (data.status as DiscoverOrganizationStatus)
    : "inactive";
  const organizationType = ORGANIZATION_TYPES.has(
    data.organizationType as DiscoverOrganizationType,
  )
    ? (data.organizationType as DiscoverOrganizationType)
    : undefined;

  return {
    id: doc.id,
    name: normalizeOptionalString(data.name) ?? doc.id,
    imageUrl: normalizeNullableString(data.imageUrl),
    status,
    slug: normalizeOptionalString(data.slug),
    websiteUrl: normalizeOptionalString(data.websiteUrl),
    description: normalizeOptionalString(data.description),
    countryCode: normalizeOptionalString(data.countryCode),
    organizationType,
    verified: data.verified === true,
    contactEmail: normalizeOptionalString(data.contactEmail),
    internalNotes: normalizeOptionalString(data.internalNotes),
    createdAt: timestampToIso(data.createdAt) ?? "",
    updatedAt: timestampToIso(data.updatedAt) ?? "",
    createdByUserId: normalizeOptionalString(data.createdByUserId),
    updatedByUserId: normalizeOptionalString(data.updatedByUserId),
  };
}

function getPayloadKey(type: DiscoverFeedType) {
  return type;
}

function getFeedTitle(item: DiscoverFeedItemRecord) {
  const payload = item[item.type] as Record<string, unknown> | undefined;
  return normalizeOptionalString(payload?.title) ?? "Untitled";
}

function toFeedItemRecord(doc: QueryDocumentSnapshot): DiscoverFeedItemRecord {
  const data = doc.data() as Record<string, unknown>;
  const type = FEED_TYPES.has(data.type as DiscoverFeedType)
    ? (data.type as DiscoverFeedType)
    : "news";
  const status = FEED_STATUSES.has(data.status as DiscoverFeedStatus)
    ? (data.status as DiscoverFeedStatus)
    : "draft";
  const publisherSnapshot =
    data.publisherSnapshot && typeof data.publisherSnapshot === "object"
      ? (data.publisherSnapshot as Record<string, unknown>)
      : {};
  const record: DiscoverFeedItemRecord = {
    id: doc.id,
    publisherOrganizationId: normalizeOptionalString(data.publisherOrganizationId) ?? "",
    publisherSnapshot: {
      name: normalizeOptionalString(publisherSnapshot.name) ?? "Unknown publisher",
      imageUrl: normalizeNullableString(publisherSnapshot.imageUrl),
    },
    type,
    publishedAt: timestampToIso(data.publishedAt),
    sourceUrl: normalizeNullableString(data.sourceUrl),
    status,
    createdAt: timestampToIso(data.createdAt) ?? "",
    updatedAt: timestampToIso(data.updatedAt) ?? "",
    createdByUserId: normalizeOptionalString(data.createdByUserId),
    updatedByUserId: normalizeOptionalString(data.updatedByUserId),
    reviewedByUserId: normalizeOptionalString(data.reviewedByUserId),
    reviewedAt: timestampToIso(data.reviewedAt),
    scheduledFor: timestampToIso(data.scheduledFor),
    archivedAt: timestampToIso(data.archivedAt),
    editorialNotes: normalizeOptionalString(data.editorialNotes),
    tags: normalizeStringArray(data.tags),
    locale: normalizeOptionalString(data.locale),
    priority: normalizeNumber(data.priority),
    expiresAt: timestampToIso(data.expiresAt),
  };

  for (const payloadKey of FEED_TYPES) {
    const payload = data[payloadKey];
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      record[payloadKey] = serializePayloadValue(payload) as Record<string, unknown>;
    }
  }

  return record;
}

async function listCollectionPage<T>(
  collectionName: string,
  cursor: string | undefined,
  limit: unknown,
  mapper: (doc: QueryDocumentSnapshot) => T,
): Promise<DiscoverListPage<T>> {
  const pageSize = resolvePageSize(limit);
  const decodedCursor = decodeCursor(cursor);
  let query = adminDb
    .collection(collectionName)
    .orderBy("updatedAt", "desc")
    .orderBy(FieldPath.documentId(), "desc")
    .limit(pageSize + 1);

  if (decodedCursor) {
    query = query.startAfter(
      Timestamp.fromMillis(decodedCursor.updatedAtMillis),
      decodedCursor.id,
    );
  }

  const snapshot = await query.get();
  const pageDocs = snapshot.docs.slice(0, pageSize);
  const nextDoc = snapshot.docs[pageSize];
  const nextCursorSource = nextDoc ? pageDocs[pageDocs.length - 1] : undefined;
  const nextCursor = nextCursorSource
    ? cursorFromDoc(nextCursorSource)
    : null;

  return {
    records: pageDocs.map(mapper),
    nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
  };
}

function normalizeOrganizationStatus(value: unknown) {
  return ORGANIZATION_STATUSES.has(value as DiscoverOrganizationStatus)
    ? (value as DiscoverOrganizationStatus)
    : "active";
}

function normalizeOrganizationType(value: unknown): DiscoverOrganizationType | undefined {
  return ORGANIZATION_TYPES.has(value as DiscoverOrganizationType)
    ? (value as DiscoverOrganizationType)
    : undefined;
}

function organizationDocument(input: OrganizationInput, context: AdminContext) {
  const name = normalizeRequiredString(input.name, "Organization name");

  return {
    name,
    imageUrl: normalizeHttpsUrl(input.imageUrl, "Organization image URL"),
    status: normalizeOrganizationStatus(input.status),
    slug: normalizeOptionalString(input.slug),
    websiteUrl: normalizeHttpsUrl(input.websiteUrl, "Website URL"),
    description: normalizeOptionalString(input.description),
    countryCode: normalizeCountryCode(input.countryCode),
    organizationType: normalizeOrganizationType(input.organizationType),
    verified: normalizeBoolean(input.verified),
    contactEmail: normalizeOptionalEmail(input.contactEmail, "Contact email"),
    internalNotes: normalizeOptionalString(input.internalNotes),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  };
}

async function getOrganizationSnapshot(organizationId: string) {
  const snapshot = await adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .doc(organizationId)
    .get();

  return snapshot.exists ? (snapshot as QueryDocumentSnapshot) : null;
}

async function getFeedItemSnapshot(feedItemId: string) {
  const snapshot = await adminDb
    .collection(FEED_ITEMS_COLLECTION)
    .doc(feedItemId)
    .get();

  return snapshot.exists ? (snapshot as QueryDocumentSnapshot) : null;
}

function normalizeFeedType(value: unknown): DiscoverFeedType {
  if (!FEED_TYPES.has(value as DiscoverFeedType)) {
    throw new AdminRepositoryError("Feed entry type is required.", 400);
  }

  return value as DiscoverFeedType;
}

function normalizeFeedStatus(value: unknown): DiscoverFeedStatus {
  if (!value) {
    return "draft";
  }

  if (!FEED_STATUSES.has(value as DiscoverFeedStatus)) {
    throw new AdminRepositoryError("Use a valid feed entry status.", 400);
  }

  return value as DiscoverFeedStatus;
}

function normalizeLocationType(value: unknown): string | undefined {
  return normalizeOptionalString(value);
}

function normalizePayloadBase(
  rawPayload: unknown,
  status: DiscoverFeedStatus,
): Record<string, unknown> {
  const payload =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : {};
  const title = normalizeOptionalString(payload.title);
  const summary = normalizeOptionalString(payload.summary);

  if (VALIDATED_STATUSES.has(status)) {
    if (!title) {
      throw new AdminRepositoryError("Feed entry title is required before review, scheduling, or publishing.", 400);
    }
    if (!summary) {
      throw new AdminRepositoryError("Feed entry summary is required before review, scheduling, or publishing.", 400);
    }
  }

  return {
    title: title ?? "",
    summary: summary ?? "",
    imageUrl: normalizeHttpsUrl(payload.imageUrl, "Payload image URL"),
  };
}

function normalizeTypePayload(
  type: DiscoverFeedType,
  input: FeedItemInput,
  status: DiscoverFeedStatus,
) {
  const payloadInput = input[getPayloadKey(type)];
  const payload =
    payloadInput && typeof payloadInput === "object" && !Array.isArray(payloadInput)
      ? (payloadInput as Record<string, unknown>)
      : {};
  const base = normalizePayloadBase(payload, status);

  if (type === "news") {
    return {
      ...base,
      category: normalizeOptionalString(payload.category),
      region: normalizeOptionalString(payload.region),
      detailTitle: normalizeOptionalString(payload.detailTitle),
      detailBody: normalizeOptionalString(payload.detailBody),
      keyPoints: normalizeStringArray(payload.keyPoints),
    };
  }

  if (type === "research_update") {
    return {
      ...base,
      topic: normalizeOptionalString(payload.topic),
      genes: normalizeStringArray(payload.genes),
      conditions: normalizeStringArray(payload.conditions),
      journalName: normalizeOptionalString(payload.journalName),
      publicationDate: normalizeOptionalString(payload.publicationDate),
      doi: normalizeOptionalString(payload.doi),
      plainLanguageTakeaway: normalizeOptionalString(payload.plainLanguageTakeaway),
      detailBody: normalizeOptionalString(payload.detailBody),
      keyPoints: normalizeStringArray(payload.keyPoints),
    };
  }

  if (type === "upcoming_event") {
    return {
      ...base,
      startsAt: normalizeTimestamp(payload.startsAt, "Event start"),
      endsAt: normalizeTimestamp(payload.endsAt, "Event end"),
      timezone: normalizeOptionalString(payload.timezone),
      locationType: normalizeLocationType(payload.locationType),
      locationName: normalizeOptionalString(payload.locationName),
      registrationUrl: normalizeHttpsUrl(payload.registrationUrl, "Registration URL"),
      priceLabel: normalizeOptionalString(payload.priceLabel),
      audienceLabel: normalizeOptionalString(payload.audienceLabel),
      agenda: normalizeStringArray(payload.agenda),
      detailBody: normalizeOptionalString(payload.detailBody),
    };
  }

  return {
    ...base,
    opportunityType: normalizeOptionalString(payload.opportunityType),
    deadlineAt: normalizeTimestamp(payload.deadlineAt, "Opportunity deadline"),
    locationType: normalizeLocationType(payload.locationType),
    locationName: normalizeOptionalString(payload.locationName),
    eligibility: normalizeOptionalString(payload.eligibility),
    applicationUrl: normalizeHttpsUrl(payload.applicationUrl, "Application URL"),
    detailBody: normalizeOptionalString(payload.detailBody),
    requirements: normalizeStringArray(payload.requirements),
  };
}

async function feedItemDocument(
  input: FeedItemInput,
  context: AdminContext,
  existing?: Record<string, unknown>,
) {
  const publisherOrganizationId = normalizeRequiredString(
    input.publisherOrganizationId,
    "Publisher organization",
  );
  const organizationSnapshot = await getOrganizationSnapshot(publisherOrganizationId);
  if (!organizationSnapshot) {
    throw new AdminRepositoryError("Publisher organization not found.", 404);
  }
  const organization = toOrganizationRecord(organizationSnapshot);
  const type = normalizeFeedType(input.type);
  const status = normalizeFeedStatus(input.status);

  if ((status === "published" || status === "scheduled") && organization.status !== "active") {
    throw new AdminRepositoryError(
      "Only active organizations can publish or schedule feed entries.",
      400,
    );
  }

  const scheduledFor = normalizeTimestamp(input.scheduledFor, "Scheduled publish time");
  if (status === "scheduled" && !scheduledFor) {
    throw new AdminRepositoryError("Scheduled feed entries need a scheduled publish time.", 400);
  }

  const inputPublishedAt = normalizeTimestamp(input.publishedAt, "Published time");
  const publishedAt =
    status === "published"
      ? inputPublishedAt ?? FieldValue.serverTimestamp()
      : inputPublishedAt;
  const archivedAt =
    status === "archived"
      ? normalizeTimestamp(existing?.archivedAt, "Archived time") ?? FieldValue.serverTimestamp()
      : null;
  const payload = normalizeTypePayload(type, input, status);

  return {
    publisherOrganizationId,
    publisherSnapshot: {
      name: organization.name,
      imageUrl: organization.imageUrl,
    },
    type,
    publishedAt,
    sourceUrl: normalizeHttpsUrl(input.sourceUrl, "Source URL"),
    status,
    scheduledFor,
    archivedAt,
    editorialNotes: normalizeOptionalString(input.editorialNotes),
    tags: normalizeStringArray(input.tags),
    locale: normalizeOptionalString(input.locale) ?? "en",
    priority: normalizeNumber(input.priority),
    expiresAt: normalizeTimestamp(input.expiresAt, "Expiration time"),
    [getPayloadKey(type)]: payload,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  };
}

export async function listDiscoverOrganizations(
  context: AdminContext,
  options: { cursor?: string; limit?: unknown } = {},
) {
  requireFullAdmin(context);

  const page = await listCollectionPage(
    ORGANIZATIONS_COLLECTION,
    options.cursor,
    options.limit,
    toOrganizationRecord,
  );

  return {
    organizations: page.records,
    nextCursor: page.nextCursor,
  };
}

export async function getDiscoverOrganization(
  context: AdminContext,
  organizationId: string,
) {
  requireFullAdmin(context);
  const snapshot = await getOrganizationSnapshot(organizationId);
  if (!snapshot) {
    throw new AdminRepositoryError("Organization not found.", 404);
  }

  return toOrganizationRecord(snapshot);
}

export async function createDiscoverOrganization(
  context: AdminContext,
  input: OrganizationInput,
) {
  requireFullAdmin(context);
  const ref = adminDb.collection(ORGANIZATIONS_COLLECTION).doc();
  await ref.set(
    withoutUndefined({
      ...organizationDocument(input, context),
      createdAt: FieldValue.serverTimestamp(),
      createdByUserId: context.uid,
    }),
  );

  return getDiscoverOrganization(context, ref.id);
}

export async function updateDiscoverOrganization(
  context: AdminContext,
  organizationId: string,
  input: OrganizationInput,
) {
  requireFullAdmin(context);
  const existing = await getOrganizationSnapshot(organizationId);
  if (!existing) {
    throw new AdminRepositoryError("Organization not found.", 404);
  }

  await existing.ref.set(
    withoutUndefined({
      ...existing.data(),
      ...organizationDocument(input, context),
    }),
    { merge: false },
  );

  return getDiscoverOrganization(context, organizationId);
}

export async function syncDiscoverPublisherSnapshot(
  context: AdminContext,
  organizationId: string,
) {
  requireFullAdmin(context);
  const organization = await getDiscoverOrganization(context, organizationId);
  const snapshot = await adminDb
    .collection(FEED_ITEMS_COLLECTION)
    .where("publisherOrganizationId", "==", organizationId)
    .get();
  const recordsToSync = snapshot.docs.filter((doc) =>
    SNAPSHOT_SYNC_STATUSES.has(doc.data().status as DiscoverFeedStatus),
  );

  let updated = 0;
  for (let index = 0; index < recordsToSync.length; index += 450) {
    const batch = adminDb.batch();
    for (const doc of recordsToSync.slice(index, index + 450)) {
      batch.update(doc.ref, {
        publisherSnapshot: {
          name: organization.name,
          imageUrl: organization.imageUrl,
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUserId: context.uid,
      });
      updated += 1;
    }
    await batch.commit();
  }

  return { updated };
}

export async function listDiscoverFeedItems(
  context: AdminContext,
  options: { cursor?: string; limit?: unknown } = {},
) {
  requireFullAdmin(context);

  const page = await listCollectionPage(
    FEED_ITEMS_COLLECTION,
    options.cursor,
    options.limit,
    toFeedItemRecord,
  );

  return {
    feedItems: page.records,
    nextCursor: page.nextCursor,
  };
}

export async function getDiscoverFeedItem(
  context: AdminContext,
  feedItemId: string,
) {
  requireFullAdmin(context);
  const snapshot = await getFeedItemSnapshot(feedItemId);
  if (!snapshot) {
    throw new AdminRepositoryError("Feed entry not found.", 404);
  }

  return toFeedItemRecord(snapshot);
}

export async function createDiscoverFeedItem(
  context: AdminContext,
  input: FeedItemInput,
) {
  requireFullAdmin(context);
  const ref = adminDb.collection(FEED_ITEMS_COLLECTION).doc();
  await ref.set(
    withoutUndefined({
      ...(await feedItemDocument(input, context)),
      createdAt: FieldValue.serverTimestamp(),
      createdByUserId: context.uid,
    }),
  );

  return getDiscoverFeedItem(context, ref.id);
}

export async function updateDiscoverFeedItem(
  context: AdminContext,
  feedItemId: string,
  input: FeedItemInput,
) {
  requireFullAdmin(context);
  const existing = await getFeedItemSnapshot(feedItemId);
  if (!existing) {
    throw new AdminRepositoryError("Feed entry not found.", 404);
  }

  const document = await feedItemDocument(input, context, existing.data());
  const current = existing.data();
  const createdAt = current.createdAt ?? FieldValue.serverTimestamp();
  const createdByUserId = current.createdByUserId ?? context.uid;

  await existing.ref.set(
    withoutUndefined({
      createdAt,
      createdByUserId,
      ...document,
    }),
    { merge: false },
  );

  return getDiscoverFeedItem(context, feedItemId);
}

export async function duplicateDiscoverFeedItem(
  context: AdminContext,
  feedItemId: string,
) {
  requireFullAdmin(context);
  const source = await getDiscoverFeedItem(context, feedItemId);
  const sourcePayload = source[source.type] as Record<string, unknown> | undefined;
  const duplicateInput: FeedItemInput = {
    publisherOrganizationId: source.publisherOrganizationId,
    type: source.type,
    status: "draft",
    sourceUrl: source.sourceUrl,
    editorialNotes: source.editorialNotes,
    tags: source.tags,
    locale: source.locale,
    priority: source.priority,
    expiresAt: source.expiresAt,
    [source.type]: {
      ...sourcePayload,
      title: `${getFeedTitle(source)} copy`,
    },
  };

  return createDiscoverFeedItem(context, duplicateInput);
}
