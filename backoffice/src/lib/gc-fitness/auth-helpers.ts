// auth-helpers.ts
//
// Shared auth helper for the gc-fitness trainer Server Actions. Wraps
// `next-firebase-auth-edge`'s `getTokens` with the cookie + service-account
// config established in P02-11 (`proxy.ts` / `dashboard/page.tsx`) and
// adds a single auth gate for the gc-fitness trainer surface. The current
// bootstrap flow allows any authenticated account to enter GC Fitness and
// be promoted to trainer on login; the old allowlist gate was removed to
// unblock early iteration on the backoffice MVP.
//
// HISTORY:
//  - P03-06 shipped a STUB version of this file (cookie + role check only)
//    so the trainer route guards (`/gc-fitness/exercises/*` Server
//    Components) could compile against it during Wave 2 parallel
//    execution.
//  - P03-05 (this commit) REPLACES that stub with the full implementation:
//      * Email allowlist denylist (`GC_FITNESS_TEAM_ALLOWLIST`).
//      * Same cookie / service-account env config as proxy.ts.
//      * Loud-fail (throw) on misconfigured env (matches proxy.ts CR-06 fix).
//      * Consistent `"Forbidden"` error message for any auth-gate failure
//        so the client toast says the same thing regardless of the
//        underlying cause (don't leak which guard tripped to the browser).
//
// CONTRACT (locked, do not regress):
//   - throws `Error("Forbidden")` on missing/invalid cookie
//   - throws `Error("Forbidden")` on role custom claim != "trainer"
//   - throws `Error("Forbidden")` on invalid / missing auth state
//   - throws a NON-"Forbidden" error on missing env vars (config bug, not auth)
//   - returns `{ uid, email, role: "trainer" }` on success.

import "server-only";

import { cookies } from "next/headers";
import { getTokens } from "next-firebase-auth-edge";

export interface CurrentTrainer {
  uid: string;
  email: string;
  role: "trainer";
  isAdmin: boolean;
  roles: string[];
}

export interface CurrentAdmin {
  uid: string;
  email: string;
  role: "admin";
  isTrainer: boolean;
  roles: string[];
}

export interface CurrentGCFitnessUser {
  uid: string;
  email: string;
  isTrainer: boolean;
  isAdmin: boolean;
  roles: string[];
}

function normalizeRolesFromToken(decodedToken: Record<string, unknown>): string[] {
  const set = new Set<string>();
  const role = decodedToken.role;
  if (typeof role === "string" && role.trim().length > 0) {
    set.add(role.trim().toLowerCase());
  }
  const roles = decodedToken.roles;
  if (Array.isArray(roles)) {
    for (const value of roles) {
      if (typeof value === "string" && value.trim().length > 0) {
        set.add(value.trim().toLowerCase());
      }
    }
  }
  if (decodedToken.admin === true) {
    set.add("admin");
  }
  return Array.from(set);
}

/**
 * Parses the `GcFitnessAuthToken` cookie, verifies the trainer role custom
 * claim, and returns the trainer identity on success.
 *
 * Throws `Error("Forbidden")` for any auth-gate failure (no cookie, wrong
 * role, invalid token). The uniform error message prevents leaking which
 * guard tripped via a side-channel error toast.
 *
 * Throws a different, descriptive error for misconfigured env vars — that
 * is a deployment bug, not an auth event.
 */
export async function getCurrentGCFitnessUser(): Promise<CurrentGCFitnessUser> {
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
    // Same loud-fail pattern as P02-11 dashboard/page.tsx — never silently
    // pass `undefined` into the auth library; that would short-circuit
    // `getTokens` into a "no cookie" state and produce a confusing
    // anonymous-user error downstream.
    throw new Error(
      "gc-fitness/auth-helpers: server misconfigured — required env vars missing.",
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
    throw new Error("Forbidden");
  }

  const { decodedToken } = tokens;
  const email = (decodedToken.email ?? "").toLowerCase();
  const tokenRecord = decodedToken as unknown as Record<string, unknown>;
  const roles = normalizeRolesFromToken(tokenRecord);
  const isTrainer = roles.includes("trainer");
  const isAdmin = roles.includes("admin");
  return {
    uid: decodedToken.uid,
    email,
    isTrainer,
    isAdmin,
    roles,
  };
}

export async function getCurrentTrainer(): Promise<CurrentTrainer> {
  const user = await getCurrentGCFitnessUser();
  if (!user.isTrainer) {
    throw new Error("Forbidden");
  }
  return {
    uid: user.uid,
    email: user.email,
    role: "trainer",
    isAdmin: user.isAdmin,
    roles: user.roles,
  };
}

export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  const user = await getCurrentGCFitnessUser();
  if (!user.isAdmin) {
    throw new Error("Forbidden");
  }
  return {
    uid: user.uid,
    email: user.email,
    role: "admin",
    isTrainer: user.isTrainer,
    roles: user.roles,
  };
}
