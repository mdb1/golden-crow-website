import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { AdminRepositoryError } from "./admin-errors.js";

const adminDb = adminDbFor("mydnamap");

const PATIENTS_COLLECTION = "patients";
const INSTITUTIONS_COLLECTION = "institutions";
const DOCTORS_COLLECTION = "doctors";
const TWO_PQ_CASES_COLLECTION = "2pq_case";
const TWO_PQ_SAMPLING_COLLECTION = "2pq_sampling";
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

type ReportingFirestoreDocument = {
  id: string;
  data: Record<string, unknown>;
};

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

function normalizeSixCharacterCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    throw new AdminRepositoryError(
      "caseCode must contain exactly 6 letters or numbers.",
      400,
    );
  }

  return normalized;
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

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));

  return values.length > 0 ? values : undefined;
}

function nullableString(value: unknown) {
  return normalizeString(value) ?? null;
}

function normalizedDateOrNull(value: unknown) {
  return normalizeIsoDateValue(value) ?? normalizeString(value) ?? null;
}

function uniqueStringValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
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

function normalizeRelatedEntity(id: string, data: Record<string, unknown>) {
  return stripUndefinedFields({
    id,
    name:
      normalizeString(data.name) ??
      normalizeString(data.fullName) ??
      normalizeString(data.displayName) ??
      normalizeString(data.legalName) ??
      id,
    email:
      normalizeEmail(data.email) ??
      normalizeEmail(data.contactEmail) ??
      normalizeEmail(data.ownerEmail),
    phone:
      normalizeString(data.phone) ??
      normalizeString(data.phoneNumber) ??
      normalizeString(data.contactPhone),
    status: normalizeString(data.status),
    createdAt: normalizeIsoDateValue(data.createdAt),
    updatedAt: normalizeIsoDateValue(data.updatedAt),
  });
}

