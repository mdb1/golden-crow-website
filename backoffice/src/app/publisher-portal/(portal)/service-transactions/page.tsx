import { SupportServicesBrowser } from "@/components/god-mode/support-services-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE } from "@/lib/publisher-portal-routes";
import { requireOrganizationPublisher } from "@/lib/publisher-support-services-server";

export default async function PublisherServiceTransactionsPage() {
  await requireOrganizationPublisher();
  const t = (text: string) => appText("es", text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Support services")}
            title={t("Service Requests")}
            description={t(
              "Manage requests linked to your organization's service offers.",
            )}
          />
        }
      >
        <SupportServicesBrowser
          kind="transactions"
          routeBase={PUBLISHER_PORTAL_SERVICE_TRANSACTIONS_ROUTE}
          canCreate={false}
          canDelete={false}
          publisherPresentation
          displayTitle="Service Requests"
          recordColumnLabel="Service Request"
        />
      </HeaderUnclutterScope>
    </div>
  );
}
