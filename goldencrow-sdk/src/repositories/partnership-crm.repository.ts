import {
  FieldValue,
  Timestamp,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import {
  PARTNERSHIP_CRM_FROM_EMAIL,
  sendPartnershipCrmEmail,
} from "../lib/partnership-crm-email.js";
import {
  DISCOVER_ORGANIZATION_CATEGORY_OPTIONS,
  type DiscoverOrganizationCategoryKey,
} from "../lib/discover-publisher-categories.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";

const adminDb = adminDbFor("mydnamap");
const ORGANIZATIONS_COLLECTION = "partnership_crm_organizations";
const TEMPLATES_COLLECTION = "plantillas";
const ACTIVITIES_COLLECTION = "activities";
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = MAX_PAGE_SIZE;
const FILTERED_BATCH_LIMIT = MAX_PAGE_SIZE;
const MAX_FILTERED_SCAN = MAX_PAGE_SIZE * 3;

export const PARTNERSHIP_CRM_STATUSES = [
  "new",
  "contacted",
  "replied",
  "meeting",
  "partner",
  "no_response",
  "not_interested",
  "not_a_fit",
] as const;

export const PARTNERSHIP_CRM_ACTIVITY_TYPES = [
  "created",
  "updated",
  "status",
  "note",
  "email",
  "import",
] as const;

export const PARTNERSHIP_CRM_TEMPLATE_STATUSES = [
  "active",
  "inactive",
  "archived",
] as const;
const PARTNERSHIP_CRM_CATEGORY_OPTIONS =
  DISCOVER_ORGANIZATION_CATEGORY_OPTIONS;

export type PartnershipCrmStatus = (typeof PARTNERSHIP_CRM_STATUSES)[number];
export type PartnershipCrmActivityType =
  (typeof PARTNERSHIP_CRM_ACTIVITY_TYPES)[number];
export type PartnershipCrmTemplateStatus =
  (typeof PARTNERSHIP_CRM_TEMPLATE_STATUSES)[number];

export type PartnershipCrmEmailState = "has_email" | "missing_email";

export interface PartnershipCrmOrganizationInput {
  name?: string;
  category?: string;
  website?: string;
  country?: string;
  status?: PartnershipCrmStatus;
  contactName?: string;
  contactEmail?: string;
  contactLinkedIn?: string;
  lastContactAt?: string | null;
  notes?: string;
}

export interface PartnershipCrmImportRowInput extends PartnershipCrmOrganizationInput {
  rowId?: string;
  duplicateAction?: "skip" | "update" | "import";
  duplicateOrganizationId?: string;
}

export interface PartnershipCrmOrganizationRecord {
  id: string;
  schemaVersion: number;
  name: string;
  category: string;
  website: string;
  websiteDomain: string;
  country: string;
  status: PartnershipCrmStatus;
  contactName: string;
  contactEmail: string;
  contactLinkedIn: string;
  lastContactAt: string | null;
  notes: string;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
}

export interface PartnershipCrmActivityRecord {
  id: string;
  type: PartnershipCrmActivityType;
  title: string;
  body: string;
  occurredAt?: string;
  createdAt?: string;
  createdByEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface PartnershipCrmTemplateInput {
  name?: string;
  category?: string;
  subject?: string;
  body?: string;
  status?: PartnershipCrmTemplateStatus;
  notes?: string;
}

export interface PartnershipCrmTemplateRecord {
  id: string;
  schemaVersion: number;
  name: string;
  category: string;
  subject: string;
  body: string;
  status: PartnershipCrmTemplateStatus;
  notes: string;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
}

export interface PartnershipCrmOrganizationsPage {
  organizations: PartnershipCrmOrganizationRecord[];
  nextCursor?: string;
}

export interface PartnershipCrmActivitiesPage {
  activities: PartnershipCrmActivityRecord[];
  nextCursor?: string;
}

export interface PartnershipCrmTemplatesPage {
  templates: PartnershipCrmTemplateRecord[];
  nextCursor?: string;
}

export interface PartnershipCrmDuplicateCandidate {
  id: string;
  name: string;
  website: string;
  websiteDomain: string;
  contactEmail: string;
  status: PartnershipCrmStatus;
}

export interface PartnershipCrmImportPreviewRow {
  rowId: string;
  organization: PartnershipCrmOrganizationInput;
  valid: boolean;
  errors: string[];
  missingEmail: boolean;
  duplicateCandidates: PartnershipCrmDuplicateCandidate[];
}

export interface PartnershipCrmImportPreview {
  rows: PartnershipCrmImportPreviewRow[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    missingEmail: number;
    duplicates: number;
  };
}

const STATUS_SET = new Set<string>(PARTNERSHIP_CRM_STATUSES);
const TEMPLATE_STATUS_SET = new Set<string>(PARTNERSHIP_CRM_TEMPLATE_STATUSES);

function requireGodMode(context: AdminContext) {
  if (!context.isBootstrap) {
    throw new AdminRepositoryError("GOD MODE access required", 403);
  }
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeWebsite(value: unknown) {
  const raw = cleanString(value);
  if (!raw) {
    return "";
  }

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return raw;
  }
}

function websiteDomain(value: unknown) {
  const website = normalizeWebsite(value);
  if (!website) {
    return "";
  }

  try {
    return new URL(website).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return (
      website
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        ?.trim() ?? ""
    );
  }
}

function normalizeStatus(value: unknown): PartnershipCrmStatus {
  const normalized = cleanString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return STATUS_SET.has(normalized)
    ? (normalized as PartnershipCrmStatus)
    : "new";
}

function normalizeTemplateStatus(value: unknown): PartnershipCrmTemplateStatus {
  const normalized = cleanString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return TEMPLATE_STATUS_SET.has(normalized)
    ? (normalized as PartnershipCrmTemplateStatus)
    : "active";
}

function normalizeEmail(value: unknown) {
  return cleanString(value).toLowerCase();
}

const CATEGORY_ALIASES: Record<string, DiscoverOrganizationCategoryKey | ""> = {
  laboratory: "org_genetic_testing_laboratories",
  lab: "org_genetic_testing_laboratories",
  genomics: "org_genomics_laboratories",
  laboratorio_genomica: "org_genomics_laboratories",
  laboratory_genomics: "org_genomics_laboratories",
  fertility: "org_fertility_clinics",
  fertility_clinic: "org_fertility_clinics",
  clinica_de_fertilidad: "org_fertility_clinics",
  foundation: "org_rare_disease_foundations",
  fundacion: "org_rare_disease_foundations",
  education: "org_genetics_education_providers",
  educacion: "org_genetics_education_providers",
  umbrella_organization: "org_rare_disease_networks",
  organizacion_paraguas: "org_rare_disease_networks",
  hospital: "org_teaching_hospitals",
  research_center: "org_genomics_research_institutes",
  centro_de_investigacion: "org_genomics_research_institutes",
  scientific_society: "org_scientific_societies",
  sociedad_cientifica: "org_scientific_societies",
  genetic_testing_platform: "org_genetic_testing_platforms",
  plataforma_de_pruebas_geneticas: "org_genetic_testing_platforms",
  other: "",
  otro: "",
};

const COUNTRY_ALIASES: Record<string, string> = {
  argentina: "AR",
  arg: "AR",
  united_states: "US",
  united_states_of_america: "US",
  estados_unidos: "US",
  estados_unidos_de_america: "US",
  usa: "US",
  eeuu: "US",
  australia: "AU",
  aus: "AU",
  new_zealand: "NZ",
  nueva_zelanda: "NZ",
  nzl: "NZ",
  spain: "ES",
  espana: "ES",
  esp: "ES",
  united_kingdom: "GB",
  reino_unido: "GB",
  uk: "GB",
  gbr: "GB",
};

function normalizeCrmCategory(value: unknown): string {
  const raw = cleanString(value);
  if (!raw) {
    return "";
  }

  const key = normalizeKey(raw);
  const option = PARTNERSHIP_CRM_CATEGORY_OPTIONS.find(
    (category) =>
      normalizeKey(category.value) === key ||
      normalizeKey(category.label) === key,
  );
  if (option) {
    return option.value;
  }

  if (Object.prototype.hasOwnProperty.call(CATEGORY_ALIASES, key)) {
    return CATEGORY_ALIASES[key] ?? "";
  }

  return "";
}

function normalizeCrmCountry(value: unknown) {
  const raw = cleanString(value);
  if (!raw) {
    return "";
  }

  const parenthesizedCode = raw.match(/\(([a-z]{2})\)\s*$/i)?.[1];
  if (parenthesizedCode) {
    return parenthesizedCode.toUpperCase();
  }

  const compactCode = raw.replace(/[\s._-]+/g, "").toUpperCase();
  if (/^[A-Z]{2}$/.test(compactCode)) {
    return compactCode;
  }

  return (
    COUNTRY_ALIASES[normalizeKey(raw.replace(/\s*\([^)]*\)\s*$/, ""))] ?? raw
  );
}

function normalizeLimit(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PAGE_SIZE);
}

function timestampToIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
  }

  return undefined;
}

function parseCursorTimestamp(cursor?: string) {
  if (!cursor) {
    return undefined;
  }

  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return Timestamp.fromDate(parsed);
}

function parseDateTimestamp(value: unknown) {
  const raw = cleanString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Timestamp.fromDate(parsed);
}

function withoutUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}

function recordData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function organizationDocument(
  input: PartnershipCrmOrganizationInput,
): Record<string, unknown> {
  const name = cleanString(input.name);
  const website = normalizeWebsite(input.website);
  const normalizedName = normalizeName(name);

  return withoutUndefined({
    schemaVersion: 1,
    name,
    category: normalizeCrmCategory(input.category),
    website,
    websiteDomain: websiteDomain(website),
    country: normalizeCrmCountry(input.country),
    status: normalizeStatus(input.status),
    contactName: cleanString(input.contactName),
    contactEmail: normalizeEmail(input.contactEmail),
    contactLinkedIn: normalizeWebsite(input.contactLinkedIn),
    lastContactAt: parseDateTimestamp(input.lastContactAt),
    notes: cleanString(input.notes),
    normalizedName,
  });
}

function templateDocument(
  input: PartnershipCrmTemplateInput,
): Record<string, unknown> {
  const name = cleanString(input.name);

  return withoutUndefined({
    schemaVersion: 1,
    name,
    category: normalizeCrmCategory(input.category),
    subject: cleanString(input.subject),
    body: cleanString(input.body),
    status: normalizeTemplateStatus(input.status),
    notes: cleanString(input.notes),
    normalizedName: normalizeName(name),
  });
}

