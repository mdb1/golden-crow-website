export type DiscoverOrganizationStatus = "active" | "inactive" | "archived";
export type DiscoverOrganizationType =
  | "foundation"
  | "hospital"
  | "university"
  | "laboratory"
  | "research_institute"
  | "patient_advocacy_group"
  | "public_health_agency"
  | "conference_organizer"
  | "company"
  | "other";

export interface DiscoverOrganizationRecord {
  id: string;
  name: string;
  imageUrl: string | null;
  status: DiscoverOrganizationStatus;
  slug?: string;
  websiteUrl?: string;
  description?: string;
  description_en?: string;
  countryCode?: string;
  organizationType?: DiscoverOrganizationType;
  color_hex?: string;
  verified: boolean;
  contactEmail?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type DiscoverFeedType =
  | "news"
  | "research_update"
  | "upcoming_event"
  | "opportunity";
export type DiscoverFeedStatus =
  | "draft"
  | "published"
  | "archived";

export interface DiscoverPublisherSnapshot {
  name: string;
  imageUrl: string | null;
}

export interface DiscoverFeedItemRecord {
  id: string;
  publisherOrganizationId: string;
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
  status: DiscoverFeedStatus;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  archivedAt?: string | null;
  news?: Record<string, unknown>;
  research_update?: Record<string, unknown>;
  upcoming_event?: Record<string, unknown>;
  opportunity?: Record<string, unknown>;
}

export interface DiscoverOrganizationsPage {
  organizations: DiscoverOrganizationRecord[];
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
] as const;

export const DISCOVER_ORGANIZATION_TYPE_OPTIONS = [
  { value: "foundation", label: "Foundation" },
  { value: "hospital", label: "Hospital" },
  { value: "university", label: "University" },
  { value: "laboratory", label: "Laboratory" },
  { value: "research_institute", label: "Research institute" },
  { value: "patient_advocacy_group", label: "Patient advocacy group" },
  { value: "public_health_agency", label: "Public health agency" },
  { value: "conference_organizer", label: "Conference organizer" },
  { value: "company", label: "Company" },
  { value: "other", label: "Other" },
] as const;

export const DISCOVER_FEED_TYPE_OPTIONS = [
  { value: "news", label: "News" },
  { value: "research_update", label: "Research update" },
  { value: "upcoming_event", label: "Upcoming event" },
  { value: "opportunity", label: "Opportunity" },
] as const;

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

export function discoverOrganizationTypeLabel(
  type?: DiscoverOrganizationType,
) {
  if (!type) {
    return "Unspecified";
  }

  return (
    DISCOVER_ORGANIZATION_TYPE_OPTIONS.find((option) => option.value === type)
      ?.label ?? type
  );
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
