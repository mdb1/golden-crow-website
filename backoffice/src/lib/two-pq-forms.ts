export type TwoPQFormType = "study_request" | "sample";

export type PatientInformationFormState = {
  institutionId: string;
  doctorId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  medicalRecordNumber: string;
  birthDate: string;
  sex: string;
  status: "active" | "inactive";
  notes: string;
  includesPartnerInformation: boolean;
  partnerFirstName: string;
  partnerLastName: string;
  partnerMedicalRecordNumber: string;
  partnerBirthDate: string;
  partnerNotes: string;
};

export type InstitutionInformationFormState = {
  code: string;
  name: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  notes: string;
};

export type MedicalInformationFormState = {
  previousMiscarriagesCount: string;
  maleFactor: string;
  spermGameteSource: string;
  oocyteGameteSource: string;
  otherBackground: string;
};

export type PreviousGeneticTestsFormState = {
  pgtASr: string;
  karyotype: string;
  pgtResult: string;
  karyotypeResult: string;
  karyotypeFileName: string;
  karyotypeFileType: string;
  karyotypeFileSize: string;
  karyotypeFileContent: string;
};

export type RequestedTestFormState = {
  testName: string;
  testCode: string;
  priority: string;
  reason: string;
  notes: string;
  pgtAFast: string;
  pgtAFastReportsMosaicism: string;
  pgtAFastReportsSex: string;
  pgtAStandard: string;
  pgtAStandardReportsMosaicism: string;
  pgtAStandardReportsSex: string;
  pgtA: string;
  pgtSr: string;
  pgtSrReportsMosaicism: string;
  pgtSrReportsSex: string;
  reportsMosaicism: string;
  reportsSex: string;
  requestReason: string;
  requestDate: string;
};

export type SampleInformationFormState = {
  fivCenter: string;
  centerCode: string;
  requestingDoctorFullName: string;
  requestingDoctorAuthEmail: string;
  requestingDoctorAuthUid: string;
  requestingDoctorSpecialty: string;
  requestingDoctorLicenseNumber: string;
  requestingDoctorContactPhone: string;
  requestingDoctorStatus: "active" | "inactive";
  requestingDoctorNotes: string;
  sampleType: string;
  processedByFirstName: string;
  processedByLastName: string;
  processDate: string;
  boxCode: string;
  biopsyCount: string;
};

export type CaseInformationFormState = {
  caseLabel: string;
  caseStatus: string;
  caseType: string;
  priority: string;
  trackingNumber: string;
  requestedAt: string;
  dueAt: string;
  notes: string;
};

export type SamplingInformationFormState = {
  sampleId: string;
  sampleType: string;
  processingStatus: string;
  notes: string;
};

export type TwoPQFormDraftStepKey =
  | "linkedStudyRequest"
  | "patientInformation"
  | "medicalInformation"
  | "previousGeneticTests"
  | "requestedTest"
  | "institutionInformation"
  | "previewAndSignature"
  | "sampleInformation"
  | "caseInformation"
  | "samplingInformation";

export type TwoPQFormDraftState = {
  linkedStudyRequestFormId: string;
  selectedPatientId: string;
  selectedInstitutionId: string;
  selectedCaseId: string;
  selectedRequestingDoctorId: string;
  patientInformation: PatientInformationFormState;
  medicalInformation: MedicalInformationFormState;
  previousGeneticTests: PreviousGeneticTestsFormState;
  requestedTest: RequestedTestFormState;
  institutionInformation: InstitutionInformationFormState;
  sampleInformation: SampleInformationFormState;
  caseInformation: CaseInformationFormState;
  samplingInformation: SamplingInformationFormState[];
  samplingTableGenerated: boolean;
};

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
  state: TwoPQFormDraftState;
  createdAt: string;
  updatedAt: string;
  authorEmail?: string;
  authorUid?: string;
  createdByEmail?: string;
  createdByUid?: string;
  updatedByEmail?: string;
  updatedByUid?: string;
}

export const TWO_PQ_FORM_LABELS: Record<TwoPQFormType, string> = {
  study_request: "Solicitud de estudio",
  sample: "Muestra",
};

export const TWO_PQ_FORM_ROUTES: Record<TwoPQFormType, string> = {
  study_request: "/2pq-dashboard/forms/study-request/new",
  sample: "/2pq-dashboard/forms/sample/new",
};

export function getTwoPQFormTypeFromSlug(slug: string): TwoPQFormType | null {
  if (slug === "study-request") return "study_request";
  if (slug === "sample") return "sample";
  return null;
}
