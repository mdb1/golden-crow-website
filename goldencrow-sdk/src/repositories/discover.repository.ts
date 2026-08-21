import {
  FieldPath,
  FieldValue,
  Timestamp,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { AdminRepositoryError } from "./admin-errors.js";
import {
  discoverIndividualCategoryProvider,
  discoverOrganizationCategoryProvider,
} from "../lib/discover-publisher-categories.js";
import type {
  AdminContext,
  DiscoverFeedItemRecord,
  DiscoverFeedStatus,
  DiscoverFeedType,
  DiscoverIndividualRecord,
  DiscoverIndividualStatus,
  DiscoverListPage,
  DiscoverOrganizationRecord,
  DiscoverOrganizationStatus,
} from "../types/sdk.types.js";

const adminDb = adminDbFor("mydnamap");

const ORGANIZATIONS_COLLECTION = "feed_organizations";
const INDIVIDUALS_COLLECTION = "feed_individuals";
const FEED_ITEMS_COLLECTION = "feed_items";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const ORGANIZATION_STATUSES = new Set<DiscoverOrganizationStatus>([
  "active",
  "inactive",
  "archived",
]);
const FEED_TYPES = new Set<DiscoverFeedType>([
  "news",
  "research_update",
  "upcoming_event",
  "opportunity",
]);
const FEED_STATUSES = new Set<DiscoverFeedStatus>([
  "draft",
  "published",
  "archived",
]);
const VALIDATED_STATUSES = new Set<DiscoverFeedStatus>([
  "published",
]);
const SNAPSHOT_SYNC_STATUSES = new Set<DiscoverFeedStatus>([
  "draft",
  "published",
]);

type PageCursor = {
  updatedAtMillis: number;
  id: string;
};

type DocumentPageCursor = {
  mode: "document";
  id: string;
};

type OrganizationInput = {
  name?: unknown;
  imageUrl?: unknown;
  status?: unknown;
  websiteUrl?: unknown;
  description?: unknown;
  description_en?: unknown;
  countryCode?: unknown;
  organizationType?: unknown;
  color_hex?: unknown;
  colorHex?: unknown;
  verified?: unknown;
  contactEmail?: unknown;
  internalNotes?: unknown;
};

type IndividualInput = {
  name?: unknown;
  imageUrl?: unknown;
  status?: unknown;
  websiteUrl?: unknown;
  description?: unknown;
  description_en?: unknown;
  countryCode?: unknown;
  individualType?: unknown;
  color_hex?: unknown;
  colorHex?: unknown;
  verified?: unknown;
  contactEmail?: unknown;
  internalNotes?: unknown;
};

type FeedItemInput = {
  publisherOrganizationId?: unknown;
  publisherIndividualId?: unknown;
  type?: unknown;
  status?: unknown;
  publishedAt?: unknown;
  language?: unknown;
  title?: unknown;
  subtitle?: unknown;
  body?: unknown;
  html_body?: unknown;
  image_url?: unknown;
  source_url?: unknown;
  sourceUrl?: unknown;
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

function requireDiscoverAccess(context: AdminContext) {
  if (
    context.role !== "full_admin" &&
    context.role !== "organization_publisher" &&
    context.role !== "individual_publisher"
  ) {
    throw new AdminRepositoryError("Discover access required.", 403);
  }

  if (context.role === "organization_publisher" && !context.organizationId) {
    throw new AdminRepositoryError(
      "Organization publisher roles require an organization scope.",
      403,
    );
  }

  if (context.role === "individual_publisher" && !context.individualId) {
    throw new AdminRepositoryError(
      "Individual publisher roles require an individual scope.",
      403,
    );
  }
}

function scopedOrganizationId(context: AdminContext) {
  return context.role === "organization_publisher"
    ? context.organizationId
    : undefined;
}

function scopedIndividualId(context: AdminContext) {
  return context.role === "individual_publisher"
    ? context.individualId
    : undefined;
}

function requireOrganizationSurfaceAccess(context: AdminContext) {
  requireDiscoverAccess(context);
  if (context.role === "individual_publisher") {
    throw new AdminRepositoryError(
      "This publisher can access only its own individual publisher record.",
      403,
    );
  }
}

function requireIndividualSurfaceAccess(context: AdminContext) {
  requireDiscoverAccess(context);
  if (context.role === "organization_publisher") {
    throw new AdminRepositoryError(
      "This publisher can access only its own organization publisher record.",
      403,
    );
  }
}

function assertOrganizationScope(context: AdminContext, organizationId: string) {
  const ownOrganizationId = scopedOrganizationId(context);
  if (ownOrganizationId && ownOrganizationId !== organizationId) {
    throw new AdminRepositoryError(
      "This publisher can access only its own organization.",
      403,
    );
  }
}

function assertIndividualScope(context: AdminContext, individualId: string) {
  const ownIndividualId = scopedIndividualId(context);
  if (ownIndividualId && ownIndividualId !== individualId) {
    throw new AdminRepositoryError(
      "This publisher can access only its own individual publisher record.",
      403,
    );
  }
}

function assertFeedItemScope(
  context: AdminContext,
  data:
    | Pick<DiscoverFeedItemRecord, "publisherOrganizationId" | "publisherIndividualId">
    | Record<string, unknown>,
) {
  const ownOrganizationId = scopedOrganizationId(context);
  const ownIndividualId = scopedIndividualId(context);
  const publisherOrganizationId =
    "publisherOrganizationId" in data
      ? normalizeOptionalString(data.publisherOrganizationId)
      : undefined;
  const publisherIndividualId =
    "publisherIndividualId" in data
      ? normalizeOptionalString(data.publisherIndividualId)
      : undefined;

  if (ownOrganizationId && publisherOrganizationId !== ownOrganizationId) {
    throw new AdminRepositoryError(
      "This publisher can access only feed entries for its own organization.",
      403,
    );
  }

  if (ownIndividualId && publisherIndividualId !== ownIndividualId) {
    throw new AdminRepositoryError(
      "This publisher can access only feed entries for its own individual publisher record.",
      403,
    );
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

function slugifyPublisherName(name: string, fallback: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || fallback
  );
}

function slugifyOrganizationName(name: string) {
  return slugifyPublisherName(name, "organization");
}

function slugifyIndividualName(name: string) {
  return slugifyPublisherName(name, "individual");
}

function normalizeHexColor(value: unknown, label: string): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  const withHash = normalized.startsWith("#") ? normalized : `#${normalized}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    throw new AdminRepositoryError(`${label} must be a valid 6-digit hex color.`, 400);
  }

  return withHash.toUpperCase();
}

function readHexColor(value: unknown): string | undefined {
  try {
    return normalizeHexColor(value, "Color");
  } catch {
    return undefined;
  }
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

function normalizeNullablePositiveInteger(value: unknown, label: string): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = normalizeNumber(value, Number.NaN);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AdminRepositoryError(`${label} must be a positive integer.`, 400);
  }

  return parsed;
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

function normalizeLanguage(value: unknown): "en" | "es" {
  if (value == null || value === "") {
    return "en";
  }

  if (value === "en" || value === "es") {
    return value;
  }

  throw new AdminRepositoryError("Language must be en or es.", 400);
}

function sanitizeHtmlBody(value: unknown): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(iframe|object|embed|form|input|button|textarea|select|option|link|meta|base)[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, " $1=\"#\"")
    .trim();
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

function encodeDocumentCursor(cursor: DocumentPageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeDocumentCursor(cursor: string | undefined): DocumentPageCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      mode?: unknown;
      id?: unknown;
    };
    if (
      (parsed.mode === "document" || parsed.mode == null) &&
      typeof parsed.id === "string" &&
      parsed.id
    ) {
      return { mode: "document", id: parsed.id };
    }
  } catch {
    return null;
  }

  return null;
}

function isMissingFirestoreIndexError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message =
    "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  return (
    code === 9 ||
    code === "failed-precondition" ||
    /requires an index|indexes\?create_composite/i.test(message)
  );
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
  const organizationType = discoverOrganizationCategoryProvider.normalizeCsv(
    normalizeOptionalString(data.organizationType),
  );

  return {
    id: doc.id,
    name: normalizeOptionalString(data.name) ?? doc.id,
    imageUrl: normalizeNullableString(data.imageUrl),
    status,
    slug: normalizeOptionalString(data.slug),
    websiteUrl: normalizeOptionalString(data.websiteUrl),
    description: normalizeOptionalString(data.description),
    description_en: normalizeOptionalString(data.description_en),
    countryCode: normalizeOptionalString(data.countryCode),
    organizationType: organizationType || undefined,
    color_hex: readHexColor(data.color_hex ?? data.colorHex),
    verified: data.verified === true,
    contactEmail: normalizeOptionalString(data.contactEmail),
    internalNotes: normalizeOptionalString(data.internalNotes),
    createdAt: timestampToIso(data.createdAt) ?? "",
    updatedAt: timestampToIso(data.updatedAt) ?? "",
    createdByUserId: normalizeOptionalString(data.createdByUserId),
    updatedByUserId: normalizeOptionalString(data.updatedByUserId),
  };
}

function toIndividualRecord(doc: QueryDocumentSnapshot): DiscoverIndividualRecord {
  const data = doc.data() as Record<string, unknown>;
  const status = ORGANIZATION_STATUSES.has(data.status as DiscoverIndividualStatus)
    ? (data.status as DiscoverIndividualStatus)
    : "inactive";
  const individualType = discoverIndividualCategoryProvider.normalizeCsv(
    normalizeOptionalString(data.individualType),
  );

  return {
    id: doc.id,
    name: normalizeOptionalString(data.name) ?? doc.id,
    imageUrl: normalizeNullableString(data.imageUrl),
    status,
    slug: normalizeOptionalString(data.slug),
    websiteUrl: normalizeOptionalString(data.websiteUrl),
    description: normalizeOptionalString(data.description),
    description_en: normalizeOptionalString(data.description_en),
    countryCode: normalizeOptionalString(data.countryCode),
    individualType: individualType || undefined,
    color_hex: readHexColor(data.color_hex ?? data.colorHex),
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
  return normalizeOptionalString(item.title) ?? "Untitled";
}

function payloadForSerializedItem(
  data: Record<string, unknown>,
  type: DiscoverFeedType,
): Record<string, unknown> {
  const payload = data[type];
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
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
  const activePayload = payloadForSerializedItem(data, type);
  const legacySourceUrl = data.sourceUrl ?? data.source_url;
  const languageValue = data.language ?? data.locale;
  const language = languageValue === "es" ? "es" : "en";
  const record: DiscoverFeedItemRecord = {
    id: doc.id,
    publisherOrganizationId: normalizeNullableString(data.publisherOrganizationId),
    publisherIndividualId: normalizeNullableString(data.publisherIndividualId),
    publisherSnapshot: {
      name: normalizeOptionalString(publisherSnapshot.name) ?? "Unknown publisher",
      imageUrl: normalizeNullableString(publisherSnapshot.imageUrl),
    },
    type,
    publishedAt: timestampToIso(data.publishedAt),
    language,
    title: normalizeOptionalString(data.title) ?? normalizeOptionalString(activePayload.title) ?? "",
    subtitle:
      normalizeOptionalString(data.subtitle) ??
      normalizeOptionalString(activePayload.summary) ??
      "",
    body:
      normalizeOptionalString(data.body) ??
      normalizeOptionalString(activePayload.detailBody) ??
      "",
    html_body: normalizeNullableString(data.html_body),
    image_url:
      normalizeNullableString(data.image_url) ??
      normalizeNullableString(activePayload.imageUrl),
    source_url: normalizeNullableString(legacySourceUrl),
    status,
    createdAt: timestampToIso(data.createdAt) ?? "",
    updatedAt: timestampToIso(data.updatedAt) ?? "",
    createdByUserId: normalizeOptionalString(data.createdByUserId),
    updatedByUserId: normalizeOptionalString(data.updatedByUserId),
    archivedAt: timestampToIso(data.archivedAt),
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
  configureQuery?: (query: Query) => Query,
): Promise<DiscoverListPage<T>> {
  const pageSize = resolvePageSize(limit);
  const decodedCursor = decodeCursor(cursor);
  let query: Query = adminDb.collection(collectionName);
  if (configureQuery) {
    query = configureQuery(query);
  }
  query = query
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

async function listScopedCollectionPageByDocumentCursor<T>(
  collectionName: string,
  scopeField: string,
  scopeValue: string,
  cursor: string | undefined,
  limit: unknown,
  mapper: (doc: QueryDocumentSnapshot) => T,
): Promise<DiscoverListPage<T>> {
  const pageSize = resolvePageSize(limit);
  const decodedCursor = decodeDocumentCursor(cursor);
  let query: Query = adminDb
    .collection(collectionName)
    .where(scopeField, "==", scopeValue)
    .limit(pageSize + 1);

  if (decodedCursor) {
    const cursorSnapshot = await adminDb
      .collection(collectionName)
      .doc(decodedCursor.id)
      .get();

    if (cursorSnapshot.exists) {
      query = query.startAfter(cursorSnapshot);
    }
  }

  const snapshot = await query.get();
  const pageDocs = snapshot.docs.slice(0, pageSize);
  const nextDoc = snapshot.docs[pageSize];
  const nextCursorSource = nextDoc ? pageDocs[pageDocs.length - 1] : undefined;

  return {
    records: pageDocs.map(mapper),
    nextCursor: nextCursorSource
      ? encodeDocumentCursor({ mode: "document", id: nextCursorSource.id })
      : null,
  };
}

function normalizeOrganizationStatus(value: unknown) {
  return ORGANIZATION_STATUSES.has(value as DiscoverOrganizationStatus)
    ? (value as DiscoverOrganizationStatus)
    : "active";
}

function normalizeOrganizationType(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  const invalidKeys = discoverOrganizationCategoryProvider.invalidKeys(normalized);
  if (invalidKeys.length) {
    throw new AdminRepositoryError(
      `Organization categories contain invalid keys: ${invalidKeys.join(", ")}`,
      400,
    );
  }

  return discoverOrganizationCategoryProvider.normalizeCsv(normalized) || undefined;
}

function normalizeIndividualType(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  const invalidKeys = discoverIndividualCategoryProvider.invalidKeys(normalized);
  if (invalidKeys.length) {
    throw new AdminRepositoryError(
      `Individual publisher categories contain invalid keys: ${invalidKeys.join(", ")}`,
      400,
    );
  }

  return discoverIndividualCategoryProvider.normalizeCsv(normalized) || undefined;
}

function organizationDocument(input: OrganizationInput, context: AdminContext) {
  const name = normalizeRequiredString(input.name, "Organization name");

  return {
    name,
    imageUrl: normalizeHttpsUrl(input.imageUrl, "Organization image URL"),
    status: normalizeOrganizationStatus(input.status),
    slug: slugifyOrganizationName(name),
    websiteUrl: normalizeHttpsUrl(input.websiteUrl, "Website URL"),
    description: normalizeOptionalString(input.description),
    description_en: normalizeOptionalString(input.description_en),
    countryCode: normalizeCountryCode(input.countryCode),
    organizationType: normalizeOrganizationType(input.organizationType),
    color_hex: normalizeHexColor(input.color_hex ?? input.colorHex, "Organization color") ?? null,
    verified: normalizeBoolean(input.verified),
    contactEmail: normalizeOptionalEmail(input.contactEmail, "Contact email"),
    internalNotes: normalizeOptionalString(input.internalNotes),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  };
}

function individualDocument(input: IndividualInput, context: AdminContext) {
  const name = normalizeRequiredString(input.name, "Individual publisher name");

  return {
    name,
    imageUrl: normalizeHttpsUrl(input.imageUrl, "Individual publisher image URL"),
    status: normalizeOrganizationStatus(input.status),
    slug: slugifyIndividualName(name),
    websiteUrl: normalizeHttpsUrl(input.websiteUrl, "Website URL"),
    description: normalizeOptionalString(input.description),
    description_en: normalizeOptionalString(input.description_en),
    countryCode: normalizeCountryCode(input.countryCode),
    individualType: normalizeIndividualType(input.individualType),
    color_hex: normalizeHexColor(input.color_hex ?? input.colorHex, "Individual publisher color") ?? null,
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

async function getIndividualSnapshot(individualId: string) {
  const snapshot = await adminDb
    .collection(INDIVIDUALS_COLLECTION)
    .doc(individualId)
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

function payloadInputForType(type: DiscoverFeedType, input: FeedItemInput) {
  const payloadInput = input[getPayloadKey(type)];
  return payloadInput && typeof payloadInput === "object" && !Array.isArray(payloadInput)
    ? (payloadInput as Record<string, unknown>)
    : {};
}

function normalizeRootContent(input: FeedItemInput, status: DiscoverFeedStatus) {
  const title = normalizeOptionalString(input.title);
  const subtitle = normalizeOptionalString(input.subtitle);
  const body = normalizeOptionalString(input.body);
  const htmlBody = sanitizeHtmlBody(input.html_body);

  if (VALIDATED_STATUSES.has(status)) {
    if (!title) {
      throw new AdminRepositoryError("Feed entry title is required before publishing.", 400);
    }
    if (!subtitle) {
      throw new AdminRepositoryError("Feed entry subtitle is required before publishing.", 400);
    }
    if (!body && !htmlBody) {
      throw new AdminRepositoryError("Feed entry body is required before publishing.", 400);
    }
  }

  return {
    title: title ?? "",
    subtitle: subtitle ?? "",
    body: body ?? "",
    html_body: htmlBody,
    image_url: normalizeHttpsUrl(input.image_url, "Image URL"),
    source_url: normalizeHttpsUrl(input.source_url ?? input.sourceUrl, "Source URL"),
    language: normalizeLanguage(input.language),
  };
}

function compatibilityAliases(root: ReturnType<typeof normalizeRootContent>) {
  return {
    title: root.title,
    summary: root.subtitle,
    detailBody: root.body,
    imageUrl: root.image_url,
  };
}

function normalizeTypePayload(
  type: DiscoverFeedType,
  input: FeedItemInput,
  status: DiscoverFeedStatus,
  root: ReturnType<typeof normalizeRootContent>,
) {
  const payload = payloadInputForType(type, input);
  const aliases = compatibilityAliases(root);

  if (type === "news") {
    return {
      ...aliases,
      category: normalizeOptionalString(payload.category),
      region: normalizeOptionalString(payload.region),
    };
  }

  if (type === "research_update") {
    return {
      ...aliases,
      research_topic:
        normalizeOptionalString(payload.research_topic) ??
        normalizeOptionalString(payload.topic),
      genes: normalizeStringArray(payload.genes),
      conditions: normalizeStringArray(payload.conditions),
      journal:
        normalizeOptionalString(payload.journal) ??
        normalizeOptionalString(payload.journalName),
      journalName:
        normalizeOptionalString(payload.journal) ??
        normalizeOptionalString(payload.journalName),
    };
  }

  if (type === "upcoming_event") {
    const date = normalizeTimestamp(payload.date ?? payload.startsAt, "Event date");
    const location =
      normalizeOptionalString(payload.location) ??
      normalizeOptionalString(payload.locationName);

    if (status === "published" && !date) {
      throw new AdminRepositoryError("Event date is required before publishing.", 400);
    }
    if (status === "published" && !location) {
      throw new AdminRepositoryError("Event location is required before publishing.", 400);
    }

    return {
      ...aliases,
      date,
      startsAt: date,
      location: location ?? "",
      max_attendance: normalizeNullablePositiveInteger(
        payload.max_attendance,
        "Max attendance",
      ),
      virtual_meeting_link: normalizeHttpsUrl(
        payload.virtual_meeting_link ??
          payload.virtualMeetingLink ??
          payload.meeting_url ??
          payload.meetingUrl,
        "Virtual meeting link",
      ),
    };
  }

  const opportunityType =
    normalizeOptionalString(payload.opportunity_type) ??
    normalizeOptionalString(payload.opportunityType);
  const requirements = normalizeOptionalString(payload.requirements);
  const eligibility = normalizeOptionalString(payload.eligibility);
  const location =
    normalizeOptionalString(payload.location) ??
    normalizeOptionalString(payload.locationName);

  if (status === "published") {
    if (!opportunityType) {
      throw new AdminRepositoryError("Opportunity type is required before publishing.", 400);
    }
    if (!requirements) {
      throw new AdminRepositoryError("Opportunity requirements are required before publishing.", 400);
    }
    if (!eligibility) {
      throw new AdminRepositoryError("Opportunity eligibility is required before publishing.", 400);
    }
    if (!location) {
      throw new AdminRepositoryError("Opportunity location is required before publishing.", 400);
    }
  }

  return {
    ...aliases,
    opportunity_type: opportunityType ?? "",
    opportunityType: opportunityType ?? "",
    requirements: requirements ?? "",
    eligibility: eligibility ?? "",
    location: location ?? "",
  };
}

async function feedItemDocument(
  feedItemId: string,
  input: FeedItemInput,
  context: AdminContext,
  existing?: Record<string, unknown>,
) {
  const publisherOrganizationId = normalizeOptionalString(input.publisherOrganizationId);
  const publisherIndividualId = normalizeOptionalString(input.publisherIndividualId);

  if (publisherOrganizationId && publisherIndividualId) {
    throw new AdminRepositoryError(
      "Choose either an organization publisher or an individual publisher, not both.",
      400,
    );
  }

  if (!publisherOrganizationId && !publisherIndividualId) {
    throw new AdminRepositoryError("Choose a publisher.", 400);
  }

  if (publisherOrganizationId) {
    assertOrganizationScope(context, publisherOrganizationId);
  }
  if (publisherIndividualId) {
    assertIndividualScope(context, publisherIndividualId);
  }

  const publisherSnapshot = publisherOrganizationId
    ? await getOrganizationSnapshot(publisherOrganizationId)
    : await getIndividualSnapshot(publisherIndividualId!);
  if (!publisherSnapshot) {
    throw new AdminRepositoryError("Publisher not found.", 404);
  }
  const publisher = publisherOrganizationId
    ? toOrganizationRecord(publisherSnapshot)
    : toIndividualRecord(publisherSnapshot);
  const type = normalizeFeedType(input.type);
  const status = normalizeFeedStatus(input.status);

  if (status === "published" && publisher.status !== "active") {
    throw new AdminRepositoryError(
      "Only active publishers can publish feed entries.",
      400,
    );
  }

  const inputPublishedAt = normalizeTimestamp(input.publishedAt, "Published time");
  const existingPublishedAt = normalizeTimestamp(existing?.publishedAt, "Published time");
  const publishedAt =
    status === "published"
      ? inputPublishedAt ?? existingPublishedAt ?? FieldValue.serverTimestamp()
      : inputPublishedAt;
  const archivedAt =
    status === "archived"
      ? normalizeTimestamp(existing?.archivedAt, "Archived time") ?? FieldValue.serverTimestamp()
      : null;
  const root = normalizeRootContent(input, status);
  const payload = normalizeTypePayload(type, input, status, root);

  return {
    id: feedItemId,
    publisherOrganizationId: publisherOrganizationId ?? null,
    publisherIndividualId: publisherIndividualId ?? null,
    publisherSnapshot: {
      name: publisher.name,
      imageUrl: publisher.imageUrl,
    },
    type,
    status,
    publishedAt,
    language: root.language,
    title: root.title,
    subtitle: root.subtitle,
    body: root.body,
    html_body: root.html_body,
    image_url: root.image_url,
    source_url: root.source_url,
    sourceUrl: root.source_url,
    archivedAt,
    [getPayloadKey(type)]: payload,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  };
}

export async function listDiscoverOrganizations(
  context: AdminContext,
  options: { cursor?: string; limit?: unknown } = {},
) {
  requireOrganizationSurfaceAccess(context);

  const ownOrganizationId = scopedOrganizationId(context);
  if (ownOrganizationId) {
    const organization = await getDiscoverOrganization(context, ownOrganizationId);
    return {
      organizations: [organization],
      nextCursor: null,
    };
  }

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
  requireOrganizationSurfaceAccess(context);
  assertOrganizationScope(context, organizationId);
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
  requireOrganizationSurfaceAccess(context);
  assertOrganizationScope(context, organizationId);
  const existing = await getOrganizationSnapshot(organizationId);
  if (!existing) {
    throw new AdminRepositoryError("Organization not found.", 404);
  }
  const existingRecord = toOrganizationRecord(existing);
  const scopedInput =
    context.role === "organization_publisher"
      ? {
          ...input,
          status: existingRecord.status,
          verified: existingRecord.verified,
          internalNotes: existingRecord.internalNotes,
        }
      : input;

  await existing.ref.set(
    withoutUndefined({
      ...existing.data(),
      ...organizationDocument(scopedInput, context),
    }),
    { merge: false },
  );

  return getDiscoverOrganization(context, organizationId);
}

export async function syncDiscoverPublisherSnapshot(
  context: AdminContext,
  organizationId: string,
) {
  requireOrganizationSurfaceAccess(context);
  assertOrganizationScope(context, organizationId);
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

export async function listDiscoverIndividuals(
  context: AdminContext,
  options: { cursor?: string; limit?: unknown } = {},
) {
  requireIndividualSurfaceAccess(context);

  const ownIndividualId = scopedIndividualId(context);
  if (ownIndividualId) {
    const individual = await getDiscoverIndividual(context, ownIndividualId);
    return {
      individuals: [individual],
      nextCursor: null,
    };
  }

  const page = await listCollectionPage(
    INDIVIDUALS_COLLECTION,
    options.cursor,
    options.limit,
    toIndividualRecord,
  );

  return {
    individuals: page.records,
    nextCursor: page.nextCursor,
  };
}

export async function getDiscoverIndividual(
  context: AdminContext,
  individualId: string,
) {
  requireIndividualSurfaceAccess(context);
  assertIndividualScope(context, individualId);
  const snapshot = await getIndividualSnapshot(individualId);
  if (!snapshot) {
    throw new AdminRepositoryError("Individual publisher not found.", 404);
  }

  return toIndividualRecord(snapshot);
}

export async function createDiscoverIndividual(
  context: AdminContext,
  input: IndividualInput,
) {
  requireFullAdmin(context);
  const ref = adminDb.collection(INDIVIDUALS_COLLECTION).doc();
  await ref.set(
    withoutUndefined({
      ...individualDocument(input, context),
      createdAt: FieldValue.serverTimestamp(),
      createdByUserId: context.uid,
    }),
  );

  return getDiscoverIndividual(context, ref.id);
}

export async function updateDiscoverIndividual(
  context: AdminContext,
  individualId: string,
  input: IndividualInput,
) {
  requireIndividualSurfaceAccess(context);
  assertIndividualScope(context, individualId);
  const existing = await getIndividualSnapshot(individualId);
  if (!existing) {
    throw new AdminRepositoryError("Individual publisher not found.", 404);
  }
  const existingRecord = toIndividualRecord(existing);
  const scopedInput =
    context.role === "individual_publisher"
      ? {
          ...input,
          status: existingRecord.status,
          verified: existingRecord.verified,
          internalNotes: existingRecord.internalNotes,
        }
      : input;

  await existing.ref.set(
    withoutUndefined({
      ...existing.data(),
      ...individualDocument(scopedInput, context),
    }),
    { merge: false },
  );

  return getDiscoverIndividual(context, individualId);
}

export async function listDiscoverFeedItems(
  context: AdminContext,
  options: { cursor?: string; limit?: unknown } = {},
) {
  requireDiscoverAccess(context);
  const ownOrganizationId = scopedOrganizationId(context);
  const ownIndividualId = scopedIndividualId(context);
  const scopeField = ownOrganizationId
    ? "publisherOrganizationId"
    : ownIndividualId
      ? "publisherIndividualId"
      : undefined;
  const scopeValue = ownOrganizationId ?? ownIndividualId;

  let page: DiscoverListPage<DiscoverFeedItemRecord>;
  try {
    page = await listCollectionPage(
      FEED_ITEMS_COLLECTION,
      options.cursor,
      options.limit,
      toFeedItemRecord,
      scopeField && scopeValue
        ? (query) => query.where(scopeField, "==", scopeValue)
        : undefined,
    );
  } catch (error) {
    if (!scopeField || !scopeValue || !isMissingFirestoreIndexError(error)) {
      throw error;
    }

    page = await listScopedCollectionPageByDocumentCursor(
      FEED_ITEMS_COLLECTION,
      scopeField,
      scopeValue,
      options.cursor,
      options.limit,
      toFeedItemRecord,
    );
  }

  return {
    feedItems: page.records,
    nextCursor: page.nextCursor,
  };
}

export async function getDiscoverFeedItem(
  context: AdminContext,
  feedItemId: string,
) {
  requireDiscoverAccess(context);
  const snapshot = await getFeedItemSnapshot(feedItemId);
  if (!snapshot) {
    throw new AdminRepositoryError("Feed entry not found.", 404);
  }
  assertFeedItemScope(context, snapshot.data());

  return toFeedItemRecord(snapshot);
}

export async function createDiscoverFeedItem(
  context: AdminContext,
  input: FeedItemInput,
) {
  requireDiscoverAccess(context);
  const ref = adminDb.collection(FEED_ITEMS_COLLECTION).doc();
  await ref.set(
    withoutUndefined({
      ...(await feedItemDocument(ref.id, input, context)),
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
  requireDiscoverAccess(context);
  const existing = await getFeedItemSnapshot(feedItemId);
  if (!existing) {
    throw new AdminRepositoryError("Feed entry not found.", 404);
  }
  assertFeedItemScope(context, existing.data());

  const document = await feedItemDocument(feedItemId, input, context, existing.data());
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

export async function deleteDiscoverFeedItem(
  context: AdminContext,
  feedItemId: string,
) {
  requireDiscoverAccess(context);
  const existing = await getFeedItemSnapshot(feedItemId);
  if (!existing) {
    throw new AdminRepositoryError("Feed entry not found.", 404);
  }
  assertFeedItemScope(context, existing.data());

  await existing.ref.delete();

  return { deleted: true, feedItemId };
}

export async function duplicateDiscoverFeedItem(
  context: AdminContext,
  feedItemId: string,
) {
  requireDiscoverAccess(context);
  const source = await getDiscoverFeedItem(context, feedItemId);
  const sourcePayload = source[source.type] as Record<string, unknown> | undefined;
  const duplicateInput: FeedItemInput = {
    publisherOrganizationId: source.publisherOrganizationId ?? undefined,
    publisherIndividualId: source.publisherIndividualId ?? undefined,
    type: source.type,
    status: "draft",
    publishedAt: source.publishedAt,
    language: source.language,
    title: `${getFeedTitle(source)} copy`,
    subtitle: source.subtitle,
    body: source.body,
    html_body: source.html_body,
    image_url: source.image_url,
    source_url: source.source_url,
    [source.type]: {
      ...sourcePayload,
    },
  };

  return createDiscoverFeedItem(context, duplicateInput);
}
