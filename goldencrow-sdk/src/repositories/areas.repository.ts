import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import {
  canCreateDoctor,
  canCreateInstitution,
  canCreatePatient,
  canDeleteDoctor,
  canDeleteInstitution,
  canDeletePatient,
  canEditDoctor,
  canEditInstitution,
  canEditPatient,
  canViewDoctor,
  canViewInstitution,
  canViewPatient,
  getUserRoleByEmail,
  normalizeRoleEmail,
} from "./roles.repository.js";
import type {
  AdminContext,
  DoctorDetailRecord,
  DoctorListItem,
  DoctorRecord,
  InstitutionDetailRecord,
  InstitutionListItem,
  InstitutionRecord,
  PatientDetailRecord,
  PatientListItem,
  PatientRecord,
  RoleManagementRecord,
  UserRoleRecord,
} from "../types/sdk.types.js";

const INSTITUTIONS_COLLECTION = "institutions";
const DOCTORS_COLLECTION = "doctors";
const PATIENTS_COLLECTION = "patients";
const USER_ROLES_COLLECTION = "user_roles";
const SEQUENCES_COLLECTION = "admin_sequences";

type SequenceKey = "institution" | "doctor" | "patient";

const SEQUENCE_CONFIG: Record<
  SequenceKey,
  { documentId: string; prefix: string; padding: number }
> = {
  institution: { documentId: "institutions", prefix: "INST", padding: 5 },
  doctor: { documentId: "doctors", prefix: "DOC", padding: 5 },
  patient: { documentId: "patients", prefix: "PAT", padding: 5 },
};

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isInstitutionManagerRole(role: unknown) {
  return (
    role === "institution_admin" ||
    role === "institution_operator" ||
    role === "institution_laboratory_staff"
  );
}

function normalizeRequiredString(value: unknown, label: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new AdminRepositoryError(`${label} is required.`, 400);
  }

  return normalized;
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

function normalizeStatus(value: unknown): "active" | "inactive" {
  return value === "inactive" ? "inactive" : "active";
}

function normalizeSex(value: unknown): string | undefined {
  return normalizeOptionalString(value);
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

function hasOwnKey<T extends object>(value: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(value, key);
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
    status: normalizeStatus(data.status),
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
    sex: normalizeSex(data.sex),
    status: normalizeStatus(data.status),
    notes: normalizeOptionalString(data.notes),
    additionalInformation: normalizeOptionalRecord(data.additionalInformation),
    createdAt: normalizeOptionalString(data.createdAt) ?? now,
    updatedAt: normalizeOptionalString(data.updatedAt) ?? now,
  };
}

async function getNextEntityId(sequenceKey: SequenceKey) {
  const config = SEQUENCE_CONFIG[sequenceKey];

  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb
      .collection(SEQUENCES_COLLECTION)
      .doc(config.documentId);
    const snapshot = await transaction.get(reference);
    const current = Number(snapshot.data()?.current ?? 0);
    const next = current + 1;
    const now = new Date().toISOString();

    transaction.set(
      reference,
      {
        current: next,
        updatedAt: now,
      },
      { merge: true },
    );

    return `${config.prefix}-${String(next).padStart(config.padding, "0")}`;
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

async function loadScopedInstitutionRecords(context: AdminContext) {
  if (context.role === "full_admin") {
    const snapshot = await adminDb.collection(INSTITUTIONS_COLLECTION).get();
    return snapshot.docs.map((doc) =>
      toInstitutionRecord(doc.id, doc.data() as Record<string, unknown>),
    );
  }

  if (!context.institutionId) {
    return [];
  }

  const institution = await getInstitutionById(context.institutionId);
  return institution ? [institution] : [];
}

async function loadScopedDoctorRecords(context: AdminContext) {
  const snapshot =
    context.role === "full_admin"
      ? await adminDb.collection(DOCTORS_COLLECTION).get()
      : await adminDb
          .collection(DOCTORS_COLLECTION)
          .where("institutionId", "==", context.institutionId ?? "__none__")
          .get();

  return snapshot.docs
    .map((doc) => toDoctorRecord(doc.id, doc.data() as Record<string, unknown>))
    .filter((doctor) => canViewDoctor(context, doctor));
}

async function loadScopedPatientRecords(context: AdminContext) {
  const snapshot =
    context.role === "full_admin"
      ? await adminDb.collection(PATIENTS_COLLECTION).get()
      : await adminDb
          .collection(PATIENTS_COLLECTION)
          .where("institutionId", "==", context.institutionId ?? "__none__")
          .get();

  return snapshot.docs
    .map((doc) =>
      toPatientRecord(doc.id, doc.data() as Record<string, unknown>),
    )
    .filter((patient) => canViewPatient(context, patient));
}

async function loadScopedRoleRecords(context: AdminContext) {
  if (context.role === "institution_laboratory_staff") {
    return [];
  }

  const snapshot =
    context.role === "full_admin"
      ? await adminDb.collection(USER_ROLES_COLLECTION).get()
      : await adminDb
          .collection(USER_ROLES_COLLECTION)
          .where("institutionId", "==", context.institutionId ?? "__none__")
          .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        email: doc.id,
        role:
          data.role === "full_admin" ||
          data.role === "institution_admin" ||
          data.role === "institution_operator" ||
          data.role === "institution_laboratory_staff" ||
          data.role === "institution_doctor" ||
          data.role === "patient"
            ? data.role
            : "patient",
        institutionId: normalizeOptionalString(data.institutionId),
        doctorId: normalizeOptionalString(data.doctorId),
        patientId: normalizeOptionalString(data.patientId),
        isActive: typeof data.isActive === "boolean" ? data.isActive : true,
        displayName: normalizeOptionalString(data.displayName),
        notes: normalizeOptionalString(data.notes),
        createdAt:
          normalizeOptionalString(data.createdAt) ?? new Date().toISOString(),
        updatedAt:
          normalizeOptionalString(data.updatedAt) ?? new Date().toISOString(),
        createdByEmail: normalizeOptionalString(data.createdByEmail),
      } satisfies UserRoleRecord;
    })
    .filter((record) => record.institutionId || context.role === "full_admin");
}

