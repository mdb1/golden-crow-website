import { SupportServiceOfferWorkbench } from "@/components/god-mode/support-services-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE } from "@/lib/publisher-portal-routes";
import { getOrganizationPublisherProvider } from "@/lib/publisher-support-services-server";

export default async function PublisherNewServiceOfferPage() {
  const { provider } = await getOrganizationPublisherProvider();
  const t = (text: string) => appText("es", text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Support services")}
            title={t("Alta de service offer")}
            description={t(
              "Create a Pocket Genes service offer for your organization.",
            )}
          />
        }
      >
        <SupportServiceOfferWorkbench
          mode="create"
          routeBase={PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE}
          fixedProvider={provider}
          canDelete={false}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
