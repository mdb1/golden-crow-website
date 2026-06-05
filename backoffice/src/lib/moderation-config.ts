import {
  Activity,
  Award,
  BookOpen,
  Building2,
  Calendar,
  Dna,
  FileBadge2,
  FileCode2,
  FileSearch,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  ShieldUser,
  Sparkles,
  Stethoscope,
  Trophy,
  UserRoundCog,
  UserPlus,
  Users,
} from "lucide-react";
import type { AdminRole, ProjectKey } from "./admin-areas";
import type {
  AdminNavItem,
  ChromeMetadata,
  CollectionConfig,
  CollectionKey,
  RelatedRecordLink,
  SectionDescriptor,
} from "./moderation-types";
import { GC_FITNESS_NAV, GC_FITNESS_SECTIONS } from "./gc-fitness/nav-config";
import {
  compactList,
  formatDateTime,
  getBoolean,
  getString,
  getStringArray,
  isCollectionKey,
  pickFirstString,
} from "./moderation-utils";
import { getTwoPQAreaConfig, TWO_PQ_AREA_CONFIGS } from "./two-pq-areas";

const FULL_ADMIN_ROLES: AdminRole[] = ["full_admin"];
const AREA_ROLES: AdminRole[] = [
  "full_admin",
  "institution_admin",
  "institution_doctor",
];

export const SECTION_DESCRIPTORS: SectionDescriptor[] = [
  {
    key: "mission",
    label: "Mission",
    description: "Overview and control points for the whole backoffice.",
    visibleRoles: AREA_ROLES,
  },
  {
    key: "accounts",
    label: "Accounts",
    description: "Firebase Auth users and private profile state.",
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    key: "community",
    label: "Community",
    description: "Public profiles, community users, posts, comments, and events.",
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    key: "reports",
    label: "Reports",
    description: "Report codes, uploaded reports, stored files, and owner records.",
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    key: "learning",
    label: "Learning",
    description: "Learning progress and lesson operations.",
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    key: "areas",
    label: "Areas",
    description: "Institution-scoped operations for institutions, doctors, and patients.",
    visibleRoles: AREA_ROLES,
  },
  {
    key: "access",
    label: "Access",
    description: "Role assignments and permission boundaries tied to user emails.",
    visibleRoles: AREA_ROLES,
  },
];

function sameUserLinks(userId: string): RelatedRecordLink[] {
  const encodedUserId = encodeURIComponent(userId);

  return [
    {
      label: "Auth user",
      href: `/users/${encodedUserId}`,
      description: "Firebase Auth state and private profile fields.",
      tone: "blue",
    },
    {
      label: "Private profile",
      href: `/collections/profiles/${encodedUserId}`,
      description: "profiles/{uid} moderation workbench.",
      tone: "blue",
    },
    {
      label: "Public profile",
      href: `/collections/public_profiles/${encodedUserId}`,
      description: "public_profiles/{uid} community-facing profile.",
      tone: "rose",
    },
    {
      label: "Community user",
      href: `/collections/community_users/${encodedUserId}`,
      description: "community_users/{uid} identity and activity state.",
      tone: "rose",
    },
    {
      label: "Report owner",
      href: `/collections/report_owners/${encodedUserId}`,
      description: "report_owners/{uid} report administration profile.",
      tone: "green",
    },
    {
      label: "Learning progress",
      href: `/collections/user_progress/${encodedUserId}`,
      description: "user_progress/{uid} learning record.",
      tone: "green",
    },
  ];
}

export function getUserRelatedLinks(userId: string) {
  return sameUserLinks(userId);
}

function documentLink(
  collectionKey: CollectionKey,
  documentId: string,
  label: string,
  description: string,
  tone: RelatedRecordLink["tone"] = "blue"
): RelatedRecordLink {
  return {
    label,
    href: `/collections/${collectionKey}/${documentId}`,
    description,
    tone,
  };
}

