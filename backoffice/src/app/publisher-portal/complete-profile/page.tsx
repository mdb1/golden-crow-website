import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PublisherProfileCompletion } from "@/components/auth/publisher-profile-completion";
import { authOptions } from "@/lib/auth";
import { PUBLISHER_PORTAL_LOGIN_ROUTE } from "@/lib/publisher-portal-routes";

export const dynamic = "force-dynamic";

export default async function PublisherPortalCompleteProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect(PUBLISHER_PORTAL_LOGIN_ROUTE);
  }

  if (session.user?.accessSurface !== "publisher-portal") {
    redirect("/2pq-dashboard");
  }

  return <PublisherProfileCompletion />;
}
