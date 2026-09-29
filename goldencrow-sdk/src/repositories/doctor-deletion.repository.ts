import type { DocumentReference } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { isGlobalAdminRole } from "../lib/admin-roles.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { canDeleteDoctor, normalizeRoleEmail } from "./roles.repository.js";
import {
  TWO_PQ_CASE_DELETION_STEPS,
  deleteTwoPQCaseStepForContext,
} from "./two-pq-case-deletion.repository.js";

const adminDb = adminDbFor("mydnamap");

const DOCTORS_COLLECTION = "doctors";
const PATIENTS_COLLECTION = "patients";
const CASES_COLLECTION = "2pq_case";
const USER_ROLES_COLLECTION = "user_roles";

export const DOCTOR_DELETION_STEPS = [
  "cases",
  "patients",
  "report_owner",
  "object_owner",
  "role",
  "doctor",
] as const;

export type DoctorDeletionStep = (typeof DOCTOR_DELETION_STEPS)[number];
export type DoctorDeletionScope = "doctor" | "full";

export interface DoctorDeletionStepResult {
  step: DoctorDeletionStep;
  status: "deleted" | "not_found";
  deletedCount: number;
  message: string;
  details?: string[];
  hasMore?: boolean;
}

type DoctorDeletionTarget = {
  id: string;
  ref: DocumentReference;
  authEmail?: string;
  authUid?: string;
};

