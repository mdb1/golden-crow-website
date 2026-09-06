import { redirect } from "next/navigation";
import { DiscoverIndividualBrowser } from "@/components/discover/organization-browser";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverIndividualsPage } from "@/lib/discover";
import { appText } from "@/lib/language";
import {
  PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE,
} from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PublisherPortalIndividualsPage() {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "organization_publisher") {
    redirect(PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE);
  }

  const t = (text: string) => appText("es", text);
  const page = await sdkFetchServer<DiscoverIndividualsPage>(
    "/discover/individuals",
  );

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Publisher portal")}
            title={t("Publisher profile")}
            description={t("Manage feed_individuals publishers used by Discover feed entries.")}
          />
        }
      >
        <DiscoverIndividualBrowser
          initialIndividuals={page.individuals}
          initialNextCursor={page.nextCursor}
          canCreateIndividuals={false}
          canManageIndividualStatus={false}
          routeBase={PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
