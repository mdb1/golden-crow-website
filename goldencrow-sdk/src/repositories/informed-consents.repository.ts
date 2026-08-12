import {
  FieldPath,
  type DocumentData,
  type Query,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { canAccessInformedConsentPatient } from "../lib/informed-consent-access.js";
import type {
  AdminContext,
  InformedConsentFile,
  InformedConsentPatientOption,
  InformedConsentRecord,
  PatientRecord,
} from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { normalizeRoleEmail } from "./roles.repository.js";

const adminDb = adminDbFor("mydnamap");
const CONSENTS_COLLECTION = "2pq-informed-consent";
const PATIENTS_COLLECTION = "patients";
const SEQUENCES_COLLECTION = "admin_sequences";
const CONSENTS_PAGE_SIZE = 20;
export const INFORMED_CONSENT_FILE_MAX_BYTES = 750_000;

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
  file: InformedConsentFile;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toPatientRecord(id: string, data: Record<string, unknown>): PatientRecord {
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

async function getPatient(patientId: string) {
  const snapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(patientId)
    .get();
  return snapshot.exists
    ? toPatientRecord(
        snapshot.id,
        snapshot.data() as Record<string, unknown>,
      )
    : null;
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
  } else if (context.role === "institution_doctor") {
    if (!context.doctorId) {
      throw new AdminRepositoryError(
        "This doctor account is not linked to a doctor record.",
        403,
      );
    }
    query = query.where("doctorId", "==", context.doctorId);
  } else if (
    context.role !== "full_admin" &&
    context.role !== "organization_publisher"
  ) {
    if (!context.institutionId) {
      throw new AdminRepositoryError(
        "This account is not linked to an institution.",
        403,
      );
    }
    query = query.where("institutionId", "==", context.institutionId);
  }

  return query.orderBy(FieldPath.documentId(), "desc");
}

function patientQueryForContext(context: AdminContext): Query<DocumentData> {
  let query: Query<DocumentData> = adminDb.collection(PATIENTS_COLLECTION);

  if (context.role === "institution_doctor") {
    query = query.where("doctorId", "==", context.doctorId ?? "__none__");
  } else if (
    context.role !== "full_admin" &&
    context.role !== "organization_publisher"
  ) {
    query = query.where(
      "institutionId",
      "==",
      context.institutionId ?? "__none__",
    );
  }

  return query.orderBy(FieldPath.documentId(), "asc");
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
  let query = consentQueryForContext(context);
  if (cursor) {
    query = query.startAfter(cursor);
  }
  const snapshot = await query.limit(CONSENTS_PAGE_SIZE + 1).get();
  const pageDocs = snapshot.docs.slice(0, CONSENTS_PAGE_SIZE);
  const parsed = pageDocs.map((doc) => ({
    id: doc.id,
    consent: parseStoredConsent(doc.data() as Record<string, unknown>),
  }));
  const patients = await Promise.all(
    [...new Set(parsed.map(({ consent }) => consent.patientId))].map(getPatient),
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
  if (context.role === "patient") {
    const patient = context.patientId ? await getPatient(context.patientId) : null;
    return {
      patients: patient
        ? [{ id: patient.id, fullName: patient.fullName, email: patient.email }]
        : [],
    };
  }

  let query = patientQueryForContext(context);
  if (cursor) {
    query = query.startAfter(cursor);
  }
  const snapshot = await query.limit(CONSENTS_PAGE_SIZE + 1).get();
  const pageDocs = snapshot.docs.slice(0, CONSENTS_PAGE_SIZE);
  return {
    patients: pageDocs.map((doc) => {
      const patient = toPatientRecord(
        doc.id,
        doc.data() as Record<string, unknown>,
      );
      return {
        id: patient.id,
        fullName: patient.fullName,
        email: patient.email,
      };
    }),
    nextCursor:
      snapshot.docs.length > CONSENTS_PAGE_SIZE
        ? pageDocs.at(-1)?.id
        : undefined,
  };
}

export async function createInformedConsentForContext(
  context: AdminContext,
  payload: { patientId?: string; file: InformedConsentFile },
) {
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

  const file = validateFile(payload.file);
  const consentId = await nextConsentId();
  const now = new Date().toISOString();
  const document: StoredConsent = {
    collectionKey: "2pq-informed-consent",
    institutionId: patient.institutionId,
    doctorId: patient.doctorId,
    patientId: patient.id,
    file,
    createdAt: now,
    updatedAt: now,
    createdByEmail: context.email,
  };
  await adminDb.collection(CONSENTS_COLLECTION).doc(consentId).set(document);
  return toConsentRecord(consentId, document, patient.fullName);
}

export async function getInformedConsentFileForContext(
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
  const validatedFile = validateFile(consent.file);
  const encoded = validatedFile.content.split(",", 2)[1] ?? "";
  return {
    name: validatedFile.name,
    type: validatedFile.type,
    bytes: Buffer.from(encoded, "base64"),
  };
}
