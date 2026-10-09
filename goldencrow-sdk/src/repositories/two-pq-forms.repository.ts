import { FieldPath } from "firebase-admin/firestore";
import { adminAuthFor, adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");
import { AdminRepositoryError } from "./admin-errors.js";
import {
  createPatientForContext,
  grantPatientPortalAccessForNewPatient,
} from "./areas.repository.js";
import { shouldAutomaticallyGrantPatientPortalAccess } from "../lib/patient-portal-credentials.js";
import { isGlobalAdminRole } from "../lib/admin-roles.js";
import { sendInformedConsentEmail } from "../lib/informed-consent-email.js";
import { sendPGFlexLogisticsAssignmentEmail } from "../lib/pgflex-dispatcher-email.js";
import { formatPGFlexReadableDateTime } from "../lib/pgflex-readable-date.js";
import {
  canCreatePatient,
  canViewDoctor,
  canViewInstitution,
  canViewPatient,
  normalizeRoleEmail,
} from "./roles.repository.js";
import {
  createTwoPQRecordForContext,
  getTwoPQDetailForContext,
} from "./two-pq.repository.js";
import { synchronizeTwoPQCasesFilesAndCodes } from "./two-pq-auto-sync.repository.js";
import { cascadeTwoPQCaseStatusToSamplingChildren } from "./two-pq-sampling-status.repository.js";
import {
  canArchiveTwoPQForms,
  canCreateTwoPQFormType,
} from "../lib/two-pq-form-access.js";
import type {
  AdminContext,
  DoctorRecord,
  InstitutionRecord,
  PatientRecord,
  TwoPQFormDraftRecord,
  TwoPQFormDraftStepKey,
  TwoPQFormRecord,
  TwoPQFormType,
} from "../types/sdk.types.js";

const FORMS_COLLECTION = "2pq_forms";
const TWO_PQ_CASE_FIELD_PATH = new FieldPath("2pq_case");
const FORM_DRAFTS_COLLECTION = "2pq-form-drafts";
const CASES_COLLECTION = "2pq_case";
const INSTITUTIONS_COLLECTION = "institutions";
const DOCTORS_COLLECTION = "doctors";
const PATIENTS_COLLECTION = "patients";
const USER_ROLES_COLLECTION = "user_roles";
const PGFLEX_EVENTS_COLLECTION = "pgflex_events";
const SEQUENCES_COLLECTION = "admin_sequences";
const BIOPSY_EMPTY_FIELD_FALLBACK_VALUE = "Not set";
const DEFAULT_OBSERVATIONS_VALUE = "Sin observaciones";
const WITHDRAWAL_PGFLEX_SHIPMENT_TYPE = "2pq" as const;
const WITHDRAWAL_PGFLEX_DESTINATION =
  "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina" as const;
const WITHDRAWAL_PGFLEX_CAPITAL_FEDERAL_ORIGIN_PART =
  "Ciudad Autónoma de Buenos Aires" as const;
const PGFLEX_IDENTIFIER_MAX_LENGTH = 160;

function isInstitutionManagerRole(role: AdminContext["role"]) {
  return (
    role === "institution_admin" ||
    role === "institution_operator" ||
    role === "institution_laboratory_staff"
  );
}

type PatientInformationInput = {
  institutionId?: string;
  doctorId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  medicalRecordNumber?: string;
  birthDate?: string;
  sex?: string;
  status?: "active" | "inactive";
  notes?: string;
  partnerFullName?: string;
  partnerMedicalRecordNumber?: string;
  partnerBirthDate?: string;
  partnerNotes?: string;
};

type InstitutionInformationInput = {
  code?: string;
  name?: string;
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  notes?: string;
};

type MedicalInformationInput = {
  previousConceptionsCount?: number | string;
  previousMiscarriagesCount?: number | string;
  previousBirthsCount?: number | string;
  previousCyclesCount?: number | string;
  maleFactor?: boolean | string;
  spermGameteSource?: string;
  oocyteGameteSource?: string;
  otherBackground?: string;
  clinicalIndication?: string;
  suspectedDiagnosis?: string;
  symptoms?: string;
  familyHistory?: string;
  requestingDoctor?: string;
  notes?: string;
};

type PreviousGeneticTestsInput = {
  pgtASr?: boolean | string;
  karyotype?: boolean | string;
  pgtResult?: string;
  karyotypeResult?: string;
  karyotypeFileName?: string;
  karyotypeFileType?: string;
  karyotypeFileSize?: number | string;
  karyotypeFileContent?: string;
  hasPreviousTests?: string;
  testDescription?: string;
  labName?: string;
  testDate?: string;
  resultSummary?: string;
  reportAvailable?: string;
};

type RequestedTestInput = {
  pgtAFast?: boolean | string;
  pgtAFastReportsMosaicism?: boolean | string;
  pgtAFastReportsSex?: boolean | string;
  pgtAStandard?: boolean | string;
  pgtAStandardReportsMosaicism?: boolean | string;
  pgtAStandardReportsSex?: boolean | string;
  pgtA?: boolean | string;
  pgtSr?: boolean | string;
  pgtSrReportsMosaicism?: boolean | string;
  pgtSrReportsSex?: boolean | string;
  reportsMosaicism?: boolean | string;
  reportsSex?: boolean | string;
  requestReason?: string;
  requestDate?: string;
  testName?: string;
  testCode?: string;
  priority?: string;
  reason?: string;
  notes?: string;
};

type SampleInformationInput = {
  fivCenter?: string;
  centerCode?: string;
  requestingDoctorFirstName?: string;
  requestingDoctorLastName?: string;
  requestingDoctorFullName?: string;
  requestingDoctorAuthEmail?: string;
  requestingDoctorAuthUid?: string;
  requestingDoctorSpecialty?: string;
  requestingDoctorLicenseNumber?: string;
  requestingDoctorContactPhone?: string;
  requestingDoctorStatus?: "active" | "inactive";
  requestingDoctorNotes?: string;
  sampleType?: string;
  processedByFirstName?: string;
  processedByLastName?: string;
  processDate?: string;
  boxCode?: string;
  biopsyCount?: string;
  sampleId?: string;
  collectionDate?: string;
  collectionSite?: string;
  collectorName?: string;
  storageCondition?: string;
  notes?: string;
};

type CaseInformationInput = {
  caseLabel?: string;
  caseStatus?: string;
  caseType?: string;
  priority?: string;
  trackingNumber?: string;
  requestedAt?: string;
  dueAt?: string;
  notes?: string;
};

type SamplingInformationInput = {
  sampleId?: string;
  sampleType?: string;
  processingStatus?: string;
  internalCode?: string;
  embryoStageDay?: string;
  morphology?: string;
  sentUl?: string;
  biopsiedCells?: string;
  cellsVisualized?: boolean | string;
  notes?: string;
};

type TwoPQFormInput = {
  formType: TwoPQFormType;
  linkedStudyRequestFormId?: string | null;
  linkedCaseIds?: string[];
  selectedPatientId?: string;
  selectedInstitutionId?: string;
  selectedCaseId?: string;
  selectedRequestingDoctorId?: string;
  patientInformation?: PatientInformationInput;
  medicalInformation?: MedicalInformationInput;
  previousGeneticTests?: PreviousGeneticTestsInput;
  requestedTest?: RequestedTestInput;
  institutionInformation?: InstitutionInformationInput;
  sampleInformation?: SampleInformationInput;
  caseInformation?: CaseInformationInput;
  samplingInformation?: SamplingInformationInput[];
};

type TwoPQFormDraftInput = {
  formType: TwoPQFormType;
  currentStep: TwoPQFormDraftStepKey;
  stepIndex: number;
  state: Record<string, unknown>;
};

type ListTwoPQFormsOptions = {
  includeArchived?: boolean;
  formType?: TwoPQFormType;
  availableForBiopsy?: boolean;
  limit?: number;
  cursor?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  order?: "newest" | "oldest";
};

type ListTwoPQFormsPage = {
  forms: TwoPQFormRecord[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type TwoPQStudyRequestCaseCandidate = {
  id: string;
  institutionId: string;
  doctorId: string;
  patientId: string | null;
  linkedStudyRequestFormId: string | null;
  three_letter_code: string | null;
  caseLabel: string | null;
  caseStatus: string | null;
  caseType: string | null;
  priority: string | null;
  requestedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type PGFlexDispatcherAssignment = {
  email: string;
  firebaseUid: string;
  displayName: string;
  is_preferred_asignee: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type WithdrawalPGFlexEventDocument = {
  identifier: string;
  shipmentType: typeof WITHDRAWAL_PGFLEX_SHIPMENT_TYPE;
  description: string;
  linked_codes: string | null;
  dispatcherId: string | null;
  dispatcherFirebaseId: string | null;
  dispatcherEmail: string | null;
  origin: string;
  destination: typeof WITHDRAWAL_PGFLEX_DESTINATION;
  timeRequested: string;
  pickupTime: null;
  status: "awaiting_pick_up";
  source: "2pq_withdrawal_request";
  sourceFormId: string;
  linkedCaseIds: string[];
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
  updatedByEmail: string;
};

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeRequiredString(value: unknown, label: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new AdminRepositoryError(`${label} is required.`, 400);
  }
  return normalized;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeObservationsValue(value: unknown) {
  return normalizeOptionalString(value) ?? DEFAULT_OBSERVATIONS_VALUE;
}

function normalizeSearchText(value: unknown) {
  return normalizeOptionalString(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeDateBoundary(value: unknown, boundary: "start" | "end") {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(
        `${normalized}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`,
      )
    : new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function formSearchHaystack(form: TwoPQFormRecord) {
  const patientInformation = form.patientInformation ?? {};
  const caseInformation = form.caseInformation ?? {};
  const samplingInformation = form.samplingInformation ?? [];
  const withdrawalCases = form.withdrawalCases ?? [];
  return (
    normalizeSearchText(
      [
        form.id,
        form.institutionId,
        form.doctorId,
        form.institutionName,
        form.patientName,
        form.patientEmail,
        form.requestedTestName,
        form.selectedPatientId,
        form.selectedInstitutionId,
        form.selectedCaseId,
        form.selectedRequestingDoctorId,
        form.linkedStudyRequestFormId,
        form.studyRequestForm,
        form.withdrawalRequest,
        form.linkedBiopsyForm,
        form.linkedWithdrawalRequest,
        form["2pq_case"],
        form.authorEmail,
        form.createdByEmail,
        ...(form.linkedCaseIds ?? []),
        ...(form.linkedSamplingIds ?? []),
        caseInformation.id,
        caseInformation.three_letter_code,
        caseInformation.caseLabel,
        caseInformation.caseType,
        caseInformation.caseStatus,
        caseInformation.patientId,
        caseInformation.doctorId,
        caseInformation.institutionId,
        ...samplingInformation.flatMap((samplingRecord) => [
          samplingRecord.id,
          samplingRecord.sampleId,
          samplingRecord.internalCode,
          samplingRecord.notes,
        ]),
        ...withdrawalCases.flatMap((caseRecord) => [
          caseRecord.id,
          caseRecord.three_letter_code,
          caseRecord.caseLabel,
          caseRecord.caseStatus,
          caseRecord.patientName,
          caseRecord.reportCode,
          caseRecord.linkedStudyRequest,
          caseRecord.linkedBiopsyForm,
        ]),
        patientInformation.fullName,
        patientInformation.firstName,
        patientInformation.lastName,
        patientInformation.email,
        patientInformation.medicalRecordNumber,
      ]
        .filter(Boolean)
        .join(" "),
    ) ?? ""
  );
}

function formMatchesSearch(
  form: TwoPQFormRecord,
  normalizedSearch: string | undefined,
) {
  if (!normalizedSearch) {
    return true;
  }

  const haystack = formSearchHaystack(form);
  return normalizedSearch
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function formMatchesListFilters(
  form: TwoPQFormRecord,
  context: AdminContext,
  options: ListTwoPQFormsOptions,
  normalizedSearch: string | undefined,
  createdFrom: string | undefined,
  createdTo: string | undefined,
) {
  if (!canViewTwoPQForm(context, form)) {
    return false;
  }
  if (!options.includeArchived && form.archivedAt) {
    return false;
  }
  if (options.formType && form.formType !== options.formType) {
    return false;
  }
  if (
    options.availableForBiopsy &&
    (form.formType !== "study_request" ||
      Boolean(form.linkedBiopsyForm) ||
      Boolean(form["2pq_case"]))
  ) {
    return false;
  }
  if (createdFrom && form.createdAt < createdFrom) {
    return false;
  }
  if (createdTo && form.createdAt > createdTo) {
    return false;
  }
  return formMatchesSearch(form, normalizedSearch);
}

function normalizeThreeLetterCode(value: unknown, label: string) {
  const normalized = normalizeRequiredString(value, label).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new AdminRepositoryError(
      `${label} must be exactly three letters (A-Z).`,
      400,
    );
  }
  return normalized;
}

function normalizeEmail(value: unknown, label: string) {
  const normalized = normalizeRoleEmail(normalizeRequiredString(value, label));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AdminRepositoryError(
      `${label} must be a valid email address.`,
      400,
    );
  }
  return normalized;
}

function normalizeOptionalEmail(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  const email = normalizeRoleEmail(normalized);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminRepositoryError(
      "Contact email must be a valid email address.",
      400,
    );
  }
  return email;
}

function normalizeIsoDateString(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const candidate = new Date(normalized);
  if (Number.isNaN(candidate.getTime())) {
    throw new AdminRepositoryError("Use a valid date value.", 400);
  }

  return candidate.toISOString();
}

function normalizeRequiredIsoDateString(value: unknown, label: string) {
  const normalized = normalizeRequiredString(value, label);
  const candidate = new Date(normalized);
  if (Number.isNaN(candidate.getTime())) {
    throw new AdminRepositoryError(`${label} must be a valid date value.`, 400);
  }

  return candidate.toISOString();
}

function normalizeBooleanAnswer(value: unknown, label: string) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeRequiredString(value, label).toLowerCase();
  if (["si", "sí", "yes", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["no", "false", "0"].includes(normalized)) {
    return false;
  }

  throw new AdminRepositoryError(`${label} must be SI or NO.`, 400);
}

function isBiopsyEmptyFieldFallbackValue(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().toLowerCase() ===
      BIOPSY_EMPTY_FIELD_FALLBACK_VALUE.toLowerCase()
  );
}

function normalizeSamplingCellsVisualizedAnswer(value: unknown, label: string) {
  // Product rule: biopsy form operators may explicitly continue with blank
  // required biopsy cells by storing the literal "Not set". That sentinel is
  // valid for cellsVisualized even though every other nonempty value must
  // still normalize as a standard SI/NO answer.
  if (isBiopsyEmptyFieldFallbackValue(value)) {
    return BIOPSY_EMPTY_FIELD_FALLBACK_VALUE;
  }

  return normalizeBooleanAnswer(value, label) ? "si" : "no";
}

function normalizeOptionalSamplingCellsVisualizedAnswer(
  value: unknown,
  label: string,
) {
  if (typeof value !== "boolean" && !normalizeOptionalString(value)) {
    return undefined;
  }

  return normalizeSamplingCellsVisualizedAnswer(value, label);
}

function joinNameParts(firstName: unknown, lastName: unknown) {
  return [normalizeOptionalString(firstName), normalizeOptionalString(lastName)]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

function normalizeFullName(input: PatientInformationInput) {
  return normalizeRequiredString(
    normalizeOptionalString(input.fullName) ??
      joinNameParts(input.firstName, input.lastName),
    "Patient full name",
  );
}

function normalizeGameteSource(value: unknown, label: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized === "propio" || normalized === "donado") {
    return normalized;
  }

  throw new AdminRepositoryError(`${label} must be propio or donado.`, 400);
}

function normalizePreviousMiscarriages(value: unknown) {
  const normalized = normalizeRequiredString(value, "Numero abortos previos");
  const allowedValues = new Set(["0", "1", "2", "3_or_more", "recurrent"]);
  if (allowedValues.has(normalized)) {
    return normalized;
  }

  throw new AdminRepositoryError(
    "Numero abortos previos must be 0, 1, 2, 3_or_more, or recurrent.",
    400,
  );
}

function normalizeStatus(value: unknown): "active" | "inactive" {
  return value === "inactive" ? "inactive" : "active";
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value ?? null]),
  ) as T;
}

function normalizeInstitutionAddress(data: Record<string, unknown>) {
  const address = normalizeOptionalString(data.address);
  if (address) {
    return address;
  }

  const legacyAddress = [
    normalizeOptionalString(data.addressLine1),
    normalizeOptionalString(data.addressLine2),
  ].filter(Boolean);

  return legacyAddress.length > 0 ? legacyAddress.join(", ") : undefined;
}

function toInstitutionRecord(
  id: string,
  data: Record<string, unknown>,
): InstitutionRecord {
  const now = new Date().toISOString();

  return {
    id,
    code: normalizeOptionalString(data.code) ?? id,
    name: normalizeOptionalString(data.name) ?? id,
    legalName: normalizeOptionalString(data.legalName),
    contactEmail: normalizeOptionalString(data.contactEmail),
    contactPhone: normalizeOptionalString(data.contactPhone),
    address: normalizeInstitutionAddress(data),
    city: normalizeOptionalString(data.city),
    state: normalizeOptionalString(data.state),
    country: normalizeOptionalString(data.country),
    notes: normalizeOptionalString(data.notes),
    createdAt: normalizeOptionalString(data.createdAt) ?? now,
    updatedAt: normalizeOptionalString(data.updatedAt) ?? now,
  };
}

function toDoctorRecord(
  id: string,
  data: Record<string, unknown>,
): DoctorRecord {
  const now = new Date().toISOString();

  return {
    id,
    institutionId: normalizeOptionalString(data.institutionId) ?? "",
    authEmail: normalizeRoleEmail(
      normalizeOptionalString(data.authEmail) ?? "",
    ),
    authUid: normalizeOptionalString(data.authUid),
    fullName: normalizeOptionalString(data.fullName) ?? id,
    specialty: normalizeOptionalString(data.specialty),
    licenseNumber: normalizeOptionalString(data.licenseNumber),
    contactPhone: normalizeOptionalString(data.contactPhone),
    status: data.status === "inactive" ? "inactive" : "active",
    notes: normalizeOptionalString(data.notes),
    createdAt: normalizeOptionalString(data.createdAt) ?? now,
    updatedAt: normalizeOptionalString(data.updatedAt) ?? now,
  };
}

function toPatientRecord(
  id: string,
  data: Record<string, unknown>,
): PatientRecord {
  const now = new Date().toISOString();

  return {
    id,
    institutionId: normalizeOptionalString(data.institutionId) ?? "",
    doctorId: normalizeOptionalString(data.doctorId) ?? "",
    email: normalizeRoleEmail(normalizeOptionalString(data.email) ?? ""),
    fullName: normalizeOptionalString(data.fullName) ?? id,
    medicalRecordNumber: normalizeOptionalString(data.medicalRecordNumber),
    birthDate: normalizeOptionalString(data.birthDate),
    sex: normalizeOptionalString(data.sex),
    status: data.status === "inactive" ? "inactive" : "active",
    notes: normalizeOptionalString(data.notes),
    createdAt: normalizeOptionalString(data.createdAt) ?? now,
    updatedAt: normalizeOptionalString(data.updatedAt) ?? now,
  };
}

function toTwoPQFormRecord(
  id: string,
  data: Record<string, unknown>,
): TwoPQFormRecord {
  const formType =
    data.formType === "sample" || data.formType === "withdrawal_request"
      ? data.formType
      : "study_request";
  const patientInformationRecord = toPlainRecord(data.patientInformation);
  const institutionInformationSource = toPlainRecord(
    data.institutionInformation,
  );
  const institutionInformationRecord = { ...institutionInformationSource };
  delete institutionInformationRecord.addressLine1;
  delete institutionInformationRecord.addressLine2;
  const institutionAddress = normalizeInstitutionAddress(
    institutionInformationSource,
  );
  if (institutionAddress) {
    institutionInformationRecord.address = institutionAddress;
  }
  const caseInformationRecord = toPlainRecord(data.caseInformation);
  const withdrawalCases = Array.isArray(data.withdrawalCases)
    ? data.withdrawalCases.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object",
      )
    : undefined;
  const institutionId =
    normalizeOptionalString(data.institutionId) ??
    normalizeOptionalString(data.selectedInstitutionId) ??
    normalizeOptionalString(patientInformationRecord.institutionId) ??
    normalizeOptionalString(institutionInformationRecord.id) ??
    normalizeOptionalString(institutionInformationRecord.institutionId) ??
    normalizeOptionalString(caseInformationRecord.institutionId) ??
    normalizeOptionalString(withdrawalCases?.[0]?.institutionId) ??
    "";
  const requestedTest = data.requestedTest;
  const authorEmail =
    normalizeOptionalString(data.authorEmail) ??
    normalizeOptionalString(data.createdByEmail);
  const authorUid =
    normalizeOptionalString(data.authorUid) ??
    normalizeOptionalString(data.createdByUid);

  return {
    id,
    formType,
    collectionKey: FORMS_COLLECTION,
    institutionId,
    doctorId:
      normalizeOptionalString(data.doctorId) ??
      normalizeOptionalString(patientInformationRecord.doctorId) ??
      "",
    selectedPatientId: normalizeOptionalString(data.selectedPatientId),
    selectedInstitutionId: normalizeOptionalString(data.selectedInstitutionId),
    patientName: normalizeOptionalString(data.patientName),
    patientEmail: normalizeOptionalString(data.patientEmail),
    institutionName: normalizeOptionalString(data.institutionName),
    requestedTestName: normalizeOptionalString(data.requestedTestName),
    linkedStudyRequestFormId:
      normalizeOptionalString(data.linkedStudyRequestFormId) ?? null,
    studyRequestForm:
      normalizeOptionalString(data.studyRequestForm) ??
      normalizeOptionalString(data.linkedStudyRequestFormId) ??
      null,
    withdrawalRequest: normalizeOptionalString(data.withdrawalRequest) ?? null,
    linkedBiopsyForm: normalizeOptionalString(data.linkedBiopsyForm) ?? null,
    linkedWithdrawalRequest:
      normalizeOptionalString(data.linkedWithdrawalRequest) ?? null,
    "2pq_case": normalizeOptionalString(data["2pq_case"]) ?? null,
    linkedCaseIds: normalizeStringArray(data.linkedCaseIds),
    selectedCaseId: normalizeOptionalString(data.selectedCaseId),
    selectedRequestingDoctorId: normalizeOptionalString(
      data.selectedRequestingDoctorId,
    ),
    linkedCaseId: normalizeOptionalString(data.linkedCaseId),
    linkedSamplingIds: Array.isArray(data.linkedSamplingIds)
      ? data.linkedSamplingIds
          .map((entry) => normalizeOptionalString(entry))
          .filter((entry): entry is string => Boolean(entry))
      : undefined,
    patientInformation:
      patientInformationRecord as TwoPQFormRecord["patientInformation"],
    medicalInformation:
      data.medicalInformation && typeof data.medicalInformation === "object"
        ? (data.medicalInformation as TwoPQFormRecord["medicalInformation"])
        : undefined,
    previousGeneticTests:
      data.previousGeneticTests && typeof data.previousGeneticTests === "object"
        ? (data.previousGeneticTests as TwoPQFormRecord["previousGeneticTests"])
        : undefined,
    requestedTest:
      requestedTest && typeof requestedTest === "object"
        ? (requestedTest as TwoPQFormRecord["requestedTest"])
        : {},
    institutionInformation:
      Object.keys(institutionInformationRecord).length > 0
        ? (institutionInformationRecord as TwoPQFormRecord["institutionInformation"])
        : undefined,
    sampleInformation:
      data.sampleInformation && typeof data.sampleInformation === "object"
        ? (data.sampleInformation as TwoPQFormRecord["sampleInformation"])
        : undefined,
    caseInformation:
      Object.keys(caseInformationRecord).length > 0
        ? (caseInformationRecord as TwoPQFormRecord["caseInformation"])
        : undefined,
    samplingInformation: Array.isArray(data.samplingInformation)
      ? (data.samplingInformation.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === "object",
        ) as TwoPQFormRecord["samplingInformation"])
      : undefined,
    withdrawalCases: withdrawalCases as TwoPQFormRecord["withdrawalCases"],
    createdAt:
      normalizeOptionalString(data.createdAt) ?? new Date().toISOString(),
    updatedAt:
      normalizeOptionalString(data.updatedAt) ?? new Date().toISOString(),
    authorEmail,
    authorUid,
    archivedAt: normalizeOptionalString(data.archivedAt),
    archivedByEmail: normalizeOptionalString(data.archivedByEmail),
    archivedByUid: normalizeOptionalString(data.archivedByUid),
    createdByEmail: normalizeOptionalString(data.createdByEmail),
    createdByUid: normalizeOptionalString(data.createdByUid),
    updatedByEmail: normalizeOptionalString(data.updatedByEmail),
    updatedByUid: normalizeOptionalString(data.updatedByUid),
  };
}

