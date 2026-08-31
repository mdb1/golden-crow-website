import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CompleteProfileFlow } from "@/components/auth/complete-profile-flow";
import { authOptions } from "@/lib/auth";
import { PGFLEX_ENTRY_ROUTE, PGFLEX_LOGIN_ROUTE } from "@/lib/pgflex-routes";

export const dynamic = "force-dynamic";

export default async function PGFlexCompleteProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect(PGFLEX_LOGIN_ROUTE);
  }

  if (session.user?.accessSurface !== "pgflex") {
    redirect("/2pq-dashboard");
  }

  return <CompleteProfileFlow homeHref={PGFLEX_ENTRY_ROUTE} />;
}
