import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PGFlexLogisticsForm } from "@/components/pgflex-logistics-form";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { canCreatePGFlexLogistics } from "@/lib/pgflex-logistics";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function NewPGFlexLogisticsPage() {
  const adminContext = await getAdminContextServer();
  if (!canCreatePGFlexLogistics(adminContext)) {
    redirect("/pgflex/logistics");
  }

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="PGFlex"
            title={t("New logistics item")}
            description={t("Create a standalone dispatch record.")}
          />
        }
      >
        <PGFlexLogisticsForm mode="create" />
      </HeaderUnclutterScope>
    </div>
  );
}
