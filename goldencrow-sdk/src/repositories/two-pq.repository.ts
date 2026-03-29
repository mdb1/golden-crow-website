import { adminDb } from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import { normalizeRoleEmail } from "./roles.repository.js";
import type {
  AdminContext,
  DoctorListItem,
  DoctorRecord,
  InstitutionRecord,
  PatientListItem,
  PatientRecord,
  TwoPQAreaKey,
  TwoPQCollectionKey,
  TwoPQDetailRecord,
  TwoPQListItem,
  TwoPQRecord,
} from "../types/sdk.types.js";

const INSTITUTIONS_COLLECTION = "institutions";
const DOCTORS_COLLECTION = "doctors";
const PATIENTS_COLLECTION = "patients";
const SEQUENCES_COLLECTION = "admin_sequences";

type TwoPQMutationInput = {
  institutionId?: string;
  doctorId?: string;
  patientId?: string;
  caseLabel?: string;
  caseStatus?: string;
  caseType?: string;
  priority?: string;
  sampleId?: string;
  shipmentId?: string;
  trackingNumber?: string;
  requestedAt?: string;
  dueAt?: string;
  sampleType?: string;
  collectionDate?: string;
  receptionDate?: string;
  processingStatus?: string;
  runId?: string;
  qcStatus?: string;
  carrier?: string;
  dispatchDate?: string;
  deliveryDate?: string;
  deliveryStatus?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  platform?: string;
  scheduling?: string;
  analysisStatus?: string;
  providerName?: string;
  providerFormat?: string;
  phoneNumber?: string;
  reportCode?: string;
  uploadedReportId?: string;
  clientCaseStatus?: string;
  reportDelivery?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  preferredLanguage?: string;
  country?: string;
  roleEmail?: string;
  accessStatus?: string;
  communicationStatus?: string;
  notes?: string;
};

const MUTABLE_FIELDS: Array<keyof TwoPQMutationInput> = [
  "institutionId",
  "doctorId",
  "patientId",
  "caseLabel",
  "caseStatus",
  "caseType",
  "priority",
  "sampleId",
  "shipmentId",
  "trackingNumber",
  "requestedAt",
  "dueAt",
  "sampleType",
  "collectionDate",
  "receptionDate",
  "processingStatus",
  "runId",
  "qcStatus",
  "carrier",
  "dispatchDate",
  "deliveryDate",
  "deliveryStatus",
  "contactName",
  "contactEmail",
  "contactPhone",
  "platform",
  "scheduling",
  "analysisStatus",
  "providerName",
  "providerFormat",
  "phoneNumber",
  "reportCode",
  "uploadedReportId",
  "clientCaseStatus",
  "reportDelivery",
  "clientName",
  "clientEmail",
  "clientPhone",
  "preferredLanguage",
  "country",
  "roleEmail",
  "accessStatus",
  "communicationStatus",
  "notes",
];

const ISO_DATE_FIELDS = new Set<keyof TwoPQMutationInput>([
  "requestedAt",
  "dueAt",
  "collectionDate",
  "receptionDate",
  "dispatchDate",
  "deliveryDate",
]);

const EMAIL_FIELDS = new Set<keyof TwoPQMutationInput>([
  "contactEmail",
  "clientEmail",
  "roleEmail",
]);

const AREA_CONFIG: Record<
  TwoPQAreaKey,
  {
    collectionKey: TwoPQCollectionKey;
    sequenceDocumentId: TwoPQCollectionKey;
    prefix: string;
    requiredFields: Array<keyof TwoPQMutationInput>;
    searchableFields: Array<keyof TwoPQMutationInput>;
  }
