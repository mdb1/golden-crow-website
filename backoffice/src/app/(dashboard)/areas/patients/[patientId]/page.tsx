import { redirect } from "next/navigation";
import { PatientWorkbench } from "@/components/areas/patient-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import type {
  DoctorListItem,
  InstitutionRecord,
  PatientDetailRecord,
} from "@/lib/admin-areas";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  try {
    const [detail, institutionsPayload, doctorsPayload] = await Promise.all([
      sdkFetchServer<PatientDetailRecord>(`/areas/patients/${encodeURIComponent(patientId)}`),
      sdkFetchServer<{ institutions: InstitutionRecord[] }>("/areas/institutions"),
      sdkFetchServer<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    ]);

    return (
      <div className="flex flex-col gap-6">
        <HeaderUnclutterScope
          header={
            <PageHero
              eyebrow={t("Areas")}
              title={detail.patient.fullName}
              description={t("Patient detail is an informative sheet first: clear linked records, scoped editability, and one explicit delete path when the operator is allowed to use it.")}
            />
          }
        >
          <PatientWorkbench
            detail={detail}
            institutions={institutionsPayload.institutions}
            doctors={doctorsPayload.doctors}
          />
        </HeaderUnclutterScope>
      </div>
    );
  } catch {
    redirect("/areas/patients");
  }
}
