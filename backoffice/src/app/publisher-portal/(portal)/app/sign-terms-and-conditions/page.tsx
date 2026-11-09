import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PublisherAppPublicationWorkbench } from "@/components/publisher-app-publication-workbench";
import { loadPublisherAppPageData } from "@/lib/publisher-app-config-server";
import { PUBLISHER_PORTAL_APP_EDIT_ROUTE, PUBLISHER_PORTAL_APP_NEW_ROUTE } from "@/lib/publisher-portal-routes";

export default async function PublisherAppSignTermsPage() {
  const { config } = await loadPublisherAppPageData();
  if (!config) redirect(PUBLISHER_PORTAL_APP_NEW_ROUTE);
  if (config.status !== "active_for_testing") redirect(PUBLISHER_PORTAL_APP_EDIT_ROUTE);
  return <HeaderUnclutterScope header={<PageHero eyebrow="Portal de publicadores" title="Publicar mi app" description="Revisá y aceptá las condiciones para solicitar la publicación." />}>
    <PublisherAppPublicationWorkbench config={config} />
  </HeaderUnclutterScope>;
}
