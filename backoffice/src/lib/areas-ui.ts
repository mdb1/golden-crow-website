import type {
  AdminContextRecord,
  AdminRole,
  DoctorListItem,
  PatientListItem,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import {
  getAssignableRoleOptions,
  isInstitutionManagerRole,
} from "@/lib/admin-areas";

export function getRoleBadgeVariant(role: AdminRole) {
  if (role === "full_admin") {
    return "destructive" as const;
  }

  if (role === "organization_publisher" || role === "individual_publisher") {
    return "secondary" as const;
  }

  if (isInstitutionManagerRole(role)) {
    return "brand" as const;
  }

  if (role === "institution_doctor") {
    return "success" as const;
  }

  return "outline" as const;
}

export function getStatusBadgeVariant(status: "active" | "inactive") {
  return status === "active" ? ("success" as const) : ("outline" as const);
}

export function canCreateInstitutionUi(context: AdminContextRecord) {
  return context.role === "full_admin";
}

export function canEditInstitutionUi(
  context: AdminContextRecord,
  institutionId: string,
) {
  return (
    context.role === "full_admin" ||
    (isInstitutionManagerRole(context.role) &&
      context.institutionId === institutionId)
  );
}

export function canDeleteInstitutionUi(
  context: AdminContextRecord,
  _institutionId: string,
) {
  return context.role === "full_admin";
}

export function canCreateDoctorUi(
  context: AdminContextRecord,
  institutionId?: string,
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  return (
    isInstitutionManagerRole(context.role) &&
    (!institutionId || context.institutionId === institutionId)
  );
}

export function canEditDoctorUi(
  context: AdminContextRecord,
  doctor: Pick<DoctorListItem, "id" | "institutionId">,
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

export function canDeleteDoctorUi(
  context: AdminContextRecord,
  doctor: Pick<DoctorListItem, "institutionId">,
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

export function canCreatePatientUi(
  context: AdminContextRecord,
  institutionId?: string,
  doctorId?: string,
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  if (isInstitutionManagerRole(context.role)) {
    return !institutionId || context.institutionId === institutionId;
  }

  return (
    context.role === "institution_doctor" &&
    (!institutionId || context.institutionId === institutionId) &&
    (!doctorId || context.doctorId === doctorId)
  );
}

export function canEditPatientUi(
  context: AdminContextRecord,
  patient: Pick<PatientListItem, "institutionId" | "doctorId">,
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

export function canManagePatientPortalCredentialsUi(
  context: AdminContextRecord,
  patient: Pick<PatientListItem, "institutionId" | "doctorId">,
) {
  if (context.isBootstrap || context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_admin") {
    return context.institutionId === patient.institutionId;
  }

  return (
    context.role === "institution_doctor" &&
    context.institutionId === patient.institutionId &&
    context.doctorId === patient.doctorId
  );
}

export function canDeletePatientUi(
  context: AdminContextRecord,
  patient: Pick<PatientListItem, "institutionId" | "doctorId">,
) {
  return canEditPatientUi(context, patient);
}

type RoleScopeRecord = Pick<
  RoleManagementRecord,
  "role" | "institutionId" | "doctorId" | "bootstrap"
>;

export function canCreateRoleUi(context: AdminContextRecord) {
  if (
    context.role === "institution_operator" ||
    context.role === "institution_laboratory_staff"
  ) {
    return false;
  }

  return getAssignableRoleOptions(context.role).length > 0;
}

export function shouldAskInstitutionAdminForRoleCreation(
  context: AdminContextRecord,
) {
  return (
    context.role === "institution_operator" ||
    context.role === "institution_laboratory_staff"
  );
}

export function canEditRoleUi(
  context: AdminContextRecord,
  roleRecord: RoleScopeRecord,
) {
  if (roleRecord.bootstrap) {
    return false;
  }

  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_laboratory_staff") {
    return false;
  }

  if (isInstitutionManagerRole(context.role)) {
    return (
      roleRecord.role !== "full_admin" &&
      !(
        context.role === "institution_operator" &&
        roleRecord.role === "institution_admin"
      ) &&
      Boolean(roleRecord.institutionId) &&
      context.institutionId === roleRecord.institutionId
    );
  }

  return (
    context.role === "institution_doctor" &&
    roleRecord.role === "patient" &&
    context.institutionId === roleRecord.institutionId &&
    context.doctorId === roleRecord.doctorId
  );
}

export function getRoleCreateRestrictionMessage(context: AdminContextRecord) {
  if (shouldAskInstitutionAdminForRoleCreation(context)) {
    return "Ask the institution administrator to add a new role.";
  }

  if (context.role === "patient") {
    return "Patients cannot create role assignments.";
  }

  if (context.role === "organization_publisher") {
    return "Organization publishers cannot create role assignments.";
  }

  if (context.role === "individual_publisher") {
    return "Individual publishers cannot create role assignments.";
  }

  return "The current scope cannot create role assignments.";
}

export function getRoleEditRestrictionMessage(
  context: AdminContextRecord,
  roleRecord: RoleScopeRecord,
) {
  if (roleRecord.bootstrap) {
    return "Bootstrap role assignments are locked in the UI and stay outside the normal reassignment flow.";
  }

  if (context.role === "institution_laboratory_staff") {
    return "Institution laboratory staff cannot modify role assignments.";
  }

  if (isInstitutionManagerRole(context.role)) {
    if (roleRecord.role === "full_admin") {
      return "Institution managers cannot modify full-admin role assignments.";
    }

    if (
      context.role === "institution_operator" &&
      roleRecord.role === "institution_admin"
    ) {
      return "Institution operators cannot modify institution-admin role assignments.";
    }

    return "This role assignment sits outside your institution scope.";
  }

  if (context.role === "institution_doctor") {
    return "Doctors can only modify patient role assignments tied to their own doctor scope.";
  }

  return "The current role cannot modify role assignments.";
}

export function formatInstitutionScope(
  context: AdminContextRecord,
  institutionName?: string,
) {
  if (context.role === "full_admin") {
    return institutionName ?? "All institutions";
  }

  return institutionName ?? context.institutionId ?? "Scoped institution";
}

export const ROLE_CAPABILITY_LINES: Record<AdminRole, string[]> = {
  full_admin: [
    "Can create institutions and any role.",
    "Can see and edit every institution, doctor, patient, and legacy moderation surface.",
    "Can promote or demote any non-bootstrap role record.",
  ],
  organization_publisher: [
    "Can access only Discover organizations and feed entries for one linked organization.",
    "Can create, edit, duplicate, and delete feed entries only for that organization.",
    "Cannot access 2PQ, institution areas, reports, community moderation, learning, or role management.",
  ],
  individual_publisher: [
    "Can access only Discover individual publishers and feed entries for one linked individual publisher.",
    "Can create, edit, duplicate, and delete feed entries only for that individual publisher.",
    "Cannot access 2PQ, institution areas, reports, community moderation, learning, or role management.",
  ],
  institution_admin: [
    "Can see and edit only one institution.",
    "Can create doctors and patients inside that institution.",
    "Can assign institution-admin, institution-operator, institution-doctor, and patient roles inside that institution only.",
  ],
  institution_operator: [
    "Can see and edit only one institution.",
    "Can create doctors and patients inside that institution.",
    "Can update existing institution-operator, institution-laboratory-staff, institution-doctor, and patient roles inside that institution only.",
    "New role assignments must be requested from the institution administrator.",
    "Cannot assign institution-admin roles.",
  ],
  institution_laboratory_staff: [
    "Can see and edit only one institution.",
    "Cannot create or update doctors, patients, or role assignments.",
    "Cannot inspect the local permission map.",
    "New role assignments must be requested from the institution administrator.",
  ],
  institution_doctor: [
    "Can read the institution and all doctors inside it.",
    "Can edit only the doctor's own detail record.",
    "Can create, edit, and delete only the doctor's own patients.",
  ],
  patient: [
    "Informational record only.",
    "Patients do not access the backoffice.",
  ],
};
