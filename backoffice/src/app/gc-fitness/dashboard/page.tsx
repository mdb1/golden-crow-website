import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTokens } from "next-firebase-auth-edge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { SignOutButton } from "@/components/gc-fitness/sign-out-button";

export const dynamic = "force-dynamic";

// Placeholder GC Fitness trainer dashboard (Phase 2 Surface B).
//
// Reads the next-firebase-auth-edge session via getTokens(cookies(), options)
// — same cookieName + cookieSignatureKeys + serviceAccount config as
// /api/gc-fitness/login uses to mint the cookie, so the verify call is the
// inverse of the mint call. If no valid cookie, we redirect to /login (the
// proxy already does this for non-logged-in requests, but the explicit check
// here is defense-in-depth for any edge case where the proxy matcher misses).
//
// The full GC Fitness dashboard (client roster, workout assignment,
// chat) lands in Phase 11.
export default async function GCFitnessDashboardPage() {
  // CR-06 fix (P02-REVIEW-FIX): replace `process.env.X!` non-null assertions
  // with explicit checks so a missing env var fails loudly rather than
  // silently passing `undefined` into next-firebase-auth-edge.
  const apiKey = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY;
  const cookieSignatureKey = process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY;
  const projectId = process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  if (
    !apiKey ||
    !cookieSignatureKey ||
    !projectId ||
    !clientEmail ||
    !privateKeyB64
  ) {
    // eslint-disable-next-line no-console
    console.error(
      "[gc-fitness/dashboard] server misconfigured — at least one required env var is unset.",
    );
    throw new Error(
      "GC Fitness backoffice is misconfigured. Required env vars missing.",
    );
  }

  const tokens = await getTokens(await cookies(), {
    apiKey,
    cookieName: "GcFitnessAuthToken",
    cookieSignatureKeys: [cookieSignatureKey],
    serviceAccount: {
      projectId,
      clientEmail,
      privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
    },
  });

  if (!tokens) {
    redirect("/gc-fitness/login");
  }

  const { decodedToken } = tokens;
  const displayName =
    decodedToken.name ?? decodedToken.email ?? "Trainer";
  const role = (decodedToken as { role?: string }).role ?? "trainer";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="section-eyebrow">GC Fitness</p>
          <CardTitle className="font-heading text-2xl font-semibold">
            Hello, {displayName}
          </CardTitle>
          <Badge variant="secondary" className="mt-2 w-fit capitalize">
            {role}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in as trainer. The full GC Fitness dashboard
            arrives in Phase 11.
          </p>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