> = {
  cases: {
    collectionKey: "2pq_case",
    sequenceDocumentId: "2pq_case",
    prefix: "CASE",
    requiredFields: ["institutionId", "doctorId", "caseLabel", "caseStatus", "sampleId"],
    searchableFields: [
      "caseLabel",
      "caseStatus",
      "sampleId",
      "shipmentId",
      "trackingNumber",
      "priority",
      "notes",
    ],
  },
  sampling: {
    collectionKey: "2pq_sampling",
    sequenceDocumentId: "2pq_sampling",
    prefix: "SAMP",
    requiredFields: [
      "institutionId",
      "doctorId",
      "caseLabel",
      "sampleId",
      "sampleType",
      "processingStatus",
    ],
    searchableFields: [
      "caseLabel",
      "sampleId",
      "sampleType",
      "processingStatus",
      "runId",
      "notes",
    ],
  },
  shipments: {
    collectionKey: "2pq_shipment",
    sequenceDocumentId: "2pq_shipment",
    prefix: "SHIP",
    requiredFields: [
      "institutionId",
      "doctorId",
      "caseLabel",
      "shipmentId",
      "trackingNumber",
      "deliveryStatus",
    ],
    searchableFields: [
      "caseLabel",
      "shipmentId",
      "trackingNumber",
      "carrier",
      "deliveryStatus",
      "contactName",
      "contactEmail",
      "notes",
    ],
  },
  sequencing: {
    collectionKey: "2pq_sequencing",
    sequenceDocumentId: "2pq_sequencing",
    prefix: "SEQ",
    requiredFields: [
      "institutionId",
      "doctorId",
      "caseLabel",
      "runId",
      "platform",
      "analysisStatus",
    ],
    searchableFields: [
      "caseLabel",
      "runId",
      "platform",
      "analysisStatus",
      "providerName",
      "contactName",
      "contactEmail",
      "notes",
    ],
  },
  reports: {
    collectionKey: "2pq_report",
    sequenceDocumentId: "2pq_report",
    prefix: "RPT",
    requiredFields: [
      "institutionId",
      "doctorId",
      "caseLabel",
      "reportCode",
      "clientCaseStatus",
      "reportDelivery",
    ],
    searchableFields: [
      "caseLabel",
      "reportCode",
      "uploadedReportId",
      "clientCaseStatus",
      "reportDelivery",
      "providerName",
      "providerFormat",
      "notes",
    ],
  },
  clients: {
    collectionKey: "2pq_client",
    sequenceDocumentId: "2pq_client",
    prefix: "CLNT",
    requiredFields: ["institutionId", "doctorId", "clientName", "clientEmail"],
    searchableFields: [
      "clientName",
      "clientEmail",
      "clientPhone",
      "preferredLanguage",
      "country",
      "roleEmail",
      "accessStatus",
      "communicationStatus",
      "notes",
    ],
  },
};

const DEFAULT_RECORD_FIELDS: Array<keyof TwoPQRecord> = [
  "patientId",
  "caseLabel",
  "caseStatus",
  "caseType",
  "priority",
  "sampleId",
  "shipmentId",
  "trackingNumber",
  "requestedAt",
  "dueAt",
  "sampleType",
  "collectionDate",
  "receptionDate",
  "processingStatus",
  "runId",
  "qcStatus",
  "carrier",
  "dispatchDate",
  "deliveryDate",
  "deliveryStatus",
  "contactName",
  "contactEmail",
  "contactPhone",
  "platform",
  "scheduling",
  "analysisStatus",
  "providerName",
  "providerFormat",
  "phoneNumber",
  "reportCode",
  "uploadedReportId",
  "clientCaseStatus",
  "reportDelivery",
  "clientName",
  "clientEmail",
  "clientPhone",
  "preferredLanguage",
  "country",
  "roleEmail",
  "accessStatus",
  "communicationStatus",
  "notes",
  "createdByEmail",
  "updatedByEmail",
];

