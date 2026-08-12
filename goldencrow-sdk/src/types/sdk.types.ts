// SourceKey — matches report_codes.source field values
export type SourceKey = "myDNAMap" | "ActyonGenomics" | "vcf" | "2pq";
export type ModerationCollectionKey =
  | "profiles"
  | "public_profiles"
  | "community_users"
  | "community_posts"
  | "report_codes"
  | "uploaded_reports"
  | "file_storage"
  | "report_owners"
  | "user_progress";
export type ModerationSubcollectionKey = "comments" | "events";
export type AdminUserSex =
  | "male"
  | "female"
  | "other"
  | "prefer_not_to_say"
  | string;
export type AdminRole =
  | "full_admin"
  | "organization_publisher"
  | "institution_admin"
  | "institution_operator"
  | "institution_laboratory_staff"
  | "institution_doctor"
  | "patient";

// AdminUser — merged Firebase Auth record + Firestore profiles/{uid} doc
export interface AdminUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string; // from auth.metadata.creationTime
  lastSignInAt: string; // from auth.metadata.lastSignInTime
  photoURL: string | null;
  // From Firestore profiles doc:
  displayName: string;
  age?: number | string;
  sex?: AdminUserSex;
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

export interface UserRoleRecord {
  email: string;
  role: AdminRole;
  organizationId?: string;
  institutionId?: string;
  doctorId?: string;
  patientId?: string;
  isActive: boolean;
  canAccessPatientPortal: boolean;
  displayName?: string;
  contactPhone?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string;
}

/**
 * Closed-set union of all Golden Crow products served by the backoffice +
 * SDK. Pitfall 7 same-source-of-truth — this literal is mirrored in
 * `golden-crow-website/backoffice/src/lib/admin-areas.ts` (P11-03).
 *
 * Adding a new product means:
 *   1. Append the literal here.
 *   2. Update `goldencrow-sdk/src/config/env.ts` with the new
 *      TEAM_ALLOWLIST_* env var + admin creds.
 *   3. Update `goldencrow-sdk/src/config/firebase.ts`'s `ENV_KEYS_BY_PROJECT`
 *      table.
 *   4. Update `backoffice/src/lib/admin-areas.ts` mirror.
 *   5. Add the new project's named-app entry — `adminAppFor()` will
 *      throw "missing env" until the deploy env is configured.
 */
export type ProjectKey = "mydnamap" | "pocket-gyms" | "gc-fitness";

export interface AdminContext {
  email: string;
  uid: string;
  role: AdminRole;
  organizationId?: string;
  institutionId?: string;
  doctorId?: string;
  patientId?: string;
  isBootstrap: boolean;
  canAccessBackoffice: boolean;
  canAccessPatientPortal: boolean;
  projectAccess: ProjectKey[];
}

export interface AdminContextResponse {
  context: AdminContext;
  capabilities: string[];
}

