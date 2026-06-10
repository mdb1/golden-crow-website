import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");
import { AdminRepositoryError } from "./admin-errors.js";
import {
  createDoctorForContext,
  createPatientForContext,
} from "./areas.repository.js";
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
const FORM_DRAFTS_COLLECTION = "2pq-form-drafts";
const INSTITUTIONS_COLLECTION = "institutions";
const DOCTORS_COLLECTION = "doctors";
const PATIENTS_COLLECTION = "patients";
const SEQUENCES_COLLECTION = "admin_sequences";

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
  addressLine1?: string;
  addressLine2?: string;
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
  notes?: string;
};

type TwoPQFormInput = {
  formType: TwoPQFormType;
  selectedPatientId?: string;
  selectedInstitutionId?: string;
  selectedCaseId?: string;
  selectedRequestingDoctorId?: string;
  patientInformation: PatientInformationInput;
  medicalInformation?: MedicalInformationInput;
  previousGeneticTests?: PreviousGeneticTestsInput;
  requestedTest: RequestedTestInput;
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
};

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeRequiredString(value: unknown, label: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new AdminRepositoryError(`${label} is required.`, 400);
  }
  return normalized;
}

function normalizeThreeLetterCode(value: unknown, label: string) {
  const normalized = normalizeRequiredString(value, label).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new AdminRepositoryError(`${label} must be exactly three letters (A-Z).`, 400);
  }
  return normalized;
}

function normalizeEmail(value: unknown, label: string) {
  const normalized = normalizeRoleEmail(normalizeRequiredString(value, label));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AdminRepositoryError(`${label} must be a valid email address.`, 400);
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
    throw new AdminRepositoryError("Contact email must be a valid email address.", 400);
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

function joinNameParts(firstName: unknown, lastName: unknown) {
  return [normalizeOptionalString(firstName), normalizeOptionalString(lastName)]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

function normalizeFullName(input: PatientInformationInput) {
  return normalizeRequiredString(
    normalizeOptionalString(input.fullName) ??
      joinNameParts(input.firstName, input.lastName),
    "Patient full name"
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
  const normalized = normalizeRequiredString(
    value,
    "Numero abortos previos"
  );
  const allowedValues = new Set(["0", "1", "2", "3_or_more", "recurrent"]);
  if (allowedValues.has(normalized)) {
    return normalized;
  }

  throw new AdminRepositoryError(
    "Numero abortos previos must be 0, 1, 2, 3_or_more, or recurrent.",
    400
  );
}

function normalizeStatus(value: unknown): "active" | "inactive" {
  return value === "inactive" ? "inactive" : "active";
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value ?? null])
  ) as T;
}

function toInstitutionRecord(id: string, data: Record<string, unknown>): InstitutionRecord {
  const now = new Date().toISOString();

  return {
    id,
    code: normalizeOptionalString(data.code) ?? id,
    name: normalizeOptionalString(data.name) ?? id,
    legalName: normalizeOptionalString(data.legalName),
    contactEmail: normalizeOptionalString(data.contactEmail),
    contactPhone: normalizeOptionalString(data.contactPhone),
    addressLine1: normalizeOptionalString(data.addressLine1),
    addressLine2: normalizeOptionalString(data.addressLine2),
    city: normalizeOptionalString(data.city),
    state: normalizeOptionalString(data.state),
    country: normalizeOptionalString(data.country),
    notes: normalizeOptionalString(data.notes),
    createdAt: normalizeOptionalString(data.createdAt) ?? now,
    updatedAt: normalizeOptionalString(data.updatedAt) ?? now,
  };
}

