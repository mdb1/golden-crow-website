import { redirect } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { PatientWorkbench } from "@/components/areas/patient-workbench";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { DoctorListItem, InstitutionRecord } from "@/lib/admin-areas";
import { canCreatePatientUi } from "@/lib/areas-ui";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function NewPatientPage({
  searchParams,
}: {
  searchParams: Promise<{ institutionId?: string; doctorId?: string }>;
}) {
  const adminContext = await getAdminContextServer();
  const { institutionId, doctorId } = await searchParams;
  if (!canCreatePatientUi(adminContext, institutionId, doctorId)) {
    redirect("/areas/patients");
  }
  const [institutionsPayload, doctorsPayload] = await Promise.all([
    sdkFetchServer<{ institutions: InstitutionRecord[] }>("/areas/institutions"),
    sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Areas"
        title="Create patient"
        description="Create a patient record tied to one institution and one doctor. The save path respects institution-admin and doctor write boundaries automatically."
      />
      <HelperBanner title="Choose the doctor deliberately." tone="blue">
        The doctor link controls who can actually edit this patient later. Institution scope and doctor scope stay explicit and visible on the patient sheet.
      </HelperBanner>
      <PatientWorkbench
        mode="create"
        institutions={institutionsPayload.institutions}
        doctors={doctorsPayload.doctors}
        initialInstitutionId={institutionId}
        initialDoctorId={doctorId}
      />
    </div>
  );
}
