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
import { provisionPublisherPortalRoleForContext } from "./roles.repository.js";
import type {
  AdminContext,
  DiscoverFeedItemRecord,
  DiscoverFeedStatus,
  DiscoverFeedType,
  DiscoverGeneticReportCategory,
  DiscoverIndividualRecord,
  DiscoverIndividualStatus,
  DiscoverListPage,
  DiscoverOrganizationRecord,
  DiscoverOrganizationStatus,
  DiscoverPublisherSocialLinks,
} from "../types/sdk.types.js";

const adminDb = adminDbFor("mydnamap");

const ORGANIZATIONS_COLLECTION = "feed_organizations";
const INDIVIDUALS_COLLECTION = "feed_individuals";
const FEED_ITEMS_COLLECTION = "feed_items";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const PUBLISHER_DELETE_BATCH_SIZE = 450;

const FEED_TYPE_VALUES = [
  "news",
  "research_update",
  "upcoming_event",
  "opportunity",
  "video",
  "external_article",
  "podcast_episode",
  "survey",
  "organization_spotlight",
  "professional_spotlight",
  "community_invitation",
  "bioinformatics_tool",
  "genomic_database",
  "health_guidance",
  "educational_explainer",
  "gene_spotlight",
  "condition_spotlight",
  "genetic_test_guide",
  "report_explainer",
  "clinical_guideline",
  "clinical_trial",
  "patient_registry",
  "research_participation",
  "screening_program",
  "support_service",
  "course",
  "downloadable_resource",
  "lived_experience_story",
  "expert_qa",
  "advocacy_campaign",
] as const satisfies readonly DiscoverFeedType[];

type FeedPayloadFieldKind =
  "string" | "array" | "timestamp" | "integer" | "boolean";

type FeedPayloadField = {
  key: string;
  label: string;
  kind: FeedPayloadFieldKind;
  requiredForPublished?: boolean;
  aliases?: readonly string[];
};

const FEED_PAYLOAD_FIELDS: Record<
  DiscoverFeedType,
  readonly FeedPayloadField[]
