import type { AuthSurface } from "./access-surfaces.js";
import type {
  AdminContext,
  ProjectKey,
  UserRoleRecord,
} from "../types/sdk.types.js";

interface AdminContextAccess {
  roleRecord: UserRoleRecord | null;
  viaAllowlist: boolean;
  viaRoleAssignment: boolean;
  canAccessBackoffice: boolean;
  canAccessPatientPortal: boolean;
  canAccessPGFlex: boolean;
  canAccessPublisherPortal: boolean;
  projectAccess: ProjectKey[];
}

export function resolveAdminContextForAccess(input: {
  email: string;
  uid: string;
  surface?: AuthSurface;
  access: AdminContextAccess;
}): AdminContext | null {
  const { access, email, uid } = input;
  const roleRecord = access.roleRecord;

  // The same email may be both a bootstrap/allowlisted backoffice operator
  // and the publisher linked to a Discover organization or individual. Keep
  // those grants separate by resolving the effective role from the surface
  // selected at login instead of combining their permissions in one session.
  if (
    input.surface === "publisher-portal" &&
    roleRecord &&
    access.canAccessPublisherPortal
  ) {
    return {
      email,
      uid,
      role: roleRecord.role,
      organizationId: roleRecord.organizationId,
      individualId: roleRecord.individualId,
      isBootstrap: false,
      canAccessBackoffice: false,
      canAccessPatientPortal: false,
      canAccessPGFlex: false,
      canAccessPublisherPortal: true,
      projectAccess: access.projectAccess,
    };
  }

  if (roleRecord && access.viaRoleAssignment && access.canAccessBackoffice) {
    return {
      email,
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
      email,
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
      email,
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
