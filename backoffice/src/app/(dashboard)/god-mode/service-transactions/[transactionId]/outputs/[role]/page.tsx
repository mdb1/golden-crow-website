import { redirect, notFound } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { ServiceTransactionOutputExplorer } from "@/components/service-transactions/output-file-explorer";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function GodModeServiceTransactionOutputPage({
  params,
}: {
  params: Promise<{ transactionId: string; role: string }>;
}) {
  const adminContext = await getAdminContextServer();
  if (!adminContext.isBootstrap) {
    redirect("/2pq-dashboard");
  }
  const [{ transactionId, role }, language] = await Promise.all([
    params,
    getServerAppLanguage(),
  ]);
  const decodedTransactionId = decodeURIComponent(transactionId);
  const decodedRole = decodeURIComponent(role);
  if (!/^[a-z][a-z0-9_]*$/.test(decodedRole)) {
    notFound();
  }
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title={t("Output file explorer")}
            description={t("Explore the finalized output content without changing it.")}
          />
        }
      >
        <ServiceTransactionOutputExplorer
          transactionId={decodedTransactionId}
          role={decodedRole}
          routeBase="/god-mode/service-transactions"
        />
      </HeaderUnclutterScope>
    </div>
  );
}
