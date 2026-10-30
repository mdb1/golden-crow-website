import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PublisherAppConfigWorkbench } from "@/components/publisher-app-config-workbench";
import { loadPublisherAppPageData } from "@/lib/publisher-app-config-server";
import { PUBLISHER_PORTAL_APP_NEW_ROUTE } from "@/lib/publisher-portal-routes";

export default async function EditPublisherAppPage() {
  const data = await loadPublisherAppPageData();
  if (!data.config) {
    redirect(PUBLISHER_PORTAL_APP_NEW_ROUTE);
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="Portal de publicadores"
            title="Editá tu app"
            description="Actualizá las plataformas, funciones y colores de la app de tu marca."
          />
        }
      >
        <PublisherAppConfigWorkbench
          mode="edit"
          initialConfig={data.config}
          publisherName={data.publisherName}
          publisherTint={data.publisherTint}
          publisherImageUrl={data.publisherImageUrl}
          publisherEmail={data.publisherEmail}
          publisherUsername={data.publisherUsername}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
