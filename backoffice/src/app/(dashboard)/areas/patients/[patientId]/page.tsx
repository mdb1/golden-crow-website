import { redirect } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { PatientWorkbench } from "@/components/areas/patient-workbench";
import { PageHero } from "@/components/page-hero";
import type {
  DoctorListItem,
  InstitutionRecord,
  PatientDetailRecord,
} from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  try {
    const [detail, institutionsPayload, doctorsPayload] = await Promise.all([
      sdkFetchServer<PatientDetailRecord>(`/areas/patients/${encodeURIComponent(patientId)}`),
      sdkFetchServer<{ institutions: InstitutionRecord[] }>("/areas/institutions"),
      sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    ]);

    return (
      <div className="flex flex-col gap-6">
        <PageHero
          eyebrow="Areas"
          title={detail.patient.fullName}
          description="Patient detail is an informative sheet first: clear linked records, scoped editability, and one explicit delete path when the operator is allowed to use it."
        />
        <HelperBanner title="Doctors can edit only their own patients." tone="blue">
          Institution admins can work across the institution. Doctors still see the wider patient list, but write access follows the doctor link on the patient record itself.
        </HelperBanner>
        <PatientWorkbench
          detail={detail}
          institutions={institutionsPayload.institutions}
          doctors={doctorsPayload.doctors}
        />
      </div>
    );
  } catch {
    redirect("/areas/patients");
  }
}