export const COLLECTIONS: Record<CollectionKey, CollectionConfig> = {
  profiles: {
    key: "profiles",
    section: "accounts",
    navLabel: "Private Profiles",
    title: "Private profiles",
    description:
      "Raw profiles/{uid} documents used for onboarding, private account state, and linked moderation fields.",
    helperTitle: "Treat this as the source private profile.",
    helperBody:
      "Review onboarding, hidden fields, identifiers, and report metadata here before changing community-facing records.",
    accent: "blue",
    icon: ShieldUser,
    getBrowseRecord: (document) => {
      const name = pickFirstString(document.data, ["displayName", "fullName"]) ?? document.id;
      const subtitle =
        compactList([
          getString(document.data.country),
          getStringArray(document.data.conditions).slice(0, 2).join(", "),
        ]) || "Private profile document";

      return {
        title: name,
        subtitle,
        code: document.id,
        timestamp: document.data.updatedAt ?? document.data.createdAt,
        badges: [
          {
            label: getBoolean(document.data.onboardingCompleted)
              ? "Onboarded"
              : "Needs onboarding",
            tone: getBoolean(document.data.onboardingCompleted) ? "green" : "amber",
          },
        ],
      };
    },
    getRelatedLinks: (documentId) => sameUserLinks(documentId),
  },
  public_profiles: {
    key: "public_profiles",
    section: "community",
    navLabel: "Public Profiles",
    title: "Public profiles",
    description:
      "Community-facing profile documents with visible bio, identity, and icon data.",
    helperTitle: "Moderate only what the community should see.",
    helperBody:
      "Public profile edits affect avatars, display names, and visible profile fields across the mobile community experience.",
    accent: "rose",
    icon: Users,
    getBrowseRecord: (document) => {
      const title =
        pickFirstString(document.data, ["fullName", "username", "displayName"]) ??
        document.id;
      const subtitle =
        compactList([
          getString(document.data.condition),
          getString(document.data.age),
          getString(document.data.gender),
        ]) || "Community-facing profile";

      return {
        title,
        subtitle,
        code: document.id,
        timestamp: document.data.updatedAt,
        badges: [
          {
            label: getBoolean(document.data.has_profile_image) ? "Has photo" : "No photo",
            tone: getBoolean(document.data.has_profile_image) ? "green" : "neutral",
          },
        ],
      };
    },
    getRelatedLinks: (documentId) => sameUserLinks(documentId),
  },
  community_users: {
    key: "community_users",
    section: "community",
    navLabel: "Community Users",
    title: "Community users",
    description:
      "Community identity records, stats, visibility flags, and nested activity events.",
    helperTitle: "This document controls community identity and activity.",
    helperBody:
      "Review username, icon state, activity visibility, and stats before touching nested events or public profile records.",
    accent: "rose",
    icon: UserRoundCog,
    subcollections: [
      {
        key: "events",
        title: "Activity events",
        description: "Nested community_users/{uid}/events moderation.",
      },
    ],
    getBrowseRecord: (document) => {
      const title =
        pickFirstString(document.data, ["username", "email", "displayName"]) ??
        document.id;
      const stats = document.data.stats as Record<string, unknown> | undefined;

      return {
        title,
        subtitle: getString(document.data.email) ?? "Community identity record",
        code: document.id,
        timestamp: document.data.updatedAt,
        badges: [
          {
            label: getBoolean(document.data.is_activity_public) ? "Activity public" : "Activity private",
            tone: getBoolean(document.data.is_activity_public) ? "green" : "amber",
          },
          ...(stats && typeof stats === "object"
            ? [
                {
                  label: `${Number(stats.posts_created ?? 0)} posts`,
                  tone: "neutral" as const,
                },
              ]
            : []),
        ],
      };
    },
    getRelatedLinks: (documentId) => sameUserLinks(documentId),
  },
  community_posts: {
    key: "community_posts",
    section: "community",
    navLabel: "Posts",
    title: "Community posts",
    description:
      "Moderate the real community_posts collection, including nested comments and author links.",
    helperTitle: "Posts are operational records, not showcase content.",
    helperBody:
      "Check author identity, community/category, comment load, and related records before saving or deleting a post.",
    accent: "rose",
    icon: MessagesSquare,
    subcollections: [
      {
        key: "comments",
        title: "Comments",
        description: "Nested community_posts/{id}/comments moderation.",
      },
    ],
    getBrowseRecord: (document) => {
      const tags = getStringArray(document.data.tags).slice(0, 2);
      return {
        title: pickFirstString(document.data, ["title"]) ?? document.id,
        subtitle:
          compactList([
            getString(document.data.community),
            getString(document.data.authorEmail),
          ]) || "Community post",
        code: document.id,
        timestamp: document.data.updatedAt ?? document.data.createdAt,
        badges: [
          ...tags.map((tag) => ({
            label: tag,
            style: "tag" as const,
          })),
          {
            label: `${Number(document.data.commentCount ?? 0)} comments`,
            tone: "neutral",
          },
        ],
      };
    },
    getRelatedLinks: (documentId, data) => {
      const links: RelatedRecordLink[] = [];
      const authorId = getString(data.authorId);
      if (authorId) {
        links.push(...sameUserLinks(authorId));
      }
      links.push(
        documentLink(
          "community_posts",
          documentId,
          "Post workbench",
          "Open the parent post workbench.",
          "rose"
        )
      );
      return links;
    },
  },
  report_codes: {
    key: "report_codes",
    section: "reports",
    navLabel: "Report Codes",
    title: "Report codes",
    description:
      "Report entry records that link users to uploaded reports and source metadata.",
    helperTitle: "This is the operational report index.",
    helperBody:
      "Check source, owner linkage, uploaded report references, and download readiness before applying changes.",
    accent: "green",
    icon: FileCode2,
    getBrowseRecord: (document) => {
      const ownerId = getString(document.data.owner_id);
      return {
        title: document.id,
        subtitle:
          compactList([
            ownerId,
            getString(document.data.uploaded_report_id),
          ]) || "Report code document",
        code: document.id,
        timestamp: undefined,
        badges: [
          {
            label: getString(document.data.uploaded_report_id) ? "Linked upload" : "No upload",
            tone: getString(document.data.uploaded_report_id) ? "green" : "amber",
          },
        ],
      };
    },
    getRelatedLinks: (_documentId, data) => {
      const links: RelatedRecordLink[] = [];
      const userId = getString(data.owner_id);
      const uploadedReportId = getString(data.uploaded_report_id);

      if (userId) {
        links.push(...sameUserLinks(userId));
      }

      if (uploadedReportId) {
        links.push(
          documentLink(
            "uploaded_reports",
            uploadedReportId,
            "Uploaded report",
            "Open the linked uploaded_reports document.",
            "green"
          )
        );
      }

      return links;
    },
  },
  uploaded_reports: {
    key: "uploaded_reports",
    section: "reports",
    navLabel: "Uploaded Reports",
    title: "Uploaded reports",
    description:
      "Stored report records with provider format, status, ownership, and download fields.",
    helperTitle: "Treat uploads as real work items.",
    helperBody:
      "Focus on provider format, tracking status, ownership links, and download URL changes before saving.",
    accent: "green",
    icon: FileSearch,
    getBrowseRecord: (document) => {
      const fileName = pickFirstString(document.data, ["fileName", "file_name", "reportCode"]);
      const status =
        pickFirstString(document.data, ["trackingProgressStatus", "tracking_progress_status"]) ??
        "status unknown";

      return {
        title: fileName ?? document.id,
        subtitle:
          compactList([
            pickFirstString(document.data, ["providerName", "provider_name"]),
            pickFirstString(document.data, ["providerFormat", "provider_format"]),
          ]) || "Uploaded report record",
        code: document.id,
        timestamp:
          document.data.dateModified ??
          document.data.date_modified ??
          document.data.dateCreated ??
          document.data.date_created,
        badges: [
          { label: status, tone: status.toLowerCase().includes("complete") ? "green" : "amber" },
        ],
      };
    },
    getRelatedLinks: (_documentId, data) => {
      const links: RelatedRecordLink[] = [];
      const reportCode = getString(data.reportCode) ?? getString(data.report_code);
      const linkedFileId = getString(data.linkedFileId) ?? getString(data.linked_file_id);
      const ownerId =
        getString(data.reportOwnerId) ??
        getString(data.report_owner_id) ??
        getString(data.ownerCommunityUserId);

      if (reportCode) {
        links.push(
          documentLink(
            "report_codes",
            reportCode,
            "Report code",
            "Open the linked report_codes document.",
            "green"
          )
        );
      }

      if (linkedFileId) {
        links.push(
          documentLink(
            "file_storage",
            linkedFileId,
            "Stored file",
            "Open the linked file_storage document.",
            "green"
          )
        );
      }

      if (ownerId) {
        links.push(...sameUserLinks(ownerId));
      }

      return links;
    },
  },
  file_storage: {
    key: "file_storage",
    section: "reports",
    navLabel: "File Storage",
    title: "File storage",
    description:
      "Reusable stored files backing report operations, with creator scope, JSON content, and linked-report metadata.",
    helperTitle: "Use file storage as the canonical stored-file manager.",
    helperBody:
      "Browse every stored file in Firebase, verify JSON validity, inspect creator ownership, and follow linked report codes before editing content.",
    accent: "green",
    icon: FolderOpen,
    getBrowseRecord: (document) => {
      const linkedReportCode =
        getString(document.data.linked_report_code) ?? getString(document.data.linked_report_id);
      const creatorEmail = getString(document.data.creator_email);
      const fileType = getString(document.data.file_type);
      const rawContent = getString(document.data.file_content) ?? "";
      const hasValidJson = (() => {
        try {
          JSON.parse(
            rawContent
              .replace(/[\u2018\u2019\u2032]/g, "'")
              .replace(/[\u201C\u201D\u2033]/g, '"')
          );
          return true;
        } catch {
          return false;
        }
      })();

      return {
        title: getString(document.data.file_name) ?? document.id,
        subtitle:
          compactList([
            creatorEmail,
            fileType?.toUpperCase(),
            linkedReportCode ? `Linked to ${linkedReportCode}` : "Orphan",
          ]) || "Stored file record",
        code: document.id,
        timestamp: document.data.last_modified_date ?? document.data.creation_date,
        badges: [
          {
            label: linkedReportCode ? "Linked" : "Orphan",
            tone: linkedReportCode ? "green" : "amber",
          },
          {
            label: hasValidJson ? "JSON valid" : "JSON invalid",
            tone: hasValidJson ? "green" : "red",
          },
        ],
      };
    },
    getRelatedLinks: (_documentId, data) => {
      const links: RelatedRecordLink[] = [];
      const linkedReportCode =
        getString(data.linked_report_code) ?? getString(data.linked_report_id);

      if (linkedReportCode) {
        links.push(
          documentLink(
            "report_codes",
            linkedReportCode,
            "Linked report code",
            "Open the report code attached to this stored file.",
            "green"
          )
        );
      }

      return links;
    },
  },
  report_owners: {
    key: "report_owners",
    section: "reports",
    navLabel: "Report Owners",
    title: "Report owners",
    description:
      "Owner/admin profile records that back report administration in the mobile app.",
    helperTitle: "Owner records control who can administer reports.",
    helperBody:
      "Validate contact details, company/profession fields, and linked account records before granting or removing owner state.",
    accent: "green",
    icon: FileBadge2,
    getBrowseRecord: (document) => {
      const ownerName = pickFirstString(document.data, ["ownerName", "owner_name"]);
      const ownerEmail = pickFirstString(document.data, [
        "ownerContactEmail",
        "owner_contact_email",
      ]);
      const ownerCompany = pickFirstString(document.data, [
        "ownerCompany",
        "owner_company",
      ]);
      const ownerProfession = pickFirstString(document.data, [
        "ownerProfession",
        "owner_profession",
      ]);
      const communityUsername = pickFirstString(document.data, ["__community_username"]);
      const communityEmail = pickFirstString(document.data, ["__community_email"]);
      const communityPostsCreated = Number(document.data.__community_posts_created ?? 0);
      const hasSparseOwnerProfile = !ownerName && !ownerCompany && !ownerProfession;

      return {
        title:
          ownerName ??
          communityUsername ??
          communityEmail ??
          ownerEmail ??
          document.id,
        subtitle:
          compactList(
            hasSparseOwnerProfile
              ? [
                  communityEmail,
                  communityPostsCreated > 0 ? `${communityPostsCreated} posts` : undefined,
                ]
              : [ownerCompany, ownerProfession]
          ) ||
          (hasSparseOwnerProfile ? "Community user fallback" : "Report owner profile"),
        code: document.id,
        timestamp: document.data.updatedAt ?? document.data.__community_updated_at,
        badges: [
          {
            label: ownerEmail ?? communityEmail ?? "No email",
            tone: "neutral",
          },
          ...(hasSparseOwnerProfile &&
          typeof document.data.__community_is_clinician === "boolean"
            ? [
                {
                  label: document.data.__community_is_clinician
                    ? "Clinician"
                    : "Community member",
                  tone: document.data.__community_is_clinician ? "green" : "blue",
                } as const,
              ]
            : []),
          ...(hasSparseOwnerProfile &&
          typeof document.data.__community_is_activity_public === "boolean"
            ? [
                {
                  label: document.data.__community_is_activity_public
                    ? "Activity public"
                    : "Activity private",
                  tone: document.data.__community_is_activity_public ? "green" : "amber",
                } as const,
              ]
            : []),
        ],
      };
    },
    getRelatedLinks: (documentId, data) => {
      const sameLinks = sameUserLinks(documentId);
      const ownerCommunityUserId = getString(data.ownerCommunityUserId);
      const ownerPublicProfileId = getString(data.ownerPublicProfileId);

      if (ownerCommunityUserId) {
        sameLinks.push(
          documentLink(
            "community_users",
            ownerCommunityUserId,
            "Owner community user",
            "Open the linked community user record.",
            "rose"
          )
        );
      }

      if (ownerPublicProfileId) {
        sameLinks.push(
          documentLink(
            "public_profiles",
            ownerPublicProfileId,
            "Owner public profile",
            "Open the linked public profile record.",
            "rose"
          )
        );
      }

      return sameLinks;
    },
  },
  user_progress: {
    key: "user_progress",
    section: "learning",
    navLabel: "Progress",
    title: "Learning progress",
    description:
      "Raw learning progress documents keyed by user uid, with XP, level, streaks, and completed lessons.",
    helperTitle: "Learning progress should stay operational and auditable.",
    helperBody:
      "Review XP, level, completed lesson ids, and streak fields with the same caution you would apply to account records.",
    accent: "green",
    icon: Sparkles,
    getBrowseRecord: (document) => ({
      title: document.id,
      subtitle:
        compactList([
          typeof document.data.level === "number"
            ? `Level ${document.data.level}`
            : undefined,
          typeof document.data.xp === "number" ? `${document.data.xp} XP` : undefined,
        ]) || "Learning progress record",
      code: document.id,
      timestamp: formatDateTime(document.data.updatedAt) ?? document.data.updatedAt,
      badges: [
        {
          label: `${getStringArray(document.data.completedLessons).length} lessons`,
          tone: "green",
        },
      ],
    }),
    getRelatedLinks: (documentId) => sameUserLinks(documentId),
  },
};

