import { LoginExperience } from "@/components/auth/login-experience";

export const dynamic = "force-dynamic";

export default async function PGFlexLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return <LoginExperience surface="pgflex" initialEmail={email} />;
}
