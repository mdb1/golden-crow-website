import { cookies } from "next/headers";
import { TwoPQDashboardHome } from "@/components/two-pq-dashboard-home";
import { getAdminContextServer } from "@/lib/admin-context-server";
import {
  getVisibleRoleRecordsForContext,
  type DoctorListItem,
  type InstitutionListItem,
  type PatientListItem,
  type RoleManagementRecord,
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
  const visibleRoles = getVisibleRoleRecordsForContext(
    rolesPayload.roles,
    adminContext,
  );

  return (
    <TwoPQDashboardHome
      adminContext={adminContext}
      language={language}
      metrics={{
        institutions: institutionsPayload.institutions.length,
        doctors: doctorsPayload.doctors.length,
        patients: patientsPayload.patients.length,
        administrativeOperators: visibleRoles.filter(
          (role) => role.role === "institution_operator",
        ).length,
        laboratoryStaff: visibleRoles.filter(
          (role) => role.role === "institution_laboratory_staff",
        ).length,
        transportDispatchers: visibleRoles.filter(
          (role) => role.role === "transport_dispatcher",
        ).length,
        roles: visibleRoles.length,
      }}
      formDraft={formDraft}
    />
  );
}
