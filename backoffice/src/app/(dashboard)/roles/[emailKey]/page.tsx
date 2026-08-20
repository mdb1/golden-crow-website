import { notFound } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { RoleWorkbench } from "@/components/areas/role-workbench";
import { PageHero } from "@/components/page-hero";
import type {
  DoctorListItem,
  InstitutionRecord,
  PatientListItem,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import type {
  DiscoverIndividualRecord,
  DiscoverIndividualsPage,
  DiscoverOrganizationRecord,
  DiscoverOrganizationsPage,
} from "@/lib/discover";
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
  const [
    institutionsResult,
    doctorsResult,
    patientsResult,
    organizationsResult,
    individualsResult,
  ] = await Promise.allSettled([
    sdkFetchServer<{ institutions: InstitutionRecord[] }>("/areas/institutions"),
    sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
    sdkFetchServer<DiscoverOrganizationsPage>("/discover/organizations?limit=50"),
    sdkFetchServer<DiscoverIndividualsPage>("/discover/individuals?limit=50"),
  ]);

  return {
    institutions:
      institutionsResult.status === "fulfilled"
        ? institutionsResult.value.institutions
        : [],
    doctors: doctorsResult.status === "fulfilled" ? doctorsResult.value.doctors : [],
    patients:
      patientsResult.status === "fulfilled" ? patientsResult.value.patients : [],
    organizations:
      organizationsResult.status === "fulfilled"
        ? organizationsResult.value.organizations
        : ([] as DiscoverOrganizationRecord[]),
    individuals:
      individualsResult.status === "fulfilled"
        ? individualsResult.value.individuals
        : ([] as DiscoverIndividualRecord[]),
    optionsUnavailable:
      institutionsResult.status === "rejected" ||
      doctorsResult.status === "rejected" ||
      patientsResult.status === "rejected",
    organizationsUnavailable: organizationsResult.status === "rejected",
    individualsUnavailable: individualsResult.status === "rejected",
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

  const {
    institutions,
    doctors,
    patients,
    organizations,
    individuals,
    optionsUnavailable,
    organizationsUnavailable,
    individualsUnavailable,
  } =
    await getRoleOptions();
  const organizationOptionsUnavailable =
    rolePayload.role.role === "organization_publisher" &&
    organizationsUnavailable;
  const individualOptionsUnavailable =
    rolePayload.role.role === "individual_publisher" &&
    individualsUnavailable;

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Access")}
            title={rolePayload.role.email}
            description={t("Role detail is where email-based access, institution scope, doctor scope, and patient scope all come together in one typed form.")}
          />
        }
      >
        {optionsUnavailable || organizationOptionsUnavailable || individualOptionsUnavailable ? (
          <HelperBanner title={t("Some linked option lists could not be loaded.")} tone="amber">
            {t("The role record is open, but one or more institution, doctor, or patient selector lists failed to load. Refresh after the SDK data source recovers.")}
          </HelperBanner>
        ) : null}
        <RoleWorkbench
          roleRecord={rolePayload.role}
          institutions={institutions}
          doctors={doctors}
          patients={patients}
          organizations={organizations}
          individuals={individuals}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
