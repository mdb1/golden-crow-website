import "server-only";

import { redirect } from "next/navigation";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { DiscoverOrganizationRecord } from "@/lib/discover";
import { PUBLISHER_PORTAL_HOME_ROUTE } from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";

export async function requireOrganizationPublisher() {
  const adminContext = await getAdminContextServer();
  if (
    adminContext.role !== "organization_publisher" ||
    !adminContext.canAccessPublisherPortal ||
    !adminContext.organizationId
  ) {
    redirect(PUBLISHER_PORTAL_HOME_ROUTE);
  }

  return {
    adminContext,
    organizationId: adminContext.organizationId,
  };
}

export async function getOrganizationPublisherProvider() {
  const { adminContext, organizationId } =
    await requireOrganizationPublisher();

  try {
    const response = await sdkFetchServer<{
      organization: DiscoverOrganizationRecord;
    }>(`/discover/organizations/${encodeURIComponent(organizationId)}`);
    return {
      adminContext,
      provider: {
        id: response.organization.id,
        name: response.organization.name,
      },
    };
  } catch {
    redirect(PUBLISHER_PORTAL_HOME_ROUTE);
  }
}