> = {
  news: [
    { key: "category", label: "Category", kind: "string" },
    { key: "region", label: "Region", kind: "string" },
  ],
  research_update: [
    {
      key: "researchTopic",
      label: "Research topic",
      kind: "string",
      aliases: ["topic"],
    },
    { key: "genes", label: "Genes", kind: "array" },
    { key: "conditions", label: "Conditions", kind: "array" },
    {
      key: "journal",
      label: "Journal",
      kind: "string",
      aliases: ["journalName"],
    },
  ],
  upcoming_event: [
    {
      key: "date",
      label: "Event date",
      kind: "timestamp",
      requiredForPublished: true,
      aliases: ["startsAt"],
    },
    {
      key: "location",
      label: "Location",
      kind: "string",
      aliases: ["locationName"],
    },
    { key: "maxAttendance", label: "Max attendance", kind: "integer" },
  ],
  opportunity: [
    {
      key: "opportunityType",
      label: "Opportunity type",
      kind: "string",
    },
    { key: "requirements", label: "Requirements", kind: "string" },
    { key: "eligibility", label: "Eligibility", kind: "string" },
    {
      key: "location",
      label: "Location",
      kind: "string",
      aliases: ["locationName"],
    },
  ],
  video: [
    { key: "provider", label: "Provider", kind: "string" },
    { key: "durationSeconds", label: "Duration seconds", kind: "integer" },
    { key: "presenters", label: "Presenters", kind: "array" },
    { key: "captionLanguages", label: "Caption languages", kind: "array" },
  ],
  external_article: [
    { key: "publicationName", label: "Publication name", kind: "string" },
    { key: "authors", label: "Authors", kind: "array" },
    { key: "articleDate", label: "Article date", kind: "timestamp" },
    { key: "section", label: "Section", kind: "string" },
  ],
  podcast_episode: [
    { key: "podcastName", label: "Podcast name", kind: "string" },
    { key: "episodeNumber", label: "Episode number", kind: "string" },
    { key: "durationSeconds", label: "Duration seconds", kind: "integer" },
    { key: "hosts", label: "Hosts", kind: "array" },
    { key: "guests", label: "Guests", kind: "array" },
  ],
  survey: [
    { key: "estimatedMinutes", label: "Estimated minutes", kind: "integer" },
    { key: "closingDate", label: "Closing date", kind: "timestamp" },
    { key: "targetAudience", label: "Target audience", kind: "string" },
    { key: "anonymous", label: "Anonymous", kind: "boolean" },
  ],
  organization_spotlight: [
    {
      key: "featuredOrganizationId",
      label: "Featured organization ID",
      kind: "string",
    },
    { key: "focusConditions", label: "Focus conditions", kind: "array" },
    { key: "services", label: "Services", kind: "array" },
    { key: "serviceRegions", label: "Service regions", kind: "array" },
  ],
  professional_spotlight: [
    {
      key: "featuredIndividualId",
      label: "Featured individual ID",
      kind: "string",
    },
    { key: "specialties", label: "Specialties", kind: "array" },
    { key: "languages", label: "Languages", kind: "array" },
    { key: "serviceRegions", label: "Service regions", kind: "array" },
  ],
  community_invitation: [
    { key: "communityType", label: "Community type", kind: "string" },
    { key: "targetAudience", label: "Target audience", kind: "string" },
    { key: "accessType", label: "Access type", kind: "string" },
    { key: "communityLanguages", label: "Community languages", kind: "array" },
    { key: "moderated", label: "Moderated", kind: "boolean" },
  ],
  bioinformatics_tool: [
    { key: "toolName", label: "Tool name", kind: "string" },
    { key: "toolCategory", label: "Tool category", kind: "string" },
    { key: "inputFormats", label: "Input formats", kind: "array" },
    { key: "technicalLevel", label: "Technical level", kind: "string" },
    { key: "licenseModel", label: "License model", kind: "string" },
  ],
  genomic_database: [
    { key: "resourceName", label: "Resource name", kind: "string" },
    { key: "dataScope", label: "Data scope", kind: "string" },
    { key: "supportedSpecies", label: "Supported species", kind: "array" },
    { key: "accessModel", label: "Access model", kind: "string" },
    { key: "updateFrequency", label: "Update frequency", kind: "string" },
  ],
  health_guidance: [
    { key: "targetAudience", label: "Target audience", kind: "string" },
    { key: "reviewedBy", label: "Reviewed by", kind: "string" },
    { key: "reviewedAt", label: "Reviewed at", kind: "timestamp" },
    { key: "evidenceLevel", label: "Evidence level", kind: "string" },
    { key: "urgencyLevel", label: "Urgency level", kind: "string" },
  ],
  educational_explainer: [
    { key: "topic", label: "Topic", kind: "string" },
    { key: "difficultyLevel", label: "Difficulty level", kind: "string" },
    { key: "estimatedMinutes", label: "Estimated minutes", kind: "integer" },
    { key: "learningObjectives", label: "Learning objectives", kind: "array" },
  ],
  gene_spotlight: [
    { key: "geneSymbol", label: "Gene symbol", kind: "string" },
    { key: "geneName", label: "Gene name", kind: "string" },
    { key: "inheritanceModes", label: "Inheritance modes", kind: "array" },
    { key: "relatedConditions", label: "Related conditions", kind: "array" },
  ],
  condition_spotlight: [
    { key: "conditionName", label: "Condition name", kind: "string" },
    { key: "ontologyIds", label: "Ontology IDs", kind: "array" },
    { key: "relatedGenes", label: "Related genes", kind: "array" },
    { key: "inheritanceModes", label: "Inheritance modes", kind: "array" },
  ],
  genetic_test_guide: [
    { key: "testType", label: "Test type", kind: "string" },
    { key: "sampleTypes", label: "Sample types", kind: "array" },
    { key: "intendedUse", label: "Intended use", kind: "string" },
    { key: "turnaroundTime", label: "Turnaround time", kind: "string" },
    {
      key: "requiresPrescription",
      label: "Requires prescription",
      kind: "boolean",
    },
  ],
  report_explainer: [
    { key: "reportSection", label: "Report section", kind: "string" },
    { key: "conceptsCovered", label: "Concepts covered", kind: "array" },
    { key: "readingLevel", label: "Reading level", kind: "string" },
    { key: "relatedGenes", label: "Related genes", kind: "array" },
  ],
  clinical_guideline: [
    { key: "issuingBody", label: "Issuing body", kind: "string" },
    { key: "version", label: "Version", kind: "string" },
    { key: "releaseDate", label: "Release date", kind: "timestamp" },
    { key: "targetProfessions", label: "Target professions", kind: "array" },
    { key: "guidelineStatus", label: "Guideline status", kind: "string" },
  ],
  clinical_trial: [
    { key: "trialIdentifier", label: "Trial identifier", kind: "string" },
    { key: "phase", label: "Phase", kind: "string" },
    { key: "recruitmentStatus", label: "Recruitment status", kind: "string" },
    { key: "conditions", label: "Conditions", kind: "array" },
    { key: "countries", label: "Countries", kind: "array" },
    { key: "sponsor", label: "Sponsor", kind: "string" },
  ],
  patient_registry: [
    { key: "registryName", label: "Registry name", kind: "string" },
    { key: "enrollmentStatus", label: "Enrollment status", kind: "string" },
    { key: "conditions", label: "Conditions", kind: "array" },
    { key: "eligiblePopulation", label: "Eligible population", kind: "string" },
    { key: "countries", label: "Countries", kind: "array" },
  ],
  research_participation: [
    { key: "studyIdentifier", label: "Study identifier", kind: "string" },
    { key: "studyType", label: "Study type", kind: "string" },
    { key: "recruitmentStatus", label: "Recruitment status", kind: "string" },
    { key: "eligibilitySummary", label: "Eligibility summary", kind: "string" },
    { key: "participationMode", label: "Participation mode", kind: "string" },
    { key: "endDate", label: "End date", kind: "timestamp" },
  ],
  screening_program: [
    { key: "screeningType", label: "Screening type", kind: "string" },
    { key: "eligiblePopulation", label: "Eligible population", kind: "string" },
    { key: "startDate", label: "Start date", kind: "timestamp" },
    { key: "endDate", label: "End date", kind: "timestamp" },
    { key: "locations", label: "Locations", kind: "array" },
    { key: "costNote", label: "Cost note", kind: "string" },
  ],
  support_service: [
    { key: "serviceType", label: "Service type", kind: "string" },
    { key: "availability", label: "Availability", kind: "string" },
    { key: "deliveryMode", label: "Delivery mode", kind: "string" },
    { key: "languages", label: "Languages", kind: "array" },
    { key: "eligibilitySummary", label: "Eligibility summary", kind: "string" },
    { key: "regions", label: "Regions", kind: "array" },
  ],
  course: [
    { key: "deliveryMode", label: "Delivery mode", kind: "string" },
    { key: "difficultyLevel", label: "Difficulty level", kind: "string" },
    { key: "duration", label: "Duration", kind: "string" },
    { key: "targetAudience", label: "Target audience", kind: "string" },
    {
      key: "certificateAvailable",
      label: "Certificate available",
      kind: "boolean",
    },
  ],
  downloadable_resource: [
    { key: "fileType", label: "File type", kind: "string" },
    { key: "pageCount", label: "Page count", kind: "integer" },
    { key: "fileSize", label: "File size", kind: "string" },
    { key: "resourceLanguages", label: "Resource languages", kind: "array" },
    { key: "targetAudience", label: "Target audience", kind: "string" },
  ],
  lived_experience_story: [
    { key: "perspective", label: "Perspective", kind: "string" },
    { key: "conditions", label: "Conditions", kind: "array" },
    { key: "lifeStage", label: "Life stage", kind: "string" },
    { key: "topics", label: "Topics", kind: "array" },
    { key: "contentWarning", label: "Content warning", kind: "string" },
  ],
  expert_qa: [
    { key: "expertName", label: "Expert name", kind: "string" },
    { key: "credentials", label: "Credentials", kind: "string" },
    { key: "specialty", label: "Specialty", kind: "string" },
    { key: "questionsCount", label: "Questions count", kind: "integer" },
    { key: "recordedAt", label: "Recorded at", kind: "timestamp" },
  ],
  advocacy_campaign: [
    { key: "campaignType", label: "Campaign type", kind: "string" },
    { key: "organizer", label: "Organizer", kind: "string" },
    { key: "targetRegion", label: "Target region", kind: "string" },
    { key: "deadline", label: "Deadline", kind: "timestamp" },
    { key: "campaignGoal", label: "Campaign goal", kind: "string" },
  ],
};