function toOrganizationRecord(
  id: string,
  data: Record<string, unknown>,
): PartnershipCrmOrganizationRecord {
  const website = cleanString(data.website);
  const name = cleanString(data.name);

  return {
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    name,
    category: normalizeCrmCategory(data.category),
    website,
    websiteDomain: cleanString(data.websiteDomain) || websiteDomain(website),
    country: cleanString(data.country),
    status: normalizeStatus(data.status),
    contactName: cleanString(data.contactName),
    contactEmail: normalizeEmail(data.contactEmail),
    contactLinkedIn: cleanString(data.contactLinkedIn),
    lastContactAt: timestampToIso(data.lastContactAt) ?? null,
    notes: cleanString(data.notes),
    normalizedName:
      cleanString(data.normalizedName) || normalizeName(cleanString(data.name)),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    createdByEmail: normalizeEmail(data.createdByEmail),
    updatedByEmail: normalizeEmail(data.updatedByEmail),
  };
}

function toActivityRecord(
  id: string,
  data: Record<string, unknown>,
): PartnershipCrmActivityRecord {
  const type = cleanString(data.type);

  return {
    id,
    type: PARTNERSHIP_CRM_ACTIVITY_TYPES.includes(
      type as PartnershipCrmActivityType,
    )
      ? (type as PartnershipCrmActivityType)
      : "note",
    title: cleanString(data.title),
    body: cleanString(data.body),
    occurredAt: timestampToIso(data.occurredAt),
    createdAt: timestampToIso(data.createdAt),
    createdByEmail: normalizeEmail(data.createdByEmail),
    metadata: recordData(data.metadata),
  };
}

function toTemplateRecord(
  id: string,
  data: Record<string, unknown>,
): PartnershipCrmTemplateRecord {
  const name = cleanString(data.name);

  return {
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    name,
    category: normalizeCrmCategory(data.category),
    subject: cleanString(data.subject),
    body: cleanString(data.body),
    status: normalizeTemplateStatus(data.status),
    notes: cleanString(data.notes),
    normalizedName:
      cleanString(data.normalizedName) || normalizeName(cleanString(data.name)),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    createdByEmail: normalizeEmail(data.createdByEmail),
    updatedByEmail: normalizeEmail(data.updatedByEmail),
  };
}

function duplicateCandidateFromRecord(
  record: PartnershipCrmOrganizationRecord,
): PartnershipCrmDuplicateCandidate {
  return {
    id: record.id,
    name: record.name,
    website: record.website,
    websiteDomain: record.websiteDomain,
    contactEmail: record.contactEmail,
    status: record.status,
  };
}

