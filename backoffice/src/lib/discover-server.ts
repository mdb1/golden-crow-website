import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAdminContextServer } from "@/lib/admin-context-server";

export async function requireDiscoverFullAdmin() {
  const session = await getServerSession(authOptions);
  const adminContext = await getAdminContextServer(session?.user?.project);

  if (adminContext.role !== "full_admin" || adminContext.project !== "mydnamap") {
    redirect("/");
  }

  return adminContext;
}

export async function requireDiscoverAccess() {
  const session = await getServerSession(authOptions);
  const adminContext = await getAdminContextServer(session?.user?.project);

  if (
    adminContext.project !== "mydnamap" ||
    (adminContext.role !== "full_admin" &&
      adminContext.role !== "organization_publisher") ||
    (adminContext.role === "organization_publisher" &&
      !adminContext.organizationId)
  ) {
    redirect("/");
  }

  return adminContext;
}
