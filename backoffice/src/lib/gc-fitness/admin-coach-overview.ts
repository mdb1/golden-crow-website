// admin-coach-overview.ts — golden-crow-website#534: the reader behind the expanded admin
// coach detail (/gc-fitness/admin/coaches/[uid]).
//
// Server-only module, deliberately NOT "use server": it is only called from the page (a
// server component), so it does not need — and should not get — a Server Action endpoint.
// Admin-gated anyway (`getCurrentAdmin` first).
//
// ## Reads per page view (Firestore cost), N = the coach's clients
//
//   roster       1 query  users where coachId == uid (projected)
//   stats        ⌈N/30⌉   client_stats by documentId `in` (the roster cache, #506)
//   corvo        ⌈N/30⌉   ai_coach by documentId `in`
//   nutrition    2⌈N/30⌉  loadNutritionRosterSummaries (already chunked)
//   billing      3 queries coach_payment_plans / client_billing (equality) + client_payments
//                         coachId == uid AND paidCivil ≥ 12 months ago ORDER BY paidCivil DESC
//                         LIMIT 1000 — the existing (coachId, paidCivil DESC) index
//   habits       3 count() aggregations (active / archived habits, habit templates)
//   nutrition    2 count() (templates, plans by trainerId)
//   challenges   1 query  social_challenges creatorUid == uid AND origin == "coach" (as the
//                         coach's own page does — equality only)
//   checklist    1 query  users/{uid}/coach_checklist LIMIT 200
//   invites      1 query  user_mirror where coachId == uid
//   activity     1 query  coach_activity trainerId == uid ORDER BY occurredAt DESC LIMIT 1
//                         (existing index) + fcm_tokens LIMIT 25 + social_profiles/{uid}
//                         + public_routines authorUid == uid count()
//   Auth         ⌈(N+1)/100⌉ getUsers batches (signup + last app open)
//
// No `getAll` (fails silently on Vercel — see firestore-getall memory); no per-client
// fan-out; every query is fail-soft so a missing index degrades ONE section, never the page.

import "server-only";

import { FieldPath } from "firebase-admin/firestore";

