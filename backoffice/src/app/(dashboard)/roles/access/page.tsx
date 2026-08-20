import { notFound, redirect } from "next/navigation";
import { RoleAssignmentCapabilitiesScreen } from "@/components/role-assignment-capabilities-screen";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { AdminRole } from "@/lib/admin-areas";
import { getSurfaceSpec } from "@/lib/two-pq-dashboard";

function isAdminRole(value: string | undefined): value is AdminRole {
  return (
    value === "full_admin" ||
    value === "organization_publisher" ||
    value === "individual_publisher" ||
    value === "institution_admin" ||
    value === "institution_operator" ||
    value === "institution_laboratory_staff" ||
    value === "institution_doctor" ||
    value === "patient"
  );
}

export default async function RoleAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const adminContext = await getAdminContextServer();
  if (
    adminContext.role === "organization_publisher" ||
    adminContext.role === "individual_publisher"
  ) {
    redirect("/my-account");
  }
  const surface = getSurfaceSpec("roles");
  const { role } = await searchParams;

  if (!surface) {
    notFound();
  }

  return (
    <RoleAssignmentCapabilitiesScreen
      entries={surface.roleAccess}
      selectedRole={isAdminRole(role) ? role : adminContext.role}
      currentRole={adminContext.role}
    />
  );
}
