import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PatientProfileCompletion } from "@/components/auth/patient-profile-completion";
import { authOptions } from "@/lib/auth";
import { normalizePatientPortalCallbackUrl } from "@/lib/patient-portal-routes";

export const dynamic = "force-dynamic";

export default async function PatientPortalCompleteProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string | string[] }>;
} = {}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/patient-portal/login");
  }
  if (session.user?.accessSurface !== "patient-portal") {
    redirect("/2pq-dashboard");
  }

  const callbackUrl = (await searchParams)?.callbackUrl;
  const destination = typeof callbackUrl === "string"
    ? normalizePatientPortalCallbackUrl(callbackUrl)
    : undefined;
  return <PatientProfileCompletion destination={destination} />;
}
