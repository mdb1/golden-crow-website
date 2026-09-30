import { ADMIN_ROLE_LABELS, type MyAccountRecord } from "@/lib/admin-areas";
import { PublisherPortalHome } from "@/components/publisher-portal-home";
import type { DiscoverFeedItemsPage } from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";
import type { SupportServiceOffersPage } from "@/lib/support-services";

async function loadFeedEntryPresence(status: "draft" | "published") {
  const page = await sdkFetchServer<DiscoverFeedItemsPage>(
    `/discover/feed-items?limit=1&status=${status}`,
  );
  return page.feedItems.length > 0;
}

async function loadServiceOfferPresence() {
  const page = await sdkFetchServer<SupportServiceOffersPage>(
    "/admin/support-services/offers?limit=1",
  );
  return page.offers.length > 0;
}

export default async function PublisherPortalHomePage() {
  const accountRequest = sdkFetchServer<{ account: MyAccountRecord }>(
    "/auth/my-account",
  );
  const serviceOfferPresenceRequest = accountRequest.then(({ account }) =>
    account.context.role === "organization_publisher" &&
    account.context.organizationId
      ? loadServiceOfferPresence()
      : false,
  );
  const [
    { account },
    hasPublishedFeedEntry,
    hasDraftFeedEntry,
    hasServiceOffer,
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

  return (
    <PublisherPortalHome
      displayName={displayName}
      email={account.context.email}
      roleLabel={roleLabel}
      hasPublishedFeedEntry={hasPublishedFeedEntry}
      hasDraftFeedEntry={hasDraftFeedEntry}
      hasServiceOffer={hasServiceOffer}
      organizationId={
        account.context.role === "organization_publisher"
          ? account.context.organizationId
          : undefined
      }
    />
  );
}
