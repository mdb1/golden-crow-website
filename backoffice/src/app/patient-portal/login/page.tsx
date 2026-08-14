import { LoginExperience } from "@/components/auth/login-experience";

export const dynamic = "force-dynamic";

export default async function PatientPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return <LoginExperience surface="patient-portal" initialEmail={email} />;
}
