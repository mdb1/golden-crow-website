// nutrition-actions.ts
//
// Server Actions for the coach's nutrition surface (#914). This is the ONLY trainer path
// that writes `/nutrition_plans` — the Firestore rules (#913) let a trainer create a plan
// only for a client whose `users/{clientId}.coachId` is that trainer, and this module is
// the defence in depth in front of that rule.
//
// ⚠️ EVERY EXPORT HERE MUST BE `async`. Jest does not apply the `"use server"` directive,
// so a synchronous export passes the entire suite and then dies in `next build` with
// "Server Actions must be async functions" — and `main` auto-deploys, so that publishes a
// broken deploy with 1800 tests green. It already happened (#785). The pure helpers live
// in `nutrition-plan-form.ts` and `nutrition-plan-resolution.ts`.
//
// ── The invariant this module exists to hold ────────────────────────────────────────
//
// **Never two plans active on the same civil day.** Firestore rules cannot enforce it —
// they cannot cheaply see sibling documents, so a rule could only reject an overlap it
// happens to be shown. It is held HERE, by running `nutritionPlanOverlapEdits` and
// applying its edits in the SAME batch as the new plan. The preview the coach sees before
// saving runs the same function on the same data, so the sentence on screen and the write
// can never disagree.

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateToday } from "./civil-date";
import { FirestoreCollections } from "./collections";
import { nutritionPlanEvent, recordCoachActivityEvent } from "./coach-activity-log";
import {
  describeNutritionOverlap,
  nutritionPlanFormSchema,
  type NutritionOverlapNotice,
} from "./nutrition-plan-form";
import { decodeNutritionPlan, normalizeNutritionTargets } from "./nutrition-decode";
import { nutritionPlanOverlapEdits } from "./nutrition-plan-resolution";
import {
  parseNutritionMealStatus,
  type NutritionLog,
  type NutritionMealEntry,
  type NutritionPlan,
} from "./nutrition-schema";

const PLANS = FirestoreCollections.nutritionPlans;

/** Bound on every list read — a client cannot realistically have 200 phases. */
const MAX_PLANS = 200;

/**
 * Bound on the log read. One doc per client-day, so 400 covers well over a year — past
 * any window a screen asks for, and a hard ceiling so a corrupt range cannot pull the
 * whole collection into a serverless function.
 */
const MAX_LOGS = 400;

export interface NutritionClientContext {
  clientId: string;
  clientTimezone: string;
  todayCivil: string;
}

/**
 * Loads every plan for a client the CALLING trainer owns, newest phase last.
 *
 * The ownership check is a `users/{clientId}.coachId` read, not a trust of the caller's
 * argument — the same guard the rules apply, done here so the coach gets `notFound()`
 * instead of an opaque permission error.
 */
export async function listNutritionPlansForClient(
  clientId: string,
): Promise<{ plans: NutritionPlan[]; context: NutritionClientContext }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const clientSnap = await db.collection(FirestoreCollections.users).doc(clientId).get();
  if (!clientSnap.exists) throw new Error("NotFound");
  const client = clientSnap.data() as { coachId?: string; timezone?: string } | undefined;
  if (!client || client.coachId !== trainer.uid) throw new Error("Forbidden");

  const snap = await db
    .collection(PLANS)
    .where("clientId", "==", clientId)
    .limit(MAX_PLANS)
    .get();

  const plans = snap.docs
    .map((doc) => decodeNutritionPlan(doc.id, doc.data()))
    .filter((plan): plan is NutritionPlan => plan !== null)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  // The client's zone, not the coach's: the phase boundary belongs to whoever is eating.
  const clientTimezone = client.timezone || "UTC";

  return {
    plans,
    context: { clientId, clientTimezone, todayCivil: civilDateToday(clientTimezone) },
  };
}

