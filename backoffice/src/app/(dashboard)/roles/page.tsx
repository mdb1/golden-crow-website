import { AreaAccessEntry } from "@/components/area-access-entry";
import { HelperBanner } from "@/components/helper-banner";
import { RolesBrowser } from "@/components/areas/roles-browser";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { getAssignableRoleOptions } from "@/lib/admin-areas";
import type { RoleManagementRecord } from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function RolesPage() {
  const adminContext = await getAdminContextServer();
  const { roles } = await sdkFetchServer<{ roles: RoleManagementRecord[] }>("/roles");

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Access"
        title="Roles & permissions"
        description="Email-based role assignments with a clear hierarchy: full admin, institution admin, institution doctor, and patient."
      />
      <HelperBanner title="The permission tree must stay explicit." tone="blue">
        Full admins can create anything. Institution admins stay inside one institution. Institution doctors can only create patient-facing records and patient roles tied to their own doctor scope.
      </HelperBanner>
      <AreaAccessEntry
        accessHref="/roles/access"
        accessLabel="Role assignment capabilities"
        createHref="/roles/new"
        canCreate={getAssignableRoleOptions(adminContext.role).length > 0}
        createLabel="Add new role assignment"
        createDisabledTitle="The current role cannot create role assignments on this screen."
        description="Open the role-by-role capabilities guide or jump directly into the role creation flow."
      />
      <RolesBrowser initialRoles={roles} />
    </div>
  );
}
