import { adminAuthFor, adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");
import { TEAM_ALLOWLIST, resolveProjectAccess } from "../config/env.js";
import { AdminRepositoryError } from "./admin-errors.js";
import {
  canAccessBackoffice,
  canAccessPatientPortal,
  canAccessPGFlex,
  canAccessPublisherPortal,
  canRoleAccessBackoffice,
  resolveRequiredAuthSurface,
} from "../lib/access-surfaces.js";
import type {
  AdminContext,
  AdminRole,
  DoctorRecord,
  PatientRecord,
  PGFlexTransportDispatcherOption,
  ProjectKey,
  RoleManagementRecord,
  UserRoleRecord,
} from "../types/sdk.types.js";
import {
  generatePatientTemporaryPassword,
  provisionPatientFirebaseAccount,
} from "../lib/patient-portal-credentials.js";
import { sendPGFlexDispatcherInviteEmail } from "../lib/pgflex-dispatcher-email.js";
import { sendPublisherPortalInviteEmail } from "../lib/publisher-portal-email.js";

const USER_ROLES_COLLECTION = "user_roles";
const FEED_ORGANIZATIONS_COLLECTION = "feed_organizations";
const FEED_INDIVIDUALS_COLLECTION = "feed_individuals";
const BOOTSTRAP_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const ROLE_ASSIGNMENT_TREE: Record<AdminRole, AdminRole[]> = {
  full_admin: [
    "full_admin",
    "organization_publisher",
    "individual_publisher",
    "transport_dispatcher",
    "institution_admin",
    "institution_operator",
    "institution_laboratory_staff",
    "institution_doctor",
    "patient",
  ],
  institution_admin: [
    "institution_admin",
    "institution_operator",
    "institution_laboratory_staff",
    "institution_doctor",
    "patient",
  ],
  institution_operator: [
    "institution_operator",
    "institution_laboratory_staff",
    "institution_doctor",
    "patient",
  ],
  institution_laboratory_staff: [],
  institution_doctor: ["patient"],
  organization_publisher: [],
  individual_publisher: [],
  transport_dispatcher: [],
  patient: [],
};

function isInstitutionManagerRole(role: AdminRole) {
  return (
    role === "institution_admin" ||
    role === "institution_operator" ||
    role === "institution_laboratory_staff"
  );
}

export function normalizeRoleEmail(email: string) {
  return email.trim().toLowerCase();
}

function resolveBackofficeProjectAccess(
  email: string,
  options?: { includeMydnamap?: boolean },
): ProjectKey[] {
  const projectAccess = new Set<ProjectKey>(resolveProjectAccess(email));
  if (options?.includeMydnamap) {
    projectAccess.add("mydnamap");
  }
  return [...projectAccess];
}

export interface BackofficeEmailAccess {
  email: string;
  roleRecord: UserRoleRecord | null;
  viaAllowlist: boolean;
  viaRoleAssignment: boolean;
  canAccessBackoffice: boolean;
  canAccessPatientPortal: boolean;
  canAccessPGFlex: boolean;
  canAccessPublisherPortal: boolean;
  projectAccess: ProjectKey[];
}

export async function getBackofficeEmailAccess(
  email: string,
): Promise<BackofficeEmailAccess> {
  const normalizedEmail = normalizeRoleEmail(email);
  const roleRecord = normalizedEmail
    ? await getUserRoleByEmail(normalizedEmail)
    : null;
  const viaAllowlist = normalizedEmail
    ? TEAM_ALLOWLIST.has(normalizedEmail)
    : false;
  const viaRoleAssignment = canRoleAccessBackoffice(roleRecord);
  const hasBackofficeAccess = canAccessBackoffice(roleRecord, viaAllowlist);
  const hasPatientPortalAccess = canAccessPatientPortal(
    roleRecord,
    viaAllowlist,
  );
  const hasPGFlexAccess = canAccessPGFlex(roleRecord, viaAllowlist);
  const hasPublisherPortalAccess = canAccessPublisherPortal(
    roleRecord,
    viaAllowlist,
  );

  return {
    email: normalizedEmail,
    roleRecord,
    viaAllowlist,
    viaRoleAssignment,
    canAccessBackoffice: hasBackofficeAccess,
    canAccessPatientPortal: hasPatientPortalAccess,
    canAccessPGFlex: hasPGFlexAccess,
    canAccessPublisherPortal: hasPublisherPortalAccess,
    projectAccess: normalizedEmail
      ? resolveBackofficeProjectAccess(normalizedEmail, {
          includeMydnamap:
            hasBackofficeAccess ||
            hasPatientPortalAccess ||
            hasPGFlexAccess ||
            hasPublisherPortalAccess,
        })
      : [],
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeDateString(value: unknown) {
  const normalized = normalizeOptionalString(value);
  return normalized ?? new Date().toISOString();
}

function toBootstrapRoleRecord(email: string): UserRoleRecord {
  return {
    email,
    role: "full_admin",
    isActive: true,
    canAccessPatientPortal: false,
    createdAt: BOOTSTRAP_TIMESTAMP,
    updatedAt: BOOTSTRAP_TIMESTAMP,
  };
}

function isAdminRole(value: string): value is AdminRole {
  return (
    value === "full_admin" ||
    value === "organization_publisher" ||
    value === "individual_publisher" ||
    value === "transport_dispatcher" ||
    value === "institution_admin" ||
    value === "institution_operator" ||
    value === "institution_laboratory_staff" ||
    value === "institution_doctor" ||
    value === "patient"
  );
}

function toUserRoleRecord(
  email: string,
  data: Record<string, unknown>,
): UserRoleRecord {
  const role = normalizeOptionalString(data.role);
  const resolvedRole: AdminRole = isAdminRole(role ?? "")
    ? (role as AdminRole)
    : "patient";

  return {
    email,
    role: resolvedRole,
    firebaseUid: normalizeOptionalString(data.firebaseUid),
    organizationId: normalizeOptionalString(data.organizationId),
    individualId: normalizeOptionalString(data.individualId),
    institutionId: normalizeOptionalString(data.institutionId),
    doctorId: normalizeOptionalString(data.doctorId),
    patientId: normalizeOptionalString(data.patientId),
    isActive: normalizeBoolean(data.isActive, true),
    canAccessPatientPortal: normalizeBoolean(
      data.canAccessPatientPortal,
      false,
    ),
    is_preferred_asignee: normalizeBoolean(data.is_preferred_asignee, false),
    displayName: normalizeOptionalString(data.displayName),
    contactPhone: normalizeOptionalString(data.contactPhone),
    notes: normalizeOptionalString(data.notes),
    createdAt: normalizeDateString(data.createdAt),
    updatedAt: normalizeDateString(data.updatedAt),
    createdByEmail: normalizeOptionalString(data.createdByEmail),
    pgflexInviteEmailSentAt: normalizeOptionalString(
      data.pgflexInviteEmailSentAt,
    ),
    pgflexInviteEmailFailedAt: normalizeOptionalString(
      data.pgflexInviteEmailFailedAt,
    ),
    pgflexInviteEmailLastError: normalizeOptionalString(
      data.pgflexInviteEmailLastError,
    ),
    publisherPortalInviteEmailSentAt: normalizeOptionalString(
      data.publisherPortalInviteEmailSentAt,
    ),
    publisherPortalInviteEmailFailedAt: normalizeOptionalString(
      data.publisherPortalInviteEmailFailedAt,
    ),
    publisherPortalInviteEmailLastError: normalizeOptionalString(
      data.publisherPortalInviteEmailLastError,
    ),
  };
}

export function getRoleCollectionName() {
  return USER_ROLES_COLLECTION;
}

export function getRoleManagementTargets(role: AdminRole) {
  return ROLE_ASSIGNMENT_TREE[role];
}

export async function getUserRoleByEmail(
  email: string,
): Promise<UserRoleRecord | null> {
  const normalizedEmail = normalizeRoleEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const snapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .doc(normalizedEmail)
    .get();
  if (!snapshot.exists) {
    return null;
  }

  return toUserRoleRecord(
    normalizedEmail,
    snapshot.data() as Record<string, unknown>,
  );
}

function getFirebaseAuthErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

async function resolveFirebaseUidForRoleUser(
  normalizedEmail: string,
  record: UserRoleRecord,
) {
  if (record.firebaseUid) {
    return record.firebaseUid;
  }

  try {
    const user = await adminAuthFor("mydnamap").getUserByEmail(normalizedEmail);
    return user.uid;
  } catch (error) {
    if (getFirebaseAuthErrorCode(error) === "auth/user-not-found") {
      return undefined;
    }

    throw error;
  }
}

export async function deleteRoleUserForContext(
  context: AdminContext,
  email: string,
) {
  if (context.role !== "full_admin" || !context.isBootstrap) {
    throw new AdminRepositoryError(
      "God mode is required to delete role users.",
      403,
    );
  }

  const normalizedEmail = normalizeRoleEmail(email);
  if (!normalizedEmail) {
    throw new AdminRepositoryError("Role email is required.", 400);
  }

  if (normalizeRoleEmail(context.email) === normalizedEmail) {
    throw new AdminRepositoryError(
      "You cannot delete your own role user.",
      400,
    );
  }

  if (TEAM_ALLOWLIST.has(normalizedEmail)) {
    throw new AdminRepositoryError(
      "Bootstrap role users cannot be deleted.",
      403,
    );
  }

  const roleRef = adminDb
    .collection(USER_ROLES_COLLECTION)
    .doc(normalizedEmail);
  const snapshot = await roleRef.get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("Role record not found.", 404);
  }

  const record = toUserRoleRecord(
    normalizedEmail,
    snapshot.data() as Record<string, unknown>,
  );
  if (record.createdAt === BOOTSTRAP_TIMESTAMP) {
    throw new AdminRepositoryError(
      "Bootstrap role users cannot be deleted.",
      403,
    );
  }

  const authUid = await resolveFirebaseUidForRoleUser(normalizedEmail, record);
  let authDeleted = false;
  if (authUid) {
    try {
      await adminAuthFor("mydnamap").deleteUser(authUid);
      authDeleted = true;
    } catch (error) {
      if (getFirebaseAuthErrorCode(error) !== "auth/user-not-found") {
        throw error;
      }
    }
  }

  await roleRef.delete();

  return {
    deleted: true,
    email: normalizedEmail,
    roleDeleted: true,
    authDeleted,
    authUid,
  };
}

export async function deletePublisherPortalRolesForPublisher(input: {
  kind: "organization" | "individual";
  publisherId: string;
}) {
  const publisherId = normalizeOptionalString(input.publisherId);
  if (!publisherId) {
    throw new AdminRepositoryError("Publisher id is required.", 400);
  }

  const scopeField =
    input.kind === "organization" ? "organizationId" : "individualId";
  const expectedRole = publisherPortalRoleForKind(input.kind);
  const snapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .where(scopeField, "==", publisherId)
    .get();
  const deletedRoleEmails: string[] = [];
  let deletedAuthUserCount = 0;

  for (const roleSnapshot of snapshot.docs) {
    const normalizedEmail = normalizeRoleEmail(roleSnapshot.id);
    const record = toUserRoleRecord(
      normalizedEmail,
      roleSnapshot.data() as Record<string, unknown>,
    );
    const matchesScope =
      input.kind === "organization"
        ? record.role === expectedRole && record.organizationId === publisherId
        : record.role === expectedRole && record.individualId === publisherId;

    if (!matchesScope) {
      continue;
    }

    const authUid = await resolveFirebaseUidForRoleUser(
      normalizedEmail,
      record,
    );
    if (authUid) {
      try {
        await adminAuthFor("mydnamap").deleteUser(authUid);
        deletedAuthUserCount += 1;
      } catch (error) {
        if (getFirebaseAuthErrorCode(error) !== "auth/user-not-found") {
          throw error;
        }
      }
    }

    await roleSnapshot.ref.delete();
    deletedRoleEmails.push(normalizedEmail);
  }

  return {
    deletedRoleCount: deletedRoleEmails.length,
    deletedAuthUserCount,
    deletedRoleEmails,
  };
}

function getLinkedCollectionIds(payload: {
  role: AdminRole;
  organizationId?: string;
  individualId?: string;
  institutionId?: string;
  doctorId?: string;
  patientId?: string;
}) {
  return {
    organizationId:
      payload.role === "organization_publisher"
        ? payload.organizationId
        : undefined,
    individualId:
      payload.role === "individual_publisher"
        ? payload.individualId
        : undefined,
    institutionId:
      payload.role === "full_admin" ||
      payload.role === "organization_publisher" ||
      payload.role === "individual_publisher" ||
      payload.role === "transport_dispatcher"
        ? undefined
        : payload.institutionId,
    doctorId:
      payload.role === "institution_doctor" || payload.role === "patient"
        ? payload.doctorId
        : undefined,
    patientId: payload.role === "patient" ? payload.patientId : undefined,
  };
}

async function validateLinkedRoleEntities(
  email: string,
  payload: Pick<
    UserRoleRecord,
    | "role"
    | "organizationId"
    | "individualId"
    | "institutionId"
    | "doctorId"
    | "patientId"
  >,
): Promise<string | null> {
  const { organizationId, individualId, institutionId, doctorId, patientId } =
    getLinkedCollectionIds(payload);
  const normalizedEmail = normalizeRoleEmail(email);

  if (payload.role === "full_admin") {
    return null;
  }

  if (payload.role === "transport_dispatcher") {
    return null;
  }

  if (payload.role === "organization_publisher") {
    if (!organizationId) {
      return "Organization publisher roles require an organization id.";
    }

    const organizationSnapshot = await adminDb
      .collection(FEED_ORGANIZATIONS_COLLECTION)
      .doc(organizationId)
      .get();
    if (!organizationSnapshot.exists) {
      return "The selected organization does not exist.";
    }

    return null;
  }

  if (payload.role === "individual_publisher") {
    if (!individualId) {
      return "Individual publisher roles require an individual id.";
    }

    const individualSnapshot = await adminDb
      .collection(FEED_INDIVIDUALS_COLLECTION)
      .doc(individualId)
      .get();
    if (!individualSnapshot.exists) {
      return "The selected individual publisher does not exist.";
    }

    return null;
  }

  if (!institutionId) {
    return "Institution-scoped roles require an institution id.";
  }

  const institutionSnapshot = await adminDb
    .collection("institutions")
    .doc(institutionId)
    .get();
  if (!institutionSnapshot.exists) {
    return "The selected institution does not exist.";
  }

  if (isInstitutionManagerRole(payload.role)) {
    return null;
  }

  if (!doctorId) {
    return "The selected role requires a linked doctor.";
  }

  const doctorSnapshot = await adminDb
    .collection("doctors")
    .doc(doctorId)
    .get();
  if (!doctorSnapshot.exists) {
    return "The selected doctor does not exist.";
  }

  const doctorData = doctorSnapshot.data() as Record<string, unknown>;
  if (normalizeOptionalString(doctorData.institutionId) !== institutionId) {
    return "The selected doctor must belong to the selected institution.";
  }

  if (payload.role === "institution_doctor") {
    const doctorEmail = normalizeRoleEmail(
      normalizeOptionalString(doctorData.authEmail) ?? "",
    );
    if (doctorEmail && doctorEmail !== normalizedEmail) {
      return "Doctor roles must use the doctor's auth email.";
    }

    return null;
  }

  if (!patientId) {
    return "Patient roles require a linked patient.";
  }

  const patientSnapshot = await adminDb
    .collection("patients")
    .doc(patientId)
    .get();
  if (!patientSnapshot.exists) {
    return "The selected patient does not exist.";
  }

  const patientData = patientSnapshot.data() as Record<string, unknown>;
  if (normalizeOptionalString(patientData.institutionId) !== institutionId) {
    return "The selected patient must belong to the selected institution.";
  }

  if (normalizeOptionalString(patientData.doctorId) !== doctorId) {
    return "The selected patient must belong to the selected doctor.";
  }

  const patientEmail = normalizeRoleEmail(
    normalizeOptionalString(patientData.email) ?? "",
  );
  if (patientEmail && patientEmail !== normalizedEmail) {
    return "Patient roles must use the patient's email.";
  }

  return null;
}

function toRoleManagementRecord(
  record: UserRoleRecord,
  extras?: Partial<RoleManagementRecord>,
): RoleManagementRecord {
  return {
    ...record,
    organizationName: extras?.organizationName,
    individualName: extras?.individualName,
    institutionName: extras?.institutionName,
    doctorName: extras?.doctorName,
    patientName: extras?.patientName,
    bootstrap: extras?.bootstrap,
  };
}

async function hydrateRoleManagementRecord(
  record: UserRoleRecord,
): Promise<RoleManagementRecord> {
  const [
    organizationSnap,
    individualSnap,
    institutionSnap,
    doctorSnap,
    patientSnap,
  ] = await Promise.all([
    record.organizationId
      ? adminDb
          .collection(FEED_ORGANIZATIONS_COLLECTION)
          .doc(record.organizationId)
          .get()
      : Promise.resolve(null),
    record.individualId
      ? adminDb
          .collection(FEED_INDIVIDUALS_COLLECTION)
          .doc(record.individualId)
          .get()
      : Promise.resolve(null),
    record.institutionId
      ? adminDb.collection("institutions").doc(record.institutionId).get()
      : Promise.resolve(null),
    record.doctorId
      ? adminDb.collection("doctors").doc(record.doctorId).get()
      : Promise.resolve(null),
    record.patientId
      ? adminDb.collection("patients").doc(record.patientId).get()
      : Promise.resolve(null),
  ]);

  return toRoleManagementRecord(record, {
    organizationName:
      organizationSnap && organizationSnap.exists
        ? (normalizeOptionalString(
            (organizationSnap.data() as Record<string, unknown>).name,
          ) ?? organizationSnap.id)
        : undefined,
    individualName:
      individualSnap && individualSnap.exists
        ? (normalizeOptionalString(
            (individualSnap.data() as Record<string, unknown>).name,
          ) ?? individualSnap.id)
        : undefined,
    institutionName:
      institutionSnap && institutionSnap.exists
        ? (normalizeOptionalString(
            (institutionSnap.data() as Record<string, unknown>).name,
          ) ?? institutionSnap.id)
        : undefined,
    doctorName:
      doctorSnap && doctorSnap.exists
        ? (normalizeOptionalString(
            (doctorSnap.data() as Record<string, unknown>).fullName,
          ) ?? doctorSnap.id)
        : undefined,
    patientName:
      patientSnap && patientSnap.exists
        ? (normalizeOptionalString(
            (patientSnap.data() as Record<string, unknown>).fullName,
          ) ?? patientSnap.id)
        : undefined,
    bootstrap: record.createdAt === BOOTSTRAP_TIMESTAMP,
  });
}

export async function resolveAdminContext(input: {
  email?: string | null;
  uid?: string | null;
}): Promise<AdminContext | null> {
  const normalizedEmail = normalizeRoleEmail(input.email ?? "");
  const uid = input.uid?.trim() ?? "";

  if (!normalizedEmail || !uid) {
    return null;
  }

  const access = await getBackofficeEmailAccess(normalizedEmail);
  const roleRecord = access.roleRecord;

  if (roleRecord && access.viaRoleAssignment && access.canAccessBackoffice) {
    return {
      email: normalizedEmail,
      uid,
      role: roleRecord.role,
      organizationId: roleRecord.organizationId,
      individualId: roleRecord.individualId,
      institutionId: roleRecord.institutionId,
      doctorId: roleRecord.doctorId,
      patientId: roleRecord.patientId,
      isBootstrap: access.viaAllowlist,
      canAccessBackoffice: true,
      canAccessPatientPortal: false,
      canAccessPGFlex: false,
      canAccessPublisherPortal: false,
      projectAccess: access.projectAccess,
    };
  }

  if (access.viaAllowlist) {
    return {
      email: normalizedEmail,
      uid,
      role: "full_admin",
      isBootstrap: true,
      canAccessBackoffice: true,
      canAccessPatientPortal: false,
      canAccessPGFlex: false,
      canAccessPublisherPortal: false,
      projectAccess: access.projectAccess,
    };
  }

  if (roleRecord) {
    return {
      email: normalizedEmail,
      uid,
      role: roleRecord.role,
      organizationId: roleRecord.organizationId,
      individualId: roleRecord.individualId,
      institutionId: roleRecord.institutionId,
      doctorId: roleRecord.doctorId,
      patientId: roleRecord.patientId,
      isBootstrap: false,
      canAccessBackoffice: false,
      canAccessPatientPortal: access.canAccessPatientPortal,
      canAccessPGFlex: access.canAccessPGFlex,
      canAccessPublisherPortal: access.canAccessPublisherPortal,
      projectAccess: access.projectAccess,
    };
  }

  return null;
}

export function resolveRequiredAuthSurfaceForEmailAccess(
  access: BackofficeEmailAccess,
) {
  return resolveRequiredAuthSurface(access.roleRecord, access.viaAllowlist);
}

export function getAdminCapabilities(context: AdminContext): string[] {
  const base = [`role:${context.role}`];

  if (context.role === "full_admin") {
    return [
      ...base,
      "institutions:create",
      "institutions:read:any",
      "institutions:write:any",
      "doctors:create:any",
      "doctors:read:any",
      "doctors:write:any",
      "patients:create:any",
      "patients:read:any",
      "patients:write:any",
      "roles:manage:any",
    ];
  }

  if (context.role === "organization_publisher") {
    return [
      ...base,
      "discover:organizations:read:own",
      "discover:organizations:write:own",
      "discover:feed-items:create:own-organization",
      "discover:feed-items:read:own-organization",
      "discover:feed-items:write:own-organization",
      "discover:feed-items:delete:own-organization",
    ];
  }

  if (context.role === "individual_publisher") {
    return [
      ...base,
      "discover:individuals:read:own",
      "discover:individuals:write:own",
      "discover:feed-items:create:own-individual",
      "discover:feed-items:read:own-individual",
      "discover:feed-items:write:own-individual",
      "discover:feed-items:delete:own-individual",
    ];
  }

  if (context.role === "transport_dispatcher") {
    return [
      ...base,
      "pgflex:logistics:read:assigned",
      "pgflex:logistics:update-status:assigned",
    ];
  }

  if (context.role === "institution_laboratory_staff") {
    return [
      ...base,
      "institutions:read:own",
      "doctors:read:own-institution",
      "patients:read:own-institution",
    ];
  }

  if (isInstitutionManagerRole(context.role)) {
    return [
      ...base,
      "institutions:read:own",
      "institutions:write:own",
      "doctors:create:own-institution",
      "doctors:read:own-institution",
      "doctors:write:own-institution",
      "patients:create:own-institution",
      "patients:read:own-institution",
      "patients:write:own-institution",
      "roles:manage:own-institution",
    ];
  }

  if (context.role === "institution_doctor") {
    return [
      ...base,
      "institutions:read:own",
      "doctors:read:own-institution",
      "doctors:write:self",
      "patients:create:self",
      "patients:read:own-institution",
      "patients:write:self",
      "roles:manage:own-patients",
    ];
  }

  return base;
}

export function canManageLegacyModeration(context: AdminContext) {
  return context.role === "full_admin";
}

export function canAccessDiscover(context: AdminContext) {
  return (
    context.role === "full_admin" ||
    (context.role === "organization_publisher" &&
      Boolean(context.organizationId)) ||
    (context.role === "individual_publisher" && Boolean(context.individualId))
  );
}

export function canCreateInstitution(context: AdminContext) {
  return context.role === "full_admin";
}

export function canViewInstitution(
  context: AdminContext,
  institutionId: string,
) {
  if (context.role === "full_admin") {
    return true;
  }

  return context.institutionId === institutionId;
}

export function canEditInstitution(
  context: AdminContext,
  institutionId: string,
) {
  if (context.role === "full_admin") {
    return true;
  }

  return (
    isInstitutionManagerRole(context.role) &&
    context.institutionId === institutionId
  );
}

export function canDeleteInstitution(
  context: AdminContext,
  _institutionId: string,
) {
  return context.role === "full_admin";
}

export function canCreateDoctor(context: AdminContext, institutionId: string) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  return (
    isInstitutionManagerRole(context.role) &&
    context.institutionId === institutionId
  );
}

export function canViewDoctor(
  context: AdminContext,
  doctor: Pick<DoctorRecord, "id" | "institutionId">,
) {
  if (context.role === "full_admin") {
    return true;
  }

  return context.institutionId === doctor.institutionId;
}

export function canEditDoctor(
  context: AdminContext,
  doctor: Pick<DoctorRecord, "id" | "institutionId">,
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  if (isInstitutionManagerRole(context.role)) {
    return context.institutionId === doctor.institutionId;
  }

  return (
    context.role === "institution_doctor" && context.doctorId === doctor.id
  );
}

export function canDeleteDoctor(
  context: AdminContext,
  doctor: Pick<DoctorRecord, "institutionId">,
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  return (
    isInstitutionManagerRole(context.role) &&
    context.institutionId === doctor.institutionId
  );
}

export function canCreatePatient(
  context: AdminContext,
  institutionId: string,
  doctorId: string,
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  if (isInstitutionManagerRole(context.role)) {
    return context.institutionId === institutionId;
  }

  return (
    context.role === "institution_doctor" &&
    context.institutionId === institutionId &&
    context.doctorId === doctorId
  );
}

export function canViewPatient(
  context: AdminContext,
  patient: Pick<PatientRecord, "institutionId">,
) {
  if (context.role === "full_admin") {
    return true;
  }

  return context.institutionId === patient.institutionId;
}

export function canEditPatient(
  context: AdminContext,
  patient: Pick<PatientRecord, "institutionId" | "doctorId">,
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  if (isInstitutionManagerRole(context.role)) {
    return context.institutionId === patient.institutionId;
  }

  return (
    context.role === "institution_doctor" &&
    context.institutionId === patient.institutionId &&
    context.doctorId === patient.doctorId
  );
}

export function canDeletePatient(
  context: AdminContext,
  patient: Pick<PatientRecord, "institutionId" | "doctorId">,
) {
  return canEditPatient(context, patient);
}

export function canViewRoleRecord(
  context: AdminContext,
  record: UserRoleRecord,
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  if (isInstitutionManagerRole(context.role)) {
    return (
      record.role !== "full_admin" &&
      record.institutionId === context.institutionId
    );
  }

  return (
    context.role === "institution_doctor" &&
    record.role === "patient" &&
    record.institutionId === context.institutionId &&
    record.doctorId === context.doctorId
  );
}

export function canAssignRole(context: AdminContext, targetRole: AdminRole) {
  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  return ROLE_ASSIGNMENT_TREE[context.role].includes(targetRole);
}

export function canCreateRoleAssignment(context: AdminContext) {
  return (
    context.role === "full_admin" ||
    context.role === "institution_admin" ||
    context.role === "institution_doctor"
  );
}

export function validateRoleScope(
  context: AdminContext,
  payload: Pick<
    UserRoleRecord,
    | "role"
    | "organizationId"
    | "individualId"
    | "institutionId"
    | "doctorId"
    | "patientId"
  >,
): string | null {
  if (!canAssignRole(context, payload.role)) {
    return "This operator cannot assign the requested role.";
  }

  if (payload.role === "full_admin") {
    return context.role === "full_admin"
      ? null
      : "Only full admins can manage full-admin roles.";
  }

  if (payload.role === "organization_publisher") {
    return payload.organizationId
      ? null
      : "Organization publisher roles require an organization id.";
  }

  if (payload.role === "individual_publisher") {
    return payload.individualId
      ? null
      : "Individual publisher roles require an individual id.";
  }

  if (payload.role === "transport_dispatcher") {
    return context.role === "full_admin"
      ? null
      : "Only full admins can manage transport dispatcher roles.";
  }

  if (!payload.institutionId) {
    return "Institution-scoped roles require an institution id.";
  }

  if (
    context.role !== "full_admin" &&
    payload.institutionId !== context.institutionId
  ) {
    return "This role must stay inside the operator's institution scope.";
  }

  if (payload.role === "institution_doctor" && !payload.doctorId) {
    return "Institution doctor roles require a linked doctor id.";
  }

  if (payload.role === "patient") {
    if (!payload.patientId) {
      return "Patient roles require a linked patient id.";
    }

    if (!payload.doctorId) {
      return "Patient roles require a linked doctor id.";
    }

    if (
      context.role === "institution_doctor" &&
      payload.doctorId !== context.doctorId
    ) {
      return "Doctors can only assign patient roles to their own patients.";
    }
  }

  return null;
}

export async function listUserRolesForContext(
  context: AdminContext,
): Promise<RoleManagementRecord[]> {
  const snapshot =
    context.role === "full_admin"
      ? await adminDb.collection(USER_ROLES_COLLECTION).get()
      : await adminDb
          .collection(USER_ROLES_COLLECTION)
          .where("institutionId", "==", context.institutionId ?? "__none__")
          .get();

  const records = snapshot.docs
    .map((doc) =>
      toUserRoleRecord(doc.id, doc.data() as Record<string, unknown>),
    )
    .filter((record) => canViewRoleRecord(context, record));

  if (context.role === "full_admin") {
    const recordedEmails = new Set(records.map((record) => record.email));
    TEAM_ALLOWLIST.forEach((email) => {
      const normalizedEmail = normalizeRoleEmail(email);
      if (!recordedEmails.has(normalizedEmail)) {
        records.push(toBootstrapRoleRecord(normalizedEmail));
      }
    });
  }

  const institutionIds = new Set<string>();
  const organizationIds = new Set<string>();
  const individualIds = new Set<string>();
  const doctorIds = new Set<string>();
  const patientIds = new Set<string>();

  records.forEach((record) => {
    if (record.organizationId) {
      organizationIds.add(record.organizationId);
    }
    if (record.individualId) {
      individualIds.add(record.individualId);
    }
    if (record.institutionId) {
      institutionIds.add(record.institutionId);
    }
    if (record.doctorId) {
      doctorIds.add(record.doctorId);
    }
    if (record.patientId) {
      patientIds.add(record.patientId);
    }
  });

  const [
    organizationSnaps,
    individualSnaps,
    institutionSnaps,
    doctorSnaps,
    patientSnaps,
  ] = await Promise.all([
    Promise.all(
      [...organizationIds].map((organizationId) =>
        adminDb
          .collection(FEED_ORGANIZATIONS_COLLECTION)
          .doc(organizationId)
          .get(),
      ),
    ),
    Promise.all(
      [...individualIds].map((individualId) =>
        adminDb.collection(FEED_INDIVIDUALS_COLLECTION).doc(individualId).get(),
      ),
    ),
    Promise.all(
      [...institutionIds].map((institutionId) =>
        adminDb.collection("institutions").doc(institutionId).get(),
      ),
    ),
    Promise.all(
      [...doctorIds].map((doctorId) =>
        adminDb.collection("doctors").doc(doctorId).get(),
      ),
    ),
    Promise.all(
      [...patientIds].map((patientId) =>
        adminDb.collection("patients").doc(patientId).get(),
      ),
    ),
  ]);

  const organizationNames = new Map(
    organizationSnaps
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => {
        const data = snapshot.data() as Record<string, unknown>;
        return [snapshot.id, normalizeOptionalString(data.name) ?? snapshot.id];
      }),
  );

  const individualNames = new Map(
    individualSnaps
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => {
        const data = snapshot.data() as Record<string, unknown>;
        return [snapshot.id, normalizeOptionalString(data.name) ?? snapshot.id];
      }),
  );

  const institutionNames = new Map(
    institutionSnaps
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => {
        const data = snapshot.data() as Record<string, unknown>;
        return [snapshot.id, normalizeOptionalString(data.name) ?? snapshot.id];
      }),
  );

  const doctorNames = new Map(
    doctorSnaps
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => {
        const data = snapshot.data() as Record<string, unknown>;
        return [
          snapshot.id,
          normalizeOptionalString(data.fullName) ?? snapshot.id,
        ];
      }),
  );

  const patientNames = new Map(
    patientSnaps
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => {
        const data = snapshot.data() as Record<string, unknown>;
        return [
          snapshot.id,
          normalizeOptionalString(data.fullName) ?? snapshot.id,
        ];
      }),
  );

  return records
    .map((record) =>
      toRoleManagementRecord(record, {
        organizationName: record.organizationId
          ? organizationNames.get(record.organizationId)
          : undefined,
        individualName: record.individualId
          ? individualNames.get(record.individualId)
          : undefined,
        institutionName: record.institutionId
          ? institutionNames.get(record.institutionId)
          : undefined,
        doctorName: record.doctorId
          ? doctorNames.get(record.doctorId)
          : undefined,
        patientName: record.patientId
          ? patientNames.get(record.patientId)
          : undefined,
        bootstrap: record.createdAt === BOOTSTRAP_TIMESTAMP,
      }),
    )
    .sort((left, right) => left.email.localeCompare(right.email));
}

