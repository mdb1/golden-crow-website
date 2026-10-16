import {
  FieldPath,
  type DocumentData,
  type Query,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { canAccessInformedConsentPatient } from "../lib/informed-consent-access.js";
import { isGlobalAdminRole } from "../lib/admin-roles.js";
import {
  normalizeTemporaryPassword,
  sendInformedConsentEmail,
} from "../lib/informed-consent-email.js";
import {
  readSavedSignatureDataUrl,
  validateSavedSignatureDataUrl,
} from "../lib/saved-signature.js";
import type {
  AdminContext,
  InformedConsentCaseOption,
  InformedConsentFile,
  InformedConsentPatientOption,
  InformedConsentRecord,
  InformedConsentSavedSignature,
  PatientRecord,
} from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { normalizeRoleEmail } from "./roles.repository.js";

const adminDb = adminDbFor("mydnamap");
const CONSENTS_COLLECTION = "2pq-informed-consent";
const PATIENTS_COLLECTION = "patients";
const CASES_COLLECTION = "2pq_case";
const SEQUENCES_COLLECTION = "admin_sequences";
const CONSENTS_PAGE_SIZE = 20;
export const INFORMED_CONSENT_FILE_MAX_BYTES = 750_000;
const CONSENT_EMAIL_SENDER_EMAIL = "dopazoh+admin@gmail.com";
const PUBLISHER_CONSENT_ERROR =
  "Discover publishers cannot access informed consents.";

const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/bmp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
]);

type StoredConsent = {
  collectionKey: "2pq-informed-consent";
  institutionId: string;
  doctorId: string;
  patientId: string;
  caseId: string | null;
  file: InformedConsentFile;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isMissingFirestoreIndexError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message =
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  return (
    code === 9 ||
    code === "failed-precondition" ||
    /requires an index|indexes\?create_composite/i.test(message)
  );
}

function toPatientRecord(
  id: string,
  data: Record<string, unknown>,
): PatientRecord {
  const now = new Date().toISOString();
  return {
    id,
    institutionId: optionalString(data.institutionId) ?? "",
    doctorId: optionalString(data.doctorId) ?? "",
    email: normalizeRoleEmail(optionalString(data.email) ?? ""),
    fullName: optionalString(data.fullName) ?? id,
    medicalRecordNumber: optionalString(data.medicalRecordNumber),
    birthDate: optionalString(data.birthDate),
    sex: optionalString(data.sex),
    status: data.status === "inactive" ? "inactive" : "active",
    notes: optionalString(data.notes),
    createdAt: optionalString(data.createdAt) ?? now,
    updatedAt: optionalString(data.updatedAt) ?? now,
  };
}

function revalidateGuidedSignaturePatient(
  context: AdminContext,
  expectedPatient: PatientRecord,
  snapshot: {
    exists: boolean;
    id: string;
    data: () => DocumentData | undefined;
  },
) {
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }

  const currentPatient = toPatientRecord(
    snapshot.id,
    (snapshot.data() ?? {}) as Record<string, unknown>,
  );
  if (!canAccessInformedConsentPatient(context, currentPatient)) {
    throw new AdminRepositoryError(
      "You cannot upload consent files for this patient.",
      403,
    );
  }
  if (
    currentPatient.id !== expectedPatient.id ||
    currentPatient.email !== expectedPatient.email ||
    currentPatient.institutionId !== expectedPatient.institutionId ||
    currentPatient.doctorId !== expectedPatient.doctorId ||
    currentPatient.status !== expectedPatient.status
  ) {
    throw new AdminRepositoryError(
      "The patient identity or assignment changed while the consent was being saved.",
      409,
    );
  }

  return currentPatient;
}

async function getPatient(patientId: string) {
  const snapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(patientId)
    .get();
  return snapshot.exists
    ? toPatientRecord(snapshot.id, snapshot.data() as Record<string, unknown>)
    : null;
}

function assertCanUseInformedConsents(context: AdminContext) {
  if (
    context.role === "organization_publisher" ||
    context.role === "individual_publisher"
  ) {
    throw new AdminRepositoryError(PUBLISHER_CONSENT_ERROR, 403);
  }
}

function isInstitutionManagerRole(role: AdminContext["role"]) {
  return (
    role === "institution_admin" ||
    role === "institution_operator" ||
    role === "institution_laboratory_staff"
  );
}

