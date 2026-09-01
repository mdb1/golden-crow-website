import { notFound, redirect } from "next/navigation";
import { RoleAssignmentCapabilitiesScreen } from "@/components/role-assignment-capabilities-screen";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { selectedRoleForRoleAccess } from "@/lib/role-access-origin";
import { getSurfaceSpec } from "@/lib/two-pq-dashboard";

export default async function RoleAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; role?: string }>;
}) {
  const adminContext = await getAdminContextServer();
  if (
    adminContext.role === "organization_publisher" ||
    adminContext.role === "individual_publisher"
  ) {
    redirect("/my-account");
  }
  const surface = getSurfaceSpec("roles");
  const { from, role } = await searchParams;

  if (!surface) {
    notFound();
  }

  return (
    <RoleAssignmentCapabilitiesScreen
      entries={surface.roleAccess}
      selectedRole={selectedRoleForRoleAccess({
        currentRole: adminContext.role,
        from,
        role,
      })}
      currentRole={adminContext.role}
    />
  );
}
