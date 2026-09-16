import { redirect } from "next/navigation";
import { SupportServiceOfferWorkbench } from "@/components/god-mode/support-services-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function GodModeServiceOfferDetailPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const adminContext = await getAdminContextServer();

  if (!adminContext.isBootstrap) {
    redirect("/2pq-dashboard");
  }

  const { offerId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="Service Offer"
            description={t("Edit a Pocket Genes pgs_* service definition.")}
          />
        }
      >
        <SupportServiceOfferWorkbench
          mode="edit"
          offerId={decodeURIComponent(offerId)}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
