import { AreaAccessEntry } from "@/components/area-access-entry";
import { HelperBanner } from "@/components/helper-banner";
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
      <PageHero
        eyebrow={t("Areas")}
        title={t("Institutions")}
        description={
          adminContext.role === "full_admin"
            ? t("Global institution index with editable descriptors, doctor counts, patient totals, and local admin coverage.")
            : t("Your institution scope starts here. Review the institution record first, then move into doctors, patients, and local role assignments.")
        }
      />
      <HelperBanner title={t("Institution scope is the root of the new areas model.")} tone="blue">
        {t("Every institution-scoped role, doctor, and patient record hangs off one institution. Full admins can create new institutions; institution admins, institution operators, and doctors stay inside their single institution boundary.")}
      </HelperBanner>
      <AreaAccessEntry
        accessHref="/areas/institutions/access"
        createHref="/areas/institutions/new"
        canCreate={canCreateInstitutionUi(adminContext)}
        createLabel="Create institution"
        description="Access review and institution creation now start from their own dedicated screens instead of this main area page."
      />
      <InstitutionBrowser initialInstitutions={institutions} />
    </div>
  );
}
