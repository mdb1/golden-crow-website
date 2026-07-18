export type TwoPQFormType = "study_request" | "sample" | "withdrawal_request";

export const DEFAULT_OBSERVATIONS_VALUE = "Sin observaciones";

export function normalizeObservationsValue(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || DEFAULT_OBSERVATIONS_VALUE;
}

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
  address: string;
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
  internalCode: string;
  embryoStageDay: string;
  morphology: string;
  sentUl: string;
  biopsiedCells: string;
  cellsVisualized: string;
  notes: string;
};

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

export type TwoPQFormDraftState = {
  linkedWithdrawalCaseIds: string[];
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

export type TwoPQFormsOrder = "newest" | "oldest";

export interface TwoPQFormsPage {
  forms: TwoPQFormRecord[];
  nextCursor: string | null;
  hasMore: boolean;
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
  sample: "Formulario de biopsias",
  withdrawal_request: "Solicitud de retiro",
};

export const TWO_PQ_FORM_ROUTES: Record<TwoPQFormType, string> = {
  study_request: "/2pq-dashboard/forms/study-request/new",
  sample: "/2pq-dashboard/forms/sample/new",
  withdrawal_request: "/2pq-dashboard/forms/withdrawal-request/new",
};

export function getTwoPQFormTypeFromSlug(slug: string): TwoPQFormType | null {
  if (slug === "study-request") return "study_request";
  if (slug === "sample") return "sample";
  if (slug === "withdrawal-request") return "withdrawal_request";
  return null;
}

type FormDisplayLanguage = "en" | "es";

function getStringField(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toThreeLetterCode(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(normalized)) {
    return normalized;
  }

  const caseLabelMatch = normalized.match(/^([A-Z]{3})XXX$/);
  return caseLabelMatch?.[1] ?? null;
}

function withdrawalCaseCode(caseRecord: Record<string, unknown>) {
  return (
    toThreeLetterCode(getStringField(caseRecord, "three_letter_code")) ??
    toThreeLetterCode(getStringField(caseRecord, "boxCode")) ??
    toThreeLetterCode(getStringField(caseRecord, "caseLabel")) ??
    toThreeLetterCode(getStringField(caseRecord, "id"))
  );
}

function formatConjoinedList(items: string[], language: FormDisplayLanguage) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  const connector = language === "es" ? " y " : " and ";
  if (items.length === 2) {
    return `${items[0]}${connector}${items[1]}`;
  }

  const head = items.slice(0, -1).join(", ");
  const last = items[items.length - 1];
  return language === "es" ? `${head}${connector}${last}` : `${head},${connector}${last}`;
}

export function getWithdrawalRequestTitle(
  form: Pick<TwoPQFormRecord, "linkedCaseIds" | "withdrawalCases">,
  language: FormDisplayLanguage
) {
  const uniqueCodes = new Set<string>();

  for (const caseRecord of form.withdrawalCases ?? []) {
    const code = withdrawalCaseCode(caseRecord);
    if (code) {
      uniqueCodes.add(code);
    }
  }

  for (const caseId of form.linkedCaseIds ?? []) {
    const code = toThreeLetterCode(caseId);
    if (code) {
      uniqueCodes.add(code);
    }
  }

  const prefix = language === "es" ? "Solicitud de retiro de" : "Withdrawal request for";
  const codes = Array.from(uniqueCodes);
  if (codes.length === 0) {
    return language === "es" ? "Solicitud de retiro" : "Withdrawal request";
  }

  return `${prefix} ${formatConjoinedList(codes, language)}`;
}

export function getTwoPQFormDisplayTitle(
  form: TwoPQFormRecord,
  language: FormDisplayLanguage
) {
  if (form.formType === "withdrawal_request") {
    return getWithdrawalRequestTitle(form, language);
  }

  return form.patientName ?? (language === "es" ? "Paciente sin nombre" : "Unnamed patient");
}