function hasOwnKey<T extends object>(value: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeIsoDateString(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  const candidate = new Date(normalized);
  if (Number.isNaN(candidate.getTime())) {
    throw new AdminRepositoryError("Use a valid ISO date value.", 400);
  }

  return candidate.toISOString();
}

function normalizeFieldValue(field: keyof TwoPQMutationInput, value: unknown) {
  if (ISO_DATE_FIELDS.has(field)) {
    return normalizeIsoDateString(value);
  }

  if (EMAIL_FIELDS.has(field)) {
    const normalized = normalizeOptionalString(value);
    return normalized ? normalizeRoleEmail(normalized) : undefined;
  }

  return normalizeOptionalString(value);
}

function buildEmptyRecord(
  id: string,
  areaKey: TwoPQAreaKey,
  institutionId: string,
  doctorId: string,
  createdAt: string,
  updatedAt: string
): TwoPQRecord {
  const config = AREA_CONFIG[areaKey];

  return {
    id,
    areaKey,
    collectionKey: config.collectionKey,
    institutionId,
    doctorId,
    createdAt,
    updatedAt,
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

function toDoctorListItem(
  doctor: DoctorRecord,
  extras: {
    institutionName?: string;
    patientCount?: number;
    roleEmail?: string;
    roleActive?: boolean;
  } = {}
): DoctorListItem {
  return {
    ...doctor,
    institutionName: extras.institutionName,
    patientCount: extras.patientCount ?? 0,
    roleEmail: extras.roleEmail,
    roleActive: extras.roleActive,
  };
}

function toPatientListItem(
  patient: PatientRecord,
  extras: {
    institutionName?: string;
    doctorName?: string;
    doctorEmail?: string;
  } = {}
): PatientListItem {
  return {
    ...patient,
    institutionName: extras.institutionName,
    doctorName: extras.doctorName,
    doctorEmail: extras.doctorEmail,
  };
}

function toTwoPQRecord(
  id: string,
  areaKey: TwoPQAreaKey,
  data: Record<string, unknown>
): TwoPQRecord {
  const now = new Date().toISOString();
  const config = AREA_CONFIG[areaKey];
  const institutionId = normalizeOptionalString(data.institutionId) ?? "";
  const doctorId = normalizeOptionalString(data.doctorId) ?? "";
  const base = buildEmptyRecord(
    id,
    areaKey,
    institutionId,
    doctorId,
    normalizeOptionalString(data.createdAt) ?? now,
    normalizeOptionalString(data.updatedAt) ?? now
  );

  return DEFAULT_RECORD_FIELDS.reduce<TwoPQRecord>((record, field) => {
    const normalized = normalizeOptionalString(data[field]);
    if (normalized) {
      record[field] = normalized as never;
    }
    return record;
  }, {
    ...base,
    collectionKey:
      normalizeOptionalString(data.collectionKey) === config.collectionKey
        ? config.collectionKey
        : config.collectionKey,
    areaKey:
      normalizeOptionalString(data.areaKey) === areaKey
        ? areaKey
        : areaKey,
  });
}

async function getNextTwoPQId(areaKey: TwoPQAreaKey) {
  const config = AREA_CONFIG[areaKey];

  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb
      .collection(SEQUENCES_COLLECTION)
      .doc(config.sequenceDocumentId);
    const snapshot = await transaction.get(reference);
    const current = Number(snapshot.data()?.current ?? 0);
    const next = current + 1;
    const now = new Date().toISOString();

    transaction.set(reference, { current: next, updatedAt: now }, { merge: true });
    return `${config.prefix}-${String(next).padStart(5, "0")}`;
  });
}

async function getInstitutionById(institutionId: string) {
  const snapshot = await adminDb.collection(INSTITUTIONS_COLLECTION).doc(institutionId).get();
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

async function ensureInstitutionExists(institutionId: string) {
  const institution = await getInstitutionById(institutionId);
  if (!institution) {
    throw new AdminRepositoryError("Institution not found.", 404);
  }
  return institution;
}

async function ensureDoctorExists(doctorId: string) {
  const doctor = await getDoctorById(doctorId);
  if (!doctor) {
    throw new AdminRepositoryError("Doctor not found.", 404);
  }
  return doctor;
}

async function ensurePatientExists(patientId: string) {
  const patient = await getPatientById(patientId);
  if (!patient) {
    throw new AdminRepositoryError("Patient not found.", 404);
  }
  return patient;
}

function canViewTwoPQRecord(context: AdminContext, record: Pick<TwoPQRecord, "institutionId">) {
  if (context.role === "full_admin") {
    return true;
  }

  return context.institutionId === record.institutionId;
}

function canWriteTwoPQRecord(
  context: AdminContext,
  record: Pick<TwoPQRecord, "institutionId" | "doctorId">
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_admin") {
    return context.institutionId === record.institutionId;
  }

  return (
    context.role === "institution_doctor" &&
    context.institutionId === record.institutionId &&
    context.doctorId === record.doctorId
  );
}

function canCreateTwoPQRecord(
  context: AdminContext,
  institutionId: string,
  doctorId: string
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_admin") {
    return context.institutionId === institutionId;
  }

  return (
    context.role === "institution_doctor" &&
    context.institutionId === institutionId &&
    context.doctorId === doctorId
  );
}

