// nutrition-coach-reply.ts
// Pure helpers behind "el coach responde" (#926).
//
// NO `"use server"` — synchronous exports only, so Jest exercises them directly and the
// client components import them. A synchronous export in a server-action file passes the
// whole suite and dies in `next build`, which is what auto-deploys (#785).
//
// ── The hole this closes ────────────────────────────────────────────────────────────
//
// Everything nutrition shipped before this lets a coach SEE that something went wrong:
// the grid shows the dinner falling over on Fridays, the feed shows the note that
// explains it. And there it stopped. The coach reads "salí tarde del trabajo, terminé
// pidiendo delivery" and has nowhere to answer from. We built the seeing and not the
// answering — and the half that keeps clients is the second one.
//
// ── Why the answer goes through CHAT ────────────────────────────────────────────────
//
// The issue left it open: chat, or a coach note inside nutrition? Chat, decided, for one
// reason that outweighs the rest — the client already reads it. A note living inside the
// nutrition screen is a message sent to a surface the client visits when they are already
// doing well. Chat also reuses push, unread counts and history that all exist.
//
// ── Why it is a DRAFT and not a `replyTo` quote ─────────────────────────────────────
//
// The chat's real reply mechanic (`buildReplyQuote`) points at a MESSAGE id, and the
// Firestore rules validate that the quoted id is a message in that thread. A nutrition
// note is not a message and has no such id, so a `replyTo` would either be rejected or
// have to be faked. Instead the note is quoted as TEXT in a prefilled composer: the coach
// sees exactly what the client will see, can edit it before sending, and the client gets
// a message that carries its own context — which matters because their app has no link
// from a chat bubble back to a nutrition note either.

import { formatCivilDateLabel } from "./civil-date";
import type { NutritionAdherenceBreakdown } from "./nutrition-adherence";
import type { NutritionNoteEntry } from "./nutrition-compliance";
import type { LocalizedText } from "./nutrition-schema";

/**
 * Cap on the quoted fragment. Mirrors the chat's own `SNIPPET_MAX`, on purpose: a coach
 * pasting a 900-character note into the composer would push their own answer off the
 * screen on the client's phone.
 */
export const QUOTE_MAX = 200;

/** `«…»` with the note clipped, or null when there is nothing to quote. */
export function quoteNoteText(note: string | null): string | null {
  const trimmed = (note ?? "").trim();
  if (trimmed === "") return null;
  const clipped =
    trimmed.length > QUOTE_MAX ? `${trimmed.slice(0, QUOTE_MAX).trimEnd()}…` : trimmed;
  return `«${clipped}»`;
}

export interface NoteReplyDraftInput {
  mealName: string;
  civilDate: string;
  note: string | null;
  locale: string;
}

/**
 * The text the composer opens with when a coach hits "Responder" on a note.
 *
 * Deliberately ends with a blank line rather than a canned opener. A prefilled "¡Hola!
 * Vi que…" is the kind of thing a coach sends by accident and a client reads as a
 * template — the quote is context, the answer has to be theirs.
 *
 * The date is spelled out because the client is going to read this days later, in a
 * thread where nothing else says which day it is about.
 */
export function nutritionNoteReplyDraft(input: NoteReplyDraftInput): string {
  const day = formatCivilDateLabel(
    input.civilDate,
    { weekday: "short", month: "short", day: "numeric" },
    input.locale,
  );
  const quote = quoteNoteText(input.note);
  const header = `${input.mealName} · ${day}`;
  return quote ? `${header}\n${quote}\n\n` : `${header}\n\n`;
}

/**
 * Where "Responder" goes: the coach inbox, on this client's thread, with the draft
 * already typed.
 *
 * The draft rides in the URL rather than in storage because it must survive a full page
 * navigation into another route group and it is worth nothing after it is sent.
 */
export function nutritionNoteReplyHref(clientId: string, draft: string): string {
  const params = new URLSearchParams({ chatId: clientId, draft });
  return `/gc-fitness/chat?${params.toString()}`;
}

// ── The contextual suggestion ───────────────────────────────────────────────────────