function assertCanManageConsentTraceability(context: AdminContext) {
  assertCanUseInformedConsents(context);
  if (!context.canAccessBackoffice || context.role === "patient") {
    throw new AdminRepositoryError(
      "Only backoffice users can manage consent traceability.",
      403,
    );
  }
}

function canWriteTraceabilityEntity(
  context: AdminContext,
  entity: { institutionId: string; doctorId: string },
) {
  if (isGlobalAdminRole(context.role)) return true;
  if (isInstitutionManagerRole(context.role)) {
    return context.institutionId === entity.institutionId;
  }
  return (
    context.role === "institution_doctor" &&
    context.institutionId === entity.institutionId &&
    context.doctorId === entity.doctorId
  );
}

function consentQueryForContext(context: AdminContext): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(CONSENTS_COLLECTION);

  if (context.role === "patient") {
    if (!context.patientId) {
      throw new AdminRepositoryError(
        "This patient account is not linked to a patient record.",
        403,
      );
    }
    query = query.where("patientId", "==", context.patientId);
  } else if (!isGlobalAdminRole(context.role)) {
    if (!context.institutionId) {
      throw new AdminRepositoryError(
        "This account is not linked to an institution.",
        403,
      );
    }
    query = query.where("institutionId", "==", context.institutionId);
  }

  if (context.role === "institution_doctor" && !context.doctorId) {
    throw new AdminRepositoryError(
      "This doctor account is not linked to a doctor record.",
      403,
    );
  }

  return query.orderBy(FieldPath.documentId(), "desc");
}

function consentFallbackQueryForContext(
  context: AdminContext,
): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(CONSENTS_COLLECTION);

  if (context.role === "patient") {
    query = query.where("patientId", "==", context.patientId);
  } else if (!isGlobalAdminRole(context.role)) {
    query = query.where("institutionId", "==", context.institutionId);
  }

  return query;
}

function patientQueryForContext(context: AdminContext): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(PATIENTS_COLLECTION);

  if (!isGlobalAdminRole(context.role)) {
    if (!context.institutionId) {
      throw new AdminRepositoryError(
        "This account is not linked to an institution.",
        403,
      );
    }
    query = query.where("institutionId", "==", context.institutionId);
  }

  if (context.role === "institution_doctor" && !context.doctorId) {
    throw new AdminRepositoryError(
      "This doctor account is not linked to a doctor record.",
      403,
    );
  }

  return query.orderBy(FieldPath.documentId(), "asc");
}

function patientFallbackQueryForContext(
  context: AdminContext,
): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(PATIENTS_COLLECTION);

  if (!isGlobalAdminRole(context.role)) {
    query = query.where("institutionId", "==", context.institutionId);
  }

  return query;
}

function caseQueryForPatient(patientId: string): Query<DocumentData> {
  return adminDb
    .collection(CASES_COLLECTION)
    .where("patientId", "==", patientId)
    .orderBy(FieldPath.documentId(), "asc");
}

function caseFallbackQueryForPatient(patientId: string): Query<DocumentData> {
  return adminDb
    .collection(CASES_COLLECTION)
    .where("patientId", "==", patientId);
}

async function getPageWithIndexFallback(
  collectionName: string,
  orderedQuery: Query<DocumentData>,
  fallbackQuery: Query<DocumentData>,
  cursor?: string,
) {
  let query = orderedQuery;
  if (cursor) {
    query = query.startAfter(cursor);
  }

  try {
    return await query.limit(CONSENTS_PAGE_SIZE + 1).get();
  } catch (error) {
    if (!isMissingFirestoreIndexError(error)) {
      throw error;
    }

    let fallback = fallbackQuery;
    if (cursor) {
      const cursorSnapshot = await adminDb
        .collection(collectionName)
        .doc(cursor)
        .get();
      if (cursorSnapshot.exists) {
        fallback = fallback.startAfter(cursorSnapshot);
      }
    }
    return fallback.limit(CONSENTS_PAGE_SIZE + 1).get();
  }
}

function parseStoredFile(value: unknown): InformedConsentFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminRepositoryError("Consent file data is invalid.", 500);
  }
  const data = value as Record<string, unknown>;
  const name = optionalString(data.name);
  const type = optionalString(data.type);
  const content = optionalString(data.content);
  const size = typeof data.size === "number" ? data.size : Number(data.size);
  if (!name || !type || !content || !Number.isSafeInteger(size) || size < 1) {
    throw new AdminRepositoryError("Consent file data is invalid.", 500);
  }
  return { name, type, size, content };
}

