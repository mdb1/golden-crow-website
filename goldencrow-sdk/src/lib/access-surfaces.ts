import type { AdminRole, UserRoleRecord } from "../types/sdk.types.js";

export type AuthSurface = "backoffice" | "patient-portal" | "pgflex";

const BACKOFFICE_ROLES = new Set<AdminRole>([
  "full_admin",
  "organization_publisher",
  "individual_publisher",
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
]);

const PGFLEX_ROLES = new Set<AdminRole>(["transport_dispatcher"]);

type AccessRoleRecord = Pick<
  UserRoleRecord,
  "role" | "isActive" | "canAccessPatientPortal"
>;

export function canRoleAccessBackoffice(record: AccessRoleRecord | null) {
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

export function canAccessPGFlex(
  record: AccessRoleRecord | null,
  viaAllowlist = false,
) {
  return Boolean(
    record?.isActive &&
    PGFLEX_ROLES.has(record.role) &&
    !canAccessBackoffice(record, viaAllowlist),
  );
}

export function resolveRequiredAuthSurface(
  record: AccessRoleRecord | null,
  viaAllowlist = false,
): AuthSurface | undefined {
  if (canAccessBackoffice(record, viaAllowlist)) {
    return "backoffice";
  }

  if (canAccessPatientPortal(record, viaAllowlist)) {
    return "patient-portal";
  }

  if (canAccessPGFlex(record, viaAllowlist)) {
    return "pgflex";
  }

  return undefined;
}

export function canAccessSurface(
  surface: AuthSurface,
  record: AccessRoleRecord | null,
  viaAllowlist = false,
) {
  if (surface === "patient-portal") {
    return canAccessPatientPortal(record, viaAllowlist);
  }

  if (surface === "pgflex") {
    return canAccessPGFlex(record, viaAllowlist);
  }

  return canAccessBackoffice(record, viaAllowlist);
}