function resolveScopedIds(
  context: AdminContext,
  current: { institutionId?: string; doctorId?: string } | null,
  payload: TwoPQMutationInput
) {
  const institutionId =
    context.role === "institution_admin" || context.role === "institution_doctor"
      ? context.institutionId ?? normalizeOptionalString(payload.institutionId) ?? current?.institutionId
      : normalizeOptionalString(payload.institutionId) ?? current?.institutionId;
  const doctorId =
    context.role === "institution_doctor"
      ? context.doctorId ?? normalizeOptionalString(payload.doctorId) ?? current?.doctorId
      : normalizeOptionalString(payload.doctorId) ?? current?.doctorId;

  return {
    institutionId: institutionId ?? "",
    doctorId: doctorId ?? "",
  };
}

async function validateLinkedEntities(payload: {
  institutionId: string;
  doctorId: string;
  patientId?: string;
}) {
  const institution = await ensureInstitutionExists(payload.institutionId);
  const doctor = await ensureDoctorExists(payload.doctorId);

  if (doctor.institutionId !== payload.institutionId) {
    throw new AdminRepositoryError(
      "The selected doctor must belong to the selected institution.",
      400
    );
  }

  let patient: PatientRecord | null = null;
  if (payload.patientId) {
    patient = await ensurePatientExists(payload.patientId);
    if (patient.institutionId !== payload.institutionId) {
      throw new AdminRepositoryError(
        "The selected patient must belong to the selected institution.",
        400
      );
    }

    if (patient.doctorId !== payload.doctorId) {
      throw new AdminRepositoryError(
        "The selected patient must belong to the selected doctor.",
        400
      );
    }
  }

  return { institution, doctor, patient };
}

function validateRequiredFields(areaKey: TwoPQAreaKey, payload: TwoPQMutationInput) {
  const config = AREA_CONFIG[areaKey];

  for (const field of config.requiredFields) {
    const value = normalizeFieldValue(field, payload[field]);
    if (!value) {
      throw new AdminRepositoryError(`${field} is required.`, 400);
    }
  }
}

function applyMutation(
  areaKey: TwoPQAreaKey,
  baseRecord: TwoPQRecord,
  payload: TwoPQMutationInput,
  mode: "replace" | "update"
) {
  const nextRecord: TwoPQRecord = { ...baseRecord };

  for (const field of MUTABLE_FIELDS) {
    const shouldApply = mode === "replace" || hasOwnKey(payload, field);
    if (!shouldApply) {
      continue;
    }

    const normalized = normalizeFieldValue(field, payload[field]);
    if (!normalized) {
      delete nextRecord[field];
      continue;
    }

    nextRecord[field] = normalized as never;
  }

  return nextRecord;
}

function buildMergeWriteDocument(
  nextRecord: TwoPQRecord,
  payload: TwoPQMutationInput
): Record<string, unknown> {
  const document: Record<string, unknown> = { ...nextRecord };

  for (const field of MUTABLE_FIELDS) {
    if (!hasOwnKey(payload, field)) {
      continue;
    }

    const normalized = normalizeFieldValue(field, payload[field]);
    if (!normalized) {
      document[field] = FieldValue.delete();
    }
  }

  return document;
}