function parseStoredConsent(data: Record<string, unknown>): StoredConsent {
  const institutionId = optionalString(data.institutionId);
  const doctorId = optionalString(data.doctorId);
  const patientId = optionalString(data.patientId);
  const createdAt = optionalString(data.createdAt);
  const updatedAt = optionalString(data.updatedAt);
  const createdByEmail = optionalString(data.createdByEmail);
  if (
    !institutionId ||
    !doctorId ||
    !patientId ||
    !createdAt ||
    !updatedAt ||
    !createdByEmail
  ) {
    throw new AdminRepositoryError("Consent record data is invalid.", 500);
  }
  return {
    collectionKey: "2pq-informed-consent",
    institutionId,
    doctorId,
    patientId,
    caseId: optionalString(data.caseId) ?? null,
    file: parseStoredFile(data.file),
    createdAt,
    updatedAt,
    createdByEmail,
  };
}

function toConsentRecord(
  id: string,
  consent: StoredConsent,
  patientName: string,
): InformedConsentRecord {
  return {
    id,
    collectionKey: "2pq-informed-consent",
    institutionId: consent.institutionId,
    doctorId: consent.doctorId,
    patientId: consent.patientId,
    patientName,
    caseId: consent.caseId,
    file: {
      name: consent.file.name,
      type: consent.file.type,
      size: consent.file.size,
    },
    createdAt: consent.createdAt,
    updatedAt: consent.updatedAt,
    createdByEmail: consent.createdByEmail,
  };
}

function validateFile(file: InformedConsentFile): InformedConsentFile {
  const name = file.name.trim();
  const type = file.type.trim().toLowerCase();
  if (!name || name.length > 255) {
    throw new AdminRepositoryError("Use a valid file name.", 400);
  }
  if (!ALLOWED_FILE_TYPES.has(type)) {
    throw new AdminRepositoryError(
      "Consent files must be a PDF or supported image.",
      400,
    );
  }

  const match = file.content.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1]?.toLowerCase() !== type) {
    throw new AdminRepositoryError("Consent file content is invalid.", 400);
  }
  const bytes = Buffer.from(match[2] ?? "", "base64");
  if (
    bytes.length < 1 ||
    bytes.length > INFORMED_CONSENT_FILE_MAX_BYTES ||
    bytes.length !== file.size
  ) {
    throw new AdminRepositoryError(
      "Consent file size is invalid or exceeds 750 KB.",
      400,
    );
  }

  return { name, type, size: bytes.length, content: file.content };
}

async function nextConsentId() {
  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb
      .collection(SEQUENCES_COLLECTION)
      .doc(CONSENTS_COLLECTION);
    const snapshot = await transaction.get(reference);
    const next = Number(snapshot.data()?.current ?? 0) + 1;
    transaction.set(
      reference,
      { current: next, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return `CONS-${String(next).padStart(5, "0")}`;
  });
}

export async function listInformedConsentsForContext(
  context: AdminContext,
  cursor?: string,
) {
  assertCanUseInformedConsents(context);

  const snapshot = await getPageWithIndexFallback(
    CONSENTS_COLLECTION,
    consentQueryForContext(context),
    consentFallbackQueryForContext(context),
    cursor,
  );
  const pageDocs = snapshot.docs.slice(0, CONSENTS_PAGE_SIZE);
  const parsed = pageDocs
    .map((doc) => ({
      id: doc.id,
      consent: parseStoredConsent(doc.data() as Record<string, unknown>),
    }))
    .filter(({ consent }) =>
      canAccessInformedConsentPatient(context, {
        id: consent.patientId,
        institutionId: consent.institutionId,
        doctorId: consent.doctorId,
      }),
    );
  const patients = await Promise.all(
    [...new Set(parsed.map(({ consent }) => consent.patientId))].map(
      getPatient,
    ),
  );
  const patientNameById = new Map(
    patients
      .filter((patient): patient is PatientRecord => Boolean(patient))
      .map((patient) => [patient.id, patient.fullName]),
  );

  return {
    records: parsed.map(({ id, consent }) =>
      toConsentRecord(
        id,
        consent,
        patientNameById.get(consent.patientId) ?? consent.patientId,
      ),
    ),
    nextCursor:
      snapshot.docs.length > CONSENTS_PAGE_SIZE
        ? pageDocs.at(-1)?.id
        : undefined,
  };
}