export const ADMIN_NAV: AdminNavItem[] = [
  {
    section: "mission",
    label: "2PQ Dashboard",
    href: "/2pq-dashboard",
    description: "Workflow hub with area access and CRUD visibility",
    icon: Dna,
    visibleRoles: AREA_ROLES,
  },
  ...TWO_PQ_AREA_CONFIGS.map((area) => ({
    section: "mission" as const,
    label: area.navLabel,
    href: area.route,
    description: `${area.collectionKey} CRUD screen`,
    icon: area.icon,
    visibleRoles: AREA_ROLES,
  })),
  {
    section: "mission",
    label: "Contact",
    href: "/2pq-dashboard/contact",
    description: "2PQ website, phone, and email contact channels",
    icon: Mail,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "mission",
    label: "Overview",
    href: "/",
    description: "Operations snapshot",
    icon: LayoutDashboard,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "accounts",
    label: "Accounts",
    href: "/users",
    description: "Auth and private profile moderation",
    icon: Users,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "accounts",
    label: "Profiles",
    href: "/collections/profiles",
    description: "profiles/{uid}",
    icon: ShieldUser,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "community",
    label: "Community",
    href: "/community",
    description: "Public profiles and posts",
    icon: MessagesSquare,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "community",
    label: "Public Profiles",
    href: "/community/public-profiles",
    description: "User picker for public profile moderation",
    icon: Users,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "community",
    label: "Community Users",
    href: "/collections/community_users",
    description: "Identity and events",
    icon: UserRoundCog,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "community",
    label: "Posts",
    href: "/collections/community_posts",
    description: "Posts and nested comments",
    icon: MessagesSquare,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "reports",
    label: "Reports",
    href: "/reports",
    description: "Codes, uploads, stored files, owners",
    icon: FileCode2,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "reports",
    label: "Report Codes",
    href: "/collections/report_codes",
    description: "report_codes",
    icon: FileCode2,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "reports",
    label: "Uploads",
    href: "/collections/uploaded_reports",
    description: "uploaded_reports",
    icon: FileSearch,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "reports",
    label: "File Storage",
    href: "/collections/file_storage",
    description: "file_storage",
    icon: FolderOpen,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "reports",
    label: "Report Owners",
    href: "/collections/report_owners",
    description: "report_owners",
    icon: FileBadge2,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "learning",
    label: "Learning",
    href: "/learning",
    description: "User picker for progress moderation",
    icon: BookOpen,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "learning",
    label: "Lessons",
    href: "/learning/library",
    description: "Structured lesson content",
    icon: BookOpen,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "learning",
    label: "Progress",
    href: "/collections/user_progress",
    description: "user_progress",
    icon: Sparkles,
    visibleRoles: FULL_ADMIN_ROLES,
  },
  {
    section: "areas",
    label: "Institutions",
    href: "/areas/institutions",
    description: "Institution list and scoped institution operations",
    icon: Building2,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "areas",
    label: "Doctors",
    href: "/areas/doctors",
    description: "Institution-linked doctors",
    icon: Stethoscope,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "areas",
    label: "Patients",
    href: "/areas/patients",
    description: "Institution and doctor-linked patients",
    icon: UserPlus,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "access",
    label: "Roles & Permissions",
    href: "/roles",
    description: "Email-based access and role scope",
    icon: KeyRound,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "access",
    label: "My account",
    href: "/my-account",
    description: "Current operator role and Firebase Auth details",
    icon: UserRoundCog,
    visibleRoles: AREA_ROLES,
  },
];

