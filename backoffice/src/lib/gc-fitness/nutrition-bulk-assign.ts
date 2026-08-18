// nutrition-bulk-assign.ts
// Pure helpers behind "asignar una plantilla a varios clientes" (#927).
//
// NO `"use server"` DIRECTIVE, ON PURPOSE — same reason as `nutrition-plan-form.ts`: in a
// server-action file every export must be async, and a synchronous one passes the whole
// Jest suite and then dies in `next build`, which is what auto-deploys (#785). The Server
// Actions that read and write live in `nutrition-actions.ts`.
//
// ── What this module is FOR ─────────────────────────────────────────────────────────
//
// A bulk assign is not "the single assign, fifteen times". Two things only exist here:
//
//  1. **The preview has to be per client.** "Le pisa una fase vigente a alguien" is
//     useless; the coach needs to know to WHOM and with what trim, before confirming.
//     Aggregating the notices into one sentence would hide exactly the client whose
//     current phase is about to be cut in half.
//  2. **A client can be un-assignable.** A pre-created `mirror:` row owns no documents
//     and a uid that is not on the caller's roster must never be written to. Those are
//     surfaced as blocked ROWS in the preview rather than thrown, because a bulk that
//     refuses to start over one bad uid is a bulk the coach cannot use.

import type { NutritionOverlapNotice } from "./nutrition-plan-form";
import type { NutritionBulkAssignInput } from "./nutrition-plan-form";
import type { NutritionTemplateRow } from "./nutrition-library-model";

/**
 * Why a client in the selection cannot receive the plan.
 *
 * `pendingProvisioning` is a real, common case, not an edge one: a coach pre-creates a
 * client by email and the `user_mirror` row has no uid to own a plan until that person
 * signs in for the first time.
 */
export type NutritionBulkBlockedReason = "notOnRoster" | "pendingProvisioning";

export interface NutritionBulkPreviewRow {
  clientId: string;
  clientName: string;
  /** `null` ⇒ assignable. */
  blockedReason: NutritionBulkBlockedReason | null;
  /** What this assign would do to the phases this client already has. Empty ⇒ nothing. */
  notices: NutritionOverlapNotice[];
}

export interface NutritionBulkSummary {
  /** Clients that would actually receive the plan. */
  assignable: number;
  /** Clients in the selection that cannot receive it (and why is on the row). */
  blocked: number;
  /** Assignable clients whose existing phases are untouched by this window. */
  untouched: number;
  /** Assignable clients with at least one phase affected. */
  affected: number;
  trimmed: number;
  superseded: number;
  deferred: number;
}

/**
 * The one-line arithmetic behind the confirm button.
 *
 * Counts CLIENTS for `affected` / `untouched` and PHASES for the three edit kinds — one
 * client can have two phases touched by the same window (a current one trimmed and a
 * queued one superseded), so the two are genuinely different numbers and collapsing them
 * would make the sentence lie in the exact case a coach most needs it to be right.
 */
export function summarizeNutritionBulkPreview(
  rows: NutritionBulkPreviewRow[],
): NutritionBulkSummary {
  const summary: NutritionBulkSummary = {
    assignable: 0,
    blocked: 0,
    untouched: 0,
    affected: 0,
    trimmed: 0,
    superseded: 0,
    deferred: 0,
  };

  for (const row of rows) {
    if (row.blockedReason !== null) {
      summary.blocked += 1;
      continue;
    }
    summary.assignable += 1;
    if (row.notices.length === 0) {
      summary.untouched += 1;
    } else {
      summary.affected += 1;
    }
    for (const notice of row.notices) {
      if (notice.kind === "trim") summary.trimmed += 1;
      else if (notice.kind === "supersede") summary.superseded += 1;
      else summary.deferred += 1;
    }
  }

  return summary;
}

/**
 * The uids a bulk assign should actually attempt, in the order the coach picked them.
 *
 * Blocked rows are dropped HERE rather than at the write, so the number the confirm
 * dialog shows and the number of documents written are the same number.
 */
export function assignableClientIds(rows: NutritionBulkPreviewRow[]): string[] {
  return rows.filter((row) => row.blockedReason === null).map((row) => row.clientId);
}

/**
 * Why a uid cannot be assigned, or `null` when it can.
 *
 * The roster membership check is NOT a courtesy: the Firestore rules join
 * `users/{clientId}.coachId == uid`, so a foreign uid would be rejected at the rule layer
 * mid-batch, after some clients already got their plan. Catching it in the preview keeps
 * the failure in front of the coach instead of half-way through the write.
 */
export function bulkBlockedReasonFor(
  clientId: string,
  roster: ReadonlyMap<string, { pendingProvisioning: boolean }>,
): NutritionBulkBlockedReason | null {
  // The `mirror:` prefix is checked FIRST and independently of the roster. A pre-created
  // client has no `/users` document at all, so it is never IN the roster map — asking the
  // map would report "notOnRoster", which reads as "this person is not your client" when
  // the truth is "they have not signed in yet". Two different things to tell a coach.
  if (clientId.startsWith("mirror:")) return "pendingProvisioning";
  const entry = roster.get(clientId);
  if (!entry) return "notOnRoster";
  if (entry.pendingProvisioning) return "pendingProvisioning";
  return null;
}

/**
 * A library template, as the body of a plan — what the bulk dialog submits.
 *
 * A COPY, not a link, exactly like the single assign: the plan keeps `templateId` for
 * provenance (that is what the library's "asignada N veces" pill counts), and every later
 * edit to the template leaves the assigned plans alone.
 *
 * The `mealId` SURVIVES into the plan. It is the key the daily log's `meals` map uses, so
 * dropping it here would silently re-key every client's log against fresh ids and orphan
 * whatever they had already marked.
 *
 * Both localized slots are filled, with the other language as the fallback, because the
 * schema requires both and "no translation" must not mean "blank in English" — the same
 * rule `englishOr` holds in the single-assign form.
 */
export function nutritionPlanBodyFromTemplate(
  template: NutritionTemplateRow,
  window: { startsOn: string; endsOn: string | null },
): Omit<NutritionBulkAssignInput, "clientIds"> {
  return {
    name: {
      es: template.name.es || template.name.en,
      en: template.name.en || template.name.es,
    },
    templateId: template.id,
    startsOn: window.startsOn,
    endsOn: window.endsOn,
    targets: {
      kcal: template.targets?.kcal ?? null,
      proteinG: template.targets?.proteinG ?? null,
      carbsG: template.targets?.carbsG ?? null,
      fatG: template.targets?.fatG ?? null,
    },
    meals: [...template.meals]
      .sort((a, b) => a.order - b.order)
      .map((meal) => ({
        mealId: meal.mealId,
        name: { es: meal.name.es || meal.name.en, en: meal.name.en || meal.name.es },
        moment: meal.moment,
        targets: {
          kcal: meal.targets?.kcal ?? null,
          proteinG: meal.targets?.proteinG ?? null,
          carbsG: meal.targets?.carbsG ?? null,
          fatG: meal.targets?.fatG ?? null,
        },
        options: (meal.options ?? []).map((option) => ({
          id: option.id,
          text: { es: option.text.es || option.text.en, en: option.text.en || option.text.es },
          targets: { kcal: option.targets?.kcal ?? null },
        })),
      })),
  };
}