export async function listInformedConsentPatientsForContext(
  context: AdminContext,
  cursor?: string,
): Promise<{
  patients: InformedConsentPatientOption[];
  nextCursor?: string;
}> {
  assertCanUseInformedConsents(context);

  if (context.role === "patient") {
    const patient = context.patientId
      ? await getPatient(context.patientId)
      : null;
    return {
      patients: patient
        ? [{ id: patient.id, fullName: patient.fullName, email: patient.email }]
        : [],
    };
  }

  const snapshot = await getPageWithIndexFallback(
    PATIENTS_COLLECTION,
    patientQueryForContext(context),
    patientFallbackQueryForContext(context),
    cursor,
  );
  const pageDocs = snapshot.docs.slice(0, CONSENTS_PAGE_SIZE);
  const patients = pageDocs
    .map((doc) =>
      toPatientRecord(doc.id, doc.data() as Record<string, unknown>),
    )
    .filter((patient) => canAccessInformedConsentPatient(context, patient));
  return {
    patients: patients.map((patient) => ({
      id: patient.id,
      fullName: patient.fullName,
      email: patient.email,
    })),
    nextCursor:
      snapshot.docs.length > CONSENTS_PAGE_SIZE
        ? pageDocs.at(-1)?.id
        : undefined,
  };
}

export async function getSavedInformedConsentSignatureForContext(
  context: AdminContext,
  requestedPatientId?: string,
): Promise<InformedConsentSavedSignature> {
  assertCanUseInformedConsents(context);

  const normalizedRequestedPatientId = requestedPatientId?.trim();
  if (
    context.role === "patient" &&
    normalizedRequestedPatientId &&
    normalizedRequestedPatientId !== context.patientId
  ) {
    throw new AdminRepositoryError(
      "Patients can only access their own saved signature.",
      403,
    );
  }

  const patientId =
    context.role === "patient"
      ? context.patientId
      : normalizedRequestedPatientId;
  if (!patientId) {
    throw new AdminRepositoryError(
      context.role === "patient"
        ? "This patient account is not linked to a patient record."
        : "Select a patient.",
      context.role === "patient" ? 403 : 400,
    );
  }

  const snapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(patientId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }

  const data = (snapshot.data() ?? {}) as Record<string, unknown>;
  const patient = toPatientRecord(snapshot.id, data);
  if (!canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError(
      "You cannot access this patient's saved signature.",
      403,
    );
  }

  return { savedSignature: readSavedSignatureDataUrl(data.saved_signature) };
}

export async function listInformedConsentCasesForContext(
  context: AdminContext,
  patientId: string,
  cursor?: string,
) {
  assertCanManageConsentTraceability(context);
  const normalizedPatientId = patientId.trim();
  const patient = normalizedPatientId
    ? await getPatient(normalizedPatientId)
    : null;
  if (!patient) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }
  if (!canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError(
      "You cannot view 2PQ cases for this patient.",
      403,
    );
  }

  const snapshot = await getPageWithIndexFallback(
    CASES_COLLECTION,
    caseQueryForPatient(patient.id),
    caseFallbackQueryForPatient(patient.id),
    cursor,
  );
  const pageDocs = snapshot.docs.slice(0, CONSENTS_PAGE_SIZE);
  const cases = pageDocs
    .map((doc) =>
      toCaseOption(
        doc.id,
        doc.data() as Record<string, unknown>,
        patient.fullName,
      ),
    )
    .filter(
      (record) =>
        record.patientId === patient.id &&
        canWriteTraceabilityEntity(context, record),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    cases,
    nextCursor:
      snapshot.docs.length > CONSENTS_PAGE_SIZE
        ? pageDocs.at(-1)?.id
        : undefined,
  };
}

