// admin-client-overview.ts — golden-crow-website#534 (PR 2): the reader behind the extra
// sections of the admin client drill-down (/gc-fitness/admin/coaches/[uid]/clients/[id]).
//
// Server-only, NOT "use server" (called from the page only; no Server Action endpoint).
// Admin-gated, and scoped like every other `*ForAdmin` loader: the client must belong to
// the coach in the path — or be a coach-less user viewed as their own coach
// (`adminCanViewClientUnderCoach`, #286).
//
// ## Reads per page view — all point reads or bounded single-client queries
//   users/{id}, Auth getUser, fcm_tokens ≤ 25, client_billing/{coach}_{client},
//   client_payments (coachId, clientId, paidCivil DESC) ≤ 50 — existing index,
//   client_stats/{id}, ai_coach/{id} + reports count(), client_goals clientId == id ≤ 100,
//   client_notes (coachId, clientId) count() — existing index, chats/{id}.
// Every read is fail-soft: one broken source empties ONE card, never the page.

import "server-only";

import { gcFitnessAuth, gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import {
  summarizeChat,
  summarizeClientBilling,
  summarizeGoals,
  type ClientBillingOverview,
  type ClientGoalCounts,
} from "./admin-client-overview-model";
import { maxMs, pickLastActivity, type LastActivityKind } from "./admin-coach-overview-model";
import { AI_COACH_COLLECTION, AI_COACH_REPORTS_SUBCOLLECTION, decodeThread } from "./ai-coach-admin-model";
import { getCurrentAdmin } from "./auth-helpers";
import { civilDateToday } from "./civil-date";
import { listClientAppDevices, type ClientAppDevice } from "./client-app-devices";
import { decodeClientStats, type ClientStatsValues } from "./client-stats";
import {
  adminCanViewClientUnderCoach,
  firestoreValueToISO,
  toEntitlementInfo,
  type EntitlementInfo,
} from "./coachless-user-model";
import { FirestoreCollections } from "./collections";
import { comparePaymentsDesc, decodeBilling, decodePayment } from "./payments-model";
import {
  decodeSubscriptionEvents,
  type ClientSocialSummary,
  type SubscriptionEvent,
} from "./admin-client-overview-model";

type Raw = Record<string, unknown>;

const PAYMENTS_LIMIT = 50;
const GOALS_LIMIT = 100;
const RC_EVENTS_LIMIT = 50;

export interface ClientAdminOverview {
  timezone: string;
  nowMs: number;
  account: {
    email: string;
    createdAtISO: string | null;
    lastSignInISO: string | null;
    lastAppOpenISO: string | null;
    providers: string[];
    emailVerified: boolean | null;
    disabled: boolean;
    timezone: string | null;
    birthDate: string | null;
    locale: string | null;
    devices: ClientAppDevice[];
    bodyWeightKg: number | null;
    heightCm: number | null;
  };
  entitlement: EntitlementInfo | null;
  lastActivity: { atMs: number | null; kind: LastActivityKind | null };
  stats: ClientStatsValues | null;
  billing: ClientBillingOverview | null;
  goals: ClientGoalCounts | null;
  notesCount: number | null;
  corvo: {
    turnsTotal: number;
    lastMessageAtISO: string | null;
    consentAtISO: string | null;
    photosConsentAtISO: string | null;
    reports: number;
  } | null;
  chat: ReturnType<typeof summarizeChat>;
  /** #541 — RevenueCat webhook events for this user (newest first, ≤ 50). */
  subscriptionEvents: SubscriptionEvent[] | null;
  /** #541 — social layer. */
  social: ClientSocialSummary | null;
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

const ms = (s: string | undefined | null): number | null => {
  if (!s) return null;
  const v = Date.parse(s);
  return Number.isNaN(v) ? null : v;
};

function toMs(raw: unknown): number | null {
  if (raw && typeof (raw as { toMillis?: () => number }).toMillis === "function") {
    return (raw as { toMillis: () => number }).toMillis();
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") return ms(raw);
  return null;
}

export async function loadClientAdminOverview(
  coachUid: string,
  clientId: string,
  options: { fallbackTimezone?: string; nowMs?: number } = {},
): Promise<ClientAdminOverview> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  const nowMs = options.nowMs ?? Date.now();

  const userSnap = await db.collection(FirestoreCollections.users).doc(clientId).get();
  if (!userSnap.exists) throw new Error("Not found");
  const user = (userSnap.data() ?? {}) as Raw;
  const allowed = adminCanViewClientUnderCoach({
    coachUidInPath: coachUid,
    clientId,
    clientCoachId: typeof user.coachId === "string" ? user.coachId : null,
    clientRole: typeof user.role === "string" ? user.role : null,
    clientDeleted: user.deleted === true,
  });
  if (!allowed) throw new Error("Not found");

  const userTz = typeof user.timezone === "string" && user.timezone ? user.timezone : null;
  const timezone = userTz ?? options.fallbackTimezone ?? "America/Argentina/Buenos_Aires";
  const today = civilDateToday(timezone, new Date(nowMs));

  const [authUser, devices, billingSnap, paymentsSnap, statsSnap, aiSnap, reportsCount, goalsSnap, notesCount, chatSnap] =
    await Promise.all([
      safe(gcFitnessAuth().getUser(clientId), null),
      listClientAppDevices(db, clientId),
      safe(db.collection(FirestoreCollections.clientBilling).doc(`${coachUid}_${clientId}`).get(), null),
      safe(
        db
          .collection(FirestoreCollections.clientPayments)
          .where("coachId", "==", coachUid)
          .where("clientId", "==", clientId)
          .orderBy("paidCivil", "desc")
          .limit(PAYMENTS_LIMIT)
          .get(),
        null,
      ),
      safe(db.collection(FirestoreCollections.clientStats).doc(clientId).get(), null),
      safe(db.collection(AI_COACH_COLLECTION).doc(clientId).get(), null),
      safe(
        db
          .collection(AI_COACH_COLLECTION)
          .doc(clientId)
          .collection(AI_COACH_REPORTS_SUBCOLLECTION)
          .count()
          .get()
          .then((s) => s.data().count),
        0,
      ),
      safe(db.collection(FirestoreCollections.clientGoals).where("clientId", "==", clientId).limit(GOALS_LIMIT).get(), null),
      safe(
        db
          .collection(FirestoreCollections.clientNotes)
          .where("coachId", "==", coachUid)
          .where("clientId", "==", clientId)
          .count()
          .get()
          .then((s) => s.data().count),
        null,
      ),
      safe(db.collection(FirestoreCollections.chats).doc(clientId).get(), null),
    ]);

  // #541 — subscription history + social. Equality-only queries / counts: no new index.
  const count = (q: FirebaseFirestore.Query) =>
    safe(
      q
        .count()
        .get()
        .then((c) => c.data().count),
      null as number | null,
    );
  const [rcSnap, socialSnap, followers, following, publicRoutines, challenges] = await Promise.all([
    safe(db.collection("revenuecat_events").where("appUserId", "==", clientId).limit(RC_EVENTS_LIMIT).get(), null),
    safe(db.collection(FirestoreCollections.socialProfiles).doc(clientId).get(), null),
    count(db.collection("social_follows").where("followeeUid", "==", clientId)),
    count(db.collection("social_follows").where("followerUid", "==", clientId)),
    count(db.collection(FirestoreCollections.publicRoutines).where("authorUid", "==", clientId)),
    count(db.collection(FirestoreCollections.socialChallenges).where("memberUids", "array-contains", clientId)),
  ]);

  const stats = statsSnap?.exists ? decodeClientStats(statsSnap.data() as Raw) : null;
  const ai = aiSnap?.exists ? (aiSnap.data() as Raw) : null;
  const thread = ai ? decodeThread(clientId, ai) : null;
  const lastRefresh = ms(authUser?.metadata.lastRefreshTime ?? null);
  const lastSignIn = ms(authUser?.metadata.lastSignInTime);

  // A self-coached (coach-less) user has no billing with "themselves".
  const billing =
    coachUid === clientId || !billingSnap || !paymentsSnap
      ? null
      : summarizeClientBilling(
          billingSnap.exists && billingSnap.get("coachId") === coachUid ? decodeBilling(billingSnap.data() as Raw) : null,
          paymentsSnap.docs.map((d) => decodePayment(d.id, d.data() as Raw)).sort(comparePaymentsDesc),
          today,
        );

  const goals = goalsSnap
    ? summarizeGoals(
        goalsSnap.docs
          .map((d) => d.data() as Raw)
          .filter((g) => g.coachId === coachUid || g.clientOwned === true || coachUid === clientId)
          .map((g) => ({
            title: typeof g.title === "string" ? g.title : "—",
            status: typeof g.status === "string" ? g.status : "active",
            clientOwned: g.clientOwned === true,
            updatedAtMs: toMs(g.updatedAt),
          })),
      )
    : null;

  return {
    timezone,
    nowMs,
    account: {
      email: typeof user.email === "string" ? user.email : (authUser?.email ?? ""),
      createdAtISO: authUser?.metadata.creationTime
        ? new Date(authUser.metadata.creationTime).toISOString()
        : firestoreValueToISO(user.createdAt),
      lastSignInISO: lastSignIn === null ? null : new Date(lastSignIn).toISOString(),
      lastAppOpenISO: lastRefresh === null ? null : new Date(lastRefresh).toISOString(),
      providers: authUser?.providerData.map((p) => p.providerId) ?? [],
      emailVerified: authUser ? authUser.emailVerified : null,
      disabled: authUser?.disabled === true,
      timezone: userTz,
      birthDate: typeof user.birthDate === "string" ? user.birthDate : null,
      locale: typeof user.preferredLocale === "string" ? user.preferredLocale : null,
      devices,
      bodyWeightKg: typeof user.bodyWeightKg === "number" ? user.bodyWeightKg : null,
      heightCm: typeof user.heightCm === "number" ? user.heightCm : null,
    },
    entitlement: toEntitlementInfo(user.entitlement),
    lastActivity: pickLastActivity({
      lastWorkoutAtMs: maxMs(toMs(user.lastWorkoutAt), stats?.values.lastWorkoutAtMs),
      lastHabitAtMs: stats?.values.lastHabitAtMs,
      lastPhotoAtMs: stats?.values.lastPhotoAtMs,
      corvoLastMessageAtMs: thread?.lastMessageAtMs,
      lastAppOpenAtMs: lastRefresh ?? lastSignIn,
    }),
    stats: stats?.values ?? null,
    billing,
    goals,
    notesCount,
    corvo: ai
      ? {
          turnsTotal: thread?.usageTotal ?? 0,
          lastMessageAtISO: thread?.lastMessageAtMs ? new Date(thread.lastMessageAtMs).toISOString() : null,
          consentAtISO: firestoreValueToISO(ai.consentAt),
          photosConsentAtISO: firestoreValueToISO(ai.photosConsentAt),
          reports: reportsCount,
        }
      : null,
    chat: chatSnap?.exists ? summarizeChat(chatSnap.data() as Raw, coachUid, clientId) : null,
    subscriptionEvents: rcSnap ? decodeSubscriptionEvents(rcSnap.docs.map((d) => ({ id: d.id, data: d.data() as Raw }))) : null,
    social:
      socialSnap?.exists || followers || following || publicRoutines || challenges
        ? {
            hasProfile: socialSnap?.exists === true,
            handle: typeof socialSnap?.get("handle") === "string" ? (socialSnap.get("handle") as string) : null,
            visibility: typeof socialSnap?.get("visibility") === "string" ? (socialSnap.get("visibility") as string) : null,
            suspended: socialSnap?.get("suspended") === true,
            followers,
            following,
            publicRoutines,
            challenges,
          }
        : null,
  };
}
