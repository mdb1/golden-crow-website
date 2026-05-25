import { TwoPQDashboardHome } from "@/components/two-pq-dashboard-home";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type {
  DoctorListItem,
  InstitutionListItem,
  PatientListItem,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getTwoPQForms } from "@/lib/two-pq-server";

export default async function TwoPQDashboardPage() {
  const adminContext = await getAdminContextServer();

  const [institutionsPayload, doctorsPayload, patientsPayload, rolesPayload, forms] =
    await Promise.all([
      sdkFetchServer<{ institutions: InstitutionListItem[] }>("/areas/institutions"),
      sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
      sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
      sdkFetchServer<{ roles: RoleManagementRecord[] }>("/roles"),
      getTwoPQForms().catch(() => []),
    ]);

  return (
    <TwoPQDashboardHome
      adminContext={adminContext}
      metrics={{
        institutions: institutionsPayload.institutions.length,
        doctors: doctorsPayload.doctors.length,
        patients: patientsPayload.patients.length,
        roles: rolesPayload.roles.length,
      }}
      forms={forms}
    />
  );
}
