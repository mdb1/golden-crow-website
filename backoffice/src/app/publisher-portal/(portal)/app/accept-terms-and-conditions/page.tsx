import { redirect } from "next/navigation";
import { PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE } from "@/lib/publisher-portal-routes";

export default function PublisherAppAcceptTermsPage() {
  redirect(PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE);
}
