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
  clinicalIndication: string;
  suspectedDiagnosis: string;
  symptoms: string;
  familyHistory: string;
  requestingDoctor: string;
  notes: string;
};

export type PreviousGeneticTestsFormState = {
  hasPreviousTests: string;
  testDescription: string;
  labName: string;
  testDate: string;
  resultSummary: string;
  reportAvailable: string;
};

export type RequestedTestFormState = {
  testName: string;
  testCode: string;
  priority: string;
  reason: string;
  notes: string;
};

export type SampleInformationFormState = {
  sampleType: string;
  sampleId: string;
  collectionDate: string;
  collectionSite: string;
  collectorName: string;
  storageCondition: string;
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
  patientInformation: Record<string, unknown>;
  medicalInformation?: Record<string, unknown>;
  previousGeneticTests?: Record<string, unknown>;
  requestedTest: Record<string, unknown>;
  institutionInformation?: Record<string, unknown>;
  sampleInformation?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string;
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
