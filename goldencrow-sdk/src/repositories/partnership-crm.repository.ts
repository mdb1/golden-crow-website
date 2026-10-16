import {
  FieldPath,
  FieldValue,
  Timestamp,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { adminDbFor } from "../config/firebase.js";
import {
  PARTNERSHIP_CRM_FROM_EMAIL,
  sendPartnershipCrmEmail,
} from "../lib/partnership-crm-email.js";
import {
  DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS,
  DISCOVER_ORGANIZATION_CATEGORY_OPTIONS,
  type DiscoverIndividualCategoryKey,
  type DiscoverOrganizationCategoryKey,
} from "../lib/discover-publisher-categories.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";

const adminDb = adminDbFor("mydnamap");
const ORGANIZATIONS_COLLECTION = "partnership_crm_organizations";
const PROFESSIONALS_COLLECTION = "partnership_crm_professionals";
const TEMPLATES_COLLECTION = "plantillas";
const SENT_EMAIL_LOG_COLLECTION = "crm_sent_email_log";
const ACTIVITIES_COLLECTION = "activities";
const DAILY_USAGE_COLLECTION = "partnership_crm_daily_usage";
const MAX_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE = MAX_PAGE_SIZE;
const MAX_TARGET_PAGE_SIZE = 20;
const DEFAULT_TARGET_PAGE_SIZE = MAX_TARGET_PAGE_SIZE;
const FILTERED_BATCH_LIMIT = 20;
const FILTERED_TARGET_SCAN_LIMIT = 100;
const DAILY_USAGE_LIMIT = 100;
const DAILY_USAGE_TIME_ZONE = "America/Los_Angeles";
const ORGANIZATION_SUMMARY_FIELDS = [
  "schemaVersion",
  "name",
  "category",
  "website",
  "websiteDomain",
  "country",
  "status",
  "contactName",
  "contactEmail",
  "contactLinkedIn",
  "lastContactAt",
  "is_favorite",
  "normalizedName",
  "createdAt",
  "updatedAt",
  "createdByEmail",
  "updatedByEmail",
] as const;
const PROFESSIONAL_SUMMARY_FIELDS = [
  "schemaVersion",
  "name",
  "category",
  "title",
  "primaryAffiliation",
  "website",
  "websiteDomain",
  "country",
  "status",
  "email",
  "linkedIn",
  "lastContactAt",
  "is_favorite",
  "normalizedName",
  "createdAt",
  "updatedAt",
  "createdByEmail",
  "updatedByEmail",
] as const;
const TEMPLATE_SUMMARY_FIELDS = [
  "schemaVersion",
  "name",
  "audience",
  "category",
  "subject",
  "status",
  "is_favorite",
  "normalizedName",
  "createdAt",
  "updatedAt",
  "createdByEmail",
  "updatedByEmail",
] as const;
const SENT_EMAIL_LOG_SUMMARY_FIELDS = [
  "targetKind",
  "targetId",
  "targetName",
  "from",
  "to",
  "subject",
  "sentAt",
  "createdAt",
  "createdByEmail",
  "templateId",
  "templateName",
] as const;
const MISSING_CATEGORY_FILTER_VALUE = "__no_category__";
const MISSING_COUNTRY_FILTER_VALUE = "__no_country__";

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
export const PARTNERSHIP_CRM_TEMPLATE_AUDIENCES = [
  "organizations",
  "professionals",
] as const;
const PARTNERSHIP_CRM_ORGANIZATION_CATEGORY_OPTIONS =
  DISCOVER_ORGANIZATION_CATEGORY_OPTIONS;
const PARTNERSHIP_CRM_PROFESSIONAL_CATEGORY_OPTIONS =
  DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS;

export type PartnershipCrmStatus = (typeof PARTNERSHIP_CRM_STATUSES)[number];
export type PartnershipCrmActivityType =
  (typeof PARTNERSHIP_CRM_ACTIVITY_TYPES)[number];
export type PartnershipCrmTemplateStatus =
  (typeof PARTNERSHIP_CRM_TEMPLATE_STATUSES)[number];
export type PartnershipCrmTemplateAudience =
  (typeof PARTNERSHIP_CRM_TEMPLATE_AUDIENCES)[number];
export type PartnershipCrmTargetKind = PartnershipCrmTemplateAudience;
export type PartnershipCrmUsageSurface = "crm" | "plantillas";

export type PartnershipCrmLinkedInState = "has_linkedin" | "missing_linkedin";
export type PartnershipCrmStatusCounts = Record<PartnershipCrmStatus, number>;
export type PartnershipCrmVisualFilterFacetKey =
  "status" | "category" | "country" | "linkedInState";

type PartnershipCrmTargetListOptions = {
  cursor?: string;
  limit?: unknown;
  query?: string;
  status?: string;
  category?: string;
  country?: string;
  linkedInState?: PartnershipCrmLinkedInState;
  deep?: boolean;
};

export interface PartnershipCrmDailyUsage {
  surface: PartnershipCrmUsageSurface;
  used: number;
  limit: number;
  percentage: number;
  remaining: number;
  resetAt: string;
  locked: boolean;
}

export class PartnershipCrmUsageError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code:
      | "CRM_DAILY_LIMIT_REACHED"
      | "CRM_USAGE_UNAVAILABLE",
    public readonly usage?: PartnershipCrmDailyUsage,
  ) {
    super(message);
    this.name = "PartnershipCrmUsageError";
  }
}

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
  is_favorite?: boolean;
}

export interface PartnershipCrmImportRowInput extends PartnershipCrmOrganizationInput {
  rowId?: string;
  idempotencyKey?: string;
  duplicateAction?:
    "skip" | "update" | "import" | "fill_missing" | "replace_variables";
  duplicateOrganizationId?: string;
}

export interface PartnershipCrmProfessionalInput {
  name?: string;
  category?: string;
  title?: string;
  primaryAffiliation?: string;
  potentialPocketGenesEditorFit?: string;
  emailRoute?: string;
  linkedInRoute?: string;
  researchBasis?: string;
  website?: string;
  country?: string;
  status?: PartnershipCrmStatus;
  email?: string;
  linkedIn?: string;
  lastContactAt?: string | null;
  notes?: string;
  is_favorite?: boolean;
}

export interface PartnershipCrmProfessionalImportRowInput extends PartnershipCrmProfessionalInput {
  rowId?: string;
  idempotencyKey?: string;
  duplicateAction?:
    "skip" | "update" | "import" | "fill_missing" | "replace_variables";
  duplicateProfessionalId?: string;
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
  notesPreview?: string;
  is_favorite: boolean;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
}

export interface PartnershipCrmProfessionalRecord {
  id: string;
  schemaVersion: number;
  name: string;
  category: string;
  title: string;
  primaryAffiliation: string;
  potentialPocketGenesEditorFit: string;
  emailRoute: string;
  linkedInRoute: string;
  researchBasis: string;
  website: string;
  websiteDomain: string;
  country: string;
  status: PartnershipCrmStatus;
  email: string;
  linkedIn: string;
  lastContactAt: string | null;
  notes: string;
  notesPreview?: string;
  is_favorite: boolean;
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
  audience?: PartnershipCrmTemplateAudience;
  category?: string;
  subject?: string;
  body?: string;
  status?: PartnershipCrmTemplateStatus;
  notes?: string;
  is_favorite?: boolean;
}

export interface PartnershipCrmTemplateRecord {
  id: string;
  schemaVersion: number;
  name: string;
  audience: PartnershipCrmTemplateAudience;
  category: string;
  subject: string;
  body: string;
  status: PartnershipCrmTemplateStatus;
  notes: string;
  notesPreview?: string;
  is_favorite: boolean;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
}

export interface PartnershipCrmOrganizationsPage {
  organizations: PartnershipCrmOrganizationRecord[];
  nextCursor?: string;
  statusCounts: PartnershipCrmStatusCounts;
  partial: boolean;
  scanned: number;
  asOf: string;
}

export interface PartnershipCrmProfessionalsPage {
  professionals: PartnershipCrmProfessionalRecord[];
  nextCursor?: string;
  statusCounts: PartnershipCrmStatusCounts;
  partial: boolean;
  scanned: number;
  asOf: string;
}

export interface PartnershipCrmActivitiesPage {
  activities: PartnershipCrmActivityRecord[];
  nextCursor?: string;
  asOf?: string;
}

export interface PartnershipCrmTemplatesPage {
  templates: PartnershipCrmTemplateRecord[];
  nextCursor?: string;
  partial: boolean;
  scanned: number;
  asOf: string;
}

export interface PartnershipCrmSentEmailLogRecord {
  id: string;
  targetKind: PartnershipCrmTargetKind;
  targetId: string;
  targetName: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  sentAt?: string;
  createdAt?: string;
  createdByEmail?: string;
  templateId?: string;
  templateName?: string;
}

export interface PartnershipCrmSentEmailLogsPage {
  emails: PartnershipCrmSentEmailLogRecord[];
  nextCursor?: string;
  asOf?: string;
}

export interface PartnershipCrmVisualFilterBucket {
  value: string;
  count: number;
}

export interface PartnershipCrmVisualFilterFacet {
  key: PartnershipCrmVisualFilterFacetKey;
  total: number;
  buckets: PartnershipCrmVisualFilterBucket[];
}

export interface PartnershipCrmVisualFilters {
  targetKind: PartnershipCrmTargetKind;
  facets: Record<
    PartnershipCrmVisualFilterFacetKey,
    PartnershipCrmVisualFilterFacet
  >;
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

export interface PartnershipCrmProfessionalDuplicateCandidate {
  id: string;
  name: string;
  email: string;
  linkedIn: string;
  website: string;
  websiteDomain: string;
  status: PartnershipCrmStatus;
}

export interface PartnershipCrmProfessionalImportPreviewRow {
  rowId: string;
  professional: PartnershipCrmProfessionalInput;
  valid: boolean;
  errors: string[];
  missingEmail: boolean;
  duplicateCandidates: PartnershipCrmProfessionalDuplicateCandidate[];
}

export interface PartnershipCrmProfessionalImportPreview {
  rows: PartnershipCrmProfessionalImportPreviewRow[];
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
const TEMPLATE_AUDIENCE_SET = new Set<string>(
  PARTNERSHIP_CRM_TEMPLATE_AUDIENCES,
);

function requireGodMode(context: AdminContext) {
  if (!context.isBootstrap) {
    throw new AdminRepositoryError("GOD MODE access required", 403);
  }
}

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function zonedMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = targetAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedDateParts(new Date(candidate), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate -= actualAsUtc - targetAsUtc;
  }

