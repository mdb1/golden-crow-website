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

export default async function AdministrativeOperatorsPage() {
  const adminContext = await getAdminContextServer();
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { roles } = await sdkFetchServer<{ roles: RoleManagementRecord[] }>(
    "/roles",
  );
  const canCreateAdministrativeOperator =
    canCreateRoleUi(adminContext) &&
    getAssignableRoleOptions(adminContext.role).some(
      (option) => option.value === "institution_operator",
    );
  const roleCreationNeedsInstitutionAdmin =
    shouldAskInstitutionAdminForRoleCreation(adminContext);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Areas")}
            title={t("Administrative operators")}
            description={t(
              "Administrative operators are institution-scoped staff records. Each operator belongs to one institution and does not own patient assignments.",
            )}
          />
        }
      >
        <AreaAccessEntry
          accessHref="/roles/access"
          accessLabel="Role assignment capabilities"
          createHref="/roles/new?role=institution_operator"
          canCreate={canCreateAdministrativeOperator}
          createLabel="Create administrative operator"
          createBlockedAlert={
            roleCreationNeedsInstitutionAdmin
              ? "Ask the institution administrator to add a new role."
              : undefined
          }
          createDisabledTitle="The current role cannot create administrative operators on this screen."
        />
        <InstitutionStaffRoleBrowser
          initialRoles={roles}
          role="institution_operator"
          emptyLabel="No administrative operators match the current filter."
          searchPlaceholder="Search administrative operators by email, name, or institution..."
          resultLabel="administrative operators"
        />
      </HeaderUnclutterScope>
    </div>
  );
}
