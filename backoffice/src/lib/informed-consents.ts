export interface InformedConsentFileSummary {
  name: string;
  type: string;
  size: number;
}

export type InformedConsentRequestStatus = "pending" | "needs_review" | "ready";

export interface InformedConsentRequestSummary {
  id: string | null;
  status: InformedConsentRequestStatus;
  uploadedAt?: string | null;
  reviewedAt?: string | null;
}

export interface InformedConsentStudyRequest {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  patientBirthDate?: string | null;
  institutionId: string;
  institutionName?: string | null;
  doctorId: string;
  doctorName?: string | null;
  doctorLicenseNumber?: string | null;
  createdAt?: string;
  canUpload: boolean;
  canApprove: boolean;
  canResend: boolean;
  consent: InformedConsentRequestSummary;
}

export interface InformedConsentStudyRequestPage {
  requests: InformedConsentStudyRequest[];
  nextCursor?: string | null;
}

export const INFORMED_CONSENT_REQUEST_STATUS_LABELS = {
  pending: "Pendiente",
  needs_review: "Requiere revisión",
  ready: "Listo",
} as const satisfies Record<InformedConsentRequestStatus, string>;

export function informedConsentDraftPath(studyRequestFormId: string, statusOnly = false) {
  return `/2pq/informed-consents/draft${statusOnly ? "/status" : ""}?studyRequestFormId=${encodeURIComponent(studyRequestFormId)}`;
}

export function patientConsentUploadHref(studyRequestFormId: string) {
  return `/patient-portal/consents/new?studyRequestFormId=${encodeURIComponent(studyRequestFormId)}`;
}

export interface InformedConsentRecord {
  id: string;
  collectionKey: "2pq-informed-consent";
  institutionId: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  caseId: string | null;
  studyRequestFormId?: string | null;
  reviewStatus?: Exclude<InformedConsentRequestStatus, "pending">;
  reviewedAt?: string | null;
  reviewedByEmail?: string | null;
  file: InformedConsentFileSummary;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
}

export interface InformedConsentCaseOption {
  id: string;
  institutionId: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  caseLabel: string;
  caseStatus?: string;
  threeLetterCode?: string;
  informedConsentId: string | null;
  linkedStudyRequestFormId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InformedConsentCasePage {
  cases: InformedConsentCaseOption[];
  nextCursor?: string;
}

export interface InformedConsentDetailPayload {
  record: InformedConsentRecord;
  linkedCase: InformedConsentCaseOption | null;
  caseOptions: InformedConsentCaseOption[];
}

export interface CaseConsentTraceabilityPayload {
  case: InformedConsentCaseOption;
  linkedConsent: InformedConsentRecord | null;
  consentOptions: InformedConsentRecord[];
}

export interface InformedConsentPatientOption {
  id: string;
  fullName: string;
  email: string;
}

export interface InformedConsentPage {
  records: InformedConsentRecord[];
  nextCursor?: string;
}

export interface InformedConsentPatientPage {
  patients: InformedConsentPatientOption[];
  nextCursor?: string;
}

export interface InformedConsentSavedSignaturePayload {
  savedSignature: string | null;
}

export interface InformedConsentPatientHomeStatus {
  hasDraft: boolean;
  hasSignedConsent: boolean;
}

export type InformedConsentDraftMode = "guided" | "direct";

export type InformedConsentDraftStepId =
  | "method"
  | "download"
  | "data"
  | "signature"
  | "editor"
  | "preview"
  | "direct-download"
  | "direct-sign"
  | "direct-upload";

export type InformedConsentDraftSignatureMethod = "draw" | "import" | "saved";

export interface InformedConsentDraftSignaturePlacement {
  x: number;
  y: number;
  width: number;
}

export interface InformedConsentDraftState {
  schemaVersion: 1;
  mode: InformedConsentDraftMode;
  activeStepId: InformedConsentDraftStepId;
  visitedStepIds: InformedConsentDraftStepId[];
  patientName: string;
  patientDocument: string;
  signatureDate: string;
  hasPartner: boolean;
  partnerName: string;
  patientSignatureDataUrl: string | null;
  partnerSignatureDataUrl: string | null;
  patientSignatureMethod: InformedConsentDraftSignatureMethod | null;
  partnerSignatureMethod: InformedConsentDraftSignatureMethod | null;
  patientPlacement: InformedConsentDraftSignaturePlacement;
  partnerPlacement: InformedConsentDraftSignaturePlacement;
  selectedRole: "patient" | "partner";
}

export interface InformedConsentDraftRecord extends InformedConsentDraftState {
  id: string;
  collectionKey: "2pq-informed-consent-drafts";
  revision: number;
  patientId: string;
  studyRequestFormId?: string | null;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
  createdByUid: string;
  updatedByEmail: string;
  updatedByUid: string;
}

export type InformedConsentDraftSummary = Pick<
  InformedConsentDraftRecord,
  "mode" | "activeStepId" | "updatedAt" | "revision"
>;

export type InformedConsentDraftMutation = InformedConsentDraftState & {
  expectedRevision: number | null;
};