  return new Date(candidate);
}

function partnershipCrmUsageWindow(now = new Date()) {
  const current = zonedDateParts(now, DAILY_USAGE_TIME_ZONE);
  const date = `${current.year.toString().padStart(4, "0")}-${current.month
    .toString()
    .padStart(2, "0")}-${current.day.toString().padStart(2, "0")}`;
  const nextCalendarDay = new Date(
    Date.UTC(current.year, current.month - 1, current.day + 1),
  );
  const resetAt = zonedMidnightToUtc(
    nextCalendarDay.getUTCFullYear(),
    nextCalendarDay.getUTCMonth() + 1,
    nextCalendarDay.getUTCDate(),
    DAILY_USAGE_TIME_ZONE,
  ).toISOString();

  return { date, resetAt };
}

function partnershipCrmUsageState(
  surface: PartnershipCrmUsageSurface,
  used: number,
  resetAt: string,
): PartnershipCrmDailyUsage {
  const normalizedUsed = Math.min(Math.max(Math.trunc(used), 0), DAILY_USAGE_LIMIT);

  return {
    surface,
    used: normalizedUsed,
    limit: DAILY_USAGE_LIMIT,
    percentage: normalizedUsed,
    remaining: DAILY_USAGE_LIMIT - normalizedUsed,
    resetAt,
    locked: normalizedUsed >= DAILY_USAGE_LIMIT,
  };
}

function validatedPartnershipCrmUsageDocument(
  data: Record<string, unknown>,
  surface: PartnershipCrmUsageSurface,
  date: string,
) {
  const used = data.used;
  const eventIds = data.eventIds;
  const validEventIds =
    Array.isArray(eventIds) &&
    eventIds.length <= DAILY_USAGE_LIMIT &&
    eventIds.every(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    ) &&
    new Set(eventIds).size === eventIds.length;
  const validUsed =
    typeof used === "number" &&
    Number.isFinite(used) &&
    Number.isInteger(used) &&
    used >= 0 &&
    used <= DAILY_USAGE_LIMIT;

  if (
    data.surface !== surface ||
    data.date !== date ||
    data.limit !== DAILY_USAGE_LIMIT ||
    !validUsed ||
    !validEventIds ||
    eventIds.length !== used
  ) {
    throw new PartnershipCrmUsageError(
      "CRM usage tracking is unavailable. Fresh CRM actions are disabled.",
      503,
      "CRM_USAGE_UNAVAILABLE",
    );
  }

  return { used, eventIds };
}

export async function consumePartnershipCrmDailyUsage(
  context: AdminContext,
  surface: PartnershipCrmUsageSurface,
  eventId: string,
  kind: string,
): Promise<{ usage: PartnershipCrmDailyUsage; duplicate: boolean }> {
  requireGodMode(context);
  const normalizedEventId = cleanString(eventId);
  if (!normalizedEventId) {
    throw new AdminRepositoryError("CRM usage event id is required.", 400);
  }

  const window = partnershipCrmUsageWindow();
  const reference = adminDb
    .collection(DAILY_USAGE_COLLECTION)
    .doc(`${window.date}__${surface}`);

  try {
    return await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.exists ? (snapshot.data() ?? {}) : {};
      const { used, eventIds } = snapshot.exists
        ? validatedPartnershipCrmUsageDocument(data, surface, window.date)
        : { used: 0, eventIds: [] };

      if (eventIds.includes(normalizedEventId)) {
        return {
          usage: partnershipCrmUsageState(surface, used, window.resetAt),
          duplicate: true,
        };
      }

      if (used >= DAILY_USAGE_LIMIT) {
        const usage = partnershipCrmUsageState(surface, used, window.resetAt);
        throw new PartnershipCrmUsageError(
          `The ${surface} daily usage limit has been reached.`,
          429,
          "CRM_DAILY_LIMIT_REACHED",
          usage,
        );
      }

      const nextUsed = used + 1;
      const existingByKind =
        data.byKind && typeof data.byKind === "object"
          ? (data.byKind as Record<string, unknown>)
          : {};
      const normalizedKind = cleanString(kind) || "other";
      const previousKindCount = existingByKind[normalizedKind];
      const byKind = {
        ...existingByKind,
        [normalizedKind]:
          (typeof previousKindCount === "number" ? previousKindCount : 0) + 1,
      };

      transaction.set(reference, {
        surface,
        date: window.date,
        used: nextUsed,
        limit: DAILY_USAGE_LIMIT,
        eventIds: [...eventIds, normalizedEventId],
        byKind,
        lastKind: normalizedKind,
        lastAdminHash: createHash("sha256")
          .update(context.email.toLowerCase())
          .digest("hex")
          .slice(0, 16),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
      });

      return {
        usage: partnershipCrmUsageState(surface, nextUsed, window.resetAt),
        duplicate: false,
      };
    });
  } catch (error) {
    if (
      error instanceof PartnershipCrmUsageError ||
      error instanceof AdminRepositoryError
    ) {
      throw error;
    }

    throw new PartnershipCrmUsageError(
      "CRM usage tracking is unavailable. Fresh CRM actions are disabled.",
      503,
      "CRM_USAGE_UNAVAILABLE",
    );
  }
}

export async function getPartnershipCrmDailyUsage(
  context: AdminContext,
  surface: PartnershipCrmUsageSurface,
): Promise<PartnershipCrmDailyUsage> {
  requireGodMode(context);
  const window = partnershipCrmUsageWindow();
  const reference = adminDb
    .collection(DAILY_USAGE_COLLECTION)
    .doc(`${window.date}__${surface}`);

  try {
    const snapshot = await reference.get();
    if (!snapshot.exists) {
      return partnershipCrmUsageState(surface, 0, window.resetAt);
    }

    const { used } = validatedPartnershipCrmUsageDocument(
      snapshot.data() ?? {},
      surface,
      window.date,
    );
    return partnershipCrmUsageState(surface, used, window.resetAt);
  } catch (error) {
    if (
      error instanceof PartnershipCrmUsageError ||
      error instanceof AdminRepositoryError
    ) {
      throw error;
    }

    throw new PartnershipCrmUsageError(
      "CRM usage tracking is unavailable. Fresh CRM actions are disabled.",
      503,
      "CRM_USAGE_UNAVAILABLE",
    );
  }
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePotentialPocketGenesEditorFit(value: unknown) {
  return cleanString(value)
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(
      /^(?:propuesta\s+editorial|editorial\s+proposal|hook\s+editorial|fit\s+editorial)\s*[:：-]\s*/i,
      "",
    )
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/[\s,.;:]+$/g, "")
    .trim();
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

const PROFESSIONAL_NAME_STOP_WORDS = new Set([
  "dr",
  "dra",
  "doctor",
  "doctora",
  "prof",
  "profesor",
  "profesora",
  "lic",
  "ing",
  "phd",
  "msc",
  "md",
  "de",
  "del",
  "de la",
  "la",
  "las",
  "los",
  "el",
  "y",
  "e",
  "da",
  "das",
  "do",
  "dos",
  "van",
  "von",
]);

function professionalNameTokens(value: string) {
  return normalizeName(value)
    .split(" ")
    .filter(
      (token) => token.length > 1 && !PROFESSIONAL_NAME_STOP_WORDS.has(token),
    );
}

function looksLikeMultipleProfessionalNames(value: string) {
  const chunks = cleanString(value)
    .split(/[;,]+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => professionalNameTokens(chunk).length >= 2);

  return chunks.length > 1;
}

function professionalNamesCanReferToSamePerson(left: string, right: string) {
  const normalizedLeft = normalizeName(cleanString(left));
  const normalizedRight = normalizeName(cleanString(right));
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (
    looksLikeMultipleProfessionalNames(left) ||
    looksLikeMultipleProfessionalNames(right)
  ) {
    return false;
  }

  const leftTokens = new Set(professionalNameTokens(left));
  const rightTokens = new Set(professionalNameTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return false;
  }

  const sharedTokens = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  );
  if (sharedTokens.length === 0) {
    return false;
  }

  if (Math.min(leftTokens.size, rightTokens.size) === 1) {
    return sharedTokens.some((token) => token.length >= 4);
  }

  return sharedTokens.length >= 2;
}

function organizationNamesCanReferToSameEntity(left: string, right: string) {
  const normalizedLeft = normalizeName(cleanString(left));
  const normalizedRight = normalizeName(cleanString(right));
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const [shorter, longer] =
    normalizedLeft.length <= normalizedRight.length
      ? [normalizedLeft, normalizedRight]
      : [normalizedRight, normalizedLeft];

  return shorter.length >= 4 && longer.startsWith(`${shorter} `);
}

