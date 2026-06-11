import { redirect } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { RoleWorkbench } from "@/components/areas/role-workbench";
import { PageHero } from "@/components/page-hero";
import type {
  DoctorListItem,
  InstitutionRecord,
  PatientListItem,
} from "@/lib/admin-areas";
import { getAssignableRoleOptions } from "@/lib/admin-areas";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function NewRolePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const adminContext = await getAdminContextServer();
  if (getAssignableRoleOptions(adminContext.role).length === 0) {
    redirect("/roles");
  }
  const { email } = await searchParams;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  const [institutionsPayload, doctorsPayload, patientsPayload] = await Promise.all([
    sdkFetchServer<{ institutions: InstitutionRecord[] }>("/areas/institutions"),
    sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={t("Access")}
        title={t("Create role assignment")}
        description={t("Create a new email-based role record and tie it to the exact institution, doctor, or patient scope the permission tree allows.")}
      />
      <HelperBanner title={t("Scope first, role second.")} tone="blue">
        {t("The selected role determines which linked records are required. When a doctor or patient link exists, the backend validates that the email and relational scope line up correctly.")}
      </HelperBanner>
      <RoleWorkbench
        mode="create"
        institutions={institutionsPayload.institutions}
        doctors={doctorsPayload.doctors}
        patients={patientsPayload.patients}
        initialEmail={email}
      />
    </div>
  );
}