export async function getUserRoleForContext(
  context: AdminContext,
  email: string,
): Promise<RoleManagementRecord | null> {
  const normalizedEmail = normalizeRoleEmail(email);
  const record =
    (await getUserRoleByEmail(normalizedEmail)) ??
    (context.role === "full_admin" && TEAM_ALLOWLIST.has(normalizedEmail)
      ? toBootstrapRoleRecord(normalizedEmail)
      : null);
  if (!record) {
    return null;
  }

  if (!canViewRoleRecord(context, record)) {
    return null;
  }

  return hydrateRoleManagementRecord(record);
}

export async function listTransportDispatchersForContext(
  context: AdminContext,
): Promise<PGFlexTransportDispatcherOption[]> {
  if (context.role !== "full_admin") {
    throw new AdminRepositoryError(
      "Only full admins can list transport dispatchers.",
      403,
    );
  }

  const snapshot = await adminDb
    .collection(USER_ROLES_COLLECTION)
    .where("role", "==", "transport_dispatcher")
    .where("isActive", "==", true)
    .limit(100)
    .get();

  const dispatchers = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const record = toUserRoleRecord(
        doc.id,
        doc.data() as Record<string, unknown>,
      );
      let firebaseUid = record.firebaseUid;
      let authDisplayName: string | undefined;

      if (firebaseUid && !record.displayName) {
        try {
          const user = await adminAuthFor("mydnamap").getUser(firebaseUid);
          authDisplayName = normalizeOptionalString(user.displayName);
        } catch {
          authDisplayName = undefined;
        }
      }

      if (!firebaseUid) {
        try {
          const user = await adminAuthFor("mydnamap").getUserByEmail(
            record.email,
          );
          firebaseUid = user.uid;
          authDisplayName = normalizeOptionalString(user.displayName);
        } catch {
          return null;
        }
      }

      return {
        email: record.email,
        firebaseUid,
        displayName:
          normalizeOptionalString(record.displayName) ??
          authDisplayName ??
          "Transportista sin nombre",
        is_preferred_asignee: record.is_preferred_asignee === true,
      };
    }),
  );

  return dispatchers
    .filter((dispatcher): dispatcher is PGFlexTransportDispatcherOption =>
      Boolean(dispatcher),
    )
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, "es"),
    );
}

