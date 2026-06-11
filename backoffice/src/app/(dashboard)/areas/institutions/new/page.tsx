import { redirect } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { InstitutionWorkbench } from "@/components/areas/institution-workbench";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function NewInstitutionPage() {
  const adminContext = await getAdminContextServer();
  if (adminContext.role !== "full_admin") {
    redirect("/areas/institutions");
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={t("Areas")}
        title={t("Create institution")}
        description={t("Only full admins can create institution roots. Once created, the institution becomes the anchor for doctors, patients, and institution-scoped roles.")}
      />
      <HelperBanner title={t("Create the institution root first.")} tone="blue">
        {t("Use a clear name, keep the relational id durable, and only add doctors or institution-admin roles after the institution record exists.")}
      </HelperBanner>
      <InstitutionWorkbench mode="create" />
    </div>
  );
}
