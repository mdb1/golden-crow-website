import { DiscoverOrganizationBrowser } from "@/components/discover/organization-browser";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverFullAdmin } from "@/lib/discover-server";
import type { DiscoverOrganizationsPage } from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function DiscoverOrganizationsPage() {
  await requireDiscoverFullAdmin();

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const page = await sdkFetchServer<DiscoverOrganizationsPage>(
    "/discover/organizations",
  );

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Discover")}
            title={t("Organizations")}
            description={t("Manage feed_organizations publishers used by Discover feed entries.")}
          />
        }
      >
        <DiscoverOrganizationBrowser
          initialOrganizations={page.organizations}
          initialNextCursor={page.nextCursor}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
