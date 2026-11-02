import { redirect } from "next/navigation";
import { GodModePublisherAppsBrowser } from "@/components/god-mode/publisher-apps-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function GodModeAppsPage() {
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
            title="Apps"
            description="Review and edit every publisher app configuration."
          />
        }
      >
        <GodModePublisherAppsBrowser />
      </HeaderUnclutterScope>
    </div>
  );
}
