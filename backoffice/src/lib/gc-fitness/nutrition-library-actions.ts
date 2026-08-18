// nutrition-library-actions.ts
//
// Server Actions behind the coach's nutrition LIBRARY (#918): `nutrition_meals` (reusable
// meals + their options) and `nutrition_templates` (reusable whole plans, assignable to
// many clients).
//
// ⚠️ EVERY EXPORT HERE MUST BE `async`. Jest does not apply the `"use server"` directive, so
// a synchronous export passes the entire suite and then dies in `next build` with "Server
// Actions must be async functions" — and `main` auto-deploys, so that publishes a broken
// deploy with the tests green. It already happened (#785). The pure helpers live in
// `nutrition-library-model.ts`.
//
// ── THE RULE THIS MODULE MUST NOT BREAK ──────────────────────────────────────────────
//
// **Editing the library does NOT rewrite what is already assigned.** There is deliberately
// no code path from a meal edit to a plan: a plan embeds frozen COPIES. If a coach wants to
// propagate, they re-assign. What this module owes them instead is the USAGE COUNT, so they
// know before editing that a name lives in 9 other places this edit will not reach.
//
// ── STANDARD ENTRIES ARE DUPLICATED, NEVER EDITED ────────────────────────────────────
//
// `ownerId: null` is the standard library (Admin-SDK seeded). Every mutator here refuses a
// standard doc and the UI offers "Duplicar" instead — the #163 precedent, where an /edit
// link on a standard workout template let a coach believe they had customized something
// global.

"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import { nutritionLibraryEvent, recordCoachActivityEvent } from "./coach-activity-log";
import {
  duplicatedLibraryName,
  nutritionMealFormSchema,
  nutritionTemplateFormSchema,
  tallyMealUsageInPlans,
  tallyMealUsageInTemplates,
  tallyTemplateUsageInPlans,
  type NutritionMealRow,
  type NutritionTemplateRow,
} from "./nutrition-library-model";
import {
  isStandardNutritionEntry,
  type LocalizedText,
  type MacroTargets,
  type NutritionPlanMeal,
} from "./nutrition-schema";

const MEALS = FirestoreCollections.nutritionMeals;
const TEMPLATES = FirestoreCollections.nutritionTemplates;
const PLANS = FirestoreCollections.nutritionPlans;

/**
 * Bound on every list read. A coach with more than this many library entries has a
 * different problem than pagination, and an unbounded read is how a page starts costing
 * money quietly.
 */
const MAX_LIBRARY = 500;

/** Bound on the plans scan behind the usage pills. */
const MAX_PLANS = 2000;

// ── Reads ───────────────────────────────────────────────────────────────────────────

/**
 * The calling trainer's meals plus the standard ones, standard last.
 *
 * TWO queries rather than one unfiltered scan: the rules only admit
 * `ownerId == uid || ownerId == null`, so a single unconstrained `get()` would be denied
 * for a client SDK and merely wasteful here. Keeping the shape the rules describe means
 * this action and a future on-device library read agree about what is visible.
 */
export async function listNutritionMeals(): Promise<NutritionMealRow[]> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const [ownSnap, standardSnap] = await Promise.all([
    db.collection(MEALS).where("ownerId", "==", trainer.uid).limit(MAX_LIBRARY).get(),
    db.collection(MEALS).where("ownerId", "==", null).limit(MAX_LIBRARY).get(),
  ]);

  const own = ownSnap.docs
    .map((doc) => decodeMeal(doc.id, doc.data()))
    .filter((meal): meal is NutritionMealRow => meal !== null && !meal.deleted);
  const standard = standardSnap.docs
    .map((doc) => decodeMeal(doc.id, doc.data()))
    .filter((meal): meal is NutritionMealRow => meal !== null && !meal.deleted);

  return [...sortByName(own), ...sortByName(standard)];
}

/** The calling trainer's templates plus the standard ones, standard last. */
export async function listNutritionTemplates(): Promise<NutritionTemplateRow[]> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const [ownSnap, standardSnap] = await Promise.all([
    db.collection(TEMPLATES).where("ownerId", "==", trainer.uid).limit(MAX_LIBRARY).get(),
    db.collection(TEMPLATES).where("ownerId", "==", null).limit(MAX_LIBRARY).get(),
  ]);

  const own = ownSnap.docs
    .map((doc) => decodeTemplate(doc.id, doc.data()))
    .filter((tpl): tpl is NutritionTemplateRow => tpl !== null && !tpl.deleted);
  const standard = standardSnap.docs
    .map((doc) => decodeTemplate(doc.id, doc.data()))
    .filter((tpl): tpl is NutritionTemplateRow => tpl !== null && !tpl.deleted);

  return [...sortByName(own), ...sortByName(standard)];
}

