// nutrition-bulk-actions.ts
// Server Actions behind "asignar una plantilla a varios clientes" (#927).
//
// ⚠️ EVERY EXPORT HERE MUST BE `async`. Jest does not apply `"use server"`, so a
// synchronous export passes the entire suite and then dies in `next build` — and `main`
// auto-deploys, so that publishes a broken deploy with the suite green (#785). The pure
// helpers live in `nutrition-bulk-assign.ts` and `nutrition-plan-form.ts`.
//
// ── The three things that make this more than a loop ────────────────────────────────
//
// 1. **One batch PER CLIENT, not one for the whole bulk.** The invariant nutrition is
//    built around — never two plans active on the same civil day — is per client, and a
//    per-client batch is what holds it. A single 50-client batch would make one bad
//    client roll back forty-nine good assigns; per-client batches let the action finish
//    and REPORT what failed, which is the difference between a bulk a coach can use and
//    one they cannot trust.
//
// 2. **Ownership comes from the roster read, not from the payload.** The rules join
//    `users/{clientId}.coachId == uid`, so a foreign uid is denied at the rule layer —
//    but mid-bulk, after other clients already got their plan. Filtering against the
//    caller's own roster first keeps that failure in the preview.
//
// 3. **`bulkId` is stamped on every plan written.** It is what lets the admin audit
//    timeline fold the N `nutrition_plans` creates back into one row, and what lets a
//    later question ("where did this plan come from?") be answered at all. It survives
//    the rules because `nutritionPlanShapeIsValid()` uses `hasAll`, not `hasOnly` — the
//    create branch admits extra keys. (The UPDATE branch does not, which is why the trims
//    a bulk applies carry no `bulkId`; see the note in `audit-grouping.ts`.)

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { coachVisibleClientName } from "./client-name";
import { FirestoreCollections } from "./collections";
import { nutritionPlanEvent, recordCoachActivityEvent } from "./coach-activity-log";
import {
  bulkBlockedReasonFor,
  summarizeNutritionBulkPreview,
  type NutritionBulkPreviewRow,
  type NutritionBulkSummary,
} from "./nutrition-bulk-assign";
import { decodeNutritionPlan, normalizeNutritionTargets } from "./nutrition-decode";
import {
  describeNutritionOverlap,
  nutritionBulkAssignSchema,
  MAX_BULK_ASSIGN_CLIENTS,
  type NutritionOverlapNotice,
} from "./nutrition-plan-form";
import { nutritionPlanOverlapEdits } from "./nutrition-plan-resolution";
import type { NutritionPlan } from "./nutrition-schema";

const PLANS = FirestoreCollections.nutritionPlans;

/** Firestore's ceiling on an `in` filter. */
const IN_CHUNK = 30;

/**
 * Bound per chunked plan read. 30 clients × 200 phases is the theoretical worst case and
 * nowhere near reality (a phase is a month), but the cap has to exist so a corrupt roster
 * cannot pull the collection into a serverless function.
 */
const MAX_PLANS_PER_CHUNK = 2000;

export interface NutritionBulkClientOption {
  uid: string;
  name: string;
  email: string;
  /**
   * A pre-created client who has never signed in. They own no documents yet, so they can
   * be SHOWN (the coach knows they exist) but never assigned to.
   */
  pendingProvisioning: boolean;
}

interface RosterEntry {
  name: string;
  email: string;
  pendingProvisioning: boolean;
}

/**
 * The calling trainer's clients, for the bulk dialog's picker.
 *
 * Deliberately NOT `listClientsForRoster()`: that one fans out ~5 reads per client to
 * compute compliance, unread chat and last activity, none of which a picker shows. This is
 * the single `users where coachId == me` query and nothing else.
 */
