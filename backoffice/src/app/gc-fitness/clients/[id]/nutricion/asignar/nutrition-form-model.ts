// nutrition-form-model.ts
//
// The pure half of AssignNutritionForm (#507 — split out of the 1,400-line
// component): the editable draft shapes, the conversions between the wire plan
// / a library template and those drafts, the template diff and the payload the
// save sends. No React, no Firestore — unit tested in
// `../__tests__/nutrition-form-model.test.ts`.
//
// Moved verbatim; behaviour must not change.

import { templateDeviations } from "@/lib/gc-fitness/nutrition-library-model";
import type { NutritionTemplateRow } from "@/lib/gc-fitness/nutrition-library-model";
import type { NutritionPhaseState } from "@/lib/gc-fitness/nutrition-plan-form";
import type { NutritionMealMoment, NutritionPlan } from "@/lib/gc-fitness/nutrition-schema";
import { parseDecimalInput } from "@/lib/gc-fitness/decimal-input";

export interface DraftOption {
  key: string;
  /**
   * Set only when the option came from an existing phase. It is kept so a later edit
   * rewrites the same option instead of minting a new id for text the client already read.
   */
  id?: string;
  text: string;
  textEn: string;
  kcal: string;
}

export interface DraftMeal {
  key: string;
  /** Set only when the row came from a library meal — provenance, and the daily-log key. */
  mealId?: string;
  name: string;
  nameEn: string;
  moment: NutritionMealMoment;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  options: DraftOption[];
}

/**
 * Everything the coach can type, as one serializable value — what the draft stores.
 * `showTranslation` and `overlap` are view state and are rebuilt on their own.
 */
export interface FormSnapshot {
  scope: EditScope;
  name: string;
  nameEn: string;
  startsOn: string;
  openEnded: boolean;
  endsOn: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  meals: DraftMeal[];
  sourceTemplate: NutritionTemplateRow | null;
}

let seq = 0;
export function nextKey(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function emptyMeal(moment: NutritionMealMoment): DraftMeal {
  return {
    key: nextKey("meal"),
    name: "",
    nameEn: "",
    moment,
    kcal: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    options: [],
  };
}

/**
 * The English slot: what was typed in English, or the Spanish text when there is none.
 *
 * Reads the English field even while its pane is collapsed, because a draft prefilled from
 * a library template already HAS an English name — discarding it on save would flatten
 * every template's translation the first time it is assigned.
 */
export function englishOr(english: string, fallback: string): string {
  const typed = english.trim();
  return typed === "" ? fallback.trim() : typed;
}

/** Blank → `null`, so an unset macro stays unset instead of becoming a zero target. */
/** Same parser as the library dialog's — "12,5" is 12.5 here too (#451). */
export function numberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = parseDecimalInput(raw);
  return Number.isFinite(value) ? value : null;
}