export interface NutritionLibraryUsage {
  /** `mealId` → in how many of MY templates. */
  mealsInTemplates: Record<string, number>;
  /** `mealId` → in how many plans I assigned. */
  mealsInPlans: Record<string, number>;
  /** `templateId` → how many plans were assigned from it. */
  templatesInPlans: Record<string, number>;
}

/**
 * The numbers behind the usage pills.
 *
 * Scoped to the CALLING trainer's own plans (`trainerId == uid`), not to every plan that
 * embeds the meal: a count that included another coach's plans would be a cross-tenant
 * leak dressed up as a number, and it would also be unactionable — this coach cannot
 * re-assign somebody else's client.
 */
export async function countNutritionLibraryUsage(): Promise<NutritionLibraryUsage> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const [templatesSnap, plansSnap] = await Promise.all([
    db.collection(TEMPLATES).where("ownerId", "==", trainer.uid).limit(MAX_LIBRARY).get(),
    db.collection(PLANS).where("trainerId", "==", trainer.uid).limit(MAX_PLANS).get(),
  ]);

  const templates = templatesSnap.docs.map((doc) => ({
    id: doc.id,
    deleted: doc.get("deleted") === true,
    meals: (doc.get("meals") ?? []) as Array<{ mealId?: string | null }>,
  }));
  const plans = plansSnap.docs.map((doc) => ({
    id: doc.id,
    deleted: doc.get("deleted") === true,
    templateId: (doc.get("templateId") ?? null) as string | null,
    meals: (doc.get("meals") ?? []) as Array<{ mealId?: string | null }>,
  }));

  return {
    mealsInTemplates: tallyMealUsageInTemplates(templates),
    mealsInPlans: tallyMealUsageInPlans(plans),
    templatesInPlans: tallyTemplateUsageInPlans(plans),
  };
}

// ── Meals ───────────────────────────────────────────────────────────────────────────