export async function getOwnRoleForContext(
  context: AdminContext,
): Promise<RoleManagementRecord | null> {
  const normalizedEmail = normalizeRoleEmail(context.email);
  const record =
    (await getUserRoleByEmail(normalizedEmail)) ??
    (context.isBootstrap || TEAM_ALLOWLIST.has(normalizedEmail)
      ? toBootstrapRoleRecord(normalizedEmail)
      : null);

  return record ? hydrateRoleManagementRecord(record) : null;
}

export async function updateOwnRoleProfileForContext(
  context: AdminContext,
  payload: Pick<UserRoleRecord, "displayName" | "contactPhone" | "notes">,
): Promise<RoleManagementRecord> {
  const normalizedEmail = normalizeRoleEmail(context.email);
  if (context.isBootstrap || TEAM_ALLOWLIST.has(normalizedEmail)) {
    throw new AdminRepositoryError(
      "Bootstrap allowlist accounts are managed by environment configuration and cannot edit their role assignment metadata here.",
      403,
    );
  }

  const existing = await getUserRoleByEmail(normalizedEmail);
  if (!existing) {
    throw new AdminRepositoryError(
      "Role assignment not found for the current user.",
      404,
    );
  }

  const now = new Date().toISOString();
  const displayName = normalizeOptionalString(payload.displayName);
  const contactPhone = normalizeOptionalString(payload.contactPhone);
  const notes = normalizeOptionalString(payload.notes);
  await adminDb
    .collection(USER_ROLES_COLLECTION)
    .doc(normalizedEmail)
    .set(
      {
        displayName: displayName ?? null,
        contactPhone: contactPhone ?? null,
        notes: notes ?? null,
        updatedAt: now,
      },
      { merge: true },
    );

  return hydrateRoleManagementRecord({
    ...existing,
    displayName,
    contactPhone,
    notes,
    updatedAt: now,
  });
}

