import { redirect } from "next/navigation";
import { DiscoverIndividualBrowser } from "@/components/discover/organization-browser";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverIndividualsPage } from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function DiscoverIndividualsPage() {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "organization_publisher") {
    redirect("/discover/organizations");
  }

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const page = await sdkFetchServer<DiscoverIndividualsPage>(
    "/discover/individuals",
  );

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Discover")}
            title={t("Individual Publishers")}
            description={t("Manage feed_individuals publishers used by Discover feed entries.")}
          />
        }
      >
        <DiscoverIndividualBrowser
          initialIndividuals={page.individuals}
          initialNextCursor={page.nextCursor}
          canCreateIndividuals={adminContext.role === "full_admin"}
          canManageIndividualStatus={adminContext.role === "full_admin"}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
