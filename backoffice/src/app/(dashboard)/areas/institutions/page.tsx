import { AreaAccessEntry } from "@/components/area-access-entry";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { InstitutionBrowser } from "@/components/areas/institution-browser";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { InstitutionListItem } from "@/lib/admin-areas";
import { canCreateInstitutionUi } from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function InstitutionsPage() {
  const adminContext = await getAdminContextServer();
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { institutions } = await sdkFetchServer<{ institutions: InstitutionListItem[] }>(
    "/areas/institutions"
  );
  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Areas")}
            title={t("Institutions")}
            description={
              adminContext.role === "full_admin"
                ? t("Global institution index with editable descriptors, doctor counts, patient totals, and local admin coverage.")
                : t("Your institution scope starts here. Review the institution record first, then move into doctors, patients, and local role assignments.")
            }
          />
        }
      >
        <AreaAccessEntry
          accessHref="/areas/institutions/access"
          createHref="/areas/institutions/new"
          canCreate={canCreateInstitutionUi(adminContext)}
          createLabel="Create institution"
        />
        <InstitutionBrowser initialInstitutions={institutions} />
      </HeaderUnclutterScope>
    </div>
  );
}