const ORGANIZATION_STATUSES = new Set<DiscoverOrganizationStatus>([
  "active",
  "inactive",
  "archived",
  "pending_approval",
]);
const GENETIC_REPORT_CATEGORY_VALUES = [
  "grc_reproductive",
  "grc_ophthalmics",
  "grc_full_genome",
  "grc_cardiovascular",
  "grc_rare_diseases",
  "grc_neurological",
  "grc_prenatal",
  "grc_nutrition_and_metabolism",
  "grc_ancestry",
  "grc_hereditary_cancer",
  "grc_other",
] as const satisfies readonly DiscoverGeneticReportCategory[];
const GENETIC_REPORT_CATEGORIES = new Set<DiscoverGeneticReportCategory>(
  GENETIC_REPORT_CATEGORY_VALUES,
);
const FEED_TYPES = new Set<DiscoverFeedType>(FEED_TYPE_VALUES);
const FEED_STATUSES = new Set<DiscoverFeedStatus>([
  "draft",
  "published",
  "archived",
]);
const VALIDATED_STATUSES = new Set<DiscoverFeedStatus>(["published"]);
const SNAPSHOT_SYNC_STATUSES = new Set<DiscoverFeedStatus>([
  "draft",
  "published",
]);
const SOCIAL_KEYS = [
  "facebook",
  "twitter",
  "instagram",
  "tiktok",
  "youtube",
  "linkedin",
  "github",
  "gitlab",
  "stack_overflow",
  "hugging_face",
  "kaggle",
  "researchgate",
  "orcid",
  "google_scholar",
  "pubmed",
  "scopus",
  "web_of_science",
  "biostars",
  "protocols_io",
  "osf",
  "zenodo",
  "whatsapp",
  "telegram",
  "threads",
  "pinterest",
  "snapchat",
  "reddit",
  "discord",
  "twitch",
  "bluesky",
  "mastodon",
  "email",
  "other",
] as const;

type PageCursor = {
  updatedAtMillis: number;
  id: string;
};

type DocumentPageCursor = {
  mode: "document";
  id: string;
};

type PublisherImageUploadInput = {
  imageUploadDataUrl?: unknown;
  imageUploadName?: unknown;
  imageUploadMimeType?: unknown;
};

type PublisherImageUploadRecord = {
  imageUploadDataUrl?: string;
  imageUploadName?: string;
  imageUploadMimeType?: string;
};

type OrganizationInput = PublisherImageUploadInput & {
  name?: unknown;
  imageUrl?: unknown;
  status?: unknown;
  websiteUrl?: unknown;
  description?: unknown;
  descriptionEn?: unknown;
  social?: unknown;
  countryCode?: unknown;
  organizationType?: unknown;
  colorHex?: unknown;
  verified?: unknown;
  isGeneticReportProvider?: unknown;
  geneticReportCategory?: unknown;
  contactEmail?: unknown;
  internalNotes?: unknown;
};

type IndividualInput = PublisherImageUploadInput & {
  name?: unknown;
  imageUrl?: unknown;
  status?: unknown;
  websiteUrl?: unknown;
  description?: unknown;
  descriptionEn?: unknown;
  social?: unknown;
  countryCode?: unknown;
  individualType?: unknown;
  colorHex?: unknown;
  verified?: unknown;
  contactEmail?: unknown;
  internalNotes?: unknown;
};

type PublicPublisherRequestInput = PublisherImageUploadInput & {
  kind?: unknown;
  name?: unknown;
  imageUrl?: unknown;
  websiteUrl?: unknown;
  description?: unknown;
  descriptionEn?: unknown;
  social?: unknown;
  countryCode?: unknown;
  organizationType?: unknown;
  individualType?: unknown;
  colorHex?: unknown;
  isGeneticReportProvider?: unknown;
  geneticReportCategory?: unknown;
  contactEmail?: unknown;
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
  htmlBody?: unknown;
  imageUrl?: unknown;
  sourceUrl?: unknown;
  sourceButtonText?: unknown;
} & Partial<Record<DiscoverFeedType, unknown>>;

type SubmissionEvaluationDecision = "approve" | "reject";

function requireFullAdmin(context: AdminContext) {
  if (context.role !== "full_admin") {
    throw new AdminRepositoryError("Full admin access required.", 403);
  }
}

function requireGodMode(context: AdminContext) {
  if (context.role !== "full_admin" || !context.isBootstrap) {
    throw new AdminRepositoryError(
      "God mode is required to delete Discover publishers.",
      403,
    );
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

function assertOrganizationScope(
  context: AdminContext,
  organizationId: string,
) {
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
    | Pick<
        DiscoverFeedItemRecord,
        "publisherOrganizationId" | "publisherIndividualId"
      >
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

function normalizePublicImageUploadDataUrl(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.length > 900000) {
    throw new AdminRepositoryError("Uploaded image is too large.", 400);
  }

  if (
    !/^data:image\/(?:png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/.test(
      normalized,
    )
  ) {
    throw new AdminRepositoryError(
      "Uploaded image must be a PNG, JPG, WebP, SVG, or ICO data URL.",
      400,
    );
  }

  return normalized;
}

function normalizePublicImageUploadMimeType(
  value: unknown,
): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
      "image/x-icon",
      "image/vnd.microsoft.icon",
    ].includes(normalized)
  ) {
    throw new AdminRepositoryError(
      "Uploaded image type must be PNG, JPG, WebP, SVG, or ICO.",
      400,
    );
  }

  return normalized;
}

