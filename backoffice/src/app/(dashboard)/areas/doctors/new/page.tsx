import { redirect } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { DoctorWorkbench } from "@/components/areas/doctor-workbench";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { InstitutionRecord } from "@/lib/admin-areas";
import { canCreateDoctorUi } from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function NewDoctorPage({
  searchParams,
}: {
  searchParams: Promise<{ institutionId?: string }>;
}) {
  const adminContext = await getAdminContextServer();
  const { institutionId } = await searchParams;
  if (!canCreateDoctorUi(adminContext, institutionId)) {
    redirect("/areas/doctors");
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { institutions } = await sdkFetchServer<{ institutions: InstitutionRecord[] }>(
    "/areas/institutions"
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={t("Areas")}
        title={t("Create doctor")}
        description={t("Create a doctor record tied to one institution. The rest of the doctor setup happens after the record exists.")}
      />
      <HelperBanner title={t("Pick the institution once, then manage from doctor detail.")} tone="blue">
        {t("A doctor can read the whole institution later, but the institution link itself stays singular and explicit from creation onward.")}
      </HelperBanner>
      <DoctorWorkbench
        mode="create"
        institutions={institutions}
        initialInstitutionId={institutionId}
      />
    </div>
  );
}