export const GYM_SECTIONS: SectionDescriptor[] = [
  {
    key: "gym-overview",
    label: "Overview",
    description: "Gym operations dashboard.",
    visibleRoles: AREA_ROLES,
  },
  {
    key: "gym-members",
    label: "Athletes",
    description: "Coach roster and athlete profiles.",
    visibleRoles: AREA_ROLES,
  },
  {
    key: "gym-scheduling",
    label: "Coach schedule",
    description: "Session availability and booking review.",
    visibleRoles: AREA_ROLES,
  },
  {
    key: "gym-programs",
    label: "Programs",
    description: "Motivation tools coaches manage.",
    visibleRoles: AREA_ROLES,
  },
];

export const GYM_NAV: AdminNavItem[] = [
  {
    section: "gym-overview",
    label: "Coach Dashboard",
    href: "/gym/dashboard",
    description: "Coach workload metrics",
    icon: LayoutDashboard,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "gym-overview",
    label: "Coach Console",
    href: "/gym/coach-console",
    description: "Coach queues and athlete signals",
    icon: Activity,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "gym-members",
    label: "Athletes",
    href: "/gym/members",
    description: "Roster and athlete profiles",
    icon: Users,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "gym-scheduling",
    label: "Coach Availability",
    href: "/gym/booking-slots",
    description: "Available training slots",
    icon: Calendar,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "gym-scheduling",
    label: "Session Requests",
    href: "/gym/bookings",
    description: "Bookings and status review",
    icon: Calendar,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "gym-programs",
    label: "Achievements",
    href: "/gym/achievements",
    description: "Achievement definitions",
    icon: Award,
    visibleRoles: AREA_ROLES,
  },
  {
    section: "gym-programs",
    label: "Challenges",
    href: "/gym/challenges",
    description: "Challenge definitions",
    icon: Trophy,
    visibleRoles: AREA_ROLES,
  },
];