/** Wire macro → field text. A missing macro becomes "", never "0" — see `MacroFields`. */
export function macroText(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

export function initialName(editing: NutritionEditContext | null, locale: "es" | "en"): string {
  if (!editing) return "";
  const { name } = editing.plan;
  return locale === "es" ? name.es || name.en : name.en || name.es;
}

/**
 * The phase's meals as editable drafts.
 *
 * `mealId` and the option ids SURVIVE. The daily log keys its `meals` map by `mealId`, so
 * minting fresh ones would orphan every mark the client has already made: the meal would
 * look unmarked and the adherence for those days would drop without anything failing.
 */
export function draftMealsFromPlan(plan: NutritionPlan): DraftMeal[] {
  const meals = [...plan.meals]
    .sort((a, b) => a.order - b.order)
    .map((meal) => ({
      key: nextKey("meal"),
      mealId: meal.mealId,
      name: meal.name.es || meal.name.en,
      nameEn: meal.name.en || meal.name.es,
      moment: meal.moment,
      kcal: macroText(meal.targets?.kcal),
      proteinG: macroText(meal.targets?.proteinG),
      carbsG: macroText(meal.targets?.carbsG),
      fatG: macroText(meal.targets?.fatG),
      options: (meal.options ?? []).map((option) => ({
        key: nextKey("option"),
        id: option.id,
        text: option.text.es || option.text.en,
        textEn: option.text.en || option.text.es,
        kcal: macroText(option.targets?.kcal),
      })),
    }));
  return meals.length > 0 ? meals : [emptyMeal("breakfast")];
}

/**
 * What the form needs to know when it opens on an EXISTING phase (#949).
 *
 * `todayCivil` is the client's today, not the coach's: the cutoff the coach picks is a day
 * in the life of whoever is eating.
 */
export interface NutritionEditContext {
  planId: string;
  plan: NutritionPlan;
  state: NutritionPhaseState;
  todayCivil: string;
}

/** Which write an edit turns into. See the file header for why these are two writes. */
export type EditScope = "fromDate" | "whole";

/**
 * "De un día en adelante" is only on the table for a phase that is RUNNING and that
 * started before today. A scheduled phase has no past to preserve, and a phase that
 * started today would be trimmed to yesterday — i.e. to nothing.
 */
export function canSplitPhase(editing: NutritionEditContext | null): boolean {
  return (
    editing !== null &&
    editing.state === "current" &&
    editing.plan.startsOn < editing.todayCivil
  );
}

/**
 * A library template's meals as editable drafts — a COPY, not a link.
 *
 * The `mealId` SURVIVES into the assigned plan: it is the key the daily log's `meals`
 * map uses, and the FK the usage pill counts by.
 */
export function draftMealsFromTemplate(template: NutritionTemplateRow): DraftMeal[] {
  return (
  [...template.meals]
    .sort((a, b) => a.order - b.order)
    .map((meal) => ({
      key: nextKey("meal"),
      // The `mealId` SURVIVES into the assigned plan: it is the key the daily log's
      // `meals` map uses, and the FK the usage pill counts by.
      mealId: meal.mealId,
      name: meal.name.es || meal.name.en,
      nameEn: meal.name.en || meal.name.es,
      moment: meal.moment,
      kcal: meal.targets?.kcal == null ? "" : String(meal.targets.kcal),
      proteinG: meal.targets?.proteinG == null ? "" : String(meal.targets.proteinG),
      carbsG: meal.targets?.carbsG == null ? "" : String(meal.targets.carbsG),
      fatG: meal.targets?.fatG == null ? "" : String(meal.targets.fatG),
      options: (meal.options ?? []).map((option) => ({
        key: nextKey("option"),
        text: option.text.es || option.text.en,
        textEn: option.text.en || option.text.es,
        kcal: option.targets?.kcal == null ? "" : String(option.targets.kcal),
      })),
    }))
  );
}

/**
 * Fresh React keys for meals restored from a draft: the stored ones came from the
 * PREVIOUS page load's counter and would collide with the keys this load hands out to
 * the next added meal/option.
 */
export function rekeyDraftMeals(meals: DraftMeal[]): DraftMeal[] {
  return meals.map((meal) => ({
    ...meal,
    key: nextKey("meal"),
    options: (meal.options ?? []).map((option) => ({ ...option, key: nextKey("option") })),
  }));
}

/** The editable values the template diff and the payload read. */
export interface NutritionFormValues {
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  meals: DraftMeal[];
}

/**
 * What the coach retouched FOR THIS CLIENT, relative to the template.
 *
 * A diff, not a dirty flag: typing a value and then typing the original back is not a
 * modification, and a flag would keep claiming it was. Empty while no template is in play.
 */
export function nutritionFormDeviations(
  sourceTemplate: NutritionTemplateRow | null,
  { kcal, proteinG, carbsG, fatG, meals }: NutritionFormValues,
) {
  if (!sourceTemplate) return [];
  return templateDeviations(
    {
      targets: sourceTemplate.targets ?? {},
      meals: [...sourceTemplate.meals]
        .sort((a, b) => a.order - b.order)
        .map((meal) => ({
          name: meal.name,
          moment: meal.moment,
          targets: meal.targets ?? {},
          options: meal.options ?? [],
        })),
    },
    {
      targets: {
        kcal: numberOrNull(kcal),
        proteinG: numberOrNull(proteinG),
        carbsG: numberOrNull(carbsG),
        fatG: numberOrNull(fatG),
      },
      meals: meals.map((meal) => ({
        name: { es: meal.name.trim(), en: englishOr(meal.nameEn, meal.name) },
        moment: meal.moment,
        targets: {
          kcal: numberOrNull(meal.kcal),
          proteinG: numberOrNull(meal.proteinG),
          carbsG: numberOrNull(meal.carbsG),
          fatG: numberOrNull(meal.fatG),
        },
        options: meal.options.map((option) => ({
          text: { es: option.text.trim(), en: englishOr(option.textEn, option.text) },
        })),
      })),
    },
  );
}

/** The save payload (`assignNutritionPlan` / `updateNutritionPlan`). */
export function buildNutritionPayload({
  clientId,
  sourceTemplate,
  name,
  nameEn,
  startsOn,
  effectiveEndsOn,
  kcal,
  proteinG,
  carbsG,
  fatG,
  meals,
}: NutritionFormValues & {
  clientId: string;
  sourceTemplate: NutritionTemplateRow | null;
  name: string;
  nameEn: string;
  startsOn: string;
  effectiveEndsOn: string | null;
}) {
  return {
    clientId,
    // Provenance. The library's "asignada N veces" pill counts exactly this field, and it
    // is what lets a later audit answer "which template did this plan come from".
    templateId: sourceTemplate?.id ?? null,
    // The schema requires BOTH slots, and "no translation" must not mean "blank in
    // English" — so the Spanish text fills in when there is no English one.
    //
    // ⚠️ It reads `nameEn` regardless of whether the pane is OPEN (#918). A plan
    // prefilled from a template already carries the template's English name, and gating
    // on the toggle would overwrite it with the Spanish text the moment the coach saved
    // without expanding a pane they had no reason to expand.
    name: { es: name.trim(), en: englishOr(nameEn, name) },
    startsOn,
    endsOn: effectiveEndsOn,
    targets: {
      kcal: numberOrNull(kcal),
      proteinG: numberOrNull(proteinG),
      carbsG: numberOrNull(carbsG),
      fatG: numberOrNull(fatG),
    },
    meals: meals.map((meal) => ({
      ...(meal.mealId ? { mealId: meal.mealId } : {}),
      name: { es: meal.name.trim(), en: englishOr(meal.nameEn, meal.name) },
      moment: meal.moment,
      targets: {
        kcal: numberOrNull(meal.kcal),
        proteinG: numberOrNull(meal.proteinG),
        carbsG: numberOrNull(meal.carbsG),
        fatG: numberOrNull(meal.fatG),
      },
      options: meal.options.map((option) => ({
        ...(option.id ? { id: option.id } : {}),
        text: { es: option.text.trim(), en: englishOr(option.textEn, option.text) },
        targets: { kcal: numberOrNull(option.kcal) },
      })),
    })),
  };
}

export function momentKey(moment: NutritionMealMoment) {
  switch (moment) {
    case "breakfast":
      return "momentBreakfast" as const;
    case "lunch":
      return "momentLunch" as const;
    case "snack":
      return "momentSnack" as const;
    case "dinner":
      return "momentDinner" as const;
    default:
      return "momentOther" as const;
  }
}
