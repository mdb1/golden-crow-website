import { DiscoverFeedEntryBrowser } from "@/components/discover/feed-entry-browser";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type {
  DiscoverFeedItemsPage,
  DiscoverIndividualsPage,
  DiscoverOrganizationsPage,
} from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

async function loadDiscoverPageData<T>(path: string) {
  try {
    return { data: await sdkFetchServer<T>(path), failed: false };
  } catch (error) {
    console.error(`Discover feed entries initial load failed for ${path}:`, error);
    return { data: null, failed: true };
  }
}

export default async function DiscoverFeedEntriesPage() {
  const adminContext = await requireDiscoverAccess();

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const [feedPageResult, organizationsPageResult, individualsPageResult] = await Promise.all([
    loadDiscoverPageData<DiscoverFeedItemsPage>("/discover/feed-items"),
    adminContext.role === "individual_publisher"
      ? Promise.resolve({
          data: { organizations: [], nextCursor: null },
          failed: false,
        })
      : loadDiscoverPageData<DiscoverOrganizationsPage>("/discover/organizations?limit=50"),
    adminContext.role === "organization_publisher"
      ? Promise.resolve({
          data: { individuals: [], nextCursor: null },
          failed: false,
        })
      : loadDiscoverPageData<DiscoverIndividualsPage>("/discover/individuals?limit=50"),
  ]);
  const initialLoadError =
    feedPageResult.failed || organizationsPageResult.failed || individualsPageResult.failed
      ? t("Unable to load Discover data. Refresh the page or contact support if it repeats.")
      : null;

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
          initialFeedItems={feedPageResult.data?.feedItems ?? []}
          initialNextCursor={feedPageResult.data?.nextCursor ?? null}
          organizations={organizationsPageResult.data?.organizations ?? []}
          individuals={individualsPageResult.data?.individuals ?? []}
          initialLoadError={initialLoadError}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
