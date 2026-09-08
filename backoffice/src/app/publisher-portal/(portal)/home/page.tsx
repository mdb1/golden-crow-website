import { ADMIN_ROLE_LABELS, type MyAccountRecord } from "@/lib/admin-areas";
import { PublisherPortalHome } from "@/components/publisher-portal-home";
import type { DiscoverFeedItemsPage } from "@/lib/discover";
import { appText } from "@/lib/language";
import { sdkFetchServer } from "@/lib/sdk-server";

async function loadPublishedFeedEntryPresence() {
  const page = await sdkFetchServer<DiscoverFeedItemsPage>(
    "/discover/feed-items?limit=1&status=published",
  );
  return page.feedItems.length > 0;
}

export default async function PublisherPortalHomePage() {
  const [{ account }, hasPublishedFeedEntry] = await Promise.all([
    sdkFetchServer<{ account: MyAccountRecord }>("/auth/my-account"),
    loadPublishedFeedEntryPresence(),
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
      organizationId={
        account.context.role === "organization_publisher"
          ? account.context.organizationId
          : undefined
      }
    />
  );
}
