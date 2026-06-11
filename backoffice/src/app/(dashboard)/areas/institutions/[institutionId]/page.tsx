import { redirect } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { InstitutionWorkbench } from "@/components/areas/institution-workbench";
import { PageHero } from "@/components/page-hero";
import type { InstitutionDetailRecord } from "@/lib/admin-areas";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function InstitutionDetailPage({
  params,
}: {
  params: Promise<{ institutionId: string }>;
}) {
  const { institutionId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  let detail: InstitutionDetailRecord;

  try {
    detail = await sdkFetchServer<InstitutionDetailRecord>(
      `/areas/institutions/${encodeURIComponent(institutionId)}`
    );
  } catch {
    redirect("/areas/institutions");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={t("Areas")}
        title={detail.institution.name}
        description={t("Institution detail is the control surface for institution descriptors, local doctors, and institution-admin role coverage.")}
      />
      <HelperBanner title={t("Institution detail should stay operational, not decorative.")} tone="blue">
        {t("Use this screen to manage the institution record itself, confirm which doctors belong to it, and verify which institution-admin emails actually have local power.")}
      </HelperBanner>
      <InstitutionWorkbench detail={detail} />
    </div>
  );
}
