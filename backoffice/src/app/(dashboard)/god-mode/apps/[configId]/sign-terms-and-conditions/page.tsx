import { notFound, redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PublisherAppPublicationWorkbench } from "@/components/publisher-app-publication-workbench";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { PublisherAppConfigResponse } from "@/lib/publisher-app-config";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function GodModeAppSignTermsPage({ params }: { params: Promise<{ configId: string }> }) {
  if (!(await getAdminContextServer()).isBootstrap) redirect("/2pq-dashboard");
  const { configId } = await params;
  const id = encodeURIComponent(decodeURIComponent(configId));
  const apiPath = `/admin/publisher-app-configs/${id}`;
  const editHref = `/god-mode/apps/${id}`;
  let response: PublisherAppConfigResponse;
  try { response = await sdkFetchServer<PublisherAppConfigResponse>(apiPath); }
  catch { notFound(); }
  if (!response.config) notFound();
  if (response.config.status !== "active_for_testing") redirect(editHref);
  return <HeaderUnclutterScope header={<PageHero eyebrow="GOD MODE" title="Publicar mi app" description="Revisá y aceptá las condiciones en representación del publicador." />}>
    <PublisherAppPublicationWorkbench config={response.config} apiPath={apiPath} editHref={editHref} backHref="/god-mode/apps" backLabel="Volver a Apps" />
  </HeaderUnclutterScope>;
}
