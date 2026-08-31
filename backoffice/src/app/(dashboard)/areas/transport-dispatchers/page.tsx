import { redirect } from "next/navigation";
import { AreaAccessEntry } from "@/components/area-access-entry";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { InstitutionStaffRoleBrowser } from "@/components/areas/institution-staff-role-browser";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import {
  getAssignableRoleOptions,
  type RoleManagementRecord,
} from "@/lib/admin-areas";
import { canCreateRoleUi } from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function TransportDispatchersPage() {
  const adminContext = await getAdminContextServer();
  if (adminContext.role !== "full_admin") {
    redirect("/2pq-dashboard");
  }

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { roles } = await sdkFetchServer<{ roles: RoleManagementRecord[] }>(
    "/roles",
  );
  const canCreateTransportDispatcher =
    canCreateRoleUi(adminContext) &&
    getAssignableRoleOptions(adminContext.role).some(
      (option) => option.value === "transport_dispatcher",
    );

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Areas")}
            title={t("Transport dispatchers")}
            description={t(
              "Standalone PGFlex logistics roles without institution, doctor, or patient scope.",
            )}
          />
        }
      >
        <AreaAccessEntry
          accessHref="/roles/access"
          accessLabel="Role assignment capabilities"
          createHref="/roles/new?role=transport_dispatcher"
          canCreate={canCreateTransportDispatcher}
          createLabel="Create transport dispatcher"
          createDisabledTitle="The current role cannot create transport dispatchers on this screen."
        />
        <InstitutionStaffRoleBrowser
          initialRoles={roles}
          role="transport_dispatcher"
          emptyLabel="No transport dispatchers match the current filter."
          searchPlaceholder="Search transport dispatchers by email, name, or notes..."
          resultLabel="transport dispatchers"
        />
      </HeaderUnclutterScope>
    </div>
  );
}
