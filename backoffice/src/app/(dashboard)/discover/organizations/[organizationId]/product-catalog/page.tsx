import { redirect } from "next/navigation";
import { DiscoverOrganizationProductCatalogBrowser } from "@/components/discover/organization-product-catalog-browser";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverOrganizationRecord } from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function DiscoverOrganizationProductCatalogPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "individual_publisher") {
    redirect("/discover/individuals");
  }

  const { organizationId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  let organization: DiscoverOrganizationRecord;
  try {
    const response = await sdkFetchServer<{ organization: DiscoverOrganizationRecord }>(
      `/discover/organizations/${encodeURIComponent(organizationId)}`,
    );
    organization = response.organization;
  } catch {
    redirect("/discover/organizations");
  }

  const organizationHref = `/discover/organizations/${encodeURIComponent(
    organization.id,
  )}`;
  const routeBase = `${organizationHref}/product-catalog`;

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Discover")}
            title={t("Product catalog")}
            description={t("Manage organization-owned productCatalog items.")}
          />
        }
      >
        <DiscoverOrganizationProductCatalogBrowser
          organization={organization}
          routeBase={routeBase}
          organizationHref={organizationHref}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