function publicImageUploadDocumentFields(input: PublisherImageUploadInput) {
  const imageUploadDataUrl = normalizePublicImageUploadDataUrl(
    input.imageUploadDataUrl,
  );
  if (!imageUploadDataUrl) {
    return {};
  }

  const inferredMimeType = imageUploadDataUrl.match(
    /^data:(image\/(?:png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon));base64,/,
  )?.[1];
  const imageUploadMimeType = normalizePublicImageUploadMimeType(
    input.imageUploadMimeType,
  );
  const normalizedMimeType = inferredMimeType;

  if (
    imageUploadMimeType &&
    normalizedMimeType &&
    imageUploadMimeType !== normalizedMimeType
  ) {
    throw new AdminRepositoryError(
      "Uploaded image type does not match the image data.",
      400,
    );
  }

  return {
    imageUploadDataUrl,
    imageUploadName: normalizeOptionalString(input.imageUploadName),
    imageUploadMimeType: imageUploadMimeType ?? normalizedMimeType,
  };
}

function publisherImageDocumentFields(
  input: PublisherImageUploadInput & { imageUrl?: unknown },
  label: string,
) {
  const imageUrl = normalizeHttpsUrl(input.imageUrl, label);
  const imageUploadFields = publicImageUploadDocumentFields(input);

  if (!imageUrl && !imageUploadFields.imageUploadDataUrl) {
    throw new AdminRepositoryError(`${label} is required.`, 400);
  }

  return {
    imageUrl,
    ...imageUploadFields,
  };
}

function preserveExistingImageUpload<T extends PublisherImageUploadInput>(
  input: T,
  existingRecord: PublisherImageUploadRecord,
): T {
  if (normalizeOptionalString(input.imageUploadDataUrl)) {
    return input;
  }

  return {
    ...input,
    imageUploadDataUrl: existingRecord.imageUploadDataUrl,
    imageUploadName: existingRecord.imageUploadName,
    imageUploadMimeType: existingRecord.imageUploadMimeType,
  } as T;
}

function normalizeUrl(
  value: unknown,
  label: string,
  {
    required = false,
    httpsOnly = false,
  }: {
    required?: boolean;
    httpsOnly?: boolean;
  } = {},
): string | null {
  const normalized = required
    ? normalizeRequiredString(value, label)
    : normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new AdminRepositoryError(`${label} must be a valid URL.`, 400);
  }

  if (httpsOnly && url.protocol !== "https:") {
    throw new AdminRepositoryError(`${label} must use HTTPS.`, 400);
  }

  if (!httpsOnly && url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AdminRepositoryError(`${label} must use HTTP or HTTPS.`, 400);
  }

  return url.toString();
}

function normalizeHttpsUrl(value: unknown, label: string): string | null {
  return normalizeUrl(value, label, { httpsOnly: true });
}

function normalizeOptionalHttpUrl(
  value: unknown,
  label: string,
): string | null {
  return normalizeUrl(value, label);
}

function normalizeOptionalEmail(
  value: unknown,
  label: string,
): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AdminRepositoryError(`${label} must be a valid email.`, 400);
  }

  return normalized;
}

function normalizeRequiredEmail(value: unknown, label: string): string {
  const normalized = normalizeRequiredString(value, label);
  return normalizeOptionalEmail(normalized, label)!.toLowerCase();
}

function normalizeSocialEmail(
  value: unknown,
  label: string,
): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  const rawEmail = normalized.startsWith("mailto:")
    ? normalized.slice("mailto:".length)
    : normalized;
  const email = normalizeOptionalEmail(rawEmail, label);
  return email ? `mailto:${email.toLowerCase()}` : undefined;
}

function normalizeSocialLinksForRead(
  value: unknown,
): DiscoverPublisherSocialLinks | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const social = Object.fromEntries(
    SOCIAL_KEYS.flatMap((key) => {
      const normalized = normalizeOptionalString(source[key]);
      return normalized ? [[key, normalized]] : [];
    }),
  ) as DiscoverPublisherSocialLinks;

  return Object.keys(social).length ? social : undefined;
}

function normalizeSocialLinks(
  value: unknown,
): DiscoverPublisherSocialLinks | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new AdminRepositoryError("Social links must be an object.", 400);
  }

  const source = value as Record<string, unknown>;
  const entries = SOCIAL_KEYS.flatMap((key) => {
    if (key === "email") {
      const email = normalizeSocialEmail(source[key], "Social email");
      return email ? [[key, email]] : [];
    }

    const url = normalizeOptionalHttpUrl(source[key], `Social ${key} URL`);
    return url ? [[key, url]] : [];
  });
  const social = Object.fromEntries(entries) as DiscoverPublisherSocialLinks;

  return Object.keys(social).length ? social : undefined;
}

function normalizeCountryCode(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  const seen = new Set<string>();
  const countryCodes = normalized
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter((token) => {
      if (!token) {
        return false;
      }

      if (token !== "GLOBAL" && !/^[A-Z]{2}$/.test(token)) {
        throw new AdminRepositoryError(
          `Country coverage contains an invalid key: ${token}`,
          400,
        );
      }

      if (seen.has(token)) {
        return false;
      }

      seen.add(token);
      return true;
    });

  return countryCodes.includes("GLOBAL") ? "GLOBAL" : countryCodes.join(",");
}

function normalizeRequiredCountryCode(value: unknown): string {
  const countryCode = normalizeCountryCode(value);
  if (!countryCode) {
    throw new AdminRepositoryError("Country coverage is required.", 400);
  }

  return countryCode;
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
    throw new AdminRepositoryError(
      `${label} must be a valid 6-digit hex color.`,
      400,
    );
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

function normalizeNullableBoolean(
  value: unknown,
  label: string,
): boolean | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0", "off"].includes(normalized)) {
      return false;
    }
  }

  throw new AdminRepositoryError(`${label} must be true or false.`, 400);
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