export async function createInformedConsentForContext(
  context: AdminContext,
  payload: {
    patientId?: string;
    caseId?: string;
    flowMode?: "guided" | "direct";
    savedSignature?: string;
    file: InformedConsentFile;
  },
) {
  assertCanUseInformedConsents(context);

  if (payload.flowMode === "guided" && !payload.savedSignature) {
    throw new AdminRepositoryError(
      "Guided consent uploads require the patient's saved signature.",
      400,
    );
  }
  if (payload.flowMode !== "guided" && payload.savedSignature) {
    throw new AdminRepositoryError(
      "Only guided consent uploads may save a patient signature.",
      400,
    );
  }

  let savedSignature: string | undefined;
  if (payload.savedSignature) {
    try {
      savedSignature = validateSavedSignatureDataUrl(payload.savedSignature);
    } catch (error) {
      throw new AdminRepositoryError(
        error instanceof Error
          ? error.message
          : "The saved signature is invalid.",
        400,
      );
    }
  }

  const requestedPatientId = payload.patientId?.trim();
  const patientId =
    context.role === "patient" ? context.patientId : requestedPatientId;
  if (!patientId) {
    throw new AdminRepositoryError("Select a patient.", 400);
  }
  if (
    context.role === "patient" &&
    requestedPatientId &&
    requestedPatientId !== patientId
  ) {
    throw new AdminRepositoryError(
      "Patients can only upload their own consent files.",
      403,
    );
  }

  const patient = await getPatient(patientId);
  if (!patient) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }
  if (!canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError(
      "You cannot upload consent files for this patient.",
      403,
    );
  }

  const caseId = payload.caseId?.trim() || null;
  if (context.role === "patient" && caseId) {
    throw new AdminRepositoryError(
      "Patients cannot assign consent files to 2PQ cases.",
      403,
    );
  }

  const file = validateFile(payload.file);
  const consentId = await nextConsentId();
  const now = new Date().toISOString();
  const document: StoredConsent = {
    collectionKey: "2pq-informed-consent",
    institutionId: patient.institutionId,
    doctorId: patient.doctorId,
    patientId: patient.id,
    caseId,
    file,
    createdAt: now,
    updatedAt: now,
    createdByEmail: context.email,
  };

  const consentRef = adminDb.collection(CONSENTS_COLLECTION).doc(consentId);
  const patientRef = adminDb.collection(PATIENTS_COLLECTION).doc(patient.id);
  if (!caseId) {
    if (!savedSignature) {
      await consentRef.set(document);
      return toConsentRecord(consentId, document, patient.fullName);
    }

    await adminDb.runTransaction(async (transaction) => {
      const patientSnapshot = await transaction.get(patientRef);
      revalidateGuidedSignaturePatient(context, patient, patientSnapshot);
      transaction.set(consentRef, document);
      transaction.set(
        patientRef,
        { saved_signature: savedSignature, updatedAt: now },
        { merge: true },
      );
    });
    return toConsentRecord(consentId, document, patient.fullName);
  }

  assertCanManageConsentTraceability(context);
  const caseRef = adminDb.collection(CASES_COLLECTION).doc(caseId);
  await adminDb.runTransaction(async (transaction) => {
    const patientSnapshot = savedSignature
      ? await transaction.get(patientRef)
      : null;
    const caseSnapshot = await transaction.get(caseRef);
    if (patientSnapshot) {
      revalidateGuidedSignaturePatient(context, patient, patientSnapshot);
    }
    if (!caseSnapshot.exists) {
      throw new AdminRepositoryError("2PQ case not found.", 404);
    }
    const targetCase = toCaseOption(
      caseId,
      caseSnapshot.data() as Record<string, unknown>,
      patient.fullName,
    );
    if (!canWriteTraceabilityEntity(context, targetCase)) {
      throw new AdminRepositoryError("You cannot assign this 2PQ case.", 403);
    }
    if (
      targetCase.patientId !== patient.id ||
      targetCase.institutionId !== patient.institutionId ||
      targetCase.doctorId !== patient.doctorId
    ) {
      throw new AdminRepositoryError(
        "Consent and 2PQ case must belong to the same patient, institution, and doctor.",
        409,
      );
    }

    const displacedConsentRef = targetCase.informedConsentId
      ? adminDb
          .collection(CONSENTS_COLLECTION)
          .doc(targetCase.informedConsentId)
      : null;
    const displacedConsentSnapshot = displacedConsentRef
      ? await transaction.get(displacedConsentRef)
      : null;

    if (displacedConsentRef && displacedConsentSnapshot?.exists) {
      const displacedConsent = parseStoredConsent(
        displacedConsentSnapshot.data() as Record<string, unknown>,
      );
      if (displacedConsent.caseId === caseId) {
        transaction.set(
          displacedConsentRef,
          { caseId: null, updatedAt: now },
          { merge: true },
        );
      }
    }

    transaction.set(consentRef, document);
    if (savedSignature) {
      transaction.set(
        patientRef,
        { saved_signature: savedSignature, updatedAt: now },
        { merge: true },
      );
    }
    transaction.set(
      caseRef,
      {
        informedConsentId: consentId,
        updatedAt: now,
        last_updated_date: now,
        updatedByEmail: context.email,
      },
      { merge: true },
    );
  });
  return toConsentRecord(consentId, document, patient.fullName);
}

