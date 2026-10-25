import { notFound } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { ServiceTransactionOutputExplorer } from "@/components/service-transactions/output-file-explorer";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE } from "@/lib/publisher-portal-routes";
import { requirePublisherSupportServicesAccess } from "@/lib/publisher-support-services-server";

export default async function PublisherServiceTransactionOutputPage({
  params,
}: {
  params: Promise<{ transactionId: string; role: string }>;
}) {
  const [{ transactionId, role }] = await Promise.all([
    params,
    requirePublisherSupportServicesAccess(),
  ]);
  const decodedTransactionId = decodeURIComponent(transactionId);
  const decodedRole = decodeURIComponent(role);
  if (decodedTransactionId === "new" || !/^[a-z][a-z0-9_]*$/.test(decodedRole)) {
    notFound();
  }
  const t = (text: string) => appText("es", text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Output files")}
            title={t("Output file explorer")}
            description={t("Explore the finalized output content without changing it.")}
          />
        }
      >
        <ServiceTransactionOutputExplorer
          transactionId={decodedTransactionId}
          role={decodedRole}
          routeBase={PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