function normalizeNullablePositiveInteger(
  value: unknown,
  label: string,
): number | null {
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
    .replace(
      /<\/?(iframe|object|embed|form|input|button|textarea|select|option|link|meta|base)[^>]*>/gi,
      "",
    )
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
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
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as {
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

function decodeDocumentCursor(
  cursor: string | undefined,
): DocumentPageCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as {
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
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
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

function toOrganizationRecord(
  doc: QueryDocumentSnapshot,
): DiscoverOrganizationRecord {
  const data = doc.data() as Record<string, unknown>;
  const status = ORGANIZATION_STATUSES.has(
    data.status as DiscoverOrganizationStatus,
  )
    ? (data.status as DiscoverOrganizationStatus)
    : "inactive";
  const organizationType = discoverOrganizationCategoryProvider.normalizeCsv(
    normalizeOptionalString(data.organizationType),
  );
  const geneticReportCategory = readGeneticReportCategory(
    data.geneticReportCategory,
  );

  return {
    id: doc.id,
    name: normalizeOptionalString(data.name) ?? doc.id,
    imageUrl: normalizeNullableString(data.imageUrl),
    imageUploadDataUrl: normalizeOptionalString(data.imageUploadDataUrl),
    imageUploadName: normalizeOptionalString(data.imageUploadName),
    imageUploadMimeType: normalizeOptionalString(data.imageUploadMimeType),
    status,
    slug: normalizeOptionalString(data.slug),
    websiteUrl: normalizeOptionalString(data.websiteUrl),
    description: normalizeOptionalString(data.description),
    descriptionEn: normalizeOptionalString(data.descriptionEn),
    social: normalizeSocialLinksForRead(data.social),
    countryCode: normalizeOptionalString(data.countryCode),
    organizationType: organizationType || undefined,
    colorHex: readHexColor(data.colorHex),
    verified: data.verified === true,
    isGeneticReportProvider: data.isGeneticReportProvider === true,
    geneticReportCategory: geneticReportCategory,
    contactEmail: normalizeOptionalString(data.contactEmail),
    internalNotes: normalizeOptionalString(data.internalNotes),
    createdAt: timestampToIso(data.createdAt) ?? "",
    updatedAt: timestampToIso(data.updatedAt) ?? "",
    createdByUserId: normalizeOptionalString(data.createdByUserId),
    updatedByUserId: normalizeOptionalString(data.updatedByUserId),
  };
}

function toIndividualRecord(
  doc: QueryDocumentSnapshot,
): DiscoverIndividualRecord {
  const data = doc.data() as Record<string, unknown>;
  const status = ORGANIZATION_STATUSES.has(
    data.status as DiscoverIndividualStatus,
  )
    ? (data.status as DiscoverIndividualStatus)
    : "inactive";
  const individualType = discoverIndividualCategoryProvider.normalizeCsv(
    normalizeOptionalString(data.individualType),
  );

  return {
    id: doc.id,
    name: normalizeOptionalString(data.name) ?? doc.id,
    imageUrl: normalizeNullableString(data.imageUrl),
    imageUploadDataUrl: normalizeOptionalString(data.imageUploadDataUrl),
    imageUploadName: normalizeOptionalString(data.imageUploadName),
    imageUploadMimeType: normalizeOptionalString(data.imageUploadMimeType),
    status,
    slug: normalizeOptionalString(data.slug),
    websiteUrl: normalizeOptionalString(data.websiteUrl),
    description: normalizeOptionalString(data.description),
    descriptionEn: normalizeOptionalString(data.descriptionEn),
    social: normalizeSocialLinksForRead(data.social),
    countryCode: normalizeOptionalString(data.countryCode),
    individualType: individualType || undefined,
    colorHex: readHexColor(data.colorHex),
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
  const languageValue = data.language ?? data.locale;
  const language = languageValue === "es" ? "es" : "en";
  const record: DiscoverFeedItemRecord = {
    id: doc.id,
    publisherOrganizationId: normalizeNullableString(
      data.publisherOrganizationId,
    ),
    publisherIndividualId: normalizeNullableString(data.publisherIndividualId),
    publisherSnapshot: {
      name:
        normalizeOptionalString(publisherSnapshot.name) ?? "Unknown publisher",
      imageUrl: normalizeNullableString(publisherSnapshot.imageUrl),
    },
    type,
    publishedAt: timestampToIso(data.publishedAt),
    language,
    title:
      normalizeOptionalString(data.title) ??
      normalizeOptionalString(activePayload.title) ??
      "",
    subtitle:
      normalizeOptionalString(data.subtitle) ??
      normalizeOptionalString(activePayload.summary) ??
      "",
    body:
      normalizeOptionalString(data.body) ??
      normalizeOptionalString(activePayload.detailBody) ??
      "",
    htmlBody: normalizeNullableString(data.htmlBody),
    imageUrl:
      normalizeNullableString(data.imageUrl) ??
      normalizeNullableString(activePayload.imageUrl),
    sourceUrl: normalizeNullableString(data.sourceUrl),
    sourceButtonText: normalizeNullableString(data.sourceButtonText),
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
      record[payloadKey] = serializePayloadValue(payload) as Record<
        string,
        unknown
      >;
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
  const nextCursor = nextCursorSource ? cursorFromDoc(nextCursorSource) : null;

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

  const invalidKeys =
    discoverOrganizationCategoryProvider.invalidKeys(normalized);
  if (invalidKeys.length) {
    throw new AdminRepositoryError(
      `Organization category contains invalid keys: ${invalidKeys.join(", ")}`,
      400,
    );
  }

  return (
    discoverOrganizationCategoryProvider.normalizeCsv(normalized) || undefined
  );
}

function normalizeRequiredOrganizationType(value: unknown): string {
  const organizationType = normalizeOrganizationType(value);
  if (!organizationType) {
    throw new AdminRepositoryError("Organization category is required.", 400);
  }

  return organizationType;
}

function normalizeIndividualType(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  const invalidKeys =
    discoverIndividualCategoryProvider.invalidKeys(normalized);
  if (invalidKeys.length) {
    throw new AdminRepositoryError(
      `Individual publisher category contains invalid keys: ${invalidKeys.join(", ")}`,
      400,
    );
  }

  return (
    discoverIndividualCategoryProvider.normalizeCsv(normalized) || undefined
  );
}

function normalizeRequiredIndividualType(value: unknown): string {
  const individualType = normalizeIndividualType(value);
  if (!individualType) {
    throw new AdminRepositoryError(
      "Individual publisher category is required.",
      400,
    );
  }

  return individualType;
}

function readGeneticReportCategory(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const requested = new Set(
    normalized
      .split(",")
      .map((token) => token.trim())
      .filter((token): token is DiscoverGeneticReportCategory =>
        GENETIC_REPORT_CATEGORIES.has(token as DiscoverGeneticReportCategory),
      ),
  );
  const validKeys = GENETIC_REPORT_CATEGORY_VALUES.filter((key) =>
    requested.has(key),
  );

  return validKeys.length ? validKeys.join(",") : null;
}

function normalizeGeneticReportCategory(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const tokens = normalized
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) {
    return null;
  }

  const invalidKeys = tokens.filter(
    (token) =>
      !GENETIC_REPORT_CATEGORIES.has(token as DiscoverGeneticReportCategory),
  );
  if (invalidKeys.length) {
    throw new AdminRepositoryError("Use valid genetic report categories.", 400);
  }

  return readGeneticReportCategory(tokens.join(","));
}

function normalizePublicPublisherKind(
  value: unknown,
): "organization" | "individual" {
  const normalized = normalizeRequiredString(
    value,
    "Publisher type",
  ).toLowerCase();
  if (normalized !== "organization" && normalized !== "individual") {
    throw new AdminRepositoryError(
      "Publisher type must be organization or individual.",
      400,
    );
  }

  return normalized;
}

function organizationDocument(input: OrganizationInput, context: AdminContext) {
  const name = normalizeRequiredString(input.name, "Organization name");

  return {
    name,
    ...publisherImageDocumentFields(input, "Organization image URL"),
    status: normalizeOrganizationStatus(input.status),
    slug: slugifyOrganizationName(name),
    websiteUrl: normalizeOptionalHttpUrl(input.websiteUrl, "Website URL"),
    description: normalizeOptionalString(input.description),
    descriptionEn: normalizeOptionalString(input.descriptionEn),
    social: normalizeSocialLinks(input.social) ?? null,
    countryCode: normalizeCountryCode(input.countryCode),
    organizationType: normalizeOrganizationType(input.organizationType),
    colorHex: normalizeHexColor(input.colorHex, "Organization color") ?? null,
    verified: normalizeBoolean(input.verified),
    isGeneticReportProvider: normalizeBoolean(input.isGeneticReportProvider),
    geneticReportCategory: normalizeGeneticReportCategory(
      input.geneticReportCategory,
    ),
    contactEmail: normalizeOptionalEmail(input.contactEmail, "Contact email"),
    internalNotes: normalizeOptionalString(input.internalNotes),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  };
}

function publicOrganizationRequestDocument(input: PublicPublisherRequestInput) {
  const name = normalizeRequiredString(input.name, "Organization name");
  const isGeneticReportProvider = normalizeBoolean(
    input.isGeneticReportProvider,
  );

  return {
    name,
    imageUrl: normalizeHttpsUrl(input.imageUrl, "Organization image URL"),
    ...publicImageUploadDocumentFields(input),
    status: "pending_approval" as const,
    slug: slugifyOrganizationName(name),
    websiteUrl: normalizeOptionalHttpUrl(input.websiteUrl, "Website URL"),
    description: normalizeOptionalString(input.description),
    descriptionEn: normalizeOptionalString(input.descriptionEn),
    social: normalizeSocialLinks(input.social) ?? null,
    countryCode: normalizeRequiredCountryCode(input.countryCode),
    organizationType: normalizeRequiredOrganizationType(input.organizationType),
    colorHex: normalizeHexColor(input.colorHex, "Organization color") ?? null,
    verified: false,
    isGeneticReportProvider: isGeneticReportProvider,
    geneticReportCategory: isGeneticReportProvider
      ? normalizeGeneticReportCategory(input.geneticReportCategory)
      : null,
    contactEmail: normalizeRequiredEmail(input.contactEmail, "Contact email"),
    internalNotes: undefined,
    isRequestedThroughWebWizard: true,
    approvalRequestDate: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdByUserId: "public-web-wizard",
    updatedByUserId: "public-web-wizard",
  };
}

function individualDocument(input: IndividualInput, context: AdminContext) {
  const name = normalizeRequiredString(input.name, "Individual publisher name");

  return {
    name,
    ...publisherImageDocumentFields(input, "Individual publisher image URL"),
    status: normalizeOrganizationStatus(input.status),
    slug: slugifyIndividualName(name),
    websiteUrl: normalizeOptionalHttpUrl(input.websiteUrl, "Website URL"),
    description: normalizeOptionalString(input.description),
    descriptionEn: normalizeOptionalString(input.descriptionEn),
    social: normalizeSocialLinks(input.social) ?? null,
    countryCode: normalizeCountryCode(input.countryCode),
    individualType: normalizeIndividualType(input.individualType),
    colorHex:
      normalizeHexColor(input.colorHex, "Individual publisher color") ?? null,
    verified: normalizeBoolean(input.verified),
    contactEmail: normalizeOptionalEmail(input.contactEmail, "Contact email"),
    internalNotes: normalizeOptionalString(input.internalNotes),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  };
}

function publicIndividualRequestDocument(input: PublicPublisherRequestInput) {
  const name = normalizeRequiredString(input.name, "Individual publisher name");

  return {
    name,
    imageUrl: normalizeHttpsUrl(
      input.imageUrl,
      "Individual publisher image URL",
    ),
    ...publicImageUploadDocumentFields(input),
    status: "pending_approval" as const,
    slug: slugifyIndividualName(name),
    websiteUrl: normalizeOptionalHttpUrl(input.websiteUrl, "Website URL"),
    description: normalizeOptionalString(input.description),
    descriptionEn: normalizeOptionalString(input.descriptionEn),
    social: normalizeSocialLinks(input.social) ?? null,
    countryCode: normalizeRequiredCountryCode(input.countryCode),
    individualType: normalizeRequiredIndividualType(input.individualType),
    colorHex:
      normalizeHexColor(input.colorHex, "Individual publisher color") ?? null,
    verified: false,
    contactEmail: normalizeRequiredEmail(input.contactEmail, "Contact email"),
    internalNotes: undefined,
    isRequestedThroughWebWizard: true,
    approvalRequestDate: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdByUserId: "public-web-wizard",
    updatedByUserId: "public-web-wizard",
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
  return payloadInput &&
    typeof payloadInput === "object" &&
    !Array.isArray(payloadInput)
    ? (payloadInput as Record<string, unknown>)
    : {};
}

function normalizeRootContent(
  input: FeedItemInput,
  status: DiscoverFeedStatus,
) {
  const title = normalizeOptionalString(input.title);
  const subtitle = normalizeOptionalString(input.subtitle);
  const body = normalizeOptionalString(input.body);
  const htmlBody = sanitizeHtmlBody(input.htmlBody);

  if (VALIDATED_STATUSES.has(status)) {
    if (!title) {
      throw new AdminRepositoryError(
        "Feed entry title is required before publishing.",
        400,
      );
    }
    if (!subtitle) {
      throw new AdminRepositoryError(
        "Feed entry subtitle is required before publishing.",
        400,
      );
    }
    if (!body && !htmlBody) {
      throw new AdminRepositoryError(
        "Feed entry body is required before publishing.",
        400,
      );
    }
  }

  return {
    title: title ?? "",
    subtitle: subtitle ?? "",
    body: body ?? "",
    htmlBody: htmlBody,
    imageUrl: normalizeHttpsUrl(input.imageUrl, "Image URL"),
    sourceUrl: normalizeHttpsUrl(input.sourceUrl, "Source URL"),
    sourceButtonText: normalizeNullableString(input.sourceButtonText),
    language: normalizeLanguage(input.language),
  };
}

function compatibilityAliases(root: ReturnType<typeof normalizeRootContent>) {
  return {
    title: root.title,
    summary: root.subtitle,
    detailBody: root.body,
    imageUrl: root.imageUrl,
  };
}

function payloadValue(
  payload: Record<string, unknown>,
  field: FeedPayloadField,
): unknown {
  const keys = [field.key, ...(field.aliases ?? [])];

  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) {
      return payload[key];
    }
  }

  return undefined;
}

function normalizePayloadField(
  field: FeedPayloadField,
  payload: Record<string, unknown>,
  status: DiscoverFeedStatus,
) {
  const value = payloadValue(payload, field);

  if (
    status === "published" &&
    field.requiredForPublished &&
    (value === undefined || value === null || value === "")
  ) {
    throw new AdminRepositoryError(
      `${field.label} is required before publishing.`,
      400,
    );
  }

  if (field.kind === "array") {
    return normalizeStringArray(value);
  }

  if (field.kind === "timestamp") {
    return normalizeTimestamp(value, field.label);
  }

  if (field.kind === "integer") {
    return normalizeNullablePositiveInteger(value, field.label);
  }

  if (field.kind === "boolean") {
    return normalizeNullableBoolean(value, field.label);
  }

  return normalizeNullableString(value);
}

function compatibilityPayloadAliases(
  type: DiscoverFeedType,
  payload: Record<string, unknown>,
) {
  if (type === "research_update") {
    return {
      journalName: payload.journal,
    };
  }

  if (type === "upcoming_event") {
    return {
      startsAt: payload.date,
    };
  }

  if (type === "opportunity") {
    return {
      opportunityType: payload.opportunityType,
    };
  }

  return {};
}

function normalizeTypePayload(
  type: DiscoverFeedType,
  input: FeedItemInput,
  status: DiscoverFeedStatus,
  root: ReturnType<typeof normalizeRootContent>,
) {
  const payload = payloadInputForType(type, input);
  const aliases = compatibilityAliases(root);
  const normalizedPayload = Object.fromEntries(
    FEED_PAYLOAD_FIELDS[type].map((field) => [
      field.key,
      normalizePayloadField(field, payload, status),
    ]),
  );

  return {
    ...aliases,
    ...normalizedPayload,
    ...compatibilityPayloadAliases(type, normalizedPayload),
  };
}

async function feedItemDocument(
  feedItemId: string,
  input: FeedItemInput,
  context: AdminContext,
  existing?: Record<string, unknown>,
) {
  const publisherOrganizationId = normalizeOptionalString(
    input.publisherOrganizationId,
  );
  const publisherIndividualId = normalizeOptionalString(
    input.publisherIndividualId,
  );

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

  const inputPublishedAt = normalizeTimestamp(
    input.publishedAt,
    "Published time",
  );
  const existingPublishedAt = normalizeTimestamp(
    existing?.publishedAt,
    "Published time",
  );
  const publishedAt =
    status === "published"
      ? (inputPublishedAt ??
        existingPublishedAt ??
        FieldValue.serverTimestamp())
      : inputPublishedAt;
  const archivedAt =
    status === "archived"
      ? (normalizeTimestamp(existing?.archivedAt, "Archived time") ??
        FieldValue.serverTimestamp())
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
    htmlBody: root.htmlBody,
    imageUrl: root.imageUrl,
    sourceUrl: root.sourceUrl,
    sourceButtonText: root.sourceUrl ? root.sourceButtonText : null,
    archivedAt,
    [getPayloadKey(type)]: payload,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: context.uid,
  };
}

async function deleteFeedItemsForPublisher(
  field: "publisherOrganizationId" | "publisherIndividualId",
  publisherId: string,
) {
  let deletedFeedItemCount = 0;

  while (true) {
    const snapshot = await adminDb
      .collection(FEED_ITEMS_COLLECTION)
      .where(field, "==", publisherId)
      .limit(PUBLISHER_DELETE_BATCH_SIZE)
      .get();

    if (snapshot.docs.length === 0) {
      return deletedFeedItemCount;
    }

    const batch = adminDb.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      deletedFeedItemCount += 1;
    }
    await batch.commit();
  }
}

export async function listDiscoverOrganizations(
  context: AdminContext,
  options: { cursor?: string; limit?: unknown } = {},
) {
  requireOrganizationSurfaceAccess(context);

  const ownOrganizationId = scopedOrganizationId(context);
  if (ownOrganizationId) {
    const organization = await getDiscoverOrganization(
      context,
      ownOrganizationId,
    );
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

export async function createDiscoverPublisherApprovalRequest(
  input: PublicPublisherRequestInput,
) {
  const kind = normalizePublicPublisherKind(input.kind);

  if (kind === "organization") {
    const ref = adminDb.collection(ORGANIZATIONS_COLLECTION).doc();
    await ref.set(withoutUndefined(publicOrganizationRequestDocument(input)));
    const snapshot = await ref.get();

    return {
      kind,
      publisher: toOrganizationRecord(snapshot as QueryDocumentSnapshot),
    };
  }

  const ref = adminDb.collection(INDIVIDUALS_COLLECTION).doc();
  await ref.set(withoutUndefined(publicIndividualRequestDocument(input)));
  const snapshot = await ref.get();

  return {
    kind,
    publisher: toIndividualRecord(snapshot as QueryDocumentSnapshot),
  };
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
          isGeneticReportProvider: existingRecord.isGeneticReportProvider,
          geneticReportCategory: existingRecord.geneticReportCategory,
          internalNotes: existingRecord.internalNotes,
        }
      : input;

  const inputWithImageUpload = preserveExistingImageUpload(
    scopedInput,
    existingRecord,
  );

  await existing.ref.set(
    withoutUndefined({
      ...existing.data(),
      ...organizationDocument(inputWithImageUpload, context),
    }),
    { merge: false },
  );

  return getDiscoverOrganization(context, organizationId);
}

export async function deleteDiscoverOrganization(
  context: AdminContext,
  organizationId: string,
) {
  requireGodMode(context);
  const existing = await getOrganizationSnapshot(organizationId);
  if (!existing) {
    throw new AdminRepositoryError("Organization not found.", 404);
  }

  const deletedFeedItemCount = await deleteFeedItemsForPublisher(
    "publisherOrganizationId",
    organizationId,
  );
  await adminDb
    .collection(ORGANIZATIONS_COLLECTION)
    .doc(organizationId)
    .delete();

  return { deleted: true, organizationId, deletedFeedItemCount };
}

export async function evaluateDiscoverOrganizationSubmission(
  context: AdminContext,
  organizationId: string,
  decision: SubmissionEvaluationDecision,
) {
  requireFullAdmin(context);
  const existing = await getOrganizationSnapshot(organizationId);
  if (!existing) {
    throw new AdminRepositoryError("Organization not found.", 404);
  }

  const organization = toOrganizationRecord(existing);
  if (decision === "reject") {
    await existing.ref.set(
      withoutUndefined({
        ...existing.data(),
        status: "archived",
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUserId: context.uid,
      }),
      { merge: false },
    );

    return {
      decision,
      organization: await getDiscoverOrganization(context, organizationId),
      role: null,
    };
  }

  const contactEmail = normalizeOptionalString(organization.contactEmail);
  if (!contactEmail) {
    throw new AdminRepositoryError(
      "A contact email is required to approve this organization.",
      400,
    );
  }

  const role = await provisionPublisherPortalRoleForContext(context, {
    kind: "organization",
    publisherId: organizationId,
    displayName: organization.name,
    contactEmail,
  });

  await existing.ref.set(
    withoutUndefined({
      ...existing.data(),
      status: "active",
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUserId: context.uid,
    }),
    { merge: false },
  );

  return {
    decision,
    organization: await getDiscoverOrganization(context, organizationId),
    role,
  };
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

  const inputWithImageUpload = preserveExistingImageUpload(
    scopedInput,
    existingRecord,
  );

  await existing.ref.set(
    withoutUndefined({
      ...existing.data(),
      ...individualDocument(inputWithImageUpload, context),
    }),
    { merge: false },
  );

  return getDiscoverIndividual(context, individualId);
}

export async function deleteDiscoverIndividual(
  context: AdminContext,
  individualId: string,
) {
  requireGodMode(context);
  const existing = await getIndividualSnapshot(individualId);
  if (!existing) {
    throw new AdminRepositoryError("Individual publisher not found.", 404);
  }

  const deletedFeedItemCount = await deleteFeedItemsForPublisher(
    "publisherIndividualId",
    individualId,
  );
  await adminDb.collection(INDIVIDUALS_COLLECTION).doc(individualId).delete();

  return { deleted: true, individualId, deletedFeedItemCount };
}

export async function evaluateDiscoverIndividualSubmission(
  context: AdminContext,
  individualId: string,
  decision: SubmissionEvaluationDecision,
) {
  requireFullAdmin(context);
  const existing = await getIndividualSnapshot(individualId);
  if (!existing) {
    throw new AdminRepositoryError("Individual publisher not found.", 404);
  }

  const individual = toIndividualRecord(existing);
  if (decision === "reject") {
    await existing.ref.set(
      withoutUndefined({
        ...existing.data(),
        status: "archived",
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUserId: context.uid,
      }),
      { merge: false },
    );

    return {
      decision,
      individual: await getDiscoverIndividual(context, individualId),
      role: null,
    };
  }

  const contactEmail = normalizeOptionalString(individual.contactEmail);
  if (!contactEmail) {
    throw new AdminRepositoryError(
      "A contact email is required to approve this individual publisher.",
      400,
    );
  }

  const role = await provisionPublisherPortalRoleForContext(context, {
    kind: "individual",
    publisherId: individualId,
    displayName: individual.name,
    contactEmail,
  });

  await existing.ref.set(
    withoutUndefined({
      ...existing.data(),
      status: "active",
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUserId: context.uid,
    }),
    { merge: false },
  );

  return {
    decision,
    individual: await getDiscoverIndividual(context, individualId),
    role,
  };
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

  const document = await feedItemDocument(
    feedItemId,
    input,
    context,
    existing.data(),
  );
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
  const sourcePayload = source[source.type] as
    Record<string, unknown> | undefined;
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
    htmlBody: source.htmlBody,
    imageUrl: source.imageUrl,
    sourceUrl: source.sourceUrl,
    sourceButtonText: source.sourceButtonText,
    [source.type]: {
      ...sourcePayload,
    },
  };

  return createDiscoverFeedItem(context, duplicateInput);
}