function matchesFilters(
  record: PartnershipCrmOrganizationRecord,
  filters: {
    query?: string;
    status?: string;
    category?: string;
    country?: string;
    emailState?: PartnershipCrmEmailState;
  },
) {
  const query = cleanString(filters.query).toLowerCase();
  const category = normalizeCrmCategory(filters.category);
  const country = normalizeCrmCountry(filters.country);
  const status = cleanString(filters.status);
  const searchable = [
    record.id,
    record.name,
    record.category,
    record.website,
    record.websiteDomain,
    record.country,
    record.status,
    record.contactName,
    record.contactEmail,
    record.contactLinkedIn,
    record.notes,
  ]
    .join(" ")
    .toLowerCase();

  return (
    (!query || searchable.includes(query)) &&
    (!status || status === "all" || record.status === status) &&
    (!category || normalizeCrmCategory(record.category) === category) &&
    (!country || normalizeCrmCountry(record.country) === country) &&
    (!filters.emailState ||
      (filters.emailState === "has_email"
        ? Boolean(record.contactEmail)
        : !record.contactEmail))
  );
}

function matchesTemplateFilters(
  record: PartnershipCrmTemplateRecord,
  filters: {
    query?: string;
    status?: string;
    category?: string;
  },
) {
  const query = cleanString(filters.query).toLowerCase();
  const category = normalizeCrmCategory(filters.category);
  const status = cleanString(filters.status);
  const searchable = [
    record.id,
    record.name,
    record.category,
    record.subject,
    record.body,
    record.status,
    record.notes,
  ]
    .join(" ")
    .toLowerCase();

  return (
    (!query || searchable.includes(query)) &&
    (!status || status === "all" || record.status === status) &&
    (!category || normalizeCrmCategory(record.category) === category)
  );
}

async function getOrganizationSnapshot(organizationId: string) {
  const snapshot = await adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .doc(organizationId)
    .get();

  return snapshot.exists ? snapshot : null;
}

async function getTemplateSnapshot(templateId: string) {
  const snapshot = await adminDb
    .collection(TEMPLATES_COLLECTION)
    .doc(templateId)
    .get();

  return snapshot.exists ? snapshot : null;
}

async function addActivity(
  organizationId: string,
  context: AdminContext,
  activity: {
    type: PartnershipCrmActivityType;
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: unknown;
  },
) {
  const ref = adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .doc(organizationId)
    .collection(ACTIVITIES_COLLECTION)
    .doc();

  await ref.set(
    withoutUndefined({
      type: activity.type,
      title: activity.title,
      body: activity.body ?? "",
      metadata: activity.metadata,
      occurredAt: activity.occurredAt ?? FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      createdByEmail: context.email,
    }),
  );

  const snapshot = await ref.get();
  return toActivityRecord(ref.id, snapshot.data() ?? {});
}

async function findDuplicateOrganizations(
  input: PartnershipCrmOrganizationInput,
) {
  const byId = new Map<string, PartnershipCrmDuplicateCandidate>();
  const normalizedName = normalizeName(cleanString(input.name));
  const domain = websiteDomain(input.website);
  const collection = adminDb.collection(ORGANIZATIONS_COLLECTION);

  async function addSnapshotDocs(
    snapshotDocs: QueryDocumentSnapshot<Record<string, unknown>>[],
  ) {
    snapshotDocs.forEach((doc) => {
      const record = toOrganizationRecord(doc.id, doc.data());
      byId.set(record.id, duplicateCandidateFromRecord(record));
    });
  }

  if (normalizedName) {
    const snapshot = await collection
      .where("normalizedName", "==", normalizedName)
      .limit(5)
      .get();
    await addSnapshotDocs(snapshot.docs);
  }

  if (domain) {
    const snapshot = await collection
      .where("websiteDomain", "==", domain)
      .limit(5)
      .get();
    await addSnapshotDocs(snapshot.docs);
  }

  return [...byId.values()];
}