function toDoctorListItem(
  doctor: DoctorRecord,
  extras: {
    institutionName?: string;
    patientCount?: number;
    roleEmail?: string;
    roleActive?: boolean;
  } = {},
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
  } = {},
): PatientListItem {
  return {
    ...patient,
    institutionName: extras.institutionName,
    doctorName: extras.doctorName,
    doctorEmail: extras.doctorEmail,
  };
}

function toRoleManagementRecord(
  record: UserRoleRecord,
  extras: Partial<RoleManagementRecord> = {},
): RoleManagementRecord {
  return {
    ...record,
    institutionName: extras.institutionName,
    doctorName: extras.doctorName,
    patientName: extras.patientName,
    bootstrap: extras.bootstrap,
  };
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

async function validateDoctorInstitutionLink(
  institutionId: string,
  doctorId: string,
) {
  const doctor = await ensureDoctorExists(doctorId);
  if (doctor.institutionId !== institutionId) {
    throw new AdminRepositoryError(
      "The selected doctor must belong to the selected institution.",
      400,
    );
  }

  return doctor;
}

async function syncDoctorRoleRecord(
  doctor: DoctorRecord,
  previousEmail?: string,
): Promise<void> {
  const snapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .where("doctorId", "==", doctor.id)
    .get();

  if (snapshot.empty) {
    return;
  }

  const sourceDoc = snapshot.docs[0]!;
  const targetEmail = normalizeRoleEmail(doctor.authEmail);
  const now = new Date().toISOString();
  const targetRef = adminDb.collection(USER_ROLES_COLLECTION).doc(targetEmail);

  if (sourceDoc.id !== targetEmail) {
    const targetSnapshot = await targetRef.get();
    if (targetSnapshot.exists && targetSnapshot.id !== sourceDoc.id) {
      throw new AdminRepositoryError(
        "Cannot move the doctor role to the selected email because another role record already uses it.",
        409,
      );
    }

    const batch = adminDb.batch();
    batch.set(targetRef, {
      ...(sourceDoc.data() as Record<string, unknown>),
      email: targetEmail,
      institutionId: doctor.institutionId,
      doctorId: doctor.id,
      updatedAt: now,
    });
    batch.delete(sourceDoc.ref);
    await batch.commit();
    return;
  }

  await sourceDoc.ref.set(
    {
      institutionId: doctor.institutionId,
      doctorId: doctor.id,
      updatedAt: now,
      ...(previousEmail && previousEmail !== doctor.authEmail
        ? { email: targetEmail }
        : {}),
    },
    { merge: true },
  );
}

async function syncPatientRoleRecord(patient: PatientRecord): Promise<void> {
  const snapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .where("patientId", "==", patient.id)
    .get();

  if (snapshot.empty) {
    return;
  }

  const sourceDoc = snapshot.docs[0]!;
  const targetEmail = normalizeRoleEmail(patient.email);
  const now = new Date().toISOString();
  const targetRef = adminDb.collection(USER_ROLES_COLLECTION).doc(targetEmail);

  if (sourceDoc.id !== targetEmail) {
    const targetSnapshot = await targetRef.get();
    if (targetSnapshot.exists && targetSnapshot.id !== sourceDoc.id) {
      throw new AdminRepositoryError(
        "Cannot move the patient role to the selected email because another role record already uses it.",
        409,
      );
    }

    const batch = adminDb.batch();
    batch.set(targetRef, {
      ...(sourceDoc.data() as Record<string, unknown>),
      email: targetEmail,
      institutionId: patient.institutionId,
      doctorId: patient.doctorId,
      patientId: patient.id,
      updatedAt: now,
    });
    batch.delete(sourceDoc.ref);
    await batch.commit();
    return;
  }

  await sourceDoc.ref.set(
    {
      institutionId: patient.institutionId,
      doctorId: patient.doctorId,
      patientId: patient.id,
      updatedAt: now,
    },
    { merge: true },
  );
}

async function deleteDocumentRefs(refs: DocumentReference[]): Promise<void> {
  const dedupedRefs = [...new Map(refs.map((ref) => [ref.path, ref])).values()];

  for (let index = 0; index < dedupedRefs.length; index += 450) {
    const batch = adminDb.batch();
    dedupedRefs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function listInstitutionsForContext(
  context: AdminContext,
): Promise<InstitutionListItem[]> {
  const [institutions, doctors, patients, roleRecords] = await Promise.all([
    loadScopedInstitutionRecords(context),
    loadScopedDoctorRecords(context),
    loadScopedPatientRecords(context),
    loadScopedRoleRecords(context),
  ]);

  const doctorCounts = new Map<string, number>();
  doctors.forEach((doctor) => {
    doctorCounts.set(
      doctor.institutionId,
      (doctorCounts.get(doctor.institutionId) ?? 0) + 1,
    );
  });

  const patientCounts = new Map<string, number>();
  patients.forEach((patient) => {
    patientCounts.set(
      patient.institutionId,
      (patientCounts.get(patient.institutionId) ?? 0) + 1,
    );
  });

  const institutionAdminCounts = new Map<string, number>();
  const administrativeOperatorCounts = new Map<string, number>();
  const laboratoryStaffCounts = new Map<string, number>();
  roleRecords.forEach((record) => {
    if (
      !record.institutionId ||
      !record.isActive
    ) {
      return;
    }

    if (record.role === "institution_admin") {
      institutionAdminCounts.set(
        record.institutionId,
        (institutionAdminCounts.get(record.institutionId) ?? 0) + 1,
      );
    }
    if (record.role === "institution_operator") {
      administrativeOperatorCounts.set(
        record.institutionId,
        (administrativeOperatorCounts.get(record.institutionId) ?? 0) + 1,
      );
    }
    if (record.role === "institution_laboratory_staff") {
      laboratoryStaffCounts.set(
        record.institutionId,
        (laboratoryStaffCounts.get(record.institutionId) ?? 0) + 1,
      );
    }
  });

  return institutions
    .filter((institution) => canViewInstitution(context, institution.id))
    .map((institution) => ({
      ...institution,
      doctorCount: doctorCounts.get(institution.id) ?? 0,
      patientCount: patientCounts.get(institution.id) ?? 0,
      institutionAdminCount: institutionAdminCounts.get(institution.id) ?? 0,
      administrativeOperatorCount:
        administrativeOperatorCounts.get(institution.id) ?? 0,
      laboratoryStaffCount: laboratoryStaffCounts.get(institution.id) ?? 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createInstitutionForContext(
  context: AdminContext,
  payload: {
    code?: string;
    name: string;
    legalName?: string;
    contactEmail?: string;
    contactPhone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    country?: string;
    notes?: string;
  },
): Promise<InstitutionRecord> {
  if (!canCreateInstitution(context)) {
    throw new AdminRepositoryError(
      "Only full admins can create institutions.",
      403,
    );
  }

  const institutionId = await getNextEntityId("institution");
  const now = new Date().toISOString();
  const document = {
    id: institutionId,
    code: normalizeOptionalString(payload.code) ?? institutionId,
    name: normalizeRequiredString(payload.name, "Institution name"),
    legalName: normalizeOptionalString(payload.legalName) ?? null,
    contactEmail:
      normalizeOptionalString(payload.contactEmail)?.toLowerCase() ?? null,
    contactPhone: normalizeOptionalString(payload.contactPhone) ?? null,
    addressLine1: normalizeOptionalString(payload.addressLine1) ?? null,
    addressLine2: normalizeOptionalString(payload.addressLine2) ?? null,
    city: normalizeOptionalString(payload.city) ?? null,
    state: normalizeOptionalString(payload.state) ?? null,
    country: normalizeOptionalString(payload.country) ?? null,
    notes: normalizeOptionalString(payload.notes) ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await adminDb
    .collection(INSTITUTIONS_COLLECTION)
    .doc(institutionId)
    .set(document);

  return toInstitutionRecord(institutionId, document);
}

export async function getInstitutionDetailForContext(
  context: AdminContext,
  institutionId: string,
): Promise<InstitutionDetailRecord> {
  const institution = await ensureInstitutionExists(institutionId);
  if (!canViewInstitution(context, institution.id)) {
    throw new AdminRepositoryError("You cannot view this institution.", 403);
  }

  const [doctorSnapshot, patientSnapshot, roleSnapshot] = await Promise.all([
    adminDb
      .collection(DOCTORS_COLLECTION)
      .where("institutionId", "==", institutionId)
      .get(),
    adminDb
      .collection(PATIENTS_COLLECTION)
      .where("institutionId", "==", institutionId)
      .get(),
    context.role === "institution_laboratory_staff"
      ? Promise.resolve(null)
      : adminDb
          .collection(USER_ROLES_COLLECTION)
          .where("institutionId", "==", institutionId)
          .get(),
  ]);

  const patients = patientSnapshot.docs.map((doc) =>
    toPatientRecord(doc.id, doc.data() as Record<string, unknown>),
  );
  const patientCounts = new Map<string, number>();
  patients.forEach((patient) => {
    patientCounts.set(
      patient.doctorId,
      (patientCounts.get(patient.doctorId) ?? 0) + 1,
    );
  });

  const roleRecords = (roleSnapshot?.docs ?? []).map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      email: doc.id,
      role:
        data.role === "full_admin" ||
        data.role === "institution_admin" ||
        data.role === "institution_operator" ||
        data.role === "institution_laboratory_staff" ||
        data.role === "institution_doctor" ||
        data.role === "patient"
          ? data.role
          : "patient",
      institutionId: normalizeOptionalString(data.institutionId),
      doctorId: normalizeOptionalString(data.doctorId),
      patientId: normalizeOptionalString(data.patientId),
      isActive: typeof data.isActive === "boolean" ? data.isActive : true,
      displayName: normalizeOptionalString(data.displayName),
      notes: normalizeOptionalString(data.notes),
      createdAt:
        normalizeOptionalString(data.createdAt) ?? new Date().toISOString(),
      updatedAt:
        normalizeOptionalString(data.updatedAt) ?? new Date().toISOString(),
      createdByEmail: normalizeOptionalString(data.createdByEmail),
    } satisfies UserRoleRecord;
  });

  const doctorRoleById = new Map(
    roleRecords
      .filter(
        (record) => record.role === "institution_doctor" && record.doctorId,
      )
      .map((record) => [record.doctorId!, record]),
  );

  const doctors = doctorSnapshot.docs
    .map((doc) => toDoctorRecord(doc.id, doc.data() as Record<string, unknown>))
    .filter((doctor) => canViewDoctor(context, doctor))
    .map((doctor) =>
      toDoctorListItem(doctor, {
        institutionName: institution.name,
        patientCount: patientCounts.get(doctor.id) ?? 0,
        roleEmail: doctorRoleById.get(doctor.id)?.email,
        roleActive: doctorRoleById.get(doctor.id)?.isActive,
      }),
    )
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  const institutionAdmins = roleRecords
    .filter((record) => isInstitutionManagerRole(record.role))
    .map((record) =>
      toRoleManagementRecord(record, {
        institutionName: institution.name,
      }),
    )
    .sort((left, right) => left.email.localeCompare(right.email));

  return {
    institution: {
      ...institution,
      doctorCount: doctors.length,
      patientCount: patients.length,
      institutionAdminCount: institutionAdmins.filter(
        (record) => record.role === "institution_admin" && record.isActive,
      ).length,
      administrativeOperatorCount: institutionAdmins.filter(
        (record) => record.role === "institution_operator" && record.isActive,
      ).length,
      laboratoryStaffCount: institutionAdmins.filter(
        (record) =>
          record.role === "institution_laboratory_staff" && record.isActive,
      ).length,
    },
    doctors,
    institutionAdmins,
  };
}

export async function updateInstitutionForContext(
  context: AdminContext,
  institutionId: string,
  payload: {
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
  },
): Promise<InstitutionRecord> {
  const institution = await ensureInstitutionExists(institutionId);
  if (!canEditInstitution(context, institution.id)) {
    throw new AdminRepositoryError("You cannot edit this institution.", 403);
  }

  const document = {
    ...institution,
    code: hasOwnKey(payload, "code")
      ? (normalizeOptionalString(payload.code) ?? institution.code)
      : institution.code,
    name: hasOwnKey(payload, "name")
      ? (normalizeOptionalString(payload.name) ?? institution.name)
      : institution.name,
    legalName: hasOwnKey(payload, "legalName")
      ? (normalizeOptionalString(payload.legalName) ?? null)
      : (institution.legalName ?? null),
    contactEmail: hasOwnKey(payload, "contactEmail")
      ? (normalizeOptionalString(payload.contactEmail)?.toLowerCase() ?? null)
      : (institution.contactEmail ?? null),
    contactPhone: hasOwnKey(payload, "contactPhone")
      ? (normalizeOptionalString(payload.contactPhone) ?? null)
      : (institution.contactPhone ?? null),
    addressLine1: hasOwnKey(payload, "addressLine1")
      ? (normalizeOptionalString(payload.addressLine1) ?? null)
      : (institution.addressLine1 ?? null),
    addressLine2: hasOwnKey(payload, "addressLine2")
      ? (normalizeOptionalString(payload.addressLine2) ?? null)
      : (institution.addressLine2 ?? null),
    city: hasOwnKey(payload, "city")
      ? (normalizeOptionalString(payload.city) ?? null)
      : (institution.city ?? null),
    state: hasOwnKey(payload, "state")
      ? (normalizeOptionalString(payload.state) ?? null)
      : (institution.state ?? null),
    country: hasOwnKey(payload, "country")
      ? (normalizeOptionalString(payload.country) ?? null)
      : (institution.country ?? null),
    notes: hasOwnKey(payload, "notes")
      ? (normalizeOptionalString(payload.notes) ?? null)
      : (institution.notes ?? null),
    updatedAt: new Date().toISOString(),
  };

  await adminDb
    .collection(INSTITUTIONS_COLLECTION)
    .doc(institutionId)
    .set(document, {
      merge: true,
    });

  return toInstitutionRecord(institutionId, document);
}

export async function deleteInstitutionForContext(
  context: AdminContext,
  institutionId: string,
): Promise<{
  success: true;
  deleted: {
    institutions: number;
    doctors: number;
    patients: number;
    roles: number;
  };
}> {
  const institution = await ensureInstitutionExists(institutionId);
  if (!canDeleteInstitution(context, institution.id)) {
    throw new AdminRepositoryError("You cannot delete this institution.", 403);
  }

  const [doctorSnapshot, patientSnapshot, roleSnapshot] = await Promise.all([
    adminDb
      .collection(DOCTORS_COLLECTION)
      .where("institutionId", "==", institution.id)
      .get(),
    adminDb
      .collection(PATIENTS_COLLECTION)
      .where("institutionId", "==", institution.id)
      .get(),
    adminDb
      .collection(USER_ROLES_COLLECTION)
      .where("institutionId", "==", institution.id)
      .get(),
  ]);

  await deleteDocumentRefs([
    adminDb.collection(INSTITUTIONS_COLLECTION).doc(institution.id),
    ...doctorSnapshot.docs.map((doc) => doc.ref),
    ...patientSnapshot.docs.map((doc) => doc.ref),
    ...roleSnapshot.docs.map((doc) => doc.ref),
  ]);

  return {
    success: true,
    deleted: {
      institutions: 1,
      doctors: doctorSnapshot.size,
      patients: patientSnapshot.size,
      roles: roleSnapshot.size,
    },
  };
}

export async function listDoctorsForContext(
  context: AdminContext,
  filters?: {
    institutionId?: string;
  },
): Promise<DoctorListItem[]> {
  const [institutions, doctors, patients, roles] = await Promise.all([
    loadScopedInstitutionRecords(context),
    loadScopedDoctorRecords(context),
    loadScopedPatientRecords(context),
    loadScopedRoleRecords(context),
  ]);

  const institutionNameById = new Map(
    institutions.map((institution) => [institution.id, institution.name]),
  );
  const patientCounts = new Map<string, number>();
  patients.forEach((patient) => {
    patientCounts.set(
      patient.doctorId,
      (patientCounts.get(patient.doctorId) ?? 0) + 1,
    );
  });
  const doctorRoleById = new Map(
    roles
      .filter(
        (record) => record.role === "institution_doctor" && record.doctorId,
      )
      .map((record) => [record.doctorId!, record]),
  );

  return doctors
    .filter((doctor) => {
      if (!filters?.institutionId) {
        return true;
      }

      return doctor.institutionId === filters.institutionId;
    })
    .map((doctor) =>
      toDoctorListItem(doctor, {
        institutionName: institutionNameById.get(doctor.institutionId),
        patientCount: patientCounts.get(doctor.id) ?? 0,
        roleEmail: doctorRoleById.get(doctor.id)?.email,
        roleActive: doctorRoleById.get(doctor.id)?.isActive,
      }),
    )
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
}

export async function createDoctorForContext(
  context: AdminContext,
  payload: {
    institutionId: string;
    authEmail: string;
    authUid?: string;
    fullName: string;
    specialty?: string;
    licenseNumber?: string;
    contactPhone?: string;
    status?: "active" | "inactive";
    notes?: string;
  },
): Promise<DoctorRecord> {
  const institutionId = isInstitutionManagerRole(context.role)
    ? (context.institutionId ?? payload.institutionId)
    : payload.institutionId;

  if (!institutionId || !canCreateDoctor(context, institutionId)) {
    throw new AdminRepositoryError(
      "You cannot create doctors in this institution.",
      403,
    );
  }

  await ensureInstitutionExists(institutionId);

  const doctorId = await getNextEntityId("doctor");
  const now = new Date().toISOString();
  const document = {
    id: doctorId,
    institutionId,
    authEmail: normalizeRoleEmail(
      normalizeRequiredString(payload.authEmail, "Doctor auth email"),
    ),
    authUid: normalizeOptionalString(payload.authUid) ?? null,
    fullName: normalizeRequiredString(payload.fullName, "Doctor full name"),
    specialty: normalizeOptionalString(payload.specialty) ?? null,
    licenseNumber: normalizeOptionalString(payload.licenseNumber) ?? null,
    contactPhone: normalizeOptionalString(payload.contactPhone) ?? null,
    status: normalizeStatus(payload.status),
    notes: normalizeOptionalString(payload.notes) ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await adminDb.collection(DOCTORS_COLLECTION).doc(doctorId).set(document);

  return toDoctorRecord(doctorId, document);
}

export async function getDoctorDetailForContext(
  context: AdminContext,
  doctorId: string,
): Promise<DoctorDetailRecord> {
  const doctor = await ensureDoctorExists(doctorId);
  if (!canViewDoctor(context, doctor)) {
    throw new AdminRepositoryError("You cannot view this doctor.", 403);
  }

  const [institution, patientSnapshot, roleSnapshot] = await Promise.all([
    getInstitutionById(doctor.institutionId),
    adminDb
      .collection(PATIENTS_COLLECTION)
      .where("institutionId", "==", doctor.institutionId)
      .get(),
    adminDb
      .collection(USER_ROLES_COLLECTION)
      .where("doctorId", "==", doctor.id)
      .get(),
  ]);

  const patients = patientSnapshot.docs
    .map((doc) =>
      toPatientRecord(doc.id, doc.data() as Record<string, unknown>),
    )
    .filter(
      (patient) =>
        patient.doctorId === doctor.id && canViewPatient(context, patient),
    )
    .map((patient) =>
      toPatientListItem(patient, {
        institutionName: institution?.name,
        doctorName: doctor.fullName,
        doctorEmail: doctor.authEmail,
      }),
    )
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  const roleRecord = roleSnapshot.empty
    ? null
    : (() => {
        const roleDocument = roleSnapshot.docs[0]!;
        const data = roleDocument.data() as Record<string, unknown>;
        const record = {
          email: roleDocument.id,
          role:
            data.role === "full_admin" ||
            data.role === "institution_admin" ||
            data.role === "institution_operator" ||
            data.role === "institution_laboratory_staff" ||
            data.role === "institution_doctor" ||
            data.role === "patient"
              ? data.role
              : "patient",
          institutionId: normalizeOptionalString(data.institutionId),
          doctorId: normalizeOptionalString(data.doctorId),
          patientId: normalizeOptionalString(data.patientId),
          isActive: typeof data.isActive === "boolean" ? data.isActive : true,
          displayName: normalizeOptionalString(data.displayName),
          notes: normalizeOptionalString(data.notes),
          createdAt:
            normalizeOptionalString(data.createdAt) ?? new Date().toISOString(),
          updatedAt:
            normalizeOptionalString(data.updatedAt) ?? new Date().toISOString(),
          createdByEmail: normalizeOptionalString(data.createdByEmail),
        } satisfies UserRoleRecord;

        return toRoleManagementRecord(record, {
          institutionName: institution?.name,
          doctorName: doctor.fullName,
        });
      })();

  return {
    doctor: toDoctorListItem(doctor, {
      institutionName: institution?.name,
      patientCount: patients.length,
      roleEmail: roleRecord?.email,
      roleActive: roleRecord?.isActive,
    }),
    institution,
    patients,
    roleRecord,
  };
}

export async function updateDoctorForContext(
  context: AdminContext,
  doctorId: string,
  payload: {
    authEmail?: string;
    authUid?: string;
    fullName?: string;
    specialty?: string;
    licenseNumber?: string;
    contactPhone?: string;
    status?: "active" | "inactive";
    notes?: string;
  },
): Promise<DoctorRecord> {
  const doctor = await ensureDoctorExists(doctorId);
  if (!canEditDoctor(context, doctor)) {
    throw new AdminRepositoryError("You cannot edit this doctor.", 403);
  }

  const previousEmail = doctor.authEmail;
  const updatedDoctor: DoctorRecord = {
    ...doctor,
    authEmail: hasOwnKey(payload, "authEmail")
      ? normalizeRoleEmail(payload.authEmail ?? "")
      : doctor.authEmail,
    authUid: hasOwnKey(payload, "authUid")
      ? normalizeOptionalString(payload.authUid)
      : doctor.authUid,
    fullName: hasOwnKey(payload, "fullName")
      ? (normalizeOptionalString(payload.fullName) ?? doctor.fullName)
      : doctor.fullName,
    specialty: hasOwnKey(payload, "specialty")
      ? normalizeOptionalString(payload.specialty)
      : doctor.specialty,
    licenseNumber: hasOwnKey(payload, "licenseNumber")
      ? normalizeOptionalString(payload.licenseNumber)
      : doctor.licenseNumber,
    contactPhone: hasOwnKey(payload, "contactPhone")
      ? normalizeOptionalString(payload.contactPhone)
      : doctor.contactPhone,
    status: hasOwnKey(payload, "status")
      ? normalizeStatus(payload.status)
      : doctor.status,
    notes: hasOwnKey(payload, "notes")
      ? normalizeOptionalString(payload.notes)
      : doctor.notes,
    updatedAt: new Date().toISOString(),
  };

  if (!updatedDoctor.authEmail) {
    throw new AdminRepositoryError("Doctor auth email is required.", 400);
  }

  await adminDb
    .collection(DOCTORS_COLLECTION)
    .doc(doctorId)
    .set(updatedDoctor, {
      merge: true,
    });
  await syncDoctorRoleRecord(updatedDoctor, previousEmail);

  return updatedDoctor;
}

export async function deleteDoctorForContext(
  context: AdminContext,
  doctorId: string,
): Promise<{
  success: true;
  deleted: {
    doctors: number;
    patients: number;
    roles: number;
  };
}> {
  const doctor = await ensureDoctorExists(doctorId);
  if (!canDeleteDoctor(context, doctor)) {
    throw new AdminRepositoryError("You cannot delete this doctor.", 403);
  }

  const [patientSnapshot, roleSnapshot] = await Promise.all([
    adminDb
      .collection(PATIENTS_COLLECTION)
      .where("doctorId", "==", doctor.id)
      .get(),
    adminDb
      .collection(USER_ROLES_COLLECTION)
      .where("doctorId", "==", doctor.id)
      .get(),
  ]);

  await deleteDocumentRefs([
    adminDb.collection(DOCTORS_COLLECTION).doc(doctor.id),
    ...patientSnapshot.docs.map((doc) => doc.ref),
    ...roleSnapshot.docs.map((doc) => doc.ref),
  ]);

  return {
    success: true,
    deleted: {
      doctors: 1,
      patients: patientSnapshot.size,
      roles: roleSnapshot.size,
    },
  };
}

export async function listPatientsForContext(
  context: AdminContext,
  filters?: {
    institutionId?: string;
    doctorId?: string;
    query?: string;
  },
): Promise<PatientListItem[]> {
  const [institutions, doctors, patients] = await Promise.all([
    loadScopedInstitutionRecords(context),
    loadScopedDoctorRecords(context),
    loadScopedPatientRecords(context),
  ]);

  const institutionNameById = new Map(
    institutions.map((institution) => [institution.id, institution.name]),
  );
  const doctorById = new Map(doctors.map((doctor) => [doctor.id, doctor]));
  const normalizedQuery = filters?.query?.trim().toLowerCase() ?? "";

  return patients
    .filter((patient) => {
      if (
        filters?.institutionId &&
        patient.institutionId !== filters.institutionId
      ) {
        return false;
      }

      if (filters?.doctorId && patient.doctorId !== filters.doctorId) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const doctor = doctorById.get(patient.doctorId);
      const haystack = [
        patient.id,
        patient.fullName,
        patient.email,
        patient.medicalRecordNumber,
        institutionNameById.get(patient.institutionId),
        doctor?.fullName,
        doctor?.authEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    })
    .map((patient) =>
      toPatientListItem(patient, {
        institutionName: institutionNameById.get(patient.institutionId),
        doctorName: doctorById.get(patient.doctorId)?.fullName,
        doctorEmail: doctorById.get(patient.doctorId)?.authEmail,
      }),
    )
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
}

export async function createPatientForContext(
  context: AdminContext,
  payload: {
    institutionId: string;
    doctorId: string;
    email: string;
    fullName: string;
    medicalRecordNumber?: string;
    birthDate?: string;
    sex?: string;
    status?: "active" | "inactive";
    notes?: string;
    additionalInformation?: Record<string, unknown>;
  },
): Promise<PatientRecord> {
  const institutionId =
    isInstitutionManagerRole(context.role) ||
    context.role === "institution_doctor"
      ? (context.institutionId ?? payload.institutionId)
      : payload.institutionId;
  const doctorId =
    context.role === "institution_doctor"
      ? (context.doctorId ?? payload.doctorId)
      : payload.doctorId;

  if (
    !institutionId ||
    !doctorId ||
    !canCreatePatient(context, institutionId, doctorId)
  ) {
    throw new AdminRepositoryError(
      "You cannot create patients in this scope.",
      403,
    );
  }

  await ensureInstitutionExists(institutionId);
  await validateDoctorInstitutionLink(institutionId, doctorId);

  const patientId = await getNextEntityId("patient");
  const now = new Date().toISOString();
  const document = {
    id: patientId,
    institutionId,
    doctorId,
    email: normalizeRoleEmail(
      normalizeRequiredString(payload.email, "Patient email"),
    ),
    fullName: normalizeRequiredString(payload.fullName, "Patient full name"),
    medicalRecordNumber:
      normalizeOptionalString(payload.medicalRecordNumber) ?? null,
    birthDate: normalizeIsoDateString(payload.birthDate) ?? null,
    sex: normalizeSex(payload.sex) ?? null,
    status: normalizeStatus(payload.status),
    notes: normalizeOptionalString(payload.notes) ?? null,
    additionalInformation:
      normalizeOptionalRecord(payload.additionalInformation) ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await adminDb.collection(PATIENTS_COLLECTION).doc(patientId).set(document);

  return toPatientRecord(patientId, document);
}

export async function getPatientDetailForContext(
  context: AdminContext,
  patientId: string,
): Promise<PatientDetailRecord> {
  const patient = await ensurePatientExists(patientId);
  if (!canViewPatient(context, patient)) {
    throw new AdminRepositoryError("You cannot view this patient.", 403);
  }

  const [institution, doctor, roleRecord] = await Promise.all([
    getInstitutionById(patient.institutionId),
    patient.doctorId ? getDoctorById(patient.doctorId) : null,
    getUserRoleByEmail(patient.email),
  ]);

  return {
    patient: toPatientListItem(patient, {
      institutionName: institution?.name,
      doctorName: doctor?.fullName,
      doctorEmail: doctor?.authEmail,
    }),
    institution,
    doctor: doctor
      ? toDoctorListItem(doctor, {
          institutionName: institution?.name,
        })
      : null,
    roleRecord: roleRecord
      ? toRoleManagementRecord(roleRecord, {
          institutionName: institution?.name,
          doctorName: doctor?.fullName,
          patientName: patient.fullName,
        })
      : null,
  };
}

export async function updatePatientForContext(
  context: AdminContext,
  patientId: string,
  payload: {
    institutionId?: string;
    doctorId?: string;
    email?: string;
    fullName?: string;
    medicalRecordNumber?: string;
    birthDate?: string;
    sex?: string;
    status?: "active" | "inactive";
    notes?: string;
  },
): Promise<PatientRecord> {
  const patient = await ensurePatientExists(patientId);
  if (!canEditPatient(context, patient)) {
    throw new AdminRepositoryError("You cannot edit this patient.", 403);
  }

  const institutionId =
    normalizeOptionalString(payload.institutionId) ?? patient.institutionId;
  const doctorId =
    normalizeOptionalString(payload.doctorId) ?? patient.doctorId;

  await ensureInstitutionExists(institutionId);
  const doctor = await validateDoctorInstitutionLink(institutionId, doctorId);

  if (!canCreatePatient(context, institutionId, doctorId)) {
    throw new AdminRepositoryError(
      "You cannot move this patient outside your allowed scope.",
      403,
    );
  }

  const updatedPatient: PatientRecord = {
    ...patient,
    institutionId,
    doctorId,
    email: hasOwnKey(payload, "email")
      ? normalizeRoleEmail(payload.email ?? "")
      : patient.email,
    fullName: hasOwnKey(payload, "fullName")
      ? (normalizeOptionalString(payload.fullName) ?? patient.fullName)
      : patient.fullName,
    medicalRecordNumber: hasOwnKey(payload, "medicalRecordNumber")
      ? normalizeOptionalString(payload.medicalRecordNumber)
      : patient.medicalRecordNumber,
    birthDate: hasOwnKey(payload, "birthDate")
      ? normalizeIsoDateString(payload.birthDate)
      : patient.birthDate,
    sex: hasOwnKey(payload, "sex") ? normalizeSex(payload.sex) : patient.sex,
    status: hasOwnKey(payload, "status")
      ? normalizeStatus(payload.status)
      : patient.status,
    notes: hasOwnKey(payload, "notes")
      ? normalizeOptionalString(payload.notes)
      : patient.notes,
    updatedAt: new Date().toISOString(),
  };

  if (!updatedPatient.email) {
    throw new AdminRepositoryError("Patient email is required.", 400);
  }

  const patientWriteDocument: Record<string, unknown> = { ...updatedPatient };
  if (hasOwnKey(payload, "birthDate") && !updatedPatient.birthDate) {
    patientWriteDocument.birthDate = FieldValue.delete();
  }

  await adminDb
    .collection(PATIENTS_COLLECTION)
    .doc(patientId)
    .set(patientWriteDocument, {
      merge: true,
    });
  await syncPatientRoleRecord(updatedPatient);

  return {
    ...updatedPatient,
    institutionId: doctor.institutionId,
  };
}

export async function deletePatientForContext(
  context: AdminContext,
  patientId: string,
): Promise<{ success: true }> {
  const patient = await ensurePatientExists(patientId);
  if (!canDeletePatient(context, patient)) {
    throw new AdminRepositoryError("You cannot delete this patient.", 403);
  }

  const roleSnapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .where("patientId", "==", patient.id)
    .get();

  await deleteDocumentRefs([
    adminDb.collection(PATIENTS_COLLECTION).doc(patient.id),
    ...roleSnapshot.docs.map((doc) => doc.ref),
  ]);

  return { success: true };
}
