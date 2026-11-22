// auth-helpers.ts
//
// Shared auth helper for the gc-fitness trainer Server Actions. Wraps
// `next-firebase-auth-edge`'s `getTokens` with the cookie + service-account
// config established in P02-11 (`proxy.ts` / `dashboard/page.tsx`) and
// adds a single auth gate for the gc-fitness trainer surface. The current
// bootstrap flow allows any authenticated account to enter Corvo and
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

import { cache } from "react";
import { cookies } from "next/headers";
import { getTokens } from "next-firebase-auth-edge";

import { assertSessionNotRevoked } from "./session-revocation";

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

type GcFitnessAuthEnv = {
  apiKey: string;
  cookieSignatureKey: string;
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

// #491 — the base64 → PEM decode used to run on every call; the env does not
// change within an instance, so decode once.
let cachedEnv: { raw: string; env: GcFitnessAuthEnv } | null = null;

function readAuthEnv(): GcFitnessAuthEnv {
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
  const raw = [apiKey, cookieSignatureKey, projectId, clientEmail, privateKeyB64].join("\n");
  if (cachedEnv?.raw !== raw) {
    cachedEnv = {
      raw,
      env: {
        apiKey,
        cookieSignatureKey,
        projectId,
        clientEmail,
        privateKey: Buffer.from(privateKeyB64, "base64").toString("utf8"),
      },
    };
  }
  return cachedEnv.env;
}

interface VerifiedSession {
  idToken: string;
  uid: string;
  email: string;
  roles: string[];
}

/**
 * Reads the `GcFitnessAuthToken` cookie and checks the session is still alive
 * (#482: not revoked, not disabled, user not deleted). Roles come from the
 * user's CURRENT custom claims, not the token's sign-in snapshot, so a
 * demotion applies on the next request.
 *
 * Wrapped in React `cache()` (#491): a render calls the auth helpers from the
 * page and from every loader it awaits; they now share ONE cookie read and ONE
 * user-record lookup per request.
 */
const readVerifiedSession = cache(async (): Promise<VerifiedSession> => {
  const env = readAuthEnv();
  const tokens = await getTokens(await cookies(), {
    apiKey: env.apiKey,
    cookieName: "GcFitnessAuthToken",
    cookieSignatureKeys: [env.cookieSignatureKey],
    serviceAccount: {
      projectId: env.projectId,
      clientEmail: env.clientEmail,
      privateKey: env.privateKey,
    },
  });

  if (!tokens) {
    throw new Error("Forbidden");
  }

  const { decodedToken } = tokens;
  const tokenRecord = decodedToken as unknown as Record<string, unknown>;
  const authTime =
    typeof tokenRecord.auth_time === "number" ? tokenRecord.auth_time : 0;
  const state = await assertSessionNotRevoked(decodedToken.uid, authTime);
  return {
    idToken: tokens.token,
    uid: decodedToken.uid,
    email: (decodedToken.email ?? "").toLowerCase(),
    roles: normalizeRolesFromToken(state.customClaims ?? tokenRecord),
  };
});

/**
 * Parses the `GcFitnessAuthToken` cookie, verifies the session is still valid
 * and returns the user's identity + roles.
 *
 * Throws `Error("Forbidden")` for any auth-gate failure (no cookie, invalid
 * token, revoked / disabled / deleted account). The uniform error message
 * prevents leaking which guard tripped via a side-channel error toast.
 *
 * Throws a different, descriptive error for misconfigured env vars — that
 * is a deployment bug, not an auth event.
 */
export const getCurrentGCFitnessUser = cache(
  async (): Promise<CurrentGCFitnessUser> => {
    const session = await readVerifiedSession();
    const isTrainer = session.roles.includes("trainer");
    const isAdmin = session.roles.includes("admin");
    return {
      uid: session.uid,
      email: session.email,
      isTrainer,
      isAdmin,
      roles: session.roles,
    };
  },
);

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

/**
 * #1347 — the signed-in trainer's Firebase ID token (the JWT inside the
 * `GcFitnessAuthToken` cookie, refreshed by the proxy), for calling a
 * Cloud Functions callable from a Server Action with
 * `Authorization: Bearer <token>`. Same gate as `getCurrentTrainer`:
 * throws `Error("Forbidden")` without a valid trainer session.
 */
export async function getCurrentTrainerIdToken(): Promise<{
  uid: string;
  idToken: string;
}> {
  const session = await readVerifiedSession();
  if (!session.roles.includes("trainer")) throw new Error("Forbidden");
  return { uid: session.uid, idToken: session.idToken };
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
