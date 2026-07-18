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
import { getAssignableRoleOptions, ROLE_OPTIONS } from "@/lib/admin-areas";
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
  const fixedRole = ROLE_OPTIONS.some((option) => option.value === role)
    ? (role as AdminRole)
    : undefined;
  if (
    fixedRole &&
    !getAssignableRoleOptions(adminContext.role).some(
      (option) => option.value === fixedRole,
    )
  ) {
    redirect("/roles");
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  const [institutionsPayload, doctorsPayload, patientsPayload] =
    await Promise.all([
      sdkFetchServer<{ institutions: InstitutionRecord[] }>(
        "/areas/institutions",
      ),
      sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
      sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
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
          initialEmail={email}
          initialInstitutionId={institutionId}
          fixedRole={fixedRole}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
