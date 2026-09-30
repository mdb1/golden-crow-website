import { ADMIN_ROLE_LABELS, type MyAccountRecord } from "@/lib/admin-areas";
import { PublisherPortalHome } from "@/components/publisher-portal-home";
import type { DiscoverFeedItemsPage } from "@/lib/discover";
import { appText } from "@/lib/language";
import {
  publisherPortalIndividualDetailRoute,
  publisherPortalOrganizationDetailRoute,
} from "@/lib/publisher-portal-routes";
import { sdkFetchServer } from "@/lib/sdk-server";
import type { SupportServiceOffersPage } from "@/lib/support-services";

async function loadFeedEntryPresence(status: "draft" | "published") {
  const page = await sdkFetchServer<DiscoverFeedItemsPage>(
    `/discover/feed-items?limit=1&status=${status}`,
  );
  return page.feedItems.length > 0;
}

async function loadServiceOfferPresence(status?: "active") {
  const statusQuery = status ? `&status=${status}` : "";
  const page = await sdkFetchServer<SupportServiceOffersPage>(
    `/admin/support-services/offers?limit=1${statusQuery}`,
  );
  return page.offers.length > 0;
}

export default async function PublisherPortalHomePage() {
  const accountRequest = sdkFetchServer<{ account: MyAccountRecord }>(
    "/auth/my-account",
  );
  const serviceOfferPresenceRequest = accountRequest.then(
    async ({ account }): Promise<[boolean, boolean]> => {
      const publisherId =
        account.context.role === "organization_publisher"
          ? account.context.organizationId?.trim()
          : account.context.role === "individual_publisher"
            ? account.context.individualId?.trim()
            : undefined;
      if (!publisherId) {
        return [false, false];
      }

      return Promise.all([
        loadServiceOfferPresence(),
        loadServiceOfferPresence("active"),
      ]);
    },
  );
  const [
    { account },
    hasPublishedFeedEntry,
    hasDraftFeedEntry,
    [hasServiceOffer, hasActiveServiceOffer],
  ] = await Promise.all([
    accountRequest,
    loadFeedEntryPresence("published"),
    loadFeedEntryPresence("draft"),
    serviceOfferPresenceRequest,
  ]);
  const displayName =
    account.role?.displayName ||
    account.auth.displayName ||
    account.context.email;
  const roleLabel = appText(
    "es",
    account.role
      ? ADMIN_ROLE_LABELS[account.role.role]
      : ADMIN_ROLE_LABELS[account.context.role],
  );
  const organizationId = account.context.organizationId?.trim();
  const individualId = account.context.individualId?.trim();
  const publisherProfileHref =
    account.context.role === "organization_publisher" && organizationId
      ? publisherPortalOrganizationDetailRoute(organizationId)
      : account.context.role === "individual_publisher" && individualId
        ? publisherPortalIndividualDetailRoute(individualId)
        : undefined;

  return (
    <PublisherPortalHome
      displayName={displayName}
      email={account.context.email}
      roleLabel={roleLabel}
      hasPublishedFeedEntry={hasPublishedFeedEntry}
      hasDraftFeedEntry={hasDraftFeedEntry}
      hasServiceOffer={hasServiceOffer}
      hasActiveServiceOffer={hasActiveServiceOffer}
      publisherProfileHref={publisherProfileHref}
    />
  );
}