export async function listPartnershipCrmTemplates(
  context: AdminContext,
  options: {
    cursor?: string;
    limit?: unknown;
    query?: string;
    status?: string;
    category?: string;
  } = {},
): Promise<PartnershipCrmTemplatesPage> {
  requireGodMode(context);

  const limit = normalizeLimit(options.limit);
  const cursorTimestamp = parseCursorTimestamp(options.cursor);
  const hasFilters = Boolean(
    cleanString(options.query) ||
    (cleanString(options.status) && options.status !== "all") ||
    cleanString(options.category),
  );
  const baseQuery = adminDb
    .collection(TEMPLATES_COLLECTION)
    .orderBy("updatedAt", "desc");
  let query: Query = baseQuery;

  if (cursorTimestamp) {
    query = query.startAfter(cursorTimestamp);
  }

  if (!hasFilters) {
    const snapshot = await query.limit(limit + 1).get();
    const visibleDocs = snapshot.docs.slice(0, limit);
    const templates = visibleDocs.map((doc) =>
      toTemplateRecord(doc.id, doc.data()),
    );
    const lastVisible = visibleDocs[visibleDocs.length - 1];
    const nextCursor =
      snapshot.docs.length > limit && lastVisible
        ? timestampToIso(lastVisible.data().updatedAt)
        : undefined;

    return { templates, nextCursor };
  }

  const templates: PartnershipCrmTemplateRecord[] = [];
  let pageCursorTimestamp = cursorTimestamp;
  let scannedDocs = 0;
  let nextCursor: string | undefined;

  while (templates.length < limit && scannedDocs < MAX_FILTERED_SCAN) {
    const batchLimit = Math.min(
      FILTERED_BATCH_LIMIT,
      MAX_FILTERED_SCAN - scannedDocs,
    );
    let batchQuery: Query = baseQuery;

    if (pageCursorTimestamp) {
      batchQuery = batchQuery.startAfter(pageCursorTimestamp);
    }

    const snapshot = await batchQuery.limit(batchLimit).get();
    if (snapshot.empty) {
      nextCursor = undefined;
      break;
    }

    let lastConsumedDoc: QueryDocumentSnapshot | undefined;

    for (const doc of snapshot.docs) {
      lastConsumedDoc = doc;
      scannedDocs += 1;

      const template = toTemplateRecord(doc.id, doc.data());
      if (matchesTemplateFilters(template, options)) {
        templates.push(template);
        if (templates.length >= limit) {
          break;
        }
      }

      if (scannedDocs >= MAX_FILTERED_SCAN) {
        break;
      }
    }

    if (!lastConsumedDoc) {
      nextCursor = undefined;
      break;
    }

    nextCursor = timestampToIso(lastConsumedDoc.data().updatedAt);
    const lastSnapshotDoc = snapshot.docs[snapshot.docs.length - 1];
    const consumedWholeBatch =
      lastSnapshotDoc && lastConsumedDoc.id === lastSnapshotDoc.id;

    if (!consumedWholeBatch || snapshot.docs.length < batchLimit) {
      break;
    }

    pageCursorTimestamp = parseCursorTimestamp(nextCursor);
    if (!pageCursorTimestamp) {
      nextCursor = undefined;
      break;
    }
  }

  return { templates, nextCursor };
}

export async function getPartnershipCrmTemplate(
  context: AdminContext,
  templateId: string,
) {
  requireGodMode(context);
  const snapshot = await getTemplateSnapshot(templateId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM template not found.", 404);
  }

  return toTemplateRecord(templateId, snapshot.data() ?? {});
}

export async function createPartnershipCrmTemplate(
  context: AdminContext,
  input: PartnershipCrmTemplateInput,
) {
  requireGodMode(context);
  const document = templateDocument(input);
  if (!cleanString(document.name)) {
    throw new AdminRepositoryError("Template name is required.", 400);
  }
  if (!cleanString(document.subject)) {
    throw new AdminRepositoryError("Template subject is required.", 400);
  }
  if (!cleanString(document.body)) {
    throw new AdminRepositoryError("Template body is required.", 400);
  }

  const ref = adminDb.collection(TEMPLATES_COLLECTION).doc();
  await ref.set(
    withoutUndefined({
      ...document,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByEmail: context.email,
      updatedByEmail: context.email,
    }),
  );

  return getPartnershipCrmTemplate(context, ref.id);
}

export async function updatePartnershipCrmTemplate(
  context: AdminContext,
  templateId: string,
  input: PartnershipCrmTemplateInput,
) {
  requireGodMode(context);
  const snapshot = await getTemplateSnapshot(templateId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM template not found.", 404);
  }

  const document = templateDocument(input);
  if (!cleanString(document.name)) {
    throw new AdminRepositoryError("Template name is required.", 400);
  }
  if (!cleanString(document.subject)) {
    throw new AdminRepositoryError("Template subject is required.", 400);
  }
  if (!cleanString(document.body)) {
    throw new AdminRepositoryError("Template body is required.", 400);
  }

  await snapshot.ref.set(
    withoutUndefined({
      ...document,
      createdAt: snapshot.data()?.createdAt,
      createdByEmail: snapshot.data()?.createdByEmail,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    }),
  );

  return getPartnershipCrmTemplate(context, templateId);
}

export async function deletePartnershipCrmTemplate(
  context: AdminContext,
  templateId: string,
) {
  requireGodMode(context);
  const snapshot = await getTemplateSnapshot(templateId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM template not found.", 404);
  }

  await snapshot.ref.delete();
}

