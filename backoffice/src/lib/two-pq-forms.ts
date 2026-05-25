export type TwoPQFormType = "study_request" | "sample";

export type PatientInformationFormState = {
  institutionId: string;
  doctorId: string;
  email: string;
  fullName: string;
  medicalRecordNumber: string;
  birthDate: string;
  sex: string;
  status: "active" | "inactive";
  notes: string;
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
  previousConceptionsCount: string;
  previousMiscarriagesCount: string;
  previousBirthsCount: string;
  previousCyclesCount: string;
  maleFactor: string;
  otherBackground: string;
};

export type PreviousGeneticTestsFormState = {
  pgtASr: string;
  karyotype: string;
  pgtResult: string;
  karyotypeResult: string;
};

export type RequestedTestFormState = {
  testName: string;
  testCode: string;
  priority: string;
  reason: string;
  notes: string;
  pgtA: string;
  pgtSr: string;
  reportsMosaicism: string;
  reportsSex: string;
  requestReason: string;
  requestDate: string;
};

export type SampleInformationFormState = {
  fivCenter: string;
  centerCode: string;
  requestingDoctorFirstName: string;
  requestingDoctorLastName: string;
  sampleType: string;
  processedByFirstName: string;
  processedByLastName: string;
  processDate: string;
  boxCode: string;
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
  collectionDate: string;
  receptionDate: string;
  runId: string;
  qcStatus: string;
  notes: string;
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
  selectedCaseId?: string;
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
