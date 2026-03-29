import { AreaAccessEntry } from "@/components/area-access-entry";
import { HelperBanner } from "@/components/helper-banner";
import { InstitutionBrowser } from "@/components/areas/institution-browser";
import { PageHero } from "@/components/page-hero";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { InstitutionListItem } from "@/lib/admin-areas";
import { canCreateInstitutionUi } from "@/lib/areas-ui";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function InstitutionsPage() {
  const adminContext = await getAdminContextServer();
  const { institutions } = await sdkFetchServer<{ institutions: InstitutionListItem[] }>(
    "/areas/institutions"
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Areas"
        title="Institutions"
        description={
          adminContext.role === "full_admin"
            ? "Global institution index with editable descriptors, doctor counts, patient totals, and local admin coverage."
            : "Your institution scope starts here. Review the institution record first, then move into doctors, patients, and local role assignments."
        }
      />
      <HelperBanner title="Institution scope is the root of the new areas model." tone="blue">
        Every institution-scoped role, doctor, and patient record hangs off one institution.
        Full admins can create new institutions; institution admins and doctors stay inside their single institution boundary.
      </HelperBanner>
      <AreaAccessEntry
        accessHref="/areas/institutions/access"
        createHref="/areas/institutions/new"
        canCreate={canCreateInstitutionUi(adminContext)}
        description="Access review and institution creation now start from their own dedicated screens instead of this main area page."
      />
      <InstitutionBrowser initialInstitutions={institutions} />
    </div>
  );
}