function snapshotToDocument(
  snapshot:
    | {
        id: string;
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
      }
    | undefined,
): ReportingFirestoreDocument | null {
  if (!snapshot?.exists) {
    return null;
  }

  return {
    id: snapshot.id,
    data: snapshot.data() ?? {},
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

async function getRawDocumentById(collectionName: string, documentId: string) {
  const snapshot = await adminDb
    .collection(collectionName)
    .doc(normalizeFirestoreDocumentId(documentId, "Document id"))
    .get();

  return snapshotToDocument(snapshot);
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

async function getUniqueRawDocumentByField(
  collectionName: string,
  field: string,
  value: string,
  label: string,
) {
  const snapshot = await adminDb
    .collection(collectionName)
    .where(field, "==", value)
    .limit(2)
    .get();

  if (snapshot.empty) {
    return null;
  }

  if (snapshot.docs.length > 1) {
    throw new AdminRepositoryError(`Multiple ${label} records found.`, 409);
  }

  const document = snapshot.docs[0]!;
  return {
    id: document.id,
    data: document.data() as Record<string, unknown>,
  };
}

async function getRawDocumentsByIds(collectionName: string, documentIds: string[]) {
  const uniqueDocumentIds = uniqueStringValues(documentIds);
  const documents = await Promise.all(
    uniqueDocumentIds.map((documentId) => getRawDocumentById(collectionName, documentId)),
  );

  return documents.filter(
    (document): document is ReportingFirestoreDocument => Boolean(document),
  );
}

async function getRawDocumentsByField(
  collectionName: string,
  field: string,
  value: string,
) {
  const snapshot = await adminDb
    .collection(collectionName)
    .where(field, "==", value)
    .limit(100)
    .get();

  return snapshot.docs.map((document) => ({
    id: document.id,
    data: document.data() as Record<string, unknown>,
  }));
}

async function getSamplingBySixCharacterCode(code: string) {
  return (
    (await getUniqueRawDocumentByField(
      TWO_PQ_SAMPLING_COLLECTION,
      "sampleId",
      code,
      "2PQ sampling",
    )) ??
    (await getUniqueRawDocumentByField(
      TWO_PQ_SAMPLING_COLLECTION,
      "internalCode",
      code,
      "2PQ sampling",
    ))
  );
}

async function resolveTwoPQCaseBySixCharacterCode(code: string) {
  const directCase = await getUniqueRawDocumentByField(
    TWO_PQ_CASES_COLLECTION,
    "caseLabel",
    code,
    "2PQ case",
  );
  if (directCase) {
    return directCase;
  }

  const sampling = await getSamplingBySixCharacterCode(code);
  if (sampling) {
    const parentCaseId =
      normalizeString(sampling.data.parent_case) ??
      normalizeString(sampling.data.caseId);
    if (parentCaseId) {
      const parentCase = await getRawDocumentById(
        TWO_PQ_CASES_COLLECTION,
        parentCaseId,
      );
      if (!parentCase) {
        throw new AdminRepositoryError("Linked 2PQ case not found.", 404);
      }
      return parentCase;
    }

    const samplingCaseLabel = normalizeString(sampling.data.caseLabel);
    if (samplingCaseLabel) {
      const caseBySamplingLabel = await getUniqueRawDocumentByField(
        TWO_PQ_CASES_COLLECTION,
        "caseLabel",
        samplingCaseLabel,
        "2PQ case",
      );
      if (caseBySamplingLabel) {
        return caseBySamplingLabel;
      }
    }
  }

  const threeLetterCode = code.slice(0, 3);
  if (/^[A-Z]{3}$/.test(threeLetterCode)) {
    const caseByThreeLetterCode = await getUniqueRawDocumentByField(
      TWO_PQ_CASES_COLLECTION,
      "three_letter_code",
      threeLetterCode,
      "2PQ case",
    );
    if (caseByThreeLetterCode) {
      return caseByThreeLetterCode;
    }

    const caseByExpectedLabel = await getUniqueRawDocumentByField(
      TWO_PQ_CASES_COLLECTION,
      "caseLabel",
      `${threeLetterCode}XXX`,
      "2PQ case",
    );
    if (caseByExpectedLabel) {
      return caseByExpectedLabel;
    }
  }

  const caseByDocumentId = await getRawDocumentById(TWO_PQ_CASES_COLLECTION, code);
  if (caseByDocumentId) {
    return caseByDocumentId;
  }

  throw new AdminRepositoryError("2PQ case not found.", 404);
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

function buildTwoPQScope(data: Record<string, unknown>) {
  return {
    institutionId: nullableString(data.institutionId),
    doctorId: nullableString(data.doctorId),
    patientId: nullableString(data.patientId),
  };
}

function buildTwoPQTimestamps(data: Record<string, unknown>) {
  return {
    createdAt: normalizedDateOrNull(data.createdAt),
    updatedAt: normalizedDateOrNull(data.updatedAt),
  };
}

function buildTwoPQAudit(data: Record<string, unknown>) {
  return {
    createdByEmail: nullableString(data.createdByEmail),
    updatedByEmail: nullableString(data.updatedByEmail),
  };
}

function buildTwoPQCaseSnapshotRecord(
  document: ReportingFirestoreDocument,
  samplingIds: string[],
) {
  const data = document.data;

  return {
    id: document.id,
    kind: "case",
    scope: buildTwoPQScope(data),
    identity: {
      caseLabel: nullableString(data.caseLabel),
      threeLetterCode: nullableString(data.three_letter_code),
      storedFileId: nullableString(data.stored_file_id),
    },
    classification: {
      caseType: nullableString(data.caseType),
    },
    status: {
      caseStatus: nullableString(data.caseStatus),
      priority: nullableString(data.priority),
    },
    logistics: {
      trackingNumber: nullableString(data.trackingNumber),
      requestedAt: nullableString(data.requestedAt),
      dueAt: nullableString(data.dueAt),
    },
    relations: {
      samplingIds,
    },
    notes: nullableString(data.notes),
    timestamps: buildTwoPQTimestamps(data),
    audit: buildTwoPQAudit(data),
  };
}

function buildTwoPQSamplingSnapshotRecord(document: ReportingFirestoreDocument) {
  const data = document.data;

  return {
    id: document.id,
    kind: "sampling",
    scope: buildTwoPQScope(data),
    identity: {
      sampleId: nullableString(data.sampleId),
      caseLabelSnapshot: nullableString(data.caseLabel),
    },
    specimen: {
      sampleType: nullableString(data.sampleType),
      embryoStageDay: nullableString(data.embryoStageDay),
      morphology: nullableString(data.morphology),
      sentUl: nullableString(data.sentUl),
      biopsiedCells: nullableString(data.biopsiedCells),
      cellsVisualized: nullableString(data.cellsVisualized),
    },
    status: {
      processingStatus: nullableString(data.processingStatus),
      qcStatus: nullableString(data.qcStatus),
    },
    dates: {
      collectionDate: nullableString(data.collectionDate),
      receptionDate: nullableString(data.receptionDate),
      runId: nullableString(data.runId),
    },
    relations: {
      caseId:
        nullableString(data.parent_case) ?? nullableString(data.caseId),
    },
    notes: nullableString(data.notes),
    timestamps: buildTwoPQTimestamps(data),
    audit: buildTwoPQAudit(data),
  };
}

function mergeRawDocumentsById(documents: ReportingFirestoreDocument[]) {
  const byId = new Map<string, ReportingFirestoreDocument>();
  for (const document of documents) {
    byId.set(document.id, document);
  }
  return Array.from(byId.values());
}

async function getSamplingsForCase(caseDocument: ReportingFirestoreDocument) {
  const linkedSamplingIds = [
    ...(normalizeStringArray(caseDocument.data.children_sampling) ?? []),
    ...(normalizeStringArray(caseDocument.data.linkedSamplingIds) ?? []),
  ];

  const [samplingsById, samplingsByParentCase, samplingsByLegacyCaseId] =
    await Promise.all([
      getRawDocumentsByIds(TWO_PQ_SAMPLING_COLLECTION, linkedSamplingIds),
      getRawDocumentsByField(
        TWO_PQ_SAMPLING_COLLECTION,
        "parent_case",
        caseDocument.id,
      ),
      getRawDocumentsByField(
        TWO_PQ_SAMPLING_COLLECTION,
        "caseId",
        caseDocument.id,
      ),
    ]);

  return mergeRawDocumentsById([
    ...samplingsById,
    ...samplingsByParentCase,
    ...samplingsByLegacyCaseId,
  ]);
}

export async function getReportingTwoPQCaseByCode(caseCode: string) {
  const code = normalizeSixCharacterCode(caseCode);
  const caseDocument = await resolveTwoPQCaseBySixCharacterCode(code);
  const caseData = caseDocument.data;
  const samplings = await getSamplingsForCase(caseDocument);
  const patientId = normalizeString(caseData.patientId);
  const institutionId = normalizeString(caseData.institutionId);
  const doctorId = normalizeString(caseData.doctorId);
  const [patient, institution, doctor] = await Promise.all([
    patientId ? getPatientById(patientId) : Promise.resolve(null),
    institutionId ? getRawDocumentById(INSTITUTIONS_COLLECTION, institutionId) : Promise.resolve(null),
    doctorId ? getRawDocumentById(DOCTORS_COLLECTION, doctorId) : Promise.resolve(null),
  ]);
  const samplingIds = samplings.map((sampling) => sampling.id);

  return {
    code,
    generatedAt: new Date().toISOString(),
    main_case: {
      id: caseDocument.id,
      patient_id: patientId ?? null,
      institution_id: institutionId ?? null,
      doctor_id: doctorId ?? null,
      children_sampling_ids: samplingIds,
      last_updated:
        normalizedDateOrNull(caseData.updatedAt) ??
        normalizedDateOrNull(caseData.last_updated_date),
    },
    patient,
    institution: institution
      ? normalizeRelatedEntity(institution.id, institution.data)
      : null,
    doctor: doctor ? normalizeRelatedEntity(doctor.id, doctor.data) : null,
    entities: {
      cases: [buildTwoPQCaseSnapshotRecord(caseDocument, samplingIds)],
      samplings: samplings.map((sampling) =>
        buildTwoPQSamplingSnapshotRecord(sampling),
      ),
    },
  };
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