function toDoctorRecord(id: string, data: Record<string, unknown>): DoctorRecord {
  const now = new Date().toISOString();

  return {
    id,
    institutionId: normalizeOptionalString(data.institutionId) ?? "",
    authEmail: normalizeRoleEmail(normalizeOptionalString(data.authEmail) ?? ""),
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

function toPatientRecord(id: string, data: Record<string, unknown>): PatientRecord {
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

function toTwoPQFormRecord(id: string, data: Record<string, unknown>): TwoPQFormRecord {
  const formType = data.formType === "sample" ? "sample" : "study_request";
  const patientInformation = data.patientInformation;
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
    institutionId: normalizeOptionalString(data.institutionId) ?? "",
    doctorId: normalizeOptionalString(data.doctorId) ?? "",
    selectedPatientId: normalizeOptionalString(data.selectedPatientId),
    selectedInstitutionId: normalizeOptionalString(data.selectedInstitutionId),
    patientName: normalizeOptionalString(data.patientName),
    patientEmail: normalizeOptionalString(data.patientEmail),
    institutionName: normalizeOptionalString(data.institutionName),
    requestedTestName: normalizeOptionalString(data.requestedTestName),
    selectedCaseId: normalizeOptionalString(data.selectedCaseId),
    selectedRequestingDoctorId: normalizeOptionalString(data.selectedRequestingDoctorId),
    linkedCaseId: normalizeOptionalString(data.linkedCaseId),
    linkedSamplingIds: Array.isArray(data.linkedSamplingIds)
      ? data.linkedSamplingIds
          .map((entry) => normalizeOptionalString(entry))
          .filter((entry): entry is string => Boolean(entry))
      : undefined,
    patientInformation:
      patientInformation && typeof patientInformation === "object"
        ? patientInformation as TwoPQFormRecord["patientInformation"]
        : {},
    medicalInformation:
      data.medicalInformation && typeof data.medicalInformation === "object"
        ? data.medicalInformation as TwoPQFormRecord["medicalInformation"]
        : undefined,
    previousGeneticTests:
      data.previousGeneticTests && typeof data.previousGeneticTests === "object"
        ? data.previousGeneticTests as TwoPQFormRecord["previousGeneticTests"]
        : undefined,
    requestedTest:
      requestedTest && typeof requestedTest === "object"
        ? requestedTest as TwoPQFormRecord["requestedTest"]
        : {},
    institutionInformation:
      data.institutionInformation && typeof data.institutionInformation === "object"
        ? data.institutionInformation as TwoPQFormRecord["institutionInformation"]
        : undefined,
    sampleInformation:
      data.sampleInformation && typeof data.sampleInformation === "object"
        ? data.sampleInformation as TwoPQFormRecord["sampleInformation"]
        : undefined,
    caseInformation:
      data.caseInformation && typeof data.caseInformation === "object"
        ? data.caseInformation as TwoPQFormRecord["caseInformation"]
        : undefined,
    samplingInformation:
      Array.isArray(data.samplingInformation)
        ? data.samplingInformation.filter(
            (entry): entry is Record<string, unknown> =>
              Boolean(entry) && typeof entry === "object"
          ) as TwoPQFormRecord["samplingInformation"]
        : undefined,
    createdAt: normalizeOptionalString(data.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeOptionalString(data.updatedAt) ?? new Date().toISOString(),
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
  data: Record<string, unknown>
): TwoPQFormDraftRecord {
  const formType = data.formType === "study_request" ? "study_request" : "sample";
  const state = data.state;
  return {
    id,
    formType,
    collectionKey: FORM_DRAFTS_COLLECTION,
    currentStep:
      typeof data.currentStep === "string"
        ? data.currentStep as TwoPQFormDraftStepKey
        : "patientInformation",
    stepIndex: Number.isInteger(data.stepIndex) ? Number(data.stepIndex) : 0,
    state: state && typeof state === "object" && !Array.isArray(state)
      ? state as Record<string, unknown>
      : {},
    createdAt: normalizeOptionalString(data.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeOptionalString(data.updatedAt) ?? new Date().toISOString(),
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
    const reference = adminDb.collection(SEQUENCES_COLLECTION).doc(FORMS_COLLECTION);
    const snapshot = await transaction.get(reference);
    const current = Number(snapshot.data()?.current ?? 0);
    const next = current + 1;
    const now = new Date().toISOString();

    transaction.set(reference, { current: next, updatedAt: now }, { merge: true });

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

  return toInstitutionRecord(snapshot.id, snapshot.data() as Record<string, unknown>);
}

async function getDoctorById(doctorId: string) {
  const snapshot = await adminDb.collection(DOCTORS_COLLECTION).doc(doctorId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toDoctorRecord(snapshot.id, snapshot.data() as Record<string, unknown>);
}

async function getPatientById(patientId: string) {
  const snapshot = await adminDb.collection(PATIENTS_COLLECTION).doc(patientId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toPatientRecord(snapshot.id, snapshot.data() as Record<string, unknown>);
}

async function validateDoctorInstitutionLink(institutionId: string, doctorId: string) {
  const snapshot = await adminDb.collection(DOCTORS_COLLECTION).doc(doctorId).get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Doctor not found.", 404);
  }

  const doctorInstitutionId = normalizeOptionalString(snapshot.data()?.institutionId);
  if (doctorInstitutionId !== institutionId) {
    throw new AdminRepositoryError(
      "The selected doctor must belong to the selected institution.",
      400
    );
  }
}

function normalizePatientInformation(input: PatientInformationInput) {
  const institutionId = normalizeRequiredString(input.institutionId, "Patient institution");
  const doctorId = normalizeRequiredString(input.doctorId, "Patient doctor");
  const sex = normalizeOptionalString(input.sex);
  const partnerFullName = normalizeOptionalString(input.partnerFullName);
  const partnerMedicalRecordNumber = normalizeOptionalString(
    input.partnerMedicalRecordNumber
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
  patientInformation: ReturnType<typeof normalizePatientInformation>
) {
  const hasPartnerInformation = Boolean(
    patientInformation.partnerFullName ||
      patientInformation.partnerMedicalRecordNumber ||
      patientInformation.partnerBirthDate ||
      patientInformation.partnerNotes
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
    name: normalizeRequiredString(input.name, "Institution name"),
    contactEmail: normalizeOptionalEmail(input.contactEmail),
    contactPhone: normalizeOptionalString(input.contactPhone),
    notes: normalizeOptionalString(input.notes),
  });
}

function normalizeMedicalInformation(
  input: MedicalInformationInput = {},
  formType: TwoPQFormType = "study_request"
) {
  if (formType === "study_request") {
    return compactRecord({
      spermGameteSource: normalizeGameteSource(
        input.spermGameteSource,
        "Esperma"
      ),
      oocyteGameteSource: normalizeGameteSource(
        input.oocyteGameteSource,
        "Ovocitos"
      ),
      maleFactor: normalizeBooleanAnswer(input.maleFactor, "Factor masculino"),
      previousMiscarriagesCount: normalizePreviousMiscarriages(
        input.previousMiscarriagesCount
      ),
      otherBackground: normalizeRequiredString(
        input.otherBackground,
        "Otros antecedentes"
      ),
    });
  }

  return compactRecord({
    clinicalIndication: normalizeRequiredString(
      input.clinicalIndication,
      "Clinical indication"
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
  formType: TwoPQFormType = "study_request"
) {
  if (formType === "study_request") {
    return compactRecord({
      karyotypeResult: normalizeRequiredString(
        input.karyotypeResult,
        "RESULTADO CARIOTIPO"
      ),
      karyotypeFileName: normalizeOptionalString(input.karyotypeFileName),
      karyotypeFileType: normalizeOptionalString(input.karyotypeFileType),
      karyotypeFileSize:
        typeof input.karyotypeFileSize === "number"
          ? String(input.karyotypeFileSize)
          : normalizeOptionalString(input.karyotypeFileSize),
      karyotypeFileContent: normalizeOptionalString(input.karyotypeFileContent),
    });
  }

  return compactRecord({
    hasPreviousTests: normalizeRequiredString(
      input.hasPreviousTests,
      "Previous genetic tests answer"
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
  label: string
) {
  return selected ? normalizeBooleanAnswer(value, label) : undefined;
}

function normalizeRequestedTest(
  input: RequestedTestInput,
  formType: TwoPQFormType = "sample"
) {
  if (formType === "study_request") {
    const pgtAFast = normalizeBooleanAnswer(input.pgtAFast, "PGT-A FAST");
    const pgtAStandard = normalizeBooleanAnswer(
      input.pgtAStandard,
      "PGT-A STANDARD"
    );
    const pgtSr = normalizeBooleanAnswer(input.pgtSr, "PGT-SR");
    if (!pgtAFast && !pgtAStandard && !pgtSr) {
      throw new AdminRepositoryError("At least one requested test must be SI.", 400);
    }

    return compactRecord({
      pgtAFast,
      pgtAFastReportsMosaicism: normalizeConditionalBooleanAnswer(
        input.pgtAFastReportsMosaicism,
        pgtAFast,
        "PGT-A FAST informa mosaicismos"
      ),
      pgtAFastReportsSex: normalizeConditionalBooleanAnswer(
        input.pgtAFastReportsSex,
        pgtAFast,
        "PGT-A FAST informa sexo"
      ),
      pgtAStandard,
      pgtAStandardReportsMosaicism: normalizeConditionalBooleanAnswer(
        input.pgtAStandardReportsMosaicism,
        pgtAStandard,
        "PGT-A STANDARD informa mosaicismos"
      ),
      pgtAStandardReportsSex: normalizeConditionalBooleanAnswer(
        input.pgtAStandardReportsSex,
        pgtAStandard,
        "PGT-A STANDARD informa sexo"
      ),
      pgtSr,
      pgtSrReportsMosaicism: normalizeConditionalBooleanAnswer(
        input.pgtSrReportsMosaicism,
        pgtSr,
        "PGT-SR informa mosaicismos"
      ),
      pgtSrReportsSex: normalizeConditionalBooleanAnswer(
        input.pgtSrReportsSex,
        pgtSr,
        "PGT-SR informa sexo"
      ),
    });
  }

  const hasPgtAnswer =
    typeof input.pgtA !== "undefined" || typeof input.pgtSr !== "undefined";
  if (hasPgtAnswer) {
    const pgtA = normalizeBooleanAnswer(input.pgtA, "PGT-A");
    const pgtSr = normalizeBooleanAnswer(input.pgtSr, "PGT-SR");
    if (!pgtA && !pgtSr) {
      throw new AdminRepositoryError("At least one requested test must be SI.", 400);
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
  formType: TwoPQFormType
) {
  if (formType === "study_request") {
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

function normalizeRequestingDoctorCreateInput(
  input: SampleInformationInput = {},
  institutionId: string
) {
  return {
    institutionId,
    authEmail: normalizeEmail(input.requestingDoctorAuthEmail, "MEDICO SOLICITANTE auth email"),
    authUid: normalizeOptionalString(input.requestingDoctorAuthUid),
    fullName: normalizeRequiredString(
      input.requestingDoctorFullName,
      "MEDICO SOLICITANTE full name"
    ),
    specialty: normalizeOptionalString(input.requestingDoctorSpecialty),
    licenseNumber: normalizeOptionalString(input.requestingDoctorLicenseNumber),
    contactPhone: normalizeOptionalString(input.requestingDoctorContactPhone),
    status: input.requestingDoctorStatus === "inactive" ? "inactive" as const : "active" as const,
    notes: normalizeOptionalString(input.requestingDoctorNotes),
  };
}

function normalizeSampleInformation(
  input: SampleInformationInput = {},
  requestingDoctor: DoctorRecord
) {
  const sampleType = normalizeRequiredString(input.sampleType, "TIPO DE MUESTRA");
  const allowedSampleTypes = new Set([
    "biopsia de trofoectodermo",
    "rebiopsia de trofoectodermo",
    "medio de cultivo",
    "otro",
  ]);
  if (!allowedSampleTypes.has(sampleType)) {
    throw new AdminRepositoryError("TIPO DE MUESTRA is not valid.", 400);
  }

  return compactRecord({
    fivCenter: normalizeRequiredString(input.fivCenter, "CENTRO FIV"),
    centerCode: normalizeRequiredString(input.centerCode, "CODIGO CENTRO"),
    requestingDoctorId: requestingDoctor.id,
    requestingDoctorInstitutionId: requestingDoctor.institutionId,
    requestingDoctorFullName: requestingDoctor.fullName,
    requestingDoctorAuthEmail: requestingDoctor.authEmail,
    requestingDoctorAuthUid: requestingDoctor.authUid,
    requestingDoctorSpecialty: requestingDoctor.specialty,
    requestingDoctorLicenseNumber: requestingDoctor.licenseNumber,
    requestingDoctorContactPhone: requestingDoctor.contactPhone,
    requestingDoctorStatus: requestingDoctor.status,
    requestingDoctorNotes: requestingDoctor.notes,
    sampleType,
    processedByFirstName: normalizeRequiredString(
      input.processedByFirstName,
      "PROCESADO POR nombre"
    ),
    processedByLastName: normalizeRequiredString(
      input.processedByLastName,
      "PROCESADO POR apellido"
    ),
    processDate: normalizeRequiredIsoDateString(input.processDate, "FECHA PROCESO"),
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
  fallbackCaseLabel: string
) {
  return {
    caseLabel: fallbackCaseLabel,
    sampleId: normalizeRequiredString(input.sampleId, "2PQ sample ID"),
    sampleType: normalizeRequiredString(input.sampleType, "2PQ sample type"),
    processingStatus: normalizeRequiredString(
      input.processingStatus,
      "2PQ processing status"
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
  fallbackCaseLabel: string
) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new AdminRepositoryError("At least one 2PQ sampling record is required.", 400);
  }

  return input.map((entry) => normalizeSamplingInformation(entry, fallbackCaseLabel));
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
    collectionDate: normalizeOptionalString(record.collectionDate),
    receptionDate: normalizeOptionalString(record.receptionDate),
    runId: normalizeOptionalString(record.runId),
    qcStatus: normalizeOptionalString(record.qcStatus),
    notes: normalizeOptionalString(record.notes),
  });
}

function canViewTwoPQForm(
  context: AdminContext,
  form: Pick<TwoPQFormRecord, "institutionId">
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_admin" || context.role === "institution_doctor") {
    return context.institutionId === form.institutionId;
  }

  return false;
}

export async function listTwoPQFormsForContext(
  context: AdminContext,
  options: ListTwoPQFormsOptions = {}
): Promise<TwoPQFormRecord[]> {
  const snapshot =
    context.role === "full_admin"
      ? await adminDb.collection(FORMS_COLLECTION).get()
      : await adminDb
          .collection(FORMS_COLLECTION)
          .where("institutionId", "==", context.institutionId ?? "__none__")
          .get();

  return snapshot.docs
    .map((doc) => toTwoPQFormRecord(doc.id, doc.data() as Record<string, unknown>))
    .filter((form) => canViewTwoPQForm(context, form))
    .filter((form) => options.includeArchived || !form.archivedAt)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getTwoPQFormForContext(
  context: AdminContext,
  formId: string
): Promise<TwoPQFormRecord> {
  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const snapshot = await adminDb.collection(FORMS_COLLECTION).doc(normalizedFormId).get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Form not found.", 404);
  }

  const form = toTwoPQFormRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>
  );
  if (!canViewTwoPQForm(context, form)) {
    throw new AdminRepositoryError("You cannot view this form.", 403);
  }

  return form;
}

export async function getTwoPQFormDraftForContext(
  context: AdminContext
): Promise<TwoPQFormDraftRecord | null> {
  const authorUid = normalizeRequiredString(context.uid, "Form draft owner uid");
  const snapshot = await adminDb
    .collection(FORM_DRAFTS_COLLECTION)
    .doc(authorUid)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  return toTwoPQFormDraftRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>
  );
}

export async function upsertTwoPQFormDraftForContext(
  context: AdminContext,
  payload: TwoPQFormDraftInput
): Promise<TwoPQFormDraftRecord> {
  const authorEmail = normalizeEmail(context.email, "Form draft author email");
  const authorUid = normalizeRequiredString(context.uid, "Form draft author uid");
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
    state: payload.state && typeof payload.state === "object" ? payload.state : {},
    createdAt:
      normalizeOptionalString(snapshot.data()?.createdAt) ?? now,
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
  context: AdminContext
): Promise<{ deleted: true; draftId: string }> {
  const authorUid = normalizeRequiredString(context.uid, "Form draft owner uid");
  await adminDb.collection(FORM_DRAFTS_COLLECTION).doc(authorUid).delete();
  return { deleted: true, draftId: authorUid };
}

export async function archiveTwoPQFormForContext(
  context: AdminContext,
  formId: string
): Promise<TwoPQFormRecord> {
  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const reference = adminDb.collection(FORMS_COLLECTION).doc(normalizedFormId);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Form not found.", 404);
  }

  const form = toTwoPQFormRecord(
    snapshot.id,
    snapshot.data() as Record<string, unknown>
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
  formId: string
): Promise<{ deleted: true; formId: string }> {
  if (context.role !== "full_admin") {
    throw new AdminRepositoryError("Only full admins can delete forms.", 403);
  }

  const normalizedFormId = normalizeRequiredString(formId, "Form id");
  const reference = adminDb.collection(FORMS_COLLECTION).doc(normalizedFormId);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Form not found.", 404);
  }

  await reference.delete();
  return { deleted: true, formId: normalizedFormId };
}

export async function createTwoPQFormForContext(
  context: AdminContext,
  payload: TwoPQFormInput
): Promise<TwoPQFormRecord> {
  const authorEmail = normalizeEmail(context.email, "Form author email");
  const authorUid = normalizeRequiredString(context.uid, "Form author uid");
  const patientInformation = normalizePatientInformation(payload.patientInformation);
  const institutionId =
    context.role === "institution_admin" || context.role === "institution_doctor"
      ? context.institutionId ?? patientInformation.institutionId
      : patientInformation.institutionId;
  const doctorId =
    context.role === "institution_doctor"
      ? context.doctorId ?? patientInformation.doctorId
      : patientInformation.doctorId;

  if (!institutionId || !doctorId || !canCreatePatient(context, institutionId, doctorId)) {
    throw new AdminRepositoryError("You cannot create forms in this scope.", 403);
  }

  await validateDoctorInstitutionLink(institutionId, doctorId);

  let selectedPatient: PatientRecord | null = null;
  let selectedPatientId = normalizeOptionalString(payload.selectedPatientId);
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
        400
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
        400
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
  }

  let selectedRequestingDoctorId: string | undefined;
  let normalizedSampleInformation:
    | ReturnType<typeof normalizeSampleInformation>
    | undefined;

  if (payload.formType === "sample") {
    selectedRequestingDoctorId = normalizeOptionalString(payload.selectedRequestingDoctorId);
    let requestingDoctor: DoctorRecord | null = null;

    if (selectedRequestingDoctorId) {
      requestingDoctor = await getDoctorById(selectedRequestingDoctorId);
      if (!requestingDoctor) {
        throw new AdminRepositoryError("Selected requesting doctor not found.", 404);
      }
      if (!canViewDoctor(context, requestingDoctor)) {
        throw new AdminRepositoryError("You cannot use this requesting doctor.", 403);
      }
      if (requestingDoctor.institutionId !== institutionId) {
        throw new AdminRepositoryError(
          "Selected requesting doctor must belong to the selected institution.",
          400
        );
      }
    } else {
      requestingDoctor = await createDoctorForContext(
        context,
        normalizeRequestingDoctorCreateInput(payload.sampleInformation, institutionId)
      );
      selectedRequestingDoctorId = requestingDoctor.id;
    }

    normalizedSampleInformation = normalizeSampleInformation(
      payload.sampleInformation,
      requestingDoctor
    );
  }

  const requestedTest = normalizeRequestedTest(payload.requestedTest, payload.formType);
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
        selectedCaseId
      );
      const caseRecord = caseDetail.record;
      if (caseRecord.institutionId !== institutionId || caseRecord.doctorId !== doctorId) {
        throw new AdminRepositoryError(
          "Selected 2PQ case must belong to the selected institution and doctor.",
          400
        );
      }
      if (
        patientIdForLinkedRecords &&
        caseRecord.patientId &&
        caseRecord.patientId !== patientIdForLinkedRecords
      ) {
        throw new AdminRepositoryError(
          "Selected 2PQ case must belong to the selected patient.",
          400
        );
      }

      linkedCaseId = caseRecord.id;
      patientIdForLinkedRecords = patientIdForLinkedRecords ?? caseRecord.patientId;
      linkedCaseLabel = normalizeRequiredString(caseRecord.caseLabel, "Linked case label");
      const linkedCaseBoxCode = normalizeOptionalString(
        caseRecord.three_letter_code
      )?.toUpperCase();
      if (linkedCaseBoxCode !== sampleBoxCode) {
        throw new AdminRepositoryError(
          "Selected 2PQ case must match CODIGO CAJA.",
          400
        );
      }
      caseInformation = caseRecordToFormInformation(caseRecord);
      normalizedSamplingInformation = normalizeSamplingInformationList(
        payload.samplingInformation,
        linkedCaseLabel
      );
    } else {
      const normalizedCaseInformation = normalizeCaseInformation(
        payload.caseInformation
      );
      linkedCaseLabel = normalizedCaseInformation.caseLabel;
      normalizedSamplingInformation = normalizeSamplingInformationList(
        payload.samplingInformation,
        linkedCaseLabel
      );
      const createdCase = await createTwoPQRecordForContext(context, "cases", {
        ...normalizedCaseInformation,
        three_letter_code: sampleBoxCode,
        institutionId,
        doctorId,
        patientId: patientIdForLinkedRecords,
      });
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
        }
      );
      createdSamplingRecords.push(createdSampling);
    }

    linkedSamplingIds = createdSamplingRecords.map((record) => record.id);
    samplingInformation = createdSamplingRecords.map((record) =>
      samplingRecordToFormInformation(record)
    );
  }

  const now = new Date().toISOString();
  const formId = await getNextFormId();
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
          medicalInformation: normalizeMedicalInformation(
            payload.medicalInformation,
            payload.formType
          ),
          previousGeneticTests: normalizePreviousGeneticTests(
            payload.previousGeneticTests,
            payload.formType
          ),
          institutionInformation: normalizeInstitutionInformation(
            payload.institutionInformation ?? {
              name: selectedInstitution?.name,
              code: selectedInstitution?.code,
              legalName: selectedInstitution?.legalName,
              contactEmail: selectedInstitution?.contactEmail,
              contactPhone: selectedInstitution?.contactPhone,
              addressLine1: selectedInstitution?.addressLine1,
              addressLine2: selectedInstitution?.addressLine2,
              city: selectedInstitution?.city,
              state: selectedInstitution?.state,
              country: selectedInstitution?.country,
              notes: selectedInstitution?.notes,
            }
          ),
        }
      : {
          ...baseDocument,
          sampleInformation: normalizedSampleInformation,
          caseInformation: caseInformation ?? null,
          samplingInformation: samplingInformation ?? [],
        };

  await adminDb.collection(FORMS_COLLECTION).doc(formId).set(document);
  await adminDb.collection(FORM_DRAFTS_COLLECTION).doc(authorUid).delete();

  return toTwoPQFormRecord(formId, document);
}
