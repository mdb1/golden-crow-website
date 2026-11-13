// session-client.ts — browser side of the backoffice session (#470).
//
// Drop-in for the three `next-auth/react` calls the app used, with the same
// call shapes so consumers only change their import:
//
//   signIn("credentials", { idToken, name, email, image, project,
//                           accessSurface, redirect: false })
//       → { ok, status, error, url }      (POST /api/auth/login)
//   signOut({ callbackUrl, redirect })    (POST /api/auth/logout, then navigate)
//   getSession()                          → Session | null (GET /api/auth/session)
//
// There is no SessionProvider / useSession: nothing in the app used them.

import type { Session } from "@/lib/backoffice-session";

export type { Session } from "@/lib/backoffice-session";

export type SignInOptions = {
  idToken: string;
  name?: string;
  email?: string;
  image?: string;
  project?: string;
  accessSurface?: string;
  /** Kept for call-site compatibility; signIn never navigates. */
  redirect?: false;
};

export type SignInResult = {
  ok: boolean;
  status: number;
  error: string | null;
  url: string | null;
};

export async function signIn(
  _provider: "credentials",
  options: SignInOptions,
): Promise<SignInResult> {
  const { redirect: _redirect, ...credentials } = options;
  void _redirect;
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(credentials),
    });
    let error: string | null = null;
    if (!res.ok) {
      try {
        const body = (await res.json()) as { error?: unknown };
        error = typeof body.error === "string" ? body.error : "CredentialsSignin";
      } catch {
        error = "CredentialsSignin";
      }
    }
    return { ok: res.ok, status: res.status, error, url: null };
  } catch {
    return { ok: false, status: 0, error: "NetworkError", url: null };
  }
}

export async function signOut(
  options: { callbackUrl?: string; redirect?: boolean } = {},
): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  }).catch(() => undefined);
  if (options.redirect !== false) {
    window.location.href = options.callbackUrl ?? "/login";
  }
}

export async function getSession(): Promise<Session | null> {
  try {
    const res = await fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Session | Record<string, never>;
    return data && "user" in data && data.user ? (data as Session) : null;
  } catch {
    return null;
  }
}
