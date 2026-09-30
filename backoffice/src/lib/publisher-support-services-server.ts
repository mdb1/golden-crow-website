import "server-only";

import { redirect } from "next/navigation";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type {
  DiscoverIndividualRecord,
  DiscoverOrganizationRecord,
} from "@/lib/discover";
import { PUBLISHER_PORTAL_HOME_ROUTE } from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";
import type { SupportServiceProviderKind } from "@/lib/support-services";

export async function requirePublisherSupportServicesAccess() {
  const adminContext = await getAdminContextServer();
  const organizationId = adminContext.organizationId?.trim();
  const individualId = adminContext.individualId?.trim();

  const provider =
    adminContext.role === "organization_publisher" && organizationId
      ? {
          providerKind: "organization" as const,
          providerId: organizationId,
        }
      : adminContext.role === "individual_publisher" && individualId
        ? {
            providerKind: "individual" as const,
            providerId: individualId,
          }
        : null;

  if (!adminContext.canAccessPublisherPortal || !provider) {
    redirect(PUBLISHER_PORTAL_HOME_ROUTE);
  }

  return {
    adminContext,
    ...provider,
  };
}

export async function getPublisherSupportServicesProvider() {
  const { adminContext, providerKind, providerId } =
    await requirePublisherSupportServicesAccess();

  try {
    const provider = await loadPublisherProvider(providerKind, providerId);
    return {
      adminContext,
      provider: {
        id: provider.id,
        name: provider.name,
        kind: providerKind,
      },
    };
  } catch {
    redirect(PUBLISHER_PORTAL_HOME_ROUTE);
  }
}

async function loadPublisherProvider(
  providerKind: SupportServiceProviderKind,
  providerId: string,
) {
  if (providerKind === "individual") {
    const response = await sdkFetchServer<{
      individual: DiscoverIndividualRecord;
    }>(`/discover/individuals/${encodeURIComponent(providerId)}`);
    return response.individual;
  }

  const response = await sdkFetchServer<{
    organization: DiscoverOrganizationRecord;
  }>(`/discover/organizations/${encodeURIComponent(providerId)}`);
  return response.organization;
}