/**
 * The client's daily logs inside the closed civil-date range `[start, end]` — what the
 * compliance grid, the note feed and the phase table all read (#919).
 *
 * ⚠️ **This query needs the composite index `nutrition_logs (clientId ASC, civilDate
 * ASC)`.** Equality on one field plus a range on another is exactly the shape that
 * already forced `habit_logs (clientId, civilDate)`. It was missing for the whole epic
 * because THE EMULATOR DOES NOT ENFORCE INDEXES: every nutrition suite was green while
 * production answered `FAILED_PRECONDITION` to this query. Deployed 2026-08-18 (#919).
 *
 * Ownership is re-checked through `listNutritionPlansForClient` rather than trusted from
 * the caller — same defence-in-depth as every other read here, and a coach who lost the
 * client gets `Forbidden`, not somebody else's eating history.
 */
export async function listNutritionLogsForClient(
  clientId: string,
  start: string,
  end: string,
): Promise<NutritionLog[]> {
  await listNutritionPlansForClient(clientId);
  if (start > end) return [];

  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.nutritionLogs)
    .where("clientId", "==", clientId)
    .where("civilDate", ">=", start)
    .where("civilDate", "<=", end)
    .limit(MAX_LOGS)
    .get();

  return snap.docs
    .map((doc) => decodeLog(doc.id, doc.data()))
    .filter((log): log is NutritionLog => log !== null)
    .sort((a, b) => a.civilDate.localeCompare(b.civilDate));
}

/**
 * What assigning a phase over `[startsOn, endsOn]` would do to the phases that already
 * exist — rendered as the warning ABOVE the save button.
 *
 * Deliberately the same computation `assignNutritionPlan` runs, on data read the same way.
 * A hand-written warning drifts the first time the trimming rules change, and then the
 * screen promises one thing while the write does another.
 */
export async function previewNutritionAssign(input: {
  clientId: string;
  startsOn: string;
  endsOn: string | null;
  excludePlanId?: string;
}): Promise<NutritionOverlapNotice[]> {
  const { plans } = await listNutritionPlansForClient(input.clientId);
  const existing = input.excludePlanId
    ? plans.filter((plan) => plan.id !== input.excludePlanId)
    : plans;
  const edits = nutritionPlanOverlapEdits(existing, input.startsOn, input.endsOn);
  return describeNutritionOverlap(edits, existing);
}

/**
 * Creates a phase and, in the SAME batch, applies whatever the overlap planner says has to
 * happen to the phases already there.
 *
 * One batch is the point: a trim that lands without its new phase (or the other way round)
 * leaves the client with a day that has two plans or none, and the apps would resolve it
 * silently rather than fail. The edits are recomputed here from freshly-read data — the
 * preview the coach saw is a courtesy, not the source of truth, because minutes may have
 * passed and another coach session may have written in between.
 */
