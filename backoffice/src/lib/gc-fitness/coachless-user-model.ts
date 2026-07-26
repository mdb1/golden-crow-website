// coachless-user-model.ts
//
// Pure, side-effect-free helpers for the admin "coach-less users" god-mode
// surface (no firebase imports) — the unit-testable seam for the Admin-SDK
// scans in `admin-coachless-actions.ts` and the subscription read in
// `admin-actions.ts`. Mirrors the split used by `admin-user-search.ts`.
//
// "Coach-less" = a client with NO coach. For such a user the entitlement tier
// is the sole premium source (the iOS/Android `EntitlementResolver` short-
// circuits coached ⇒ premium, so with no coach only `entitlement.tier` matters).

/** The two resolved tiers (twin of GCFitnessCore `EntitlementTier`). */
export type EntitlementTier = "free" | "premium";

/** A plain, transport-safe view of `/users/{uid}.entitlement`. */
export interface EntitlementInfo {
  tier: EntitlementTier;
  /** e.g. "revenuecat" (webhook) or "admin" (manual override). */
  source: string | null;
  productId: string | null;
  expiresAtISO: string | null;
  updatedAtISO: string | null;
}

/** Per-user content counts shown in the coach-less dashboard. */
export interface CoachlessUserStats {
  /** Self-authored workout templates (routines the user created). */
  routines: number;
  /** Client-owned habits. */
  habits: number;
  /** Progress-photo check-ins. */
  progressPhotos: number;
  /** Logged workout sessions. */
  workoutLogs: number;
}

export const EMPTY_STATS: CoachlessUserStats = {
  routines: 0,
  habits: 0,
  progressPhotos: 0,
  workoutLogs: 0,
};

/** Normalize any raw tier value to a strict tier (anything but "premium" → free). */
export function normalizeTier(raw: unknown): EntitlementTier {
  return raw === "premium" ? "premium" : "free";
}

/**
 * The tier to DISPLAY for a coach-less user. With no coach, the entitlement
 * decides: premium iff `entitlement.tier === "premium"`, else free (incl. when
 * there is no entitlement at all).
 */
export function resolveDisplayTier(entitlement: EntitlementInfo | null): EntitlementTier {
  return entitlement?.tier === "premium" ? "premium" : "free";
}

/**
 * Coerce a Firestore field that may be a Timestamp (`{ toDate() }`), an ISO
 * string, or absent into an ISO string (or null). Duck-typed on `toDate` so
 * this file never imports `firebase-admin` and stays purely unit-testable.
 */
export function firestoreValueToISO(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return typeof value === "string" ? value : null;
}

/**
 * Parse a raw `/users/{uid}.entitlement` map into `EntitlementInfo`, or null
 * when absent. A present-but-tier-less map resolves to free (least-privileged).
 */
export function toEntitlementInfo(raw: unknown): EntitlementInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    tier: normalizeTier(r.tier),
    source: typeof r.source === "string" ? r.source : null,
    productId: typeof r.productId === "string" ? r.productId : null,
    expiresAtISO: firestoreValueToISO(r.expiresAt),
    updatedAtISO: firestoreValueToISO(r.updatedAt),
  };
}

/**
 * True when a `/users/{uid}` doc represents a coach-less client: role client,
 * no coach linked (nil / empty / whitespace coachId), and not soft-deleted.
 * The single predicate used by the dashboard scan AND its unit tests.
 */
export function isCoachlessClientRow(args: {
  role: string | null;
  coachId: string | null;
  deleted: boolean;
}): boolean {
  const isClient = args.role === "client";
  const noCoach = !args.coachId || args.coachId.trim().length === 0;
  return isClient && noCoach && !args.deleted;
}
