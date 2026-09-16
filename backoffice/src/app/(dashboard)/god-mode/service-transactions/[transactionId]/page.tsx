import { redirect } from "next/navigation";
import { SupportServiceTransactionWorkbench } from "@/components/god-mode/support-services-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function GodModeServiceTransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const adminContext = await getAdminContextServer();

  if (!adminContext.isBootstrap) {
    redirect("/2pq-dashboard");
  }

  const { transactionId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="Service Transaction"
            description={t("Edit a Pocket Genes pgr_* service transaction.")}
          />
        }
      >
        <SupportServiceTransactionWorkbench
          mode="edit"
          transactionId={decodeURIComponent(transactionId)}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
