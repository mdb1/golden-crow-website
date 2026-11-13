import { getServerSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { TransportDispatcherProfileCompletion } from "@/components/auth/transport-dispatcher-profile-completion";
import { PGFLEX_LOGIN_ROUTE } from "@/lib/pgflex-routes";

export const dynamic = "force-dynamic";

export default async function PGFlexCompleteProfilePage() {
  const session = await getServerSession();
  if (!session) {
    redirect(PGFLEX_LOGIN_ROUTE);
  }

  if (session.user?.accessSurface !== "pgflex") {
    redirect("/2pq-dashboard");
  }

  return <TransportDispatcherProfileCompletion />;
}