export async function listPartnershipCrmOrganizations(
  context: AdminContext,
  options: {
    cursor?: string;
    limit?: unknown;
    query?: string;
    status?: string;
    category?: string;
    country?: string;
    emailState?: PartnershipCrmEmailState;
  } = {},
): Promise<PartnershipCrmOrganizationsPage> {
  requireGodMode(context);

  const limit = normalizeLimit(options.limit);
  const cursorTimestamp = parseCursorTimestamp(options.cursor);
  const hasFilters = Boolean(
    cleanString(options.query) ||
    (cleanString(options.status) && options.status !== "all") ||
    cleanString(options.category) ||
    cleanString(options.country) ||
    options.emailState,
  );
  const baseQuery = adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .orderBy("updatedAt", "desc");
  let query: Query = baseQuery;

  if (cursorTimestamp) {
    query = query.startAfter(cursorTimestamp);
  }

  if (!hasFilters) {
    const snapshot = await query.limit(limit + 1).get();
    const visibleDocs = snapshot.docs.slice(0, limit);
    const organizations = visibleDocs.map((doc) =>
      toOrganizationRecord(doc.id, doc.data()),
    );
    const lastVisible = visibleDocs[visibleDocs.length - 1];
    const nextCursor =
      snapshot.docs.length > limit && lastVisible
        ? timestampToIso(lastVisible.data().updatedAt)
        : undefined;

    return { organizations, nextCursor };
  }

  const organizations: PartnershipCrmOrganizationRecord[] = [];
  let pageCursorTimestamp = cursorTimestamp;
  let scannedDocs = 0;
  let nextCursor: string | undefined;

  while (organizations.length < limit && scannedDocs < MAX_FILTERED_SCAN) {
    const batchLimit = Math.min(
      FILTERED_BATCH_LIMIT,
      MAX_FILTERED_SCAN - scannedDocs,
    );
    let batchQuery: Query = baseQuery;

    if (pageCursorTimestamp) {
      batchQuery = batchQuery.startAfter(pageCursorTimestamp);
    }

    const snapshot = await batchQuery.limit(batchLimit).get();
    if (snapshot.empty) {
      nextCursor = undefined;
      break;
    }

    let lastConsumedDoc: QueryDocumentSnapshot | undefined;

    for (const doc of snapshot.docs) {
      lastConsumedDoc = doc;
      scannedDocs += 1;

      const organization = toOrganizationRecord(doc.id, doc.data());
      if (matchesFilters(organization, options)) {
        organizations.push(organization);
        if (organizations.length >= limit) {
          break;
        }
      }

      if (scannedDocs >= MAX_FILTERED_SCAN) {
        break;
      }
    }

    if (!lastConsumedDoc) {
      nextCursor = undefined;
      break;
    }

    nextCursor = timestampToIso(lastConsumedDoc.data().updatedAt);
    const lastSnapshotDoc = snapshot.docs[snapshot.docs.length - 1];
    const consumedWholeBatch =
      lastSnapshotDoc && lastConsumedDoc.id === lastSnapshotDoc.id;

    if (!consumedWholeBatch || snapshot.docs.length < batchLimit) {
      break;
    }

    pageCursorTimestamp = parseCursorTimestamp(nextCursor);
    if (!pageCursorTimestamp) {
      nextCursor = undefined;
      break;
    }
  }

  return { organizations, nextCursor };
}

export async function getPartnershipCrmOrganization(
  context: AdminContext,
  organizationId: string,
) {
  requireGodMode(context);
  const snapshot = await getOrganizationSnapshot(organizationId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM organization not found.", 404);
  }

  return toOrganizationRecord(organizationId, snapshot.data() ?? {});
}

export async function createPartnershipCrmOrganization(
  context: AdminContext,
  input: PartnershipCrmOrganizationInput,
) {
  requireGodMode(context);
  const document = organizationDocument(input);
  if (!cleanString(document.name)) {
    throw new AdminRepositoryError("Organization name is required.", 400);
  }

  const ref = adminDb.collection(ORGANIZATIONS_COLLECTION).doc();
  await ref.set(
    withoutUndefined({
      ...document,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByEmail: context.email,
      updatedByEmail: context.email,
    }),
  );
  await addActivity(ref.id, context, {
    type: "created",
    title: "Organization created",
    body: cleanString(input.notes),
  });

  return getPartnershipCrmOrganization(context, ref.id);
}