export async function createNutritionMeal(
  rawInput: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const data = nutritionMealFormSchema.parse(rawInput);
  const db = gcFitnessFirestore();

  const id = `nutmeal-${trainer.uid}-${randomUUID()}`;
  await db
    .collection(MEALS)
    .doc(id)
    .set({
      name: data.name,
      moment: data.moment,
      // ALWAYS from the session, NEVER from input. `ownerId: null` is the standard library
      // and the rules only admit `ownerId == uid` here, but a payload that could name its
      // own owner is a hole worth closing twice.
      ownerId: trainer.uid,
      targets: normalizeTargets(data.targets ?? {}),
      options: data.options.map((option) => ({
        id: option.id ?? `opt-${randomUUID()}`,
        text: option.text,
        targets: normalizeTargets(option.targets ?? {}),
      })),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  await recordCoachActivityEvent(
    db,
    nutritionLibraryEvent({
      trainerId: trainer.uid,
      entity: "meal",
      entityId: id,
      name: data.name,
      change: "created",
    }),
  );

  return { id };
}

export async function updateNutritionMeal(
  mealId: string,
  rawInput: unknown,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const data = nutritionMealFormSchema.parse(rawInput);
  const db = gcFitnessFirestore();

  const ref = db.collection(MEALS).doc(mealId);
  const snap = await ref.get();
  const existing = snap.exists ? decodeMeal(mealId, snap.data()) : null;
  if (!existing) throw new Error("NotFound");
  assertOwned(existing, trainer.uid);

  // `updatedAt` is co-written, not optional: the rule layer's affectedKeys whitelist
  // includes it and every other collection in this codebase writes it, so a reader can
  // trust "when did this last change" everywhere or nowhere.
  await ref.update({
    name: data.name,
    moment: data.moment,
    targets: normalizeTargets(data.targets ?? {}),
    options: data.options.map((option) => ({
      id: option.id ?? `opt-${randomUUID()}`,
      text: option.text,
      targets: normalizeTargets(option.targets ?? {}),
    })),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

/**
 * Soft-delete. Hard delete is denied at the rule layer and would be wrong anyway: the meal
 * may be frozen into plans and logs that must stay readable.
 */
export async function softDeleteNutritionMeal(mealId: string): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const ref = db.collection(MEALS).doc(mealId);
  const snap = await ref.get();
  const existing = snap.exists ? decodeMeal(mealId, snap.data()) : null;
  if (!existing) throw new Error("NotFound");
  assertOwned(existing, trainer.uid);

  await ref.update({ deleted: true, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

/**
 * Copy a meal into the caller's own library — the ONLY way to "edit" a standard one.
 *
 * Works on an owned meal too (a coach duplicating their own to make a variant), which is
 * why it does not assert standardness.
 */
export async function duplicateNutritionMeal(mealId: string): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const snap = await db.collection(MEALS).doc(mealId).get();
  const source = snap.exists ? decodeMeal(mealId, snap.data()) : null;
  if (!source) throw new Error("NotFound");
  // Readable ⇒ duplicable. The rules allow reading standard entries and your own, so
  // anything else is somebody else's private meal and must not be copyable.
  if (!isStandardNutritionEntry(source) && source.ownerId !== trainer.uid) {
    throw new Error("Forbidden");
  }

  const id = `nutmeal-${trainer.uid}-${randomUUID()}`;
  await db
    .collection(MEALS)
    .doc(id)
    .set({
      name: duplicatedLibraryName(source.name),
      moment: source.moment,
      ownerId: trainer.uid,
      targets: normalizeTargets(source.targets ?? {}),
      // Fresh option ids: two docs sharing option ids invite a future "same option" join
      // that does not exist. The copy is a new entity.
      options: (source.options ?? []).map((option) => ({
        id: `opt-${randomUUID()}`,
        text: option.text,
        targets: normalizeTargets(option.targets ?? {}),
      })),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  await recordCoachActivityEvent(
    db,
    nutritionLibraryEvent({
      trainerId: trainer.uid,
      entity: "meal",
      entityId: id,
      name: duplicatedLibraryName(source.name),
      change: "duplicated",
    }),
  );

  return { id };
}

// ── Templates ───────────────────────────────────────────────────────────────────────

export async function createNutritionTemplate(
  rawInput: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const data = nutritionTemplateFormSchema.parse(rawInput);
  const db = gcFitnessFirestore();

  const id = `nuttpl-${trainer.uid}-${randomUUID()}`;
  await db
    .collection(TEMPLATES)
    .doc(id)
    .set({
      name: data.name,
      ownerId: trainer.uid,
      targets: normalizeTargets(data.targets),
      meals: freezeMeals(data.meals),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  await recordCoachActivityEvent(
    db,
    nutritionLibraryEvent({
      trainerId: trainer.uid,
      entity: "template",
      entityId: id,
      name: data.name,
      change: "created",
    }),
  );

  return { id };
}

export async function updateNutritionTemplate(
  templateId: string,
  rawInput: unknown,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const data = nutritionTemplateFormSchema.parse(rawInput);
  const db = gcFitnessFirestore();

  const ref = db.collection(TEMPLATES).doc(templateId);
  const snap = await ref.get();
  const existing = snap.exists ? decodeTemplate(templateId, snap.data()) : null;
  if (!existing) throw new Error("NotFound");
  assertOwned(existing, trainer.uid);

  // ⚠️ This touches the TEMPLATE only. Plans already assigned from it keep their frozen
  // copies — there is no fan-out here, on purpose (see the file header).
  await ref.update({
    name: data.name,
    targets: normalizeTargets(data.targets),
    meals: freezeMeals(data.meals),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

export async function softDeleteNutritionTemplate(
  templateId: string,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const ref = db.collection(TEMPLATES).doc(templateId);
  const snap = await ref.get();
  const existing = snap.exists ? decodeTemplate(templateId, snap.data()) : null;
  if (!existing) throw new Error("NotFound");
  assertOwned(existing, trainer.uid);

  await ref.update({ deleted: true, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

/** Copy a template into the caller's own library — the only way to "edit" a standard one. */
export async function duplicateNutritionTemplate(
  templateId: string,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();

  const snap = await db.collection(TEMPLATES).doc(templateId).get();
  const source = snap.exists ? decodeTemplate(templateId, snap.data()) : null;
  if (!source) throw new Error("NotFound");
  if (!isStandardNutritionEntry(source) && source.ownerId !== trainer.uid) {
    throw new Error("Forbidden");
  }

  const id = `nuttpl-${trainer.uid}-${randomUUID()}`;
  await db
    .collection(TEMPLATES)
    .doc(id)
    .set({
      name: duplicatedLibraryName(source.name),
      ownerId: trainer.uid,
      targets: normalizeTargets(source.targets),
      // The meal ids SURVIVE the duplicate, unlike option ids: `mealId` is the key the
      // daily log will use once this template is assigned, and it is also the FK the usage
      // pill counts by. A fresh id here would silently zero the "in N templates" number of
      // every meal in the copy.
      meals: freezeMeals(source.meals ?? []),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  await recordCoachActivityEvent(
    db,
    nutritionLibraryEvent({
      trainerId: trainer.uid,
      entity: "template",
      entityId: id,
      name: duplicatedLibraryName(source.name),
      change: "duplicated",
    }),
  );

  return { id };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────

/**
 * `undefined` → the key is DROPPED, never written.
 *
 * `gcFitnessFirestore()` does not set `ignoreUndefinedProperties`, so one `field: undefined`
 * takes the whole write down — and a macro the coach left blank is the likeliest source in
 * this feature. Spread-conditional, not `field: x ?? undefined`.
 */
function normalizeTargets(targets: {
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}): MacroTargets {
  return {
    ...(targets.kcal != null ? { kcal: targets.kcal } : {}),
    ...(targets.proteinG != null ? { proteinG: targets.proteinG } : {}),
    ...(targets.carbsG != null ? { carbsG: targets.carbsG } : {}),
    ...(targets.fatG != null ? { fatG: targets.fatG } : {}),
  };
}

/**
 * The frozen meal copies a template stores, numbered by position.
 *
 * `order` comes from the array index, so drag-reordering in the editor is the only thing
 * that decides display order — and the ASSIGN path reads the same field, so a template and
 * the plan made from it can never disagree about the order of the day.
 */
function freezeMeals(
  meals: Array<{
    mealId?: string | null;
    name: LocalizedText;
    moment: NutritionPlanMeal["moment"];
    targets?: {
      kcal?: number | null;
      proteinG?: number | null;
      carbsG?: number | null;
      fatG?: number | null;
    } | null;
    options?: Array<{
      id?: string | null;
      text: LocalizedText;
      targets?: {
        kcal?: number | null;
        proteinG?: number | null;
        carbsG?: number | null;
        fatG?: number | null;
      } | null;
    }> | null;
    order?: number;
  }>,
): NutritionPlanMeal[] {
  return meals.map((meal, index) => ({
    mealId: meal.mealId || `meal-${randomUUID()}`,
    name: meal.name,
    moment: meal.moment,
    targets: normalizeTargets(meal.targets ?? {}),
    options: (meal.options ?? []).map((option) => ({
      id: option.id || `opt-${randomUUID()}`,
      text: option.text,
      targets: normalizeTargets(option.targets ?? {}),
    })),
    order: index,
  }));
}

/**
 * Refuses a standard entry and somebody else's entry with the SAME error.
 *
 * Standard is not "somebody else's" in the product's language, but it is in the rule
 * layer's, and the UI never routes an edit at a standard doc anyway — it offers Duplicar.
 * A distinct message here would only tell a caller which of the two they hit.
 */
function assertOwned(entry: { ownerId: string | null }, uid: string): void {
  if (isStandardNutritionEntry(entry) || entry.ownerId !== uid) {
    throw new Error("Forbidden");
  }
}

function sortByName<T extends { name: LocalizedText }>(entries: T[]): T[] {
  return [...entries].sort((a, b) =>
    (a.name.es || a.name.en).localeCompare(b.name.es || b.name.en, "es"),
  );
}

function decodeMeal(id: string, raw: unknown): NutritionMealRow | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const name = localized(data.name);
  if (!name) return null;
  return {
    id,
    name,
    moment: isMoment(data.moment) ? data.moment : "other",
    // `?? null` and NOT `|| null`: `ownerId` legitimately holds null (standard), and
    // conflating "absent" with "standard" is the #400 bug class this schema is built around.
    ownerId: typeof data.ownerId === "string" ? data.ownerId : null,
    targets: (data.targets ?? {}) as MacroTargets,
    options: Array.isArray(data.options)
      ? (data.options as NutritionMealRow["options"])
      : [],
    deleted: data.deleted === true,
  };
}

function decodeTemplate(id: string, raw: unknown): NutritionTemplateRow | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const name = localized(data.name);
  if (!name) return null;
  return {
    id,
    name,
    ownerId: typeof data.ownerId === "string" ? data.ownerId : null,
    targets: (data.targets ?? {}) as MacroTargets,
    meals: Array.isArray(data.meals)
      ? (data.meals as NutritionTemplateRow["meals"])
      : [],
    deleted: data.deleted === true,
  };
}

function localized(raw: unknown): LocalizedText | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { en?: unknown; es?: unknown };
  const en = typeof value.en === "string" ? value.en : "";
  const es = typeof value.es === "string" ? value.es : "";
  if (!en && !es) return null;
  return { en, es };
}

function isMoment(raw: unknown): raw is NutritionPlanMeal["moment"] {
  return (
    raw === "breakfast" ||
    raw === "lunch" ||
    raw === "snack" ||
    raw === "dinner" ||
    raw === "other"
  );
}
