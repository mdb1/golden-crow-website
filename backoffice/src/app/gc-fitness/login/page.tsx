"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { LogIn } from "lucide-react";
import { getGCFitnessAuth } from "@/lib/firebase/gc-fitness-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { HelperBanner } from "@/components/helper-banner";
import { BACKOFFICE_VERSION } from "@/lib/app-version";

// GC Fitness trainer sign-in. Surface B of the Phase 2 UI-SPEC.
//
// Flow:
//   1. Click "Sign in with Google" → signInWithPopup on the scoped gc-fitness
//      Firebase Web SDK (named app "gc-fitness", separate from MyDNAMap's
//      default app).
//   2. Resulting idToken POSTed to /api/gc-fitness/login via the
//      `Authorization: Bearer <idToken>` header. The route handler verifies
//      the token, checks the allowlist, and mints the session cookie via
//      next-firebase-auth-edge's setAuthCookies (which reads the idToken
//      from request.headers — the header transport is REQUIRED, not a body
//      field).
//   3. 403 from the route handler → redirect to /gc-fitness/forbidden.
//   4. 200 → redirect to /gc-fitness/dashboard (the proxy's allowlist
//      gate will pass because the email is allowlisted).
export default function GCFitnessLoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function readError(res: Response): Promise<string> {
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) return data.error;
    } catch {
      // The route should return JSON, but keep a stable fallback if it does not.
    }
    return "Sign in failed. Please try again.";
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const auth = getGCFitnessAuth();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      const res = await fetch("/api/gc-fitness/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });

      if (res.status === 403) {
        window.location.href = "/gc-fitness/forbidden";
        return;
      }
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      window.location.href = "/gc-fitness/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="section-eyebrow">GC Fitness</p>
          <CardTitle className="font-heading text-3xl font-semibold">
            Trainer sign-in
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in with your authorized Google account.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full"
          >
            <LogIn className="mr-2 h-4 w-4" />
            {loading ? "Signing in…" : "Sign in with Google"}
          </Button>
          {error && (
            <HelperBanner title="Sign-in error" tone="red">
              {error}
            </HelperBanner>
          )}
          <p className="text-center text-xs text-muted-foreground">
            v{BACKOFFICE_VERSION}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
