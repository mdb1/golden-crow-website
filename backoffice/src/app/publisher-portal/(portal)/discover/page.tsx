import { redirect } from "next/navigation";
import { PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE } from "@/lib/publisher-portal-routes";

export default function PublisherPortalDiscoverPage() {
  redirect(PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE);
}
