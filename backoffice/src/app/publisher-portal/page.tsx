import { redirect } from "next/navigation";
import { PUBLISHER_PORTAL_ENTRY_ROUTE } from "@/lib/publisher-portal-routes";

export default function PublisherPortalPage() {
  redirect(PUBLISHER_PORTAL_ENTRY_ROUTE);
}
