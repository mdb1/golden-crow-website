import { DiscoverFeedEntryBrowser } from "@/components/discover/feed-entry-browser";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverFullAdmin } from "@/lib/discover-server";
import type {
  DiscoverFeedItemsPage,
  DiscoverOrganizationsPage,
} from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function DiscoverFeedEntriesPage() {
  await requireDiscoverFullAdmin();

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const [feedPage, organizationsPage] = await Promise.all([
    sdkFetchServer<DiscoverFeedItemsPage>("/discover/feed-items"),
    sdkFetchServer<DiscoverOrganizationsPage>("/discover/organizations?limit=50"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Discover")}
            title={t("Feed entries")}
            description={t("Manage feed_items documents that the mobile apps read for Discover.")}
          />
        }
      >
        <DiscoverFeedEntryBrowser
          initialFeedItems={feedPage.feedItems}
          initialNextCursor={feedPage.nextCursor}
          organizations={organizationsPage.organizations}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