function toTwoPQFormDraftRecord(
  id: string,
  data: Record<string, unknown>,
): TwoPQFormDraftRecord {
  const formType =
    data.formType === "sample" || data.formType === "withdrawal_request"
      ? data.formType
      : "study_request";
  const state = data.state;
  return {
    id,
    formType,
    collectionKey: FORM_DRAFTS_COLLECTION,
    currentStep:
      typeof data.currentStep === "string"
        ? (data.currentStep as TwoPQFormDraftStepKey)
        : "patientInformation",
    stepIndex: Number.isInteger(data.stepIndex) ? Number(data.stepIndex) : 0,
    state:
      state && typeof state === "object" && !Array.isArray(state)
        ? (state as Record<string, unknown>)
        : {},
    createdAt:
      normalizeOptionalString(data.createdAt) ?? new Date().toISOString(),
    updatedAt:
      normalizeOptionalString(data.updatedAt) ?? new Date().toISOString(),
    authorEmail: normalizeOptionalString(data.authorEmail),
    authorUid: normalizeOptionalString(data.authorUid),
    createdByEmail: normalizeOptionalString(data.createdByEmail),
    createdByUid: normalizeOptionalString(data.createdByUid),
    updatedByEmail: normalizeOptionalString(data.updatedByEmail),
    updatedByUid: normalizeOptionalString(data.updatedByUid),
  };
}

async function getNextFormId() {
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb
      .collection(SEQUENCES_COLLECTION)
      .doc(FORMS_COLLECTION);
    const snapshot = await transaction.get(reference);
    const current = Number(snapshot.data()?.current ?? 0);
    const next = current + 1;
    const now = new Date().toISOString();

    transaction.set(
      reference,
      { current: next, updatedAt: now },
      { merge: true },
    );

    return `FORM-${String(next).padStart(5, "0")}`;
  });
}

async function getInstitutionById(institutionId: string) {
  const snapshot = await adminDb
    .collection(INSTITUTIONS_COLLECTION)
    .doc(institutionId)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  return toInstitutionRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
}

async function getDoctorById(doctorId: string) {
  const snapshot = await adminDb
    .collection(DOCTORS_COLLECTION)
    .doc(doctorId)
    .get();
  if (!snapshot.exists) {
    return null;
  }

  return toDoctorRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
}

async function getPatientById(patientId: string) {
  const snapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(patientId)
    .get();
  if (!snapshot.exists) {
    return null;
  }

  return toPatientRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
}

async function validateDoctorInstitutionLink(
  institutionId: string,
  doctorId: string,
) {
  const snapshot = await adminDb
    .collection(DOCTORS_COLLECTION)
    .doc(doctorId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Doctor not found.", 404);
  }

  const doctorInstitutionId = normalizeOptionalString(
    snapshot.data()?.institutionId,
  );
  if (doctorInstitutionId !== institutionId) {
    throw new AdminRepositoryError(
      "The selected doctor must belong to the selected institution.",
      400,
    );
  }
}

function normalizePatientInformation(input: PatientInformationInput) {
  const institutionId = normalizeRequiredString(
    input.institutionId,
    "Patient institution",
  );
  const doctorId = normalizeRequiredString(input.doctorId, "Patient doctor");
  const sex = normalizeOptionalString(input.sex);
  const partnerFullName = normalizeOptionalString(input.partnerFullName);
  const partnerMedicalRecordNumber = normalizeOptionalString(
    input.partnerMedicalRecordNumber,
  );
  const partnerBirthDate = normalizeIsoDateString(input.partnerBirthDate);
  const partnerNotes = normalizeOptionalString(input.partnerNotes);

  return compactRecord({
    institutionId,
    doctorId,
    email: normalizeEmail(input.email, "Patient email"),
    fullName: normalizeFullName(input),
    medicalRecordNumber: normalizeOptionalString(input.medicalRecordNumber),
    birthDate: normalizeIsoDateString(input.birthDate),
    ...(sex ? { sex } : {}),
    status: normalizeStatus(input.status),
    notes: normalizeOptionalString(input.notes),
    ...(partnerFullName ||
    partnerMedicalRecordNumber ||
    partnerBirthDate ||
    partnerNotes
      ? {
          partnerFullName,
          partnerMedicalRecordNumber,
          partnerBirthDate,
          partnerNotes,
        }
      : {}),
  });
}

function buildPatientAdditionalInformation(
  patientInformation: ReturnType<typeof normalizePatientInformation>,
) {
  const hasPartnerInformation = Boolean(
    patientInformation.partnerFullName ||
    patientInformation.partnerMedicalRecordNumber ||
    patientInformation.partnerBirthDate ||
    patientInformation.partnerNotes,
  );

  if (!hasPartnerInformation) {
    return undefined;
  }

  return {
    partner: compactRecord({
      fullName: patientInformation.partnerFullName,
      medicalRecordNumber: patientInformation.partnerMedicalRecordNumber,
      birthDate: patientInformation.partnerBirthDate,
      notes: patientInformation.partnerNotes,
    }),
  };
}

function normalizeInstitutionInformation(input: InstitutionInformationInput) {
  return compactRecord({
    code: normalizeOptionalString(input.code),
    name: normalizeRequiredString(input.name, "Institution name"),
    legalName: normalizeOptionalString(input.legalName),
    contactEmail: normalizeOptionalEmail(input.contactEmail),
    contactPhone: normalizeOptionalString(input.contactPhone),
    address: normalizeOptionalString(input.address),
    city: normalizeOptionalString(input.city),
    state: normalizeOptionalString(input.state),
    country: normalizeOptionalString(input.country),
    notes: normalizeOptionalString(input.notes),
  });
}

function normalizeMedicalInformation(
  input: MedicalInformationInput = {},
  formType: TwoPQFormType = "study_request",
) {
  if (formType === "study_request") {
    return compactRecord({
      spermGameteSource: normalizeGameteSource(
        input.spermGameteSource,
        "Esperma",
      ),
      oocyteGameteSource: normalizeGameteSource(
        input.oocyteGameteSource,
        "Ovocitos",
      ),
      maleFactor: normalizeBooleanAnswer(input.maleFactor, "Factor masculino"),
      previousMiscarriagesCount: normalizePreviousMiscarriages(
        input.previousMiscarriagesCount,
      ),
      otherBackground: normalizeObservationsValue(input.otherBackground),
    });
  }

  return compactRecord({
    clinicalIndication: normalizeRequiredString(
      input.clinicalIndication,
      "Clinical indication",
    ),
    suspectedDiagnosis: normalizeOptionalString(input.suspectedDiagnosis),
    symptoms: normalizeOptionalString(input.symptoms),
    familyHistory: normalizeOptionalString(input.familyHistory),
    requestingDoctor: normalizeOptionalString(input.requestingDoctor),
    notes: normalizeOptionalString(input.notes),
  });
}

function normalizePreviousGeneticTests(
  input: PreviousGeneticTestsInput = {},
  formType: TwoPQFormType = "study_request",
) {
  if (formType === "study_request") {
    const hasKaryotypeInformation = normalizeBooleanAnswer(
      input.karyotype,
      "Tiene informacion de cariotipo",
    );
    const karyotypeFileContent = normalizeOptionalString(
      input.karyotypeFileContent,
    );
    if (hasKaryotypeInformation && !karyotypeFileContent) {
      throw new AdminRepositoryError(
        "Karyotype file is required when karyotype information is SI.",
        400,
      );
    }

    return compactRecord({
      karyotype: hasKaryotypeInformation,
      karyotypeResult: normalizeOptionalString(input.karyotypeResult),
      karyotypeFileName: normalizeOptionalString(input.karyotypeFileName),
      karyotypeFileType: normalizeOptionalString(input.karyotypeFileType),
      karyotypeFileSize:
        typeof input.karyotypeFileSize === "number"
          ? String(input.karyotypeFileSize)
          : normalizeOptionalString(input.karyotypeFileSize),
      karyotypeFileContent,
    });
  }

  return compactRecord({
    hasPreviousTests: normalizeRequiredString(
      input.hasPreviousTests,
      "Previous genetic tests answer",
    ),
    testDescription: normalizeOptionalString(input.testDescription),
    labName: normalizeOptionalString(input.labName),
    testDate: normalizeIsoDateString(input.testDate),
    resultSummary: normalizeOptionalString(input.resultSummary),
    reportAvailable: normalizeOptionalString(input.reportAvailable),
  });
}

function normalizeConditionalBooleanAnswer(
  value: unknown,
  selected: boolean,
  label: string,
) {
  return selected ? normalizeBooleanAnswer(value, label) : undefined;
}

function normalizeRequestedTest(
  input: RequestedTestInput,
  formType: TwoPQFormType = "sample",
) {
  const hasThreeWayRequestedTest =
    typeof input.pgtAFast !== "undefined" ||
    typeof input.pgtAStandard !== "undefined" ||
    typeof input.pgtSr !== "undefined";

  if (formType === "study_request" || hasThreeWayRequestedTest) {
    const pgtAFast = normalizeBooleanAnswer(input.pgtAFast, "PGT-A FAST");
    const pgtAStandard = normalizeBooleanAnswer(
      input.pgtAStandard,
      "PGT-A STANDARD",
    );
    const pgtSr = normalizeBooleanAnswer(input.pgtSr, "PGT-SR");
    if (!pgtAFast && !pgtAStandard && !pgtSr) {
      throw new AdminRepositoryError(
        "At least one requested test must be SI.",
        400,
      );
    }
    if ([pgtAFast, pgtAStandard, pgtSr].filter(Boolean).length > 1) {
      throw new AdminRepositoryError("Only one requested test can be SI.", 400);
    }

    return compactRecord({
      pgtAFast,
      pgtAFastReportsMosaicism: normalizeConditionalBooleanAnswer(
        input.pgtAFastReportsMosaicism,
        pgtAFast,
        "PGT-A FAST informa mosaicismos",
      ),
      pgtAFastReportsSex: normalizeConditionalBooleanAnswer(
        input.pgtAFastReportsSex,
        pgtAFast,
        "PGT-A FAST informa sexo",
      ),
      pgtAStandard,
      pgtAStandardReportsMosaicism: normalizeConditionalBooleanAnswer(
        input.pgtAStandardReportsMosaicism,
        pgtAStandard,
        "PGT-A STANDARD informa mosaicismos",
      ),
      pgtAStandardReportsSex: normalizeConditionalBooleanAnswer(
        input.pgtAStandardReportsSex,
        pgtAStandard,
        "PGT-A STANDARD informa sexo",
      ),
      pgtSr,
      pgtSrReportsMosaicism: normalizeConditionalBooleanAnswer(
        input.pgtSrReportsMosaicism,
        pgtSr,
        "PGT-SR informa mosaicismos",
      ),
      pgtSrReportsSex: normalizeConditionalBooleanAnswer(
        input.pgtSrReportsSex,
        pgtSr,
        "PGT-SR informa sexo",
      ),
    });
  }

  const hasPgtAnswer =
    typeof input.pgtA !== "undefined" || typeof input.pgtSr !== "undefined";
  if (hasPgtAnswer) {
    const pgtA = normalizeBooleanAnswer(input.pgtA, "PGT-A");
    const pgtSr = normalizeBooleanAnswer(input.pgtSr, "PGT-SR");
    if (!pgtA && !pgtSr) {
      throw new AdminRepositoryError(
        "At least one requested test must be SI.",
        400,
      );
    }

    return compactRecord({
      pgtA,
      pgtSr,
    });
  }

  return compactRecord({
    testName: normalizeRequiredString(input.testName, "Requested test"),
    testCode: normalizeOptionalString(input.testCode),
    priority: normalizeOptionalString(input.priority),
    reason: normalizeOptionalString(input.reason),
    notes: normalizeOptionalString(input.notes),
  });
}

function getRequestedTestName(
  requestedTest: Record<string, unknown>,
  formType: TwoPQFormType,
) {
  if (
    formType === "study_request" ||
    "pgtAFast" in requestedTest ||
    "pgtAStandard" in requestedTest
  ) {
    const selectedTests = [
      requestedTest.pgtAFast === true ? "PGT-A FAST" : null,
      requestedTest.pgtAStandard === true ? "PGT-A STANDARD" : null,
      requestedTest.pgtSr === true ? "PGT-SR" : null,
    ].filter((value): value is string => Boolean(value));

    return selectedTests.length > 0
      ? selectedTests.join(" / ")
      : "Solicitud de estudio";
  }

  if ("pgtA" in requestedTest || "pgtSr" in requestedTest) {
    const selectedTests = [
      requestedTest.pgtA === true ? "PGT-A" : null,
      requestedTest.pgtSr === true ? "PGT-SR" : null,
    ].filter((value): value is string => Boolean(value));

    return selectedTests.length > 0
      ? selectedTests.join(" / ")
      : "Solicitud de estudio";
  }

  return normalizeOptionalString(requestedTest.testName) ?? "Requested test";
}

function normalizeSampleInformation(
  input: SampleInformationInput = {},
  requestingDoctor?: DoctorRecord | null,
) {
  const sampleType = normalizeRequiredString(
    input.sampleType,
    "TIPO DE MUESTRA",
  );
  const allowedSampleTypes = new Set([
    "biopsia de trofoectodermo",
    "rebiopsia de trofoectodermo",
    "otro",
  ]);
  if (!allowedSampleTypes.has(sampleType)) {
    throw new AdminRepositoryError("TIPO DE MUESTRA is not valid.", 400);
  }

  return compactRecord({
    fivCenter: normalizeOptionalString(input.fivCenter),
    centerCode: normalizeOptionalString(input.centerCode),
    requestingDoctorId: requestingDoctor?.id,
    requestingDoctorInstitutionId: requestingDoctor?.institutionId,
    requestingDoctorFullName: requestingDoctor?.fullName,
    requestingDoctorAuthEmail: requestingDoctor?.authEmail,
    requestingDoctorAuthUid: requestingDoctor?.authUid,
    requestingDoctorSpecialty: requestingDoctor?.specialty,
    requestingDoctorLicenseNumber: requestingDoctor?.licenseNumber,
    requestingDoctorContactPhone: requestingDoctor?.contactPhone,
    requestingDoctorStatus: requestingDoctor?.status,
    requestingDoctorNotes: requestingDoctor?.notes,
    sampleType,
    biopsyCount: normalizeOptionalString(input.biopsyCount),
    processedByFirstName: normalizeRequiredString(
      input.processedByFirstName,
      "PROCESADO POR nombre",
    ),
    processedByLastName: normalizeRequiredString(
      input.processedByLastName,
      "PROCESADO POR apellido",
    ),
    processDate: normalizeRequiredIsoDateString(
      input.processDate,
      "FECHA PROCESO",
    ),
    boxCode: normalizeThreeLetterCode(input.boxCode, "CODIGO CAJA"),
  });
}

function normalizeCaseInformation(input: CaseInformationInput = {}) {
  return {
    caseLabel: normalizeRequiredString(input.caseLabel, "2PQ case label"),
    caseStatus: normalizeRequiredString(input.caseStatus, "2PQ case status"),
    caseType: normalizeOptionalString(input.caseType),
    priority: normalizeOptionalString(input.priority),
    trackingNumber: normalizeOptionalString(input.trackingNumber),
    requestedAt: normalizeIsoDateString(input.requestedAt) ?? undefined,
    dueAt: normalizeIsoDateString(input.dueAt) ?? undefined,
    notes: normalizeOptionalString(input.notes),
  };
}

function normalizeSamplingInformation(
  input: SamplingInformationInput = {},
  fallbackCaseLabel: string,
) {
  const processingStatus = normalizeRequiredString(
    input.processingStatus,
    "2PQ processing status",
  );
  const isDiscarded = processingStatus === "discarded";
  const optionalCellsVisualized =
    normalizeOptionalSamplingCellsVisualizedAnswer(
      input.cellsVisualized,
      "Celulas visualizadas",
    );

  return {
    caseLabel: fallbackCaseLabel,
    sampleId: normalizeRequiredString(input.sampleId, "2PQ sample ID"),
    sampleType: normalizeRequiredString(input.sampleType, "2PQ sample type"),
    processingStatus,
    internalCode: normalizeOptionalString(input.internalCode),
    embryoStageDay: isDiscarded
      ? normalizeOptionalString(input.embryoStageDay)
      : normalizeRequiredString(input.embryoStageDay, "Estadio dia 5, 6 o 7"),
    morphology: isDiscarded
      ? normalizeOptionalString(input.morphology)
      : normalizeRequiredString(input.morphology, "Morfologia"),
    sentUl: isDiscarded
      ? normalizeOptionalString(input.sentUl)
      : normalizeRequiredString(input.sentUl, "uL enviados"),
    biopsiedCells: isDiscarded
      ? normalizeOptionalString(input.biopsiedCells)
      : normalizeRequiredString(input.biopsiedCells, "Celulas biopsiadas"),
    cellsVisualized: isDiscarded
      ? optionalCellsVisualized
      : normalizeSamplingCellsVisualizedAnswer(
          input.cellsVisualized,
          "Celulas visualizadas",
        ),
    collectionDate: undefined,
    receptionDate: undefined,
    runId: undefined,
    qcStatus: undefined,
    notes: normalizeOptionalString(input.notes),
  };
}