/**
 * Below this share of its expected days, a meal is FAILING rather than merely imperfect.
 *
 * 0.6 and not 0.8: this card exists to point at the one meal that is structurally in the
 * wrong place, not to grade. A threshold that flags four meals out of five points at
 * nothing — the same reason `clientNeedsAttention` was cut back from a combined predicate
 * to a single signal after it flagged half the roster.
 */
export const FAILING_MEAL_RATIO = 0.6;

/**
 * A meal has to have been ASKED enough times before its ratio means anything. Two days
 * into a phase, one missed dinner is 50% and says nothing at all.
 */
export const FAILING_MEAL_MIN_EXPECTED = 4;

export interface FailingMeal {
  mealId: string;
  name: LocalizedText;
  /** Days the meal was marked done, out of the days it was expected. */
  done: number;
  expected: number;
  ratio: number;
}

export interface MealBreakdownInput {
  mealId: string;
  name: LocalizedText;
  breakdown: Pick<NutritionAdherenceBreakdown, "done" | "expected" | "ratio">;
}

/**
 * The meals worth a conversation, worst first.
 *
 * Reads the breakdown the grid already computed rather than recounting cells — the two
 * numbers must be the same number, and a second count is a second chance to disagree with
 * the client's own screen.
 */
export function failingMeals(rows: MealBreakdownInput[]): FailingMeal[] {
  return rows
    .filter(
      (row) =>
        row.breakdown.expected >= FAILING_MEAL_MIN_EXPECTED &&
        row.breakdown.ratio < FAILING_MEAL_RATIO,
    )
    .map((row) => ({
      mealId: row.mealId,
      name: row.name,
      done: row.breakdown.done,
      expected: row.breakdown.expected,
      ratio: row.breakdown.ratio,
    }))
    .sort((a, b) => a.ratio - b.ratio || a.mealId.localeCompare(b.mealId));
}

/**
 * The composer draft for a PATTERN rather than a single note: same shape, but it names
 * the meal and how often it fell over instead of quoting one day.
 */
export function failingMealReplyDraft(
  meal: { name: string; done: number; expected: number },
  labels: { pattern: string },
): string {
  return `${meal.name}\n${labels.pattern}\n\n`;
}

// ── The roster signal ───────────────────────────────────────────────────────────────

export type NutritionAttentionReason =
  /** A phase is in force and the client is under the bar on it. */
  | "low-adherence"
  /** The phase ran out and nobody loaded the next one — invisible on every other column. */
  | "no-active-plan";

/**
 * Below this 7-day adherence a client needs a conversation this week.
 *
 * Same 0.6 as a failing meal, and for the same reason: the number has to point at few
 * enough people that a coach actually opens them.
 */
export const NUTRITION_ATTENTION_RATIO = 0.6;

/**
 * Whether this client's NUTRITION needs the coach this week.
 *
 * Deliberately a SEPARATE predicate from `clientNeedsAttention` and not folded into it.
 * That one is the generic at-risk signal (three days of total silence) feeding the
 * dashboard tile, and it was already cut back once because a combined predicate flagged
 * half the roster. Widening it here would repeat that mistake, and it would also be
 * wrong: a client training happily with a lapsed nutrition phase is not "at risk", they
 * are a client whose coach owes them a plan.
 *
 * `neverHadPlan` is NOT a reason. Nothing has been asked of that person, so there is
 * nothing to chase — flagging it would put every client the coach has not started on the
 * same list as the ones who are failing.
 */
export function nutritionNeedsAttention(summary: {
  ratio7d: number | null;
  hasActivePlan: boolean;
  neverHadPlan: boolean;
}): { needsAttention: boolean; reasons: NutritionAttentionReason[] } {
  if (summary.neverHadPlan) return { needsAttention: false, reasons: [] };

  const reasons: NutritionAttentionReason[] = [];
  if (!summary.hasActivePlan) reasons.push("no-active-plan");
  else if (summary.ratio7d !== null && summary.ratio7d < NUTRITION_ATTENTION_RATIO) {
    reasons.push("low-adherence");
  }
  return { needsAttention: reasons.length > 0, reasons };
}
