import { DiscoverOrganizationWorkbench } from "@/components/discover/organization-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverFullAdmin } from "@/lib/discover-server";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function NewDiscoverOrganizationPage() {
  await requireDiscoverFullAdmin();

  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Discover")}
            title={t("Create organization")}
            description={t("Create a canonical feed_organizations publisher for Discover feed entries.")}
          />
        }
      >
        <DiscoverOrganizationWorkbench mode="create" />
      </HeaderUnclutterScope>
    </div>
  );
}