export async function moveOwnRoleEmailForContext(
  context: AdminContext,
  nextEmail: string,
): Promise<RoleManagementRecord> {
  const currentEmail = normalizeRoleEmail(context.email);
  const normalizedNextEmail = normalizeRoleEmail(nextEmail);

  if (!normalizedNextEmail) {
    throw new AdminRepositoryError("New email is required.", 400);
  }

  if (context.isBootstrap || TEAM_ALLOWLIST.has(currentEmail)) {
    throw new AdminRepositoryError(
      "Bootstrap allowlist account emails are managed by environment configuration and cannot be changed here.",
      403,
    );
  }

  const currentRef = adminDb
    .collection(USER_ROLES_COLLECTION)
    .doc(currentEmail);
  const currentSnapshot = await currentRef.get();
  if (!currentSnapshot.exists) {
    throw new AdminRepositoryError(
      "Role assignment not found for the current user.",
      404,
    );
  }

  if (normalizedNextEmail === currentEmail) {
    const record = toUserRoleRecord(
      currentEmail,
      currentSnapshot.data() as Record<string, unknown>,
    );
    return hydrateRoleManagementRecord(record);
  }

  const nextRef = adminDb
    .collection(USER_ROLES_COLLECTION)
    .doc(normalizedNextEmail);
  const nextSnapshot = await nextRef.get();
  if (nextSnapshot.exists) {
    throw new AdminRepositoryError(
      "A role assignment already exists for the requested email.",
      409,
    );
  }

  const now = new Date().toISOString();
  const currentData = currentSnapshot.data() as Record<string, unknown>;
  const nextData = {
    ...currentData,
    email: normalizedNextEmail,
    updatedAt: now,
  };
  const batch = adminDb.batch();
  batch.set(nextRef, nextData);
  batch.delete(currentRef);
  await batch.commit();

  return hydrateRoleManagementRecord(
    toUserRoleRecord(normalizedNextEmail, nextData),
  );
}

