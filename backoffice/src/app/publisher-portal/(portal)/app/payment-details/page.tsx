import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PublisherAppPaymentDetails } from "@/components/publisher-app-information";
import { loadPublisherAppPageData } from "@/lib/publisher-app-config-server";
import { PUBLISHER_PORTAL_APP_EDIT_ROUTE, PUBLISHER_PORTAL_APP_NEW_ROUTE } from "@/lib/publisher-portal-routes";

export default async function PublisherAppPaymentDetailsPage() {
  const { config } = await loadPublisherAppPageData();
  if (!config) redirect(PUBLISHER_PORTAL_APP_NEW_ROUTE);
  if (config.status !== "active_waiting_for_payment") redirect(PUBLISHER_PORTAL_APP_EDIT_ROUTE);
  return (
    <HeaderUnclutterScope header={<PageHero eyebrow="Portal de publicadores" title="Información de pago" description="Importes según las plataformas habilitadas y contacto para coordinar el pago." />}>
      <PublisherAppPaymentDetails config={config} />
    </HeaderUnclutterScope>
  );
}
