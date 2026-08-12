import type { AdminRole, UserRoleRecord } from "../types/sdk.types.js";

export type AuthSurface = "backoffice" | "patient-portal";

const BACKOFFICE_ROLES = new Set<AdminRole>([
  "full_admin",
  "organization_publisher",
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
]);

type AccessRoleRecord = Pick<
  UserRoleRecord,
  "role" | "isActive" | "canAccessPatientPortal"
>;

export function canRoleAccessBackoffice(
  record: AccessRoleRecord | null,
) {
  return Boolean(record?.isActive && BACKOFFICE_ROLES.has(record.role));
}

export function canAccessBackoffice(
  record: AccessRoleRecord | null,
  viaAllowlist = false,
) {
  return viaAllowlist || canRoleAccessBackoffice(record);
}

export function canAccessPatientPortal(
  record: AccessRoleRecord | null,
  viaAllowlist = false,
) {
  return Boolean(
    record?.isActive &&
      record.role === "patient" &&
      record.canAccessPatientPortal === true &&
      !canAccessBackoffice(record, viaAllowlist),
  );
}

export function canAccessSurface(
  surface: AuthSurface,
  record: AccessRoleRecord | null,
  viaAllowlist = false,
) {
  return surface === "patient-portal"
    ? canAccessPatientPortal(record, viaAllowlist)
    : canAccessBackoffice(record, viaAllowlist);
}
