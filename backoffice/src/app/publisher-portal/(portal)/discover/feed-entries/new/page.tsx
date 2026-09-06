import { DiscoverFeedEntryWorkbench } from "@/components/discover/feed-entry-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type {
  DiscoverIndividualsPage,
  DiscoverOrganizationsPage,
} from "@/lib/discover";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE } from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function NewPublisherPortalFeedEntryPage() {
  const adminContext = await requireDiscoverAccess();
  const t = (text: string) => appText("es", text);
  const [organizationsPage, individualsPage] = await Promise.all([
    adminContext.role === "individual_publisher"
      ? Promise.resolve({ organizations: [], nextCursor: null })
      : sdkFetchServer<DiscoverOrganizationsPage>(
          "/discover/organizations?limit=50",
        ),
    adminContext.role === "organization_publisher"
      ? Promise.resolve({ individuals: [], nextCursor: null })
      : sdkFetchServer<DiscoverIndividualsPage>(
          "/discover/individuals?limit=50",
        ),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Publisher portal")}
            title={t("Create feed entry")}
            description={t("Create a feed_items document with one type-specific payload and an automatic publisher snapshot.")}
          />
        }
      >
        <DiscoverFeedEntryWorkbench
          mode="create"
          initialOrganizations={organizationsPage.organizations}
          initialOrganizationsNextCursor={organizationsPage.nextCursor}
          initialIndividuals={individualsPage.individuals}
          initialIndividualsNextCursor={individualsPage.nextCursor}
          scopedOrganizationId={adminContext.organizationId}
          scopedIndividualId={adminContext.individualId}
          routeBase={PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
