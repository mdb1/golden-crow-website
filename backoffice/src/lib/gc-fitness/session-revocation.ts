// session-revocation.ts — #482.
//
// A coach the admin demotes, deactivates or deletes used to keep the Corvo
// backoffice for as long as the `GcFitnessAuthToken` cookie lived (12 days):
// `getTokens` only DECODES the cookie's ID token, and the claims inside it are
// a snapshot from sign-in. Two halves close that hole:
//
//   1. Writers: every path that disables an account or takes away a backoffice
//      role (trainer / admin) calls `revokeRefreshTokens` — the next token
//      refresh fails, so the proxy sends the browser back to the login page.
//   2. Readers: `assertSessionNotRevoked` runs from the page/action auth helper
//      (`auth-helpers.ts`). It reads the Auth user record once (cached per uid
//      for a few seconds, see below) and refuses a session that is revoked
//      (`auth_time` before `tokensValidAfterTime`, the same comparison
//      firebase-admin's `verifyIdToken(token, true)` does), disabled or whose
//      user no longer exists. It returns the user's CURRENT custom claims, so a
//      demotion is honored on the very next request, even if nobody revoked.
//
// Why not in `proxy.ts`: the proxy runs on every request, prefetches and RSC
// payloads included; a `getUser` round-trip there would tax every navigation.
// Every protected page and Server Action already goes through the auth helper,
// which is where the data is read, so that is where the check pays off.
//
// Not a "use server" file: nothing here is callable from the browser.

import "server-only";

import { gcFitnessAuth } from "@/lib/firebase/gc-fitness-admin";

/** Roles that grant access to the Corvo backoffice. */
const BACKOFFICE_ROLES = ["trainer", "admin"] as const;

/**
 * How long a successful user-record lookup is reused across requests on the
 * same warm instance. Bounded staleness: a revocation takes effect within this
 * window instead of on the next request — vs. the 12 days it took before.
 */
const USER_RECORD_TTL_MS = 30_000;

export interface SessionUserState {
  /**
   * The user's current custom claims (the token's copy may be stale). `null`
   * means "unknown — use the token's claims"; production always fills it, the
   * global Jest double (jest.setup.ts) returns `null`.
   */
  customClaims: Record<string, unknown> | null;
}

type CacheEntry = { expiresAt: number; value: Promise<SessionUserState> };
const recentChecks = new Map<string, CacheEntry>();

/** Test-only: forget every cached lookup. */
export function resetSessionRevocationCacheForTests(): void {
  recentChecks.clear();
}

export function backofficeRolesFromClaims(
  claims: Record<string, unknown> | undefined | null,
): string[] {
  if (!claims) return [];
  const set = new Set<string>();
  if (typeof claims.role === "string" && claims.role.trim()) {
    set.add(claims.role.trim().toLowerCase());
  }
  if (Array.isArray(claims.roles)) {
    for (const value of claims.roles) {
      if (typeof value === "string" && value.trim()) {
        set.add(value.trim().toLowerCase());
      }
    }
  }
  if (claims.admin === true) set.add("admin");
  return BACKOFFICE_ROLES.filter((role) => set.has(role));
}

async function lookup(uid: string, authTimeSec: number): Promise<SessionUserState> {
  let user;
  try {
    user = await gcFitnessAuth().getUser(uid);
  } catch {
    // auth/user-not-found (deleted account) — or the lookup failed. Fail
    // closed: an auth gate that opens when Identity Toolkit hiccups is not a
    // gate. The page redirects to /login; the next request retries.
    throw new Error("Forbidden");
  }
  if (user.disabled) throw new Error("Forbidden");
  if (user.tokensValidAfterTime) {
    const validSinceMs = new Date(user.tokensValidAfterTime).getTime();
    if (Number.isFinite(validSinceMs) && authTimeSec * 1000 < validSinceMs) {
      throw new Error("Forbidden");
    }
  }
  return {
    customClaims: (user.customClaims ?? {}) as Record<string, unknown>,
  };
}

/**
 * Throws `Error("Forbidden")` when the session's user is deleted, disabled or
 * had its refresh tokens revoked after `authTimeSec` (the ID token's
 * `auth_time`). Returns the user's current custom claims otherwise.
 */
export async function assertSessionNotRevoked(
  uid: string,
  authTimeSec: number,
): Promise<SessionUserState> {
  const key = `${uid}:${authTimeSec}`;
  const now = Date.now();
  const hit = recentChecks.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const value = lookup(uid, authTimeSec);
  recentChecks.set(key, { expiresAt: now + USER_RECORD_TTL_MS, value });
  // Never cache a refusal or a failed lookup: the next request asks again.
  value.catch(() => recentChecks.delete(key));
  if (recentChecks.size > 500) {
    for (const [k, entry] of recentChecks) {
      if (entry.expiresAt <= now) recentChecks.delete(k);
    }
  }
  return value;
}

/**
 * Revokes every refresh token of `uid` (backoffice cookie AND the mobile app's
 * session). Fail-soft by design — the callers have already committed the
 * Firestore side of the change, and `assertSessionNotRevoked` still refuses
 * the old session through the disabled flag / the fresh claims — but logged,
 * because a missing revocation is a security event worth seeing in Vercel.
 */
export async function revokeSessions(uid: string, reason: string): Promise<void> {
  try {
    await gcFitnessAuth().revokeRefreshTokens(uid);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[gc-fitness/session-revocation] revokeRefreshTokens failed (${reason})`,
      { uid, error },
    );
  }
  for (const key of recentChecks.keys()) {
    if (key.startsWith(`${uid}:`)) recentChecks.delete(key);
  }
}

/**
 * Revokes `uid`'s sessions only when a claims change takes a backoffice role
 * away. A client whose coach changes keeps their app session: revoking would
 * sign them out of the iOS/Android app for nothing.
 */
export async function revokeSessionsIfBackofficeRoleLost(
  uid: string,
  before: Record<string, unknown> | undefined | null,
  after: Record<string, unknown>,
  reason: string,
): Promise<boolean> {
  const kept = new Set(backofficeRolesFromClaims(after));
  const lost = backofficeRolesFromClaims(before).some((role) => !kept.has(role));
  if (!lost) return false;
  await revokeSessions(uid, reason);
  return true;
}