export async function updatePartnershipCrmOrganization(
  context: AdminContext,
  organizationId: string,
  input: PartnershipCrmOrganizationInput,
) {
  requireGodMode(context);
  const snapshot = await getOrganizationSnapshot(organizationId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM organization not found.", 404);
  }

  const previous = toOrganizationRecord(organizationId, snapshot.data() ?? {});
  const document = organizationDocument(input);
  if (!cleanString(document.name)) {
    throw new AdminRepositoryError("Organization name is required.", 400);
  }

  await snapshot.ref.set(
    withoutUndefined({
      ...document,
      createdAt: snapshot.data()?.createdAt,
      createdByEmail: snapshot.data()?.createdByEmail,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    }),
  );

  const nextStatus = normalizeStatus(document.status);
  if (previous.status !== nextStatus) {
    await addActivity(organizationId, context, {
      type: "status",
      title: `Status changed to ${nextStatus}`,
      body: `Previous status: ${previous.status}`,
      metadata: { previousStatus: previous.status, nextStatus },
    });
  } else {
    await addActivity(organizationId, context, {
      type: "updated",
      title: "Organization updated",
    });
  }

  return getPartnershipCrmOrganization(context, organizationId);
}

export async function deletePartnershipCrmOrganization(
  context: AdminContext,
  organizationId: string,
) {
  requireGodMode(context);
  const snapshot = await getOrganizationSnapshot(organizationId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM organization not found.", 404);
  }

  await snapshot.ref.delete();
}

export async function listPartnershipCrmActivities(
  context: AdminContext,
  organizationId: string,
  options: { cursor?: string; limit?: unknown } = {},
): Promise<PartnershipCrmActivitiesPage> {
  requireGodMode(context);
  const organization = await getOrganizationSnapshot(organizationId);
  if (!organization) {
    throw new AdminRepositoryError("CRM organization not found.", 404);
  }

  const limit = normalizeLimit(options.limit);
  let query = organization.ref
    .collection(ACTIVITIES_COLLECTION)
    .orderBy("occurredAt", "desc");
  const cursorTimestamp = parseCursorTimestamp(options.cursor);
  if (cursorTimestamp) {
    query = query.startAfter(cursorTimestamp);
  }

  const snapshot = await query.limit(limit + 1).get();
  const visibleDocs = snapshot.docs.slice(0, limit);
  const activities = visibleDocs.map((doc) =>
    toActivityRecord(doc.id, doc.data()),
  );
  const lastVisible = visibleDocs[visibleDocs.length - 1];
  const nextCursor =
    snapshot.docs.length > limit && lastVisible
      ? timestampToIso(lastVisible.data().occurredAt)
      : undefined;

  return { activities, nextCursor };
}

export async function createPartnershipCrmActivity(
  context: AdminContext,
  organizationId: string,
  input: { title: string; body?: string; type?: PartnershipCrmActivityType },
) {
  requireGodMode(context);
  const organization = await getOrganizationSnapshot(organizationId);
  if (!organization) {
    throw new AdminRepositoryError("CRM organization not found.", 404);
  }

  const title = cleanString(input.title);
  if (!title) {
    throw new AdminRepositoryError("Activity title is required.", 400);
  }

  await organization.ref.set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    },
    { merge: true },
  );

  return addActivity(organizationId, context, {
    type: input.type ?? "note",
    title,
    body: cleanString(input.body),
  });
}

export async function previewPartnershipCrmImport(
  context: AdminContext,
  rows: PartnershipCrmImportRowInput[],
): Promise<PartnershipCrmImportPreview> {
  requireGodMode(context);
  const previews: PartnershipCrmImportPreviewRow[] = [];

  for (const [index, row] of rows.entries()) {
    const organization = organizationDocument(row);
    const name = cleanString(organization.name);
    const errors = name ? [] : ["Organization name is required."];
    const duplicateCandidates = name
      ? await findDuplicateOrganizations(row)
      : [];

    previews.push({
      rowId: row.rowId ?? `row-${index + 1}`,
      organization: {
        name,
        category: cleanString(organization.category),
        website: cleanString(organization.website),
        country: cleanString(organization.country),
        status: normalizeStatus(organization.status),
        contactName: cleanString(organization.contactName),
        contactEmail: normalizeEmail(organization.contactEmail),
        contactLinkedIn: cleanString(organization.contactLinkedIn),
        lastContactAt: timestampToIso(organization.lastContactAt) ?? null,
        notes: cleanString(organization.notes),
      },
      valid: errors.length === 0,
      errors,
      missingEmail: !normalizeEmail(organization.contactEmail),
      duplicateCandidates,
    });
  }

  return {
    rows: previews,
    summary: {
      total: previews.length,
      valid: previews.filter((row) => row.valid).length,
      invalid: previews.filter((row) => !row.valid).length,
      missingEmail: previews.filter((row) => row.missingEmail).length,
      duplicates: previews.filter((row) => row.duplicateCandidates.length > 0)
        .length,
    },
  };
}

