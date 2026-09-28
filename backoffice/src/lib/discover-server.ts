import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { isGlobalAdminRole } from "@/lib/admin-areas";

export async function requireDiscoverFullAdmin() {
  const session = await getServerSession(authOptions);
  const adminContext = await getAdminContextServer(session?.user?.project);

  if (!isGlobalAdminRole(adminContext.role) || adminContext.project !== "mydnamap") {
    redirect("/");
  }

  return adminContext;
}

export async function requireDiscoverAccess() {
  const session = await getServerSession(authOptions);
  const adminContext = await getAdminContextServer(session?.user?.project);

  if (
    adminContext.project !== "mydnamap" ||
    (!isGlobalAdminRole(adminContext.role) &&
      adminContext.role !== "organization_publisher" &&
      adminContext.role !== "individual_publisher") ||
    (adminContext.role === "organization_publisher" &&
      !adminContext.organizationId) ||
    (adminContext.role === "individual_publisher" &&
      !adminContext.individualId)
  ) {
    redirect("/");
  }

  return adminContext;
}
