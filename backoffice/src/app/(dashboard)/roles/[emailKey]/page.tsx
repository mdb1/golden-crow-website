import { redirect } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { RoleWorkbench } from "@/components/areas/role-workbench";
import { PageHero } from "@/components/page-hero";
import type {
  DoctorListItem,
  InstitutionRecord,
  PatientListItem,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ emailKey: string }>;
}) {
  const { emailKey } = await params;

  try {
    const [rolePayload, institutionsPayload, doctorsPayload, patientsPayload] =
      await Promise.all([
        sdkFetchServer<{ role: RoleManagementRecord }>(
          `/roles/${encodeURIComponent(emailKey)}`
        ),
        sdkFetchServer<{ institutions: InstitutionRecord[] }>("/areas/institutions"),
        sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
        sdkFetchServer<{ patients: PatientListItem[] }>("/areas/patients"),
      ]);

    return (
      <div className="flex flex-col gap-6">
        <PageHero
          eyebrow="Access"
          title={rolePayload.role.email}
          description="Role detail is where email-based access, institution scope, doctor scope, and patient scope all come together in one typed form."
        />
        <HelperBanner title="Changing a role changes access boundaries." tone="blue">
          Use this screen to adjust role power deliberately. The backend prevents cross-institution leakage and stops doctors from assigning anything outside their patient scope.
        </HelperBanner>
        <RoleWorkbench
          roleRecord={rolePayload.role}
          institutions={institutionsPayload.institutions}
          doctors={doctorsPayload.doctors}
          patients={patientsPayload.patients}
        />
      </div>
    );
  } catch {
    redirect("/roles");
  }
}