export function getVisibleSections(role: AdminRole) {
  return SECTION_DESCRIPTORS.filter(
    (section) => !section.visibleRoles || section.visibleRoles.includes(role)
  );
}

export function getVisibleAdminNav(role: AdminRole) {
  return ADMIN_NAV.filter((item) => !item.visibleRoles || item.visibleRoles.includes(role));
}

export function getProjectNav(project: ProjectKey, role: AdminRole): AdminNavItem[] {
  if (project === "gc-fitness") {
    return GC_FITNESS_NAV.filter(
      (item) => !item.visibleRoles || item.visibleRoles.includes(role)
    );
  }
  if (project === "pocket-gyms") {
    return GYM_NAV.filter((item) => !item.visibleRoles || item.visibleRoles.includes(role));
  }
  return ADMIN_NAV.filter((item) => !item.visibleRoles || item.visibleRoles.includes(role));
}

export function getProjectSections(project: ProjectKey, role: AdminRole): SectionDescriptor[] {
  if (project === "gc-fitness") {
    return GC_FITNESS_SECTIONS.filter(
      (section) => !section.visibleRoles || section.visibleRoles.includes(role)
    );
  }
  if (project === "pocket-gyms") {
    return GYM_SECTIONS.filter(
      (section) => !section.visibleRoles || section.visibleRoles.includes(role)
    );
  }
  return SECTION_DESCRIPTORS.filter(
    (section) => !section.visibleRoles || section.visibleRoles.includes(role)
  );
}

