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

/**
 * The widened admin drill-down gate.
 *
 * The god-mode client views live under `/admin/coaches/{coachUid}/clients/{clientId}`
 * and are gated on `clientCoachId === coachUidInPath` so a URL edit can't read
 * across coaches. A COACH-LESS user has no `coachId` at all, so that equality
 * locks the operator out of the exact segment that most needs watching.
 *
 * Convention (mirrors the `#392 selfAssigned` wire shape already in the data —
 * self-created templates / assignments / logs carry `trainerId === clientId`):
 * **a coach-less user is their own trainer-of-record.** So the path uid may
 * equal the client uid, but ONLY when the target really is an active coach-less
 * client. Every other combination stays denied.
 */
export function adminCanViewClientUnderCoach(args: {
  /** The coach uid taken from the URL. */
  coachUidInPath: string;
  clientId: string;
  /** `/users/{clientId}.coachId` — null/empty for a coach-less user. */
  clientCoachId: string | null;
  clientRole: string | null;
  clientDeleted: boolean;
}): boolean {
  const { coachUidInPath, clientId, clientCoachId } = args;
  if (!coachUidInPath || !clientId) return false;
  if (clientCoachId && clientCoachId === coachUidInPath) return true;
  return (
    coachUidInPath === clientId &&
    isCoachlessClientRow({
      role: args.clientRole,
      coachId: clientCoachId,
      deleted: args.clientDeleted,
    })
  );
}

/**
 * Whether an admin may UNLINK a client from a coach, turning them coach-less.
 *
 * The inverse of an assignment: it only ever detaches a real client from the
 * coach that actually owns them. Coaches themselves are never unlinkable (a
 * trainer has no `coachId` to clear), and a client already linked to someone
 * else must not be detachable from the wrong coach's page.
 *
 * Soft-deleted clients ARE unlinkable — an operator may want to strip the coach
 * link before or after deactivating, and the write is harmless either way.
 */
export function canUnlinkClientFromCoach(args: {
  /** The coach uid whose page the action was invoked from. */
  coachUidInPath: string;
  clientRole: string | null;
  /** `/users/{clientId}.coachId` as stored. */
  clientCoachId: string | null;
}): boolean {
  if (args.clientRole === "trainer") return false;
  if (!args.clientCoachId || !args.coachUidInPath) return false;
  return args.clientCoachId === args.coachUidInPath;
}

/** Per-category recency + rolling-window counts for the profile page. */
export interface CoachlessActivitySummary {
  /** Most recent activity of ANY kind, ISO — null when the user never acted. */
  lastActiveISO: string | null;
  workouts: ActivityWindow;
  habitCheckIns: ActivityWindow;
  photos: ActivityWindow;
  weightEntries: ActivityWindow;
}

export interface ActivityWindow {
  last7Days: number;
  last30Days: number;
  total: number;
  lastISO: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function windowFor(dates: Array<string | null | undefined>, nowMs: number): ActivityWindow {
  const times = dates
    .map((iso) => (typeof iso === "string" ? Date.parse(iso) : NaN))
    .filter((ms) => Number.isFinite(ms)) as number[];
  const newest = times.length > 0 ? Math.max(...times) : null;
  return {
    // A future-dated entry (clock skew / manual backfill) still counts as
    // "within the last N days" — clamping it out would hide real activity.
    last7Days: times.filter((ms) => ms >= nowMs - 7 * DAY_MS).length,
    last30Days: times.filter((ms) => ms >= nowMs - 30 * DAY_MS).length,
    total: times.length,
    lastISO: newest === null ? null : new Date(newest).toISOString(),
  };
}

/**
 * Fold the four activity streams into per-category windows + an overall
 * "last active". Inputs are ISO strings (habit check-ins may be civil dates
 * like "2026-07-24", which `Date.parse` reads as UTC midnight — good enough
 * for a 7/30-day bucket).
 */
export function summarizeCoachlessActivity(args: {
  nowMs: number;
  workoutDates: Array<string | null | undefined>;
  habitLogDates: Array<string | null | undefined>;
  photoDates: Array<string | null | undefined>;
  weightDates: Array<string | null | undefined>;
}): CoachlessActivitySummary {
  const workouts = windowFor(args.workoutDates, args.nowMs);
  const habitCheckIns = windowFor(args.habitLogDates, args.nowMs);
  const photos = windowFor(args.photoDates, args.nowMs);
  const weightEntries = windowFor(args.weightDates, args.nowMs);

  const lastTimes = [workouts, habitCheckIns, photos, weightEntries]
    .map((w) => (w.lastISO ? Date.parse(w.lastISO) : NaN))
    .filter((ms) => Number.isFinite(ms)) as number[];

  return {
    lastActiveISO:
      lastTimes.length > 0 ? new Date(Math.max(...lastTimes)).toISOString() : null,
    workouts,
    habitCheckIns,
    photos,
    weightEntries,
  };
}

/**
 * Resolve a bilingual `{ en, es }` wire value (or a bare legacy string) to
 * display text, preferring Spanish — the backoffice's primary voice. Same
 * precedence as `listClientHabitsForAdmin` / the assignment title resolver.
 */
export function bilingualText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (value && typeof value === "object") {
    const v = value as { en?: unknown; es?: unknown };
    const es = typeof v.es === "string" ? v.es.trim() : "";
    const en = typeof v.en === "string" ? v.en.trim() : "";
    if (es) return es;
    if (en) return en;
  }
  return fallback;
}

/**
 * Whole days between an ISO instant and `nowMs` (floored, never negative).
 * Null when the input is unparseable — callers render an em dash.
 */
export function daysSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((nowMs - ms) / DAY_MS));
}
