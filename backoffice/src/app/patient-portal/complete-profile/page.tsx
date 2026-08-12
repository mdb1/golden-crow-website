import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CompleteProfileFlow } from "@/components/auth/complete-profile-flow";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PatientPortalCompleteProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/patient-portal/login");
  }
  if (session.user?.accessSurface !== "patient-portal") {
    redirect("/2pq-dashboard");
  }

  return <CompleteProfileFlow homeHref="/patient-portal/home" />;
}
