import "server-only";

import type { MyAccountRecord } from "@/lib/admin-areas";
import type {
  DiscoverIndividualRecord,
  DiscoverOrganizationRecord,
} from "@/lib/discover";
import type {
  PublisherAppConfig,
  PublisherAppConfigResponse,
} from "@/lib/publisher-app-config";
import { sdkFetchServer } from "@/lib/sdk-server";

export type PublisherAppPageData = {
  config: PublisherAppConfig | null;
  publisherName: string;
  publisherTint?: string;
  publisherEmail: string;
  publisherUsername: string;
};

export async function loadPublisherAppPageData(): Promise<PublisherAppPageData> {
  const [{ config }, { account }] = await Promise.all([
    sdkFetchServer<PublisherAppConfigResponse>("/publisher-app/config"),
    sdkFetchServer<{ account: MyAccountRecord }>("/auth/my-account"),
  ]);

  if (config) {
    return {
      config,
      publisherName: config.publisherName,
      publisherTint: config.colors.primary,
      publisherEmail: config.publisherEmail,
      publisherUsername: config.publisherUsername,
    };
  }

  const publisherEmail = account.context.email;
  const publisherUsername = account.profile?.username ?? "";
  const fallbackName =
    account.role?.displayName ||
    account.profile?.fullName ||
    account.auth.displayName ||
    publisherEmail;
  const organizationId = account.context.organizationId?.trim();
  const individualId = account.context.individualId?.trim();

  try {
    if (
      account.context.role === "organization_publisher" &&
      organizationId
    ) {
      const { organization } = await sdkFetchServer<{
        organization: DiscoverOrganizationRecord;
      }>(`/discover/organizations/${encodeURIComponent(organizationId)}`);

      return {
        config: null,
        publisherName: organization.name,
        publisherTint: organization.colorHex,
        publisherEmail,
        publisherUsername,
      };
    }

    if (account.context.role === "individual_publisher" && individualId) {
      const { individual } = await sdkFetchServer<{
        individual: DiscoverIndividualRecord;
      }>(`/discover/individuals/${encodeURIComponent(individualId)}`);

      return {
        config: null,
        publisherName: individual.name,
        publisherTint: individual.colorHex,
        publisherEmail,
        publisherUsername,
      };
    }
  } catch {
    // The configurator remains usable with the authenticated account identity.
  }

  return {
    config: null,
    publisherName: fallbackName,
    publisherEmail,
    publisherUsername,
  };
}
