import { SupportServiceTransactionWorkbench } from "@/components/god-mode/support-services-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { notFound } from "next/navigation";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE } from "@/lib/publisher-portal-routes";
import { requirePublisherSupportServicesAccess } from "@/lib/publisher-support-services-server";

export default async function PublisherServiceTransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const [{ transactionId }] = await Promise.all([
    params,
    requirePublisherSupportServicesAccess(),
  ]);
  const decodedTransactionId = decodeURIComponent(transactionId);
  if (decodedTransactionId === "new") {
    notFound();
  }
  const t = (text: string) => appText("es", text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Support services")}
            title={t("Service Transaction")}
            description={t("Manage this service transaction.")}
          />
        }
      >
        <SupportServiceTransactionWorkbench
          mode="edit"
          transactionId={decodedTransactionId}
          routeBase={PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE}
          canDelete={false}
          showLockedFields
        />
      </HeaderUnclutterScope>
    </div>
  );
}
