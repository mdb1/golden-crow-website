import { redirect } from "next/navigation";
import { DiscoverOrganizationWorkbench } from "@/components/discover/organization-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverOrganizationRecord } from "@/lib/discover";
import { appText } from "@/lib/language";
import {
  PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE,
} from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PublisherPortalOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "individual_publisher") {
    redirect(PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE);
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
    redirect(PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE);
  }

  const canDeleteOwnPublisher =
    adminContext.role === "organization_publisher" &&
    adminContext.organizationId === organization.id;

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Publisher portal")}
            title={organization.name}
            description={t("Edit the canonical publisher record used by Discover feed entries.")}
          />
        }
      >
        <DiscoverOrganizationWorkbench
          organization={organization}
          canManageSystemFields={false}
          canDeletePublisher={canDeleteOwnPublisher}
          deleteSuccessAction="publisher-login"
          routeBase={PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
