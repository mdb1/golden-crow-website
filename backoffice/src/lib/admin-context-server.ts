import { sdkFetchServer } from "@/lib/sdk-server";
import {
  isGlobalAdminRole,
  type AdminContextRecord,
  type AdminRole,
  type ProjectKey,
} from "@/lib/admin-areas";
import { redirect } from "next/navigation";

interface SdkContextResponse {
  context: {
    email: string;
    uid: string;
    role: string;
    organizationId?: string;
    individualId?: string;
    institutionId?: string;
    doctorId?: string;
    patientId?: string;
    isBootstrap: boolean;
    canAccessBackoffice: boolean;
    canAccessPatientPortal: boolean;
    canAccessPGFlex?: boolean;
    canAccessPublisherPortal?: boolean;
    projectAccess: string[];
  };
  capabilities: string[];
}

export async function getAdminContextServer(
  activeProject?: string,
): Promise<AdminContextRecord> {
  const response = await sdkFetchServer<SdkContextResponse>("/auth/context");
  const ctx = response.context;
  return {
    email: ctx.email,
    uid: ctx.uid,
    role: ctx.role as AdminRole,
    organizationId: ctx.organizationId,
    individualId: ctx.individualId,
    institutionId: ctx.institutionId,
    doctorId: ctx.doctorId,
    patientId: ctx.patientId,
    isBootstrap: ctx.isBootstrap,
    canAccessBackoffice: ctx.canAccessBackoffice,
    canAccessPatientPortal: ctx.canAccessPatientPortal,
    canAccessPGFlex: ctx.canAccessPGFlex ?? false,
    canAccessPublisherPortal: ctx.canAccessPublisherPortal ?? false,
    // The active project comes from the NextAuth session, which the browser
    // chose at sign-in — honour it only if the SDK says this account has
    // access to it (#451).
    project:
      (activeProject && ctx.projectAccess?.includes(activeProject)
        ? (activeProject as ProjectKey)
        : undefined) ??
      (ctx.projectAccess?.[0] as ProjectKey | undefined) ??
      "mydnamap",
    projectAccess: (ctx.projectAccess ?? []) as ProjectKey[],
  };
}

/**
 * For Route Handlers: the admin context, or null when the caller has no
 * usable SDK session — so the route can answer 401 instead of letting the
 * SDK error fall into its generic 500 (#451).
 */
export async function getAdminContextOrNull(
  activeProject?: string,
): Promise<AdminContextRecord | null> {
  try {
    return await getAdminContextServer(activeProject);
  } catch {
    return null;
  }
}

export async function requireAdminRole(
  allowedRoles: AdminRole[],
  activeProject?: string,
) {
  const context = await getAdminContextServer(activeProject);

  if (
    !allowedRoles.includes(context.role) &&
    !(isGlobalAdminRole(context.role) && allowedRoles.includes("full_admin"))
  ) {
    throw new Error("forbidden");
  }

  return context;
}

export async function requireAdminRoleRedirect(
  allowedRoles: AdminRole[],
  fallbackHref = "/",
  activeProject?: string,
) {
  const context = await getAdminContextServer(activeProject);

  if (
    !allowedRoles.includes(context.role) &&
    !(isGlobalAdminRole(context.role) && allowedRoles.includes("full_admin"))
  ) {
    redirect(fallbackHref);
  }

  return context;
}