export function getCollectionConfig(collectionKey: CollectionKey) {
  return COLLECTIONS[collectionKey];
}

export function getSectionDescriptor(sectionKey: CollectionConfig["section"]) {
  return SECTION_DESCRIPTORS.find((section) => section.key === sectionKey);
}

export function getCollectionsBySection(sectionKey: CollectionConfig["section"]) {
  return Object.values(COLLECTIONS).filter((collection) => collection.section === sectionKey);
}

export function getChromeMetadata(pathname: string): ChromeMetadata {
  if (pathname === "/2pq-dashboard") {
    return {
      eyebrow: "2PQ",
      title: "2PQ Dashboard",
      description: "Workflow map and role-aware CRUD shell for cases, samples, shipments, sequencing, reports, and clients.",
    };
  }

  if (pathname === "/2pq-dashboard/forms") {
    return {
      eyebrow: "2PQ",
      title: "Forms",
      description: "Stored study request and sample form submissions.",
    };
  }

  if (pathname === "/2pq-dashboard/contact") {
    return {
      eyebrow: "2PQ",
      title: "Contact",
      description: "Official 2PQ website, phone, and email contact channels.",
    };
  }

  if (pathname.startsWith("/2pq-dashboard/forms/")) {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[3] !== "new") {
      return {
        eyebrow: "2PQ",
        title: "Form detail",
        description: "Stored 2PQ form submission details.",
      };
    }

    return {
      eyebrow: "2PQ",
      title: "New form",
      description: "Guided form flow stored in 2pq_forms.",
    };
  }

  if (pathname.startsWith("/2pq-dashboard/")) {
    const segments = pathname.split("/").filter(Boolean);
    const area = getTwoPQAreaConfig(segments[1] ?? "");

    if (area) {
      if (segments.length === 2) {
        return {
          eyebrow: "2PQ",
          title: area.label,
          description: area.summary,
        };
      }

      if (segments.length === 3 && segments[2] === "new") {
        return {
          eyebrow: "2PQ",
          title: area.createLabel,
          description: `Create a scoped Firestore document in ${area.collectionKey}.`,
        };
      }

      return {
        eyebrow: "2PQ",
        title: `${area.label} detail`,
        description: `Scoped CRUD workbench for live ${area.collectionKey} records.`,
      };
    }
  }

  if (pathname === "/") {
    return {
      eyebrow: "Mission",
      title: "Overview",
      description: "Pocket Genes Admin operations console.",
    };
  }

  if (pathname === "/users") {
    return {
      eyebrow: "Accounts",
      title: "Account moderation",
      description: "Firebase Auth users and linked private profile state.",
    };
  }

  if (pathname.startsWith("/users/")) {
    return {
      eyebrow: "Accounts",
      title: "User workbench",
      description: "Guided account moderation with linked record navigation.",
    };
  }

  if (pathname === "/community") {
    return {
      eyebrow: "Community",
      title: "Community hub",
      description: "Grouped controls for community users, public profiles, posts, and replies.",
    };
  }

  if (pathname === "/community/public-profiles") {
    return {
      eyebrow: "Community",
      title: "Public profile picker",
      description: "Choose the user whose public profile you need to inspect, and flag accounts that still lack one.",
    };
  }

  if (pathname === "/reports") {
    return {
      eyebrow: "Reports",
      title: "Report user picker",
      description: "Choose the user whose report state you need to inspect or manipulate.",
    };
  }

  if (pathname === "/learning") {
    return {
      eyebrow: "Learning",
      title: "Learning user picker",
      description: "Choose the user whose progress state you need to inspect or manipulate.",
    };
  }

  if (pathname === "/learning/library") {
    return {
      eyebrow: "Learning",
      title: "Lesson library",
      description: "Structured lesson content editing, separate from user progression state.",
    };
  }

  if (pathname.startsWith("/reports/users/")) {
    return {
      eyebrow: "Reports",
      title: "User report state",
      description: "Selected-user report moderation with owner state and linked report codes.",
    };
  }

  if (pathname.startsWith("/reports/")) {
    return {
      eyebrow: "Reports",
      title: "Report detail",
      description: "Single report record detail with deletion and raw workbench access.",
    };
  }

  if (pathname === "/areas/institutions") {
    return {
      eyebrow: "Areas",
      title: "Institutions",
      description: "Institution list with scoped access, doctor counts, and patient totals.",
    };
  }

  if (pathname === "/areas/institutions/new") {
    return {
      eyebrow: "Areas",
      title: "New institution",
      description: "Create a new institution with a durable relational id and editable descriptors.",
    };
  }

  if (pathname.startsWith("/areas/institutions/")) {
    return {
      eyebrow: "Areas",
      title: "Institution detail",
      description: "Institution descriptors, linked doctors, and local institution admins.",
    };
  }

  if (pathname === "/areas/doctors") {
    return {
      eyebrow: "Areas",
      title: "Doctors",
      description: "Institution-linked doctor records with patient counts and role linkage.",
    };
  }

  if (pathname === "/areas/doctors/new") {
    return {
      eyebrow: "Areas",
      title: "New doctor",
      description: "Create a doctor tied to a single institution.",
    };
  }

  if (pathname.startsWith("/areas/doctors/")) {
    return {
      eyebrow: "Areas",
      title: "Doctor detail",
      description: "Doctor profile editing with linked institution context and patient operations.",
    };
  }

  if (pathname === "/areas/patients") {
    return {
      eyebrow: "Areas",
      title: "Patients",
      description: "Searchable patient index scoped by institution and doctor permissions.",
    };
  }

  if (pathname === "/areas/patients/new") {
    return {
      eyebrow: "Areas",
      title: "New patient",
      description: "Create a patient tied to one institution and one doctor.",
    };
  }

  if (pathname.startsWith("/areas/patients/")) {
    return {
      eyebrow: "Areas",
      title: "Patient detail",
      description: "Informative patient sheet with scoped edit and delete operations.",
    };
  }

  if (pathname === "/roles") {
    return {
      eyebrow: "Access",
      title: "Roles & permissions",
      description: "Email-scoped role assignments with institution, doctor, and patient boundaries.",
    };
  }

  if (pathname === "/roles/access") {
    return {
      eyebrow: "Access",
      title: "Role assignment capabilities",
      description: "Role-by-role scope guidance with explicit allowed actions and blocked boundaries.",
    };
  }

  if (pathname === "/roles/new") {
    return {
      eyebrow: "Access",
      title: "New role assignment",
      description: "Create a role record that follows the permission tree and scope constraints.",
    };
  }

  if (pathname.startsWith("/roles/")) {
    return {
      eyebrow: "Access",
      title: "Role detail",
      description: "Inspect and update a single email-based role assignment.",
    };
  }

  if (pathname === "/my-account") {
    return {
      eyebrow: "Access",
      title: "My account",
      description: "Current operator role assignment, permissions, and Firebase Auth details.",
    };
  }

  if (pathname.startsWith("/learning/users/")) {
    return {
      eyebrow: "Learning",
      title: "User learning state",
      description: "Selected-user progress moderation with direct links to raw progression records.",
    };
  }

  if (pathname.startsWith("/learning/")) {
    return {
      eyebrow: "Learning",
      title: "Lesson detail",
      description: "Structured lesson editing kept separate from user progression state.",
    };
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "collections" && isCollectionKey(segments[1] ?? "")) {
    const collection = COLLECTIONS[segments[1] as CollectionKey];
    const section = getSectionDescriptor(collection.section);

    if (segments.length === 2) {
      return {
        eyebrow: section?.label ?? "Data",
        title: collection.title,
        description: collection.description,
      };
    }

    if (segments.length === 3) {
      return {
        eyebrow: section?.label ?? "Data",
        title: `${collection.title} workbench`,
        description: "Raw document moderation with related links and guarded save/delete flows.",
      };
    }

    return {
      eyebrow: section?.label ?? "Data",
      title: "Nested moderation",
      description: "Subdocument workbench for nested mobile app records.",
    };
  }

  if (pathname === "/gym/dashboard") {
    return { eyebrow: "Pocket Gyms", title: "Coach dashboard", description: "Key coach-side metrics: athletes, active plans, and upcoming sessions." };
  }
  if (pathname === "/gym/coach-console" || pathname === "/gym/mobile-app") {
    return { eyebrow: "Pocket Gyms", title: "Coach console", description: "Coach-facing queues, athlete signals, files, care-team context, and activity history that complement the user app." };
  }
  if (pathname === "/gym/members") {
    return { eyebrow: "Pocket Gyms", title: "Athlete roster", description: "Coach roster with profile, plan, evaluation, nutrition, and history access." };
  }
  if (pathname.startsWith("/gym/members/")) {
    return { eyebrow: "Pocket Gyms", title: "Athlete detail", description: "Athlete profile with coaching plans, evaluations, nutrition, and clinical history." };
  }
  if (pathname.startsWith("/gym/training-plans/")) {
    return { eyebrow: "Pocket Gyms", title: "Training plan editor", description: "Create and edit weekly coaching plans for an athlete." };
  }
  if (pathname.startsWith("/gym/evaluations/")) {
    return { eyebrow: "Pocket Gyms", title: "Evaluation form", description: "Record a coach-side physical assessment for an athlete." };
  }
  if (pathname.startsWith("/gym/nutrition/")) {
    return { eyebrow: "Pocket Gyms", title: "Nutrition plan editor", description: "Create and edit daily nutrition guidance for an athlete." };
  }
  if (pathname === "/gym/booking-slots") {
    return { eyebrow: "Pocket Gyms", title: "Coach availability", description: "Manage available training slots athletes can request." };
  }
  if (pathname === "/gym/bookings") {
    return { eyebrow: "Pocket Gyms", title: "Session requests", description: "Review athlete bookings and their confirmation status." };
  }
  if (pathname === "/gym/achievements") {
    return { eyebrow: "Pocket Gyms", title: "Achievements", description: "Create and edit achievement definitions that coaches use to reinforce progress." };
  }
  if (pathname === "/gym/challenges") {
    return { eyebrow: "Pocket Gyms", title: "Challenges", description: "Create and edit challenge definitions for athlete motivation." };
  }

  return {
    eyebrow: "Pocket Genes Admin",
    title: "Backoffice",
    description: "Readable operations console for moderation and support tasks.",
  };
}
