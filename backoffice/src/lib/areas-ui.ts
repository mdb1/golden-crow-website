import type {
  AdminContextRecord,
  AdminRole,
  DoctorListItem,
  PatientListItem,
} from "@/lib/admin-areas";

export function getRoleBadgeVariant(role: AdminRole) {
  if (role === "full_admin") {
    return "destructive" as const;
  }

  if (role === "institution_admin") {
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
  institutionId: string
) {
  return (
    context.role === "full_admin" ||
    (context.role === "institution_admin" &&
      context.institutionId === institutionId)
  );
}

export function canCreateDoctorUi(
  context: AdminContextRecord,
  institutionId?: string
) {
  if (context.role === "full_admin") {
    return true;
  }

  return (
    context.role === "institution_admin" &&
    (!institutionId || context.institutionId === institutionId)
  );
}

export function canEditDoctorUi(
  context: AdminContextRecord,
  doctor: Pick<DoctorListItem, "id" | "institutionId">
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_admin") {
    return context.institutionId === doctor.institutionId;
  }

  return context.role === "institution_doctor" && context.doctorId === doctor.id;
}

export function canCreatePatientUi(
  context: AdminContextRecord,
  institutionId?: string,
  doctorId?: string
) {
  if (context.role === "full_admin") {
    return true;
  }

  if (context.role === "institution_admin") {
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
  patient: Pick<PatientListItem, "institutionId" | "doctorId">
) {
  if (context.role === "full_admin") {
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

export function formatInstitutionScope(
  context: AdminContextRecord,
  institutionName?: string
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
  institution_admin: [
    "Can see and edit only one institution.",
    "Can create doctors and patients inside that institution.",
    "Can assign institution-admin, institution-doctor, and patient roles inside that institution only.",
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
