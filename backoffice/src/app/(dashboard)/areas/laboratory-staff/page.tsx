import { AreaAccessEntry } from "@/components/area-access-entry";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { InstitutionStaffRoleBrowser } from "@/components/areas/institution-staff-role-browser";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import {
  getAssignableRoleOptions,
  type RoleManagementRecord,
} from "@/lib/admin-areas";
import {
  canCreateRoleUi,
  shouldAskInstitutionAdminForRoleCreation,
} from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function LaboratoryStaffPage() {
  const adminContext = await getAdminContextServer();
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { roles } = await sdkFetchServer<{ roles: RoleManagementRecord[] }>(
    "/roles",
  );
  const canCreateLaboratoryStaff =
    canCreateRoleUi(adminContext) &&
    getAssignableRoleOptions(adminContext.role).some(
      (option) => option.value === "institution_laboratory_staff",
    );
  const roleCreationNeedsInstitutionAdmin =
    shouldAskInstitutionAdminForRoleCreation(adminContext);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Areas")}
            title={t("Laboratory staff")}
            description={t(
              "Laboratory staff are institution-scoped staff records. Each staff member belongs to one institution and does not own patient assignments.",
            )}
          />
        }
      >
        <AreaAccessEntry
          accessHref="/roles/access"
          accessLabel="Role assignment capabilities"
          createHref="/roles/new?role=institution_laboratory_staff"
          canCreate={canCreateLaboratoryStaff}
          createLabel="Create laboratory staff"
          createBlockedAlert={
            roleCreationNeedsInstitutionAdmin
              ? "Ask the institution administrator to add a new role."
              : undefined
          }
          createDisabledTitle="The current role cannot create laboratory staff on this screen."
        />
        <InstitutionStaffRoleBrowser
          initialRoles={roles}
          role="institution_laboratory_staff"
          emptyLabel="No laboratory staff match the current filter."
          searchPlaceholder="Search laboratory staff by email, name, or institution..."
          resultLabel="laboratory staff"
        />
      </HeaderUnclutterScope>
    </div>
  );
}
