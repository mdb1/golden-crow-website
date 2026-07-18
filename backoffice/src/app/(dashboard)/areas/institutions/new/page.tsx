import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
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
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Areas")}
            title={t("Create institution")}
            description={t("Only full admins can create institution roots. Once created, the institution becomes the anchor for doctors, patients, and institution-scoped roles.")}
          />
        }
      >
        <InstitutionWorkbench mode="create" />
      </HeaderUnclutterScope>
    </div>
  );
}
