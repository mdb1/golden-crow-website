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
  caseId: string | null;
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