export async function importPartnershipCrmOrganizations(
  context: AdminContext,
  rows: PartnershipCrmImportRowInput[],
) {
  requireGodMode(context);
  const results: Array<{
    rowId: string;
    action: "created" | "updated" | "skipped" | "invalid";
    organizationId?: string;
    reason?: string;
  }> = [];

  for (const [index, row] of rows.entries()) {
    const rowId = row.rowId ?? `row-${index + 1}`;
    try {
      const document = organizationDocument(row);
      const name = cleanString(document.name);

      if (!name) {
        results.push({
          rowId,
          action: "invalid",
          reason: "Organization name is required.",
        });
        continue;
      }

      const duplicateCandidates = await findDuplicateOrganizations(row);
      const duplicateId =
        row.duplicateOrganizationId ?? duplicateCandidates[0]?.id;
      const duplicateAction =
        duplicateCandidates.length > 0
          ? (row.duplicateAction ?? "skip")
          : "import";

      if (duplicateAction === "skip") {
        results.push({
          rowId,
          action: "skipped",
          organizationId: duplicateId,
          reason: duplicateId ? "Possible duplicate skipped." : "Skipped.",
        });
        continue;
      }

      if (duplicateAction === "update" && duplicateId) {
        const existing = await getOrganizationSnapshot(duplicateId);
        if (!existing) {
          results.push({
            rowId,
            action: "invalid",
            reason: "Duplicate target was not found.",
          });
          continue;
        }

        await existing.ref.set(
          withoutUndefined({
            ...document,
            createdAt: existing.data()?.createdAt,
            createdByEmail: existing.data()?.createdByEmail,
            updatedAt: FieldValue.serverTimestamp(),
            updatedByEmail: context.email,
          }),
        );
        await addActivity(duplicateId, context, {
          type: "import",
          title: "CSV row updated this organization",
          body: cleanString(row.notes),
        });
        results.push({ rowId, action: "updated", organizationId: duplicateId });
        continue;
      }

      const created = await createPartnershipCrmOrganization(context, row);
      await addActivity(created.id, context, {
        type: "import",
        title: "Imported from CSV",
        body: cleanString(row.notes),
      });
      results.push({ rowId, action: "created", organizationId: created.id });
    } catch (error) {
      if (error instanceof AdminRepositoryError) {
        results.push({
          rowId,
          action: "invalid",
          reason: error.message,
        });
        continue;
      }

      throw error;
    }
  }

  return {
    results,
    summary: {
      total: results.length,
      created: results.filter((result) => result.action === "created").length,
      updated: results.filter((result) => result.action === "updated").length,
      skipped: results.filter((result) => result.action === "skipped").length,
      invalid: results.filter((result) => result.action === "invalid").length,
    },
  };
}

export async function sendPartnershipCrmOrganizationEmail(
  context: AdminContext,
  organizationId: string,
  input: {
    to: string;
    subject: string;
    text: string;
    templateId?: string;
    templateKey?: string;
  },
) {
  requireGodMode(context);
  const snapshot = await getOrganizationSnapshot(organizationId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM organization not found.", 404);
  }

  const organization = toOrganizationRecord(
    organizationId,
    snapshot.data() ?? {},
  );
  const to = normalizeEmail(input.to);
  const subject = cleanString(input.subject);
  const text = cleanString(input.text);

  if (!to) {
    throw new AdminRepositoryError("Recipient email is required.", 400);
  }
  if (!subject) {
    throw new AdminRepositoryError("Email subject is required.", 400);
  }
  if (!text) {
    throw new AdminRepositoryError("Email message is required.", 400);
  }

  await sendPartnershipCrmEmail({ to, subject, text });

  const nextStatus =
    organization.status === "new" ? "contacted" : organization.status;
  await snapshot.ref.set(
    {
      status: nextStatus,
      lastContactAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    },
    { merge: true },
  );

  const activity = await addActivity(organizationId, context, {
    type: "email",
    title: `Email sent to ${to}`,
    body: text,
    metadata: {
      from: PARTNERSHIP_CRM_FROM_EMAIL,
      to,
      subject,
      templateId: cleanString(input.templateId),
      previousStatus: organization.status,
      nextStatus,
    },
  });
  const updatedOrganization = await getPartnershipCrmOrganization(
    context,
    organizationId,
  );

  return { organization: updatedOrganization, activity };
}
