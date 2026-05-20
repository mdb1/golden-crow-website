"use client";

export const dynamic = "force-dynamic";

import { useState, type FormEvent } from "react";
import {
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

type ProjectKey = "mydnamap" | "pocket-gyms" | "gc-fitness";
type Phase = "auth" | "select" | "signup-email" | "signup-password";

type SignupEligibility = {
  email: string;
  eligible: boolean;
  viaAllowlist: boolean;
  viaRoleAssignment: boolean;
  role?: "full_admin" | "institution_admin" | "institution_doctor" | "patient";
  accountExists: boolean;
  projectAccess: ProjectKey[];
};

const ROLE_LABELS: Record<NonNullable<SignupEligibility["role"]>, string> = {
  full_admin: "full admin",
  institution_admin: "institution admin",
  institution_doctor: "institution doctor",
  patient: "patient",
};

export default function LoginPage() {
  const [loading, setLoading] = useState<
    "google" | "email" | "signup-email" | "signup-password" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupEligibility, setSignupEligibility] = useState<SignupEligibility | null>(
    null
  );

  const [phase, setPhase] = useState<Phase>("auth");
  const [pendingAuth, setPendingAuth] = useState<{
    idToken: string;
    name: string;
    email: string;
    image: string;
    projectAccess: ProjectKey[];
    redirectTo: string;
  } | null>(null);

  async function readJson(response: Response) {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async function handleAuthSuccess(options: {
    idToken: string;
    name: string;
    email: string;
    image: string;
  }) {
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

    const [contextRes, profileSetupRes] = await Promise.all([
      fetch("/api/sdk/auth/context", {
        credentials: "include",
      }),
      fetch("/api/sdk/auth/profile-setup", {
        credentials: "include",
      }),
    ]);

    if (!contextRes.ok) {
      throw new Error("Failed to fetch project access");
    }

    if (!profileSetupRes.ok) {
      throw new Error("Failed to fetch profile setup state");
    }

    const contextData = await contextRes.json();
    const profileSetupData = await profileSetupRes.json();
    const projectAccess: ProjectKey[] = contextData.context?.projectAccess ?? [];
    const redirectTo = profileSetupData.state?.needsCompletion
      ? "/complete-profile"
      : "/";

    if (redirectTo === "/complete-profile") {
      const fallbackProject = projectAccess.includes("mydnamap")
        ? "mydnamap"
        : (projectAccess[0] ?? "mydnamap");
      await finalizeLogin(options, fallbackProject, redirectTo);
      return;
    }

    if (projectAccess.length === 1) {
      // Sole-project shortcut — skip the selector card. For gc-fitness
      // trainers this lands them on /gc-fitness/dashboard via
      // finalizeLogin → next-auth credentials sign-in (Phase 11-03).
      const soleProject = projectAccess[0];
      const soleRedirect =
        soleProject === "gc-fitness" ? "/gc-fitness/dashboard" : redirectTo;
      await finalizeLogin(options, soleProject, soleRedirect);
    } else if (projectAccess.length > 1) {
      setPendingAuth({ ...options, projectAccess, redirectTo });
      setPhase("select");
    } else {
      await finalizeLogin(options, "mydnamap", redirectTo);
    }
  }

  async function finalizeLogin(
    options: { idToken: string; name: string; email: string; image: string },
    project: ProjectKey,
    redirectTo: string
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
      window.location.href = redirectTo;
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

  async function handleSignupEligibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("signup-email");
    setError(null);
    setSignupEligibility(null);

    try {
      const response = await fetch("/api/sdk/auth/email-signup/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signupEmail }),
      });
      const data = (await readJson(response)) as Partial<SignupEligibility> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Unable to validate this email.");
      }

      if (!data.eligible || !data.email) {
        throw new Error(
          "This email does not have backoffice access yet. Ask a full admin to add it through the allowlist or role assignments first."
        );
      }

      if (data.accountExists) {
        throw new Error(
          "An account already exists for this email. Sign in with email to continue profile setup."
        );
      }

      setSignupEmail(data.email);
      setSignupEligibility(data as SignupEligibility);
      setSignupPassword("");
      setPhase("signup-password");
    } catch (err) {
      console.error("Signup eligibility error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to validate this email right now."
      );
    } finally {
      setLoading(null);
    }
  }

  async function handleEmailAccountCreation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signupEligibility) {
      setPhase("signup-email");
      return;
    }

    setLoading("signup-password");
    setError(null);

    try {
      const createRes = await fetch("/api/sdk/auth/email-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signupEligibility.email,
          password: signupPassword,
        }),
      });
      const createData = await readJson(createRes);

      if (!createRes.ok) {
        throw new Error(
          (typeof createData.error === "string" && createData.error) ||
            "Unable to create the email account."
        );
      }

      const result = await signInWithEmailAndPassword(
        auth,
        signupEligibility.email,
        signupPassword
      );
      await handleAuthSuccess({
        idToken: await result.user.getIdToken(),
        name: result.user.displayName ?? "",
        email: result.user.email ?? signupEligibility.email,
        image: result.user.photoURL ?? "",
      });
    } catch (err) {
      console.error("Email signup error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the email account."
      );
    } finally {
      setLoading(null);
    }
  }

  async function handleProjectSelect(project: ProjectKey) {
    if (!pendingAuth) return;
    setLoading("google");
    setError(null);
    try {
      // GC Fitness routes live under /gc-fitness/* (independent
      // next-firebase-auth-edge cookie chain). Override the default
      // post-login redirect target so the trainer lands on the right
      // surface; the pendingAuth.redirectTo default ("/") is the
      // MyDNAMap dashboard which would 403 for a trainer (Phase 11-03).
      const targetRedirect =
        project === "gc-fitness" ? "/gc-fitness/dashboard" : pendingAuth.redirectTo;
      await finalizeLogin(pendingAuth, project, targetRedirect);
    } catch (err) {
      console.error("Project select error:", err);
      setError("Failed to complete sign in. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  function resetToAuth() {
    setPhase("auth");
    setError(null);
    setSignupEligibility(null);
    setSignupPassword("");
  }

  const signupAccessLabel = signupEligibility?.viaRoleAssignment
    ? signupEligibility.role
      ? `approved through the ${ROLE_LABELS[signupEligibility.role]} role assignment`
      : "approved through an active role assignment"
    : "approved through the team allowlist";

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
            {pendingAuth.projectAccess.includes("gc-fitness") && (
              <button
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-card/80 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                onClick={() => handleProjectSelect("gc-fitness")}
                disabled={loading !== null}
              >
                <span className="text-2xl">💪</span>
                <span className="font-semibold text-card-foreground">GC Fitness</span>
                <span className="text-sm text-muted-foreground">
                  Trainer roster, workout templates, habits, and chat coaching.
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
            Google sign-in and email sign-in work when the authenticated email is on
            the team allowlist or has an active Firebase role assignment such as
            full admin, institution admin, or institution doctor.
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
            <Button type="submit" disabled={loading !== null} className="w-full">
              {loading === "email" ? "Signing in..." : "Sign in with email"}
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={loading !== null}
            onClick={() => {
              setSignupEmail(email);
              setError(null);
              setPhase("signup-email");
            }}
          >
            Create email account
          </Button>

          <div className="pt-1">
            <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Backoffice v{BACKOFFICE_VERSION}
            </span>
          </div>
        </div>
      )}

      {phase === "signup-email" && (
        <div className="flex flex-col gap-6 px-6 py-7">
          <div className="flex flex-col gap-2">
            <p className="section-eyebrow">Golden Crow</p>
            <h1 className="font-heading text-3xl font-semibold text-foreground">
              Check access first
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter the email that should get a new admin account. We will verify
              the allowlist or role assignment before asking for a password.
            </p>
          </div>

          <HelperBanner title="No account is created yet." tone="blue">
            This step only checks whether the email already has backoffice access.
          </HelperBanner>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <form className="flex flex-col gap-4" onSubmit={handleSignupEligibility}>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                autoComplete="email"
                value={signupEmail}
                onChange={(event) => setSignupEmail(event.target.value)}
                placeholder="admin@institution.com"
                required
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={resetToAuth}>
                Back
              </Button>
              <Button type="submit" disabled={loading !== null}>
                {loading === "signup-email" ? "Checking..." : "Continue"}
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

      {phase === "signup-password" && signupEligibility && (
        <div className="flex flex-col gap-6 px-6 py-7">
          <div className="flex flex-col gap-2">
            <p className="section-eyebrow">Golden Crow</p>
            <h1 className="font-heading text-3xl font-semibold text-foreground">
              Create the account
            </h1>
            <p className="text-sm text-muted-foreground">
              Access is approved for <span className="font-medium text-foreground">{signupEligibility.email}</span>.
              Set a password and we will create the account immediately.
            </p>
          </div>

          <HelperBanner title="Access approved" tone="green">
            This email was {signupAccessLabel}. After the account is created, you
            will be signed in and moved into the complete-profile flow.
          </HelperBanner>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <form className="flex flex-col gap-4" onSubmit={handleEmailAccountCreation}>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={signupPassword}
                onChange={(event) => setSignupPassword(event.target.value)}
                placeholder="Choose a password"
                minLength={6}
                required
              />
              <p className="text-xs text-muted-foreground">
                Use at least 6 characters.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPhase("signup-email");
                  setError(null);
                }}
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={loading !== null || signupPassword.trim().length < 6}
              >
                {loading === "signup-password"
                  ? "Creating account..."
                  : "Create account"}
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
