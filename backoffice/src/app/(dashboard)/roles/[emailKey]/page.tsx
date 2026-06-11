import { notFound } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { RoleWorkbench } from "@/components/areas/role-workbench";
import { PageHero } from "@/components/page-hero";
import type {
  DoctorListItem,
  InstitutionRecord,
  PatientListItem,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

function resolveRoleEmailKey(emailKey: string) {
  try {
    return decodeURIComponent(emailKey);
  } catch {
    return emailKey;
  }
}

async function getRoleOptions() {
  const [institutionsResult, doctorsResult, patientsResult] = await Promise.allSettled([
    sdkFetchServer<{ institutions: InstitutionRecord[] }>("/areas/institutions"),
    sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
  ]);

  return {
    institutions:
      institutionsResult.status === "fulfilled"
        ? institutionsResult.value.institutions
        : [],
    doctors: doctorsResult.status === "fulfilled" ? doctorsResult.value.doctors : [],
    patients:
      patientsResult.status === "fulfilled" ? patientsResult.value.patients : [],
    optionsUnavailable:
      institutionsResult.status === "rejected" ||
      doctorsResult.status === "rejected" ||
      patientsResult.status === "rejected",
  };
}

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ emailKey: string }>;
}) {
  const { emailKey } = await params;
  const resolvedEmailKey = resolveRoleEmailKey(emailKey);
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  let rolePayload: { role: RoleManagementRecord };
  try {
    rolePayload = await sdkFetchServer<{ role: RoleManagementRecord }>(
      `/roles/${encodeURIComponent(resolvedEmailKey)}`
    );
  } catch (error) {
    console.error(
      `[RoleDetailPage] Failed to load role for "${resolvedEmailKey}".`,
      error
    );
    notFound();
  }

  const { institutions, doctors, patients, optionsUnavailable } =
    await getRoleOptions();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={t("Access")}
        title={rolePayload.role.email}
        description={t("Role detail is where email-based access, institution scope, doctor scope, and patient scope all come together in one typed form.")}
      />
      <HelperBanner title={t("Changing a role changes access boundaries.")} tone="blue">
        {t("Use this screen to adjust role power deliberately. The backend prevents cross-institution leakage and stops doctors from assigning anything outside their patient scope.")}
      </HelperBanner>
      {optionsUnavailable ? (
        <HelperBanner title={t("Some linked option lists could not be loaded.")} tone="amber">
          {t("The role record is open, but one or more institution, doctor, or patient selector lists failed to load. Refresh after the SDK data source recovers.")}
        </HelperBanner>
      ) : null}
      <RoleWorkbench
        roleRecord={rolePayload.role}
        institutions={institutions}
        doctors={doctors}
        patients={patients}
      />
    </div>
  );
}
