import type { LucideIcon } from "lucide-react";
import type { AdminRole } from "./admin-areas";

export type AccentTone = "blue" | "rose" | "green" | "red" | "amber" | "neutral";
export type ReportSourceKey = "myDNAMap" | "ActyonGenomics" | "vcf";
export type AdminSectionKey =
  | "mission"
  | "accounts"
  | "community"
  | "reports"
  | "learning"
  | "areas"
  | "access"
  | "gym-overview"
  | "gym-members"
  | "gym-scheduling"
  | "gym-programs";
export type CollectionKey =
  | "profiles"
  | "public_profiles"
  | "community_users"
  | "community_posts"
  | "report_codes"
  | "uploaded_reports"
  | "file_storage"
  | "report_owners"
  | "user_progress";
export type SubcollectionKey = "comments" | "events";

export interface AdminBadge {
  label: string;
  tone?: AccentTone;
  style?: "default" | "tag";
}

export interface RelatedRecordLink {
  label: string;
  href: string;
  description: string;
  tone?: AccentTone;
}

export interface ModerationDocumentRecord {
  id: string;
  path: string;
  collection: string;
  data: Record<string, unknown>;
}

export interface CollectionBrowseRecord {
  title: string;
  subtitle: string;
  code?: string;
  timestamp?: unknown;
  badges: AdminBadge[];
}

export interface CollectionSubsectionConfig {
  key: SubcollectionKey;
  title: string;
  description: string;
}

export interface CollectionConfig {
  key: CollectionKey;
  section: AdminSectionKey;
  navLabel: string;
  title: string;
  description: string;
  helperTitle: string;
  helperBody: string;
  accent: AccentTone;
  icon: LucideIcon;
  subcollections?: CollectionSubsectionConfig[];
  getBrowseRecord: (document: ModerationDocumentRecord) => CollectionBrowseRecord;
  getRelatedLinks: (
    documentId: string,
    data: Record<string, unknown>
  ) => RelatedRecordLink[];
}

export interface AdminNavItem {
  section: AdminSectionKey;
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
  matchPrefix?: string;
  visibleRoles?: AdminRole[];
}

export interface SectionDescriptor {
  key: AdminSectionKey;
  label: string;
  description: string;
  visibleRoles?: AdminRole[];
}

export interface ChromeMetadata {
  eyebrow: string;
  title: string;
  description: string;
}

export interface AdminUserRecord {
  uid: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
  lastSignInAt: string;
  photoURL: string | null;
  displayName: string;
  age?: number | string;
  sex?: string;
  country?: string;
  conditions: string[];
  onboardingCompleted: boolean;
  visibilitySettings?: Record<string, boolean>;
  lastReportDate?: string;
  patientID?: string;
  profileImage?: string;
  hiddenFields: string[];
  iconName: string;
  iconColorHex: string;
  linkedRecords?: {
    profile: boolean;
    publicProfile: boolean;
    communityUser: boolean;
    reportOwner: boolean;
    userProgress: boolean;
  };
}

export interface AdminUserVerificationSummary {
  uid: string;
  exists: boolean;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
}

export interface AdminReportRecord {
  id: string;
  code: string;
  source: ReportSourceKey;
  userId: string;
  downloadUrl: string | null;
  createdAt?: string;
  uploadedReportId?: string;
  linkedFileId?: string | null;
  fileName?: string | null;
  providerFormat?: string | null;
  providerName?: string | null;
  trackingStatus?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerCommunityUserId?: string | null;
  ownerPublicProfileId?: string | null;
  uploadVersionCount?: number;
}

export interface AdminUserProgressRecord {
  uid: string;
  xp: number;
  level: number;
  completedLessons: string[];
  collectedAminoAcids: Array<{
    id: string;
    name: string;
    earnedAt: string;
  }>;
  streak: {
    current: number;
    longest: number;
    lastActivityDate: string;
  };
}

export interface DashboardStats {
  accounts: {
    authUsers: number;
    authUsersExact: boolean;
    profiles: number;
    publicProfiles: number;
    communityUsers: number;
  };
  reports: {
    reportCodes: number;
    uploadedReports: number;
    fileStorage: number;
    reportOwners: number;
  };
  community: {
    posts: number;
    comments: number;
    events: number;
  };
  learning: {
    progressRecords: number;
  };
}
