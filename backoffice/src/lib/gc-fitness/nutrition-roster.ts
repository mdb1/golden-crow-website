// nutrition-roster.ts
// The batched read behind the roster's nutrition column and the client summary card
// (#923).
//
// SERVER ONLY — takes a `Firestore` handle. The pure aggregation it feeds
// (`buildNutritionRosterSummary`) lives in `nutrition-compliance.ts` and is unit-tested
// there; this file is only the fetch.
//
// ── Why batched, and why that is not a micro-optimisation ───────────────────────────
//
// The roster already fans out per client. Adding two more per-client queries would put a
// coach with twenty clients at forty extra reads EVERY time the list loads — and the
// roster is the page that loads most. Instead both collections are read with
// `where(clientId, "in", chunk)`, 30 uids at a time: two queries per thirty clients,
// whatever the roster size.
//
// The logs query is `clientId in […]` + a `civilDate` range, which rides the same
// composite index `nutrition_logs (clientId ASC, civilDate ASC)` that #919 had to deploy.
// ⚠️ The emulator does NOT enforce indexes — if this ever grows a new filter, verify the
// shape against production before believing a green suite.
//
// ── Timezones ───────────────────────────────────────────────────────────────────────
//
// "Today" is per client (the phase boundary belongs to whoever is eating), so the fetch
// spans the WIDEST window any client needs and each client is then scored against their
// own civil dates. One read, N different todays.

import type { Firestore } from "firebase-admin/firestore";