function toCaseOption(
  id: string,
  data: Record<string, unknown>,
  patientName: string,
): InformedConsentCaseOption {
  const now = new Date().toISOString();
  return {
    id,
    institutionId: optionalString(data.institutionId) ?? "",
    doctorId: optionalString(data.doctorId) ?? "",
    patientId: optionalString(data.patientId) ?? "",
    patientName,
    caseLabel: optionalString(data.caseLabel) ?? id,
    caseStatus: optionalString(data.caseStatus),
    threeLetterCode: optionalString(data.three_letter_code),
    informedConsentId: optionalString(data.informedConsentId) ?? null,
    createdAt: optionalString(data.createdAt) ?? now,
    updatedAt: optionalString(data.updatedAt) ?? now,
  };
}

async function getConsentRecordForContext(
  context: AdminContext,
  consentId: string,
) {
  const snapshot = await adminDb
    .collection(CONSENTS_COLLECTION)
    .doc(consentId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Consent not found.", 404);
  }
  const consent = parseStoredConsent(
    snapshot.data() as Record<string, unknown>,
  );
  const patient = await getPatient(consent.patientId);
  if (!patient || !canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError("You cannot view this consent.", 403);
  }
  return {
    stored: consent,
    record: toConsentRecord(consentId, consent, patient.fullName),
    patient,
  };
}

async function getCaseOptionForContext(
  context: AdminContext,
  caseId: string,
  patientName: string,
) {
  const snapshot = await adminDb.collection(CASES_COLLECTION).doc(caseId).get();
  if (!snapshot.exists) return null;
  const option = toCaseOption(
    snapshot.id,
    snapshot.data() as Record<string, unknown>,
    patientName,
  );
  return canAccessInformedConsentPatient(context, {
    id: option.patientId,
    institutionId: option.institutionId,
    doctorId: option.doctorId,
  })
    ? option
    : null;
}