export interface InstitutionRecord {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstitutionListItem extends InstitutionRecord {
  doctorCount: number;
  patientCount: number;
  institutionAdminCount: number;
  administrativeOperatorCount: number;
  laboratoryStaffCount: number;
}

export interface DoctorRecord {
  id: string;
  institutionId: string;
  authEmail: string;
  authUid?: string;
  fullName: string;
  specialty?: string;
  licenseNumber?: string;
  contactPhone?: string;
  status: "active" | "inactive";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorListItem extends DoctorRecord {
  institutionName?: string;
  patientCount: number;
  roleEmail?: string;
  roleActive?: boolean;
}

export interface PatientRecord {
  id: string;
  institutionId: string;
  doctorId: string;
  email: string;
  fullName: string;
  medicalRecordNumber?: string;
  birthDate?: string;
  sex?: AdminUserSex;
  status: "active" | "inactive";
  notes?: string;
  additionalInformation?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PatientListItem extends PatientRecord {
  institutionName?: string;
  doctorName?: string;
  doctorEmail?: string;
}

export interface InformedConsentFile {
  name: string;
  type: string;
  size: number;
  content: string;
}

export interface InformedConsentFileSummary {
  name: string;
  type: string;
  size: number;
}

export interface InformedConsentRecord {
  id: string;
  collectionKey: "2pq-informed-consent";
  institutionId: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  file: InformedConsentFileSummary;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
}

export interface InformedConsentPatientOption {
  id: string;
  fullName: string;
  email: string;
}

export interface RoleManagementRecord extends UserRoleRecord {
  organizationName?: string;
  institutionName?: string;
  doctorName?: string;
  patientName?: string;
  bootstrap?: boolean;
}

export interface MyAccountProviderInfo {
  providerId: string;
  uid: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  photoURL?: string;
}

export interface MyAccountAuthRecord {
  uid: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  tenantId?: string;
  customClaims: Record<string, unknown>;
  providerData: MyAccountProviderInfo[];
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
    lastRefreshTime?: string;
  };
  tokensValidAfterTime?: string;
}

export interface MyAccountProfileSummary {
  username?: string;
  fullName?: string;
  onboardingCompleted: boolean;
  needsCompletion: boolean;
  docs: {
    profile: boolean;
    publicProfile: boolean;
    communityUser: boolean;
    reportOwner: boolean;
  };
}

export interface MyAccountRecord {
  context: AdminContext;
  role: RoleManagementRecord | null;
  capabilities: string[];
  auth: MyAccountAuthRecord;
  profile: MyAccountProfileSummary | null;
}

export interface InstitutionDetailRecord {
  institution: InstitutionListItem;
  doctors: DoctorListItem[];
  institutionAdmins: RoleManagementRecord[];
}

export interface DoctorDetailRecord {
  doctor: DoctorListItem;
  institution: InstitutionRecord | null;
  patients: PatientListItem[];
  roleRecord: RoleManagementRecord | null;
}

export interface PatientDetailRecord {
  patient: PatientListItem;
  institution: InstitutionRecord | null;
  doctor: DoctorListItem | null;
  roleRecord: RoleManagementRecord | null;
}

export type TwoPQAreaKey =
  | "cases"
  | "sampling"
  | "shipments"
  | "sequencing"
  | "reports"
  | "clients";

export type TwoPQCollectionKey =
  | "2pq_case"
  | "2pq_sampling"
  | "2pq_shipment"
  | "2pq_sequencing"
  | "2pq_report"
  | "2pq_client";

export type TwoPQFormDraftStepKey =
  | "linkedWithdrawalCases"
  | "linkedStudyRequest"
  | "patientInformation"
  | "medicalInformation"
  | "previousGeneticTests"
  | "requestedTest"
  | "institutionInformation"
  | "previewAndSignature"
  | "sampleInformation"
  | "doctorInformation"
  | "caseInformation"
  | "samplingInformation";

export interface TwoPQRecord {
  id: string;
  areaKey: TwoPQAreaKey;
  collectionKey: TwoPQCollectionKey;
  institutionId: string;
  doctorId: string;
  patientId?: string;
  parent_batch?: string;
  parent_case?: string;
  children_cases?: string[];
  children_sampling?: string[];
  three_letter_code?: string;
  stored_file_id?: string;
  last_updated_date?: string;
  caseLabel?: string;
  caseStatus?: string;
  caseType?: string;
  priority?: string;
  sampleId?: string;
  shipmentId?: string;
  trackingNumber?: string;
  requestedAt?: string;
  dueAt?: string;
  sampleType?: string;
  collectionDate?: string;
  receptionDate?: string;
  processingStatus?: string;
  internalCode?: string;
  embryoStageDay?: string;
  morphology?: string;
  sentUl?: string;
  biopsiedCells?: string;
  cellsVisualized?: string;
  runId?: string;
  qcStatus?: string;
  carrier?: string;
  dispatchDate?: string;
  deliveryDate?: string;
  deliveryStatus?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  platform?: string;
  scheduling?: string;
  analysisStatus?: string;
  providerName?: string;
  providerFormat?: string;
  phoneNumber?: string;
  reportCode?: string;
  uploadedReportId?: string;
  clientCaseStatus?: string;
  reportDelivery?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  preferredLanguage?: string;
  country?: string;
  roleEmail?: string;
  accessStatus?: string;
  communicationStatus?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string;
  updatedByEmail?: string;
}

export interface TwoPQListItem extends TwoPQRecord {
  institutionName?: string;
  doctorName?: string;
  patientName?: string;
  canReplace: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface TwoPQDetailRecord {
  record: TwoPQListItem;
  institution: InstitutionRecord | null;
  doctor: DoctorListItem | null;
  patient: PatientListItem | null;
  linkedBatch: TwoPQListItem | null;
  linkedCase: TwoPQListItem | null;
  linkedCases: TwoPQListItem[];
  linkedSamplings: TwoPQListItem[];
}

export type TwoPQFormType = "study_request" | "sample" | "withdrawal_request";

export interface TwoPQFormRecord {
  id: string;
  formType: TwoPQFormType;
  collectionKey: "2pq_forms";
  institutionId: string;
  doctorId: string;
  selectedPatientId?: string;
  selectedInstitutionId?: string;
  patientName?: string;
  patientEmail?: string;
  institutionName?: string;
  requestedTestName?: string;
  linkedStudyRequestFormId?: string;
  linkedCaseIds?: string[];
  selectedCaseId?: string;
  selectedRequestingDoctorId?: string;
  linkedCaseId?: string;
  linkedSamplingIds?: string[];
  patientInformation: Record<string, unknown>;
  medicalInformation?: Record<string, unknown>;
  previousGeneticTests?: Record<string, unknown>;
  requestedTest: Record<string, unknown>;
  institutionInformation?: Record<string, unknown>;
  sampleInformation?: Record<string, unknown>;
  caseInformation?: Record<string, unknown>;
  samplingInformation?: Record<string, unknown>[];
  withdrawalCases?: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
  authorEmail?: string;
  authorUid?: string;
  archivedAt?: string;
  archivedByEmail?: string;
  archivedByUid?: string;
  createdByEmail?: string;
  createdByUid?: string;
  updatedByEmail?: string;
  updatedByUid?: string;
}

export interface TwoPQFormDraftRecord {
  id: string;
  formType: TwoPQFormType;
  collectionKey: "2pq-form-drafts";
  currentStep: TwoPQFormDraftStepKey;
  stepIndex: number;
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  authorEmail?: string;
  authorUid?: string;
  createdByEmail?: string;
  createdByUid?: string;
  updatedByEmail?: string;
  updatedByUid?: string;
}

// CommunityPost — mirrors Firestore posts collection
export interface CommunityPost {
  id: string;
  title: string;
  body: string;
  community: string;
  tags: string[];
  authorId: string;
  authorEmail: string;
  authorAvatarURL?: string;
  authorIconName?: string;
  authorIconColorHex?: string;
  createdAt: string;
  updatedAt?: string;
  commentCount: number;
  upvotes: number;
  downvotes: number;
  score: number;
}

// CommunityComment — mirrors Firestore comments collection
export interface CommunityComment {
  id: string;
  postId: string;
  body: string;
  authorId: string;
  authorEmail: string;
  authorAvatarURL?: string;
  authorIconName?: string;
  authorIconColorHex?: string;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  score: number;
  associatedReference?: string;
}

// DnaReport — mirrors Firestore report_codes collection
export interface DnaReport {
  id: string; // Firestore document ID
  code: string;
  source: SourceKey;
  userId: string; // Owner/report owner Firebase UID
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

// UserProgress — mirrors Firestore user_progress/{uid} document
// This SDK defines the authoritative schema (the web app stubs never wrote real data)
export interface CollectedAminoAcid {
  id: string;
  name: string;
  earnedAt: string;
}
export interface StreakData {
  current: number;
  longest: number;
  lastActivityDate: string;
}
export interface UserProgress {
  uid: string; // Document ID = Firebase UID
  xp: number;
  level: number;
  completedLessons: string[];
  collectedAminoAcids: CollectedAminoAcid[];
  streak: StreakData;
}

// CascadeDeleteResult — returned by deleteUserCascade
export interface CascadeDeleteResult {
  success: boolean;
  errors: string[];
}

export interface ModerationDocumentRecord {
  id: string;
  path: string;
  collection: string;
  data: Record<string, unknown>;
}

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

export interface DiscoverListPage<T> {
  records: T[];
  nextCursor: string | null;
}

// Lesson types — Firestore-backed lesson content
export interface LessonParagraph {
  paragraphTitle: string;
  icon: string;
  contentText: string;
}
export interface LessonEntry {
  lessonIdentifier: string;
  lessonTitle: string;
  imageURL: string | null;
  lessonColor: string;
  paragraphs: LessonParagraph[] | null;
}
export interface LessonChapterEntry {
  chapterTitle: string;
  lessons: Pick<LessonEntry, "lessonIdentifier" | "lessonTitle" | "imageURL" | "lessonColor">[];
}
export interface LessonSubjectEntry {
  subjectIdentifier: string;
  subjectTitle: string;
  chapters: LessonChapterEntry[];
}
export interface LessonTree {
  subjects: LessonSubjectEntry[];
}