function shouldSendTransportDispatcherInvite(
  existing: UserRoleRecord | null,
  payload: Pick<UserRoleRecord, "role" | "isActive">,
) {
  return (
    payload.role === "transport_dispatcher" &&
    payload.isActive &&
    (!existing ||
      existing.role !== "transport_dispatcher" ||
      existing.isActive === false)
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function sendTransportDispatcherInviteForRole(
  normalizedEmail: string,
  document: Record<string, unknown>,
) {
  const temporaryPassword = generatePatientTemporaryPassword();
  const displayName =
    normalizeOptionalString(document.displayName) ?? normalizedEmail;
  const { user } = await provisionPatientFirebaseAccount(
    adminAuthFor("mydnamap"),
    {
      email: normalizedEmail,
      displayName,
      temporaryPassword,
    },
  );
  const roleRef = adminDb
    .collection(USER_ROLES_COLLECTION)
    .doc(normalizedEmail);

  try {
    await sendPGFlexDispatcherInviteEmail(
      { email: normalizedEmail, displayName },
      temporaryPassword,
    );
    const emailMetadata = {
      firebaseUid: user.uid,
      pgflexInviteEmailSentAt: new Date().toISOString(),
      pgflexInviteEmailFailedAt: null,
      pgflexInviteEmailLastError: null,
    };
    await roleRef.set(emailMetadata, { merge: true });
    return emailMetadata;
  } catch (error) {
    const emailMetadata = {
      firebaseUid: user.uid,
      pgflexInviteEmailSentAt: null,
      pgflexInviteEmailFailedAt: new Date().toISOString(),
      pgflexInviteEmailLastError: errorMessage(error),
    };
    await roleRef.set(emailMetadata, { merge: true });
    console.error("Failed to send PGFlex dispatcher invite email", error);
    return emailMetadata;
  }
}

function publisherPortalRoleForKind(kind: "organization" | "individual") {
  return kind === "organization"
    ? ("organization_publisher" as const)
    : ("individual_publisher" as const);
}

export async function provisionPublisherPortalRoleForContext(
  context: AdminContext,
  input: {
    kind: "organization" | "individual";
    publisherId: string;
    displayName: string;
    contactEmail: string;
  },
): Promise<RoleManagementRecord> {
  if (context.role !== "full_admin") {
    throw new AdminRepositoryError(
      "Only full admins can approve Discover publisher submissions.",
      403,
    );
  }

  const normalizedEmail = normalizeRoleEmail(input.contactEmail);
  if (!normalizedEmail) {
    throw new AdminRepositoryError(
      "A contact email is required to create publisher portal access.",
      400,
    );
  }

  const displayName =
    normalizeOptionalString(input.displayName) ?? normalizedEmail;
  const role = publisherPortalRoleForKind(input.kind);
  const roleRecord = await upsertUserRoleForContext(context, normalizedEmail, {
    role,
    isActive: true,
    organizationId:
      input.kind === "organization" ? input.publisherId : undefined,
    individualId: input.kind === "individual" ? input.publisherId : undefined,
    displayName,
    notes: "Approved from Discover submission evaluation.",
  });

  const temporaryPassword = generatePatientTemporaryPassword();
  const { user } = await provisionPatientFirebaseAccount(
    adminAuthFor("mydnamap"),
    {
      email: normalizedEmail,
      displayName,
      temporaryPassword,
    },
  );
  const roleRef = adminDb
    .collection(USER_ROLES_COLLECTION)
    .doc(normalizedEmail);

  try {
    await sendPublisherPortalInviteEmail(
      { email: normalizedEmail, displayName },
      temporaryPassword,
    );
    const sentAt = new Date().toISOString();
    const emailMetadata = {
      firebaseUid: user.uid,
      publisherPortalInviteEmailSentAt: sentAt,
      publisherPortalInviteEmailFailedAt: null,
      publisherPortalInviteEmailLastError: null,
    };
    await roleRef.set(emailMetadata, { merge: true });
    return hydrateRoleManagementRecord({
      ...roleRecord,
      firebaseUid: user.uid,
      publisherPortalInviteEmailSentAt: sentAt,
      publisherPortalInviteEmailFailedAt: undefined,
      publisherPortalInviteEmailLastError: undefined,
    });
  } catch (error) {
    const failedAt = new Date().toISOString();
    const lastError = errorMessage(error);
    const emailMetadata = {
      firebaseUid: user.uid,
      publisherPortalInviteEmailSentAt: null,
      publisherPortalInviteEmailFailedAt: failedAt,
      publisherPortalInviteEmailLastError: lastError,
    };
    await roleRef.set(emailMetadata, { merge: true });
    console.error("Failed to send publisher portal invite email", error);
    return hydrateRoleManagementRecord({
      ...roleRecord,
      firebaseUid: user.uid,
      publisherPortalInviteEmailSentAt: undefined,
      publisherPortalInviteEmailFailedAt: failedAt,
      publisherPortalInviteEmailLastError: lastError,
    });
  }
}

export async function upsertUserRoleForContext(
  context: AdminContext,
  email: string,
  payload: Omit<
    UserRoleRecord,
    | "email"
    | "createdAt"
    | "updatedAt"
    | "createdByEmail"
    | "canAccessPatientPortal"
  >,
): Promise<UserRoleRecord> {
  const normalizedEmail = normalizeRoleEmail(email);
  const existing = await getUserRoleByEmail(normalizedEmail);
  if (!existing && !canCreateRoleAssignment(context)) {
    throw new AdminRepositoryError(
      "Ask the institution administrator to add a new role.",
      403,
    );
  }

  const scopeError = validateRoleScope(context, payload);
  if (scopeError) {
    throw new AdminRepositoryError(scopeError, 400);
  }

  const relationError = await validateLinkedRoleEntities(
    normalizedEmail,
    payload,
  );
  if (relationError) {
    throw new AdminRepositoryError(relationError, 400);
  }

  if (existing && !canViewRoleRecord(context, existing)) {
    throw new AdminRepositoryError(
      "This operator cannot modify the selected role record.",
      403,
    );
  }

  const now = new Date().toISOString();
  const document: Record<string, unknown> = {
    email: normalizedEmail,
    role: payload.role,
    firebaseUid:
      payload.role === "transport_dispatcher" ||
      payload.role === "organization_publisher" ||
      payload.role === "individual_publisher"
        ? (existing?.firebaseUid ?? null)
        : null,
    organizationId:
      payload.role === "organization_publisher"
        ? (payload.organizationId ?? null)
        : null,
    individualId:
      payload.role === "individual_publisher"
        ? (payload.individualId ?? null)
        : null,
    institutionId:
      payload.role === "full_admin" ||
      payload.role === "organization_publisher" ||
      payload.role === "individual_publisher" ||
      payload.role === "transport_dispatcher"
        ? null
        : (payload.institutionId ?? null),
    doctorId:
      payload.role === "institution_doctor" || payload.role === "patient"
        ? (payload.doctorId ?? null)
        : null,
    patientId: payload.role === "patient" ? (payload.patientId ?? null) : null,
    isActive: payload.isActive,
    canAccessPatientPortal:
      payload.role === "patient"
        ? (existing?.canAccessPatientPortal ?? false)
        : false,
    is_preferred_asignee:
      payload.role === "transport_dispatcher"
        ? payload.is_preferred_asignee === true
        : null,
    displayName: payload.displayName ?? null,
    contactPhone: payload.contactPhone ?? existing?.contactPhone ?? null,
    notes: payload.notes ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdByEmail: existing?.createdByEmail ?? context.email,
  };

  await adminDb
    .collection(USER_ROLES_COLLECTION)
    .doc(normalizedEmail)
    .set(document, {
      merge: true,
    });

  if (shouldSendTransportDispatcherInvite(existing, payload)) {
    const inviteMetadata = await sendTransportDispatcherInviteForRole(
      normalizedEmail,
      document,
    );
    Object.assign(document, inviteMetadata);
  }

  return toUserRoleRecord(normalizedEmail, document);
}
