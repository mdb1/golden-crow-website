// auth.ts — Pocket Genes / Pocket Gyms login verification (#470: was the
// next-auth CredentialsProvider; the logic is unchanged).
//
// The browser sends a Firebase ID token for `goldencrow-pocketgenes`. Only
// the SDK verifies it (`POST ${SDK_URL}/auth/login`, which also enforces the
// per-project TEAM_ALLOWLIST and the surface). The session cookie itself is
// minted by `app/api/auth/[...auth]/route.ts` from what this returns.

import { normalizeAccessSurface, type AccessSurface } from "@/lib/backoffice-session";

const SDK_URL =
  process.env.GOLDENCROW_SDK_URL ??
  process.env.NEXT_PUBLIC_SDK_URL ??
  "http://localhost:3000";

export type LoginCredentials = {
  idToken?: string;
  name?: string;
  email?: string;
  image?: string;
  project?: string;
  accessSurface?: string;
};

export type AuthorizedUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  project: string;
  accessSurface: AccessSurface;
};

async function readVerifiedIdentity(
  res: Response,
): Promise<{ uid: string | null; email: string | null }> {
  try {
    const body = (await res.json()) as { uid?: unknown; email?: unknown };
    return {
      uid: typeof body?.uid === "string" && body.uid ? body.uid : null,
      email: typeof body?.email === "string" && body.email ? body.email : null,
    };
  } catch {
    return { uid: null, email: null };
  }
}

export async function authorizeCredentials(
  credentials: LoginCredentials | undefined,
): Promise<AuthorizedUser | null> {
  if (!credentials?.idToken) return null;
  const accessSurface = normalizeAccessSurface(credentials.accessSurface);
  try {
    const res = await fetch(`${SDK_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: credentials.idToken,
        surface: accessSurface,
      }),
    });
    if (!res.ok) return null;
    // The SDK verifies the idToken and returns the identity it contains.
    // That verified identity is authoritative: the `credentials.email` field
    // is whatever the browser posted and can be spoofed. The credentials
    // fallback exists only for deploy-order safety — an SDK deployed before
    // it started returning uid/email replies `{ status: "ok" }` alone, and
    // login must keep working until both sides ship.
    const verified = await readVerifiedIdentity(res);
    const email = verified.email ?? credentials.email ?? null;
    return {
      // Nothing reads the subject today; the Firebase uid is the stable key.
      id: verified.uid ?? email ?? credentials.email!,
      name: credentials.name ?? null,
      email,
      image: credentials.image ?? null,
      project: credentials.project ?? "mydnamap",
      accessSurface,
    };
  } catch {
    return null;
  }
}
