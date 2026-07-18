import { redirect } from "next/navigation";
import { DoctorWorkbench } from "@/components/areas/doctor-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import type { DoctorDetailRecord, InstitutionRecord } from "@/lib/admin-areas";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ doctorId: string }>;
}) {
  const { doctorId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  try {
    const [detail, institutionsPayload] = await Promise.all([
      sdkFetchServer<DoctorDetailRecord>(`/areas/doctors/${encodeURIComponent(doctorId)}`),
      sdkFetchServer<{ institutions: InstitutionRecord[] }>("/areas/institutions"),
    ]);

    return (
      <div className="flex flex-col gap-6">
        <HeaderUnclutterScope
          header={
            <PageHero
              eyebrow={t("Areas")}
              title={detail.doctor.fullName}
              description={t("Doctor detail joins the editable doctor profile, linked institution, direct patient list, and role linkage in one operational screen.")}
            />
          }
        >
          <DoctorWorkbench detail={detail} institutions={institutionsPayload.institutions} />
        </HeaderUnclutterScope>
      </div>
    );
  } catch {
    redirect("/areas/doctors");
  }
}