type DoctorRoleDocument = {
  id: string;
  ref: DocumentReference;
  data: Record<string, unknown>;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function doctorDeletionTarget(
  context: AdminContext,
  doctorId: string,
): Promise<DoctorDeletionTarget> {
  const normalizedDoctorId = doctorId.trim();
  if (!normalizedDoctorId || normalizedDoctorId.includes("/")) {
    throw new AdminRepositoryError("A valid doctor id is required.", 400);
  }

  const ref = adminDb.collection(DOCTORS_COLLECTION).doc(normalizedDoctorId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Doctor not found.", 404);
  }

  const data = (snapshot.data() ?? {}) as Record<string, unknown>;
  const institutionId = optionalString(data.institutionId);
  if (!institutionId) {
    throw new AdminRepositoryError("Doctor institution data is invalid.", 500);
  }
  if (!canDeleteDoctor(context, { institutionId })) {
    throw new AdminRepositoryError("You cannot delete this doctor.", 403);
  }

  return {
    id: snapshot.id,
    ref,
    authEmail: optionalString(data.authEmail),
    authUid: optionalString(data.authUid),
  };
}

function requireFullCleanup(context: AdminContext) {
  if (!isGlobalAdminRole(context.role)) {
    throw new AdminRepositoryError(
      "Only full admins and 2PQ admins can run the full doctor cleanup.",
      403,
    );
  }
}

async function doctorRoleDocuments(doctorId: string) {
  const snapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .where("doctorId", "==", doctorId)
    .get();

  return snapshot.docs
    .map((document) => ({
      id: document.id,
      ref: document.ref,
      data: (document.data() ?? {}) as Record<string, unknown>,
    }))
    .filter(
      (document): document is DoctorRoleDocument =>
        document.data.role === "institution_doctor",
    );
}

async function deleteDocumentRefs(refs: DocumentReference[]) {
  const uniqueRefs = [...new Map(refs.map((ref) => [ref.path, ref])).values()];
  for (let index = 0; index < uniqueRefs.length; index += 450) {
    const batch = adminDb.batch();
    uniqueRefs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return uniqueRefs.length;
}

async function ownerAccountRefs(
  collection: "report_owners" | "object_owners",
  target: DoctorDeletionTarget,
  roles: DoctorRoleDocument[],
) {
  const refs = new Map<string, DocumentReference>();
  const ownerIds = new Set<string>([target.id]);
  const emails = new Set<string>();

  if (target.authUid) ownerIds.add(target.authUid);
  if (target.authEmail) emails.add(normalizeRoleEmail(target.authEmail));
  for (const role of roles) {
    const firebaseUid = optionalString(role.data.firebaseUid);
    const communityUserId = optionalString(role.data.communityUserId);
    const roleEmail =
      optionalString(role.data.email) ?? optionalString(role.id);
    if (firebaseUid) ownerIds.add(firebaseUid);
    if (communityUserId) ownerIds.add(communityUserId);
    if (roleEmail) emails.add(normalizeRoleEmail(roleEmail));
  }

  for (const ownerId of ownerIds) {
    const ref = adminDb.collection(collection).doc(ownerId);
    const snapshot = await ref.get();
    if (snapshot.exists) refs.set(ref.path, ref);
  }

  for (const email of emails) {
    if (!email) continue;
    const snapshot = await adminDb
      .collection(collection)
      .where("owner_contact_email", "==", email)
      .limit(11)
      .get();
    if (snapshot.docs.length > 10) {
      throw new AdminRepositoryError(
        `Too many ${collection} accounts match ${email}.`,
        409,
      );
    }
    snapshot.docs.forEach((document) => refs.set(document.ref.path, document.ref));
  }

  return [...refs.values()];
}

function emptyResult(
  step: DoctorDeletionStep,
  message: string,
): DoctorDeletionStepResult {
  return { step, status: "not_found", deletedCount: 0, message };
}

async function deleteNextDoctorCase(
  context: AdminContext,
  target: DoctorDeletionTarget,
): Promise<DoctorDeletionStepResult> {
  const snapshot = await adminDb
    .collection(CASES_COLLECTION)
    .where("doctorId", "==", target.id)
    .limit(2)
    .get();
  const currentCase = snapshot.docs[0];
  if (!currentCase) {
    return emptyResult("cases", "No linked 2PQ cases were available.");
  }

  const details: string[] = [];
  for (const caseStep of TWO_PQ_CASE_DELETION_STEPS) {
    const result = await deleteTwoPQCaseStepForContext(
      context,
      currentCase.id,
      "related",
      caseStep,
    );
    details.push(`${caseStep}: ${result.message}`);
  }

  return {
    step: "cases",
    status: "deleted",
    deletedCount: 1,
    message: `Deleted linked 2PQ case ${currentCase.id} and its related artifacts.`,
    details,
    hasMore: snapshot.docs.length > 1,
  };
}

async function deleteNextDoctorPatient(
  target: DoctorDeletionTarget,
): Promise<DoctorDeletionStepResult> {
  const snapshot = await adminDb
    .collection(PATIENTS_COLLECTION)
    .where("doctorId", "==", target.id)
    .limit(2)
    .get();
  const patient = snapshot.docs[0];
  if (!patient) {
    return emptyResult("patients", "No linked patient records were available.");
  }

  const roleSnapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .where("patientId", "==", patient.id)
    .get();
  await deleteDocumentRefs([
    patient.ref,
    ...roleSnapshot.docs.map((document) => document.ref),
  ]);

  return {
    step: "patients",
    status: "deleted",
    deletedCount: 1,
    message: `Deleted patient ${patient.id} and ${roleSnapshot.docs.length} linked patient role assignment(s).`,
    details: [`${roleSnapshot.docs.length} patient role assignment(s) deleted`],
    hasMore: snapshot.docs.length > 1,
  };
}

async function deleteDoctorOwnerAccounts(
  step: "report_owner" | "object_owner",
  target: DoctorDeletionTarget,
) {
  const roles = await doctorRoleDocuments(target.id);
  const collection =
    step === "report_owner" ? "report_owners" : "object_owners";
  const refs = await ownerAccountRefs(collection, target, roles);
  const deletedCount = await deleteDocumentRefs(refs);
  const label = step === "report_owner" ? "report owner" : "object owner";

  return {
    step,
    status: deletedCount > 0 ? "deleted" : "not_found",
    deletedCount,
    message:
      deletedCount > 0
        ? `Deleted ${deletedCount} ${label} account(s). Associated codes and uploaded records were not queried, deleted, or reassigned.`
        : `No ${label} account was available.`,
    details:
      deletedCount > 0
        ? ["Associated codes and uploaded records preserved"]
        : undefined,
  } satisfies DoctorDeletionStepResult;
}

async function deleteDoctorRoles(target: DoctorDeletionTarget) {
  const roles = await doctorRoleDocuments(target.id);
  const deletedCount = await deleteDocumentRefs(roles.map((role) => role.ref));
  return {
    step: "role",
    status: deletedCount > 0 ? "deleted" : "not_found",
    deletedCount,
    message:
      deletedCount > 0
        ? `Deleted ${deletedCount} doctor role assignment(s).`
        : "No doctor role assignment was available.",
  } satisfies DoctorDeletionStepResult;
}

async function assertFullCleanupCompleted(target: DoctorDeletionTarget) {
  const [cases, patients, roles] = await Promise.all([
    adminDb
      .collection(CASES_COLLECTION)
      .where("doctorId", "==", target.id)
      .limit(1)
      .get(),
    adminDb
      .collection(PATIENTS_COLLECTION)
      .where("doctorId", "==", target.id)
      .limit(1)
      .get(),
    doctorRoleDocuments(target.id),
  ]);
  if (cases.docs.length > 0 || patients.docs.length > 0 || roles.length > 0) {
    throw new AdminRepositoryError(
      "The doctor still has linked cases, patients, or a role assignment. Complete the earlier cleanup stages before deleting the doctor.",
      409,
    );
  }

  const [reportOwners, objectOwners] = await Promise.all([
    ownerAccountRefs("report_owners", target, []),
    ownerAccountRefs("object_owners", target, []),
  ]);
  if (reportOwners.length > 0 || objectOwners.length > 0) {
    throw new AdminRepositoryError(
      "The doctor still has a report owner or object owner account. Complete the owner cleanup stages first.",
      409,
    );
  }
}

export async function deleteDoctorStepForContext(
  context: AdminContext,
  doctorId: string,
  scope: DoctorDeletionScope,
  step: DoctorDeletionStep,
): Promise<DoctorDeletionStepResult> {
  const target = await doctorDeletionTarget(context, doctorId);

  if (scope === "doctor" && step !== "doctor") {
    throw new AdminRepositoryError(
      `Cleanup step ${step} is not available when deleting only the doctor.`,
      400,
    );
  }
  if (scope === "full") requireFullCleanup(context);

  if (step === "cases") return deleteNextDoctorCase(context, target);
  if (step === "patients") return deleteNextDoctorPatient(target);
  if (step === "report_owner") {
    return deleteDoctorOwnerAccounts(step, target);
  }
  if (step === "object_owner") {
    return deleteDoctorOwnerAccounts(step, target);
  }
  if (step === "role") return deleteDoctorRoles(target);

  if (scope === "full") await assertFullCleanupCompleted(target);
  await target.ref.delete();
  return {
    step: "doctor",
    status: "deleted",
    deletedCount: 1,
    message:
      scope === "full"
        ? `Deleted doctor ${target.id} after the full cleanup completed.`
        : `Deleted only doctor ${target.id}. Linked patients, cases, owner accounts, and role assignments were preserved.`,
  };
}