import { civilDateAddDays, civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import {
  buildNutritionRosterSummary,
  type NutritionRosterSummary,
} from "./nutrition-compliance";
import type { NutritionLog, NutritionPlan } from "./nutrition-schema";
import { parseNutritionMealStatus } from "./nutrition-schema";

/** Firestore's hard ceiling for an `in` filter. */
const IN_CHUNK = 30;

/** Bound per chunked query. 30 clients × 8 days of logs stays well under this. */
const MAX_DOCS = 400;

export interface NutritionRosterInput {
  uid: string;
  /** The client's IANA zone, or null to fall back to the trainer's. */
  timezone: string | null;
}

/**
 * One `NutritionRosterSummary` per requested uid — every uid gets an entry, including
 * clients with no nutrition data at all (`neverHadPlan: true`).
 *
 * Fail-soft: a query that throws (missing index, rules change, empty collection) yields
 * empty summaries rather than taking the whole roster down with it. A roster without the
 * nutrition column is degraded; a roster that 500s is broken.
 */
export async function loadNutritionRosterSummaries(
  db: Firestore,
  clients: NutritionRosterInput[],
  fallbackTimezone: string,
): Promise<Map<string, NutritionRosterSummary>> {
  const summaries = new Map<string, NutritionRosterSummary>();
  // Pre-created mirror rows are not real uids — they own no documents, and passing
  // "mirror:foo@bar.com" into an `in` filter would just waste a slot in the chunk.
  const real = clients.filter((client) => !client.uid.startsWith("mirror:"));
  for (const client of clients) summaries.set(client.uid, emptySummary());
  if (real.length === 0) return summaries;

  const todayByUid = new Map(
    real.map((client) => [
      client.uid,
      civilDateToday(client.timezone || fallbackTimezone),
    ]),
  );
  const todays = [...todayByUid.values()].sort();
  // Widest window any client in this roster needs: earliest (today − 6) to latest today.
  const windowStart = civilDateAddDays(todays[0]!, -6) ?? todays[0]!;
  const windowEnd = todays[todays.length - 1]!;

  const plansByClient = new Map<string, NutritionPlan[]>();
  const logsByClient = new Map<string, NutritionLog[]>();

  for (let i = 0; i < real.length; i += IN_CHUNK) {
    const chunk = real.slice(i, i + IN_CHUNK).map((client) => client.uid);
    const [plansSnap, logsSnap] = await Promise.all([
      db
        .collection(FirestoreCollections.nutritionPlans)
        .where("clientId", "in", chunk)
        .limit(MAX_DOCS)
        .get()
        .catch(() => null),
      db
        .collection(FirestoreCollections.nutritionLogs)
        .where("clientId", "in", chunk)
        .where("civilDate", ">=", windowStart)
        .where("civilDate", "<=", windowEnd)
        .limit(MAX_DOCS)
        .get()
        .catch(() => null),
    ]);

    for (const doc of plansSnap?.docs ?? []) {
      const plan = decodePlan(doc.id, doc.data());
      if (!plan) continue;
      const bucket = plansByClient.get(plan.clientId) ?? [];
      bucket.push(plan);
      plansByClient.set(plan.clientId, bucket);
    }
    for (const doc of logsSnap?.docs ?? []) {
      const log = decodeLog(doc.id, doc.data());
      if (!log) continue;
      const bucket = logsByClient.get(log.clientId) ?? [];
      bucket.push(log);
      logsByClient.set(log.clientId, bucket);
    }
  }

  for (const client of real) {
    summaries.set(
      client.uid,
      buildNutritionRosterSummary(
        plansByClient.get(client.uid) ?? [],
        logsByClient.get(client.uid) ?? [],
        todayByUid.get(client.uid)!,
      ),
    );
  }
  return summaries;
}

function emptySummary(): NutritionRosterSummary {
  return {
    ratio7d: null,
    percent7d: null,
    hasActivePlan: false,
    activePlanName: null,
    activePlanEndsOn: null,
    neverHadPlan: true,
  };
}

/**
 * Forgiving decode — a malformed doc is skipped, never thrown on. One bad plan must not
 * blank the nutrition column for the whole roster.
 *
 * `endsOn` uses `?? null` and NOT `|| null`: the key legitimately holds `null` for an
 * open-ended phase, and conflating "absent" with "open-ended" is the bug class this
 * feature is written around (#400).
 */
function decodePlan(id: string, raw: unknown): NutritionPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const clientId = typeof data.clientId === "string" ? data.clientId : null;
  const startsOn = typeof data.startsOn === "string" ? data.startsOn : null;
  if (!clientId || !startsOn) return null;
  const name = (data.name ?? {}) as { en?: unknown; es?: unknown };
  return {
    id,
    clientId,
    trainerId: typeof data.trainerId === "string" ? data.trainerId : clientId,
    source: data.source === "self" ? "self" : "coach",
    name: {
      en: typeof name.en === "string" ? name.en : "",
      es: typeof name.es === "string" ? name.es : "",
    },
    templateId: null,
    startsOn,
    endsOn: typeof data.endsOn === "string" ? data.endsOn : null,
    targets: (data.targets ?? {}) as NutritionPlan["targets"],
    meals: Array.isArray(data.meals) ? (data.meals as NutritionPlan["meals"]) : [],
    reminders: null,
    deleted: data.deleted === true,
  };
}

function decodeLog(id: string, raw: unknown): NutritionLog | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const clientId = typeof data.clientId === "string" ? data.clientId : null;
  const civilDate = typeof data.civilDate === "string" ? data.civilDate : null;
  if (!clientId || !civilDate) return null;

  const meals: NutritionLog["meals"] = {};
  if (data.meals && typeof data.meals === "object") {
    for (const [mealId, value] of Object.entries(data.meals as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      // An unparseable status must never inflate adherence — the twin's decode falls
      // back to `missed`, and that decision is made in exactly one place.
      meals[mealId] = { status: parseNutritionMealStatus(entry.status) };
    }
  }

  const snapshot =
    data.targetsSnapshot && typeof data.targetsSnapshot === "object"
      ? (data.targetsSnapshot as NutritionLog["targetsSnapshot"])
      : { daily: {}, meals: [] };

  return {
    id,
    clientId,
    civilDate,
    planId: typeof data.planId === "string" ? data.planId : "",
    meals,
    targetsSnapshot: {
      daily: snapshot.daily ?? {},
      meals: Array.isArray(snapshot.meals) ? snapshot.meals : [],
    },
  };
}