export async function listNutritionBulkClients(): Promise<NutritionBulkClientOption[]> {
  const trainer = await getCurrentTrainer();
  const roster = await loadRoster(gcFitnessFirestore(), trainer.uid);
  return [...roster.entries()]
    .map(([uid, entry]) => ({
      uid,
      name: entry.name,
      email: entry.email,
      pendingProvisioning: entry.pendingProvisioning,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export interface NutritionBulkPreview {
  rows: NutritionBulkPreviewRow[];
  summary: NutritionBulkSummary;
}

/**
 * What assigning `[startsOn, endsOn]` would do to EACH selected client — the table the
 * coach reads before confirming.
 *
 * It runs the same `nutritionPlanOverlapEdits` the write runs, on data read the same way,
 * for the same reason the single assign does: a separately-written warning drifts the
 * first time the trimming rules change, and then the screen promises one thing while the
 * write does another. Here the stakes are N times higher — the coach is agreeing to
 * fifteen trims at once on the strength of this table.
 */
export async function previewNutritionBulkAssign(input: {
  clientIds: string[];
  startsOn: string;
  endsOn: string | null;
}): Promise<NutritionBulkPreview> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const roster = await loadRoster(db, trainer.uid);

  const clientIds = dedupe(input.clientIds).slice(0, MAX_BULK_ASSIGN_CLIENTS);
  const assignable = clientIds.filter(
    (clientId) => bulkBlockedReasonFor(clientId, roster) === null,
  );
  const plansByClient = await loadPlansForClients(db, assignable);

  const rows: NutritionBulkPreviewRow[] = clientIds.map((clientId) => {
    const blockedReason = bulkBlockedReasonFor(clientId, roster);
    const clientName = roster.get(clientId)?.name ?? clientId;
    if (blockedReason !== null) {
      return { clientId, clientName, blockedReason, notices: [] };
    }
    const plans = plansByClient.get(clientId) ?? [];
    const edits = nutritionPlanOverlapEdits(plans, input.startsOn, input.endsOn);
    return {
      clientId,
      clientName,
      blockedReason: null,
      notices: describeNutritionOverlap(edits, plans),
    };
  });

  return { rows, summary: summarizeNutritionBulkPreview(rows) };
}

export interface NutritionBulkAssignResult {
  /** Ties every plan written and every activity event emitted to this one action. */
  bulkId: string;
  assigned: Array<{ clientId: string; planId: string; applied: NutritionOverlapNotice[] }>;
  /** Clients the action refused or could not write, each with a machine-readable reason. */
  failed: Array<{ clientId: string; reason: string }>;
}

/**
 * Assigns ONE plan body to many clients.
 *
 * Partial success is a first-class outcome, not an error path: a bulk that writes twelve
 * clients and fails three must say so and keep the twelve, because the alternative is a
 * coach who clicks again and double-assigns everyone who already succeeded.
 */
export async function assignNutritionTemplateToClients(
  rawInput: unknown,
): Promise<NutritionBulkAssignResult> {
  const trainer = await getCurrentTrainer();
  const data = nutritionBulkAssignSchema.parse(rawInput);

  const db = gcFitnessFirestore();
  const roster = await loadRoster(db, trainer.uid);
  const bulkId = `nutbulk-${randomUUID()}`;

  const failed: NutritionBulkAssignResult["failed"] = [];
  const eligible: string[] = [];
  for (const clientId of data.clientIds) {
    const reason = bulkBlockedReasonFor(clientId, roster);
    if (reason === null) eligible.push(clientId);
    else failed.push({ clientId, reason });
  }

  // Re-read the phases HERE rather than trusting the preview: minutes may have passed and
  // another coach session may have written in between. The preview is a courtesy; this is
  // the source of truth for what gets trimmed.
  const plansByClient = await loadPlansForClients(db, eligible);
  const assigned: NutritionBulkAssignResult["assigned"] = [];

  for (const clientId of eligible) {
    const plans = plansByClient.get(clientId) ?? [];
    const planId = `nut-${trainer.uid}-${randomUUID()}`;
    const edits = nutritionPlanOverlapEdits(plans, data.startsOn, data.endsOn);
    const batch = db.batch();

    for (const edit of edits) {
      const ref = db.collection(PLANS).doc(edit.planId);
      if (edit.action.kind === "trim") {
        batch.update(ref, {
          endsOn: edit.action.endsOn,
          updatedAt: FieldValue.serverTimestamp(),
        });
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
      clientId,
      trainerId: trainer.uid, // ALWAYS from the session, NEVER from the input.
      source: "coach",
      name: data.name,
      templateId: data.templateId ?? null,
      startsOn: data.startsOn,
      // An open-ended phase ships `endsOn: null` as a PRESENT key — Firestore cannot match
      // a missing field, and that is how #400 made client-created habits invisible.
      endsOn: data.endsOn,
      bulkId,
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

    try {
      await batch.commit();
    } catch (error) {
      // One client's failure is one client's failure. Keep going: the coach gets the rest
      // of the bulk plus an explicit list of who to retry.
      console.warn(`[nutrition-bulk] assign failed for ${clientId}`, error);
      failed.push({ clientId, reason: "writeFailed" });
      continue;
    }

    const applied = describeNutritionOverlap(edits, plans);
    assigned.push({ clientId, planId, applied });

    // Observability. ONE event per client — "Mi Actividad" filters by client server-side,
    // so a single event covering fifteen people would vanish from every per-client view.
    // The shared `groupId` is what folds them back into one row in the unfiltered feed
    // (`coach-activity-grouping.ts`).
    await recordCoachActivityEvent(
      db,
      nutritionPlanEvent({
        trainerId: trainer.uid,
        planId,
        name: data.name,
        clientId,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        change: "assigned",
        groupId: bulkId,
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
          clientId,
          startsOn:
            notice.kind === "deferStart" ? (notice.date ?? touched.startsOn) : touched.startsOn,
          endsOn: notice.kind === "trim" ? notice.date : touched.endsOn,
          change: notice.kind === "supersede" ? "closed" : "trimmed",
          // A SEPARATE group from the assigns. Folding trims in with them would produce a
          // row titled "Nutrición asignada ×21" for 15 assigns and 6 trims — a number that
          // matches no fact. Two rows, each counting one kind of thing.
          groupId: `${bulkId}:trimmed`,
        }),
      );
    }
  }

  return { bulkId, assigned, failed };
}

// ── internals ───────────────────────────────────────────────────────────────────────

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** `users where coachId == me`, the same membership the Firestore rules join on. */
async function loadRoster(db: Firestore, trainerUid: string): Promise<Map<string, RosterEntry>> {
  const snap = await db
    .collection(FirestoreCollections.users)
    .where("coachId", "==", trainerUid)
    .get();

  const roster = new Map<string, RosterEntry>();
  for (const doc of snap.docs) {
    const data = doc.data() as {
      displayName?: string;
      email?: string;
      coachNickname?: string;
    };
    roster.set(doc.id, {
      name: coachVisibleClientName({
        uid: doc.id,
        displayName: data.displayName ?? data.email ?? doc.id,
        email: data.email ?? "",
        coachNickname: data.coachNickname ?? null,
      }),
      email: data.email ?? "",
      // Always false: this query returns REAL `/users` docs, and a pre-created client is a
      // `user_mirror` row with no user doc at all — it can never appear here. The field is
      // kept so the shape matches what `bulkBlockedReasonFor` reads, and so a future
      // provisioning flag on `/users` has an obvious home.
      pendingProvisioning: false,
    });
  }
  return roster;
}

/**
 * Every client's phases, in `in`-chunks of 30 — one query per chunk instead of one per
 * client.
 *
 * The preview re-runs on every date change, so the per-client shape (a user doc read plus
 * a plans query each) would put 100 reads behind a coach dragging a date picker. Ownership
 * is not lost by batching: the caller has already filtered `clientIds` against its own
 * roster.
 */
async function loadPlansForClients(
  db: Firestore,
  clientIds: string[],
): Promise<Map<string, NutritionPlan[]>> {
  const byClient = new Map<string, NutritionPlan[]>();
  for (const clientId of clientIds) byClient.set(clientId, []);
  if (clientIds.length === 0) return byClient;

  for (let index = 0; index < clientIds.length; index += IN_CHUNK) {
    const chunk = clientIds.slice(index, index + IN_CHUNK);
    const snap = await db
      .collection(PLANS)
      .where("clientId", "in", chunk)
      .limit(MAX_PLANS_PER_CHUNK)
      .get();
    if (snap.size >= MAX_PLANS_PER_CHUNK) {
      // Loud on purpose. A truncated read would compute the overlap edits against a
      // PARTIAL phase history, and the bulk would quietly leave two plans active on the
      // same day for whichever client got cut off.
      console.warn(
        `[nutrition-bulk] plan read hit the ${MAX_PLANS_PER_CHUNK} cap for ${chunk.length} clients`,
      );
    }
    for (const doc of snap.docs) {
      const plan = decodeNutritionPlan(doc.id, doc.data());
      if (!plan) continue;
      const bucket = byClient.get(plan.clientId);
      if (bucket) bucket.push(plan);
    }
  }

  for (const plans of byClient.values()) {
    plans.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  }
  return byClient;
}