function normalizeSamplingInformationList(
  input: SamplingInformationInput[] | undefined,
  fallbackCaseLabel: string,
) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new AdminRepositoryError(
      "At least one 2PQ sampling record is required.",
      400,
    );
  }

  return input.map((entry) =>
    normalizeSamplingInformation(entry, fallbackCaseLabel),
  );
}

function caseRecordToFormInformation(record: {
  id: string;
  three_letter_code?: string;
  caseLabel?: string;
  caseStatus?: string;
  caseType?: string;
  priority?: string;
  trackingNumber?: string;
  requestedAt?: string;
  dueAt?: string;
  notes?: string;
}) {
  return compactRecord({
    id: record.id,
    three_letter_code: normalizeOptionalString(record.three_letter_code),
    caseLabel: normalizeOptionalString(record.caseLabel),
    caseStatus: normalizeOptionalString(record.caseStatus),
    caseType: normalizeOptionalString(record.caseType),
    priority: normalizeOptionalString(record.priority),
    trackingNumber: normalizeOptionalString(record.trackingNumber),
    requestedAt: normalizeOptionalString(record.requestedAt),
    dueAt: normalizeOptionalString(record.dueAt),
    notes: normalizeOptionalString(record.notes),
  });
}

function samplingRecordToFormInformation(record: {
  id: string;
  parent_case?: string;
  caseLabel?: string;
  sampleId?: string;
  sampleType?: string;
  processingStatus?: string;
  internalCode?: string;
  embryoStageDay?: string;
  morphology?: string;
  sentUl?: string;
  biopsiedCells?: string;
  cellsVisualized?: boolean | string;
  collectionDate?: string;
  receptionDate?: string;
  runId?: string;
  qcStatus?: string;
  notes?: string;
}) {
  return compactRecord({
    id: record.id,
    parent_case: normalizeOptionalString(record.parent_case),
    caseLabel: normalizeOptionalString(record.caseLabel),
    sampleId: normalizeOptionalString(record.sampleId),
    sampleType: normalizeOptionalString(record.sampleType),
    processingStatus: normalizeOptionalString(record.processingStatus),
    internalCode: normalizeOptionalString(record.internalCode),
    embryoStageDay: normalizeOptionalString(record.embryoStageDay),
    morphology: normalizeOptionalString(record.morphology),
    sentUl: normalizeOptionalString(record.sentUl),
    biopsiedCells: normalizeOptionalString(record.biopsiedCells),
    cellsVisualized:
      typeof record.cellsVisualized === "boolean"
        ? record.cellsVisualized
        : normalizeOptionalString(record.cellsVisualized),
    collectionDate: normalizeOptionalString(record.collectionDate),
    receptionDate: normalizeOptionalString(record.receptionDate),
    runId: normalizeOptionalString(record.runId),
    qcStatus: normalizeOptionalString(record.qcStatus),
    notes: normalizeOptionalString(record.notes),
  });
}

function normalizeWithdrawalCaseIds(value: unknown) {
  const ids = normalizeStringArray(value) ?? [];
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) {
    throw new AdminRepositoryError("At least one 2PQ case is required.", 400);
  }
  if (uniqueIds.length > 50) {
    throw new AdminRepositoryError(
      "Withdrawal request can link at most 50 cases.",
      400,
    );
  }

  return uniqueIds;
}

type WithdrawalCaseFormLink = {
  caseId: string;
  studyRequestFormId: string | null;
  biopsyFormId: string | null;
  studyRequestSnapshot: FirebaseFirestore.DocumentSnapshot | null;
  biopsyFormSnapshot: FirebaseFirestore.DocumentSnapshot | null;
};

function canonicalBiopsyStudyRequestId(form: TwoPQFormRecord) {
  if (
    form.studyRequestForm &&
    form.linkedStudyRequestFormId &&
    form.studyRequestForm !== form.linkedStudyRequestFormId
  ) {
    throw new AdminRepositoryError(
      `Biopsy form ${form.id} has conflicting study request links.`,
      409,
    );
  }
  return form.studyRequestForm ?? form.linkedStudyRequestFormId ?? null;
}

function reportCodeForWithdrawalCase(data: Record<string, unknown>) {
  const code = normalizeOptionalString(data.three_letter_code)?.toUpperCase();
  if (!code) {
    return null;
  }
  return code.endsWith("XXX") ? code : `${code}XXX`;
}

async function formLinksForWithdrawalCases(
  caseSnapshots: Array<{
    id: string;
    data: () => Record<string, unknown> | undefined;
  }>,
): Promise<WithdrawalCaseFormLink[]> {
  const caseIds = caseSnapshots.map((snapshot) => snapshot.id);
  const studyIdsByCase = new Map<string, Set<string>>();
  const biopsyIdsByCase = new Map<string, Set<string>>();

  for (const caseId of caseIds) {
    studyIdsByCase.set(caseId, new Set());
    biopsyIdsByCase.set(caseId, new Set());
  }

  for (const snapshot of caseSnapshots) {
    const linkedStudyRequestFormId = normalizeOptionalString(
      snapshot.data()?.linkedStudyRequestFormId,
    );
    if (linkedStudyRequestFormId) {
      studyIdsByCase.get(snapshot.id)?.add(linkedStudyRequestFormId);
    }
  }

  for (let index = 0; index < caseIds.length; index += 30) {
    const chunk = caseIds.slice(index, index + 30);
    if (chunk.length === 0) {
      continue;
    }
    const snapshot = await adminDb
      .collection(FORMS_COLLECTION)
      .where(TWO_PQ_CASE_FIELD_PATH, "in", chunk)
      .limit(100)
      .get();
    for (const document of snapshot.docs) {
      const form = toTwoPQFormRecord(
        document.id,
        document.data() as Record<string, unknown>,
      );
      if (form.formType !== "study_request") {
        continue;
      }
      const caseId = normalizeOptionalString(document.data()?.["2pq_case"]);
      if (!caseId || !studyIdsByCase.has(caseId)) {
        continue;
      }
      studyIdsByCase.get(caseId)?.add(form.id);
    }
  }

  for (const caseField of ["linkedCaseId", "selectedCaseId"] as const) {
    for (let index = 0; index < caseIds.length; index += 30) {
      const chunk = caseIds.slice(index, index + 30);
      if (chunk.length === 0) {
        continue;
      }
      const snapshot = await adminDb
        .collection(FORMS_COLLECTION)
        .where(caseField, "in", chunk)
        .limit(100)
        .get();
      for (const document of snapshot.docs) {
        const form = toTwoPQFormRecord(
          document.id,
          document.data() as Record<string, unknown>,
        );
        if (form.formType !== "sample") {
          continue;
        }
        const caseId = normalizeOptionalString(document.data()?.[caseField]);
        if (!caseId || !studyIdsByCase.has(caseId)) {
          continue;
        }
        const studyRequestFormId = canonicalBiopsyStudyRequestId(form);
        if (studyRequestFormId) {
          studyIdsByCase.get(caseId)?.add(studyRequestFormId);
        }
        biopsyIdsByCase.get(caseId)?.add(form.id);
      }
    }
  }

  for (const caseId of caseIds) {
    if ((studyIdsByCase.get(caseId)?.size ?? 0) > 1) {
      throw new AdminRepositoryError(
        `2PQ case ${caseId} is linked to more than one study request form.`,
        409,
      );
    }
    if ((biopsyIdsByCase.get(caseId)?.size ?? 0) > 1) {
      throw new AdminRepositoryError(
        `2PQ case ${caseId} is linked to more than one biopsy form.`,
        409,
      );
    }
  }

  const studyRequestFormIds = [
    ...new Set([...studyIdsByCase.values()].flatMap((ids) => [...ids])),
  ];
  const studyRequestSnapshots = await Promise.all(
    studyRequestFormIds.map((formId) =>
      adminDb.collection(FORMS_COLLECTION).doc(formId).get(),
    ),
  );
  const studyRequestById = new Map(
    studyRequestSnapshots.map((snapshot) => [snapshot.id, snapshot]),
  );

  for (const caseId of caseIds) {
    const studyRequestFormId = [...(studyIdsByCase.get(caseId) ?? [])][0];
    if (!studyRequestFormId) {
      continue;
    }
    const snapshot = studyRequestById.get(studyRequestFormId);
    if (!snapshot?.exists) {
      throw new AdminRepositoryError(
        `Study request form ${studyRequestFormId} linked to case ${caseId} was not found.`,
        404,
      );
    }
    const studyRequest = toTwoPQFormRecord(
      snapshot.id,
      snapshot.data() as Record<string, unknown>,
    );
    if (studyRequest.formType !== "study_request") {
      throw new AdminRepositoryError(
        `Form ${studyRequest.id} linked to case ${caseId} must be a study request form.`,
        400,
      );
    }
    if (studyRequest.linkedBiopsyForm) {
      biopsyIdsByCase.get(caseId)?.add(studyRequest.linkedBiopsyForm);
    }
    if ((biopsyIdsByCase.get(caseId)?.size ?? 0) > 1) {
      throw new AdminRepositoryError(
        `Study request ${studyRequest.id} and case ${caseId} point to different biopsy forms.`,
        409,
      );
    }
  }

  const biopsyFormIds = [
    ...new Set([...biopsyIdsByCase.values()].flatMap((ids) => [...ids])),
  ];
  const biopsySnapshots = await Promise.all(
    biopsyFormIds.map((formId) =>
      adminDb.collection(FORMS_COLLECTION).doc(formId).get(),
    ),
  );
  const biopsyById = new Map(
    biopsySnapshots.map((snapshot) => [snapshot.id, snapshot]),
  );

  return caseIds.map((caseId) => {
    const studyRequestFormId =
      [...(studyIdsByCase.get(caseId) ?? [])][0] ?? null;
    const biopsyFormId = [...(biopsyIdsByCase.get(caseId) ?? [])][0] ?? null;
    const biopsySnapshot = biopsyFormId
      ? (biopsyById.get(biopsyFormId) ?? null)
      : null;
    if (biopsyFormId && !biopsySnapshot?.exists) {
      throw new AdminRepositoryError(
        `Biopsy form ${biopsyFormId} linked to case ${caseId} was not found.`,
        404,
      );
    }
    if (biopsySnapshot) {
      const biopsyForm = toTwoPQFormRecord(
        biopsySnapshot.id,
        biopsySnapshot.data() as Record<string, unknown>,
      );
      if (biopsyForm.formType !== "sample") {
        throw new AdminRepositoryError(
          `Form ${biopsyForm.id} linked to case ${caseId} must be a biopsy form.`,
          400,
        );
      }
      const biopsyStudyRequestId = canonicalBiopsyStudyRequestId(biopsyForm);
      if (
        studyRequestFormId &&
        biopsyStudyRequestId &&
        biopsyStudyRequestId !== studyRequestFormId
      ) {
        throw new AdminRepositoryError(
          `Biopsy form ${biopsyForm.id} is linked to a different study request form.`,
          409,
        );
      }
    }
    return {
      caseId,
      studyRequestFormId,
      biopsyFormId,
      studyRequestSnapshot: studyRequestFormId
        ? (studyRequestById.get(studyRequestFormId) ?? null)
        : null,
      biopsyFormSnapshot: biopsySnapshot,
    };
  });
}

function canWriteWithdrawalCase(
  context: AdminContext,
  record: Pick<TwoPQFormRecord, "institutionId" | "doctorId">,
) {
  if (isGlobalAdminRole(context.role)) {
    return true;
  }
  if (isInstitutionManagerRole(context.role)) {
    return context.institutionId === record.institutionId;
  }
  return (
    context.role === "institution_doctor" &&
    context.institutionId === record.institutionId &&
    context.doctorId === record.doctorId
  );
}

function caseDocumentToWithdrawalInformation(
  id: string,
  data: Record<string, unknown>,
) {
  const caseStatus = normalizeOptionalString(data.caseStatus);
  return compactRecord({
    id,
    institutionId: normalizeOptionalString(data.institutionId),
    doctorId: normalizeOptionalString(data.doctorId),
    patientId: normalizeOptionalString(data.patientId),
    three_letter_code: normalizeOptionalString(data.three_letter_code),
    caseLabel: normalizeOptionalString(data.caseLabel),
    previousCaseStatus: caseStatus,
    caseStatus: "awaiting_pick_up",
    caseType: normalizeOptionalString(data.caseType),
    priority: normalizeOptionalString(data.priority),
    requestedAt: normalizeOptionalString(data.requestedAt),
    notes: normalizeOptionalString(data.notes),
  });
}

function caseDocumentToStudyRequestCandidate(
  id: string,
  data: Record<string, unknown>,
): TwoPQStudyRequestCaseCandidate {
  return {
    id,
    institutionId: normalizeOptionalString(data.institutionId) ?? "",
    doctorId: normalizeOptionalString(data.doctorId) ?? "",
    patientId: normalizeOptionalString(data.patientId) ?? null,
    linkedStudyRequestFormId:
      normalizeOptionalString(data.linkedStudyRequestFormId) ?? null,
    three_letter_code:
      normalizeOptionalString(data.three_letter_code)?.toUpperCase() ?? null,
    caseLabel: normalizeOptionalString(data.caseLabel) ?? null,
    caseStatus: normalizeOptionalString(data.caseStatus) ?? null,
    caseType: normalizeOptionalString(data.caseType) ?? null,
    priority: normalizeOptionalString(data.priority) ?? null,
    requestedAt: normalizeOptionalString(data.requestedAt) ?? null,
    createdAt: normalizeOptionalString(data.createdAt) ?? null,
    updatedAt: normalizeOptionalString(data.updatedAt) ?? null,
  };
}

function caseMatchesStudyRequestScope(
  candidate: TwoPQStudyRequestCaseCandidate,
  form: TwoPQFormRecord,
) {
  const formPatientId =
    form.selectedPatientId ??
    normalizeOptionalString(form.patientInformation?.patientId);
  return (
    candidate.institutionId === form.institutionId &&
    candidate.doctorId === form.doctorId &&
    (!formPatientId ||
      !candidate.patientId ||
      candidate.patientId === formPatientId)
  );
}

async function toPGFlexDispatcherAssignment(doc: {
  id: string;
  data: () => Record<string, unknown>;
}): Promise<PGFlexDispatcherAssignment | null> {
  const data = doc.data();

  if (data.role !== "transport_dispatcher" || data.isActive !== true) {
    return null;
  }

  const email = normalizeRoleEmail(
    normalizeOptionalString(data.email) ?? doc.id,
  );
  let firebaseUid = normalizeOptionalString(data.firebaseUid);
  let authDisplayName: string | undefined;

  if (!firebaseUid) {
    try {
      const user = await adminAuthFor("mydnamap").getUserByEmail(email);
      firebaseUid = user.uid;
      authDisplayName = normalizeOptionalString(user.displayName);
    } catch {
      return null;
    }
  } else if (!normalizeOptionalString(data.displayName)) {
    try {
      const user = await adminAuthFor("mydnamap").getUser(firebaseUid);
      authDisplayName = normalizeOptionalString(user.displayName);
    } catch {
      authDisplayName = undefined;
    }
  }

  return {
    email,
    firebaseUid,
    displayName:
      normalizeOptionalString(data.displayName) ??
      authDisplayName ??
      "Transportista sin nombre",
    is_preferred_asignee: data.is_preferred_asignee === true,
    createdAt: normalizeOptionalString(data.createdAt),
    updatedAt: normalizeOptionalString(data.updatedAt),
  };
}

