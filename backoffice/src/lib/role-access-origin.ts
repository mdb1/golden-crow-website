import type { AdminRole } from "@/lib/admin-areas";

const ROLE_ACCESS_FROM_MAP: Record<string, AdminRole> = {
  "administrative-operators": "institution_operator",
  "laboratory-staff": "institution_laboratory_staff",
  "transport-dispatchers": "transport_dispatcher",
};

export function roleForRoleAccessOrigin(from: string | undefined) {
  return from ? (ROLE_ACCESS_FROM_MAP[from] ?? null) : null;
}

export function selectedRoleForRoleAccess({
  currentRole,
  from,
  role,
}: {
  currentRole: AdminRole;
  from?: string;
  role?: string;
}) {
  if (isRoleAccessRole(role)) {
    return role;
  }

  return roleForRoleAccessOrigin(from) ?? currentRole;
}

function isRoleAccessRole(value: string | undefined): value is AdminRole {
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