export async function assignNutritionPlan(
  rawInput: unknown,
): Promise<{ id: string; applied: NutritionOverlapNotice[] }> {
  const trainer = await getCurrentTrainer();

  // Parse FIRST, then stamp identity from the session. A tampered `trainerId` in the
  // payload cannot survive: the schema does not accept the field at all.
  const data = nutritionPlanFormSchema.parse(rawInput);

  const { plans } = await listNutritionPlansForClient(data.clientId);
  const db = gcFitnessFirestore();

  const planId = `nut-${trainer.uid}-${randomUUID()}`;
  const edits = nutritionPlanOverlapEdits(plans, data.startsOn, data.endsOn);
  const batch = db.batch();

  for (const edit of edits) {
    const ref = db.collection(PLANS).doc(edit.planId);
    if (edit.action.kind === "trim") {
      batch.update(ref, { endsOn: edit.action.endsOn, updatedAt: FieldValue.serverTimestamp() });
    } else if (edit.action.kind === "deferStart") {
      batch.update(ref, {
        startsOn: edit.action.startsOn,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // Superseded: soft-delete. Hard delete is denied at the rule layer, and the phase
      // may already have logs pointing at it that must stay readable.
      batch.update(ref, { deleted: true, updatedAt: FieldValue.serverTimestamp() });
    }
  }

  batch.set(db.collection(PLANS).doc(planId), {
    clientId: data.clientId,
    trainerId: trainer.uid, // ALWAYS from the session, NEVER from the input.
    source: "coach",
    name: data.name,
    templateId: data.templateId ?? null,
    startsOn: data.startsOn,
    // The load-bearing line: an open-ended phase ships `endsOn: null` as a PRESENT key.
    // Firestore cannot match a missing field, and open-ended is the common case — that
    // combination is exactly how #400 made client-created habits invisible.
    endsOn: data.endsOn,
    targets: normalizeNutritionTargets(data.targets),
    meals: data.meals.map((meal, index) => ({
      mealId: meal.mealId ?? `meal-${randomUUID()}`,
      name: meal.name,
      moment: meal.moment,
      targets: normalizeNutritionTargets(meal.targets ?? {}),
      options: (meal.options ?? []).map((option) => ({
        id: option.id ?? `opt-${randomUUID()}`,
        text: option.text,
        targets: normalizeNutritionTargets(option.targets ?? {}),
      })),
      order: index,
    })),
    ...(data.reminders ? { reminders: data.reminders } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  const applied = describeNutritionOverlap(edits, plans);

  // Observability. `coach_activity` is what "My Activity" reads — NOT the raw docs — so an
  // assign that skips it is an action the coach can never find again. One event per
  // affected plan: a silent trim is exactly the thing a coach later swears they never did.
  await recordCoachActivityEvent(
    db,
    nutritionPlanEvent({
      trainerId: trainer.uid,
      planId,
      name: data.name,
      clientId: data.clientId,
      startsOn: data.startsOn,
      endsOn: data.endsOn,
      change: "assigned",
    }),
  );
  for (const notice of applied) {
    const touched = plans.find((plan) => plan.id === notice.planId);
    if (!touched) continue;
    await recordCoachActivityEvent(
      db,
      nutritionPlanEvent({
        trainerId: trainer.uid,
        planId: notice.planId,
        name: touched.name,
        clientId: data.clientId,
        startsOn: notice.kind === "deferStart" ? (notice.date ?? touched.startsOn) : touched.startsOn,
        endsOn: notice.kind === "trim" ? notice.date : touched.endsOn,
        change: notice.kind === "supersede" ? "closed" : "trimmed",
      }),
    );
  }

  return { id: planId, applied };
}

/**
 * Edits an existing phase, re-applying the overlap invariant because moving a phase's
 * dates can collide with its neighbours exactly like a fresh assign can.
 *
 * `clientId`, `trainerId` and `source` are never touched — the rules pin them too, but a
 * repointed phase would silently move a client's whole nutrition history, so it is worth
 * denying twice.
 */
export async function updateNutritionPlan(
  planId: string,
  rawInput: unknown,
): Promise<{ applied: NutritionOverlapNotice[] }> {
  const trainer = await getCurrentTrainer();
  const data = nutritionPlanFormSchema.parse(rawInput);

  const db = gcFitnessFirestore();
  const ref = db.collection(PLANS).doc(planId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NotFound");
  const current = decodeNutritionPlan(planId, snap.data());
  if (!current) throw new Error("NotFound");
  if (current.trainerId !== trainer.uid) throw new Error("Forbidden");
  if (current.clientId !== data.clientId) throw new Error("Forbidden");

  const { plans } = await listNutritionPlansForClient(data.clientId);
  const others = plans.filter((plan) => plan.id !== planId);
  const edits = nutritionPlanOverlapEdits(others, data.startsOn, data.endsOn);

  const batch = db.batch();
  for (const edit of edits) {
    const otherRef = db.collection(PLANS).doc(edit.planId);
    if (edit.action.kind === "trim") {
      batch.update(otherRef, {
        endsOn: edit.action.endsOn,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (edit.action.kind === "deferStart") {
      batch.update(otherRef, {
        startsOn: edit.action.startsOn,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      batch.update(otherRef, { deleted: true, updatedAt: FieldValue.serverTimestamp() });
    }
  }

  batch.update(ref, {
    name: data.name,
    templateId: data.templateId ?? null,
    startsOn: data.startsOn,
    endsOn: data.endsOn,
    targets: normalizeNutritionTargets(data.targets),
    meals: data.meals.map((meal, index) => ({
      mealId: meal.mealId ?? `meal-${randomUUID()}`,
      name: meal.name,
      moment: meal.moment,
      targets: normalizeNutritionTargets(meal.targets ?? {}),
      options: (meal.options ?? []).map((option) => ({
        id: option.id ?? `opt-${randomUUID()}`,
        text: option.text,
        targets: normalizeNutritionTargets(option.targets ?? {}),
      })),
      order: index,
    })),
    ...(data.reminders ? { reminders: data.reminders } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  const applied = describeNutritionOverlap(edits, others);
  await recordCoachActivityEvent(
    db,
    nutritionPlanEvent({
      trainerId: trainer.uid,
      planId,
      name: data.name,
      clientId: data.clientId,
      startsOn: data.startsOn,
      endsOn: data.endsOn,
      change: "edited",
    }),
  );

  return { applied };
}

/**
 * Soft-deletes a phase. There is no hard delete anywhere — the rules deny it, and daily
 * logs point at the plan by id and have to stay readable. A phase the coach "removed" is
 * still a month the client lived.
 */
export async function softDeleteNutritionPlan(planId: string): Promise<void> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const ref = db.collection(PLANS).doc(planId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NotFound");
  const current = decodeNutritionPlan(planId, snap.data());
  if (!current) throw new Error("NotFound");
  if (current.trainerId !== trainer.uid) throw new Error("Forbidden");

  await ref.update({ deleted: true, updatedAt: FieldValue.serverTimestamp() });

  await recordCoachActivityEvent(
    db,
    nutritionPlanEvent({
      trainerId: trainer.uid,
      planId,
      name: current.name,
      clientId: current.clientId,
      startsOn: current.startsOn,
      endsOn: current.endsOn,
      change: "closed",
    }),
  );
}

// ── Private ─────────────────────────────────────────────────────────────────────────

/**
 * Strips `undefined` from a macro map.
 *
 * `gcFitnessFirestore()` does NOT set `ignoreUndefinedProperties`, so a single
 * `field: undefined` throws at write time and takes the whole batch with it. A macro the
 * coach left blank arrives as `undefined` from the form, which makes this the most likely
 * place in the feature to hit that.
 */
/**
 * Forgiving decode of a daily log. A malformed doc is SKIPPED, never thrown on: one bad
 * day must not blank the whole grid, and the coach can still read the rest of the week.
 *
 * The snapshot is read verbatim — never filtered, never capped. Any surface that projects
 * it (the grid here, the home widget on the phones) shows whatever is in it, so a
 * truncated snapshot makes the screen lie and nothing fails. That was #900.
 */
function decodeLog(id: string, raw: unknown): NutritionLog | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const clientId = typeof data.clientId === "string" ? data.clientId : null;
  const civilDate = typeof data.civilDate === "string" ? data.civilDate : null;
  if (!clientId || !civilDate) return null;

  const meals: Record<string, NutritionMealEntry> = {};
  if (data.meals && typeof data.meals === "object") {
    for (const [mealId, value] of Object.entries(data.meals as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      meals[mealId] = {
        // A status nobody can parse must never inflate adherence, so the twin's decode
        // falls back to `missed`. Reuse it rather than re-deciding that here.
        status: parseNutritionMealStatus(entry.status),
        note: typeof entry.note === "string" ? entry.note : null,
        actualMacros:
          entry.actualMacros && typeof entry.actualMacros === "object"
            ? (entry.actualMacros as NutritionMealEntry["actualMacros"])
            : null,
      };
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
