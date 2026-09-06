import { redirect } from "next/navigation";
import { DiscoverIndividualWorkbench } from "@/components/discover/organization-workbench";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { requireDiscoverAccess } from "@/lib/discover-server";
import type { DiscoverIndividualRecord } from "@/lib/discover";
import { appText } from "@/lib/language";
import {
  PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE,
} from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PublisherPortalIndividualDetailPage({
  params,
}: {
  params: Promise<{ individualId: string }>;
}) {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "organization_publisher") {
    redirect(PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE);
  }

  const { individualId } = await params;
  const t = (text: string) => appText("es", text);

  let individual: DiscoverIndividualRecord;
  try {
    const response = await sdkFetchServer<{ individual: DiscoverIndividualRecord }>(
      `/discover/individuals/${encodeURIComponent(individualId)}`,
    );
    individual = response.individual;
  } catch {
    redirect(PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE);
  }

  const canDeleteOwnPublisher =
    adminContext.role === "individual_publisher" &&
    adminContext.individualId === individual.id;

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Publisher portal")}
            title={individual.name}
            description={t("Edit the canonical individual publisher record used by Discover feed entries.")}
          />
        }
      >
        <DiscoverIndividualWorkbench
          individual={individual}
          canManageSystemFields={false}
          canDeletePublisher={canDeleteOwnPublisher}
          deleteSuccessAction="publisher-login"
          routeBase={PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE}
        />
      </HeaderUnclutterScope>
    </div>
  );
}
