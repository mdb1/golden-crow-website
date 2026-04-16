"use client";

export const dynamic = "force-dynamic";

import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { signIn } from "next-auth/react";
import { auth } from "@/lib/firebase";
import { HelperBanner } from "@/components/helper-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BACKOFFICE_VERSION } from "@/lib/app-version";

type ProjectKey = "mydnamap" | "pocket-gyms";

export default function LoginPage() {
  const [loading, setLoading] = useState<"google" | "email" | "signup" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Phase: "auth" = show login form, "select" = show project picker (only if multi-project)
  const [phase, setPhase] = useState<"auth" | "select">("auth");
  const [pendingAuth, setPendingAuth] = useState<{
    idToken: string;
    name: string;
    email: string;
    image: string;
    projectAccess: ProjectKey[];
  } | null>(null);

  async function handleAuthSuccess(options: {
    idToken: string;
    name: string;
    email: string;
    image: string;
  }) {
    // Step 1: Create SDK session cookie
    const loginRes = await fetch("/api/sdk/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken: options.idToken }),
    });

    if (!loginRes.ok) {
      await firebaseSignOut(auth);
      if (loginRes.status === 403) {
        window.location.href = "/access-denied";
        return;
      }
      throw new Error("SDK login failed");
    }

    // Step 2: Fetch project access from SDK context
    const contextRes = await fetch("/api/sdk/auth/context", {
      credentials: "include",
    });

    if (!contextRes.ok) {
      throw new Error("Failed to fetch project access");
    }

    const contextData = await contextRes.json();
    const projectAccess: ProjectKey[] = contextData.context?.projectAccess ?? [];

    // Step 3: Auto-select if single project, otherwise show selector
    if (projectAccess.length === 1) {
      // D-04: Auto-select for single-project users
      await finalizeLogin(options, projectAccess[0]);
    } else if (projectAccess.length > 1) {
      setPendingAuth({ ...options, projectAccess });
      setPhase("select");
    } else {
      // No project access — shouldn't happen if login succeeded, but handle gracefully
      await finalizeLogin(options, "mydnamap");
    }
  }

  async function finalizeLogin(
    options: { idToken: string; name: string; email: string; image: string },
    project: ProjectKey
  ) {
    const signInResult = await signIn("credentials", {
      idToken: options.idToken,
      name: options.name,
      email: options.email,
      image: options.image,
      project,
      redirect: false,
    });

    if (signInResult?.ok) {
      window.location.href = "/";
      return;
    }

    throw new Error("NextAuth sign-in failed");
  }

  async function handleGoogleSignIn() {
    setLoading("google");
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await handleAuthSuccess({
        idToken: await result.user.getIdToken(),
        name: result.user.displayName ?? "",
        email: result.user.email ?? "",
        image: result.user.photoURL ?? "",
      });
    } catch (err) {
      console.error("Login error:", err);
      setError("Sign in failed. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("email");
    setError(null);

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await handleAuthSuccess({
        idToken: await result.user.getIdToken(),
        name: result.user.displayName ?? "",
        email: result.user.email ?? email,
        image: result.user.photoURL ?? "",
      });
    } catch (err) {
      console.error("Email login error:", err);
      setError("Email sign in failed. Confirm the credentials and try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleEmailSignUp() {
    setLoading("signup");
    setError(null);

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await handleAuthSuccess({
        idToken: await result.user.getIdToken(),
        name: result.user.displayName ?? "",
        email: result.user.email ?? email,
        image: result.user.photoURL ?? "",
      });
    } catch (err) {
      console.error("Email signup error:", err);
      setError(
        "Email sign up failed. Account creation alone is not enough; the email still needs allowlist access or an active admin role."
      );
    } finally {
      setLoading(null);
    }
  }

  async function handleProjectSelect(project: ProjectKey) {
    if (!pendingAuth) return;
    setLoading("google"); // reuse loading state
    setError(null);
    try {
      await finalizeLogin(pendingAuth, project);
    } catch (err) {
      console.error("Project select error:", err);
      setError("Failed to complete sign in. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="glass-panel flex w-full flex-col gap-6">
      {phase === "select" && pendingAuth && (
        <div className="flex flex-col gap-4 px-6 py-7">
          <div className="flex flex-col gap-2">
            <p className="section-eyebrow">Golden Crow</p>
            <h1 className="font-heading text-3xl font-semibold text-foreground">
              Choose a project
            </h1>
            <p className="text-sm text-muted-foreground">
              Select the product you want to manage.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pendingAuth.projectAccess.includes("mydnamap") && (
              <button
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-card/80 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                onClick={() => handleProjectSelect("mydnamap")}
                disabled={loading !== null}
              >
                <span className="text-2xl">🧬</span>
                <span className="font-semibold text-card-foreground">PocketGenes</span>
                <span className="text-sm text-muted-foreground">
                  Genomics reports, community, and account management.
                </span>
              </button>
            )}
            {pendingAuth.projectAccess.includes("pocket-gyms") && (
              <button
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-card/80 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                onClick={() => handleProjectSelect("pocket-gyms")}
                disabled={loading !== null}
              >
                <span className="text-2xl">🏋️</span>
                <span className="font-semibold text-card-foreground">Pocket Gyms</span>
                <span className="text-sm text-muted-foreground">
                  Members, training plans, bookings, and achievements.
                </span>
              </button>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="pt-1">
            <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Backoffice v{BACKOFFICE_VERSION}
            </span>
          </div>
        </div>
      )}

      {phase === "auth" && (
        <div className="flex flex-col gap-6 px-6 py-7">
          <div className="flex flex-col gap-2">
            <p className="section-eyebrow">Golden Crow</p>
            <h1 className="font-heading text-3xl font-semibold text-foreground">
              Admin Sign In
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to the moderation console with a Google or email-based admin
              account.
            </p>
          </div>

          <HelperBanner title="Access is still backend-controlled." tone="blue">
            Google sign-in, email sign-in, and email sign-up work when the
            authenticated email is on the team allowlist or has an active Firebase
            role assignment such as full admin, institution admin, or institution
            doctor.
          </HelperBanner>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button
            onClick={handleGoogleSignIn}
            disabled={loading !== null}
            className="w-full justify-center"
          >
            {loading === "google" ? "Signing in..." : "Sign in with Google"}
          </Button>

          <form className="flex flex-col gap-4" onSubmit={handleEmailSignIn}>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="team@pocketgenes.app"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                required
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={loading !== null} className="flex-1">
                {loading === "email" ? "Signing in..." : "Sign in with email"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading !== null}
                className="flex-1"
                onClick={handleEmailSignUp}
              >
                {loading === "signup" ? "Creating..." : "Create email account"}
              </Button>
            </div>
          </form>

          <div className="pt-1">
            <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Backoffice v{BACKOFFICE_VERSION}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
