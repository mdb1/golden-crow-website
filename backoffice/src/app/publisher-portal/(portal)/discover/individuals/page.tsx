import { redirect } from "next/navigation";
import { requireDiscoverAccess } from "@/lib/discover-server";
import {
  PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE,
  publisherPortalIndividualDetailRoute,
  publisherPortalOrganizationDetailRoute,
} from "@/lib/publisher-portal-routes";

export default async function PublisherPortalIndividualsPage() {
  const adminContext = await requireDiscoverAccess();
  if (adminContext.role === "organization_publisher") {
    redirect(
      adminContext.organizationId
        ? publisherPortalOrganizationDetailRoute(adminContext.organizationId)
        : PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE,
    );
  }

  redirect(
    adminContext.role === "individual_publisher" && adminContext.individualId
      ? publisherPortalIndividualDetailRoute(adminContext.individualId)
      : PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE,
  );
}