function buildListItem(
  context: AdminContext,
  record: TwoPQRecord,
  extras: {
    institutionName?: string;
    doctorName?: string;
    patientName?: string;
  } = {}
): TwoPQListItem {
  return {
    ...record,
    institutionName: extras.institutionName,
    doctorName: extras.doctorName,
    patientName: extras.patientName,
    canReplace: canWriteTwoPQRecord(context, record),
    canUpdate: canWriteTwoPQRecord(context, record),
    canDelete: canWriteTwoPQRecord(context, record),
  };
}

async function loadScopedInstitutions(context: AdminContext) {
  if (context.role === "full_admin") {
    const snapshot = await adminDb.collection(INSTITUTIONS_COLLECTION).get();
    return snapshot.docs.map((doc) =>
      toInstitutionRecord(doc.id, doc.data() as Record<string, unknown>)
    );
  }

  if (!context.institutionId) {
    return [];
  }

  const institution = await getInstitutionById(context.institutionId);
  return institution ? [institution] : [];
}

async function loadScopedDoctors(context: AdminContext) {
  const snapshot =
    context.role === "full_admin"
      ? await adminDb.collection(DOCTORS_COLLECTION).get()
      : await adminDb
          .collection(DOCTORS_COLLECTION)
          .where("institutionId", "==", context.institutionId ?? "__none__")
          .get();

  return snapshot.docs.map((doc) => toDoctorRecord(doc.id, doc.data() as Record<string, unknown>));
}

async function loadScopedPatients(context: AdminContext) {
  const snapshot =
    context.role === "full_admin"
      ? await adminDb.collection(PATIENTS_COLLECTION).get()
      : await adminDb
          .collection(PATIENTS_COLLECTION)
          .where("institutionId", "==", context.institutionId ?? "__none__")
          .get();

  return snapshot.docs.map((doc) =>
    toPatientRecord(doc.id, doc.data() as Record<string, unknown>)
  );
}

