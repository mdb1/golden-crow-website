import {
  DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS,
  DISCOVER_ORGANIZATION_CATEGORY_OPTIONS,
  discoverIndividualCategoryProvider,
  discoverOrganizationCategoryProvider,
  type DiscoverIndividualCategoryKey,
  type DiscoverOrganizationCategoryKey,
} from "./discover-publisher-categories";

export type DiscoverOrganizationStatus =
  | "active"
  | "inactive"
  | "archived"
  | "pending_approval";
export type DiscoverOrganizationType = DiscoverOrganizationCategoryKey;
export type DiscoverIndividualStatus = DiscoverOrganizationStatus;
export type DiscoverIndividualType = DiscoverIndividualCategoryKey;
export type DiscoverGeneticReportCategory =
  | "grc_reproductive"
  | "grc_ophthalmics"
  | "grc_full_genome"
  | "grc_cardiovascular"
  | "grc_rare_diseases"
  | "grc_neurological"
  | "grc_prenatal"
  | "grc_nutrition_and_metabolism"
  | "grc_ancestry"
  | "grc_hereditary_cancer"
  | "grc_other";
export type DiscoverPublisherSocialKey =
  | "facebook"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "github"
  | "gitlab"
  | "stack_overflow"
  | "hugging_face"
  | "kaggle"
  | "researchgate"
  | "orcid"
  | "google_scholar"
  | "pubmed"
  | "scopus"
  | "web_of_science"
  | "biostars"
  | "protocols_io"
  | "osf"
  | "zenodo"
  | "whatsapp"
  | "telegram"
  | "threads"
  | "pinterest"
  | "snapchat"
  | "reddit"
  | "discord"
  | "twitch"
  | "bluesky"
  | "mastodon"
  | "email"
  | "other";
export type DiscoverPublisherSocialLinks = Partial<
  Record<DiscoverPublisherSocialKey, string>
>;