import { gcFitnessAuth, gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import {
  activityBuckets,
  billingColumns,
  maxMs,
  pickLastActivity,
  summarizeChecklist,
  summarizeCoachBilling,
  summarizeCorvo,
  summarizeNutrition,
  type CoachBillingSummary,
  type CoachChecklistSummary,
  type CoachClientOverviewRow,
  type CoachCorvoSummary,
  type CoachNutritionSummary,
  type PendingInviteRow,
} from "./admin-coach-overview-model";
import { AI_COACH_COLLECTION, decodeThread } from "./ai-coach-admin-model";
import { addMonths } from "./billing";
import { civilDateToday } from "./civil-date";
import { listClientAppDevices, type ClientAppDevice } from "./client-app-devices";
import { decodeClientStats } from "./client-stats";
import {
  sortCoachChallenges,
  summarizeCoachChallenge,
  type CoachChallengeSummary,
} from "./coach-challenges";
import { firestoreValueToISO, resolveDisplayTier, toEntitlementInfo } from "./coachless-user-model";
import { FirestoreCollections } from "./collections";
import { chunkList } from "./map-in-batches";
import { loadNutritionRosterSummaries } from "./nutrition-roster";
import {
  comparePaymentsDesc,
  decodeBilling,
  decodePayment,
  decodePlan,
} from "./payments-model";
import { getCurrentAdmin } from "./auth-helpers";

type Db = ReturnType<typeof gcFitnessFirestore>;
type Raw = Record<string, unknown>;

const IN_CHUNK = 30;
const PAYMENTS_WINDOW_MONTHS = 12;
const PAYMENTS_LIMIT = 1000;
const CHECKLIST_LIMIT = 200;
const FALLBACK_TZ = "America/Argentina/Buenos_Aires";

export interface CoachSocialSummary {
  handle: string | null;
  visibility: string | null;
  suspended: boolean;
  publicRoutines: number;
}

export interface CoachOwnActivity {
  lastSignInISO: string | null;
  lastAppOpenISO: string | null;
  accountCreatedISO: string | null;
  lastCoachActionISO: string | null;
  lastCoachActionKind: string | null;
  devices: ClientAppDevice[];
  entitlementTier: "premium" | "free";
  timezone: string | null;
}

export interface CoachAdminOverview {
  today: string;
  timezone: string;
  nowMs: number;
  clients: CoachClientOverviewRow[];
  engagement: ReturnType<typeof activityBuckets>;
  billing: CoachBillingSummary | null;
  nutrition: CoachNutritionSummary | null;
  habits: { active: number; archived: number; templates: number } | null;
  challenges: CoachChallengeSummary[] | null;
  checklist: CoachChecklistSummary | null;
  invites: PendingInviteRow[];
  corvo: CoachCorvoSummary | null;
  social: CoachSocialSummary | null;
  activity: CoachOwnActivity;
}

function toMs(raw: unknown): number | null {
  if (raw && typeof (raw as { toMillis?: () => number }).toMillis === "function") {
    return (raw as { toMillis: () => number }).toMillis();
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

const authMs = (s: string | undefined | null): number | null => {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

async function docsByIdIn(db: Db, collection: string, ids: string[]): Promise<Map<string, Raw>> {
  const out = new Map<string, Raw>();
  const chunks = chunkList(ids, IN_CHUNK);
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      safe(
        db.collection(collection).where(FieldPath.documentId(), "in", chunk).get(),
        null,
      ),
    ),
  );
  for (const snap of snaps) snap?.docs.forEach((d) => out.set(d.id, d.data() as Raw));
  return out;
}

async function authUsers(uids: string[]) {
  const out = new Map<string, { created: number | null; lastSignIn: number | null; lastRefresh: number | null }>();
  const chunks = chunkList(uids, 100);
  const results = await Promise.all(
    chunks.map((chunk) => safe(gcFitnessAuth().getUsers(chunk.map((uid) => ({ uid }))), null)),
  );
  for (const res of results) {
    res?.users.forEach((u) =>
      out.set(u.uid, {
        created: authMs(u.metadata.creationTime),
        lastSignIn: authMs(u.metadata.lastSignInTime),
        lastRefresh: authMs(u.metadata.lastRefreshTime ?? null),
      }),
    );
  }
  return out;
}

async function count(q: FirebaseFirestore.Query): Promise<number | null> {
  return safe(
    q
      .count()
      .get()
      .then((s) => s.data().count),
    null,
  );
}

export async function loadCoachAdminOverview(
  coachUid: string,
  options: { fallbackTimezone?: string; nowMs?: number } = {},
): Promise<CoachAdminOverview> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  const nowMs = options.nowMs ?? Date.now();

  const [coachSnap, rosterSnap] = await Promise.all([
    db.collection(FirestoreCollections.users).doc(coachUid).get(),
    db.collection(FirestoreCollections.users).where("coachId", "==", coachUid).get(),
  ]);
  const coach = (coachSnap.data() ?? {}) as Raw;
  const coachTz = typeof coach.timezone === "string" && coach.timezone ? coach.timezone : null;
  const timezone = coachTz ?? options.fallbackTimezone ?? FALLBACK_TZ;
  const today = civilDateToday(timezone, new Date(nowMs));

  const roster = rosterSnap.docs.map((d) => ({ uid: d.id, data: d.data() as Raw }));
  const ids = roster.map((r) => r.uid);
  const currentIds = new Set(roster.filter((r) => r.data.deleted !== true).map((r) => r.uid));
  const paymentsFrom = `${addMonths(`${today.slice(0, 7)}-01`, -(PAYMENTS_WINDOW_MONTHS - 1))}`;

  const [
    statsById,
    corvoById,
    nutritionById,
    auth,
    plansSnap,
    billingsSnap,
    paymentsSnap,
    habitsActive,
    habitsArchived,
    habitTemplates,
    nutritionTemplates,
    nutritionPlans,
    challengesSnap,
    checklistSnap,
    mirrorSnap,
    lastActionSnap,
    devices,
    socialSnap,
    publicRoutines,
  ] = await Promise.all([
    docsByIdIn(db, FirestoreCollections.clientStats, ids),
    docsByIdIn(db, AI_COACH_COLLECTION, ids),
    safe(
      loadNutritionRosterSummaries(
        db,
        roster.map((r) => ({
          uid: r.uid,
          timezone: typeof r.data.timezone === "string" ? r.data.timezone : null,
        })),
        timezone,
      ),
      new Map(),
    ),
    authUsers([coachUid, ...ids]),
    safe(db.collection(FirestoreCollections.coachPaymentPlans).where("coachId", "==", coachUid).get(), null),
    safe(db.collection(FirestoreCollections.clientBilling).where("coachId", "==", coachUid).get(), null),
    safe(
      db
        .collection(FirestoreCollections.clientPayments)
        .where("coachId", "==", coachUid)
        .where("paidCivil", ">=", paymentsFrom)
        .orderBy("paidCivil", "desc")
        .limit(PAYMENTS_LIMIT)
        .get(),
      null,
    ),
    // Total minus archived: an equality on `deleted == false` would drop docs that never got the field.
    count(db.collection(FirestoreCollections.habits).where("trainerId", "==", coachUid)),
    count(
      db.collection(FirestoreCollections.habits).where("trainerId", "==", coachUid).where("deleted", "==", true),
    ),
    count(db.collection(FirestoreCollections.habitTemplates).where("trainerId", "==", coachUid)),
    count(db.collection(FirestoreCollections.nutritionTemplates).where("ownerId", "==", coachUid)),
    count(db.collection(FirestoreCollections.nutritionPlans).where("trainerId", "==", coachUid)),
    safe(
      db
        .collection(FirestoreCollections.socialChallenges)
        .where("creatorUid", "==", coachUid)
        .where("origin", "==", "coach")
        .get(),
      null,
    ),
    safe(
      db
        .collection(FirestoreCollections.users)
        .doc(coachUid)
        .collection("coach_checklist")
        .limit(CHECKLIST_LIMIT)
        .get(),
      null,
    ),
    safe(db.collection(FirestoreCollections.userMirror).where("coachId", "==", coachUid).get(), null),
    safe(
      db
        .collection("coach_activity")
        .where("trainerId", "==", coachUid)
        .orderBy("occurredAt", "desc")
        .limit(1)
        .get(),
      null,
    ),
    listClientAppDevices(db, coachUid),
    safe(db.collection(FirestoreCollections.socialProfiles).doc(coachUid).get(), null),
    count(db.collection(FirestoreCollections.publicRoutines).where("authorUid", "==", coachUid)),
  ]);

  // ── Billing ──
  const billings = billingsSnap ? billingsSnap.docs.map((d) => decodeBilling(d.data() as Raw)) : [];
  const billingByClient = new Map(billings.map((b) => [b.clientId, b]));
  const payments = paymentsSnap
    ? paymentsSnap.docs.map((d) => decodePayment(d.id, d.data() as Raw)).sort(comparePaymentsDesc)
    : [];
  const billing =
    plansSnap && billingsSnap
      ? summarizeCoachBilling({
          plans: plansSnap.docs.map((d) => decodePlan(d.id, d.data() as Raw)),
          billings,
          payments,
          currentClientIds: currentIds,
          today,
          months: PAYMENTS_WINDOW_MONTHS,
        })
      : null;

  // ── Clients ──
  const corvoThreads: Array<{ turnsTotal: number; lastMessageAtMs: number | null; consented: boolean }> = [];
  const clients: CoachClientOverviewRow[] = roster.map(({ uid, data }) => {
    const stats = decodeClientStats(statsById.get(uid));
    const corvoRaw = corvoById.get(uid);
    const thread = corvoRaw ? decodeThread(uid, corvoRaw) : null;
    if (thread && data.deleted !== true) {
      corvoThreads.push({
        turnsTotal: thread.usageTotal,
        lastMessageAtMs: thread.lastMessageAtMs,
        consented: corvoRaw?.consentAt != null,
      });
    }
    const a = auth.get(uid);
    const lastWorkoutAtMs = maxMs(toMs(data.lastWorkoutAt), stats?.values.lastWorkoutAtMs);
    const last = pickLastActivity({
      lastWorkoutAtMs,
      lastHabitAtMs: stats?.values.lastHabitAtMs,
      lastPhotoAtMs: stats?.values.lastPhotoAtMs,
      corvoLastMessageAtMs: thread?.lastMessageAtMs,
      lastAppOpenAtMs: a?.lastRefresh ?? a?.lastSignIn,
    });
    const nutrition = nutritionById.get(uid) as
      | { activePlanName?: unknown; percent7d: number | null; hasActivePlan: boolean }
      | undefined;
    const planName = nutrition?.hasActivePlan ? localized(nutrition.activePlanName) : null;
    return {
      uid,
      displayName: typeof data.displayName === "string" ? data.displayName : "",
      email: typeof data.email === "string" ? data.email : "",
      deleted: data.deleted === true,
      signupAtMs: a?.created ?? toMs(data.createdAt),
      lastActivityAtMs: last.atMs,
      lastActivityKind: last.kind,
      lastWorkoutAtMs,
      complianceRatio: stats ? stats.values.thisWeekComplianceRatio : null,
      workoutsCompletedThisMonth: stats ? stats.values.workoutsCompletedThisMonth : null,
      workoutsScheduledThisMonth: stats ? stats.values.workoutsScheduledThisMonth : null,
      ...billingColumns(billingByClient.get(uid), today),
      nutritionPlanName: planName,
      nutritionPercent7d: nutrition?.percent7d ?? null,
      corvoTurnsTotal: thread?.usageTotal ?? 0,
      corvoLastMessageAtMs: thread?.lastMessageAtMs ?? null,
      entitlementTier: resolveDisplayTier(toEntitlementInfo(data.entitlement)),
    };
  });

  const liveSummaries = roster
    .filter((r) => currentIds.has(r.uid))
    .map((r) => nutritionById.get(r.uid))
    .filter((s): s is { hasActivePlan: boolean; neverHadPlan: boolean; percent7d: number | null } => !!s);

  // ── Challenges ──
  const names = new Map(roster.map((r) => [r.uid, String(r.data.displayName ?? r.data.email ?? "")]));
  const challenges = challengesSnap
    ? sortCoachChallenges(
        challengesSnap.docs
          .map((d) => summarizeCoachChallenge(d.id, (d.data() ?? {}) as Raw, nowMs, names))
          .filter((c): c is CoachChallengeSummary => c !== null),
      )
    : null;

  // ── Checklist ──
  const checklist = checklistSnap
    ? summarizeChecklist(
        checklistSnap.docs.map((d) => {
          const r = d.data() as Raw;
          return {
            id: d.id,
            title: typeof r.title === "string" ? r.title : "—",
            completed: r.completed === true,
            dueAtMs: toMs(r.dueAt),
          };
        }),
        nowMs,
      )
    : null;

  // ── Invites ──
  const invites: PendingInviteRow[] = (mirrorSnap?.docs ?? [])
    .map((d) => {
      const r = d.data() as Raw;
      return {
        email: typeof r.email === "string" ? r.email : d.id,
        displayName: typeof r.displayName === "string" ? r.displayName : "",
        inviteStatus: typeof r.inviteEmailStatus === "string" ? r.inviteEmailStatus : null,
        inviteSentAtISO: firestoreValueToISO(r.inviteEmailSentAt),
        lastAttemptAtISO: firestoreValueToISO(r.inviteEmailLastAttemptAt),
        createdAtISO: firestoreValueToISO(r.createdAt),
      };
    })
    .sort((a, b) => (b.createdAtISO ?? "").localeCompare(a.createdAtISO ?? "") || a.email.localeCompare(b.email));

  // ── Social / own activity ──
  const social = socialSnap?.exists
    ? {
        handle: typeof socialSnap.get("handle") === "string" ? (socialSnap.get("handle") as string) : null,
        visibility:
          typeof socialSnap.get("visibility") === "string" ? (socialSnap.get("visibility") as string) : null,
        suspended: socialSnap.get("suspended") === true,
        publicRoutines: publicRoutines ?? 0,
      }
    : publicRoutines
      ? { handle: null, visibility: null, suspended: false, publicRoutines }
      : null;
  const coachAuth = auth.get(coachUid);
  const lastAction = lastActionSnap?.docs[0]?.data() as Raw | undefined;
  const iso = (ms: number | null | undefined) => (typeof ms === "number" ? new Date(ms).toISOString() : null);

  return {
    today,
    timezone,
    nowMs,
    clients,
    engagement: activityBuckets(clients, nowMs),
    billing,
    nutrition:
      nutritionTemplates === null && nutritionPlans === null
        ? null
        : summarizeNutrition({
            templates: nutritionTemplates ?? 0,
            plans: nutritionPlans ?? 0,
            summaries: liveSummaries,
          }),
    habits:
      habitsActive === null
        ? null
        : {
            active: Math.max(0, habitsActive - (habitsArchived ?? 0)),
            archived: habitsArchived ?? 0,
            templates: habitTemplates ?? 0,
          },
    challenges,
    checklist,
    invites,
    corvo: summarizeCorvo(corvoThreads, nowMs),
    social,
    activity: {
      lastSignInISO: iso(coachAuth?.lastSignIn),
      lastAppOpenISO: iso(coachAuth?.lastRefresh),
      accountCreatedISO: iso(coachAuth?.created),
      lastCoachActionISO: lastAction ? firestoreValueToISO(lastAction.occurredAt) : null,
      lastCoachActionKind: lastAction && typeof lastAction.kind === "string" ? lastAction.kind : null,
      devices,
      entitlementTier: resolveDisplayTier(toEntitlementInfo(coach.entitlement)),
      timezone: coachTz,
    },
  };
}

function localized(raw: unknown): string | null {
  if (typeof raw === "string") return raw || null;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const v = r.es ?? r.en;
    return typeof v === "string" && v ? v : null;
  }
  return null;
}
