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
