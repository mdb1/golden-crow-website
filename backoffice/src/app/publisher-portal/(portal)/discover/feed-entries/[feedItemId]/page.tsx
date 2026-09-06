import { redirect } from "next/navigation";
import { DiscoverFeedEntryWorkbench } from "@/components/discover/feed-entry-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type {
  DiscoverFeedItemRecord,
  DiscoverIndividualRecord,
  DiscoverIndividualsPage,
  DiscoverOrganizationRecord,
  DiscoverOrganizationsPage,
} from "@/lib/discover";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE } from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PublisherPortalFeedEntryDetailPage({
  params,
}: {
  params: Promise<{ feedItemId: string }>;
}) {
  const adminContext = await requireDiscoverAccess();
  const { feedItemId } = await params;
  const t = (text: string) => appText("es", text);

  let feedItem: DiscoverFeedItemRecord;
  try {
    const response = await sdkFetchServer<{ feedItem: DiscoverFeedItemRecord }>(
      `/discover/feed-items/${encodeURIComponent(feedItemId)}`,
    );
    feedItem = response.feedItem;
  } catch {
    redirect(PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE);
  }

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
  let organizations = organizationsPage.organizations;
  if (
    feedItem.publisherOrganizationId &&
    !organizations.some(
      (organization) => organization.id === feedItem.publisherOrganizationId,
    )
  ) {
    try {
      const response = await sdkFetchServer<{ organization: DiscoverOrganizationRecord }>(
        `/discover/organizations/${encodeURIComponent(feedItem.publisherOrganizationId)}`,
      );
      organizations = [response.organization, ...organizations];
    } catch {
      // The feed item still carries publisherSnapshot for editing and preview.
    }
  }
  let individuals = individualsPage.individuals;
  if (
    feedItem.publisherIndividualId &&
    !individuals.some(
      (individual) => individual.id === feedItem.publisherIndividualId,
    )
  ) {
    try {
      const response = await sdkFetchServer<{ individual: DiscoverIndividualRecord }>(
        `/discover/individuals/${encodeURIComponent(feedItem.publisherIndividualId)}`,
      );
      individuals = [response.individual, ...individuals];
    } catch {
      // The feed item still carries publisherSnapshot for editing and preview.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Publisher portal")}
            title={t("Feed entry")}
            description={t("Edit one feed_items document while preserving the mobile app field contract.")}
          />
        }
      >
        <DiscoverFeedEntryWorkbench
          feedItem={feedItem}
          initialOrganizations={organizations}
          initialOrganizationsNextCursor={organizationsPage.nextCursor}
          initialIndividuals={individuals}
          initialIndividualsNextCursor={individualsPage.nextCursor}
          scopedOrganizationId={adminContext.organizationId}
          scopedIndividualId={adminContext.individualId}
          routeBase={PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