function organizationNameLookupPrefix(normalizedName: string) {
  const firstToken = normalizedName.split(" ")[0] ?? "";
  return firstToken.length >= 3 ? firstToken : "";
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

function normalizeTemplateAudience(
  value: unknown,
): PartnershipCrmTemplateAudience {
  const normalized = cleanString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return TEMPLATE_AUDIENCE_SET.has(normalized)
    ? (normalized as PartnershipCrmTemplateAudience)
    : "organizations";
}

function normalizeEmail(value: unknown) {
  return cleanString(value).toLowerCase();
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeKey(cleanString(value));
  return [
    "true",
    "1",
    "yes",
    "y",
    "si",
    "s",
    "favorite",
    "favourite",
    "favorito",
    "favorita",
    "star",
    "starred",
    "destacado",
    "destacada",
  ].includes(normalized);
}

const ORGANIZATION_CATEGORY_ALIASES: Record<
  string,
  DiscoverOrganizationCategoryKey | ""
> = {
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

const PROFESSIONAL_CATEGORY_ALIASES: Record<
  string,
  DiscoverIndividualCategoryKey | ""
> = {
  geneticist: "pro_clinical_geneticists",
  genetista: "pro_clinical_geneticists",
  clinical_geneticist: "pro_clinical_geneticists",
  medical_geneticist: "pro_medical_geneticists",
  genetic_counselor: "pro_genetic_counselors",
  asesor_genetico: "pro_genetic_counselors",
  bioinformatician: "pro_bioinformaticians",
  bioinformatico: "pro_bioinformaticians",
  researcher: "pro_research_scientists",
  investigador: "pro_research_scientists",
  physician: "pro_physicians",
  doctor: "pro_physicians",
  medico: "pro_physicians",
  clinician: "pro_physicians",
  patient_advocate: "pro_patient_advocates",
  educator: "pro_educators",
  science_communicator: "pro_science_communicators",
  other: "pro_other",
  otro: "pro_other",
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

function normalizeSingleCrmCategory(
  value: unknown,
  audience: PartnershipCrmTemplateAudience = "organizations",
): string {
  const raw = cleanString(value);
  if (!raw) {
    return "";
  }

  const key = normalizeKey(raw);
  const options =
    audience === "professionals"
      ? PARTNERSHIP_CRM_PROFESSIONAL_CATEGORY_OPTIONS
      : PARTNERSHIP_CRM_ORGANIZATION_CATEGORY_OPTIONS;
  const aliases =
    audience === "professionals"
      ? PROFESSIONAL_CATEGORY_ALIASES
      : ORGANIZATION_CATEGORY_ALIASES;
  const option = options.find(
    (category) =>
      normalizeKey(category.value) === key ||
      normalizeKey(category.label) === key,
  );
  if (option) {
    return option.value;
  }

  if (Object.prototype.hasOwnProperty.call(aliases, key)) {
    return aliases[key] ?? "";
  }

  return "";
}

function normalizeCrmCategory(
  value: unknown,
  audience: PartnershipCrmTemplateAudience = "organizations",
): string {
  const seen = new Set<string>();
  return cleanString(value)
    .split(",")
    .map((token) => normalizeSingleCrmCategory(token, audience))
    .filter((category) => {
      if (!category || seen.has(category)) {
        return false;
      }
      seen.add(category);
      return true;
    })
    .join(",");
}

function crmCategoryKeys(
  value: unknown,
  audience: PartnershipCrmTemplateAudience = "organizations",
) {
  return normalizeCrmCategory(value, audience).split(",").filter(Boolean);
}

function normalizeCrmPrimaryCategory(
  value: unknown,
  audience: PartnershipCrmTemplateAudience = "organizations",
) {
  return crmCategoryKeys(value, audience)[0] ?? "";
}

function normalizeSingleCrmCountry(value: unknown) {
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
    COUNTRY_ALIASES[normalizeKey(raw.replace(/\s*\([^)]*\)\s*$/, ""))] ?? ""
  );
}

function crmCountryCodes(value: unknown) {
  const seen = new Set<string>();
  return cleanString(value)
    .split(",")
    .map((token) => normalizeSingleCrmCountry(token))
    .filter((country) => {
      if (!country || seen.has(country)) {
        return false;
      }
      seen.add(country);
      return true;
    });
}

function normalizeCrmCountry(value: unknown) {
  return crmCountryCodes(value).join(",");
}

function hasAnyValueOverlap(
  filterValues: readonly string[],
  recordValues: readonly string[],
) {
  if (!filterValues.length) {
    return true;
  }

  return filterValues.some((value) => recordValues.includes(value));
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

function normalizeTargetLimit(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TARGET_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_TARGET_PAGE_SIZE);
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

type PartnershipCrmCursorField =
  | "category"
  | "contactLinkedIn"
  | "country"
  | "email"
  | "linkedIn"
  | "normalizedName"
  | "updatedAt"
  | "occurredAt"
  | "sentAt"
  | "documentId";
const STRING_CURSOR_FIELDS = new Set<PartnershipCrmCursorField>([
  "category",
  "contactLinkedIn",
  "country",
  "email",
  "linkedIn",
  "normalizedName",
  "documentId",
]);

type PartnershipCrmCursorTimestamp = {
  seconds: number;
  nanoseconds: number;
};

type PartnershipCrmCursorPayload = {
  v: 2;
  field: PartnershipCrmCursorField;
  value: string | PartnershipCrmCursorTimestamp;
  id: string;
  fingerprint: string;
};

function timestampToCursorValue(
  value: unknown,
): PartnershipCrmCursorTimestamp | undefined {
  let timestamp: Timestamp;

  if (value instanceof Timestamp) {
    timestamp = value;
  } else if (value instanceof Date) {
    timestamp = Timestamp.fromDate(value);
  } else if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    timestamp = Timestamp.fromDate(parsed);
  } else {
    return undefined;
  }

  return {
    seconds: timestamp.seconds,
    nanoseconds: timestamp.nanoseconds,
  };
}

function isCursorTimestamp(
  value: unknown,
): value is PartnershipCrmCursorTimestamp {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  return (
    keys.length === 2 &&
    keys[0] === "nanoseconds" &&
    keys[1] === "seconds" &&
    typeof candidate.seconds === "number" &&
    Number.isSafeInteger(candidate.seconds) &&
    typeof candidate.nanoseconds === "number" &&
    Number.isInteger(candidate.nanoseconds) &&
    candidate.nanoseconds >= 0 &&
    candidate.nanoseconds < 1_000_000_000
  );
}

function cursorFingerprint(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("base64url")
    .slice(0, 16);
}

function encodeCursor(
  doc: QueryDocumentSnapshot,
  field: PartnershipCrmCursorField,
  fingerprint: string,
) {
  const rawValue = field === "documentId" ? doc.id : doc.data()[field];
  const value = STRING_CURSOR_FIELDS.has(field)
    ? cleanString(rawValue)
    : timestampToCursorValue(rawValue);

  if (!value) {
    return undefined;
  }

  const payload: PartnershipCrmCursorPayload = {
    v: 2,
    field,
    value,
    id: doc.id,
    fingerprint,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function parseCursor(
  cursor: string | undefined,
  field: PartnershipCrmCursorField,
  fingerprint: string,
) {
  if (!cursor) {
    return undefined;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Cursor payload is invalid.");
    }

    const candidate = payload as Record<string, unknown>;
    const keys = Object.keys(candidate).sort();
    if (
      keys.length !== 5 ||
      keys[0] !== "field" ||
      keys[1] !== "fingerprint" ||
      keys[2] !== "id" ||
      keys[3] !== "v" ||
      keys[4] !== "value" ||
      candidate.v !== 2 ||
      candidate.field !== field ||
      candidate.fingerprint !== fingerprint ||
      typeof candidate.id !== "string" ||
      !candidate.id
    ) {
      throw new Error("Cursor metadata does not match the request.");
    }

    if (STRING_CURSOR_FIELDS.has(field)) {
      if (typeof candidate.value !== "string" || !candidate.value) {
        throw new Error("Cursor value is invalid.");
      }
      return { value: candidate.value, id: candidate.id };
    }

    if (!isCursorTimestamp(candidate.value)) {
      throw new Error("Cursor timestamp is invalid.");
    }

    return {
      value: new Timestamp(
        candidate.value.seconds,
        candidate.value.nanoseconds,
      ),
      id: candidate.id,
    };
  } catch {
    throw new AdminRepositoryError(
      "CRM cursor is invalid or does not match the current filters.",
      400,
    );
  }
}

function applyCursor(
  query: Query,
  cursor: string | undefined,
  field: PartnershipCrmCursorField,
  fingerprint: string,
) {
  const parsed = parseCursor(cursor, field, fingerprint);
  if (!parsed) {
    return query;
  }

  return field === "documentId"
    ? query.startAfter(parsed.id)
    : query.startAfter(parsed.value, parsed.id);
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

function isMissingCrmDocumentValue(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }

  return typeof value === "string" && value.trim().length === 0;
}

type CrmStructuredNotes = {
  record: Record<string, string>;
};

const PREVIOUS_CRM_NOTES_KEY = "previous_notes";
const CSV_NOTES_KEY = "csv_notes";

function stringifyCrmStructuredNoteValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeCrmStructuredNoteKey(key: string) {
  return key
    .trim()
    .replace(/[*`]+/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanCrmStructuredNoteLine(value: string) {
  return value
    .trim()
    .replace(/^[-*•]\s+/, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/^\*+|\*+$/g, "")
    .trim();
}

function parseCrmColonStructuredNotes(value: string): CrmStructuredNotes | null {
  const cleanedLines = value
    .split(/\r?\n/)
    .map(cleanCrmStructuredNoteLine)
    .filter(Boolean);

  if (cleanedLines.length === 0) {
    return null;
  }

  const record: Record<string, string> = {};
  for (const line of cleanedLines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex <= 0) {
      return null;
    }

    const key = normalizeCrmStructuredNoteKey(line.slice(0, colonIndex));
    const entryValue = cleanCrmStructuredNoteLine(line.slice(colonIndex + 1));
    if (!key || !entryValue) {
      return null;
    }

    record[key] = entryValue;
  }

  return { record };
}

function parseCrmStructuredNotes(value: unknown): CrmStructuredNotes | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return parseCrmColonStructuredNotes(trimmed);
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, entryValue]) => [
          key.trim(),
          stringifyCrmStructuredNoteValue(entryValue),
        ] as const)
        .filter(([key, entryValue]) => key.length > 0 && entryValue.length > 0),
    );

    return { record };
  } catch {
    return null;
  }
}

function serializeCrmStructuredNotes(record: Record<string, string>) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(record)
        .map(([key, value]) => [key.trim(), value.trim()] as const)
        .filter(([key, value]) => key.length > 0 && value.length > 0),
    ),
  );
}

function mergeCrmDocumentNotes(existing: unknown, incoming: unknown) {
  const existingText = typeof existing === "string" ? existing.trim() : "";
  const incomingText = typeof incoming === "string" ? incoming.trim() : "";
  const existingJson = parseCrmStructuredNotes(existingText);
  const incomingJson = parseCrmStructuredNotes(incomingText);

  if (!existingText) {
    return incomingText;
  }
  if (!incomingText) {
    return existingText;
  }
  if (existingJson && incomingJson) {
    return serializeCrmStructuredNotes({
      ...existingJson.record,
      ...incomingJson.record,
    });
  }
  if (incomingJson) {
    return serializeCrmStructuredNotes({
      ...incomingJson.record,
      [PREVIOUS_CRM_NOTES_KEY]: existingText,
    });
  }
  if (existingJson) {
    return serializeCrmStructuredNotes({
      ...existingJson.record,
      [CSV_NOTES_KEY]: incomingText,
    });
  }

  return existingText;
}

function fillMissingCrmDocumentFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
) {
  const merged = Object.fromEntries(
    Object.keys({ ...existing, ...incoming }).map((key) => {
      const existingValue = existing[key];
      if (
        isMissingCrmDocumentValue(existingValue) &&
        !isMissingCrmDocumentValue(incoming[key])
      ) {
        return [key, incoming[key]];
      }

      return [key, existingValue];
    }),
  );

  merged.notes = mergeCrmDocumentNotes(existing.notes, incoming.notes);

  return merged;
}

const ORGANIZATION_VARIABLE_FIELD_KEYS = [
  "name",
  "contactName",
  "website",
  "websiteDomain",
] as const;
const PROFESSIONAL_VARIABLE_FIELD_KEYS = [
  "name",
  "title",
  "primaryAffiliation",
  "potentialPocketGenesEditorFit",
  "emailRoute",
  "linkedInRoute",
  "researchBasis",
  "website",
  "websiteDomain",
] as const;

function fillMissingAndReplaceCrmVariableFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  targetKind: PartnershipCrmTargetKind,
) {
  const merged = fillMissingCrmDocumentFields(existing, incoming);
  const variableKeys =
    targetKind === "professionals"
      ? PROFESSIONAL_VARIABLE_FIELD_KEYS
      : ORGANIZATION_VARIABLE_FIELD_KEYS;

  variableKeys.forEach((key) => {
    if (!isMissingCrmDocumentValue(incoming[key])) {
      merged[key] = incoming[key];
    }
  });

  return merged;
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
    is_favorite: normalizeBoolean(input.is_favorite),
    normalizedName,
  });
}

function professionalDocument(
  input: PartnershipCrmProfessionalInput,
): Record<string, unknown> {
  const name = cleanString(input.name);
  const website = normalizeWebsite(input.website);
  const normalizedName = normalizeName(name);

  return withoutUndefined({
    schemaVersion: 1,
    name,
    category: normalizeCrmCategory(input.category, "professionals"),
    title: cleanString(input.title),
    primaryAffiliation: cleanString(input.primaryAffiliation),
    potentialPocketGenesEditorFit: normalizePotentialPocketGenesEditorFit(
      input.potentialPocketGenesEditorFit,
    ),
    emailRoute: cleanString(input.emailRoute),
    linkedInRoute: cleanString(input.linkedInRoute),
    researchBasis: cleanString(input.researchBasis),
    website,
    websiteDomain: websiteDomain(website),
    country: normalizeCrmCountry(input.country),
    status: normalizeStatus(input.status),
    email: normalizeEmail(input.email),
    linkedIn: normalizeWebsite(input.linkedIn),
    lastContactAt: parseDateTimestamp(input.lastContactAt),
    notes: cleanString(input.notes),
    is_favorite: normalizeBoolean(input.is_favorite),
    normalizedName,
  });
}

function templateDocument(
  input: PartnershipCrmTemplateInput,
): Record<string, unknown> {
  const name = cleanString(input.name);
  const audience = normalizeTemplateAudience(input.audience);

  return withoutUndefined({
    schemaVersion: 1,
    name,
    audience,
    category: normalizeCrmPrimaryCategory(input.category, audience),
    subject: cleanString(input.subject),
    body: cleanString(input.body),
    status: normalizeTemplateStatus(input.status),
    notes: cleanString(input.notes),
    is_favorite: normalizeBoolean(input.is_favorite),
    normalizedName: normalizeName(name),
  });
}

function normalizeTemplateMergeValue(value: unknown) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mergeTemplateImportNotes(existing: unknown, incoming: unknown) {
  const existingText = cleanString(existing);
  const incomingText = cleanString(incoming);

  if (!existingText) {
    return incomingText;
  }
  if (!incomingText) {
    return existingText;
  }

  const normalizedIncoming = normalizeTemplateMergeValue(incomingText);
  const alreadyPresent = existingText
    .split("\n\n--- CSV import ---\n")
    .some(
      (entry) => normalizeTemplateMergeValue(entry) === normalizedIncoming,
    );
  if (alreadyPresent) {
    return existingText;
  }

  return `${existingText}\n\n--- CSV import ---\n${incomingText}`;
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
    country: normalizeCrmCountry(data.country),
    status: normalizeStatus(data.status),
    contactName: cleanString(data.contactName),
    contactEmail: normalizeEmail(data.contactEmail),
    contactLinkedIn: cleanString(data.contactLinkedIn),
    lastContactAt: timestampToIso(data.lastContactAt) ?? null,
    notes: cleanString(data.notes),
    notesPreview:
      cleanString(data.notesPreview) || cleanString(data.notes).slice(0, 240),
    is_favorite: normalizeBoolean(data.is_favorite),
    normalizedName:
      cleanString(data.normalizedName) || normalizeName(cleanString(data.name)),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    createdByEmail: normalizeEmail(data.createdByEmail),
    updatedByEmail: normalizeEmail(data.updatedByEmail),
  };
}

function toProfessionalRecord(
  id: string,
  data: Record<string, unknown>,
): PartnershipCrmProfessionalRecord {
  const website = cleanString(data.website);
  const name = cleanString(data.name);

  return {
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    name,
    category: normalizeCrmCategory(data.category, "professionals"),
    title: cleanString(data.title),
    primaryAffiliation: cleanString(data.primaryAffiliation),
    potentialPocketGenesEditorFit: normalizePotentialPocketGenesEditorFit(
      data.potentialPocketGenesEditorFit,
    ),
    emailRoute: cleanString(data.emailRoute),
    linkedInRoute: cleanString(data.linkedInRoute),
    researchBasis: cleanString(data.researchBasis),
    website,
    websiteDomain: cleanString(data.websiteDomain) || websiteDomain(website),
    country: normalizeCrmCountry(data.country),
    status: normalizeStatus(data.status),
    email: normalizeEmail(data.email),
    linkedIn: cleanString(data.linkedIn),
    lastContactAt: timestampToIso(data.lastContactAt) ?? null,
    notes: cleanString(data.notes),
    notesPreview:
      cleanString(data.notesPreview) || cleanString(data.notes).slice(0, 240),
    is_favorite: normalizeBoolean(data.is_favorite),
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
  const audience = normalizeTemplateAudience(data.audience);

  return {
    id,
    schemaVersion:
      typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    name,
    audience,
    category: normalizeCrmPrimaryCategory(data.category, audience),
    subject: cleanString(data.subject),
    body: cleanString(data.body),
    status: normalizeTemplateStatus(data.status),
    notes: cleanString(data.notes),
    notesPreview:
      cleanString(data.notesPreview) || cleanString(data.notes).slice(0, 240),
    is_favorite: normalizeBoolean(data.is_favorite),
    normalizedName:
      cleanString(data.normalizedName) || normalizeName(cleanString(data.name)),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    createdByEmail: normalizeEmail(data.createdByEmail),
    updatedByEmail: normalizeEmail(data.updatedByEmail),
  };
}

function toSentEmailLogRecord(
  id: string,
  data: Record<string, unknown>,
): PartnershipCrmSentEmailLogRecord {
  const targetKind = cleanString(data.targetKind);

  return {
    id,
    targetKind:
      targetKind === "professionals" ? "professionals" : "organizations",
    targetId: cleanString(data.targetId),
    targetName: cleanString(data.targetName),
    from: normalizeEmail(data.from) || PARTNERSHIP_CRM_FROM_EMAIL,
    to: normalizeEmail(data.to),
    subject: cleanString(data.subject),
    body: cleanString(data.body),
    sentAt: timestampToIso(data.sentAt),
    createdAt: timestampToIso(data.createdAt),
    createdByEmail: normalizeEmail(data.createdByEmail),
    templateId: cleanString(data.templateId),
    templateName: cleanString(data.templateName),
  };
}

function toOrganizationSummary(
  record: PartnershipCrmOrganizationRecord,
): PartnershipCrmOrganizationRecord {
  return { ...record, notes: "" };
}

function toProfessionalSummary(
  record: PartnershipCrmProfessionalRecord,
): PartnershipCrmProfessionalRecord {
  return {
    ...record,
    potentialPocketGenesEditorFit: "",
    emailRoute: "",
    linkedInRoute: "",
    researchBasis: "",
    notes: "",
  };
}

function toTemplateSummary(
  record: PartnershipCrmTemplateRecord,
): PartnershipCrmTemplateRecord {
  return { ...record, body: "", notes: "" };
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

function professionalDuplicateCandidateFromRecord(
  record: PartnershipCrmProfessionalRecord,
): PartnershipCrmProfessionalDuplicateCandidate {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    linkedIn: record.linkedIn,
    website: record.website,
    websiteDomain: record.websiteDomain,
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
    linkedInState?: PartnershipCrmLinkedInState;
  },
) {
  const query = cleanString(filters.query);
  const categoryFilter = cleanString(filters.category);
  const countryFilter = cleanString(filters.country);
  const categoryKeys = crmCategoryKeys(categoryFilter);
  const recordCategoryKeys = crmCategoryKeys(record.category);
  const countryCodes = crmCountryCodes(countryFilter);
  const recordCountryCodes = crmCountryCodes(record.country);
  const status = cleanString(filters.status);
  const queryMatches = !query
    ? true
    : query.includes("@")
      ? record.contactEmail === normalizeEmail(query)
      : record.normalizedName.startsWith(normalizeName(query));

  return (
    queryMatches &&
    (!status || status === "all" || record.status === status) &&
    (categoryFilter === MISSING_CATEGORY_FILTER_VALUE
      ? recordCategoryKeys.length === 0
      : hasAnyValueOverlap(categoryKeys, recordCategoryKeys)) &&
    (countryFilter === MISSING_COUNTRY_FILTER_VALUE
      ? recordCountryCodes.length === 0
      : hasAnyValueOverlap(countryCodes, recordCountryCodes)) &&
    (!filters.linkedInState ||
      (filters.linkedInState === "has_linkedin"
        ? Boolean(record.contactLinkedIn)
        : !record.contactLinkedIn))
  );
}

function matchesProfessionalFilters(
  record: PartnershipCrmProfessionalRecord,
  filters: {
    query?: string;
    status?: string;
    category?: string;
    country?: string;
    linkedInState?: PartnershipCrmLinkedInState;
  },
) {
  const query = cleanString(filters.query);
  const categoryFilter = cleanString(filters.category);
  const countryFilter = cleanString(filters.country);
  const categoryKeys = crmCategoryKeys(categoryFilter, "professionals");
  const recordCategoryKeys = crmCategoryKeys(record.category, "professionals");
  const countryCodes = crmCountryCodes(countryFilter);
  const recordCountryCodes = crmCountryCodes(record.country);
  const status = cleanString(filters.status);
  const queryMatches = !query
    ? true
    : query.includes("@")
      ? record.email === normalizeEmail(query)
      : record.normalizedName.startsWith(normalizeName(query));

  return (
    queryMatches &&
    (!status || status === "all" || record.status === status) &&
    (categoryFilter === MISSING_CATEGORY_FILTER_VALUE
      ? recordCategoryKeys.length === 0
      : hasAnyValueOverlap(categoryKeys, recordCategoryKeys)) &&
    (countryFilter === MISSING_COUNTRY_FILTER_VALUE
      ? recordCountryCodes.length === 0
      : hasAnyValueOverlap(countryCodes, recordCountryCodes)) &&
    (!filters.linkedInState ||
      (filters.linkedInState === "has_linkedin"
        ? Boolean(record.linkedIn)
        : !record.linkedIn))
  );
}

function matchesTemplateFilters(
  record: PartnershipCrmTemplateRecord,
  filters: {
    query?: string;
    status?: string;
    category?: string;
    audience?: string;
  },
) {
  const query = cleanString(filters.query).toLowerCase();
  const audience = normalizeTemplateAudience(filters.audience);
  const hasAudienceFilter = Boolean(cleanString(filters.audience));
  const categoryKeys = crmCategoryKeys(filters.category, audience);
  const status = cleanString(filters.status);
  const searchable = [
    record.id,
    record.name,
    record.audience,
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
    (!hasAudienceFilter || record.audience === audience) &&
    hasAnyValueOverlap(
      categoryKeys,
      crmCategoryKeys(record.category, record.audience),
    )
  );
}

function favoriteFirstRecords<T extends { is_favorite: boolean }>(
  records: T[],
) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      if (left.record.is_favorite !== right.record.is_favorite) {
        return left.record.is_favorite ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map(({ record }) => record);
}

function emptyStatusCounts(): PartnershipCrmStatusCounts {
  return Object.fromEntries(
    PARTNERSHIP_CRM_STATUSES.map((status) => [status, 0]),
  ) as PartnershipCrmStatusCounts;
}

function incrementStatusCount(
  counts: PartnershipCrmStatusCounts,
  status: unknown,
) {
  const normalizedStatus = normalizeStatus(status);
  counts[normalizedStatus] += 1;
}

function linkedInStateFacetValue(
  hasLinkedIn: boolean,
): PartnershipCrmLinkedInState {
  return hasLinkedIn ? "has_linkedin" : "missing_linkedin";
}

function orderedFacetEntries(
  counts: Map<string, number>,
  orderedValues: readonly string[] = [],
) {
  const handled = new Set<string>();
  const orderedEntries = orderedValues.flatMap((value) => {
    handled.add(value);
    const count = counts.get(value) ?? 0;
    return count > 0 ? [{ value, count }] : [];
  });
  const remainingEntries = Array.from(counts.entries())
    .filter(([value, count]) => !handled.has(value) && count > 0)
    .map(([value, count]) => ({ value, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value),
    );

  return [...orderedEntries, ...remainingEntries];
}

function visualFacet(
  key: PartnershipCrmVisualFilterFacetKey,
  counts: Map<string, number>,
  orderedValues: readonly string[] = [],
): PartnershipCrmVisualFilterFacet {
  const buckets = orderedFacetEntries(counts, orderedValues);

  return {
    key,
    total: buckets.reduce((total, bucket) => total + bucket.count, 0),
    buckets,
  };
}

function visualFacetResponse(
  targetKind: PartnershipCrmTargetKind,
  counts: Record<PartnershipCrmVisualFilterFacetKey, Map<string, number>>,
): PartnershipCrmVisualFilters {
  const categoryOptions =
    targetKind === "professionals"
      ? PARTNERSHIP_CRM_PROFESSIONAL_CATEGORY_OPTIONS
      : PARTNERSHIP_CRM_ORGANIZATION_CATEGORY_OPTIONS;

  return {
    targetKind,
    facets: {
      status: visualFacet("status", counts.status, PARTNERSHIP_CRM_STATUSES),
      category: visualFacet("category", counts.category, [
        ...categoryOptions.map((option) => option.value),
        MISSING_CATEGORY_FILTER_VALUE,
      ]),
      country: visualFacet("country", counts.country, [
        MISSING_COUNTRY_FILTER_VALUE,
      ]),
      linkedInState: visualFacet("linkedInState", counts.linkedInState, [
        "has_linkedin",
        "missing_linkedin",
      ]),
    },
  };
}

function emptyVisualFacetCounts() {
  return {
    status: new Map<string, number>(),
    category: new Map<string, number>(),
    country: new Map<string, number>(),
    linkedInState: new Map<string, number>(),
  } satisfies Record<PartnershipCrmVisualFilterFacetKey, Map<string, number>>;
}

export async function getPartnershipCrmVisualFilters(
  context: AdminContext,
  targetKind: PartnershipCrmTargetKind,
): Promise<PartnershipCrmVisualFilters> {
  requireGodMode(context);
  return visualFacetResponse(targetKind, emptyVisualFacetCounts());
}

async function getOrganizationSnapshot(organizationId: string) {
  const snapshot = await adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .doc(organizationId)
    .get();

  return snapshot.exists ? snapshot : null;
}

async function getProfessionalSnapshot(professionalId: string) {
  const snapshot = await adminDb
    .collection(PROFESSIONALS_COLLECTION)
    .doc(professionalId)
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

async function templateNameForId(templateId: string) {
  if (!templateId) {
    return "";
  }

  const snapshot = await getTemplateSnapshot(templateId);
  return snapshot ? cleanString(snapshot.data()?.name) : "";
}

async function addSentEmailLog(
  context: AdminContext,
  input: {
    targetKind: PartnershipCrmTargetKind;
    targetId: string;
    targetName: string;
    to: string;
    subject: string;
    body: string;
    templateId?: string;
    templateName?: string;
  },
) {
  const ref = adminDb.collection(SENT_EMAIL_LOG_COLLECTION).doc();
  const now = new Date();
  const record = withoutUndefined({
    targetKind: input.targetKind,
    targetId: input.targetId,
    targetName: input.targetName,
    from: PARTNERSHIP_CRM_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    body: input.body,
    sentAt: now,
    createdAt: now,
    createdByEmail: context.email,
    templateId: input.templateId || undefined,
    templateName: input.templateName || undefined,
  });

  await ref.set(
    withoutUndefined({
      ...record,
      sentAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }),
  );

  return toSentEmailLogRecord(ref.id, record);
}

type PartnershipCrmActivityInput = {
  type: PartnershipCrmActivityType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: unknown;
};

function targetActivityDocument(
  context: AdminContext,
  activity: PartnershipCrmActivityInput,
) {
  return withoutUndefined({
    type: activity.type,
    title: activity.title,
    body: activity.body ?? "",
    metadata: activity.metadata,
    occurredAt: activity.occurredAt ?? FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    createdByEmail: context.email,
  });
}

async function addTargetActivity(
  collectionName: string,
  targetId: string,
  context: AdminContext,
  activity: PartnershipCrmActivityInput,
) {
  const ref = adminDb
    .collection(collectionName)
    .doc(targetId)
    .collection(ACTIVITIES_COLLECTION)
    .doc();

  const now = new Date();
  const storedDocument = targetActivityDocument(context, activity);
  await ref.set(storedDocument);

  return toActivityRecord(ref.id, {
    ...storedDocument,
    occurredAt: activity.occurredAt ?? now,
    createdAt: now,
  });
}

function addActivity(
  organizationId: string,
  context: AdminContext,
  activity: Parameters<typeof addTargetActivity>[3],
) {
  return addTargetActivity(
    ORGANIZATIONS_COLLECTION,
    organizationId,
    context,
    activity,
  );
}

function addProfessionalActivity(
  professionalId: string,
  context: AdminContext,
  activity: Parameters<typeof addTargetActivity>[3],
) {
  return addTargetActivity(
    PROFESSIONALS_COLLECTION,
    professionalId,
    context,
    activity,
  );
}

async function findDuplicateOrganizations(
  input: PartnershipCrmOrganizationInput,
) {
  const name = cleanString(input.name);
  const normalizedName = normalizeName(cleanString(input.name));
  const lookupPrefix = organizationNameLookupPrefix(normalizedName);
  const domain = websiteDomain(input.website);
  const collection = adminDb.collection(ORGANIZATIONS_COLLECTION);
  let query: Query | undefined;
  if (lookupPrefix) {
    query = collection
      .where("normalizedName", ">=", lookupPrefix)
      .where("normalizedName", "<", `${lookupPrefix}\uf8ff`)
      .orderBy("normalizedName", "asc")
      .orderBy(FieldPath.documentId(), "asc");
  } else if (domain) {
    query = collection.where("websiteDomain", "==", domain);
  }

  if (!query) {
    return [];
  }

  const snapshot = await query.limit(5).get();
  return snapshot.docs.flatMap((doc) => {
    const record = toOrganizationRecord(doc.id, doc.data());
    return organizationNamesCanReferToSameEntity(name, record.name)
      ? [duplicateCandidateFromRecord(record)]
      : [];
  });
}

async function findDuplicateProfessionals(
  input: PartnershipCrmProfessionalInput,
) {
  const name = cleanString(input.name);
  const normalizedName = normalizeName(name);
  const email = normalizeEmail(input.email);
  const domain = websiteDomain(input.website);
  const linkedIn = normalizeWebsite(input.linkedIn);
  const collection = adminDb.collection(PROFESSIONALS_COLLECTION);
  let query: Query | undefined;
  if (email) {
    query = collection.where("email", "==", email);
  } else if (linkedIn) {
    query = collection.where("linkedIn", "==", linkedIn);
  } else if (domain) {
    query = collection.where("websiteDomain", "==", domain);
  } else if (normalizedName) {
    query = collection.where("normalizedName", "==", normalizedName);
  }

  if (!query) {
    return [];
  }

  const snapshot = await query.limit(5).get();
  return snapshot.docs.flatMap((doc) => {
    const record = toProfessionalRecord(doc.id, doc.data());
    return professionalNamesCanReferToSamePerson(name, record.name)
      ? [professionalDuplicateCandidateFromRecord(record)]
      : [];
  });
}

async function findTemplateImportCandidate(
  input: PartnershipCrmTemplateInput,
) {
  const normalizedName = normalizeName(cleanString(input.name));
  if (!normalizedName) {
    return undefined;
  }

  const audience = normalizeTemplateAudience(input.audience);
  const snapshot = await adminDb
    .collection(TEMPLATES_COLLECTION)
    .where("normalizedName", "==", normalizedName)
    .limit(5)
    .get();

  return snapshot.docs.find(
    (doc) =>
      normalizeTemplateAudience(doc.data().audience) === audience,
  );
}

type BoundedCrmQuery = {
  baseQuery: Query;
  query: Query;
  cursorField: PartnershipCrmCursorField;
  hasFilters: boolean;
  hasResidualFilters: boolean;
  fingerprint: string;
};

function normalizedTargetListFingerprint(
  targetKind: PartnershipCrmTargetKind,
  options: PartnershipCrmTargetListOptions,
) {
  return cursorFingerprint({
    targetKind,
    query: cleanString(options.query).toLowerCase(),
    status: cleanString(options.status),
    category: cleanString(options.category),
    country: cleanString(options.country),
    linkedInState: options.linkedInState ?? "",
    deep: Boolean(options.deep),
  });
}

function buildTargetListQuery(
  targetKind: PartnershipCrmTargetKind,
  options: PartnershipCrmTargetListOptions,
): BoundedCrmQuery {
  const collectionName =
    targetKind === "professionals"
      ? PROFESSIONALS_COLLECTION
      : ORGANIZATIONS_COLLECTION;
  const collection = adminDb.collection(collectionName);
  const search = cleanString(options.query);
  const status = cleanString(options.status);
  const category = cleanString(options.category);
  const country = cleanString(options.country);
  const hasFilters = Boolean(
    search ||
      (status && status !== "all") ||
      category ||
      country ||
      options.linkedInState,
  );
  const activeFilterCount = [
    search,
    status && status !== "all" ? status : "",
    category,
    country,
    options.linkedInState ?? "",
  ].filter(Boolean).length;
  const fingerprint = normalizedTargetListFingerprint(targetKind, options);
  if (search && normalizeName(search).length < 3 && !search.includes("@")) {
    throw new AdminRepositoryError(
      "CRM searches require at least 3 characters.",
      400,
    );
  }
  const hasStatusFilter = Boolean(status && status !== "all");
  let cursorField: PartnershipCrmCursorField = "updatedAt";
  let query: Query;

  // Firestore cannot combine arbitrary substring predicates without a
  // dedicated search service or a large family of composite indexes. Choose
  // one selective, single-field anchor so every document read already matches
  // the operator's strongest filter, then apply any remaining filters inside
  // the bounded page scan. Category and country use primary-value prefix
  // semantics because legacy documents store comma-separated canonical keys.
  if (search) {
    if (search.includes("@")) {
      const emailField =
        targetKind === "professionals" ? "email" : "contactEmail";
      cursorField = "documentId";
      query = collection
        .where(emailField, "==", normalizeEmail(search))
        .orderBy(FieldPath.documentId(), "asc");
    } else {
      const normalizedSearch = normalizeName(search);
      cursorField = "normalizedName";
      query = collection
        .where("normalizedName", ">=", normalizedSearch)
        .where("normalizedName", "<", `${normalizedSearch}\uf8ff`)
        .orderBy("normalizedName", "asc")
        .orderBy(FieldPath.documentId(), "asc");
    }
  } else if (category) {
    if (category === MISSING_CATEGORY_FILTER_VALUE) {
      cursorField = "documentId";
      query = collection
        .where("category", "==", "")
        .orderBy(FieldPath.documentId(), "asc");
    } else {
      const primaryCategory = normalizeCrmPrimaryCategory(
        category,
        targetKind,
      );
      if (!primaryCategory) {
        throw new AdminRepositoryError("CRM category filter is invalid.", 400);
      }
      cursorField = "category";
      query = collection
        .where("category", ">=", primaryCategory)
        .where("category", "<", `${primaryCategory}\uf8ff`)
        .orderBy("category", "asc")
        .orderBy(FieldPath.documentId(), "asc");
    }
  } else if (country) {
    if (country === MISSING_COUNTRY_FILTER_VALUE) {
      cursorField = "documentId";
      query = collection
        .where("country", "==", "")
        .orderBy(FieldPath.documentId(), "asc");
    } else {
      const primaryCountry = crmCountryCodes(country)[0] ?? "";
      if (!primaryCountry) {
        throw new AdminRepositoryError("CRM country filter is invalid.", 400);
      }
      cursorField = "country";
      query = collection
        .where("country", ">=", primaryCountry)
        .where("country", "<", `${primaryCountry}\uf8ff`)
        .orderBy("country", "asc")
        .orderBy(FieldPath.documentId(), "asc");
    }
  } else if (hasStatusFilter) {
    cursorField = "documentId";
    query = collection
      .where("status", "==", status)
      .orderBy(FieldPath.documentId(), "asc");
  } else if (options.linkedInState) {
    const linkedInField =
      targetKind === "professionals" ? "linkedIn" : "contactLinkedIn";
    if (options.linkedInState === "missing_linkedin") {
      cursorField = "documentId";
      query = collection
        .where(linkedInField, "==", "")
        .orderBy(FieldPath.documentId(), "asc");
    } else {
      cursorField = linkedInField;
      query = collection
        .where(linkedInField, ">", "")
        .orderBy(linkedInField, "asc")
        .orderBy(FieldPath.documentId(), "asc");
    }
  } else {
    query = collection
      .orderBy("updatedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
  }

  return {
    baseQuery: query,
    query: applyCursor(query, options.cursor, cursorField, fingerprint),
    cursorField,
    hasFilters,
    hasResidualFilters: activeFilterCount > 1,
    fingerprint,
  };
}

function templateListFingerprint(options: {
  query?: string;
  status?: string;
  category?: string;
  audience?: string;
  deep?: boolean;
}) {
  return cursorFingerprint({
    query: cleanString(options.query).toLowerCase(),
    status: cleanString(options.status),
    category: cleanString(options.category),
    audience: cleanString(options.audience),
    deep: Boolean(options.deep),
  });
}

function buildTemplateListQuery(options: {
  cursor?: string;
  query?: string;
  status?: string;
  category?: string;
  audience?: string;
  deep?: boolean;
}): BoundedCrmQuery {
  const collection = adminDb.collection(TEMPLATES_COLLECTION);
  const search = cleanString(options.query);
  const status = cleanString(options.status);
  const category = cleanString(options.category);
  const audience = cleanString(options.audience);
  const hasFilters = Boolean(
    search || (status && status !== "all") || category || audience,
  );
  const fingerprint = templateListFingerprint(options);
  if (search && normalizeName(search).length < 3) {
    throw new AdminRepositoryError(
      "Template searches require at least 3 characters.",
      400,
    );
  }
  const cursorField: PartnershipCrmCursorField = "updatedAt";
  const query = collection
    .orderBy("updatedAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  return {
    baseQuery: query,
    query: applyCursor(query, options.cursor, cursorField, fingerprint),
    cursorField,
    hasFilters,
    hasResidualFilters: hasFilters,
    fingerprint,
  };
}

function pageStatusCounts(
  records: ReadonlyArray<{ status: PartnershipCrmStatus }>,
) {
  const counts = emptyStatusCounts();
  records.forEach((record) => incrementStatusCount(counts, record.status));
  return counts;
}

async function scanPartnershipCrmTargetPage<T>({
  built,
  limit,
  summaryFields,
  readFullDocuments,
  toRecord,
  matches,
}: {
  built: BoundedCrmQuery;
  limit: number;
  summaryFields: readonly string[];
  readFullDocuments: boolean;
  toRecord: (doc: QueryDocumentSnapshot) => T;
  matches: (record: T) => boolean;
}) {
  const scanLimit = built.hasFilters
    ? FILTERED_TARGET_SCAN_LIMIT
    : limit + 1;
  const projectQuery = (query: Query) =>
    readFullDocuments ? query : query.select(...summaryFields);
  let sourceQuery = projectQuery(built.query);
  const records: T[] = [];
  let scanned = 0;
  let lastConsumedDoc: QueryDocumentSnapshot | undefined;
  let continuationCursorDoc: QueryDocumentSnapshot | undefined;
  let sourceMayContinue = false;
  let truncated = false;
  let foundLookaheadMatch = false;

  while (scanned < scanLimit) {
    const remainingScanBudget = scanLimit - scanned;
    const batchLimit = Math.min(
      built.hasFilters && built.hasResidualFilters
        ? FILTERED_BATCH_LIMIT
        : limit + 1,
      remainingScanBudget,
    );
    const snapshot = await sourceQuery.limit(batchLimit).get();
    scanned += snapshot.docs.length;

    for (const doc of snapshot.docs) {
      const previousConsumedDoc = lastConsumedDoc;
      lastConsumedDoc = doc;
      const record = toRecord(doc);
      if (matches(record)) {
        if (records.length < limit) {
          records.push(record);
        } else {
          // Resume immediately before the first unreturned match. This skips
          // only source records already proven not to match and never skips
          // the lookahead result itself.
          continuationCursorDoc = previousConsumedDoc;
          foundLookaheadMatch = true;
          break;
        }
      }
    }

    if (foundLookaheadMatch) {
      sourceMayContinue = true;
      break;
    }
    if (snapshot.docs.length < batchLimit) {
      sourceMayContinue = false;
      break;
    }
    if (scanned >= scanLimit) {
      sourceMayContinue = true;
      continuationCursorDoc = lastConsumedDoc;
      truncated = built.hasFilters;
      break;
    }
    if (!lastConsumedDoc) {
      sourceMayContinue = false;
      break;
    }

    sourceQuery = projectQuery(built.baseQuery.startAfter(lastConsumedDoc));
  }

  return {
    records,
    scanned,
    nextCursor:
      sourceMayContinue && continuationCursorDoc
        ? encodeCursor(
            continuationCursorDoc,
            built.cursorField,
            built.fingerprint,
          )
        : undefined,
    partial: truncated,
  };
}

function requireSingleImportRow(rows: readonly unknown[]) {
  if (rows.length !== 1) {
    throw new AdminRepositoryError(
      "CRM imports process exactly one row per request.",
      400,
    );
  }
}

function importIdempotencyDocumentId(
  targetKind: PartnershipCrmTargetKind,
  value: unknown,
) {
  const key = cleanString(value);
  if (!key) {
    return undefined;
  }
  if (key.length > 200) {
    throw new AdminRepositoryError(
      "CRM import idempotency keys must be 200 characters or fewer.",
      400,
    );
  }

  const digest = createHash("sha256")
    .update(`${targetKind}\0${key}`, "utf8")
    .digest("hex");
  const prefix = targetKind === "organizations" ? "org" : "pro";
  return `crm_import_${prefix}_${digest}`;
}

export async function listPartnershipCrmTemplates(
  context: AdminContext,
  options: {
    cursor?: string;
    limit?: unknown;
    query?: string;
    status?: string;
    category?: string;
    audience?: string;
    deep?: boolean;
  } = {},
): Promise<PartnershipCrmTemplatesPage> {
  requireGodMode(context);

  const limit = normalizeLimit(options.limit);
  const built = buildTemplateListQuery(options);
  const scanLimit = options.deep ? FILTERED_BATCH_LIMIT : limit + 1;
  const listQuery = options.deep
    ? built.query
    : built.query.select(...TEMPLATE_SUMMARY_FIELDS);
  const snapshot = await listQuery.limit(scanLimit).get();
  const templates: PartnershipCrmTemplateRecord[] = [];
  let lastConsumedDoc: QueryDocumentSnapshot | undefined;
  let consumed = 0;
  for (const doc of snapshot.docs) {
    lastConsumedDoc = doc;
    consumed += 1;
    const template = toTemplateRecord(doc.id, doc.data());
    if (matchesTemplateFilters(template, options)) {
      templates.push(toTemplateSummary(template));
      if (templates.length >= limit) {
        break;
      }
    }
  }

  const canContinue =
    consumed < snapshot.docs.length || snapshot.docs.length === scanLimit;
  const nextCursor =
    canContinue && lastConsumedDoc
      ? encodeCursor(lastConsumedDoc, built.cursorField, built.fingerprint)
      : undefined;

  return {
    templates: favoriteFirstRecords(templates),
    nextCursor,
    partial: built.hasFilters,
    scanned: snapshot.docs.length,
    asOf: new Date().toISOString(),
  };
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
  const now = new Date();
  await ref.set(
    withoutUndefined({
      ...document,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByEmail: context.email,
      updatedByEmail: context.email,
    }),
  );

  return toTemplateRecord(ref.id, {
    ...document,
    createdAt: now,
    updatedAt: now,
    createdByEmail: context.email,
    updatedByEmail: context.email,
  });
}

export async function importPartnershipCrmTemplate(
  context: AdminContext,
  input: PartnershipCrmTemplateInput,
): Promise<{
  action: "created" | "updated";
  template: PartnershipCrmTemplateRecord;
}> {
  requireGodMode(context);
  const incomingDocument = templateDocument(input);
  const normalizedName = cleanString(incomingDocument.normalizedName);
  const incomingSubject = cleanString(incomingDocument.subject);
  const incomingBody = cleanString(incomingDocument.body);
  if (!cleanString(incomingDocument.name)) {
    throw new AdminRepositoryError("Template name is required.", 400);
  }
  if (!incomingSubject) {
    throw new AdminRepositoryError("Template subject is required.", 400);
  }
  if (!incomingBody) {
    throw new AdminRepositoryError("Template body is required.", 400);
  }

  const candidate = await findTemplateImportCandidate(input);
  if (!candidate) {
    return {
      action: "created",
      template: await createPartnershipCrmTemplate(context, input),
    };
  }

  const expectedAudience = normalizeTemplateAudience(input.audience);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(candidate.ref);
    if (!snapshot.exists) {
      throw new AdminRepositoryError(
        "The matching template changed during import. Try again.",
        409,
      );
    }

    const existingData = recordData(snapshot.data());
    const existing = toTemplateRecord(candidate.id, existingData);
    if (
      existing.normalizedName !== normalizedName ||
      existing.audience !== expectedAudience
    ) {
      throw new AdminRepositoryError(
        "The matching template changed during import. Try again.",
        409,
      );
    }

    const updates = {
      subject: incomingSubject || existing.subject,
      body: incomingBody || existing.body,
      notes: mergeTemplateImportNotes(existing.notes, input.notes),
      is_favorite: Boolean(existing.is_favorite || input.is_favorite),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    };
    transaction.update(candidate.ref, updates);

    return {
      action: "updated" as const,
      template: toTemplateRecord(candidate.id, {
        ...existingData,
        ...updates,
        updatedAt: new Date(),
      }),
    };
  });
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

  return toTemplateRecord(templateId, {
    ...document,
    createdAt: snapshot.data()?.createdAt,
    createdByEmail: snapshot.data()?.createdByEmail,
    updatedAt: new Date(),
    updatedByEmail: context.email,
  });
}

export async function updatePartnershipCrmTemplateFavorite(
  context: AdminContext,
  templateId: string,
  isFavorite: boolean,
) {
  requireGodMode(context);
  const reference = adminDb.collection(TEMPLATES_COLLECTION).doc(templateId);

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new AdminRepositoryError("CRM template not found.", 404);
    }

    const data = snapshot.data() ?? {};
    if (normalizeBoolean(data.is_favorite) === isFavorite) {
      return toTemplateRecord(templateId, data);
    }

    transaction.update(reference, {
      is_favorite: isFavorite,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    });

    return toTemplateRecord(templateId, {
      ...data,
      is_favorite: isFavorite,
      updatedAt: new Date(),
      updatedByEmail: context.email,
    });
  });
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
  options: PartnershipCrmTargetListOptions = {},
): Promise<PartnershipCrmOrganizationsPage> {
  requireGodMode(context);

  const limit = normalizeTargetLimit(options.limit);
  const built = buildTargetListQuery("organizations", options);
  const page = await scanPartnershipCrmTargetPage({
    built,
    limit,
    summaryFields: ORGANIZATION_SUMMARY_FIELDS,
    readFullDocuments: false,
    toRecord: (doc) => toOrganizationRecord(doc.id, doc.data()),
    matches: (organization) => matchesFilters(organization, options),
  });
  const organizations = page.records.map(toOrganizationSummary);

  return {
    organizations: favoriteFirstRecords(organizations),
    nextCursor: page.nextCursor,
    statusCounts: pageStatusCounts(organizations),
    partial: page.partial,
    scanned: page.scanned,
    asOf: new Date().toISOString(),
  };
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
  const now = new Date();
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

  return toOrganizationRecord(ref.id, {
    ...document,
    createdAt: now,
    updatedAt: now,
    createdByEmail: context.email,
    updatedByEmail: context.email,
  });
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

  return toOrganizationRecord(organizationId, {
    ...document,
    createdAt: snapshot.data()?.createdAt,
    createdByEmail: snapshot.data()?.createdByEmail,
    updatedAt: new Date(),
    updatedByEmail: context.email,
  });
}

export async function updatePartnershipCrmOrganizationStatus(
  context: AdminContext,
  organizationId: string,
  status: PartnershipCrmStatus,
) {
  requireGodMode(context);
  const reference = adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .doc(organizationId);
  const activityReference = reference.collection(ACTIVITIES_COLLECTION).doc();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new AdminRepositoryError("CRM organization not found.", 404);
    }

    const previousStatus = normalizeStatus(snapshot.data()?.status);
    if (previousStatus === status) {
      return toOrganizationRecord(organizationId, snapshot.data() ?? {});
    }

    transaction.update(reference, {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    });
    transaction.set(
      activityReference,
      targetActivityDocument(context, {
        type: "status",
        title: `Status changed to ${status}`,
        body: `Previous status: ${previousStatus}`,
        metadata: { previousStatus, nextStatus: status },
      }),
    );
    return toOrganizationRecord(organizationId, {
      ...(snapshot.data() ?? {}),
      status,
      updatedAt: new Date(),
      updatedByEmail: context.email,
    });
  });
}

export async function updatePartnershipCrmOrganizationFavorite(
  context: AdminContext,
  organizationId: string,
  isFavorite: boolean,
) {
  requireGodMode(context);
  const reference = adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .doc(organizationId);
  const activityReference = reference.collection(ACTIVITIES_COLLECTION).doc();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new AdminRepositoryError("CRM organization not found.", 404);
    }

    const data = snapshot.data() ?? {};
    if (normalizeBoolean(data.is_favorite) === isFavorite) {
      return toOrganizationRecord(organizationId, data);
    }

    transaction.update(reference, {
      is_favorite: isFavorite,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    });
    transaction.set(
      activityReference,
      targetActivityDocument(context, {
        type: "updated",
        title: isFavorite
          ? "Organization marked as favorite"
          : "Organization unmarked as favorite",
      }),
    );

    return toOrganizationRecord(organizationId, {
      ...data,
      is_favorite: isFavorite,
      updatedAt: new Date(),
      updatedByEmail: context.email,
    });
  });
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

export async function listPartnershipCrmProfessionals(
  context: AdminContext,
  options: PartnershipCrmTargetListOptions = {},
): Promise<PartnershipCrmProfessionalsPage> {
  requireGodMode(context);

  const limit = normalizeTargetLimit(options.limit);
  const built = buildTargetListQuery("professionals", options);
  const page = await scanPartnershipCrmTargetPage({
    built,
    limit,
    summaryFields: PROFESSIONAL_SUMMARY_FIELDS,
    readFullDocuments: false,
    toRecord: (doc) => toProfessionalRecord(doc.id, doc.data()),
    matches: (professional) =>
      matchesProfessionalFilters(professional, options),
  });
  const professionals = page.records.map(toProfessionalSummary);

  return {
    professionals: favoriteFirstRecords(professionals),
    nextCursor: page.nextCursor,
    statusCounts: pageStatusCounts(professionals),
    partial: page.partial,
    scanned: page.scanned,
    asOf: new Date().toISOString(),
  };
}

export async function getPartnershipCrmProfessional(
  context: AdminContext,
  professionalId: string,
) {
  requireGodMode(context);
  const snapshot = await getProfessionalSnapshot(professionalId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM professional not found.", 404);
  }

  return toProfessionalRecord(professionalId, snapshot.data() ?? {});
}

export async function createPartnershipCrmProfessional(
  context: AdminContext,
  input: PartnershipCrmProfessionalInput,
) {
  requireGodMode(context);
  const document = professionalDocument(input);
  if (!cleanString(document.name)) {
    throw new AdminRepositoryError("Professional name is required.", 400);
  }

  const ref = adminDb.collection(PROFESSIONALS_COLLECTION).doc();
  const now = new Date();
  await ref.set(
    withoutUndefined({
      ...document,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByEmail: context.email,
      updatedByEmail: context.email,
    }),
  );
  await addProfessionalActivity(ref.id, context, {
    type: "created",
    title: "Professional created",
    body: cleanString(input.notes),
  });

  return toProfessionalRecord(ref.id, {
    ...document,
    createdAt: now,
    updatedAt: now,
    createdByEmail: context.email,
    updatedByEmail: context.email,
  });
}

export async function updatePartnershipCrmProfessional(
  context: AdminContext,
  professionalId: string,
  input: PartnershipCrmProfessionalInput,
) {
  requireGodMode(context);
  const snapshot = await getProfessionalSnapshot(professionalId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM professional not found.", 404);
  }

  const previous = toProfessionalRecord(professionalId, snapshot.data() ?? {});
  const document = professionalDocument(input);
  if (!cleanString(document.name)) {
    throw new AdminRepositoryError("Professional name is required.", 400);
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
    await addProfessionalActivity(professionalId, context, {
      type: "status",
      title: `Status changed to ${nextStatus}`,
      body: `Previous status: ${previous.status}`,
      metadata: { previousStatus: previous.status, nextStatus },
    });
  } else {
    await addProfessionalActivity(professionalId, context, {
      type: "updated",
      title: "Professional updated",
    });
  }

  return toProfessionalRecord(professionalId, {
    ...document,
    createdAt: snapshot.data()?.createdAt,
    createdByEmail: snapshot.data()?.createdByEmail,
    updatedAt: new Date(),
    updatedByEmail: context.email,
  });
}

export async function updatePartnershipCrmProfessionalStatus(
  context: AdminContext,
  professionalId: string,
  status: PartnershipCrmStatus,
) {
  requireGodMode(context);
  const reference = adminDb
    .collection(PROFESSIONALS_COLLECTION)
    .doc(professionalId);
  const activityReference = reference.collection(ACTIVITIES_COLLECTION).doc();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new AdminRepositoryError("CRM professional not found.", 404);
    }

    const previousStatus = normalizeStatus(snapshot.data()?.status);
    if (previousStatus === status) {
      return toProfessionalRecord(professionalId, snapshot.data() ?? {});
    }

    transaction.update(reference, {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    });
    transaction.set(
      activityReference,
      targetActivityDocument(context, {
        type: "status",
        title: `Status changed to ${status}`,
        body: `Previous status: ${previousStatus}`,
        metadata: { previousStatus, nextStatus: status },
      }),
    );
    return toProfessionalRecord(professionalId, {
      ...(snapshot.data() ?? {}),
      status,
      updatedAt: new Date(),
      updatedByEmail: context.email,
    });
  });
}

export async function updatePartnershipCrmProfessionalFavorite(
  context: AdminContext,
  professionalId: string,
  isFavorite: boolean,
) {
  requireGodMode(context);
  const reference = adminDb
    .collection(PROFESSIONALS_COLLECTION)
    .doc(professionalId);
  const activityReference = reference.collection(ACTIVITIES_COLLECTION).doc();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new AdminRepositoryError("CRM professional not found.", 404);
    }

    const data = snapshot.data() ?? {};
    if (normalizeBoolean(data.is_favorite) === isFavorite) {
      return toProfessionalRecord(professionalId, data);
    }

    transaction.update(reference, {
      is_favorite: isFavorite,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    });
    transaction.set(
      activityReference,
      targetActivityDocument(context, {
        type: "updated",
        title: isFavorite
          ? "Professional marked as favorite"
          : "Professional unmarked as favorite",
      }),
    );

    return toProfessionalRecord(professionalId, {
      ...data,
      is_favorite: isFavorite,
      updatedAt: new Date(),
      updatedByEmail: context.email,
    });
  });
}

export async function deletePartnershipCrmProfessional(
  context: AdminContext,
  professionalId: string,
) {
  requireGodMode(context);
  const snapshot = await getProfessionalSnapshot(professionalId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM professional not found.", 404);
  }

  await snapshot.ref.delete();
}

export async function listPartnershipCrmActivities(
  context: AdminContext,
  organizationId: string,
  options: { cursor?: string; limit?: unknown } = {},
): Promise<PartnershipCrmActivitiesPage> {
  requireGodMode(context);
  const limit = normalizeLimit(options.limit);
  const fingerprint = cursorFingerprint({
    type: "organization-activities",
    organizationId,
  });
  let query: Query = adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .doc(organizationId)
    .collection(ACTIVITIES_COLLECTION)
    .orderBy("occurredAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  query = applyCursor(query, options.cursor, "occurredAt", fingerprint);

  const snapshot = await query.limit(limit + 1).get();
  const visibleDocs = snapshot.docs.slice(0, limit);
  const activities = visibleDocs.map((doc) =>
    toActivityRecord(doc.id, doc.data()),
  );
  const lastVisible = visibleDocs[visibleDocs.length - 1];
  const nextCursor =
    snapshot.docs.length > limit && lastVisible
      ? encodeCursor(lastVisible, "occurredAt", fingerprint)
      : undefined;

  return { activities, nextCursor, asOf: new Date().toISOString() };
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

export async function listPartnershipCrmProfessionalActivities(
  context: AdminContext,
  professionalId: string,
  options: { cursor?: string; limit?: unknown } = {},
): Promise<PartnershipCrmActivitiesPage> {
  requireGodMode(context);
  const limit = normalizeLimit(options.limit);
  const fingerprint = cursorFingerprint({
    type: "professional-activities",
    professionalId,
  });
  let query: Query = adminDb
    .collection(PROFESSIONALS_COLLECTION)
    .doc(professionalId)
    .collection(ACTIVITIES_COLLECTION)
    .orderBy("occurredAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  query = applyCursor(query, options.cursor, "occurredAt", fingerprint);

  const snapshot = await query.limit(limit + 1).get();
  const visibleDocs = snapshot.docs.slice(0, limit);
  const activities = visibleDocs.map((doc) =>
    toActivityRecord(doc.id, doc.data()),
  );
  const lastVisible = visibleDocs[visibleDocs.length - 1];
  const nextCursor =
    snapshot.docs.length > limit && lastVisible
      ? encodeCursor(lastVisible, "occurredAt", fingerprint)
      : undefined;

  return { activities, nextCursor, asOf: new Date().toISOString() };
}

export async function createPartnershipCrmProfessionalActivity(
  context: AdminContext,
  professionalId: string,
  input: { title: string; body?: string; type?: PartnershipCrmActivityType },
) {
  requireGodMode(context);
  const professional = await getProfessionalSnapshot(professionalId);
  if (!professional) {
    throw new AdminRepositoryError("CRM professional not found.", 404);
  }

  const title = cleanString(input.title);
  if (!title) {
    throw new AdminRepositoryError("Activity title is required.", 400);
  }

  await professional.ref.set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    },
    { merge: true },
  );

  return addProfessionalActivity(professionalId, context, {
    type: input.type ?? "note",
    title,
    body: cleanString(input.body),
  });
}

export async function listPartnershipCrmSentEmailLog(
  context: AdminContext,
  options: { cursor?: string; limit?: unknown } = {},
): Promise<PartnershipCrmSentEmailLogsPage> {
  requireGodMode(context);

  const limit = normalizeLimit(options.limit);
  const fingerprint = cursorFingerprint({ type: "sent-email-log" });
  let query = adminDb
    .collection(SENT_EMAIL_LOG_COLLECTION)
    .orderBy("sentAt", "desc")
    .orderBy(FieldPath.documentId(), "desc")
    .select(...SENT_EMAIL_LOG_SUMMARY_FIELDS);
  query = applyCursor(query, options.cursor, "sentAt", fingerprint);

  const snapshot = await query.limit(limit + 1).get();
  const visibleDocs = snapshot.docs.slice(0, limit);
  const emails = visibleDocs.map((doc) =>
    toSentEmailLogRecord(doc.id, doc.data()),
  );
  const lastVisible = visibleDocs[visibleDocs.length - 1];
  const nextCursor =
    snapshot.docs.length > limit && lastVisible
      ? encodeCursor(lastVisible, "sentAt", fingerprint)
      : undefined;

  return { emails, nextCursor, asOf: new Date().toISOString() };
}

export async function getPartnershipCrmSentEmailLog(
  context: AdminContext,
  emailLogId: string,
): Promise<PartnershipCrmSentEmailLogRecord> {
  requireGodMode(context);

  const normalizedId = cleanString(emailLogId);
  if (!normalizedId) {
    throw new AdminRepositoryError("CRM sent email log id is required.", 400);
  }

  const snapshot = await adminDb
    .collection(SENT_EMAIL_LOG_COLLECTION)
    .doc(normalizedId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("CRM sent email log not found.", 404);
  }

  return toSentEmailLogRecord(snapshot.id, snapshot.data() ?? {});
}

async function createIdempotentImportedOrganization(
  context: AdminContext,
  documentId: string,
  document: Record<string, unknown>,
) {
  const reference = adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .doc(documentId);
  const now = new Date();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists) {
      return {
        created: false,
        record: toOrganizationRecord(documentId, snapshot.data() ?? {}),
      };
    }

    const storedDocument = withoutUndefined({
      ...document,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByEmail: context.email,
      updatedByEmail: context.email,
    });
    transaction.set(reference, storedDocument);
    return {
      created: true,
      record: toOrganizationRecord(documentId, {
        ...document,
        createdAt: now,
        updatedAt: now,
        createdByEmail: context.email,
        updatedByEmail: context.email,
      }),
    };
  });
}

async function createIdempotentImportedProfessional(
  context: AdminContext,
  documentId: string,
  document: Record<string, unknown>,
) {
  const reference = adminDb
    .collection(PROFESSIONALS_COLLECTION)
    .doc(documentId);
  const now = new Date();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists) {
      return {
        created: false,
        record: toProfessionalRecord(documentId, snapshot.data() ?? {}),
      };
    }

    const storedDocument = withoutUndefined({
      ...document,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByEmail: context.email,
      updatedByEmail: context.email,
    });
    transaction.set(reference, storedDocument);
    return {
      created: true,
      record: toProfessionalRecord(documentId, {
        ...document,
        createdAt: now,
        updatedAt: now,
        createdByEmail: context.email,
        updatedByEmail: context.email,
      }),
    };
  });
}

export async function previewPartnershipCrmImport(
  context: AdminContext,
  rows: PartnershipCrmImportRowInput[],
): Promise<PartnershipCrmImportPreview> {
  requireGodMode(context);
  requireSingleImportRow(rows);
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
        is_favorite: normalizeBoolean(organization.is_favorite),
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
  requireSingleImportRow(rows);
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

      const idempotentDocumentId = importIdempotencyDocumentId(
        "organizations",
        row.idempotencyKey,
      );
      if (idempotentDocumentId) {
        const replaySnapshot = await adminDb
          .collection(ORGANIZATIONS_COLLECTION)
          .doc(idempotentDocumentId)
          .get();
        if (replaySnapshot.exists) {
          results.push({
            rowId,
            action: "created",
            organizationId: idempotentDocumentId,
          });
          continue;
        }
      }

      const requestedDuplicateId = cleanString(row.duplicateOrganizationId);
      const duplicateCandidates = requestedDuplicateId
        ? []
        : await findDuplicateOrganizations(row);
      const duplicateId = requestedDuplicateId || duplicateCandidates[0]?.id;
      const duplicateAction =
        duplicateCandidates.length > 0 || duplicateId
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

      if (
        (duplicateAction === "update" ||
          duplicateAction === "fill_missing" ||
          duplicateAction === "replace_variables") &&
        duplicateId
      ) {
        const existing = await getOrganizationSnapshot(duplicateId);
        if (!existing) {
          results.push({
            rowId,
            action: "invalid",
            reason: "Duplicate target was not found.",
          });
          continue;
        }

        const existingData = recordData(existing.data());
        const nextDocument =
          duplicateAction === "fill_missing"
            ? fillMissingCrmDocumentFields(existingData, document)
            : duplicateAction === "replace_variables"
              ? fillMissingAndReplaceCrmVariableFields(
                  existingData,
                  document,
                  "organizations",
                )
              : document;
        await existing.ref.set(
          withoutUndefined({
            ...nextDocument,
            createdAt: existingData.createdAt,
            createdByEmail: existingData.createdByEmail,
            updatedAt: FieldValue.serverTimestamp(),
            updatedByEmail: context.email,
          }),
        );
        await addActivity(duplicateId, context, {
          type: "import",
          title:
            duplicateAction === "fill_missing"
              ? "CSV row filled missing fields on this organization"
              : duplicateAction === "replace_variables"
                ? "CSV row replaced variable fields on this organization"
                : "CSV row updated this organization",
          body: cleanString(row.notes),
        });
        results.push({ rowId, action: "updated", organizationId: duplicateId });
        continue;
      }

      let created: PartnershipCrmOrganizationRecord;
      if (idempotentDocumentId) {
        const idempotentCreate = await createIdempotentImportedOrganization(
          context,
          idempotentDocumentId,
          document,
        );
        created = idempotentCreate.record;
        if (idempotentCreate.created) {
          await addActivity(created.id, context, {
            type: "created",
            title: "Organization created",
            body: cleanString(row.notes),
          });
          await addActivity(created.id, context, {
            type: "import",
            title: "Imported from CSV",
            body: cleanString(row.notes),
          });
        }
      } else {
        created = await createPartnershipCrmOrganization(context, row);
        await addActivity(created.id, context, {
          type: "import",
          title: "Imported from CSV",
          body: cleanString(row.notes),
        });
      }
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

export async function previewPartnershipCrmProfessionalImport(
  context: AdminContext,
  rows: PartnershipCrmProfessionalImportRowInput[],
): Promise<PartnershipCrmProfessionalImportPreview> {
  requireGodMode(context);
  requireSingleImportRow(rows);
  const previews: PartnershipCrmProfessionalImportPreviewRow[] = [];

  for (const [index, row] of rows.entries()) {
    const professional = professionalDocument(row);
    const name = cleanString(professional.name);
    const errors = name ? [] : ["Professional name is required."];
    const duplicateCandidates = name
      ? await findDuplicateProfessionals(row)
      : [];

    previews.push({
      rowId: row.rowId ?? `row-${index + 1}`,
      professional: {
        name,
        category: cleanString(professional.category),
        title: cleanString(professional.title),
        primaryAffiliation: cleanString(professional.primaryAffiliation),
        potentialPocketGenesEditorFit: normalizePotentialPocketGenesEditorFit(
          professional.potentialPocketGenesEditorFit,
        ),
        emailRoute: cleanString(professional.emailRoute),
        linkedInRoute: cleanString(professional.linkedInRoute),
        researchBasis: cleanString(professional.researchBasis),
        website: cleanString(professional.website),
        country: cleanString(professional.country),
        status: normalizeStatus(professional.status),
        email: normalizeEmail(professional.email),
        linkedIn: cleanString(professional.linkedIn),
        lastContactAt: timestampToIso(professional.lastContactAt) ?? null,
        notes: cleanString(professional.notes),
        is_favorite: normalizeBoolean(professional.is_favorite),
      },
      valid: errors.length === 0,
      errors,
      missingEmail: !normalizeEmail(professional.email),
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

export async function importPartnershipCrmProfessionals(
  context: AdminContext,
  rows: PartnershipCrmProfessionalImportRowInput[],
) {
  requireGodMode(context);
  requireSingleImportRow(rows);
  const results: Array<{
    rowId: string;
    action: "created" | "updated" | "skipped" | "invalid";
    professionalId?: string;
    reason?: string;
  }> = [];

  for (const [index, row] of rows.entries()) {
    const rowId = row.rowId ?? `row-${index + 1}`;
    try {
      const document = professionalDocument(row);
      const name = cleanString(document.name);

      if (!name) {
        results.push({
          rowId,
          action: "invalid",
          reason: "Professional name is required.",
        });
        continue;
      }

      const idempotentDocumentId = importIdempotencyDocumentId(
        "professionals",
        row.idempotencyKey,
      );
      if (idempotentDocumentId) {
        const replaySnapshot = await adminDb
          .collection(PROFESSIONALS_COLLECTION)
          .doc(idempotentDocumentId)
          .get();
        if (replaySnapshot.exists) {
          results.push({
            rowId,
            action: "created",
            professionalId: idempotentDocumentId,
          });
          continue;
        }
      }

      const requestedDuplicateId = cleanString(row.duplicateProfessionalId);
      const duplicateCandidates = requestedDuplicateId
        ? []
        : await findDuplicateProfessionals(row);
      const duplicateId = requestedDuplicateId || duplicateCandidates[0]?.id;
      const duplicateAction =
        duplicateCandidates.length > 0 || duplicateId
          ? (row.duplicateAction ?? "skip")
          : "import";

      if (duplicateAction === "skip") {
        results.push({
          rowId,
          action: "skipped",
          professionalId: duplicateId,
          reason: duplicateId ? "Possible duplicate skipped." : "Skipped.",
        });
        continue;
      }

      if (
        (duplicateAction === "update" ||
          duplicateAction === "fill_missing" ||
          duplicateAction === "replace_variables") &&
        duplicateId
      ) {
        const existing = await getProfessionalSnapshot(duplicateId);
        if (!existing) {
          results.push({
            rowId,
            action: "invalid",
            reason: "Duplicate target was not found.",
          });
          continue;
        }

        const existingData = recordData(existing.data());
        const nextDocument =
          duplicateAction === "fill_missing"
            ? fillMissingCrmDocumentFields(existingData, document)
            : duplicateAction === "replace_variables"
              ? fillMissingAndReplaceCrmVariableFields(
                  existingData,
                  document,
                  "professionals",
                )
              : document;
        await existing.ref.set(
          withoutUndefined({
            ...nextDocument,
            createdAt: existingData.createdAt,
            createdByEmail: existingData.createdByEmail,
            updatedAt: FieldValue.serverTimestamp(),
            updatedByEmail: context.email,
          }),
        );
        await addProfessionalActivity(duplicateId, context, {
          type: "import",
          title:
            duplicateAction === "fill_missing"
              ? "CSV row filled missing fields on this professional"
              : duplicateAction === "replace_variables"
                ? "CSV row replaced variable fields on this professional"
                : "CSV row updated this professional",
          body: cleanString(row.notes),
        });
        results.push({ rowId, action: "updated", professionalId: duplicateId });
        continue;
      }

      let created: PartnershipCrmProfessionalRecord;
      if (idempotentDocumentId) {
        const idempotentCreate = await createIdempotentImportedProfessional(
          context,
          idempotentDocumentId,
          document,
        );
        created = idempotentCreate.record;
        if (idempotentCreate.created) {
          await addProfessionalActivity(created.id, context, {
            type: "created",
            title: "Professional created",
            body: cleanString(row.notes),
          });
          await addProfessionalActivity(created.id, context, {
            type: "import",
            title: "Imported from CSV",
            body: cleanString(row.notes),
          });
        }
      } else {
        created = await createPartnershipCrmProfessional(context, row);
        await addProfessionalActivity(created.id, context, {
          type: "import",
          title: "Imported from CSV",
          body: cleanString(row.notes),
        });
      }
      results.push({ rowId, action: "created", professionalId: created.id });
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
    html?: string;
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
  const html = cleanString(input.html);

  if (!to) {
    throw new AdminRepositoryError("Recipient email is required.", 400);
  }
  if (!subject) {
    throw new AdminRepositoryError("Email subject is required.", 400);
  }
  if (!text) {
    throw new AdminRepositoryError("Email message is required.", 400);
  }

  const templateId = cleanString(input.templateId);
  const templateName = await templateNameForId(templateId);

  await sendPartnershipCrmEmail({ to, subject, text, html });

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
      templateId,
      templateName,
      previousStatus: organization.status,
      nextStatus,
    },
  });
  const sentEmailLog = await addSentEmailLog(context, {
    targetKind: "organizations",
    targetId: organizationId,
    targetName: organization.name,
    to,
    subject,
    body: text,
    templateId,
    templateName,
  });
  const now = new Date().toISOString();
  const updatedOrganization: PartnershipCrmOrganizationRecord = {
    ...organization,
    status: nextStatus,
    lastContactAt: now,
    updatedAt: now,
    updatedByEmail: context.email,
  };

  return { organization: updatedOrganization, activity, sentEmailLog };
}

export async function sendPartnershipCrmProfessionalEmail(
  context: AdminContext,
  professionalId: string,
  input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    templateId?: string;
    templateKey?: string;
  },
) {
  requireGodMode(context);
  const snapshot = await getProfessionalSnapshot(professionalId);
  if (!snapshot) {
    throw new AdminRepositoryError("CRM professional not found.", 404);
  }

  const professional = toProfessionalRecord(
    professionalId,
    snapshot.data() ?? {},
  );
  const to = normalizeEmail(input.to);
  const subject = cleanString(input.subject);
  const text = cleanString(input.text);
  const html = cleanString(input.html);

  if (!to) {
    throw new AdminRepositoryError("Recipient email is required.", 400);
  }
  if (!subject) {
    throw new AdminRepositoryError("Email subject is required.", 400);
  }
  if (!text) {
    throw new AdminRepositoryError("Email message is required.", 400);
  }

  const templateId = cleanString(input.templateId);
  const templateName = await templateNameForId(templateId);

  await sendPartnershipCrmEmail({ to, subject, text, html });

  const nextStatus =
    professional.status === "new" ? "contacted" : professional.status;
  await snapshot.ref.set(
    {
      status: nextStatus,
      lastContactAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: context.email,
    },
    { merge: true },
  );

  const activity = await addProfessionalActivity(professionalId, context, {
    type: "email",
    title: `Email sent to ${to}`,
    body: text,
    metadata: {
      from: PARTNERSHIP_CRM_FROM_EMAIL,
      to,
      subject,
      templateId,
      templateName,
      previousStatus: professional.status,
      nextStatus,
    },
  });
  const sentEmailLog = await addSentEmailLog(context, {
    targetKind: "professionals",
    targetId: professionalId,
    targetName: professional.name,
    to,
    subject,
    body: text,
    templateId,
    templateName,
  });
  const now = new Date().toISOString();
  const updatedProfessional: PartnershipCrmProfessionalRecord = {
    ...professional,
    status: nextStatus,
    lastContactAt: now,
    updatedAt: now,
    updatedByEmail: context.email,
  };

  return { professional: updatedProfessional, activity, sentEmailLog };
}
