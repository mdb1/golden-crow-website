import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { AdminRepositoryError } from "./admin-errors.js";

const adminDb = adminDbFor("mydnamap");

const PATIENTS_COLLECTION = "patients";
const REPORT_CODES_COLLECTION = "report_codes";
const UPLOADED_REPORTS_COLLECTION = "uploaded_reports";

export interface ReportingPatientLookup {
  patientId?: string;
  email?: string;
  medicalRecordNumber?: string;
}

export interface ReportingPatientRecord {
  id: string;
  institutionId: string;
  doctorId: string;
  fullName: string;
  email: string;
  medicalRecordNumber?: string;
  birthDate?: string;
  sex?: string;
  status: "active" | "inactive";
  notes?: string;
  additionalInformation?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReportUploadNotificationInput {
  patientId: string;
  reportId?: string;
  reportCode?: string;
  bucket: string;
  key: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  uploadedAt?: string;
  providerName?: string;
  providerFormat?: string;
  reportType?: string;
  sampleId?: string;
  downloadUrl?: string;
}

export interface ReportUploadNotificationResult {
  ok: true;
  reportId: string;
  reportCode: string;
  patientId: string;
  status: "available";
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeEmail(value: unknown): string | undefined {
  return normalizeString(value)?.toLowerCase();
}

function normalizeStatus(value: unknown): "active" | "inactive" {
  return value === "inactive" ? "inactive" : "active";
}

function normalizeOptionalRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined,
    ),
  );
}

function normalizeIsoDateValue(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    const candidate = new Date(value);
    return Number.isNaN(candidate.getTime()) ? value : candidate.toISOString();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const candidate = value.toDate();
    return candidate instanceof Date && !Number.isNaN(candidate.getTime())
      ? candidate.toISOString()
      : undefined;
  }

  return undefined;
}

function normalizeFirestoreDocumentId(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new AdminRepositoryError(`${label} is required.`, 400);
  }

  if (normalized.includes("/")) {
    throw new AdminRepositoryError(`${label} cannot contain '/'.`, 400);
  }

  return normalized;
}

function normalizeReportCode(input: ReportUploadNotificationInput, fallback: string) {
  const raw = normalizeString(input.reportCode) ?? fallback;
  return normalizeFirestoreDocumentId(raw, "Report code");
}

function normalizeUploadedAt(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AdminRepositoryError("uploadedAt must be a valid ISO date.", 400);
  }

  return parsed.toISOString();
}

function stripUndefinedFields<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function normalizePatient(
  id: string,
  data: Record<string, unknown>,
): ReportingPatientRecord {
  return {
    id,
    institutionId: normalizeString(data.institutionId) ?? "",
    doctorId: normalizeString(data.doctorId) ?? "",
    fullName: normalizeString(data.fullName) ?? id,
    email: normalizeEmail(data.email) ?? "",
    medicalRecordNumber: normalizeString(data.medicalRecordNumber),
    birthDate: normalizeString(data.birthDate),
    sex: normalizeString(data.sex),
    status: normalizeStatus(data.status),
    notes: normalizeString(data.notes),
    additionalInformation: normalizeOptionalRecord(data.additionalInformation),
    createdAt: normalizeIsoDateValue(data.createdAt),
    updatedAt: normalizeIsoDateValue(data.updatedAt),
  };
}

async function getPatientById(patientId: string) {
  const snapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(normalizeFirestoreDocumentId(patientId, "Patient id"))
    .get();

  if (!snapshot.exists) {
    return null;
  }

  return normalizePatient(snapshot.id, snapshot.data() as Record<string, unknown>);
}

async function getPatientByUniqueField(field: "email" | "medicalRecordNumber", value: string) {
  const snapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .where(field, "==", value)
    .limit(2)
    .get();

  if (snapshot.empty) {
    return null;
  }

  if (snapshot.docs.length > 1) {
    throw new AdminRepositoryError(`Multiple patients found for ${field}.`, 409);
  }

  const document = snapshot.docs[0]!;
  return normalizePatient(document.id, document.data() as Record<string, unknown>);
}

