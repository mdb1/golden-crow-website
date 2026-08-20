import { DiscoverFeedEntryWorkbench } from "@/components/discover/feed-entry-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverOrganizationsPage } from "@/lib/discover";
import type { DiscoverIndividualsPage } from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function NewDiscoverFeedEntryPage() {
  const adminContext = await requireDiscoverAccess();

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
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
            eyebrow={t("Discover")}
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
        />
      </HeaderUnclutterScope>
    </div>
  );
}