function dispatcherAssignmentTime(dispatcher: PGFlexDispatcherAssignment) {
  const timestamp =
    Date.parse(dispatcher.createdAt ?? "") ||
    Date.parse(dispatcher.updatedAt ?? "");

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortNewestDispatcherFirst(
  left: PGFlexDispatcherAssignment,
  right: PGFlexDispatcherAssignment,
) {
  const timeDifference =
    dispatcherAssignmentTime(right) - dispatcherAssignmentTime(left);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return left.email.localeCompare(right.email, "es");
}

async function getFirstPGFlexDispatcherAssignment() {
  const snapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .where("role", "==", "transport_dispatcher")
    .where("isActive", "==", true)
    .limit(100)
    .get();
  const dispatchers = (
    await Promise.all(snapshot.docs.map(toPGFlexDispatcherAssignment))
  )
    .filter((dispatcher): dispatcher is PGFlexDispatcherAssignment =>
      Boolean(dispatcher),
    )
    .sort(sortNewestDispatcherFirst);

  const preferredDispatchers = dispatchers.filter(
    (dispatcher) => dispatcher.is_preferred_asignee,
  );

  return preferredDispatchers[0] ?? dispatchers[0] ?? null;
}

function buildWithdrawalPGFlexEventId(formId: string) {
  return `pgflex_withdrawal_${formId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function truncatePGFlexIdentifier(value: string) {
  if (value.length <= PGFLEX_IDENTIFIER_MAX_LENGTH) {
    return value;
  }

  return value.slice(0, PGFLEX_IDENTIFIER_MAX_LENGTH - 3).trimEnd() + "...";
}

function buildWithdrawalPGFlexOrigin(
  institutionInformation: ReturnType<typeof normalizeInstitutionInformation>,
  selectedInstitution: InstitutionRecord | null,
  institutionId: string,
) {
  const parts = [
    normalizeOptionalString(institutionInformation.address) ??
      selectedInstitution?.address,
    normalizeOptionalString(institutionInformation.city) ??
      selectedInstitution?.city,
    normalizeOptionalString(institutionInformation.state) ??
      selectedInstitution?.state,
    normalizeOptionalString(institutionInformation.country) ??
      selectedInstitution?.country,
  ]
    .filter((part): part is string => Boolean(part))
    .map((part) =>
      part === "Capital Federal"
        ? WITHDRAWAL_PGFLEX_CAPITAL_FEDERAL_ORIGIN_PART
        : part,
    );

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return (
    normalizeOptionalString(institutionInformation.name) ??
    selectedInstitution?.name ??
    institutionId
  );
}

function linkedCodesForWithdrawalCases(
  withdrawalCases: Array<Record<string, unknown>>,
) {
  return [
    ...new Set(
      withdrawalCases
        .map((caseRecord) =>
          normalizeOptionalString(caseRecord.three_letter_code)?.toUpperCase(),
        )
        .filter(
          (code): code is string =>
            typeof code === "string" && /^[A-Z]{3}$/.test(code),
        ),
    ),
  ];
}

function buildWithdrawalPGFlexDescription({
  formId,
  linkedCaseIds,
  linkedCodes,
  withdrawalCases,
  authorEmail,
}: {
  formId: string;
  linkedCaseIds: string[];
  linkedCodes: string[];
  withdrawalCases: Array<Record<string, unknown>>;
  authorEmail: string;
}) {
  const caseLabels = withdrawalCases
    .map(
      (caseRecord) =>
        normalizeOptionalString(caseRecord.caseLabel) ??
        normalizeOptionalString(caseRecord.id),
    )
    .filter((label): label is string => Boolean(label));
  const details = [
    `Formulario de solicitud de retiro: ${formId}`,
    caseLabels.length > 0
      ? `Casos: ${caseLabels.join(", ")}`
      : `Casos: ${linkedCaseIds.join(", ")}`,
    linkedCodes.length > 0 ? `Codigos: ${linkedCodes.join(",")}` : undefined,
    `Solicitado por: ${authorEmail}`,
  ].filter((part): part is string => Boolean(part));

  return `${details.join(". ")}.`;
}

function buildWithdrawalPGFlexEventDocument({
  formId,
  institutionInformation,
  selectedInstitution,
  institutionId,
  linkedCaseIds,
  withdrawalCases,
  dispatcher,
  authorEmail,
  now,
}: {
  formId: string;
  institutionInformation: ReturnType<typeof normalizeInstitutionInformation>;
  selectedInstitution: InstitutionRecord | null;
  institutionId: string;
  linkedCaseIds: string[];
  withdrawalCases: Array<Record<string, unknown>>;
  dispatcher: PGFlexDispatcherAssignment | null;
  authorEmail: string;
  now: string;
}): WithdrawalPGFlexEventDocument {
  const institutionName =
    normalizeOptionalString(institutionInformation.name) ??
    selectedInstitution?.name ??
    institutionId;
  const linkedCodes = linkedCodesForWithdrawalCases(withdrawalCases);
  const readableRequestedAt = formatPGFlexReadableDateTime(now) ?? now;

  return {
    identifier: truncatePGFlexIdentifier(
      `${institutionName} - ${readableRequestedAt}`,
    ),
    shipmentType: WITHDRAWAL_PGFLEX_SHIPMENT_TYPE,
    description: buildWithdrawalPGFlexDescription({
      formId,
      linkedCaseIds,
      linkedCodes,
      withdrawalCases,
      authorEmail,
    }),
    linked_codes: linkedCodes.length > 0 ? linkedCodes.join(",") : null,
    dispatcherId: dispatcher?.firebaseUid ?? null,
    dispatcherFirebaseId: dispatcher?.firebaseUid ?? null,
    dispatcherEmail: dispatcher?.email ?? null,
    origin: buildWithdrawalPGFlexOrigin(
      institutionInformation,
      selectedInstitution,
      institutionId,
    ),
    destination: WITHDRAWAL_PGFLEX_DESTINATION,
    timeRequested: now,
    pickupTime: null,
    status: "awaiting_pick_up",
    source: "2pq_withdrawal_request",
    sourceFormId: formId,
    linkedCaseIds,
    createdAt: now,
    updatedAt: now,
    createdByEmail: authorEmail,
    updatedByEmail: authorEmail,
  };
}

async function sendWithdrawalPGFlexAssignmentEmail(
  eventId: string,
  eventDocument: WithdrawalPGFlexEventDocument,
  dispatcher: PGFlexDispatcherAssignment | null,
) {
  if (!dispatcher) {
    return;
  }

  const eventRef = adminDb.collection(PGFLEX_EVENTS_COLLECTION).doc(eventId);

  try {
    await sendPGFlexLogisticsAssignmentEmail(
      {
        email: dispatcher.email,
        displayName: dispatcher.displayName,
      },
      {
        id: eventId,
        identifier: eventDocument.identifier,
        origin: eventDocument.origin,
        destination: eventDocument.destination,
        timeRequested: eventDocument.timeRequested,
      },
    );
    await eventRef.set(
      {
        dispatcherNotificationEmailSentAt: new Date().toISOString(),
        dispatcherNotificationEmailFailedAt: null,
        dispatcherNotificationEmailLastError: null,
      },
      { merge: true },
    );
  } catch (error) {
    await eventRef.set(
      {
        dispatcherNotificationEmailSentAt: null,
        dispatcherNotificationEmailFailedAt: new Date().toISOString(),
        dispatcherNotificationEmailLastError: errorMessage(error),
      },
      { merge: true },
    );
    console.error(
      "Failed to send automatic PGFlex withdrawal assignment email",
      error,
    );
  }
}

function canViewTwoPQForm(
  context: AdminContext,
  form: Pick<TwoPQFormRecord, "institutionId">,
) {
  if (isGlobalAdminRole(context.role)) {
    return true;
  }

  if (
    isInstitutionManagerRole(context.role) ||
    context.role === "institution_doctor"
  ) {
    return context.institutionId === form.institutionId;
  }

  return false;
}

async function legacyLinkedBiopsyFormsByStudyRequestId(
  forms: TwoPQFormRecord[],
) {
  const studyRequestIds = forms
    .filter(
      (form) => form.formType === "study_request" && !form.linkedBiopsyForm,
    )
    .map((form) => form.id);
  const linkedByStudyRequestId = new Map<string, string>();

  for (let index = 0; index < studyRequestIds.length; index += 30) {
    const chunk = studyRequestIds.slice(index, index + 30);
    if (chunk.length === 0) {
      continue;
    }
    const snapshot = await adminDb
      .collection(FORMS_COLLECTION)
      .where("linkedStudyRequestFormId", "in", chunk)
      .limit(Math.min(Math.max(chunk.length * 2, 20), 100))
      .get();
    const biopsyForms = snapshot.docs
      .map((document) =>
        toTwoPQFormRecord(
          document.id,
          document.data() as Record<string, unknown>,
        ),
      )
      .filter((form) => form.formType === "sample")
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      );
    for (const biopsyForm of biopsyForms) {
      const studyRequestId = biopsyForm.linkedStudyRequestFormId;
      if (studyRequestId && !linkedByStudyRequestId.has(studyRequestId)) {
        linkedByStudyRequestId.set(studyRequestId, biopsyForm.id);
      }
    }
  }

  return linkedByStudyRequestId;
}

async function withResolvedLegacyBiopsyLinks(forms: TwoPQFormRecord[]) {
  const legacyLinks = await legacyLinkedBiopsyFormsByStudyRequestId(forms);
  return forms.map((form) => {
    const linkedBiopsyForm =
      form.linkedBiopsyForm ?? legacyLinks.get(form.id) ?? null;
    return linkedBiopsyForm === form.linkedBiopsyForm
      ? form
      : { ...form, linkedBiopsyForm };
  });
}

async function biopsyFormsPointingToStudyRequest(
  context: AdminContext,
  studyRequestFormId: string,
) {
  const biopsyFormsById = new Map<string, TwoPQFormRecord>();
  for (const field of [
    "linkedStudyRequestFormId",
    "studyRequestForm",
  ] as const) {
    const snapshot = await adminDb
      .collection(FORMS_COLLECTION)
      .where(field, "==", studyRequestFormId)
      .limit(20)
      .get();
    for (const document of snapshot.docs) {
      const biopsyForm = toTwoPQFormRecord(
        document.id,
        document.data() as Record<string, unknown>,
      );
      if (
        biopsyForm.formType === "sample" &&
        canViewTwoPQForm(context, biopsyForm)
      ) {
        biopsyFormsById.set(biopsyForm.id, biopsyForm);
      }
    }
  }
  return [...biopsyFormsById.values()].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

async function withBiopsyLinkDiagnostics(
  context: AdminContext,
  form: TwoPQFormRecord,
): Promise<TwoPQFormRecord> {
  if (form.formType !== "study_request") {
    return form;
  }

  const reverseLinkedBiopsies = await biopsyFormsPointingToStudyRequest(
    context,
    form.id,
  );
  const reverseLinkedIds = reverseLinkedBiopsies.map((biopsy) => biopsy.id);
  const actualBiopsyFormId = form.linkedBiopsyForm ?? null;

  if (!actualBiopsyFormId) {
    const suggestedBiopsy = reverseLinkedBiopsies[0];
    const suggestedBacklinkIds = new Set(
      suggestedBiopsy
        ? [
            suggestedBiopsy.studyRequestForm,
            suggestedBiopsy.linkedStudyRequestFormId,
          ].filter((value): value is string => Boolean(value))
        : [],
    );
    const hasSingleSafeSuggestion =
      reverseLinkedIds.length === 1 &&
      suggestedBacklinkIds.size === 1 &&
      suggestedBacklinkIds.has(form.id);
    return {
      ...form,
      linkedBiopsyForm: null,
      suggestedBiopsyForm: hasSingleSafeSuggestion
        ? (reverseLinkedIds[0] ?? null)
        : null,
      biopsyLinkState:
        reverseLinkedIds.length === 0
          ? "none"
          : hasSingleSafeSuggestion
            ? "missing_study_property"
            : "conflict",
    };
  }

  const actualBiopsySnapshot = await adminDb
    .collection(FORMS_COLLECTION)
    .doc(actualBiopsyFormId)
    .get();
  if (!actualBiopsySnapshot.exists) {
    return {
      ...form,
      suggestedBiopsyForm: reverseLinkedIds[0] ?? null,
      biopsyLinkState: "missing_biopsy",
    };
  }

  const actualBiopsy = toTwoPQFormRecord(
    actualBiopsySnapshot.id,
    actualBiopsySnapshot.data() as Record<string, unknown>,
  );
  const backlinkIds = new Set(
    [
      actualBiopsy.studyRequestForm,
      actualBiopsy.linkedStudyRequestFormId,
    ].filter((value): value is string => Boolean(value)),
  );
  const otherReverseLink = reverseLinkedIds.find(
    (biopsyFormId) => biopsyFormId !== actualBiopsyFormId,
  );
  if (
    actualBiopsy.formType !== "sample" ||
    !canViewTwoPQForm(context, actualBiopsy) ||
    backlinkIds.size > 1 ||
    (backlinkIds.size === 1 && !backlinkIds.has(form.id)) ||
    otherReverseLink
  ) {
    return {
      ...form,
      suggestedBiopsyForm: otherReverseLink ?? null,
      biopsyLinkState: "conflict",
    };
  }

  return {
    ...form,
    suggestedBiopsyForm: null,
    biopsyLinkState:
      backlinkIds.size === 0 ? "missing_biopsy_backlink" : "cohesive",
  };
}

async function withBiopsyStudyRequestLinkDiagnostics(
  context: AdminContext,
  form: TwoPQFormRecord,
): Promise<TwoPQFormRecord> {
  if (form.formType !== "sample") {
    return form;
  }

  const storedStudyRequestIds = new Set(
    [form.studyRequestForm, form.linkedStudyRequestFormId].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const reverseLinks = await adminDb
    .collection(FORMS_COLLECTION)
    .where("linkedBiopsyForm", "==", form.id)
    .limit(3)
    .get();
  const reverseStudyRequests = reverseLinks.docs
    .map((document) =>
      toTwoPQFormRecord(
        document.id,
        document.data() as Record<string, unknown>,
      ),
    )
    .filter(
      (candidate) =>
        candidate.formType === "study_request" &&
        canViewTwoPQForm(context, candidate),
    );
  const reverseStudyRequestIds = reverseStudyRequests.map(
    (candidate) => candidate.id,
  );

  if (storedStudyRequestIds.size === 0) {
    return {
      ...form,
      suggestedStudyRequestForm:
        reverseStudyRequestIds.length === 1
          ? (reverseStudyRequestIds[0] ?? null)
          : null,
      studyRequestLinkState:
        reverseStudyRequestIds.length === 0
          ? "none"
          : reverseStudyRequestIds.length === 1
            ? "missing_biopsy_property"
            : "conflict",
    };
  }
  if (storedStudyRequestIds.size > 1) {
    return {
      ...form,
      suggestedStudyRequestForm: reverseStudyRequestIds[0] ?? null,
      studyRequestLinkState: "conflict",
    };
  }

  const actualStudyRequestId = [...storedStudyRequestIds][0]!;
  const studyRequestSnapshot = await adminDb
    .collection(FORMS_COLLECTION)
    .doc(actualStudyRequestId)
    .get();
  if (!studyRequestSnapshot.exists) {
    return {
      ...form,
      suggestedStudyRequestForm: reverseStudyRequestIds[0] ?? null,
      studyRequestLinkState: "missing_study",
    };
  }
  const studyRequest = toTwoPQFormRecord(
    studyRequestSnapshot.id,
    studyRequestSnapshot.data() as Record<string, unknown>,
  );
  const otherReverseStudyRequest = reverseStudyRequestIds.find(
    (studyRequestId) => studyRequestId !== actualStudyRequestId,
  );
  if (
    studyRequest.formType !== "study_request" ||
    !canViewTwoPQForm(context, studyRequest) ||
    (studyRequest.linkedBiopsyForm &&
      studyRequest.linkedBiopsyForm !== form.id) ||
    otherReverseStudyRequest
  ) {
    return {
      ...form,
      suggestedStudyRequestForm: otherReverseStudyRequest ?? null,
      studyRequestLinkState: "conflict",
    };
  }

  return {
    ...form,
    suggestedStudyRequestForm: null,
    studyRequestLinkState: studyRequest.linkedBiopsyForm
      ? "cohesive"
      : "missing_study_backlink",
  };
}

function withdrawalCaseId(caseRecord: Record<string, unknown>) {
  return normalizeOptionalString(caseRecord.id);
}

function withdrawalCaseStudyRequestId(caseRecord: Record<string, unknown>) {
  return normalizeOptionalString(caseRecord.linkedStudyRequest);
}

function withdrawalCaseBiopsyFormId(caseRecord: Record<string, unknown>) {
  return normalizeOptionalString(caseRecord.linkedBiopsyForm);
}

async function studyRequestWithdrawalLinkContext(
  context: AdminContext,
  form: TwoPQFormRecord,
) {
  const relatedCaseIds = new Set<string>();
  const linkedCases = await adminDb
    .collection(CASES_COLLECTION)
    .where("linkedStudyRequestFormId", "==", form.id)
    .limit(20)
    .get();
  linkedCases.docs.forEach((document) => relatedCaseIds.add(document.id));

  let biopsyForm: TwoPQFormRecord | null = null;
  if (form.linkedBiopsyForm) {
    const biopsySnapshot = await adminDb
      .collection(FORMS_COLLECTION)
      .doc(form.linkedBiopsyForm)
      .get();
    if (biopsySnapshot.exists) {
      const candidate = toTwoPQFormRecord(
        biopsySnapshot.id,
        biopsySnapshot.data() as Record<string, unknown>,
      );
      if (
        candidate.formType === "sample" &&
        canViewTwoPQForm(context, candidate)
      ) {
        biopsyForm = candidate;
        [
          candidate.linkedCaseId,
          candidate.selectedCaseId,
          normalizeOptionalString(candidate.caseInformation?.id),
        ].forEach((caseId) => {
          if (caseId) {
            relatedCaseIds.add(caseId);
          }
        });
      }
    }
  }

  const withdrawalFormsById = new Map<string, TwoPQFormRecord>();
  const caseIds = [...relatedCaseIds];
  for (let index = 0; index < caseIds.length; index += 30) {
    const chunk = caseIds.slice(index, index + 30);
    const snapshot = await adminDb
      .collection(FORMS_COLLECTION)
      .where("linkedCaseIds", "array-contains-any", chunk)
      .limit(50)
      .get();
    for (const document of snapshot.docs) {
      const withdrawalForm = toTwoPQFormRecord(
        document.id,
        document.data() as Record<string, unknown>,
      );
      if (
        withdrawalForm.formType === "withdrawal_request" &&
        canViewTwoPQForm(context, withdrawalForm)
      ) {
        withdrawalFormsById.set(withdrawalForm.id, withdrawalForm);
      }
    }
  }

  for (const withdrawalFormId of [
    form.linkedWithdrawalRequest,
    biopsyForm?.withdrawalRequest,
  ]) {
    if (!withdrawalFormId || withdrawalFormsById.has(withdrawalFormId)) {
      continue;
    }
    const snapshot = await adminDb
      .collection(FORMS_COLLECTION)
      .doc(withdrawalFormId)
      .get();
    if (!snapshot.exists) {
      continue;
    }
    withdrawalFormsById.set(
      snapshot.id,
      toTwoPQFormRecord(
        snapshot.id,
        snapshot.data() as Record<string, unknown>,
      ),
    );
  }

  return {
    biopsyForm,
    relatedCaseIds,
    withdrawalFormsById,
  };
}

function withdrawalCaseRowsLinkedToStudyRequest(
  withdrawalForm: TwoPQFormRecord,
  studyRequestFormId: string,
) {
  return (withdrawalForm.withdrawalCases ?? []).filter(
    (caseRecord) =>
      withdrawalCaseStudyRequestId(caseRecord) === studyRequestFormId,
  );
}

function withdrawalCaseRowsCompatibleWithStudyRequest(
  withdrawalForm: TwoPQFormRecord,
  studyRequestFormId: string,
  relatedCaseIds: Set<string>,
) {
  return (withdrawalForm.withdrawalCases ?? []).filter((caseRecord) => {
    const caseId = withdrawalCaseId(caseRecord);
    return (
      withdrawalCaseStudyRequestId(caseRecord) === studyRequestFormId ||
      Boolean(caseId && relatedCaseIds.has(caseId))
    );
  });
}

function withdrawalStudyRowsConflict(
  caseRecords: Record<string, unknown>[],
  studyRequestFormId: string,
) {
  return caseRecords.some((caseRecord) => {
    const linkedStudyRequest = withdrawalCaseStudyRequestId(caseRecord);
    return linkedStudyRequest && linkedStudyRequest !== studyRequestFormId;
  });
}

function biopsyRelatedCaseIds(form: TwoPQFormRecord) {
  return new Set(
    [
      form.linkedCaseId,
      form.selectedCaseId,
      normalizeOptionalString(form.caseInformation?.id),
    ].filter((value): value is string => Boolean(value)),
  );
}

function withdrawalCaseRowsLinkedToBiopsy(
  withdrawalForm: TwoPQFormRecord,
  biopsyFormId: string,
) {
  return (withdrawalForm.withdrawalCases ?? []).filter(
    (caseRecord) => withdrawalCaseBiopsyFormId(caseRecord) === biopsyFormId,
  );
}

function withdrawalCaseRowsCompatibleWithBiopsy(
  withdrawalForm: TwoPQFormRecord,
  biopsyFormId: string,
  relatedCaseIds: Set<string>,
) {
  return (withdrawalForm.withdrawalCases ?? []).filter((caseRecord) => {
    const caseId = withdrawalCaseId(caseRecord);
    return (
      withdrawalCaseBiopsyFormId(caseRecord) === biopsyFormId ||
      Boolean(caseId && relatedCaseIds.has(caseId))
    );
  });
}

function withdrawalBiopsyRowsConflict(
  caseRecords: Record<string, unknown>[],
  biopsyFormId: string,
  studyRequestFormId: string | null,
) {
  return caseRecords.some((caseRecord) => {
    const linkedBiopsyForm = withdrawalCaseBiopsyFormId(caseRecord);
    const linkedStudyRequest = withdrawalCaseStudyRequestId(caseRecord);
    return (
      (linkedBiopsyForm && linkedBiopsyForm !== biopsyFormId) ||
      (studyRequestFormId &&
        linkedStudyRequest &&
        linkedStudyRequest !== studyRequestFormId)
    );
  });
}

async function biopsyWithdrawalLinkContext(
  context: AdminContext,
  form: TwoPQFormRecord,
) {
  const relatedCaseIds = biopsyRelatedCaseIds(form);
  let studyRequest: TwoPQFormRecord | null = null;
  const storedStudyRequestIds = new Set(
    [form.studyRequestForm, form.linkedStudyRequestFormId].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const studyRequestId =
    storedStudyRequestIds.size === 1
      ? ([...storedStudyRequestIds][0] ?? null)
      : null;
  if (studyRequestId) {
    const studyRequestSnapshot = await adminDb
      .collection(FORMS_COLLECTION)
      .doc(studyRequestId)
      .get();
    if (studyRequestSnapshot.exists) {
      const candidate = toTwoPQFormRecord(
        studyRequestSnapshot.id,
        studyRequestSnapshot.data() as Record<string, unknown>,
      );
      if (
        candidate.formType === "study_request" &&
        canViewTwoPQForm(context, candidate)
      ) {
        studyRequest = candidate;
      }
    }
  }

  const withdrawalFormsById = new Map<string, TwoPQFormRecord>();
  const caseIds = [...relatedCaseIds];
  for (let index = 0; index < caseIds.length; index += 30) {
    const chunk = caseIds.slice(index, index + 30);
    const snapshot = await adminDb
      .collection(FORMS_COLLECTION)
      .where("linkedCaseIds", "array-contains-any", chunk)
      .limit(50)
      .get();
    for (const document of snapshot.docs) {
      const withdrawalForm = toTwoPQFormRecord(
        document.id,
        document.data() as Record<string, unknown>,
      );
      if (
        withdrawalForm.formType === "withdrawal_request" &&
        canViewTwoPQForm(context, withdrawalForm)
      ) {
        withdrawalFormsById.set(withdrawalForm.id, withdrawalForm);
      }
    }
  }
  for (const withdrawalRequestId of [
    form.withdrawalRequest,
    studyRequest?.linkedWithdrawalRequest,
  ]) {
    if (!withdrawalRequestId || withdrawalFormsById.has(withdrawalRequestId)) {
      continue;
    }
    const snapshot = await adminDb
      .collection(FORMS_COLLECTION)
      .doc(withdrawalRequestId)
      .get();
    if (!snapshot.exists) {
      continue;
    }
    withdrawalFormsById.set(
      snapshot.id,
      toTwoPQFormRecord(
        snapshot.id,
        snapshot.data() as Record<string, unknown>,
      ),
    );
  }

  return {
    relatedCaseIds,
    studyRequest,
    withdrawalFormsById,
  };
}

async function withBiopsyWithdrawalLinkDiagnostics(
  context: AdminContext,
  form: TwoPQFormRecord,
): Promise<TwoPQFormRecord> {
  const { relatedCaseIds, studyRequest, withdrawalFormsById } =
    await biopsyWithdrawalLinkContext(context, form);
  const actualWithdrawalRequestId = form.withdrawalRequest ?? null;
  const backlinkWithdrawalIds = [...withdrawalFormsById.values()]
    .filter(
      (withdrawalForm) =>
        withdrawalCaseRowsLinkedToBiopsy(withdrawalForm, form.id).length > 0,
    )
    .map((withdrawalForm) => withdrawalForm.id);
  const suggestedIds = new Set([
    ...backlinkWithdrawalIds,
    ...(studyRequest?.linkedWithdrawalRequest
      ? [studyRequest.linkedWithdrawalRequest]
      : []),
  ]);

  if (!actualWithdrawalRequestId) {
    if (suggestedIds.size === 0) {
      return {
        ...form,
        suggestedWithdrawalRequest: null,
        withdrawalLinkState: "none",
      };
    }
    const suggestedWithdrawalRequest = [...suggestedIds][0] ?? null;
    const suggestedWithdrawal = suggestedWithdrawalRequest
      ? withdrawalFormsById.get(suggestedWithdrawalRequest)
      : undefined;
    const suggestedRows = suggestedWithdrawal
      ? withdrawalCaseRowsCompatibleWithBiopsy(
          suggestedWithdrawal,
          form.id,
          relatedCaseIds,
        )
      : [];
    const safeSuggestion =
      suggestedIds.size === 1 &&
      suggestedWithdrawal?.formType === "withdrawal_request" &&
      canViewTwoPQForm(context, suggestedWithdrawal) &&
      suggestedRows.length > 0 &&
      !withdrawalBiopsyRowsConflict(
        suggestedRows,
        form.id,
        studyRequest?.id ?? null,
      );
    return {
      ...form,
      suggestedWithdrawalRequest: safeSuggestion
        ? suggestedWithdrawalRequest
        : null,
      withdrawalLinkState: safeSuggestion
        ? "missing_biopsy_backlink"
        : "conflict",
    };
  }

  const actualWithdrawal = withdrawalFormsById.get(actualWithdrawalRequestId);
  if (!actualWithdrawal) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "missing_withdrawal",
    };
  }
  if (
    actualWithdrawal.formType !== "withdrawal_request" ||
    !canViewTwoPQForm(context, actualWithdrawal)
  ) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "conflict",
    };
  }
  const otherSuggestedId = [...suggestedIds].find(
    (withdrawalRequestId) => withdrawalRequestId !== actualWithdrawalRequestId,
  );
  if (otherSuggestedId) {
    return {
      ...form,
      suggestedWithdrawalRequest: otherSuggestedId,
      withdrawalLinkState: "conflict",
    };
  }
  const compatibleRows = withdrawalCaseRowsCompatibleWithBiopsy(
    actualWithdrawal,
    form.id,
    relatedCaseIds,
  );
  const backlinkRows = withdrawalCaseRowsLinkedToBiopsy(
    actualWithdrawal,
    form.id,
  );
  if (compatibleRows.length === 0) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "conflict",
    };
  }
  if (
    withdrawalBiopsyRowsConflict(
      compatibleRows,
      form.id,
      studyRequest?.id ?? null,
    )
  ) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "conflict",
    };
  }
  if (backlinkRows.length === 0) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "missing_withdrawal_backlink",
    };
  }
  if (
    studyRequest?.linkedWithdrawalRequest &&
    studyRequest.linkedWithdrawalRequest !== actualWithdrawalRequestId
  ) {
    return {
      ...form,
      suggestedWithdrawalRequest: studyRequest.linkedWithdrawalRequest,
      withdrawalLinkState: "conflict",
    };
  }
  if (studyRequest && !studyRequest.linkedWithdrawalRequest) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "missing_study_property",
    };
  }
  return {
    ...form,
    suggestedWithdrawalRequest: null,
    withdrawalLinkState: "cohesive",
  };
}

async function withWithdrawalLinkDiagnostics(
  context: AdminContext,
  form: TwoPQFormRecord,
): Promise<TwoPQFormRecord> {
  if (form.formType === "sample") {
    return withBiopsyWithdrawalLinkDiagnostics(context, form);
  }
  if (form.formType !== "study_request") {
    return form;
  }

  const { biopsyForm, relatedCaseIds, withdrawalFormsById } =
    await studyRequestWithdrawalLinkContext(context, form);
  const actualWithdrawalRequestId = form.linkedWithdrawalRequest ?? null;
  const backlinkWithdrawalIds = [...withdrawalFormsById.values()]
    .filter(
      (withdrawalForm) =>
        withdrawalCaseRowsLinkedToStudyRequest(withdrawalForm, form.id).length >
        0,
    )
    .map((withdrawalForm) => withdrawalForm.id);
  const suggestedIds = new Set([
    ...backlinkWithdrawalIds,
    ...(biopsyForm?.withdrawalRequest ? [biopsyForm.withdrawalRequest] : []),
  ]);

  if (!actualWithdrawalRequestId) {
    if (suggestedIds.size === 0) {
      return {
        ...form,
        linkedWithdrawalRequest: null,
        suggestedWithdrawalRequest: null,
        withdrawalLinkState: "none",
      };
    }
    const suggestedWithdrawalRequest = [...suggestedIds][0] ?? null;
    const suggestedWithdrawal = suggestedWithdrawalRequest
      ? withdrawalFormsById.get(suggestedWithdrawalRequest)
      : undefined;
    const suggestedRows = suggestedWithdrawal
      ? withdrawalCaseRowsCompatibleWithStudyRequest(
          suggestedWithdrawal,
          form.id,
          relatedCaseIds,
        )
      : [];
    const safeSuggestion =
      suggestedIds.size === 1 &&
      suggestedWithdrawal?.formType === "withdrawal_request" &&
      canViewTwoPQForm(context, suggestedWithdrawal) &&
      suggestedRows.length > 0 &&
      !withdrawalStudyRowsConflict(suggestedRows, form.id);
    return {
      ...form,
      linkedWithdrawalRequest: null,
      suggestedWithdrawalRequest: safeSuggestion
        ? suggestedWithdrawalRequest
        : null,
      withdrawalLinkState: safeSuggestion
        ? "missing_study_property"
        : "conflict",
    };
  }

  const actualWithdrawal = withdrawalFormsById.get(actualWithdrawalRequestId);
  if (!actualWithdrawal) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "missing_withdrawal",
    };
  }
  if (
    actualWithdrawal.formType !== "withdrawal_request" ||
    !canViewTwoPQForm(context, actualWithdrawal)
  ) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "conflict",
    };
  }

  const otherSuggestedId = [...suggestedIds].find(
    (withdrawalRequestId) => withdrawalRequestId !== actualWithdrawalRequestId,
  );
  if (otherSuggestedId) {
    return {
      ...form,
      suggestedWithdrawalRequest: otherSuggestedId,
      withdrawalLinkState: "conflict",
    };
  }

  const compatibleRows = withdrawalCaseRowsCompatibleWithStudyRequest(
    actualWithdrawal,
    form.id,
    relatedCaseIds,
  );
  const backlinkRows = withdrawalCaseRowsLinkedToStudyRequest(
    actualWithdrawal,
    form.id,
  );
  if (compatibleRows.length === 0) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "conflict",
    };
  }
  if (withdrawalStudyRowsConflict(compatibleRows, form.id)) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "conflict",
    };
  }
  if (backlinkRows.length === 0) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "missing_withdrawal_backlink",
    };
  }
  if (
    biopsyForm?.withdrawalRequest &&
    biopsyForm.withdrawalRequest !== actualWithdrawalRequestId
  ) {
    return {
      ...form,
      suggestedWithdrawalRequest: biopsyForm.withdrawalRequest,
      withdrawalLinkState: "conflict",
    };
  }
  if (biopsyForm && !biopsyForm.withdrawalRequest) {
    return {
      ...form,
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "missing_biopsy_backlink",
    };
  }

  return {
    ...form,
    suggestedWithdrawalRequest: null,
    withdrawalLinkState: "cohesive",
  };
}

async function withResolvedWithdrawalCaseLinks(form: TwoPQFormRecord) {
  const linkedCaseIds = form.linkedCaseIds ?? [];
  if (form.formType !== "withdrawal_request" || linkedCaseIds.length === 0) {
    return form;
  }
  const caseSnapshots = await Promise.all(
    linkedCaseIds.map((caseId) =>
      adminDb.collection(CASES_COLLECTION).doc(caseId).get(),
    ),
  );
  const caseLinks = await formLinksForWithdrawalCases(
    caseSnapshots.map((snapshot) => ({
      id: snapshot.id,
      data: () => snapshot.data() as Record<string, unknown> | undefined,
    })),
  );
  const storedCasesById = new Map(
    (form.withdrawalCases ?? []).map((caseRecord) => [
      normalizeOptionalString(caseRecord.id),
      caseRecord,
    ]),
  );
  return {
    ...form,
    withdrawalCases: caseSnapshots.map((snapshot, index) => {
      const data = (snapshot.data() ?? {}) as Record<string, unknown>;
      const caseLink = caseLinks[index];
      return {
        ...(storedCasesById.get(snapshot.id) ??
          caseDocumentToWithdrawalInformation(snapshot.id, data)),
        reportCode: reportCodeForWithdrawalCase(data),
        linkedStudyRequest:
          storedCasesById.get(snapshot.id) &&
          Object.hasOwn(storedCasesById.get(snapshot.id)!, "linkedStudyRequest")
            ? (withdrawalCaseStudyRequestId(
                storedCasesById.get(snapshot.id)!,
              ) ?? null)
            : (caseLink?.studyRequestFormId ?? null),
        linkedBiopsyForm:
          storedCasesById.get(snapshot.id) &&
          Object.hasOwn(storedCasesById.get(snapshot.id)!, "linkedBiopsyForm")
            ? (withdrawalCaseBiopsyFormId(storedCasesById.get(snapshot.id)!) ??
              null)
            : (caseLink?.biopsyFormId ?? null),
      };
    }),
  };
}

async function claimStudyRequestForBiopsyForm(
  context: AdminContext,
  studyRequest: TwoPQFormRecord,
  biopsyFormId: string,
) {
  const legacyLinks = await legacyLinkedBiopsyFormsByStudyRequestId([
    studyRequest,
  ]);
  const legacyBiopsyFormId = legacyLinks.get(studyRequest.id);
  const reference = adminDb.collection(FORMS_COLLECTION).doc(studyRequest.id);
  const linkedBiopsyForm = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new AdminRepositoryError(
        "Linked study request form was not found.",
        404,
      );
    }
    const current = toTwoPQFormRecord(
      snapshot.id,
      snapshot.data() as Record<string, unknown>,
    );
    if (current.formType !== "study_request") {
      throw new AdminRepositoryError(
        "Linked form must be a study request form.",
        400,
      );
    }
    if (!canViewTwoPQForm(context, current)) {
      throw new AdminRepositoryError(
        "You cannot use this study request form.",
        403,
      );
    }

    const existingBiopsyFormId =
      current.linkedBiopsyForm ?? legacyBiopsyFormId ?? null;
    if (!existingBiopsyFormId && current["2pq_case"]) {
      throw new AdminRepositoryError(
        `Study request form ${studyRequest.id} is already linked to 2PQ case ${current["2pq_case"]}.`,
        409,
      );
    }
    if (existingBiopsyFormId && existingBiopsyFormId !== biopsyFormId) {
      if (!current.linkedBiopsyForm && legacyBiopsyFormId) {
        transaction.set(
          reference,
          {
            linkedBiopsyForm: legacyBiopsyFormId,
            updatedAt: new Date().toISOString(),
            updatedByEmail: context.email,
            updatedByUid: context.uid,
          },
          { merge: true },
        );
      }
      return existingBiopsyFormId;
    }

    transaction.set(
      reference,
      {
        linkedBiopsyForm: biopsyFormId,
        updatedAt: new Date().toISOString(),
        updatedByEmail: context.email,
        updatedByUid: context.uid,
      },
      { merge: true },
    );
    return biopsyFormId;
  });

  if (linkedBiopsyForm !== biopsyFormId) {
    throw new AdminRepositoryError(
      `Study request form ${studyRequest.id} is already linked to biopsy form ${linkedBiopsyForm}.`,
      409,
    );
  }
}

async function releaseStudyRequestBiopsyFormClaim(
  context: AdminContext,
  studyRequestFormId: string,
  biopsyFormId: string,
) {
  const reference = adminDb
    .collection(FORMS_COLLECTION)
    .doc(studyRequestFormId);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (
      !snapshot.exists ||
      normalizeOptionalString(snapshot.data()?.linkedBiopsyForm) !==
        biopsyFormId
    ) {
      return;
    }
    transaction.set(
      reference,
      {
        linkedBiopsyForm: null,
        updatedAt: new Date().toISOString(),
        updatedByEmail: context.email,
        updatedByUid: context.uid,
      },
      { merge: true },
    );
  });
}

export async function listTwoPQFormsForContext(
  context: AdminContext,
  options: ListTwoPQFormsOptions = {},
): Promise<ListTwoPQFormsPage> {
  const safeLimit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const fetchWindow = Math.min(Math.max(safeLimit * 3, 30), 100);
  const direction = options.order === "oldest" ? "asc" : "desc";
  const normalizedSearch = normalizeSearchText(options.search);
  const createdFrom = normalizeDateBoundary(options.createdFrom, "start");
  const createdTo = normalizeDateBoundary(options.createdTo, "end");

  async function readPage(
    useIndexedFilters: boolean,
  ): Promise<ListTwoPQFormsPage> {
    const accepted: Array<{ form: TwoPQFormRecord; cursor: string }> = [];
    let cursorSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
    let lastScannedCursor: string | null = null;
    let hasMore = false;
    let scanned = 0;
    const maxScanned = normalizedSearch ? 500 : 250;

    if (options.cursor) {
      const snapshot = await adminDb
        .collection(FORMS_COLLECTION)
        .doc(options.cursor)
        .get();
      if (snapshot.exists) {
        cursorSnapshot = snapshot;
      }
    }

    while (accepted.length < safeLimit && scanned < maxScanned) {
      let query = adminDb
        .collection(FORMS_COLLECTION)
        .orderBy("createdAt", direction) as FirebaseFirestore.Query;

      if (createdFrom) {
        query = query.where("createdAt", ">=", createdFrom);
      }
      if (createdTo) {
        query = query.where("createdAt", "<=", createdTo);
      }
      if (useIndexedFilters && !isGlobalAdminRole(context.role)) {
        query = query.where(
          "institutionId",
          "==",
          context.institutionId ?? "__none__",
        );
      }
      if (useIndexedFilters && options.formType) {
        query = query.where("formType", "==", options.formType);
      }
      if (cursorSnapshot) {
        query = query.startAfter(cursorSnapshot);
      }

      const snapshot = await query.limit(fetchWindow).get();
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      scanned += snapshot.size;
      const windowForms = snapshot.docs.map((doc) =>
        toTwoPQFormRecord(doc.id, doc.data() as Record<string, unknown>),
      );
      const resolvedForms = options.availableForBiopsy
        ? await withResolvedLegacyBiopsyLinks(windowForms)
        : windowForms;
      for (const form of resolvedForms) {
        if (
          formMatchesListFilters(
            form,
            context,
            options,
            normalizedSearch,
            createdFrom,
            createdTo,
          )
        ) {
          accepted.push({ form, cursor: form.id });
          if (accepted.length >= safeLimit) {
            break;
          }
        }
      }

      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      lastScannedCursor = lastDoc?.id ?? lastScannedCursor;
      cursorSnapshot = lastDoc ?? cursorSnapshot;

      if (accepted.length >= safeLimit) {
        hasMore =
          snapshot.size === fetchWindow ||
          snapshot.docs[snapshot.docs.length - 1]?.id !==
            accepted[accepted.length - 1]?.cursor;
        break;
      }
      if (snapshot.size < fetchWindow) {
        hasMore = false;
        break;
      }

      hasMore = true;
    }

    const forms = accepted.map((entry) => entry.form);
    const nextCursor =
      forms.length > 0
        ? (accepted[accepted.length - 1]?.cursor ?? null)
        : hasMore
          ? lastScannedCursor
          : null;

    return {
      forms,
      nextCursor,
      hasMore,
    };
  }

  try {
    return await readPage(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/index|FAILED_PRECONDITION/i.test(message)) {
      throw error;
    }

    return readPage(false);
  }
}

export async function getTwoPQFormForContext(
  context: AdminContext,
  formId: string,
): Promise<TwoPQFormRecord> {
  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const snapshot = await adminDb
    .collection(FORMS_COLLECTION)
    .doc(normalizedFormId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Form not found.", 404);
  }

  const form = toTwoPQFormRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
  if (!canViewTwoPQForm(context, form)) {
    throw new AdminRepositoryError("You cannot view this form.", 403);
  }

  const formWithBiopsyDiagnostics = await withBiopsyLinkDiagnostics(
    context,
    form,
  );
  const formWithStudyRequestDiagnostics =
    await withBiopsyStudyRequestLinkDiagnostics(
      context,
      formWithBiopsyDiagnostics,
    );
  const formWithWithdrawalDiagnostics = await withWithdrawalLinkDiagnostics(
    context,
    formWithStudyRequestDiagnostics,
  );
  return withResolvedWithdrawalCaseLinks(formWithWithdrawalDiagnostics);
}

export async function listTwoPQStudyRequestCaseCandidatesForContext(
  context: AdminContext,
  formId: string,
  search?: string,
): Promise<TwoPQStudyRequestCaseCandidate[]> {
  const studyRequest = await getTwoPQFormForContext(context, formId);
  if (studyRequest.formType !== "study_request") {
    throw new AdminRepositoryError(
      "Only study request forms can select a linked 2PQ case.",
      400,
    );
  }

  const normalizedSearch = normalizeSearchText(search);
  const collection = adminDb.collection(CASES_COLLECTION);
  const snapshot = await collection
    .where("institutionId", "==", studyRequest.institutionId)
    .limit(50)
    .get();
  const documents = new Map<string, FirebaseFirestore.DocumentSnapshot>(
    snapshot.docs.map((document) => [document.id, document]),
  );
  const exactSearch = normalizeOptionalString(search);
  if (exactSearch && !documents.has(exactSearch)) {
    const exactSnapshot = await collection.doc(exactSearch).get();
    if (exactSnapshot.exists) {
      documents.set(exactSnapshot.id, exactSnapshot);
    }
  }

  return [...documents.values()]
    .map((document) =>
      caseDocumentToStudyRequestCandidate(
        document.id,
        (document.data() ?? {}) as Record<string, unknown>,
      ),
    )
    .filter((candidate) => caseMatchesStudyRequestScope(candidate, studyRequest))
    .filter(
      (candidate) =>
        !candidate.linkedStudyRequestFormId ||
        candidate.linkedStudyRequestFormId === studyRequest.id,
    )
    .filter((candidate) => {
      if (!normalizedSearch) {
        return true;
      }
      const haystack = normalizeSearchText(
        [
          candidate.id,
          candidate.three_letter_code,
          candidate.caseLabel,
          candidate.caseStatus,
          candidate.caseType,
          candidate.priority,
          candidate.patientId,
        ]
          .filter(Boolean)
          .join(" "),
      );
      return normalizedSearch
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => haystack?.includes(token));
    })
    .sort((left, right) =>
      (right.updatedAt ?? right.createdAt ?? "").localeCompare(
        left.updatedAt ?? left.createdAt ?? "",
      ),
    )
    .slice(0, 20);
}

export async function updateTwoPQStudyRequestCaseLinkForContext(
  context: AdminContext,
  formId: string,
  caseId: string | null,
): Promise<TwoPQFormRecord> {
  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const normalizedCaseId = normalizeOptionalString(caseId) ?? null;
  const currentForm = await getTwoPQFormForContext(context, normalizedFormId);
  if (currentForm.formType !== "study_request") {
    throw new AdminRepositoryError(
      "Only study request forms can configure a linked 2PQ case.",
      400,
    );
  }

  if (normalizedCaseId) {
    const conflictingLinks = await adminDb
      .collection(FORMS_COLLECTION)
      .where(TWO_PQ_CASE_FIELD_PATH, "==", normalizedCaseId)
      .limit(2)
      .get();
    if (
      conflictingLinks.docs.some((document) => document.id !== normalizedFormId)
    ) {
      throw new AdminRepositoryError(
        `2PQ case ${normalizedCaseId} is already linked to another study request form.`,
        409,
      );
    }
  }

  const studyRequestRef = adminDb
    .collection(FORMS_COLLECTION)
    .doc(normalizedFormId);
  await adminDb.runTransaction(async (transaction) => {
    const studyRequestSnapshot = await transaction.get(studyRequestRef);
    if (!studyRequestSnapshot.exists) {
      throw new AdminRepositoryError("Form not found.", 404);
    }
    const latestStudyRequest = toTwoPQFormRecord(
      studyRequestSnapshot.id,
      studyRequestSnapshot.data() as Record<string, unknown>,
    );
    if (
      latestStudyRequest.formType !== "study_request" ||
      !canViewTwoPQForm(context, latestStudyRequest)
    ) {
      throw new AdminRepositoryError(
        "You cannot configure this study request form.",
        403,
      );
    }

    const previousCaseId = latestStudyRequest["2pq_case"] ?? null;
    const caseIds = [previousCaseId, normalizedCaseId]
      .filter((value): value is string => Boolean(value))
      .filter((value, index, values) => values.indexOf(value) === index);
    const caseRefs = caseIds.map((value) =>
      adminDb.collection(CASES_COLLECTION).doc(value),
    );
    const caseSnapshots = await Promise.all(
      caseRefs.map((reference) => transaction.get(reference)),
    );
    const caseSnapshotById = new Map(
      caseSnapshots.map((snapshot) => [snapshot.id, snapshot]),
    );
    const nextCaseSnapshot = normalizedCaseId
      ? caseSnapshotById.get(normalizedCaseId)
      : null;
    if (normalizedCaseId && !nextCaseSnapshot?.exists) {
      throw new AdminRepositoryError("Selected 2PQ case was not found.", 404);
    }

    if (normalizedCaseId && nextCaseSnapshot?.exists) {
      const candidate = caseDocumentToStudyRequestCandidate(
        nextCaseSnapshot.id,
        nextCaseSnapshot.data() as Record<string, unknown>,
      );
      if (
        !canWriteWithdrawalCase(context, candidate) ||
        !caseMatchesStudyRequestScope(candidate, latestStudyRequest)
      ) {
        throw new AdminRepositoryError(
          "Selected 2PQ case must belong to the same institution, doctor, and patient.",
          400,
        );
      }
      if (
        candidate.linkedStudyRequestFormId &&
        candidate.linkedStudyRequestFormId !== normalizedFormId
      ) {
        throw new AdminRepositoryError(
          `2PQ case ${normalizedCaseId} is already linked to study request form ${candidate.linkedStudyRequestFormId}.`,
          409,
        );
      }
    }

    const now = new Date().toISOString();
    if (previousCaseId && previousCaseId !== normalizedCaseId) {
      const previousCaseSnapshot = caseSnapshotById.get(previousCaseId);
      if (
        previousCaseSnapshot?.exists &&
        normalizeOptionalString(
          previousCaseSnapshot.data()?.linkedStudyRequestFormId,
        ) === normalizedFormId
      ) {
        transaction.set(
          previousCaseSnapshot.ref,
          {
            linkedStudyRequestFormId: null,
            updatedAt: now,
            updatedByEmail: context.email,
            updatedByUid: context.uid,
          },
          { merge: true },
        );
      }
    }
    if (normalizedCaseId && nextCaseSnapshot?.exists) {
      transaction.set(
        nextCaseSnapshot.ref,
        {
          linkedStudyRequestFormId: normalizedFormId,
          updatedAt: now,
          updatedByEmail: context.email,
          updatedByUid: context.uid,
        },
        { merge: true },
      );
    }
    transaction.set(
      studyRequestRef,
      {
        "2pq_case": normalizedCaseId,
        updatedAt: now,
        updatedByEmail: context.email,
        updatedByUid: context.uid,
      },
      { merge: true },
    );
  });

  return getTwoPQFormForContext(context, normalizedFormId);
}

export async function updateTwoPQStudyRequestBiopsyLinkForContext(
  context: AdminContext,
  formId: string,
  linkedBiopsyForm: string | null,
): Promise<TwoPQFormRecord> {
  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const normalizedBiopsyFormId =
    normalizeOptionalString(linkedBiopsyForm) ?? null;
  const currentForm = await getTwoPQFormForContext(context, normalizedFormId);
  if (currentForm.formType !== "study_request") {
    throw new AdminRepositoryError(
      "Only study request forms can configure a linked biopsy form.",
      400,
    );
  }

  if (normalizedBiopsyFormId) {
    const conflictingLinks = await adminDb
      .collection(FORMS_COLLECTION)
      .where("linkedBiopsyForm", "==", normalizedBiopsyFormId)
      .limit(2)
      .get();
    if (
      conflictingLinks.docs.some((document) => document.id !== normalizedFormId)
    ) {
      throw new AdminRepositoryError(
        `Biopsy form ${normalizedBiopsyFormId} is already linked to another study request form.`,
        409,
      );
    }
  }

  const studyRequestRef = adminDb
    .collection(FORMS_COLLECTION)
    .doc(normalizedFormId);
  await adminDb.runTransaction(async (transaction) => {
    const studyRequestSnapshot = await transaction.get(studyRequestRef);
    if (!studyRequestSnapshot.exists) {
      throw new AdminRepositoryError("Form not found.", 404);
    }
    const latestStudyRequest = toTwoPQFormRecord(
      studyRequestSnapshot.id,
      studyRequestSnapshot.data() as Record<string, unknown>,
    );
    if (
      latestStudyRequest.formType !== "study_request" ||
      !canViewTwoPQForm(context, latestStudyRequest)
    ) {
      throw new AdminRepositoryError(
        "You cannot configure this study request form.",
        403,
      );
    }

    const previousBiopsyFormId =
      latestStudyRequest.linkedBiopsyForm ??
      currentForm.linkedBiopsyForm ??
      currentForm.suggestedBiopsyForm ??
      null;
    const previousBiopsyRef = previousBiopsyFormId
      ? adminDb.collection(FORMS_COLLECTION).doc(previousBiopsyFormId)
      : null;
    const nextBiopsyRef = normalizedBiopsyFormId
      ? adminDb.collection(FORMS_COLLECTION).doc(normalizedBiopsyFormId)
      : null;
    const references = [previousBiopsyRef, nextBiopsyRef].filter(
      (reference, index, all): reference is NonNullable<typeof reference> =>
        Boolean(reference) &&
        all.findIndex((candidate) => candidate?.id === reference?.id) === index,
    );
    const biopsySnapshots = await Promise.all(
      references.map((reference) => transaction.get(reference)),
    );
    const biopsyById = new Map(
      biopsySnapshots.map((snapshot) => [snapshot.id, snapshot]),
    );
    const nextBiopsySnapshot = normalizedBiopsyFormId
      ? biopsyById.get(normalizedBiopsyFormId)
      : undefined;
    if (normalizedBiopsyFormId && !nextBiopsySnapshot?.exists) {
      throw new AdminRepositoryError(
        "Selected biopsy form was not found.",
        404,
      );
    }
    if (normalizedBiopsyFormId && nextBiopsySnapshot) {
      const nextBiopsy = toTwoPQFormRecord(
        nextBiopsySnapshot.id,
        nextBiopsySnapshot.data() as Record<string, unknown>,
      );
      if (nextBiopsy.formType !== "sample") {
        throw new AdminRepositoryError(
          "Selected form must be a biopsy form.",
          400,
        );
      }
      if (!canViewTwoPQForm(context, nextBiopsy)) {
        throw new AdminRepositoryError("You cannot use this biopsy form.", 403);
      }
      if (
        nextBiopsy.institutionId !== latestStudyRequest.institutionId ||
        nextBiopsy.doctorId !== latestStudyRequest.doctorId ||
        (nextBiopsy.selectedPatientId &&
          latestStudyRequest.selectedPatientId &&
          nextBiopsy.selectedPatientId !== latestStudyRequest.selectedPatientId)
      ) {
        throw new AdminRepositoryError(
          "Selected biopsy form must belong to the same institution, doctor, and patient.",
          400,
        );
      }
      const nextBiopsyStudyRequestId =
        canonicalBiopsyStudyRequestId(nextBiopsy);
      if (
        nextBiopsyStudyRequestId &&
        nextBiopsyStudyRequestId !== normalizedFormId
      ) {
        throw new AdminRepositoryError(
          `Biopsy form ${normalizedBiopsyFormId} is already linked to study request form ${nextBiopsyStudyRequestId}.`,
          409,
        );
      }
    }

    const now = new Date().toISOString();
    if (
      previousBiopsyFormId &&
      previousBiopsyFormId !== normalizedBiopsyFormId
    ) {
      const previousSnapshot = biopsyById.get(previousBiopsyFormId);
      if (
        previousSnapshot?.exists &&
        (normalizeOptionalString(previousSnapshot.data()?.studyRequestForm) ??
          normalizeOptionalString(
            previousSnapshot.data()?.linkedStudyRequestFormId,
          )) === normalizedFormId
      ) {
        transaction.set(
          previousSnapshot.ref,
          {
            linkedStudyRequestFormId: null,
            studyRequestForm: null,
            updatedAt: now,
            updatedByEmail: context.email,
            updatedByUid: context.uid,
          },
          { merge: true },
        );
      }
    }
    if (normalizedBiopsyFormId && nextBiopsySnapshot) {
      transaction.set(
        nextBiopsySnapshot.ref,
        {
          linkedStudyRequestFormId: normalizedFormId,
          studyRequestForm: normalizedFormId,
          updatedAt: now,
          updatedByEmail: context.email,
          updatedByUid: context.uid,
        },
        { merge: true },
      );
    }
    transaction.set(
      studyRequestRef,
      {
        linkedBiopsyForm: normalizedBiopsyFormId,
        updatedAt: now,
        updatedByEmail: context.email,
        updatedByUid: context.uid,
      },
      { merge: true },
    );
  });

  return getTwoPQFormForContext(context, normalizedFormId);
}

export async function updateTwoPQStudyRequestWithdrawalLinkForContext(
  context: AdminContext,
  formId: string,
  linkedWithdrawalRequest: string | null,
): Promise<TwoPQFormRecord> {
  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const normalizedWithdrawalRequestId =
    normalizeOptionalString(linkedWithdrawalRequest) ?? null;
  const currentForm = await getTwoPQFormForContext(context, normalizedFormId);
  if (currentForm.formType !== "study_request") {
    throw new AdminRepositoryError(
      "Only study request forms can configure a linked withdrawal request.",
      400,
    );
  }

  const linkContext = await studyRequestWithdrawalLinkContext(
    context,
    currentForm,
  );
  const previousWithdrawalRequestId =
    currentForm.linkedWithdrawalRequest ??
    currentForm.suggestedWithdrawalRequest ??
    null;
  const studyRequestRef = adminDb
    .collection(FORMS_COLLECTION)
    .doc(normalizedFormId);
  const biopsyRef = currentForm.linkedBiopsyForm
    ? adminDb.collection(FORMS_COLLECTION).doc(currentForm.linkedBiopsyForm)
    : null;
  const withdrawalRefs = [
    previousWithdrawalRequestId,
    normalizedWithdrawalRequestId,
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .map((withdrawalRequestId) =>
      adminDb.collection(FORMS_COLLECTION).doc(withdrawalRequestId),
    );

  await adminDb.runTransaction(async (transaction) => {
    const [studyRequestSnapshot, biopsySnapshot, ...withdrawalSnapshots] =
      await Promise.all([
        transaction.get(studyRequestRef),
        biopsyRef ? transaction.get(biopsyRef) : Promise.resolve(null),
        ...withdrawalRefs.map((reference) => transaction.get(reference)),
      ]);
    if (!studyRequestSnapshot.exists) {
      throw new AdminRepositoryError("Form not found.", 404);
    }
    const latestStudyRequest = toTwoPQFormRecord(
      studyRequestSnapshot.id,
      studyRequestSnapshot.data() as Record<string, unknown>,
    );
    if (
      latestStudyRequest.formType !== "study_request" ||
      !canViewTwoPQForm(context, latestStudyRequest)
    ) {
      throw new AdminRepositoryError(
        "You cannot configure this study request form.",
        403,
      );
    }

    const biopsyForm = biopsySnapshot?.exists
      ? toTwoPQFormRecord(
          biopsySnapshot.id,
          biopsySnapshot.data() as Record<string, unknown>,
        )
      : null;
    if (
      biopsyForm &&
      (biopsyForm.formType !== "sample" ||
        !canViewTwoPQForm(context, biopsyForm))
    ) {
      throw new AdminRepositoryError(
        "The linked biopsy form cannot be updated.",
        409,
      );
    }

    const withdrawalSnapshotById = new Map(
      withdrawalSnapshots
        .filter((snapshot): snapshot is FirebaseFirestore.DocumentSnapshot =>
          Boolean(snapshot),
        )
        .map((snapshot) => [snapshot.id, snapshot]),
    );
    const nextWithdrawalSnapshot = normalizedWithdrawalRequestId
      ? withdrawalSnapshotById.get(normalizedWithdrawalRequestId)
      : null;
    if (normalizedWithdrawalRequestId && !nextWithdrawalSnapshot?.exists) {
      throw new AdminRepositoryError(
        "Selected withdrawal request form was not found.",
        404,
      );
    }

    const withdrawalRowsById = new Map<string, Record<string, unknown>[]>();
    withdrawalSnapshotById.forEach((snapshot, withdrawalRequestId) => {
      const data = snapshot.data() as Record<string, unknown>;
      withdrawalRowsById.set(
        withdrawalRequestId,
        Array.isArray(data.withdrawalCases)
          ? data.withdrawalCases.filter(
              (entry): entry is Record<string, unknown> =>
                Boolean(entry) && typeof entry === "object",
            )
          : [],
      );
    });

    if (previousWithdrawalRequestId) {
      const previousRows =
        withdrawalRowsById.get(previousWithdrawalRequestId) ?? [];
      withdrawalRowsById.set(
        previousWithdrawalRequestId,
        previousRows.map((caseRecord) =>
          withdrawalCaseStudyRequestId(caseRecord) === normalizedFormId
            ? {
                ...caseRecord,
                linkedStudyRequest: null,
                linkedBiopsyForm: null,
              }
            : caseRecord,
        ),
      );
    }

    if (normalizedWithdrawalRequestId && nextWithdrawalSnapshot?.exists) {
      const nextWithdrawal = toTwoPQFormRecord(
        nextWithdrawalSnapshot.id,
        nextWithdrawalSnapshot.data() as Record<string, unknown>,
      );
      if (
        nextWithdrawal.formType !== "withdrawal_request" ||
        !canViewTwoPQForm(context, nextWithdrawal) ||
        nextWithdrawal.institutionId !== latestStudyRequest.institutionId
      ) {
        throw new AdminRepositoryError(
          "Selected withdrawal request must belong to the same institution.",
          400,
        );
      }

      const existingRows =
        withdrawalRowsById.get(normalizedWithdrawalRequestId) ?? [];
      const existingCaseIds = new Set(
        existingRows
          .map((caseRecord) => withdrawalCaseId(caseRecord))
          .filter((caseId): caseId is string => Boolean(caseId)),
      );
      const linkedCaseIds = normalizeStringArray(
        nextWithdrawalSnapshot.data()?.linkedCaseIds,
      );
      const missingCompatibleRows = (linkedCaseIds ?? [])
        .filter((caseId) => linkContext.relatedCaseIds.has(caseId))
        .filter((caseId) => !existingCaseIds.has(caseId))
        .map((caseId) => ({ id: caseId }));
      const rowsWithCompatibleCases = [
        ...existingRows,
        ...missingCompatibleRows,
      ];
      const compatibleRows = rowsWithCompatibleCases.filter((caseRecord) => {
        const caseId = withdrawalCaseId(caseRecord);
        return (
          withdrawalCaseStudyRequestId(caseRecord) === normalizedFormId ||
          Boolean(caseId && linkContext.relatedCaseIds.has(caseId))
        );
      });
      if (compatibleRows.length === 0) {
        throw new AdminRepositoryError(
          "Selected withdrawal request has no case associated with this study request.",
          409,
        );
      }
      if (
        compatibleRows.some((caseRecord) => {
          const linkedStudyRequest = withdrawalCaseStudyRequestId(caseRecord);
          return linkedStudyRequest && linkedStudyRequest !== normalizedFormId;
        })
      ) {
        throw new AdminRepositoryError(
          "A matching withdrawal case is linked to another study request.",
          409,
        );
      }
      const compatibleCaseIds = new Set(
        compatibleRows
          .map((caseRecord) => withdrawalCaseId(caseRecord))
          .filter((caseId): caseId is string => Boolean(caseId)),
      );
      withdrawalRowsById.set(
        normalizedWithdrawalRequestId,
        rowsWithCompatibleCases.map((caseRecord) => {
          const caseId = withdrawalCaseId(caseRecord);
          const isCompatible =
            withdrawalCaseStudyRequestId(caseRecord) === normalizedFormId ||
            Boolean(caseId && compatibleCaseIds.has(caseId));
          return isCompatible
            ? {
                ...caseRecord,
                linkedStudyRequest: normalizedFormId,
                linkedBiopsyForm: biopsyForm?.id ?? null,
              }
            : caseRecord;
        }),
      );
    }

    const now = new Date().toISOString();
    withdrawalRowsById.forEach((withdrawalCases, withdrawalRequestId) => {
      const snapshot = withdrawalSnapshotById.get(withdrawalRequestId);
      if (!snapshot?.exists) {
        return;
      }
      transaction.set(
        snapshot.ref,
        {
          withdrawalCases,
          updatedAt: now,
          updatedByEmail: context.email,
          updatedByUid: context.uid,
        },
        { merge: true },
      );
    });
    if (biopsySnapshot?.exists && biopsyForm) {
      const nextBiopsyWithdrawalRequest = normalizedWithdrawalRequestId
        ? normalizedWithdrawalRequestId
        : biopsyForm.withdrawalRequest === previousWithdrawalRequestId
          ? null
          : biopsyForm.withdrawalRequest;
      transaction.set(
        biopsySnapshot.ref,
        {
          withdrawalRequest: nextBiopsyWithdrawalRequest,
          updatedAt: now,
          updatedByEmail: context.email,
          updatedByUid: context.uid,
        },
        { merge: true },
      );
    }
    transaction.set(
      studyRequestRef,
      {
        linkedWithdrawalRequest: normalizedWithdrawalRequestId,
        updatedAt: now,
        updatedByEmail: context.email,
        updatedByUid: context.uid,
      },
      { merge: true },
    );
  });

  return getTwoPQFormForContext(context, normalizedFormId);
}

export async function updateTwoPQBiopsyStudyRequestLinkForContext(
  context: AdminContext,
  formId: string,
  studyRequestForm: string | null,
): Promise<TwoPQFormRecord> {
  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const normalizedStudyRequestId =
    normalizeOptionalString(studyRequestForm) ?? null;
  const currentForm = await getTwoPQFormForContext(context, normalizedFormId);
  if (currentForm.formType !== "sample") {
    throw new AdminRepositoryError(
      "Only biopsy forms can configure a linked study request.",
      400,
    );
  }
  if (normalizedStudyRequestId) {
    const existingBiopsies = await biopsyFormsPointingToStudyRequest(
      context,
      normalizedStudyRequestId,
    );
    const conflictingBiopsy = existingBiopsies.find(
      (biopsyForm) => biopsyForm.id !== normalizedFormId,
    );
    if (conflictingBiopsy) {
      throw new AdminRepositoryError(
        `Study request form ${normalizedStudyRequestId} is already linked to biopsy form ${conflictingBiopsy.id}.`,
        409,
      );
    }
  }

  const storedStudyRequestIds = new Set(
    [currentForm.studyRequestForm, currentForm.linkedStudyRequestFormId].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const storedStudyRequestId =
    storedStudyRequestIds.size === 1
      ? [...storedStudyRequestIds][0]
      : undefined;
  const previousStudyRequestId =
    storedStudyRequestId ?? currentForm.suggestedStudyRequestForm ?? null;
  const reverseLinks = await adminDb
    .collection(FORMS_COLLECTION)
    .where("linkedBiopsyForm", "==", normalizedFormId)
    .limit(10)
    .get();
  const studyRequestIds = [
    ...new Set([
      ...reverseLinks.docs.map((document) => document.id),
      ...(previousStudyRequestId ? [previousStudyRequestId] : []),
      ...(normalizedStudyRequestId ? [normalizedStudyRequestId] : []),
    ]),
  ];
  const biopsyRef = adminDb.collection(FORMS_COLLECTION).doc(normalizedFormId);
  const studyRequestRefs = studyRequestIds.map((studyRequestId) =>
    adminDb.collection(FORMS_COLLECTION).doc(studyRequestId),
  );

  await adminDb.runTransaction(async (transaction) => {
    const [biopsySnapshot, ...studyRequestSnapshots] = await Promise.all([
      transaction.get(biopsyRef),
      ...studyRequestRefs.map((reference) => transaction.get(reference)),
    ]);
    if (!biopsySnapshot.exists) {
      throw new AdminRepositoryError("Form not found.", 404);
    }
    const biopsyForm = toTwoPQFormRecord(
      biopsySnapshot.id,
      biopsySnapshot.data() as Record<string, unknown>,
    );
    if (
      biopsyForm.formType !== "sample" ||
      !canViewTwoPQForm(context, biopsyForm)
    ) {
      throw new AdminRepositoryError(
        "You cannot configure this biopsy form.",
        403,
      );
    }
    const studyRequestById = new Map(
      studyRequestSnapshots.map((snapshot) => [snapshot.id, snapshot]),
    );
    const nextStudyRequestSnapshot = normalizedStudyRequestId
      ? studyRequestById.get(normalizedStudyRequestId)
      : null;
    if (normalizedStudyRequestId && !nextStudyRequestSnapshot?.exists) {
      throw new AdminRepositoryError(
        "Selected study request form was not found.",
        404,
      );
    }
    if (normalizedStudyRequestId && nextStudyRequestSnapshot?.exists) {
      const nextStudyRequest = toTwoPQFormRecord(
        nextStudyRequestSnapshot.id,
        nextStudyRequestSnapshot.data() as Record<string, unknown>,
      );
      if (
        nextStudyRequest.formType !== "study_request" ||
        !canViewTwoPQForm(context, nextStudyRequest) ||
        nextStudyRequest.institutionId !== biopsyForm.institutionId ||
        nextStudyRequest.doctorId !== biopsyForm.doctorId ||
        (nextStudyRequest.selectedPatientId &&
          biopsyForm.selectedPatientId &&
          nextStudyRequest.selectedPatientId !== biopsyForm.selectedPatientId)
      ) {
        throw new AdminRepositoryError(
          "Selected study request must belong to the same institution, doctor, and patient.",
          400,
        );
      }
      if (
        nextStudyRequest.linkedBiopsyForm &&
        nextStudyRequest.linkedBiopsyForm !== normalizedFormId
      ) {
        throw new AdminRepositoryError(
          `Study request form ${normalizedStudyRequestId} is already linked to biopsy form ${nextStudyRequest.linkedBiopsyForm}.`,
          409,
        );
      }
    }

    const now = new Date().toISOString();
    studyRequestSnapshots.forEach((snapshot) => {
      if (!snapshot.exists) {
        return;
      }
      const studyRequest = toTwoPQFormRecord(
        snapshot.id,
        snapshot.data() as Record<string, unknown>,
      );
      if (
        snapshot.id !== normalizedStudyRequestId &&
        studyRequest.linkedBiopsyForm === normalizedFormId
      ) {
        transaction.set(
          snapshot.ref,
          {
            linkedBiopsyForm: null,
            updatedAt: now,
            updatedByEmail: context.email,
            updatedByUid: context.uid,
          },
          { merge: true },
        );
      }
    });
    if (normalizedStudyRequestId && nextStudyRequestSnapshot?.exists) {
      transaction.set(
        nextStudyRequestSnapshot.ref,
        {
          linkedBiopsyForm: normalizedFormId,
          updatedAt: now,
          updatedByEmail: context.email,
          updatedByUid: context.uid,
        },
        { merge: true },
      );
    }
    transaction.set(
      biopsyRef,
      {
        linkedStudyRequestFormId: normalizedStudyRequestId,
        studyRequestForm: normalizedStudyRequestId,
        updatedAt: now,
        updatedByEmail: context.email,
        updatedByUid: context.uid,
      },
      { merge: true },
    );
  });

  return getTwoPQFormForContext(context, normalizedFormId);
}

export async function updateTwoPQBiopsyWithdrawalLinkForContext(
  context: AdminContext,
  formId: string,
  withdrawalRequest: string | null,
): Promise<TwoPQFormRecord> {
  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const normalizedWithdrawalRequestId =
    normalizeOptionalString(withdrawalRequest) ?? null;
  const currentForm = await getTwoPQFormForContext(context, normalizedFormId);
  if (currentForm.formType !== "sample") {
    throw new AdminRepositoryError(
      "Only biopsy forms can configure a linked withdrawal request.",
      400,
    );
  }

  const linkContext = await biopsyWithdrawalLinkContext(context, currentForm);
  const previousWithdrawalRequestId =
    currentForm.withdrawalRequest ??
    currentForm.suggestedWithdrawalRequest ??
    null;
  const studyRequestId = canonicalBiopsyStudyRequestId(currentForm);
  const biopsyRef = adminDb.collection(FORMS_COLLECTION).doc(normalizedFormId);
  const studyRequestRef = studyRequestId
    ? adminDb.collection(FORMS_COLLECTION).doc(studyRequestId)
    : null;
  const withdrawalRefs = [
    previousWithdrawalRequestId,
    normalizedWithdrawalRequestId,
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .map((withdrawalRequestId) =>
      adminDb.collection(FORMS_COLLECTION).doc(withdrawalRequestId),
    );

  await adminDb.runTransaction(async (transaction) => {
    const [biopsySnapshot, studyRequestSnapshot, ...withdrawalSnapshots] =
      await Promise.all([
        transaction.get(biopsyRef),
        studyRequestRef
          ? transaction.get(studyRequestRef)
          : Promise.resolve(null),
        ...withdrawalRefs.map((reference) => transaction.get(reference)),
      ]);
    if (!biopsySnapshot.exists) {
      throw new AdminRepositoryError("Form not found.", 404);
    }
    const biopsyForm = toTwoPQFormRecord(
      biopsySnapshot.id,
      biopsySnapshot.data() as Record<string, unknown>,
    );
    if (
      biopsyForm.formType !== "sample" ||
      !canViewTwoPQForm(context, biopsyForm)
    ) {
      throw new AdminRepositoryError(
        "You cannot configure this biopsy form.",
        403,
      );
    }
    const studyRequest = studyRequestSnapshot?.exists
      ? toTwoPQFormRecord(
          studyRequestSnapshot.id,
          studyRequestSnapshot.data() as Record<string, unknown>,
        )
      : null;
    if (
      studyRequest &&
      (studyRequest.formType !== "study_request" ||
        !canViewTwoPQForm(context, studyRequest))
    ) {
      throw new AdminRepositoryError(
        "The linked study request cannot be updated.",
        409,
      );
    }

    const withdrawalSnapshotById = new Map(
      withdrawalSnapshots.map((snapshot) => [snapshot.id, snapshot]),
    );
    const nextWithdrawalSnapshot = normalizedWithdrawalRequestId
      ? withdrawalSnapshotById.get(normalizedWithdrawalRequestId)
      : null;
    if (normalizedWithdrawalRequestId && !nextWithdrawalSnapshot?.exists) {
      throw new AdminRepositoryError(
        "Selected withdrawal request form was not found.",
        404,
      );
    }
    const withdrawalRowsById = new Map<string, Record<string, unknown>[]>();
    withdrawalSnapshotById.forEach((snapshot, withdrawalRequestId) => {
      const data = snapshot.data() as Record<string, unknown>;
      withdrawalRowsById.set(
        withdrawalRequestId,
        Array.isArray(data.withdrawalCases)
          ? data.withdrawalCases.filter(
              (entry): entry is Record<string, unknown> =>
                Boolean(entry) && typeof entry === "object",
            )
          : [],
      );
    });

    if (previousWithdrawalRequestId) {
      const previousRows =
        withdrawalRowsById.get(previousWithdrawalRequestId) ?? [];
      withdrawalRowsById.set(
        previousWithdrawalRequestId,
        previousRows.map((caseRecord) =>
          withdrawalCaseBiopsyFormId(caseRecord) === normalizedFormId
            ? {
                ...caseRecord,
                linkedStudyRequest:
                  withdrawalCaseStudyRequestId(caseRecord) === studyRequestId
                    ? null
                    : (withdrawalCaseStudyRequestId(caseRecord) ?? null),
                linkedBiopsyForm: null,
              }
            : caseRecord,
        ),
      );
    }

    if (normalizedWithdrawalRequestId && nextWithdrawalSnapshot?.exists) {
      const nextWithdrawal = toTwoPQFormRecord(
        nextWithdrawalSnapshot.id,
        nextWithdrawalSnapshot.data() as Record<string, unknown>,
      );
      if (
        nextWithdrawal.formType !== "withdrawal_request" ||
        !canViewTwoPQForm(context, nextWithdrawal) ||
        nextWithdrawal.institutionId !== biopsyForm.institutionId
      ) {
        throw new AdminRepositoryError(
          "Selected withdrawal request must belong to the same institution.",
          400,
        );
      }
      const existingRows =
        withdrawalRowsById.get(normalizedWithdrawalRequestId) ?? [];
      const existingCaseIds = new Set(
        existingRows
          .map((caseRecord) => withdrawalCaseId(caseRecord))
          .filter((caseId): caseId is string => Boolean(caseId)),
      );
      const linkedCaseIds = normalizeStringArray(
        nextWithdrawalSnapshot.data()?.linkedCaseIds,
      );
      const missingCompatibleRows = (linkedCaseIds ?? [])
        .filter((caseId) => linkContext.relatedCaseIds.has(caseId))
        .filter((caseId) => !existingCaseIds.has(caseId))
        .map((caseId) => ({ id: caseId }));
      const rowsWithCompatibleCases = [
        ...existingRows,
        ...missingCompatibleRows,
      ];
      const compatibleRows = rowsWithCompatibleCases.filter((caseRecord) => {
        const caseId = withdrawalCaseId(caseRecord);
        return (
          withdrawalCaseBiopsyFormId(caseRecord) === normalizedFormId ||
          Boolean(caseId && linkContext.relatedCaseIds.has(caseId))
        );
      });
      if (compatibleRows.length === 0) {
        throw new AdminRepositoryError(
          "Selected withdrawal request has no case associated with this biopsy form.",
          409,
        );
      }
      if (
        compatibleRows.some((caseRecord) => {
          const linkedBiopsyForm = withdrawalCaseBiopsyFormId(caseRecord);
          const linkedStudyRequest = withdrawalCaseStudyRequestId(caseRecord);
          return (
            (linkedBiopsyForm && linkedBiopsyForm !== normalizedFormId) ||
            (studyRequestId &&
              linkedStudyRequest &&
              linkedStudyRequest !== studyRequestId)
          );
        })
      ) {
        throw new AdminRepositoryError(
          "A matching withdrawal case is linked to another study request or biopsy form.",
          409,
        );
      }
      const compatibleCaseIds = new Set(
        compatibleRows
          .map((caseRecord) => withdrawalCaseId(caseRecord))
          .filter((caseId): caseId is string => Boolean(caseId)),
      );
      withdrawalRowsById.set(
        normalizedWithdrawalRequestId,
        rowsWithCompatibleCases.map((caseRecord) => {
          const caseId = withdrawalCaseId(caseRecord);
          const isCompatible =
            withdrawalCaseBiopsyFormId(caseRecord) === normalizedFormId ||
            Boolean(caseId && compatibleCaseIds.has(caseId));
          return isCompatible
            ? {
                ...caseRecord,
                linkedStudyRequest:
                  studyRequestId ??
                  withdrawalCaseStudyRequestId(caseRecord) ??
                  null,
                linkedBiopsyForm: normalizedFormId,
              }
            : caseRecord;
        }),
      );
    }

    const now = new Date().toISOString();
    withdrawalRowsById.forEach((withdrawalCases, withdrawalRequestId) => {
      const snapshot = withdrawalSnapshotById.get(withdrawalRequestId);
      if (!snapshot?.exists) {
        return;
      }
      transaction.set(
        snapshot.ref,
        {
          withdrawalCases,
          updatedAt: now,
          updatedByEmail: context.email,
          updatedByUid: context.uid,
        },
        { merge: true },
      );
    });
    if (studyRequestSnapshot?.exists && studyRequest) {
      const nextStudyWithdrawalRequest = normalizedWithdrawalRequestId
        ? normalizedWithdrawalRequestId
        : studyRequest.linkedWithdrawalRequest === previousWithdrawalRequestId
          ? null
          : studyRequest.linkedWithdrawalRequest;
      transaction.set(
        studyRequestSnapshot.ref,
        {
          linkedWithdrawalRequest: nextStudyWithdrawalRequest,
          updatedAt: now,
          updatedByEmail: context.email,
          updatedByUid: context.uid,
        },
        { merge: true },
      );
    }
    transaction.set(
      biopsyRef,
      {
        withdrawalRequest: normalizedWithdrawalRequestId,
        updatedAt: now,
        updatedByEmail: context.email,
        updatedByUid: context.uid,
      },
      { merge: true },
    );
  });

  return getTwoPQFormForContext(context, normalizedFormId);
}

export async function getTwoPQFormDraftForContext(
  context: AdminContext,
): Promise<TwoPQFormDraftRecord | null> {
  const authorUid = normalizeRequiredString(
    context.uid,
    "Form draft owner uid",
  );
  const snapshot = await adminDb
    .collection(FORM_DRAFTS_COLLECTION)
    .doc(authorUid)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  return toTwoPQFormDraftRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
}

export async function upsertTwoPQFormDraftForContext(
  context: AdminContext,
  payload: TwoPQFormDraftInput,
): Promise<TwoPQFormDraftRecord> {
  if (!canCreateTwoPQFormType(context.role, payload.formType)) {
    throw new AdminRepositoryError(
      "Institution operators cannot create sample forms.",
      403,
    );
  }

  const authorEmail = normalizeEmail(context.email, "Form draft author email");
  const authorUid = normalizeRequiredString(
    context.uid,
    "Form draft author uid",
  );
  const now = new Date().toISOString();
  const reference = adminDb.collection(FORM_DRAFTS_COLLECTION).doc(authorUid);
  const snapshot = await reference.get();
  const stepIndex = Number.isInteger(payload.stepIndex)
    ? Math.max(0, payload.stepIndex)
    : 0;
  const document = {
    id: authorUid,
    formType: payload.formType,
    collectionKey: FORM_DRAFTS_COLLECTION,
    currentStep: payload.currentStep,
    stepIndex,
    state:
      payload.state && typeof payload.state === "object" ? payload.state : {},
    createdAt: normalizeOptionalString(snapshot.data()?.createdAt) ?? now,
    updatedAt: now,
    authorEmail,
    authorUid,
    createdByEmail:
      normalizeOptionalString(snapshot.data()?.createdByEmail) ?? authorEmail,
    createdByUid:
      normalizeOptionalString(snapshot.data()?.createdByUid) ?? authorUid,
    updatedByEmail: authorEmail,
    updatedByUid: authorUid,
  };

  await reference.set(document);

  return toTwoPQFormDraftRecord(authorUid, document);
}

export async function deleteTwoPQFormDraftForContext(
  context: AdminContext,
): Promise<{ deleted: true; draftId: string }> {
  const authorUid = normalizeRequiredString(
    context.uid,
    "Form draft owner uid",
  );
  await adminDb.collection(FORM_DRAFTS_COLLECTION).doc(authorUid).delete();
  return { deleted: true, draftId: authorUid };
}

export async function archiveTwoPQFormForContext(
  context: AdminContext,
  formId: string,
): Promise<TwoPQFormRecord> {
  if (!canArchiveTwoPQForms(context.role)) {
    throw new AdminRepositoryError("You cannot archive forms.", 403);
  }

  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const reference = adminDb.collection(FORMS_COLLECTION).doc(normalizedFormId);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Form not found.", 404);
  }

  const form = toTwoPQFormRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
  if (!canViewTwoPQForm(context, form)) {
    throw new AdminRepositoryError("You cannot archive this form.", 403);
  }

  const now = new Date().toISOString();
  const archivedDocument = {
    archivedAt: form.archivedAt ?? now,
    archivedByEmail: form.archivedByEmail ?? context.email,
    archivedByUid: form.archivedByUid ?? context.uid,
    updatedAt: now,
    updatedByEmail: context.email,
    updatedByUid: context.uid,
  };

  await reference.set(archivedDocument, { merge: true });

  return toTwoPQFormRecord(normalizedFormId, {
    ...(snapshot.data() as Record<string, unknown>),
    ...archivedDocument,
  });
}

export async function deleteTwoPQFormForContext(
  context: AdminContext,
  formId: string,
): Promise<{ deleted: true; formId: string }> {
  if (!isGlobalAdminRole(context.role)) {
    throw new AdminRepositoryError("Only full admins can delete forms.", 403);
  }

  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const reference = adminDb.collection(FORMS_COLLECTION).doc(normalizedFormId);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Form not found.", 404);
  }

  const form = toTwoPQFormRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
  );
  if (form.formType === "study_request") {
    const resolvedForm = await getTwoPQFormForContext(
      context,
      normalizedFormId,
    );
    if (
      resolvedForm.linkedWithdrawalRequest ||
      resolvedForm.suggestedWithdrawalRequest
    ) {
      await updateTwoPQStudyRequestWithdrawalLinkForContext(
        context,
        normalizedFormId,
        null,
      );
    }
    if (resolvedForm.linkedBiopsyForm || resolvedForm.suggestedBiopsyForm) {
      await updateTwoPQStudyRequestBiopsyLinkForContext(
        context,
        normalizedFormId,
        null,
      );
    }
  } else if (form.formType === "sample") {
    const resolvedForm = await getTwoPQFormForContext(
      context,
      normalizedFormId,
    );
    if (
      resolvedForm.withdrawalRequest ||
      resolvedForm.suggestedWithdrawalRequest
    ) {
      await updateTwoPQBiopsyWithdrawalLinkForContext(
        context,
        normalizedFormId,
        null,
      );
    }
    if (
      resolvedForm.studyRequestForm ||
      resolvedForm.linkedStudyRequestFormId ||
      resolvedForm.suggestedStudyRequestForm
    ) {
      await updateTwoPQBiopsyStudyRequestLinkForContext(
        context,
        normalizedFormId,
        null,
      );
    }
  } else if (form.formType === "withdrawal_request") {
    const [linkedStudyRequests, linkedBiopsyForms] = await Promise.all([
      adminDb
        .collection(FORMS_COLLECTION)
        .where("linkedWithdrawalRequest", "==", normalizedFormId)
        .limit(50)
        .get(),
      adminDb
        .collection(FORMS_COLLECTION)
        .where("withdrawalRequest", "==", normalizedFormId)
        .limit(50)
        .get(),
    ]);
    const batch = adminDb.batch();
    const now = new Date().toISOString();
    linkedStudyRequests.docs.forEach((studyRequestSnapshot) => {
      batch.set(
        studyRequestSnapshot.ref,
        {
          linkedWithdrawalRequest: null,
          updatedAt: now,
          updatedByEmail: context.email,
          updatedByUid: context.uid,
        },
        { merge: true },
      );
    });
    linkedBiopsyForms.docs.forEach((biopsyFormSnapshot) => {
      batch.set(
        biopsyFormSnapshot.ref,
        {
          withdrawalRequest: null,
          updatedAt: now,
          updatedByEmail: context.email,
          updatedByUid: context.uid,
        },
        { merge: true },
      );
    });
    batch.delete(reference);
    await batch.commit();
    return { deleted: true, formId: normalizedFormId };
  }

  await reference.delete();
  return { deleted: true, formId: normalizedFormId };
}

export async function createTwoPQFormForContext(
  context: AdminContext,
  payload: TwoPQFormInput,
): Promise<TwoPQFormRecord> {
  if (!canCreateTwoPQFormType(context.role, payload.formType)) {
    throw new AdminRepositoryError(
      "Institution operators cannot create sample forms.",
      403,
    );
  }

  const authorEmail = normalizeEmail(context.email, "Form author email");
  const authorUid = normalizeRequiredString(context.uid, "Form author uid");

  if (payload.formType === "withdrawal_request") {
    const linkedCaseIds = normalizeWithdrawalCaseIds(payload.linkedCaseIds);
    const caseSnapshots = await Promise.all(
      linkedCaseIds.map((caseId) =>
        adminDb.collection(CASES_COLLECTION).doc(caseId).get(),
      ),
    );
    const now = new Date().toISOString();
    const withdrawalCaseSnapshots = caseSnapshots.map((snapshot, index) => {
      if (!snapshot.exists) {
        throw new AdminRepositoryError(
          `2PQ case ${linkedCaseIds[index]} was not found.`,
          404,
        );
      }

      const data = snapshot.data() as Record<string, unknown>;
      const caseInformation = caseDocumentToWithdrawalInformation(
        snapshot.id,
        data,
      );
      if (!caseInformation.institutionId || !caseInformation.doctorId) {
        throw new AdminRepositoryError(
          `2PQ case ${snapshot.id} is missing institution or doctor scope.`,
          400,
        );
      }
      if (
        !canWriteWithdrawalCase(context, {
          institutionId: String(caseInformation.institutionId),
          doctorId: String(caseInformation.doctorId),
        })
      ) {
        throw new AdminRepositoryError(
          `You cannot update 2PQ case ${snapshot.id}.`,
          403,
        );
      }

      return caseInformation;
    });
    const institutionIds = new Set(
      withdrawalCaseSnapshots.map((caseRecord) =>
        String(caseRecord.institutionId),
      ),
    );
    if (institutionIds.size !== 1) {
      throw new AdminRepositoryError(
        "All selected 2PQ cases must belong to the same institution.",
        400,
      );
    }

    const primaryCase = withdrawalCaseSnapshots[0];
    if (!primaryCase) {
      throw new AdminRepositoryError("At least one 2PQ case is required.", 400);
    }
    const caseFormLinks = await formLinksForWithdrawalCases(
      caseSnapshots.map((snapshot) => ({
        id: snapshot.id,
        data: () => snapshot.data() as Record<string, unknown> | undefined,
      })),
    );
    const withdrawalCases = withdrawalCaseSnapshots.map(
      (caseRecord, index) => ({
        ...caseRecord,
        reportCode: reportCodeForWithdrawalCase(
          caseSnapshots[index]?.data() as Record<string, unknown>,
        ),
        linkedStudyRequest: caseFormLinks[index]?.studyRequestFormId ?? null,
        linkedBiopsyForm: caseFormLinks[index]?.biopsyFormId ?? null,
      }),
    );
    const linkedStudyRequestSnapshots = [
      ...new Map(
        caseFormLinks
          .map((link) => link.studyRequestSnapshot)
          .filter((snapshot): snapshot is FirebaseFirestore.DocumentSnapshot =>
            Boolean(snapshot?.exists),
          )
          .map((snapshot) => [snapshot.id, snapshot]),
      ).values(),
    ];
    const linkedBiopsySnapshots = [
      ...new Map(
        caseFormLinks
          .map((link) => link.biopsyFormSnapshot)
          .filter((snapshot): snapshot is FirebaseFirestore.DocumentSnapshot =>
            Boolean(snapshot?.exists),
          )
          .map((snapshot) => [snapshot.id, snapshot]),
      ).values(),
    ];
    linkedStudyRequestSnapshots.forEach((snapshot) => {
      const studyRequest = toTwoPQFormRecord(
        snapshot.id,
        snapshot.data() as Record<string, unknown>,
      );
      if (studyRequest.formType !== "study_request") {
        throw new AdminRepositoryError(
          `Form ${studyRequest.id} linked to a withdrawal case must be a study request form.`,
          400,
        );
      }
      if (!canWriteWithdrawalCase(context, studyRequest)) {
        throw new AdminRepositoryError(
          `You cannot update study request form ${studyRequest.id}.`,
          403,
        );
      }
      if (studyRequest.linkedWithdrawalRequest) {
        throw new AdminRepositoryError(
          `Study request form ${studyRequest.id} is already linked to withdrawal request ${studyRequest.linkedWithdrawalRequest}.`,
          409,
        );
      }
    });
    linkedBiopsySnapshots.forEach((snapshot) => {
      const biopsyForm = toTwoPQFormRecord(
        snapshot.id,
        snapshot.data() as Record<string, unknown>,
      );
      if (!canWriteWithdrawalCase(context, biopsyForm)) {
        throw new AdminRepositoryError(
          `You cannot update biopsy form ${biopsyForm.id}.`,
          403,
        );
      }
      if (biopsyForm.withdrawalRequest) {
        throw new AdminRepositoryError(
          `Biopsy form ${biopsyForm.id} is already linked to withdrawal request ${biopsyForm.withdrawalRequest}.`,
          409,
        );
      }
    });
    const institutionId = String(primaryCase.institutionId);
    const doctorId = String(primaryCase.doctorId);
    const selectedInstitution = await getInstitutionById(institutionId);
    const institutionInformation = normalizeInstitutionInformation(
      payload.institutionInformation ?? {
        name: selectedInstitution?.name,
        code: selectedInstitution?.code,
        legalName: selectedInstitution?.legalName,
        contactEmail: selectedInstitution?.contactEmail,
        contactPhone: selectedInstitution?.contactPhone,
        address: selectedInstitution?.address,
        city: selectedInstitution?.city,
        state: selectedInstitution?.state,
        country: selectedInstitution?.country,
        notes: selectedInstitution?.notes,
      },
    );
    const formId = await getNextFormId();
    const pgflexEventId = buildWithdrawalPGFlexEventId(formId);
    const pgflexDispatcher = await getFirstPGFlexDispatcherAssignment();
    const document = {
      id: formId,
      formType: payload.formType,
      collectionKey: FORMS_COLLECTION,
      institutionId,
      doctorId,
      selectedPatientId: null,
      selectedInstitutionId: institutionId,
      selectedRequestingDoctorId: null,
      patientName: `Solicitud de retiro (${withdrawalCases.length})`,
      patientEmail: null,
      institutionName:
        normalizeOptionalString(institutionInformation.name) ??
        selectedInstitution?.name ??
        null,
      requestedTestName: "Solicitud de retiro",
      linkedStudyRequestFormId: null,
      linkedCaseIds,
      selectedCaseId: null,
      linkedCaseId: null,
      linkedSamplingIds: [],
      patientInformation: {},
      requestedTest: {},
      institutionInformation,
      withdrawalCases,
      createdAt: now,
      updatedAt: now,
      authorEmail,
      authorUid,
      createdByEmail: authorEmail,
      createdByUid: authorUid,
      updatedByEmail: authorEmail,
      updatedByUid: authorUid,
    };
    const pgflexEventDocument = buildWithdrawalPGFlexEventDocument({
      formId,
      institutionInformation,
      selectedInstitution,
      institutionId,
      linkedCaseIds,
      withdrawalCases,
      dispatcher: pgflexDispatcher,
      authorEmail,
      now,
    });

    const batch = adminDb.batch();
    batch.set(adminDb.collection(FORMS_COLLECTION).doc(formId), document);
    batch.set(
      adminDb.collection(PGFLEX_EVENTS_COLLECTION).doc(pgflexEventId),
      pgflexEventDocument,
    );
    linkedCaseIds.forEach((caseId) => {
      batch.set(
        adminDb.collection(CASES_COLLECTION).doc(caseId),
        {
          caseStatus: "awaiting_pick_up",
          withdrawalFormId: formId,
          withdrawalRequestedAt: now,
          last_updated_date: now,
          updatedAt: now,
          updatedByEmail: authorEmail,
        },
        { merge: true },
      );
    });
    linkedStudyRequestSnapshots.forEach((snapshot) => {
      batch.set(
        snapshot.ref,
        {
          linkedWithdrawalRequest: formId,
          updatedAt: now,
          updatedByEmail: authorEmail,
          updatedByUid: authorUid,
        },
        { merge: true },
      );
    });
    linkedBiopsySnapshots.forEach((snapshot) => {
      const link = caseFormLinks.find(
        (candidate) => candidate.biopsyFormId === snapshot.id,
      );
      batch.set(
        snapshot.ref,
        {
          ...(link?.studyRequestFormId
            ? {
                studyRequestForm: link.studyRequestFormId,
                linkedStudyRequestFormId: link.studyRequestFormId,
              }
            : {}),
          withdrawalRequest: formId,
          updatedAt: now,
          updatedByEmail: authorEmail,
          updatedByUid: authorUid,
        },
        { merge: true },
      );
    });
    batch.delete(adminDb.collection(FORM_DRAFTS_COLLECTION).doc(authorUid));
    await batch.commit();
    for (const caseRecord of withdrawalCases) {
      await cascadeTwoPQCaseStatusToSamplingChildren({
        caseId: String(caseRecord.id),
        previousCaseStatus: caseRecord.previousCaseStatus,
        nextCaseStatus: "awaiting_pick_up",
        actorEmail: authorEmail,
      });
    }
    await synchronizeTwoPQCasesFilesAndCodes(linkedCaseIds, authorEmail);
    await sendWithdrawalPGFlexAssignmentEmail(
      pgflexEventId,
      pgflexEventDocument,
      pgflexDispatcher,
    );

    return toTwoPQFormRecord(formId, document);
  }

  const patientInformation = normalizePatientInformation(
    payload.patientInformation ?? {},
  );
  const institutionId =
    isInstitutionManagerRole(context.role) ||
    context.role === "institution_doctor"
      ? (context.institutionId ?? patientInformation.institutionId)
      : patientInformation.institutionId;
  const doctorId =
    context.role === "institution_doctor"
      ? (context.doctorId ?? patientInformation.doctorId)
      : patientInformation.doctorId;

  if (
    !institutionId ||
    !doctorId ||
    !canCreatePatient(context, institutionId, doctorId)
  ) {
    throw new AdminRepositoryError(
      "You cannot create forms in this scope.",
      403,
    );
  }

  await validateDoctorInstitutionLink(institutionId, doctorId);

  const linkedStudyRequestFormId =
    payload.formType === "sample"
      ? normalizeRequiredString(
          payload.linkedStudyRequestFormId,
          "Linked study request form",
        )
      : normalizeOptionalString(payload.linkedStudyRequestFormId);
  let linkedStudyRequestForm: TwoPQFormRecord | null = null;
  let selectedPatientId = normalizeOptionalString(payload.selectedPatientId);
  const shouldGrantNewPatientPortalAccess =
    shouldAutomaticallyGrantPatientPortalAccess(
      payload.formType,
      selectedPatientId,
    );

  if (payload.formType === "sample") {
    const requiredLinkedStudyRequestFormId = normalizeRequiredString(
      linkedStudyRequestFormId,
      "Linked study request form",
    );
    linkedStudyRequestForm = await getTwoPQFormForContext(
      context,
      requiredLinkedStudyRequestFormId,
    );
    if (linkedStudyRequestForm.formType !== "study_request") {
      throw new AdminRepositoryError(
        "Linked form must be a study request form.",
        400,
      );
    }
    if (
      linkedStudyRequestForm.institutionId !== institutionId ||
      linkedStudyRequestForm.doctorId !== doctorId
    ) {
      throw new AdminRepositoryError(
        "Linked study request form must belong to the same institution and doctor.",
        400,
      );
    }

    const linkedPatientId =
      linkedStudyRequestForm.selectedPatientId ??
      normalizeOptionalString(
        linkedStudyRequestForm.patientInformation.patientId,
      );
    if (!linkedPatientId) {
      throw new AdminRepositoryError(
        "Linked study request form must be linked to a patient.",
        400,
      );
    }
    if (selectedPatientId && selectedPatientId !== linkedPatientId) {
      throw new AdminRepositoryError(
        "Sample patient must match the linked study request patient.",
        400,
      );
    }
    selectedPatientId = linkedPatientId;
  }

  let selectedPatient: PatientRecord | null = null;
  let automaticConsentEmail: {
    patient: PatientRecord;
    temporaryPassword: string;
  } | null = null;
  if (selectedPatientId) {
    selectedPatient = await getPatientById(selectedPatientId);
    if (!selectedPatient) {
      throw new AdminRepositoryError("Selected patient not found.", 404);
    }
    if (!canViewPatient(context, selectedPatient)) {
      throw new AdminRepositoryError("You cannot use this patient.", 403);
    }
    if (
      selectedPatient.institutionId !== institutionId ||
      selectedPatient.doctorId !== doctorId
    ) {
      throw new AdminRepositoryError(
        "Selected patient must belong to the selected institution and doctor.",
        400,
      );
    }
  }

  let selectedInstitution: InstitutionRecord | null = null;
  const selectedInstitutionId =
    normalizeOptionalString(payload.selectedInstitutionId) ?? institutionId;
  if (selectedInstitutionId) {
    selectedInstitution = await getInstitutionById(selectedInstitutionId);
    if (!selectedInstitution) {
      throw new AdminRepositoryError("Selected institution not found.", 404);
    }
    if (!canViewInstitution(context, selectedInstitution.id)) {
      throw new AdminRepositoryError("You cannot use this institution.", 403);
    }
    if (selectedInstitution.id !== institutionId) {
      throw new AdminRepositoryError(
        "Selected institution must match the form institution scope.",
        400,
      );
    }
  }

  if (!selectedPatientId) {
    const additionalInformation =
      buildPatientAdditionalInformation(patientInformation);

    selectedPatient = await createPatientForContext(context, {
      institutionId,
      doctorId,
      email: patientInformation.email,
      fullName: patientInformation.fullName,
      medicalRecordNumber:
        typeof patientInformation.medicalRecordNumber === "string"
          ? patientInformation.medicalRecordNumber
          : undefined,
      birthDate:
        typeof patientInformation.birthDate === "string"
          ? patientInformation.birthDate
          : undefined,
      sex:
        typeof patientInformation.sex === "string"
          ? patientInformation.sex
          : undefined,
      status: patientInformation.status === "inactive" ? "inactive" : "active",
      notes:
        typeof patientInformation.notes === "string"
          ? patientInformation.notes
          : undefined,
      ...(additionalInformation ? { additionalInformation } : {}),
    });
    selectedPatientId = selectedPatient.id;

    if (shouldGrantNewPatientPortalAccess) {
      const accessGrant = await grantPatientPortalAccessForNewPatient(
        context,
        selectedPatient.id,
      );
      automaticConsentEmail = {
        patient: selectedPatient,
        temporaryPassword: accessGrant.temporaryPassword,
      };
    }
  }

  let selectedRequestingDoctorId: string | undefined;
  let normalizedSampleInformation:
    ReturnType<typeof normalizeSampleInformation> | undefined;

  if (payload.formType === "sample") {
    selectedRequestingDoctorId =
      normalizeOptionalString(payload.selectedRequestingDoctorId) ?? doctorId;
    let requestingDoctor: DoctorRecord | null = null;

    requestingDoctor = await getDoctorById(selectedRequestingDoctorId);
    if (!requestingDoctor) {
      throw new AdminRepositoryError(
        "Selected requesting doctor not found.",
        404,
      );
    }
    if (!canViewDoctor(context, requestingDoctor)) {
      throw new AdminRepositoryError(
        "You cannot use this requesting doctor.",
        403,
      );
    }
    if (requestingDoctor.institutionId !== institutionId) {
      throw new AdminRepositoryError(
        "Selected requesting doctor must belong to the selected institution.",
        400,
      );
    }

    normalizedSampleInformation = normalizeSampleInformation(
      payload.sampleInformation,
      requestingDoctor,
    );
  }

  const requestedTest = normalizeRequestedTest(
    payload.requestedTest ?? {},
    payload.formType,
  );
  const formId = await getNextFormId();
  let claimedStudyRequestFormId: string | null = null;
  if (payload.formType === "sample") {
    if (!linkedStudyRequestForm) {
      throw new AdminRepositoryError(
        "Linked study request form is required.",
        400,
      );
    }
    await claimStudyRequestForBiopsyForm(
      context,
      linkedStudyRequestForm,
      formId,
    );
    claimedStudyRequestFormId = linkedStudyRequestForm.id;
  }

  try {
    let selectedCaseId = normalizeOptionalString(payload.selectedCaseId);
    let linkedCaseId: string | undefined;
    let linkedSamplingIds: string[] | undefined;
    let caseInformation: Record<string, unknown> | undefined;
    let samplingInformation: Record<string, unknown>[] | undefined;

    if (payload.formType === "sample") {
      if (!normalizedSampleInformation) {
        throw new AdminRepositoryError("Sample information is required.", 400);
      }
      const sampleBoxCode = normalizedSampleInformation.boxCode;
      let patientIdForLinkedRecords = selectedPatientId;
      let linkedCaseLabel: string;
      let normalizedSamplingInformation: ReturnType<
        typeof normalizeSamplingInformationList
      >;

      if (selectedCaseId) {
        const caseDetail = await getTwoPQDetailForContext(
          context,
          "cases",
          selectedCaseId,
        );
        const caseRecord = caseDetail.record;
        if (
          caseRecord.institutionId !== institutionId ||
          caseRecord.doctorId !== doctorId
        ) {
          throw new AdminRepositoryError(
            "Selected 2PQ case must belong to the selected institution and doctor.",
            400,
          );
        }
        if (
          patientIdForLinkedRecords &&
          caseRecord.patientId &&
          caseRecord.patientId !== patientIdForLinkedRecords
        ) {
          throw new AdminRepositoryError(
            "Selected 2PQ case must belong to the selected patient.",
            400,
          );
        }
        if (
          caseRecord.linkedStudyRequestFormId &&
          caseRecord.linkedStudyRequestFormId !== linkedStudyRequestForm?.id
        ) {
          throw new AdminRepositoryError(
            `Selected 2PQ case is already linked to study request form ${caseRecord.linkedStudyRequestFormId}.`,
            409,
          );
        }

        linkedCaseId = caseRecord.id;
        patientIdForLinkedRecords =
          patientIdForLinkedRecords ?? caseRecord.patientId;
        linkedCaseLabel = normalizeRequiredString(
          caseRecord.caseLabel,
          "Linked case label",
        );
        const linkedCaseBoxCode = normalizeOptionalString(
          caseRecord.three_letter_code,
        )?.toUpperCase();
        if (linkedCaseBoxCode !== sampleBoxCode) {
          throw new AdminRepositoryError(
            "Selected 2PQ case must match CODIGO CAJA.",
            400,
          );
        }
        caseInformation = caseRecordToFormInformation(caseRecord);
        normalizedSamplingInformation = normalizeSamplingInformationList(
          payload.samplingInformation,
          linkedCaseLabel,
        );
      } else {
        const normalizedCaseInformation = normalizeCaseInformation(
          payload.caseInformation,
        );
        linkedCaseLabel = normalizedCaseInformation.caseLabel;
        normalizedSamplingInformation = normalizeSamplingInformationList(
          payload.samplingInformation,
          linkedCaseLabel,
        );
        const createdCase = await createTwoPQRecordForContext(
          context,
          "cases",
          {
            ...normalizedCaseInformation,
            three_letter_code: sampleBoxCode,
            institutionId,
            doctorId,
            patientId: patientIdForLinkedRecords,
          },
          { studyRequestForm: linkedStudyRequestForm! },
        );
        selectedCaseId = createdCase.id;
        linkedCaseId = createdCase.id;
        caseInformation = caseRecordToFormInformation(createdCase);
      }

      const createdSamplingRecords = [];
      for (const samplingEntry of normalizedSamplingInformation) {
        const createdSampling = await createTwoPQRecordForContext(
          context,
          "sampling",
          {
            ...samplingEntry,
            institutionId,
            doctorId,
            patientId: patientIdForLinkedRecords,
            parent_case: linkedCaseId,
          },
        );
        createdSamplingRecords.push(createdSampling);
      }

      linkedSamplingIds = createdSamplingRecords.map((record) => record.id);
      samplingInformation = createdSamplingRecords.map((record) =>
        samplingRecordToFormInformation(record),
      );
    }

    const now = new Date().toISOString();
    const baseDocument = {
      id: formId,
      formType: payload.formType,
      collectionKey: FORMS_COLLECTION,
      institutionId,
      doctorId,
      selectedPatientId: selectedPatientId ?? null,
      selectedInstitutionId: selectedInstitutionId ?? null,
      selectedRequestingDoctorId: selectedRequestingDoctorId ?? null,
      patientName: patientInformation.fullName,
      patientEmail: patientInformation.email,
      institutionName: selectedInstitution?.name ?? null,
      requestedTestName: getRequestedTestName(requestedTest, payload.formType),
      linkedStudyRequestFormId: linkedStudyRequestFormId ?? null,
      selectedCaseId: selectedCaseId ?? null,
      linkedCaseId: linkedCaseId ?? null,
      linkedSamplingIds: linkedSamplingIds ?? [],
      patientInformation: {
        ...patientInformation,
        patientId: selectedPatientId,
        institutionId,
        doctorId,
      },
      requestedTest,
      createdAt: now,
      updatedAt: now,
      authorEmail,
      authorUid,
      createdByEmail: authorEmail,
      createdByUid: authorUid,
      updatedByEmail: authorEmail,
      updatedByUid: authorUid,
    };

    const document =
      payload.formType === "study_request"
        ? {
            ...baseDocument,
            linkedBiopsyForm: null,
            linkedWithdrawalRequest: null,
            "2pq_case": null,
            medicalInformation: normalizeMedicalInformation(
              payload.medicalInformation,
              payload.formType,
            ),
            previousGeneticTests: normalizePreviousGeneticTests(
              payload.previousGeneticTests,
              payload.formType,
            ),
            institutionInformation: normalizeInstitutionInformation(
              payload.institutionInformation ?? {
                name: selectedInstitution?.name,
                code: selectedInstitution?.code,
                legalName: selectedInstitution?.legalName,
                contactEmail: selectedInstitution?.contactEmail,
                contactPhone: selectedInstitution?.contactPhone,
                address: selectedInstitution?.address,
                city: selectedInstitution?.city,
                state: selectedInstitution?.state,
                country: selectedInstitution?.country,
                notes: selectedInstitution?.notes,
              },
            ),
          }
        : {
            ...baseDocument,
            studyRequestForm: linkedStudyRequestFormId ?? null,
            withdrawalRequest: null,
            sampleInformation: normalizedSampleInformation,
            caseInformation: caseInformation ?? null,
            samplingInformation: samplingInformation ?? [],
          };

    const batch = adminDb.batch();
    batch.set(adminDb.collection(FORMS_COLLECTION).doc(formId), document);
    if (
      payload.formType === "sample" &&
      linkedStudyRequestForm &&
      linkedCaseId
    ) {
      batch.set(
        adminDb.collection(FORMS_COLLECTION).doc(linkedStudyRequestForm.id),
        {
          "2pq_case": linkedCaseId,
          updatedAt: now,
          updatedByEmail: authorEmail,
          updatedByUid: authorUid,
        },
        { merge: true },
      );
    }
    batch.delete(adminDb.collection(FORM_DRAFTS_COLLECTION).doc(authorUid));
    await batch.commit();
    claimedStudyRequestFormId = null;

    if (automaticConsentEmail) {
      try {
        await sendInformedConsentEmail(
          automaticConsentEmail.patient,
          automaticConsentEmail.temporaryPassword,
        );
      } catch (error) {
        console.error(
          "Unable to send automatic informed consent email after study request submission.",
          error,
        );
      }
    }

    return toTwoPQFormRecord(formId, document);
  } catch (error) {
    if (claimedStudyRequestFormId) {
      try {
        await releaseStudyRequestBiopsyFormClaim(
          context,
          claimedStudyRequestFormId,
          formId,
        );
      } catch (releaseError) {
        const creationMessage =
          error instanceof Error ? error.message : "Unknown biopsy form error";
        const releaseMessage =
          releaseError instanceof Error
            ? releaseError.message
            : "Unknown linkage rollback error";
        throw new AdminRepositoryError(
          `Biopsy form creation failed and its study-request claim could not be released. Creation: ${creationMessage}. Rollback: ${releaseMessage}.`,
          500,
        );
      }
    }
    throw error;
  }
}
