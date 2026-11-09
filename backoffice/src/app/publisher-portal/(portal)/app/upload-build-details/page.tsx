import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PublisherAppUploadBuildDetails } from "@/components/publisher-app-information";
import { loadPublisherAppPageData } from "@/lib/publisher-app-config-server";
import { PUBLISHER_PORTAL_APP_EDIT_ROUTE, PUBLISHER_PORTAL_APP_NEW_ROUTE } from "@/lib/publisher-portal-routes";

export default async function PublisherAppUploadBuildDetailsPage() {
  const { config } = await loadPublisherAppPageData();
  if (!config) redirect(PUBLISHER_PORTAL_APP_NEW_ROUTE);
  if (config.status !== "active_waiting_for_upload") redirect(PUBLISHER_PORTAL_APP_EDIT_ROUTE);
  return (
    <HeaderUnclutterScope header={<PageHero eyebrow="Portal de publicadores" title="Información de publicación" description="Preparación de cuentas, verificación de la organización y coordinación con nuestro equipo." />}>
      <PublisherAppUploadBuildDetails config={config} />
    </HeaderUnclutterScope>
  );
}
