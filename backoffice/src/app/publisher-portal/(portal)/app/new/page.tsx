import { redirect } from "next/navigation";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PublisherAppConfigWorkbench } from "@/components/publisher-app-config-workbench";
import { loadPublisherAppPageData } from "@/lib/publisher-app-config-server";
import { PUBLISHER_PORTAL_APP_EDIT_ROUTE } from "@/lib/publisher-portal-routes";

export default async function NewPublisherAppPage() {
  const data = await loadPublisherAppPageData();
  if (data.config) {
    redirect(PUBLISHER_PORTAL_APP_EDIT_ROUTE);
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="Portal de publicadores"
            title="Creá tu app"
            description="Elegí las plataformas, funciones y colores de la app de tu marca."
          />
        }
      >
        <PublisherAppConfigWorkbench
          mode="create"
          publisherName={data.publisherName}
          publisherTint={data.publisherTint}
          publisherEmail={data.publisherEmail}
          publisherUsername={data.publisherUsername}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
