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

export default function LoginPage() {
  const [loading, setLoading] = useState<"google" | "email" | "signup" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function finalizeLogin(options: {
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

    const signInResult = await signIn("credentials", {
      idToken: options.idToken,
      name: options.name,
      email: options.email,
      image: options.image,
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
      await finalizeLogin({
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
      await finalizeLogin({
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
      await finalizeLogin({
        idToken: await result.user.getIdToken(),
        name: result.user.displayName ?? "",
        email: result.user.email ?? email,
        image: result.user.photoURL ?? "",
      });
    } catch (err) {
      console.error("Email signup error:", err);
      setError(
        "Email sign up failed. Account creation alone does not grant admin access."
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="glass-panel flex w-full flex-col gap-6 px-6 py-7">
      <div className="flex flex-col gap-2">
        <p className="section-eyebrow">Pocket Genes</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          Pocket Genes Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to the moderation console with a Google or email-based team
          account.
        </p>
      </div>

      <HelperBanner title="Access is still backend-controlled." tone="blue">
        Google sign-in, email sign-in, and email sign-up only work if the
        authenticated account is on the Pocket Genes team allowlist.
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
    </div>
  );
}
