import { SupportServiceOfferWorkbench } from "@/components/god-mode/support-services-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE } from "@/lib/publisher-portal-routes";
import { getPublisherSupportServicesProvider } from "@/lib/publisher-support-services-server";

export default async function PublisherServiceOfferWizardPage() {
  const { provider } = await getPublisherSupportServicesProvider();
  const t = (text: string) => appText("es", text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Support services")}
            title={t("Create a service offer")}
            description={t("Build your service offer one step at a time.")}
          />
        }
      >
        <SupportServiceOfferWorkbench
          mode="create"
          presentation="wizard"
          routeBase={PUBLISHER_PORTAL_SERVICE_OFFERS_ROUTE}
          fixedProvider={provider}
          canDelete={false}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
