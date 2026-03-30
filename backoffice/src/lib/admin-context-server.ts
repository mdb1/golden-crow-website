import { sdkFetchServer } from "@/lib/sdk-server";
import type { AdminRole, AdminContextRecord, ProjectKey } from "@/lib/admin-areas";
import { redirect } from "next/navigation";

interface SdkContextResponse {
  context: {
    email: string;
    uid: string;
    role: string;
    institutionId?: string;
    doctorId?: string;
    patientId?: string;
    isBootstrap: boolean;
    canAccessBackoffice: boolean;
    projectAccess: string[];
  };
  capabilities: string[];
}

export async function getAdminContextServer(activeProject?: string): Promise<AdminContextRecord> {
  const response = await sdkFetchServer<SdkContextResponse>("/auth/context");
  const ctx = response.context;
  return {
    email: ctx.email,
    uid: ctx.uid,
    role: ctx.role as AdminRole,
    institutionId: ctx.institutionId,
    doctorId: ctx.doctorId,
    patientId: ctx.patientId,
    isBootstrap: ctx.isBootstrap,
    canAccessBackoffice: ctx.canAccessBackoffice,
    project: (activeProject as ProjectKey) ?? "mydnamap",
    projectAccess: (ctx.projectAccess ?? []) as ProjectKey[],
  };
}

export async function requireAdminRole(allowedRoles: AdminRole[], activeProject?: string) {
  const context = await getAdminContextServer(activeProject);

  if (!allowedRoles.includes(context.role)) {
    throw new Error("forbidden");
  }

  return context;
}

export async function requireAdminRoleRedirect(
  allowedRoles: AdminRole[],
  fallbackHref = "/",
  activeProject?: string
) {
  const context = await getAdminContextServer(activeProject);

  if (!allowedRoles.includes(context.role)) {
    redirect(fallbackHref);
  }

  return context;
}
