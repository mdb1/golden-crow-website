import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");
import { AdminRepositoryError } from "./admin-errors.js";
import {
  canCreatePatient,
  canViewInstitution,
  canViewPatient,
  normalizeRoleEmail,
} from "./roles.repository.js";
import type {
  AdminContext,
  InstitutionRecord,
  PatientRecord,
  TwoPQFormRecord,
  TwoPQFormType,
} from "../types/sdk.types.js";

const FORMS_COLLECTION = "2pq_forms";
const INSTITUTIONS_COLLECTION = "institutions";
const DOCTORS_COLLECTION = "doctors";
const PATIENTS_COLLECTION = "patients";
const SEQUENCES_COLLECTION = "admin_sequences";

type PatientInformationInput = {
  institutionId?: string;
  doctorId?: string;
  email?: string;
  fullName?: string;
  medicalRecordNumber?: string;
  birthDate?: string;
  sex?: string;
  status?: "active" | "inactive";
  notes?: string;
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
  clinicalIndication?: string;
  suspectedDiagnosis?: string;
  symptoms?: string;
  familyHistory?: string;
  requestingDoctor?: string;
  notes?: string;
};

type PreviousGeneticTestsInput = {
  hasPreviousTests?: string;
  testDescription?: string;
  labName?: string;
  testDate?: string;
  resultSummary?: string;
  reportAvailable?: string;
};

type RequestedTestInput = {
  testName?: string;
  testCode?: string;
  priority?: string;
  reason?: string;
  notes?: string;
};

type SampleInformationInput = {
  sampleType?: string;
  sampleId?: string;
  collectionDate?: string;
  collectionSite?: string;
  collectorName?: string;
  storageCondition?: string;
  notes?: string;
};

type TwoPQFormInput = {
  formType: TwoPQFormType;
  selectedPatientId?: string;
  selectedInstitutionId?: string;
  patientInformation: PatientInformationInput;
  medicalInformation?: MedicalInformationInput;
  previousGeneticTests?: PreviousGeneticTestsInput;
  requestedTest: RequestedTestInput;
  institutionInformation?: InstitutionInformationInput;
  sampleInformation?: SampleInformationInput;
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
    createdAt: normalizeOptionalString(data.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeOptionalString(data.updatedAt) ?? new Date().toISOString(),
    createdByEmail: normalizeOptionalString(data.createdByEmail),
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

  return compactRecord({
    institutionId,
    doctorId,
    email: normalizeEmail(input.email, "Patient email"),
    fullName: normalizeRequiredString(input.fullName, "Patient full name"),
    medicalRecordNumber: normalizeOptionalString(input.medicalRecordNumber),
    birthDate: normalizeIsoDateString(input.birthDate),
    sex: normalizeOptionalString(input.sex),
    status: normalizeStatus(input.status),
    notes: normalizeOptionalString(input.notes),
  });
}

function normalizeInstitutionInformation(input: InstitutionInformationInput) {
  return compactRecord({
    code: normalizeOptionalString(input.code),
    name: normalizeRequiredString(input.name, "Institution name"),
    legalName: normalizeOptionalString(input.legalName),
    contactEmail: normalizeOptionalEmail(input.contactEmail),
    contactPhone: normalizeOptionalString(input.contactPhone),
    addressLine1: normalizeOptionalString(input.addressLine1),
    addressLine2: normalizeOptionalString(input.addressLine2),
    city: normalizeOptionalString(input.city),
    state: normalizeOptionalString(input.state),
    country: normalizeOptionalString(input.country),
    notes: normalizeOptionalString(input.notes),
  });
}

function normalizeMedicalInformation(input: MedicalInformationInput = {}) {
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

function normalizePreviousGeneticTests(input: PreviousGeneticTestsInput = {}) {
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

function normalizeRequestedTest(input: RequestedTestInput) {
  return compactRecord({
    testName: normalizeRequiredString(input.testName, "Requested test"),
    testCode: normalizeOptionalString(input.testCode),
    priority: normalizeOptionalString(input.priority),
    reason: normalizeOptionalString(input.reason),
    notes: normalizeOptionalString(input.notes),
  });
}

function normalizeSampleInformation(input: SampleInformationInput = {}) {
  return compactRecord({
    sampleType: normalizeRequiredString(input.sampleType, "Sample type"),
    sampleId: normalizeOptionalString(input.sampleId),
    collectionDate: normalizeIsoDateString(input.collectionDate),
    collectionSite: normalizeOptionalString(input.collectionSite),
    collectorName: normalizeOptionalString(input.collectorName),
    storageCondition: normalizeOptionalString(input.storageCondition),
    notes: normalizeOptionalString(input.notes),
  });
}

function canViewTwoPQForm(
  context: AdminContext,
  form: Pick<TwoPQFormRecord, "institutionId">
) {
  if (context.role === "full_admin") {
    return true;
  }

  return context.institutionId === form.institutionId;
}

export async function listTwoPQFormsForContext(
  context: AdminContext
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
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createTwoPQFormForContext(
  context: AdminContext,
  payload: TwoPQFormInput
): Promise<TwoPQFormRecord> {
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
  const selectedPatientId = normalizeOptionalString(payload.selectedPatientId);
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
  }

  const requestedTest = normalizeRequestedTest(payload.requestedTest);
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
    patientName: patientInformation.fullName,
    patientEmail: patientInformation.email,
    institutionName: selectedInstitution?.name ?? null,
    requestedTestName: requestedTest.testName,
    patientInformation: {
      ...patientInformation,
      institutionId,
      doctorId,
    },
    requestedTest,
    createdAt: now,
    updatedAt: now,
    createdByEmail: context.email,
  };

  const document =
    payload.formType === "study_request"
      ? {
          ...baseDocument,
          medicalInformation: normalizeMedicalInformation(payload.medicalInformation),
          previousGeneticTests: normalizePreviousGeneticTests(
            payload.previousGeneticTests
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
          sampleInformation: normalizeSampleInformation(payload.sampleInformation),
        };

  await adminDb.collection(FORMS_COLLECTION).doc(formId).set(document);

  return toTwoPQFormRecord(formId, document);
}
