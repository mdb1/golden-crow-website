import { SupportServiceOfferWorkbench } from "@/components/god-mode/support-services-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE } from "@/lib/publisher-portal-routes";
import { getPublisherSupportServicesProvider } from "@/lib/publisher-support-services-server";

export default async function PublisherServiceOfferDetailPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const [{ offerId }, { provider }] = await Promise.all([
    params,
    getPublisherSupportServicesProvider(),
  ]);
  const t = (text: string) => appText("es", text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Support services")}
            title={t("Service Offer")}
            description={t("Edit your Pocket Genes service offer.")}
          />
        }
      >
        <SupportServiceOfferWorkbench
          mode="edit"
          offerId={decodeURIComponent(offerId)}
          routeBase={PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE}
          fixedProvider={provider}
          canDelete={false}
          publisherEditorPresentation
        />
      </HeaderUnclutterScope>
    </div>
  );
}
