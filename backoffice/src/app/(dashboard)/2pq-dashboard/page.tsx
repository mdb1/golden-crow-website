import { cookies } from "next/headers";
import { TwoPQDashboardHome } from "@/components/two-pq-dashboard-home";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type {
  DoctorListItem,
  InstitutionListItem,
  PatientListItem,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getTwoPQFormDraft } from "@/lib/two-pq-server";
import { LANGUAGE_COOKIE_NAME, resolveAppLanguage } from "@/lib/language";

export default async function TwoPQDashboardPage() {
  const adminContext = await getAdminContextServer();
  const cookieStore = await cookies();
  const language = resolveAppLanguage(
    cookieStore.get(LANGUAGE_COOKIE_NAME)?.value
  );

  const [
    institutionsPayload,
    doctorsPayload,
    patientsPayload,
    rolesPayload,
    formDraft,
  ] =
    await Promise.all([
      sdkFetchServer<{ institutions: InstitutionListItem[] }>("/areas/institutions"),
      sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
      sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
      sdkFetchServer<{ roles: RoleManagementRecord[] }>("/roles"),
      getTwoPQFormDraft(),
    ]);

  return (
    <TwoPQDashboardHome
      adminContext={adminContext}
      language={language}
      metrics={{
        institutions: institutionsPayload.institutions.length,
        doctors: doctorsPayload.doctors.length,
        patients: patientsPayload.patients.length,
        roles: rolesPayload.roles.length,
      }}
      formDraft={formDraft}
    />
  );
}
