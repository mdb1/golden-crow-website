import type { Metadata } from "next";
import { LoginExperience } from "@/components/auth/login-experience";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function PublisherPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string | string[];
    accessKey?: string | string[];
  }>;
}) {
  const { email, accessKey } = await searchParams;

  return (
    <LoginExperience
      surface="publisher-portal"
      initialEmail={typeof email === "string" ? email : undefined}
      initialAccessKey={typeof accessKey === "string" ? accessKey : undefined}
    />
  );
}
