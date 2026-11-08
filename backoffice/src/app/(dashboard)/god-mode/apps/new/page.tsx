import { redirect } from "next/navigation";
import { GodModeNewPublisherApp } from "@/components/god-mode/new-publisher-app";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function GodModeNewAppPage() {
  const adminContext = await getAdminContextServer();
  if (!adminContext.isBootstrap) {
    redirect("/2pq-dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow="GOD MODE"
            title="Nueva app"
            description="Elegí una organización para crear su app con el asistente del portal de publicadores."
          />
        }
      >
        <GodModeNewPublisherApp />
      </HeaderUnclutterScope>
    </div>
  );
}
