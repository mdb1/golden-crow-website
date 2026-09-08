import { redirect } from "next/navigation";
import { DiscoverOrganizationProductCatalogWorkbench } from "@/components/discover/organization-product-catalog-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type {
  DiscoverOrganizationProductCatalogItem,
  DiscoverOrganizationRecord,
} from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getServerAppLanguage } from "@/lib/server-language";

export default async function DiscoverOrganizationProductCatalogItemPage({
  params,
}: {
  params: Promise<{ organizationId: string; catalogItemId: string }>;
}) {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "individual_publisher") {
    redirect("/discover/individuals");
  }

  const { organizationId, catalogItemId } = await params;
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);

  let organization: DiscoverOrganizationRecord;
  let catalogItem: DiscoverOrganizationProductCatalogItem;
  try {
    const [organizationResponse, catalogItemResponse] = await Promise.all([
      sdkFetchServer<{ organization: DiscoverOrganizationRecord }>(
        `/discover/organizations/${encodeURIComponent(organizationId)}`,
      ),
      sdkFetchServer<{
        catalogItem: DiscoverOrganizationProductCatalogItem;
      }>(
        `/discover/organizations/${encodeURIComponent(
          organizationId,
        )}/product-catalog/${encodeURIComponent(catalogItemId)}`,
      ),
    ]);
    organization = organizationResponse.organization;
    catalogItem = catalogItemResponse.catalogItem;
  } catch {
    redirect(
      `/discover/organizations/${encodeURIComponent(
        organizationId,
      )}/product-catalog`,
    );
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
            title={catalogItem.title}
            description={t("Edit one productCatalog item inside this organization record.")}
          />
        }
      >
        <DiscoverOrganizationProductCatalogWorkbench
          organization={organization}
          item={catalogItem}
          routeBase={routeBase}
          organizationHref={organizationHref}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
