// coach-ai-summary-model.ts
//
// gc-fitness #1347 — «Resumen de la semana (IA)», the first slice of AI for
// coaches. Pure, I/O-free half (the Server Actions live in
// `coach-ai-summary-actions.ts`, which may only export async functions).
//
// Wire contract (written ONLY by the `coachWeeklySummary` callable in
// gc-fitness/functions/src/coachAI/weeklySummary.ts):
//   coach_ai_summaries/{coachId}                       { usage: { civilDate, count } }
//   coach_ai_summaries/{coachId}/clients/{clientId}/weeks/{isoWeek}
//     { headline, sections: [{ key, title, text }], flags: string[],
//       isoWeek, windowFrom, windowTo, locale, generatedAt, model, ... }
//
// The quota (20/day per coach civil date) and the cache key (ISO week of the
// CLIENT's civil date) are server-enforced; this module only mirrors them to
// render the card without a round-trip.

export const COACH_AI_SUMMARIES_COLLECTION = "coach_ai_summaries";
/** Twin of `COACH_AI_SUMMARY_DAILY_LIMIT` in functions/src/coachAI/weeklySummary.ts. */
export const COACH_AI_SUMMARY_DAILY_LIMIT = 20;
export const COACH_WEEKLY_SUMMARY_FUNCTION = "coachWeeklySummary";

export const SUMMARY_SECTION_KEYS = [
  "adherence",
  "volume",
  "prs",
  "habits",
  "nutrition",
  "bodyWeight",
] as const;
export type SummarySectionKey = (typeof SUMMARY_SECTION_KEYS)[number];

export interface CoachSummarySection {
  key: SummarySectionKey;
  title: string;
  text: string;
}

export interface CoachWeeklySummary {
  headline: string;
  sections: CoachSummarySection[];
  flags: string[];
  isoWeek: string;
  windowFrom: string;
  windowTo: string;
  generatedAtISO: string | null;
}

export interface CoachSummaryQuota {
  limit: number;
  used: number;
  remaining: number;
}

/** Why a generation failed, as the card needs it (never a raw server message). */
export type CoachSummaryErrorKind =
  | "quota"
  | "opted_out"
  | "forbidden"
  | "unavailable"
  | "generic";

/**
 * ISO-8601 week key of a civil date ("2026-10-13" → "2026-W42"). Twin of
 * `isoWeekKey` in functions/src/coachAI/weeklySummary.ts — the doc id of the
 * cached summary, so both sides MUST agree.
 */
export function isoWeekKey(civilDate: string): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const week =
    1 +
    Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** `usage` → today's count (another civil date ⇒ 0). Twin of the server. */
export function readSummaryUsage(raw: unknown, civilDate: string): number {
  if (!raw || typeof raw !== "object") return 0;
  const usage = raw as { civilDate?: unknown; count?: unknown };
  if (usage.civilDate !== civilDate) return 0;
  const n = usage.count;
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : 0;
}

export function quotaFromUsed(used: number): CoachSummaryQuota {
  const limit = COACH_AI_SUMMARY_DAILY_LIMIT;
  return { limit, used, remaining: Math.max(0, limit - used) };
}

function str(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

function toIso(raw: unknown): string | null {
  if (typeof raw === "string") return raw || null;
  if (raw && typeof (raw as { toDate?: unknown }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

/** Forgiving decode of a stored week doc (or the callable's `summary`). */
export function decodeCoachSummary(
  data: Record<string, unknown> | null | undefined,
): CoachWeeklySummary | null {
  if (!data) return null;
  const headline = str(data.headline).trim();
  const sections = (Array.isArray(data.sections) ? data.sections : [])
    .map((raw) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      const key = str(s.key) as SummarySectionKey;
      if (!(SUMMARY_SECTION_KEYS as readonly string[]).includes(key)) {
        return null;
      }
      const text = str(s.text).trim();
      if (!text) return null;
      return { key, title: str(s.title).trim(), text };
    })
    .filter((s): s is CoachSummarySection => s !== null);
  if (!headline || sections.length === 0) return null;
  return {
    headline,
    sections,
    flags: (Array.isArray(data.flags) ? data.flags : []).filter(
      (f): f is string => typeof f === "string" && f.trim().length > 0,
    ),
    isoWeek: str(data.isoWeek),
    windowFrom: str(data.windowFrom),
    windowTo: str(data.windowTo),
    generatedAtISO: toIso(data.generatedAtISO ?? data.generatedAt),
  };
}

/**
 * A callable's HTTP error body (`{ error: { status, message, details } }`)
 * → what the card shows. The server puts the machine reason in
 * `details.reason`; the HTTP status is the fallback.
 */
export function classifyCallableError(
  status: string | undefined,
  details: unknown,
): CoachSummaryErrorKind {
  const reason =
    details && typeof details === "object"
      ? (details as { reason?: unknown }).reason
      : undefined;
  if (reason === "quota" || status === "RESOURCE_EXHAUSTED") return "quota";
  if (reason === "opted_out") return "opted_out";
  if (status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED") {
    return "forbidden";
  }
  if (
    reason === "upstream" ||
    reason === "timeout" ||
    status === "UNAVAILABLE" ||
    status === "DEADLINE_EXCEEDED"
  ) {
    return "unavailable";
  }
  return "generic";
}

/** `https://us-central1-<project>.cloudfunctions.net/coachWeeklySummary`. */
export function callableUrl(projectId: string, region = "us-central1"): string {
  return `https://${region}-${projectId}.cloudfunctions.net/${COACH_WEEKLY_SUMMARY_FUNCTION}`;
}
