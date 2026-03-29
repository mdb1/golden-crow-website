import { redirect } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { DoctorWorkbench } from "@/components/areas/doctor-workbench";
import { PageHero } from "@/components/page-hero";
import type { DoctorDetailRecord, InstitutionRecord } from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ doctorId: string }>;
}) {
  const { doctorId } = await params;

  try {
    const [detail, institutionsPayload] = await Promise.all([
      sdkFetchServer<DoctorDetailRecord>(`/areas/doctors/${encodeURIComponent(doctorId)}`),
      sdkFetchServer<{ institutions: InstitutionRecord[] }>("/areas/institutions"),
    ]);

    return (
      <div className="flex flex-col gap-6">
        <PageHero
          eyebrow="Areas"
          title={detail.doctor.fullName}
          description="Doctor detail joins the editable doctor profile, linked institution, direct patient list, and role linkage in one operational screen."
        />
        <HelperBanner title="Doctors can inspect peers, but edit only self." tone="blue">
          The SDK enforces the write boundary. This screen reflects it by showing read-only state whenever the current role can inspect but not modify the selected doctor.
        </HelperBanner>
        <DoctorWorkbench detail={detail} institutions={institutionsPayload.institutions} />
      </div>
    );
  } catch {
    redirect("/areas/doctors");
  }
}
