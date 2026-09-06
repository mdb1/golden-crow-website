import { redirect } from "next/navigation";
import { DiscoverOrganizationBrowser } from "@/components/discover/organization-browser";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverOrganizationsPage } from "@/lib/discover";
import { appText } from "@/lib/language";
import {
  PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE,
} from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PublisherPortalOrganizationsPage() {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "individual_publisher") {
    redirect(PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE);
  }

  const t = (text: string) => appText("es", text);
  const page = await sdkFetchServer<DiscoverOrganizationsPage>(
    "/discover/organizations",
  );

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Publisher portal")}
            title={t("Publisher profile")}
            description={t("Manage feed_organizations publishers used by Discover feed entries.")}
          />
        }
      >
        <DiscoverOrganizationBrowser
          initialOrganizations={page.organizations}
          initialNextCursor={page.nextCursor}
          canCreateOrganizations={false}
          canManageOrganizationStatus={false}
          routeBase={PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