export interface DiscoverOrganizationRecord {
  id: string;
  name: string;
  imageUrl: string | null;
  imageUploadDataUrl?: string;
  imageUploadName?: string;
  imageUploadMimeType?: string;
  status: DiscoverOrganizationStatus;
  slug?: string;
  websiteUrl?: string;
  description?: string;
  descriptionEn?: string;
  social?: DiscoverPublisherSocialLinks;
  countryCode?: string;
  organizationType?: string;
  colorHex?: string;
  verified: boolean;
  isGeneticReportProvider: boolean;
  geneticReportCategory: string | null;
  contactEmail?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export interface DiscoverIndividualRecord {
  id: string;
  name: string;
  imageUrl: string | null;
  imageUploadDataUrl?: string;
  imageUploadName?: string;
  imageUploadMimeType?: string;
  status: DiscoverIndividualStatus;
  slug?: string;
  websiteUrl?: string;
  description?: string;
  descriptionEn?: string;
  social?: DiscoverPublisherSocialLinks;
  countryCode?: string;
  individualType?: string;
  colorHex?: string;
  verified: boolean;
  contactEmail?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export const DISCOVER_FEED_TYPES = [
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
] as const;

export type DiscoverFeedType = (typeof DISCOVER_FEED_TYPES)[number];
export type DiscoverFeedStatus =
  | "draft"
  | "published"
  | "archived";

export interface DiscoverPublisherSnapshot {
  name: string;
  imageUrl: string | null;
}

export type DiscoverFeedPayloadNodes = {
  [Type in DiscoverFeedType]?: Record<string, unknown>;
};

export type DiscoverFeedItemRecord = {
  id: string;
  publisherOrganizationId: string | null;
  publisherIndividualId: string | null;
  publisherSnapshot: DiscoverPublisherSnapshot;
  type: DiscoverFeedType;
  publishedAt: string | null;
  language: "en" | "es";
  title: string;
  subtitle: string;
  body: string;
  htmlBody: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceButtonText: string | null;
  status: DiscoverFeedStatus;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  archivedAt?: string | null;
} & DiscoverFeedPayloadNodes;

export interface DiscoverOrganizationsPage {
  organizations: DiscoverOrganizationRecord[];
  nextCursor: string | null;
}

export interface DiscoverIndividualsPage {
  individuals: DiscoverIndividualRecord[];
  nextCursor: string | null;
}

export interface DiscoverFeedItemsPage {
  feedItems: DiscoverFeedItemRecord[];
  nextCursor: string | null;
}

export const DISCOVER_ORGANIZATION_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
  { value: "pending_approval", label: "Pending approval" },
] as const;

export const DISCOVER_GENETIC_REPORT_CATEGORY_OPTIONS = [
  { value: "grc_reproductive", label: "Reproductive" },
  { value: "grc_ophthalmics", label: "Ophthalmics" },
  { value: "grc_full_genome", label: "Full genome" },
  { value: "grc_cardiovascular", label: "Cardiovascular" },
  { value: "grc_rare_diseases", label: "Rare diseases" },
  { value: "grc_neurological", label: "Neurological" },
  { value: "grc_prenatal", label: "Prenatal" },
  { value: "grc_nutrition_and_metabolism", label: "Nutrition and metabolism" },
  { value: "grc_ancestry", label: "Ancestry" },
  { value: "grc_hereditary_cancer", label: "Hereditary cancer" },
  { value: "grc_other", label: "Other" },
] as const satisfies readonly {
  value: DiscoverGeneticReportCategory;
  label: string;
}[];

const DISCOVER_GENETIC_REPORT_CATEGORY_KEYS = new Set(
  DISCOVER_GENETIC_REPORT_CATEGORY_OPTIONS.map((option) => option.value),
);

export const discoverGeneticReportCategoryProvider = {
  optionCount: DISCOVER_GENETIC_REPORT_CATEGORY_OPTIONS.length,
  options: DISCOVER_GENETIC_REPORT_CATEGORY_OPTIONS,
  parse: parseDiscoverGeneticReportCategoryKeys,
  serialize: serializeDiscoverGeneticReportCategoryKeys,
};

export const DISCOVER_ORGANIZATION_TYPE_OPTIONS =
  DISCOVER_ORGANIZATION_CATEGORY_OPTIONS;

export const DISCOVER_INDIVIDUAL_TYPE_OPTIONS =
  DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS;

export type DiscoverFeedPayloadFieldKind =
  | "string"
  | "array"
  | "timestamp"
  | "integer"
  | "boolean";

export type DiscoverFeedPayloadFieldControl =
  | "input"
  | "textarea"
  | "location"
  | "region";

export interface DiscoverFeedPayloadFieldDefinition {
  key: string;
  label: string;
  kind: DiscoverFeedPayloadFieldKind;
  required?: boolean;
  control?: DiscoverFeedPayloadFieldControl;
  aliases?: readonly string[];
}

export interface DiscoverFeedTypeDefinition {
  value: DiscoverFeedType;
  label: string;
  defaultCta: string;
  fields: readonly DiscoverFeedPayloadFieldDefinition[];
}

export const DISCOVER_FEED_TYPE_DEFINITIONS: readonly DiscoverFeedTypeDefinition[] = [
  {
    value: "news",
    label: "News",
    defaultCta: "Read more",
    fields: [
      { key: "category", label: "Category", kind: "string" },
      { key: "region", label: "Region", kind: "string", control: "region" },
    ],
  },
  {
    value: "research_update",
    label: "Research update",
    defaultCta: "Open study",
    fields: [
      {
        key: "researchTopic",
        label: "Research topic",
        kind: "string",
        aliases: ["topic"],
      },
      { key: "genes", label: "Genes", kind: "array" },
      { key: "conditions", label: "Conditions", kind: "array" },
      { key: "journal", label: "Journal", kind: "string", aliases: ["journalName"] },
    ],
  },
  {
    value: "upcoming_event",
    label: "Upcoming event",
    defaultCta: "Register now",
    fields: [
      {
        key: "date",
        label: "Event date",
        kind: "timestamp",
        required: true,
        aliases: ["startsAt"],
      },
      { key: "location", label: "Location", kind: "string", control: "location", aliases: ["locationName"] },
      { key: "maxAttendance", label: "Max attendance", kind: "integer" },
    ],
  },
  {
    value: "opportunity",
    label: "Opportunity",
    defaultCta: "View opportunity",
    fields: [
      {
        key: "opportunityType",
        label: "Opportunity type",
        kind: "string",
      },
      { key: "requirements", label: "Requirements", kind: "string", control: "textarea" },
      { key: "eligibility", label: "Eligibility", kind: "string", control: "textarea" },
      { key: "location", label: "Location", kind: "string", control: "location", aliases: ["locationName"] },
    ],
  },
  {
    value: "video",
    label: "Video",
    defaultCta: "Watch video",
    fields: [
      { key: "provider", label: "Provider", kind: "string" },
      { key: "durationSeconds", label: "Duration seconds", kind: "integer" },
      { key: "presenters", label: "Presenters", kind: "array" },
      { key: "captionLanguages", label: "Caption languages", kind: "array" },
    ],
  },
  {
    value: "external_article",
    label: "Article",
    defaultCta: "Read article",
    fields: [
      { key: "publicationName", label: "Publication name", kind: "string" },
      { key: "authors", label: "Authors", kind: "array" },
      { key: "articleDate", label: "Article date", kind: "timestamp" },
      { key: "section", label: "Section", kind: "string" },
    ],
  },
  {
    value: "podcast_episode",
    label: "Podcast episode",
    defaultCta: "Listen now",
    fields: [
      { key: "podcastName", label: "Podcast name", kind: "string" },
      { key: "episodeNumber", label: "Episode number", kind: "string" },
      { key: "durationSeconds", label: "Duration seconds", kind: "integer" },
      { key: "hosts", label: "Hosts", kind: "array" },
      { key: "guests", label: "Guests", kind: "array" },
    ],
  },
  {
    value: "survey",
    label: "Survey",
    defaultCta: "Complete survey",
    fields: [
      { key: "estimatedMinutes", label: "Estimated minutes", kind: "integer" },
      { key: "closingDate", label: "Closing date", kind: "timestamp" },
      { key: "targetAudience", label: "Target audience", kind: "string", control: "textarea" },
      { key: "anonymous", label: "Anonymous", kind: "boolean" },
    ],
  },
  {
    value: "organization_spotlight",
    label: "Organization spotlight",
    defaultCta: "Meet the organization",
    fields: [
      { key: "featuredOrganizationId", label: "Featured organization ID", kind: "string" },
      { key: "focusConditions", label: "Focus conditions", kind: "array" },
      { key: "services", label: "Services", kind: "array" },
      { key: "serviceRegions", label: "Service regions", kind: "array" },
    ],
  },
  {
    value: "professional_spotlight",
    label: "Professional spotlight",
    defaultCta: "Meet the professional",
    fields: [
      { key: "featuredIndividualId", label: "Featured individual ID", kind: "string" },
      { key: "specialties", label: "Specialties", kind: "array" },
      { key: "languages", label: "Languages", kind: "array" },
      { key: "serviceRegions", label: "Service regions", kind: "array" },
    ],
  },
  {
    value: "community_invitation",
    label: "Community invitation",
    defaultCta: "Join the community",
    fields: [
      { key: "communityType", label: "Community type", kind: "string" },
      { key: "targetAudience", label: "Target audience", kind: "string", control: "textarea" },
      { key: "accessType", label: "Access type", kind: "string" },
      { key: "communityLanguages", label: "Community languages", kind: "array" },
      { key: "moderated", label: "Moderated", kind: "boolean" },
    ],
  },
  {
    value: "bioinformatics_tool",
    label: "Bioinformatics tool",
    defaultCta: "Explore the tool",
    fields: [
      { key: "toolName", label: "Tool name", kind: "string" },
      { key: "toolCategory", label: "Tool category", kind: "string" },
      { key: "inputFormats", label: "Input formats", kind: "array" },
      { key: "technicalLevel", label: "Technical level", kind: "string" },
      { key: "licenseModel", label: "License model", kind: "string" },
    ],
  },
  {
    value: "genomic_database",
    label: "Genomic database",
    defaultCta: "Search the database",
    fields: [
      { key: "resourceName", label: "Resource name", kind: "string" },
      { key: "dataScope", label: "Data scope", kind: "string", control: "textarea" },
      { key: "supportedSpecies", label: "Supported species", kind: "array" },
      { key: "accessModel", label: "Access model", kind: "string" },
      { key: "updateFrequency", label: "Update frequency", kind: "string" },
    ],
  },
  {
    value: "health_guidance",
    label: "Health guidance",
    defaultCta: "View guidance",
    fields: [
      { key: "targetAudience", label: "Target audience", kind: "string", control: "textarea" },
      { key: "reviewedBy", label: "Reviewed by", kind: "string" },
      { key: "reviewedAt", label: "Reviewed at", kind: "timestamp" },
      { key: "evidenceLevel", label: "Evidence level", kind: "string" },
      { key: "urgencyLevel", label: "Urgency level", kind: "string" },
    ],
  },
  {
    value: "educational_explainer",
    label: "Educational explainer",
    defaultCta: "Start learning",
    fields: [
      { key: "topic", label: "Topic", kind: "string" },
      { key: "difficultyLevel", label: "Difficulty level", kind: "string" },
      { key: "estimatedMinutes", label: "Estimated minutes", kind: "integer" },
      { key: "learningObjectives", label: "Learning objectives", kind: "array" },
    ],
  },
  {
    value: "gene_spotlight",
    label: "Gene spotlight",
    defaultCta: "Explore the gene",
    fields: [
      { key: "geneSymbol", label: "Gene symbol", kind: "string" },
      { key: "geneName", label: "Gene name", kind: "string" },
      { key: "inheritanceModes", label: "Inheritance modes", kind: "array" },
      { key: "relatedConditions", label: "Related conditions", kind: "array" },
    ],
  },
  {
    value: "condition_spotlight",
    label: "Condition spotlight",
    defaultCta: "Learn about the condition",
    fields: [
      { key: "conditionName", label: "Condition name", kind: "string" },
      { key: "ontologyIds", label: "Ontology IDs", kind: "array" },
      { key: "relatedGenes", label: "Related genes", kind: "array" },
      { key: "inheritanceModes", label: "Inheritance modes", kind: "array" },
    ],
  },
  {
    value: "genetic_test_guide",
    label: "Genetic test guide",
    defaultCta: "View testing guide",
    fields: [
      { key: "testType", label: "Test type", kind: "string" },
      { key: "sampleTypes", label: "Sample types", kind: "array" },
      { key: "intendedUse", label: "Intended use", kind: "string", control: "textarea" },
      { key: "turnaroundTime", label: "Turnaround time", kind: "string" },
      { key: "requiresPrescription", label: "Requires prescription", kind: "boolean" },
    ],
  },
  {
    value: "report_explainer",
    label: "Report explainer",
    defaultCta: "Understand this result",
    fields: [
      { key: "reportSection", label: "Report section", kind: "string" },
      { key: "conceptsCovered", label: "Concepts covered", kind: "array" },
      { key: "readingLevel", label: "Reading level", kind: "string" },
      { key: "relatedGenes", label: "Related genes", kind: "array" },
    ],
  },
  {
    value: "clinical_guideline",
    label: "Clinical guideline",
    defaultCta: "Open guideline",
    fields: [
      { key: "issuingBody", label: "Issuing body", kind: "string" },
      { key: "version", label: "Version", kind: "string" },
      { key: "releaseDate", label: "Release date", kind: "timestamp" },
      { key: "targetProfessions", label: "Target professions", kind: "array" },
      { key: "guidelineStatus", label: "Guideline status", kind: "string" },
    ],
  },
  {
    value: "clinical_trial",
    label: "Clinical trial",
    defaultCta: "View trial",
    fields: [
      { key: "trialIdentifier", label: "Trial identifier", kind: "string" },
      { key: "phase", label: "Phase", kind: "string" },
      { key: "recruitmentStatus", label: "Recruitment status", kind: "string" },
      { key: "conditions", label: "Conditions", kind: "array" },
      { key: "countries", label: "Countries", kind: "array" },
      { key: "sponsor", label: "Sponsor", kind: "string" },
    ],
  },
  {
    value: "patient_registry",
    label: "Patient registry",
    defaultCta: "Join the registry",
    fields: [
      { key: "registryName", label: "Registry name", kind: "string" },
      { key: "enrollmentStatus", label: "Enrollment status", kind: "string" },
      { key: "conditions", label: "Conditions", kind: "array" },
      { key: "eligiblePopulation", label: "Eligible population", kind: "string", control: "textarea" },
      { key: "countries", label: "Countries", kind: "array" },
    ],
  },
  {
    value: "research_participation",
    label: "Research participation",
    defaultCta: "See if you are eligible",
    fields: [
      { key: "studyIdentifier", label: "Study identifier", kind: "string" },
      { key: "studyType", label: "Study type", kind: "string" },
      { key: "recruitmentStatus", label: "Recruitment status", kind: "string" },
      { key: "eligibilitySummary", label: "Eligibility summary", kind: "string", control: "textarea" },
      { key: "participationMode", label: "Participation mode", kind: "string" },
      { key: "endDate", label: "End date", kind: "timestamp" },
    ],
  },
  {
    value: "screening_program",
    label: "Screening program",
    defaultCta: "Find screening",
    fields: [
      { key: "screeningType", label: "Screening type", kind: "string" },
      { key: "eligiblePopulation", label: "Eligible population", kind: "string", control: "textarea" },
      { key: "startDate", label: "Start date", kind: "timestamp" },
      { key: "endDate", label: "End date", kind: "timestamp" },
      { key: "locations", label: "Locations", kind: "array" },
      { key: "costNote", label: "Cost note", kind: "string", control: "textarea" },
    ],
  },
  {
    value: "support_service",
    label: "Support service",
    defaultCta: "Access support",
    fields: [
      { key: "serviceType", label: "Service type", kind: "string" },
      { key: "availability", label: "Availability", kind: "string" },
      { key: "deliveryMode", label: "Delivery mode", kind: "string" },
      { key: "languages", label: "Languages", kind: "array" },
      { key: "eligibilitySummary", label: "Eligibility summary", kind: "string", control: "textarea" },
      { key: "regions", label: "Regions", kind: "array" },
    ],
  },
  {
    value: "course",
    label: "Course",
    defaultCta: "Start course",
    fields: [
      { key: "deliveryMode", label: "Delivery mode", kind: "string" },
      { key: "difficultyLevel", label: "Difficulty level", kind: "string" },
      { key: "duration", label: "Duration", kind: "string" },
      { key: "targetAudience", label: "Target audience", kind: "string", control: "textarea" },
      { key: "certificateAvailable", label: "Certificate available", kind: "boolean" },
    ],
  },
  {
    value: "downloadable_resource",
    label: "Downloadable resource",
    defaultCta: "Download resource",
    fields: [
      { key: "fileType", label: "File type", kind: "string" },
      { key: "pageCount", label: "Page count", kind: "integer" },
      { key: "fileSize", label: "File size", kind: "string" },
      { key: "resourceLanguages", label: "Resource languages", kind: "array" },
      { key: "targetAudience", label: "Target audience", kind: "string", control: "textarea" },
    ],
  },
  {
    value: "lived_experience_story",
    label: "Patient or caregiver story",
    defaultCta: "Read the story",
    fields: [
      { key: "perspective", label: "Perspective", kind: "string" },
      { key: "conditions", label: "Conditions", kind: "array" },
      { key: "lifeStage", label: "Life stage", kind: "string" },
      { key: "topics", label: "Topics", kind: "array" },
      { key: "contentWarning", label: "Content warning", kind: "string", control: "textarea" },
    ],
  },
  {
    value: "expert_qa",
    label: "Expert Q&A",
    defaultCta: "Read the Q&A",
    fields: [
      { key: "expertName", label: "Expert name", kind: "string" },
      { key: "credentials", label: "Credentials", kind: "string" },
      { key: "specialty", label: "Specialty", kind: "string" },
      { key: "questionsCount", label: "Questions count", kind: "integer" },
      { key: "recordedAt", label: "Recorded at", kind: "timestamp" },
    ],
  },
  {
    value: "advocacy_campaign",
    label: "Advocacy campaign",
    defaultCta: "Take action",
    fields: [
      { key: "campaignType", label: "Campaign type", kind: "string" },
      { key: "organizer", label: "Organizer", kind: "string" },
      { key: "targetRegion", label: "Target region", kind: "string" },
      { key: "deadline", label: "Deadline", kind: "timestamp" },
      { key: "campaignGoal", label: "Campaign goal", kind: "string", control: "textarea" },
    ],
  },
] as const;

export const DISCOVER_FEED_TYPE_OPTIONS = DISCOVER_FEED_TYPE_DEFINITIONS.map(
  ({ value, label }) => ({ value, label }),
) as readonly { value: DiscoverFeedType; label: string }[];

export const DISCOVER_FEED_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

export function discoverTypeLabel(type: DiscoverFeedType) {
  return (
    DISCOVER_FEED_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    type
  );
}

export function discoverFeedTypeDefinition(type: DiscoverFeedType) {
  return (
    DISCOVER_FEED_TYPE_DEFINITIONS.find(
      (definition) => definition.value === type,
    ) ?? DISCOVER_FEED_TYPE_DEFINITIONS[0]
  );
}

export function discoverStatusLabel(status: DiscoverFeedStatus) {
  return (
    DISCOVER_FEED_STATUS_OPTIONS.find((option) => option.value === status)
      ?.label ?? status
  );
}

export function discoverOrganizationStatusLabel(
  status: DiscoverOrganizationStatus,
) {
  return (
    DISCOVER_ORGANIZATION_STATUS_OPTIONS.find(
      (option) => option.value === status,
    )?.label ?? status
  );
}

export function discoverGeneticReportCategoryLabel(
  category: string | null | undefined,
) {
  return discoverGeneticReportCategoryLabels(category).join(", ") ||
    "No genetic report category";
}

export function discoverGeneticReportCategoryLabels(
  category: string | null | undefined,
) {
  return parseDiscoverGeneticReportCategoryKeys(category).map(
    (key) =>
      DISCOVER_GENETIC_REPORT_CATEGORY_OPTIONS.find(
        (option) => option.value === key,
      )?.label ?? key,
  );
}

export function parseDiscoverGeneticReportCategoryKeys(
  value: string | null | undefined,
): DiscoverGeneticReportCategory[] {
  const requested = new Set(
    String(value ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter((token): token is DiscoverGeneticReportCategory =>
        DISCOVER_GENETIC_REPORT_CATEGORY_KEYS.has(
          token as DiscoverGeneticReportCategory,
        ),
      ),
  );

  return DISCOVER_GENETIC_REPORT_CATEGORY_OPTIONS
    .map((option) => option.value)
    .filter((key) => requested.has(key));
}

export function serializeDiscoverGeneticReportCategoryKeys(
  keys: readonly string[],
) {
  return parseDiscoverGeneticReportCategoryKeys(keys.join(",")).join(",");
}

export function discoverGeneticReportCategoryHasKey(
  value: string | null | undefined,
  key: DiscoverGeneticReportCategory,
) {
  return parseDiscoverGeneticReportCategoryKeys(value).includes(key);
}

export function discoverOrganizationTypeLabel(
  type?: string,
) {
  return discoverOrganizationCategoryProvider.formatCsv(type, "Unspecified");
}

export function discoverIndividualTypeLabel(
  type?: string,
) {
  return discoverIndividualCategoryProvider.formatCsv(type, "Unspecified");
}

export function getDiscoverPayload(
  item: Pick<DiscoverFeedItemRecord, "type"> &
    Partial<Pick<DiscoverFeedItemRecord, DiscoverFeedType>>,
) {
  return item[item.type] as Record<string, unknown> | undefined;
}

export function getDiscoverFeedTitle(item: DiscoverFeedItemRecord) {
  return typeof item.title === "string" && item.title.trim()
    ? item.title.trim()
    : "Untitled feed entry";
}

export function getDiscoverFeedSummary(item: DiscoverFeedItemRecord) {
  return typeof item.subtitle === "string" && item.subtitle.trim()
    ? item.subtitle.trim()
    : "No summary";
}

export function stringFromPayload(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function arrayFromPayload(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