async function listCaseOptionsForPatient(
  context: AdminContext,
  patient: PatientRecord,
) {
  const snapshot = await adminDb
    .collection(CASES_COLLECTION)
    .where("patientId", "==", patient.id)
    .limit(CONSENTS_PAGE_SIZE)
    .get();
  return snapshot.docs
    .map((doc) =>
      toCaseOption(
        doc.id,
        doc.data() as Record<string, unknown>,
        patient.fullName,
      ),
    )
    .filter(
      (record) =>
        record.patientId === patient.id &&
        canAccessInformedConsentPatient(context, {
          id: record.patientId,
          institutionId: record.institutionId,
          doctorId: record.doctorId,
        }),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getInformedConsentDetailForContext(
  context: AdminContext,
  consentId: string,
) {
  assertCanManageConsentTraceability(context);
  const { record, patient } = await getConsentRecordForContext(
    context,
    consentId,
  );
  const caseOptions = await listCaseOptionsForPatient(context, patient);
  let linkedCase = record.caseId
    ? (caseOptions.find((candidate) => candidate.id === record.caseId) ?? null)
    : null;
  if (!linkedCase && record.caseId) {
    linkedCase = await getCaseOptionForContext(
      context,
      record.caseId,
      patient.fullName,
    );
  }
  return { record, linkedCase, caseOptions };
}

export async function getCaseConsentTraceabilityForContext(
  context: AdminContext,
  caseId: string,
) {
  assertCanManageConsentTraceability(context);
  const caseSnapshot = await adminDb
    .collection(CASES_COLLECTION)
    .doc(caseId)
    .get();
  if (!caseSnapshot.exists) {
    throw new AdminRepositoryError("2PQ case not found.", 404);
  }
  const caseData = caseSnapshot.data() as Record<string, unknown>;
  const patientId = optionalString(caseData.patientId);
  if (!patientId) {
    throw new AdminRepositoryError("The 2PQ case has no patient.", 409);
  }
  const patient = await getPatient(patientId);
  if (!patient || !canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError("You cannot view this 2PQ case.", 403);
  }
  const caseOption = toCaseOption(caseId, caseData, patient.fullName);

  const consentSnapshot = await adminDb
    .collection(CONSENTS_COLLECTION)
    .where("patientId", "==", patient.id)
    .limit(CONSENTS_PAGE_SIZE)
    .get();
  const consentOptions = consentSnapshot.docs
    .map((doc) => ({
      id: doc.id,
      stored: parseStoredConsent(doc.data() as Record<string, unknown>),
    }))
    .filter(({ stored }) => stored.patientId === patient.id)
    .map(({ id, stored }) => toConsentRecord(id, stored, patient.fullName))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  let linkedConsent = caseOption.informedConsentId
    ? (consentOptions.find(
        (candidate) => candidate.id === caseOption.informedConsentId,
      ) ?? null)
    : null;
  if (!linkedConsent && caseOption.informedConsentId) {
    try {
      linkedConsent = (
        await getConsentRecordForContext(context, caseOption.informedConsentId)
      ).record;
    } catch (error) {
      if (
        !(error instanceof AdminRepositoryError) ||
        error.statusCode !== 404
      ) {
        throw error;
      }
    }
  }
  return { case: caseOption, linkedConsent, consentOptions };
}

export async function setInformedConsentCaseForContext(
  context: AdminContext,
  consentId: string,
  caseId: string | null,
) {
  assertCanManageConsentTraceability(context);
  const normalizedCaseId = caseId?.trim() || null;
  const consentRef = adminDb.collection(CONSENTS_COLLECTION).doc(consentId);
  const targetCaseRef = normalizedCaseId
    ? adminDb.collection(CASES_COLLECTION).doc(normalizedCaseId)
    : null;
  const now = new Date().toISOString();

  await adminDb.runTransaction(async (transaction) => {
    const consentSnapshot = await transaction.get(consentRef);
    if (!consentSnapshot.exists) {
      throw new AdminRepositoryError("Consent not found.", 404);
    }
    const consent = parseStoredConsent(
      consentSnapshot.data() as Record<string, unknown>,
    );
    if (!canWriteTraceabilityEntity(context, consent)) {
      throw new AdminRepositoryError(
        "You cannot change this consent link.",
        403,
      );
    }

    const targetCaseSnapshot = targetCaseRef
      ? await transaction.get(targetCaseRef)
      : null;
    if (targetCaseRef && !targetCaseSnapshot?.exists) {
      throw new AdminRepositoryError("2PQ case not found.", 404);
    }
    const targetCaseData = targetCaseSnapshot?.exists
      ? (targetCaseSnapshot.data() as Record<string, unknown>)
      : null;
    const targetCase = targetCaseData
      ? toCaseOption(normalizedCaseId!, targetCaseData, consent.patientId)
      : null;
    if (targetCase) {
      if (!canWriteTraceabilityEntity(context, targetCase)) {
        throw new AdminRepositoryError(
          "You cannot change this 2PQ case link.",
          403,
        );
      }
      if (
        targetCase.patientId !== consent.patientId ||
        targetCase.institutionId !== consent.institutionId ||
        targetCase.doctorId !== consent.doctorId
      ) {
        throw new AdminRepositoryError(
          "Consent and 2PQ case must belong to the same patient, institution, and doctor.",
          409,
        );
      }
    }

    const previousCaseRef =
      consent.caseId && consent.caseId !== normalizedCaseId
        ? adminDb.collection(CASES_COLLECTION).doc(consent.caseId)
        : null;
    const displacedConsentId =
      targetCase?.informedConsentId &&
      targetCase.informedConsentId !== consentId
        ? targetCase.informedConsentId
        : null;
    const displacedConsentRef = displacedConsentId
      ? adminDb.collection(CONSENTS_COLLECTION).doc(displacedConsentId)
      : null;
    const previousCaseSnapshot = previousCaseRef
      ? await transaction.get(previousCaseRef)
      : null;
    const displacedConsentSnapshot = displacedConsentRef
      ? await transaction.get(displacedConsentRef)
      : null;

    if (previousCaseRef && previousCaseSnapshot?.exists) {
      const previousCaseData = previousCaseSnapshot.data() as Record<
        string,
        unknown
      >;
      if (optionalString(previousCaseData.informedConsentId) === consentId) {
        transaction.set(
          previousCaseRef,
          {
            informedConsentId: null,
            updatedAt: now,
            last_updated_date: now,
            updatedByEmail: context.email,
          },
          { merge: true },
        );
      }
    }

    if (displacedConsentRef && displacedConsentSnapshot?.exists) {
      const displacedConsent = parseStoredConsent(
        displacedConsentSnapshot.data() as Record<string, unknown>,
      );
      if (displacedConsent.caseId === normalizedCaseId) {
        transaction.set(
          displacedConsentRef,
          { caseId: null, updatedAt: now },
          { merge: true },
        );
      }
    }

    transaction.set(
      consentRef,
      { caseId: normalizedCaseId, updatedAt: now },
      { merge: true },
    );
    if (targetCaseRef) {
      transaction.set(
        targetCaseRef,
        {
          informedConsentId: consentId,
          updatedAt: now,
          last_updated_date: now,
          updatedByEmail: context.email,
        },
        { merge: true },
      );
    }
  });

  return getInformedConsentDetailForContext(context, consentId);
}

export async function sendInformedConsentEmailForContext(
  context: AdminContext,
  payload: { patientId: string },
) {
  assertCanUseInformedConsents(context);

  if (normalizeRoleEmail(context.email) !== CONSENT_EMAIL_SENDER_EMAIL) {
    throw new AdminRepositoryError(
      "This account cannot send consent email requests yet.",
      403,
    );
  }
  if (context.role === "patient") {
    throw new AdminRepositoryError(
      "Patients cannot send consent email requests.",
      403,
    );
  }

  const patientId = payload.patientId.trim();
  if (!patientId) {
    throw new AdminRepositoryError("Select a patient.", 400);
  }

  const patient = await getPatient(patientId);
  if (!patient) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }
  if (!canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError(
      "You cannot send consent requests for this patient.",
      403,
    );
  }
  if (!patient.email) {
    throw new AdminRepositoryError("Patient does not have an email.", 400);
  }
  const patientSnapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(patient.id)
    .get();
  const temporaryPassword = normalizeTemporaryPassword(
    patientSnapshot.data()?.temporary_password,
  );
  if (!temporaryPassword) {
    throw new AdminRepositoryError(
      "This patient does not have a temporary password yet.",
      404,
    );
  }

  try {
    await sendInformedConsentEmail(patient, temporaryPassword);
  } catch (error) {
    const details =
      error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new AdminRepositoryError(
      `Unable to send consent email.${details}`,
      502,
    );
  }

  return { ok: true, patientId: patient.id, email: patient.email };
}

export async function getInformedConsentFileForContext(
  context: AdminContext,
  consentId: string,
) {
  assertCanUseInformedConsents(context);

  const snapshot = await adminDb
    .collection(CONSENTS_COLLECTION)
    .doc(consentId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Consent not found.", 404);
  }
  const consent = parseStoredConsent(
    snapshot.data() as Record<string, unknown>,
  );
  const patient = await getPatient(consent.patientId);
  if (!patient || !canAccessInformedConsentPatient(context, patient)) {
    throw new AdminRepositoryError("You cannot view this consent.", 403);
  }
  const validatedFile = validateFile(consent.file);
  const encoded = validatedFile.content.split(",", 2)[1] ?? "";
  return {
    name: validatedFile.name,
    type: validatedFile.type,
    bytes: Buffer.from(encoded, "base64"),
  };
}

export async function deleteInformedConsentForContext(
  context: AdminContext,
  consentId: string,
) {
  assertCanUseInformedConsents(context);
  if (!isGlobalAdminRole(context.role)) {
    throw new AdminRepositoryError(
      "Only full or 2PQ admins can delete informed consents.",
      403,
    );
  }

  const reference = adminDb.collection(CONSENTS_COLLECTION).doc(consentId);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new AdminRepositoryError("Consent not found.", 404);
    }
    const consent = parseStoredConsent(
      snapshot.data() as Record<string, unknown>,
    );
    const caseReference = consent.caseId
      ? adminDb.collection(CASES_COLLECTION).doc(consent.caseId)
      : null;
    const caseSnapshot = caseReference
      ? await transaction.get(caseReference)
      : null;
    if (
      caseReference &&
      caseSnapshot?.exists &&
      optionalString(caseSnapshot.data()?.informedConsentId) === consentId
    ) {
      const now = new Date().toISOString();
      transaction.set(
        caseReference,
        {
          informedConsentId: null,
          updatedAt: now,
          last_updated_date: now,
          updatedByEmail: context.email,
        },
        { merge: true },
      );
    }
    transaction.delete(reference);
  });
  return { success: true as const, consentId };
}
