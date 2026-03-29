import { sdkFetchServer } from "@/lib/sdk-server";
import type { AdminContextResponse, AdminRole } from "@/lib/admin-areas";
import { redirect } from "next/navigation";

export async function getAdminContextServer() {
  const response = await sdkFetchServer<AdminContextResponse>("/auth/context");
  return response.context;
}

export async function requireAdminRole(allowedRoles: AdminRole[]) {
  const context = await getAdminContextServer();

  if (!allowedRoles.includes(context.role)) {
    throw new Error("forbidden");
  }

  return context;
}

export async function requireAdminRoleRedirect(
  allowedRoles: AdminRole[],
  fallbackHref = "/"
) {
  const context = await getAdminContextServer();

  if (!allowedRoles.includes(context.role)) {
    redirect(fallbackHref);
  }

  return context;
}
