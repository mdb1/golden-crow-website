import { redirect } from "next/navigation";
import { DiscoverOrganizationProductCatalogWorkbench } from "@/components/discover/organization-product-catalog-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverOrganizationRecord } from "@/lib/discover";
import { appText } from "@/lib/language";
import {
  PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE,
  publisherPortalIndividualDetailRoute,
  publisherPortalOrganizationDetailRoute,
} from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function NewPublisherPortalOrganizationProductCatalogItemPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "individual_publisher") {
    redirect(
      adminContext.individualId
        ? publisherPortalIndividualDetailRoute(adminContext.individualId)
        : PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE,
    );
  }

  const { organizationId } = await params;
  const t = (text: string) => appText("es", text);

  let organization: DiscoverOrganizationRecord;
  try {
    const response = await sdkFetchServer<{ organization: DiscoverOrganizationRecord }>(
      `/discover/organizations/${encodeURIComponent(organizationId)}`,
    );
    organization = response.organization;
  } catch {
    const ownOrganizationRoute =
      adminContext.organizationId &&
      publisherPortalOrganizationDetailRoute(adminContext.organizationId);
    redirect(ownOrganizationRoute ?? PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE);
  }

  const organizationHref = publisherPortalOrganizationDetailRoute(organization.id);
  const routeBase = `${organizationHref}/product-catalog`;

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Publisher portal")}
            title={t("Add product to catalog")}
            description={t("Add a product to this organization's catalog.")}
          />
        }
      >
        <DiscoverOrganizationProductCatalogWorkbench
          organization={organization}
          mode="create"
          routeBase={routeBase}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
