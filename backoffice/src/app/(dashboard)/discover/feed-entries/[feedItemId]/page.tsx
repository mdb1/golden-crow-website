import { redirect } from "next/navigation";
import { DiscoverFeedEntryWorkbench } from "@/components/discover/feed-entry-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverFullAdmin } from "@/lib/discover-server";
import type {
  DiscoverFeedItemRecord,
  DiscoverOrganizationRecord,
  DiscoverOrganizationsPage,
} from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function DiscoverFeedEntryDetailPage({
  params,
}: {
  params: Promise<{ feedItemId: string }>;
}) {
  await requireDiscoverFullAdmin();

  const { feedItemId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  let feedItem: DiscoverFeedItemRecord;
  try {
    const response = await sdkFetchServer<{ feedItem: DiscoverFeedItemRecord }>(
      `/discover/feed-items/${encodeURIComponent(feedItemId)}`,
    );
    feedItem = response.feedItem;
  } catch {
    redirect("/discover/feed-entries");
  }

  const organizationsPage = await sdkFetchServer<DiscoverOrganizationsPage>(
    "/discover/organizations?limit=50",
  );
  let organizations = organizationsPage.organizations;
  if (
    feedItem.publisherOrganizationId &&
    !organizations.some((organization) => organization.id === feedItem.publisherOrganizationId)
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

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Discover")}
            title={t("Feed entry")}
            description={t("Edit one feed_items document while preserving the mobile app field contract.")}
          />
        }
      >
        <DiscoverFeedEntryWorkbench
          feedItem={feedItem}
          initialOrganizations={organizations}
          initialOrganizationsNextCursor={organizationsPage.nextCursor}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
