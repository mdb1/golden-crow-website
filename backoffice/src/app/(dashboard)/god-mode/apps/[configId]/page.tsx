import { notFound, redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PublisherAppConfigWorkbench } from "@/components/publisher-app-config-workbench";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { PublisherAppConfigResponse } from "@/lib/publisher-app-config";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function GodModeAppDetailPage({
  params,
}: {
  params: Promise<{ configId: string }>;
}) {
  const adminContext = await getAdminContextServer();
  if (!adminContext.isBootstrap) {
    redirect("/2pq-dashboard");
  }

  const { configId } = await params;
  const decodedConfigId = decodeURIComponent(configId);
  let response: PublisherAppConfigResponse;
  try {
    response = await sdkFetchServer<PublisherAppConfigResponse>(
      `/admin/publisher-app-configs/${encodeURIComponent(decodedConfigId)}`,
    );
  } catch {
    notFound();
  }
  const config = response.config;
  if (!config) {
    notFound();
  }
  const publisherImageUrl =
    config.iconSource === "publisher"
      ? (config.iconImageUrl ?? config.iconImageUploadDataUrl ?? undefined)
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="Edit App"
            description="Review the publisher app configuration and revision status."
          />
        }
      >
        <PublisherAppConfigWorkbench
          mode="edit"
          initialConfig={config}
          publisherName={config.publisherName}
          publisherTint={config.colors.primary}
          publisherImageUrl={publisherImageUrl}
          publisherEmail={config.publisherEmail}
          publisherUsername={config.publisherUsername}
          apiPath={`/admin/publisher-app-configs/${encodeURIComponent(config.id)}`}
          backHref="/god-mode/apps"
          backLabel="Volver a Apps"
          allowStatusEditing
          showDangerZone={false}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
