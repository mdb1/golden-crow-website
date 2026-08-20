import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { RoleWorkbench } from "@/components/areas/role-workbench";
import { PageHero } from "@/components/page-hero";
import type {
  AdminRole,
  DoctorListItem,
  InstitutionRecord,
  PatientListItem,
} from "@/lib/admin-areas";
import { getAssignableRoleOptionsForContext, ROLE_OPTIONS } from "@/lib/admin-areas";
import type {
  DiscoverIndividualsPage,
  DiscoverOrganizationsPage,
} from "@/lib/discover";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { canCreateRoleUi } from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function NewRolePage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    role?: string;
    institutionId?: string;
  }>;
}) {
  const adminContext = await getAdminContextServer();
  if (!canCreateRoleUi(adminContext)) {
    redirect("/roles");
  }
  const { email, role, institutionId } = await searchParams;
  const assignableRoleOptions = getAssignableRoleOptionsForContext(adminContext);
  const fixedRole = ROLE_OPTIONS.some((option) => option.value === role)
    ? (role as AdminRole)
    : undefined;
  if (
    fixedRole &&
    !assignableRoleOptions.some((option) => option.value === fixedRole)
  ) {
    redirect("/roles");
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  const [
    institutionsPayload,
    doctorsPayload,
    patientsPayload,
    organizationsPayload,
    individualsPayload,
  ] =
    await Promise.all([
      sdkFetchServer<{ institutions: InstitutionRecord[] }>(
        "/areas/institutions",
      ),
      sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
      sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
      adminContext.role === "full_admin" && adminContext.isBootstrap
        ? sdkFetchServer<DiscoverOrganizationsPage>(
            "/discover/organizations?limit=50",
          )
        : Promise.resolve({ organizations: [], nextCursor: null }),
      adminContext.role === "full_admin" && adminContext.isBootstrap
        ? sdkFetchServer<DiscoverIndividualsPage>(
            "/discover/individuals?limit=50",
          )
        : Promise.resolve({ individuals: [], nextCursor: null }),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Access")}
            title={t("Create role assignment")}
            description={t(
              "Create a new email-based role record and tie it to the exact institution, doctor, or patient scope the permission tree allows.",
            )}
          />
        }
      >
        <RoleWorkbench
          mode="create"
          institutions={institutionsPayload.institutions}
          doctors={doctorsPayload.doctors}
          patients={patientsPayload.patients}
          organizations={organizationsPayload.organizations}
          individuals={individualsPayload.individuals}
          initialEmail={email}
          initialInstitutionId={institutionId}
          fixedRole={fixedRole}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