async function getTwoPQRecord(areaKey: TwoPQAreaKey, recordId: string) {
  const config = AREA_CONFIG[areaKey];
  const snapshot = await adminDb.collection(config.collectionKey).doc(recordId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toTwoPQRecord(recordId, areaKey, snapshot.data() as Record<string, unknown>);
}

export async function listTwoPQRecordsForContext(
  context: AdminContext,
  areaKey: TwoPQAreaKey,
  filters?: {
    institutionId?: string;
    doctorId?: string;
    patientId?: string;
    query?: string;
  }
): Promise<TwoPQListItem[]> {
  const config = AREA_CONFIG[areaKey];
  const [recordSnapshot, institutions, doctors, patients] = await Promise.all([
    context.role === "full_admin"
      ? adminDb.collection(config.collectionKey).get()
      : adminDb
          .collection(config.collectionKey)
          .where("institutionId", "==", context.institutionId ?? "__none__")
          .get(),
    loadScopedInstitutions(context),
    loadScopedDoctors(context),
    loadScopedPatients(context),
  ]);

  const institutionNameById = new Map(
    institutions.map((institution) => [institution.id, institution.name])
  );
  const doctorById = new Map(doctors.map((doctor) => [doctor.id, doctor]));
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const normalizedQuery = filters?.query?.trim().toLowerCase() ?? "";

  return recordSnapshot.docs
    .map((doc) => toTwoPQRecord(doc.id, areaKey, doc.data() as Record<string, unknown>))
    .filter((record) => canViewTwoPQRecord(context, record))
    .filter((record) => {
      if (filters?.institutionId && record.institutionId !== filters.institutionId) {
        return false;
      }

      if (filters?.doctorId && record.doctorId !== filters.doctorId) {
        return false;
      }

      if (filters?.patientId && record.patientId !== filters.patientId) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        record.id,
        ...config.searchableFields.map((field) => record[field]),
        institutionNameById.get(record.institutionId),
        doctorById.get(record.doctorId)?.fullName,
        patientById.get(record.patientId ?? "")?.fullName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    })
    .map((record) =>
      buildListItem(context, record, {
        institutionName: institutionNameById.get(record.institutionId),
        doctorName: doctorById.get(record.doctorId)?.fullName,
        patientName: patientById.get(record.patientId ?? "")?.fullName,
      })
    )
    .sort((left, right) => {
      const leftLabel = left.caseLabel ?? left.clientName ?? left.reportCode ?? left.id;
      const rightLabel = right.caseLabel ?? right.clientName ?? right.reportCode ?? right.id;
      return leftLabel.localeCompare(rightLabel);
    });
}

export async function createTwoPQRecordForContext(
  context: AdminContext,
  areaKey: TwoPQAreaKey,
  payload: TwoPQMutationInput
): Promise<TwoPQRecord> {
  validateRequiredFields(areaKey, payload);
  const scopedIds = resolveScopedIds(context, null, payload);

  if (!scopedIds.institutionId || !scopedIds.doctorId) {
    throw new AdminRepositoryError("institutionId and doctorId are required.", 400);
  }

  if (!canCreateTwoPQRecord(context, scopedIds.institutionId, scopedIds.doctorId)) {
    throw new AdminRepositoryError("You cannot create records in this scope.", 403);
  }

  await validateLinkedEntities({
    institutionId: scopedIds.institutionId,
    doctorId: scopedIds.doctorId,
    patientId: normalizeOptionalString(payload.patientId),
  });

  const recordId = await getNextTwoPQId(areaKey);
  const now = new Date().toISOString();
  const document = applyMutation(
    areaKey,
    {
      ...buildEmptyRecord(
        recordId,
        areaKey,
        scopedIds.institutionId,
        scopedIds.doctorId,
        now,
        now
      ),
      createdByEmail: context.email,
      updatedByEmail: context.email,
    },
    {
      ...payload,
      institutionId: scopedIds.institutionId,
      doctorId: scopedIds.doctorId,
    },
    "replace"
  );

  await adminDb.collection(AREA_CONFIG[areaKey].collectionKey).doc(recordId).set({
    ...document,
    createdByEmail: context.email,
    updatedByEmail: context.email,
  });

  return document;
}

export async function getTwoPQDetailForContext(
  context: AdminContext,
  areaKey: TwoPQAreaKey,
  recordId: string
): Promise<TwoPQDetailRecord> {
  const record = await getTwoPQRecord(areaKey, recordId);
  if (!record) {
    throw new AdminRepositoryError("Record not found.", 404);
  }

  if (!canViewTwoPQRecord(context, record)) {
    throw new AdminRepositoryError("You cannot view this record.", 403);
  }

  const [institution, doctor, patient] = await Promise.all([
    getInstitutionById(record.institutionId),
    getDoctorById(record.doctorId),
    record.patientId ? getPatientById(record.patientId) : Promise.resolve(null),
  ]);

  return {
    record: buildListItem(context, record, {
      institutionName: institution?.name,
      doctorName: doctor?.fullName,
      patientName: patient?.fullName,
    }),
    institution,
    doctor: doctor
      ? toDoctorListItem(doctor, {
          institutionName: institution?.name,
        })
      : null,
    patient: patient
      ? toPatientListItem(patient, {
          institutionName: institution?.name,
          doctorName: doctor?.fullName,
          doctorEmail: doctor?.authEmail,
        })
      : null,
  };
}

export async function replaceTwoPQRecordForContext(
  context: AdminContext,
  areaKey: TwoPQAreaKey,
  recordId: string,
  payload: TwoPQMutationInput
): Promise<TwoPQRecord> {
  const existing = await getTwoPQRecord(areaKey, recordId);
  if (!existing) {
    throw new AdminRepositoryError("Record not found.", 404);
  }

  if (!canWriteTwoPQRecord(context, existing)) {
    throw new AdminRepositoryError("You cannot replace this record.", 403);
  }

  validateRequiredFields(areaKey, payload);
  const scopedIds = resolveScopedIds(context, existing, payload);
  if (!scopedIds.institutionId || !scopedIds.doctorId) {
    throw new AdminRepositoryError("institutionId and doctorId are required.", 400);
  }

  if (!canCreateTwoPQRecord(context, scopedIds.institutionId, scopedIds.doctorId)) {
    throw new AdminRepositoryError("You cannot move this record outside your scope.", 403);
  }

  await validateLinkedEntities({
    institutionId: scopedIds.institutionId,
    doctorId: scopedIds.doctorId,
    patientId: normalizeOptionalString(payload.patientId),
  });

  const nextRecord = applyMutation(
    areaKey,
    {
      ...buildEmptyRecord(
        existing.id,
        areaKey,
        scopedIds.institutionId,
        scopedIds.doctorId,
        existing.createdAt,
        new Date().toISOString()
      ),
      createdByEmail: existing.createdByEmail,
      updatedByEmail: context.email,
    },
    {
      ...payload,
      institutionId: scopedIds.institutionId,
      doctorId: scopedIds.doctorId,
    },
    "replace"
  );

  nextRecord.createdAt = existing.createdAt;
  nextRecord.createdByEmail = existing.createdByEmail;
  nextRecord.updatedAt = new Date().toISOString();
  nextRecord.updatedByEmail = context.email;

  await adminDb.collection(AREA_CONFIG[areaKey].collectionKey).doc(recordId).set(nextRecord);
  return nextRecord;
}

export async function updateTwoPQRecordForContext(
  context: AdminContext,
  areaKey: TwoPQAreaKey,
  recordId: string,
  payload: TwoPQMutationInput
): Promise<TwoPQRecord> {
  const existing = await getTwoPQRecord(areaKey, recordId);
  if (!existing) {
    throw new AdminRepositoryError("Record not found.", 404);
  }

  if (!canWriteTwoPQRecord(context, existing)) {
    throw new AdminRepositoryError("You cannot update this record.", 403);
  }

  const scopedIds = resolveScopedIds(context, existing, payload);
  if (!scopedIds.institutionId || !scopedIds.doctorId) {
    throw new AdminRepositoryError("institutionId and doctorId are required.", 400);
  }

  if (!canCreateTwoPQRecord(context, scopedIds.institutionId, scopedIds.doctorId)) {
    throw new AdminRepositoryError("You cannot move this record outside your scope.", 403);
  }

  await validateLinkedEntities({
    institutionId: scopedIds.institutionId,
    doctorId: scopedIds.doctorId,
    patientId:
      hasOwnKey(payload, "patientId")
        ? normalizeOptionalString(payload.patientId)
        : existing.patientId,
  });

  const nextRecord = applyMutation(
    areaKey,
    {
      ...existing,
      institutionId: scopedIds.institutionId,
      doctorId: scopedIds.doctorId,
      updatedAt: new Date().toISOString(),
      updatedByEmail: context.email,
    },
    {
      ...payload,
      institutionId: scopedIds.institutionId,
      doctorId: scopedIds.doctorId,
    },
    "update"
  );

  nextRecord.updatedAt = new Date().toISOString();
  nextRecord.updatedByEmail = context.email;

  for (const field of AREA_CONFIG[areaKey].requiredFields) {
    if (!nextRecord[field]) {
      throw new AdminRepositoryError(`${field} is required.`, 400);
    }
  }

  await adminDb
    .collection(AREA_CONFIG[areaKey].collectionKey)
    .doc(recordId)
    .set(buildMergeWriteDocument(nextRecord, payload), {
      merge: true,
    });

  return nextRecord;
}

export async function deleteTwoPQRecordForContext(
  context: AdminContext,
  areaKey: TwoPQAreaKey,
  recordId: string
): Promise<{ success: true }> {
  const record = await getTwoPQRecord(areaKey, recordId);
  if (!record) {
    throw new AdminRepositoryError("Record not found.", 404);
  }

  if (!canWriteTwoPQRecord(context, record)) {
    throw new AdminRepositoryError("You cannot delete this record.", 403);
  }

  await adminDb.collection(AREA_CONFIG[areaKey].collectionKey).doc(recordId).delete();
  return { success: true };
}
