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
  | "reproductive"
  | "ophthalmics"
  | "full_genome"
  | "raw_pdf"
  | "raw_vcf"
  | "other";
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
  status: DiscoverOrganizationStatus;
  slug?: string;
  websiteUrl?: string;
  description?: string;
  description_en?: string;
  social?: DiscoverPublisherSocialLinks;
  countryCode?: string;
  organizationType?: string;
  color_hex?: string;
  verified: boolean;
  is_genetic_report_provider: boolean;
  genetic_report_category: DiscoverGeneticReportCategory | null;
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
  status: DiscoverIndividualStatus;
  slug?: string;
  websiteUrl?: string;
  description?: string;
  description_en?: string;
  social?: DiscoverPublisherSocialLinks;
  countryCode?: string;
  individualType?: string;
  color_hex?: string;
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
  html_body: string | null;
  image_url: string | null;
  source_url: string | null;
  source_button_text: string | null;
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
  { value: "reproductive", label: "Reproductive" },
  { value: "ophthalmics", label: "Ophthalmics" },
  { value: "full_genome", label: "Full genome" },
  { value: "raw_pdf", label: "Raw PDF" },
  { value: "raw_vcf", label: "Raw VCF" },
  { value: "other", label: "Other" },
] as const satisfies readonly {
  value: DiscoverGeneticReportCategory;
  label: string;
}[];

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
        key: "research_topic",
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
      { key: "max_attendance", label: "Max attendance", kind: "integer" },
    ],
  },
  {
    value: "opportunity",
    label: "Opportunity",
    defaultCta: "View opportunity",
    fields: [
      {
        key: "opportunity_type",
        label: "Opportunity type",
        kind: "string",
        aliases: ["opportunityType"],
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
      { key: "duration_seconds", label: "Duration seconds", kind: "integer" },
      { key: "presenters", label: "Presenters", kind: "array" },
      { key: "caption_languages", label: "Caption languages", kind: "array" },
    ],
  },
  {
    value: "external_article",
    label: "Article",
    defaultCta: "Read article",
    fields: [
      { key: "publication_name", label: "Publication name", kind: "string" },
      { key: "authors", label: "Authors", kind: "array" },
      { key: "article_date", label: "Article date", kind: "timestamp" },
      { key: "section", label: "Section", kind: "string" },
    ],
  },
  {
    value: "podcast_episode",
    label: "Podcast episode",
    defaultCta: "Listen now",
    fields: [
      { key: "podcast_name", label: "Podcast name", kind: "string" },
      { key: "episode_number", label: "Episode number", kind: "string" },
      { key: "duration_seconds", label: "Duration seconds", kind: "integer" },
      { key: "hosts", label: "Hosts", kind: "array" },
      { key: "guests", label: "Guests", kind: "array" },
    ],
  },
  {
    value: "survey",
    label: "Survey",
    defaultCta: "Complete survey",
    fields: [
      { key: "estimated_minutes", label: "Estimated minutes", kind: "integer" },
      { key: "closing_date", label: "Closing date", kind: "timestamp" },
      { key: "target_audience", label: "Target audience", kind: "string", control: "textarea" },
      { key: "anonymous", label: "Anonymous", kind: "boolean" },
    ],
  },
  {
    value: "organization_spotlight",
    label: "Organization spotlight",
    defaultCta: "Meet the organization",
    fields: [
      { key: "featured_organization_id", label: "Featured organization ID", kind: "string" },
      { key: "focus_conditions", label: "Focus conditions", kind: "array" },
      { key: "services", label: "Services", kind: "array" },
      { key: "service_regions", label: "Service regions", kind: "array" },
    ],
  },
  {
    value: "professional_spotlight",
    label: "Professional spotlight",
    defaultCta: "Meet the professional",
    fields: [
      { key: "featured_individual_id", label: "Featured individual ID", kind: "string" },
      { key: "specialties", label: "Specialties", kind: "array" },
      { key: "languages", label: "Languages", kind: "array" },
      { key: "service_regions", label: "Service regions", kind: "array" },
    ],
  },
  {
    value: "community_invitation",
    label: "Community invitation",
    defaultCta: "Join the community",
    fields: [
      { key: "community_type", label: "Community type", kind: "string" },
      { key: "target_audience", label: "Target audience", kind: "string", control: "textarea" },
      { key: "access_type", label: "Access type", kind: "string" },
      { key: "community_languages", label: "Community languages", kind: "array" },
      { key: "moderated", label: "Moderated", kind: "boolean" },
    ],
  },
  {
    value: "bioinformatics_tool",
    label: "Bioinformatics tool",
    defaultCta: "Explore the tool",
    fields: [
      { key: "tool_name", label: "Tool name", kind: "string" },
      { key: "tool_category", label: "Tool category", kind: "string" },
      { key: "input_formats", label: "Input formats", kind: "array" },
      { key: "technical_level", label: "Technical level", kind: "string" },
      { key: "license_model", label: "License model", kind: "string" },
    ],
  },
  {
    value: "genomic_database",
    label: "Genomic database",
    defaultCta: "Search the database",
    fields: [
      { key: "resource_name", label: "Resource name", kind: "string" },
      { key: "data_scope", label: "Data scope", kind: "string", control: "textarea" },
      { key: "supported_species", label: "Supported species", kind: "array" },
      { key: "access_model", label: "Access model", kind: "string" },
      { key: "update_frequency", label: "Update frequency", kind: "string" },
    ],
  },
  {
    value: "health_guidance",
    label: "Health guidance",
    defaultCta: "View guidance",
    fields: [
      { key: "target_audience", label: "Target audience", kind: "string", control: "textarea" },
      { key: "reviewed_by", label: "Reviewed by", kind: "string" },
      { key: "reviewed_at", label: "Reviewed at", kind: "timestamp" },
      { key: "evidence_level", label: "Evidence level", kind: "string" },
      { key: "urgency_level", label: "Urgency level", kind: "string" },
    ],
  },
  {
    value: "educational_explainer",
    label: "Educational explainer",
    defaultCta: "Start learning",
    fields: [
      { key: "topic", label: "Topic", kind: "string" },
      { key: "difficulty_level", label: "Difficulty level", kind: "string" },
      { key: "estimated_minutes", label: "Estimated minutes", kind: "integer" },
      { key: "learning_objectives", label: "Learning objectives", kind: "array" },
    ],
  },
  {
    value: "gene_spotlight",
    label: "Gene spotlight",
    defaultCta: "Explore the gene",
    fields: [
      { key: "gene_symbol", label: "Gene symbol", kind: "string" },
      { key: "gene_name", label: "Gene name", kind: "string" },
      { key: "inheritance_modes", label: "Inheritance modes", kind: "array" },
      { key: "related_conditions", label: "Related conditions", kind: "array" },
    ],
  },
  {
    value: "condition_spotlight",
    label: "Condition spotlight",
    defaultCta: "Learn about the condition",
    fields: [
      { key: "condition_name", label: "Condition name", kind: "string" },
      { key: "ontology_ids", label: "Ontology IDs", kind: "array" },
      { key: "related_genes", label: "Related genes", kind: "array" },
      { key: "inheritance_modes", label: "Inheritance modes", kind: "array" },
    ],
  },
  {
    value: "genetic_test_guide",
    label: "Genetic test guide",
    defaultCta: "View testing guide",
    fields: [
      { key: "test_type", label: "Test type", kind: "string" },
      { key: "sample_types", label: "Sample types", kind: "array" },
      { key: "intended_use", label: "Intended use", kind: "string", control: "textarea" },
      { key: "turnaround_time", label: "Turnaround time", kind: "string" },
      { key: "requires_prescription", label: "Requires prescription", kind: "boolean" },
    ],
  },
  {
    value: "report_explainer",
    label: "Report explainer",
    defaultCta: "Understand this result",
    fields: [
      { key: "report_section", label: "Report section", kind: "string" },
      { key: "concepts_covered", label: "Concepts covered", kind: "array" },
      { key: "reading_level", label: "Reading level", kind: "string" },
      { key: "related_genes", label: "Related genes", kind: "array" },
    ],
  },
  {
    value: "clinical_guideline",
    label: "Clinical guideline",
    defaultCta: "Open guideline",
    fields: [
      { key: "issuing_body", label: "Issuing body", kind: "string" },
      { key: "version", label: "Version", kind: "string" },
      { key: "release_date", label: "Release date", kind: "timestamp" },
      { key: "target_professions", label: "Target professions", kind: "array" },
      { key: "guideline_status", label: "Guideline status", kind: "string" },
    ],
  },
  {
    value: "clinical_trial",
    label: "Clinical trial",
    defaultCta: "View trial",
    fields: [
      { key: "trial_identifier", label: "Trial identifier", kind: "string" },
      { key: "phase", label: "Phase", kind: "string" },
      { key: "recruitment_status", label: "Recruitment status", kind: "string" },
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
      { key: "registry_name", label: "Registry name", kind: "string" },
      { key: "enrollment_status", label: "Enrollment status", kind: "string" },
      { key: "conditions", label: "Conditions", kind: "array" },
      { key: "eligible_population", label: "Eligible population", kind: "string", control: "textarea" },
      { key: "countries", label: "Countries", kind: "array" },
    ],
  },
  {
    value: "research_participation",
    label: "Research participation",
    defaultCta: "See if you are eligible",
    fields: [
      { key: "study_identifier", label: "Study identifier", kind: "string" },
      { key: "study_type", label: "Study type", kind: "string" },
      { key: "recruitment_status", label: "Recruitment status", kind: "string" },
      { key: "eligibility_summary", label: "Eligibility summary", kind: "string", control: "textarea" },
      { key: "participation_mode", label: "Participation mode", kind: "string" },
      { key: "end_date", label: "End date", kind: "timestamp" },
    ],
  },
  {
    value: "screening_program",
    label: "Screening program",
    defaultCta: "Find screening",
    fields: [
      { key: "screening_type", label: "Screening type", kind: "string" },
      { key: "eligible_population", label: "Eligible population", kind: "string", control: "textarea" },
      { key: "start_date", label: "Start date", kind: "timestamp" },
      { key: "end_date", label: "End date", kind: "timestamp" },
      { key: "locations", label: "Locations", kind: "array" },
      { key: "cost_note", label: "Cost note", kind: "string", control: "textarea" },
    ],
  },
  {
    value: "support_service",
    label: "Support service",
    defaultCta: "Access support",
    fields: [
      { key: "service_type", label: "Service type", kind: "string" },
      { key: "availability", label: "Availability", kind: "string" },
      { key: "delivery_mode", label: "Delivery mode", kind: "string" },
      { key: "languages", label: "Languages", kind: "array" },
      { key: "eligibility_summary", label: "Eligibility summary", kind: "string", control: "textarea" },
      { key: "regions", label: "Regions", kind: "array" },
    ],
  },
  {
    value: "course",
    label: "Course",
    defaultCta: "Start course",
    fields: [
      { key: "delivery_mode", label: "Delivery mode", kind: "string" },
      { key: "difficulty_level", label: "Difficulty level", kind: "string" },
      { key: "duration", label: "Duration", kind: "string" },
      { key: "target_audience", label: "Target audience", kind: "string", control: "textarea" },
      { key: "certificate_available", label: "Certificate available", kind: "boolean" },
    ],
  },
  {
    value: "downloadable_resource",
    label: "Downloadable resource",
    defaultCta: "Download resource",
    fields: [
      { key: "file_type", label: "File type", kind: "string" },
      { key: "page_count", label: "Page count", kind: "integer" },
      { key: "file_size", label: "File size", kind: "string" },
      { key: "resource_languages", label: "Resource languages", kind: "array" },
      { key: "target_audience", label: "Target audience", kind: "string", control: "textarea" },
    ],
  },
  {
    value: "lived_experience_story",
    label: "Patient or caregiver story",
    defaultCta: "Read the story",
    fields: [
      { key: "perspective", label: "Perspective", kind: "string" },
      { key: "conditions", label: "Conditions", kind: "array" },
      { key: "life_stage", label: "Life stage", kind: "string" },
      { key: "topics", label: "Topics", kind: "array" },
      { key: "content_warning", label: "Content warning", kind: "string", control: "textarea" },
    ],
  },
  {
    value: "expert_qa",
    label: "Expert Q&A",
    defaultCta: "Read the Q&A",
    fields: [
      { key: "expert_name", label: "Expert name", kind: "string" },
      { key: "credentials", label: "Credentials", kind: "string" },
      { key: "specialty", label: "Specialty", kind: "string" },
      { key: "questions_count", label: "Questions count", kind: "integer" },
      { key: "recorded_at", label: "Recorded at", kind: "timestamp" },
    ],
  },
  {
    value: "advocacy_campaign",
    label: "Advocacy campaign",
    defaultCta: "Take action",
    fields: [
      { key: "campaign_type", label: "Campaign type", kind: "string" },
      { key: "organizer", label: "Organizer", kind: "string" },
      { key: "target_region", label: "Target region", kind: "string" },
      { key: "deadline", label: "Deadline", kind: "timestamp" },
      { key: "campaign_goal", label: "Campaign goal", kind: "string", control: "textarea" },
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
  category: DiscoverGeneticReportCategory | null | undefined,
) {
  if (!category) {
    return "No genetic report category";
  }

  return (
    DISCOVER_GENETIC_REPORT_CATEGORY_OPTIONS.find(
      (option) => option.value === category,
    )?.label ?? category
  );
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
