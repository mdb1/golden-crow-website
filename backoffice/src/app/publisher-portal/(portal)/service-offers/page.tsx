import { SupportServicesBrowser } from "@/components/god-mode/support-services-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE } from "@/lib/publisher-portal-routes";
import { requirePublisherSupportServicesAccess } from "@/lib/publisher-support-services-server";

export default async function PublisherServiceOffersPage() {
  await requirePublisherSupportServicesAccess();
  const t = (text: string) => appText("es", text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Support services")}
            title={t("Service Offers")}
            description={t("Manage your Pocket Genes service offers.")}
          />
        }
      >
        <SupportServicesBrowser
          kind="offers"
          routeBase={PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE}
          canCreate
          canDelete={false}
          publisherPresentation
        />
      </HeaderUnclutterScope>
    </div>
  );
}