export async function getReportingPatient(
  lookup: ReportingPatientLookup,
): Promise<ReportingPatientRecord> {
  const patientId = normalizeString(lookup.patientId);
  const email = normalizeEmail(lookup.email);
  const medicalRecordNumber = normalizeString(lookup.medicalRecordNumber);

  if (!patientId && !email && !medicalRecordNumber) {
    throw new AdminRepositoryError(
      "Provide patientId, email, or medicalRecordNumber.",
      400,
    );
  }

  const patient =
    (patientId ? await getPatientById(patientId) : null) ??
    (email ? await getPatientByUniqueField("email", email) : null) ??
    (medicalRecordNumber
      ? await getPatientByUniqueField("medicalRecordNumber", medicalRecordNumber)
      : null);

  if (!patient) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }

  return patient;
}

function uploadedReportPayload(
  input: ReportUploadNotificationInput,
  patient: ReportingPatientRecord,
  reportId: string,
  reportCode: string,
  dateCreated: unknown,
) {
  const uploadedAt = normalizeUploadedAt(input.uploadedAt);

  return stripUndefinedFields({
    file_name: normalizeString(input.fileName) ?? `${reportCode}.pdf`,
    download_url: normalizeString(input.downloadUrl) ?? "",
    upload_version_count: FieldValue.increment(1),
    provider_format: normalizeString(input.providerFormat) ?? "pdf",
    provider_name: normalizeString(input.providerName) ?? "aws-s3",
    tracking_progress_status: "document_ready",
    report_code: reportCode,
    report_owner_id: patient.id,
    owner_name: patient.fullName,
    owner_email: patient.email,
    owner_community_user_id: patient.id,
    owner_public_profile_id: patient.id,
    patient_id: patient.id,
    institution_id: patient.institutionId,
    doctor_id: patient.doctorId,
    report_type: normalizeString(input.reportType),
    sample_id: normalizeString(input.sampleId),
    s3_bucket: input.bucket,
    s3_key: input.key,
    s3_content_type: normalizeString(input.contentType) ?? "application/pdf",
    s3_size: input.size,
    s3_uploaded_at: uploadedAt,
    external_report_id: reportId,
    integration_source: "aws_s3",
    date_created: dateCreated ?? FieldValue.serverTimestamp(),
    date_modified: FieldValue.serverTimestamp(),
  });
}

function reportCodePayload(patient: ReportingPatientRecord, reportId: string) {
  return {
    owner_id: patient.id,
    uploaded_report_id: reportId,
    source: "aws_s3",
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function recordUploadedReportNotification(
  input: ReportUploadNotificationInput,
): Promise<ReportUploadNotificationResult> {
  const patientId = normalizeFirestoreDocumentId(input.patientId, "Patient id");
  const bucket = normalizeString(input.bucket);
  const key = normalizeString(input.key);

  if (!bucket) {
    throw new AdminRepositoryError("bucket is required.", 400);
  }

  if (!key) {
    throw new AdminRepositoryError("key is required.", 400);
  }

  if (input.size !== undefined && (!Number.isFinite(input.size) || input.size < 0)) {
    throw new AdminRepositoryError("size must be a positive number.", 400);
  }

  const patient = await getReportingPatient({ patientId });
  const reportId = normalizeFirestoreDocumentId(
    normalizeString(input.reportId) ?? adminDb.collection(UPLOADED_REPORTS_COLLECTION).doc().id,
    "Report id",
  );
  const reportCode = normalizeReportCode(input, reportId);
  const uploadedReportRef = adminDb.collection(UPLOADED_REPORTS_COLLECTION).doc(reportId);
  const reportCodeRef = adminDb.collection(REPORT_CODES_COLLECTION).doc(reportCode);

  await adminDb.runTransaction(async (transaction: Transaction) => {
    const existingUploadedReport = await transaction.get(uploadedReportRef);
    transaction.set(
      uploadedReportRef,
      uploadedReportPayload(
        {
          ...input,
          bucket,
          key,
        },
        patient,
        reportId,
        reportCode,
        existingUploadedReport.exists
          ? existingUploadedReport.data()?.date_created
          : undefined,
      ),
      { merge: true },
    );
    transaction.set(reportCodeRef, reportCodePayload(patient, reportId), { merge: true });
  });

  return {
    ok: true,
    reportId,
    reportCode,
    patientId: patient.id,
    status: "available",
  };
}
