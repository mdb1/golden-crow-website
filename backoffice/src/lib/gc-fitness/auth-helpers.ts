// auth-helpers.ts
//
// Shared auth helper for the gc-fitness trainer Server Actions. Wraps
// `next-firebase-auth-edge`'s `getTokens` with the cookie + service-account
// config established in P02-11 (`proxy.ts` / `dashboard/page.tsx`) and
// adds the GC_FITNESS_TEAM_ALLOWLIST email gate so a token minted before
// a trainer was removed from the allowlist cannot continue acting after
// rotation.
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
//   - throws `Error("Forbidden")` on email not in GC_FITNESS_TEAM_ALLOWLIST
//   - throws a NON-"Forbidden" error on missing env vars (config bug, not auth)
//   - returns `{ uid, email, role: "trainer" }` on success.

import "server-only";

import { cookies } from "next/headers";
import { getTokens } from "next-firebase-auth-edge";

export interface CurrentTrainer {
  uid: string;
  email: string;
  role: "trainer";
}

function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parses the `GcFitnessAuthToken` cookie, verifies the trainer role custom
 * claim, AND verifies the trainer's email is still in
 * `GC_FITNESS_TEAM_ALLOWLIST`. Returns the trainer's identity on success.
 *
 * Throws `Error("Forbidden")` for any auth-gate failure (no cookie, wrong
 * role, removed from allowlist). The uniform error message prevents leaking
 * which guard tripped via a side-channel error toast.
 *
 * Throws a different, descriptive error for misconfigured env vars — that
 * is a deployment bug, not an auth event.
 */
export async function getCurrentTrainer(): Promise<CurrentTrainer> {
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
  const allowlist = parseAllowlist(process.env.GC_FITNESS_TEAM_ALLOWLIST);
  if (!email || !allowlist.includes(email)) {
    throw new Error("Forbidden");
  }

  const role = (decodedToken as { role?: string }).role;
  const allowMissingTrainerClaimInDev = process.env.NODE_ENV !== "production";
  if (role !== "trainer" && !allowMissingTrainerClaimInDev) {
    throw new Error("Forbidden");
  }

  return {
    uid: decodedToken.uid,
    email,
    role: "trainer",
  };
}
