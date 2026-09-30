// moderation-model.ts — the PURE half of the moderation queue (gc-fitness #1050, S10).
//
// No "use server" here on purpose: everything in this file is unit-testable
// without Firestore, and the actions file imports it. The split is the same
// one `audit-grouping.ts` uses, for the same reason — the grouping key is the
// part that silently goes wrong.
//
// ## Grouping is EXACT, not heuristic
//
// Three reports on the same profile are ONE row (SCREENS S16). The key is
// `{targetType}|{targetId}` straight off the report document — no minute
// buckets, no actor folding. `audit-grouping.ts` carries a written post-mortem
// (#697/#785/#927) of what a too-coarse key does: rows merge and only the
// head's data survives. Here every member is rendered, so nothing is lost even
// if two people report for different reasons.
//
// ## The SLA is a clock the operator can see
//
// App Store guideline 1.2 asks that reported content be acted on within 24
// hours. `slaState` turns a report's age into three states so the queue can
// paint the ones that are about to (or already did) miss it.

// `challenge` (gc-fitness #1189, SV2-9): `social_challenges/{id}`; its `name` is
// user-generated, so it is reportable. The owner is `creatorUid`; hiding sets
// `hidden: true` and the apps render the name as the generic «Desafío».
import { MUSCLE_LABELS } from "./workout-generator/muscle-presets";

export const REPORT_TARGET_TYPES = ["profile", "routine", "comment", "message", "challenge"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "sexual",
  "violence",
  "impersonation",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export type ModerationAction = "hide" | "suspend" | "dismiss";

/** 24 h, per App Store 1.2. */
export const MODERATION_SLA_HOURS = 24;
/** "Due soon" starts here — enough runway for a human to notice. */
export const MODERATION_SLA_WARNING_HOURS = 18;

export interface ModerationReport {
  id: string;
  reporterUid: string;
  targetType: ReportTargetType;
  targetId: string;
  targetOwnerUid: string;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  createdAtISO: string | null;
  resolvedAtISO: string | null;
  resolvedBy: string | null;
  resolution: string | null;
}

/** What the queue shows next to a group: the reported thing, in context. */
export interface ModerationTargetPreview {
  /** One line naming the thing: "@lucia · Lucía Pérez", "Push day", … */
  title: string;
  /** The content itself when there is some (bio, routine description, comment/message text). */
  body: string | null;
  /** Current moderation state of the target, read from its own document. */
  hidden: boolean;
  /** Whether the author/owner is suspended. */
  ownerSuspended: boolean;
  /** The target no longer exists (deleted, or never did). */
  missing: boolean;
}

export interface ModerationGroup {
  key: string;
  targetType: ReportTargetType;
  targetId: string;
  targetOwnerUid: string;
  /** Members, newest first (input order is preserved). */
  reports: ModerationReport[];
  /** The OLDEST open report drives the SLA — that is the one Apple counts from. */
  oldestOpenISO: string | null;
  reasons: ReportReason[];
  preview: ModerationTargetPreview | null;
}

export type SlaState = "fresh" | "due-soon" | "breached";

export function isReportTargetType(value: unknown): value is ReportTargetType {
  return typeof value === "string" && (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}
export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}
export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && (REPORT_STATUSES as readonly string[]).includes(value);
}

export function moderationGroupKey(targetType: string, targetId: string): string {
  return `${targetType}|${targetId}`;
}

/** Groups by exact target, preserving input order; the head is the newest report. */
export function groupReportsByTarget(reports: ModerationReport[]): ModerationGroup[] {
  const groups: ModerationGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const report of reports) {
    const key = moderationGroupKey(report.targetType, report.targetId);
    const index = indexByKey.get(key);
    if (index === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({
        key,
        targetType: report.targetType,
        targetId: report.targetId,
        targetOwnerUid: report.targetOwnerUid,
        reports: [report],
        oldestOpenISO: report.status === "open" ? report.createdAtISO : null,
        reasons: [report.reason],
        preview: null,
      });
      continue;
    }
    const group = groups[index];
    group.reports.push(report);
    if (!group.reasons.includes(report.reason)) group.reasons.push(report.reason);
    if (report.status === "open" && report.createdAtISO) {
      if (!group.oldestOpenISO || report.createdAtISO < group.oldestOpenISO) {
        group.oldestOpenISO = report.createdAtISO;
      }
    }
  }
  return groups;
}

export function reportAgeHours(createdAtISO: string | null, now: Date): number | null {
  if (!createdAtISO) return null;
  const created = new Date(createdAtISO).getTime();
  if (!Number.isFinite(created)) return null;
  return Math.max(0, (now.getTime() - created) / 3_600_000);
}

/**
 * Where a report stands against the 24 h SLA. An unknown age is "fresh": a
 * report whose timestamp has not resolved yet was just written.
 */
export function slaState(createdAtISO: string | null, now: Date): SlaState {
  const hours = reportAgeHours(createdAtISO, now);
  if (hours === null) return "fresh";
  if (hours >= MODERATION_SLA_HOURS) return "breached";
  if (hours >= MODERATION_SLA_WARNING_HOURS) return "due-soon";
  return "fresh";
}

/**
 * Which buttons a group offers. A profile has nothing to hide — its only
 * "hide" is suspending the account — so it gets suspend + dismiss.
 */
export function actionsFor(targetType: ReportTargetType): ModerationAction[] {
  return targetType === "profile" ? ["suspend", "dismiss"] : ["hide", "suspend", "dismiss"];
}

/** The `admin_operations.kind` an action writes — the operator trail. */
export function operationKindFor(action: ModerationAction | "unsuspend" | "unhide"): string {
  return `moderation_${action}`;
}

export const REASON_LABEL: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Acoso",
  sexual: "Contenido sexual",
  violence: "Violencia",
  impersonation: "Suplantación",
  other: "Otro",
};

export const TARGET_TYPE_LABEL: Record<ReportTargetType, string> = {
  profile: "Perfil",
  routine: "Rutina",
  comment: "Comentario",
  message: "Mensaje",
  challenge: "Desafío",
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Abiertos",
  actioned: "Con acción",
  dismissed: "Descartados",
};

// ─────────────────────────────────────────────────────────────────────────────
// Challenge goal line (#1189 SV2-9, extended by #1208 SV2-10)
// ─────────────────────────────────────────────────────────────────────────────

/** The seven metrics of SV2-10. SV2-9 docs only ever carry the first two. */
export const CHALLENGE_KINDS = [
  "workouts",
  "volume",
  "exerciseMaxWeight",
  "exerciseVolume",
  "exerciseReps",
  "muscleVolume",
  "muscleSets",
] as const;
export type ChallengeKind = (typeof CHALLENGE_KINDS)[number];

const SPANISH_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Up to two decimals, Spanish decimal comma, no thousands separator: 82,5 · 20000. */
function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/** A Firestore Timestamp, a Date, or epoch millis → Date; anything else → null. */
function asDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  return null;
}

/** Calendar day/month/year of `date` in `timeZone` (UTC when missing or invalid). */
function civilDay(date: Date, timeZone: string | null): { day: number; month: number; year: number } {
  const read = (tz: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return { day: get("day"), month: get("month"), year: get("year") };
  };
  if (timeZone) {
    try {
      return read(timeZone);
    } catch {
      // Unknown IANA id — fall through to UTC.
    }
  }
  return read("UTC");
}

/**
 * «del 1 oct al 28 oct». `endsAt` is EXCLUSIVE (`[startsAt, endsAt)`), so the
 * last day shown is the one just before it. Years appear only when they differ.
 */
function describeChallengeWindow(startsAt: Date, endsAt: Date, timeZone: string | null): string {
  const start = civilDay(startsAt, timeZone);
  const lastInstant = new Date(Math.max(startsAt.getTime(), endsAt.getTime() - 1));
  const end = civilDay(lastInstant, timeZone);
  const withYear = start.year !== end.year;
  const fmt = (d: { day: number; month: number; year: number }) =>
    `${d.day} ${SPANISH_MONTHS[d.month - 1] ?? "?"}${withYear ? ` ${d.year}` : ""}`;
  return `del ${fmt(start)} al ${fmt(end)}`;
}

function localizedEs(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const map = value as Record<string, unknown>;
    const es = typeof map.es === "string" ? map.es.trim() : "";
    const en = typeof map.en === "string" ? map.en.trim() : "";
    return es || en;
  }
  return "";
}

/**
 * One line describing a challenge's goal for the queue preview, e.g.
 * «12 entrenos en 30 días», «Press de banca: 100 kg en un set»,
 * «Pecho: 12 series por semana del 1 oct al 28 oct», «20000 kg en total».
 *
 * - An unknown `kind` is «Desafío» (the apps drop such a row; the operator
 *   still needs a line).
 * - A known kind without a numeric `target` is `null` — the preview then shows
 *   only the name and members.
 * - The period is `startsAt`/`endsAt` when both exist (SV2-10), else
 *   `durationDays` (SV2-9), else «en total» for a total-cadence goal.
 */
export function describeChallengeGoal(data: Record<string, unknown>): string | null {
  const kind = data.kind;
  if (typeof kind !== "string" || !(CHALLENGE_KINDS as readonly string[]).includes(kind)) return "Desafío";
  const target = typeof data.target === "number" && Number.isFinite(data.target) ? data.target : null;
  if (target === null) return null;
  const weekly = data.cadence === "weekly";
  const n = formatNumber(target);

  const exercise = localizedEs(data.exerciseName) || "Ejercicio";
  const muscleKey = typeof data.muscleGroup === "string" ? data.muscleGroup.trim() : "";
  const muscle = muscleKey ? MUSCLE_LABELS[muscleKey]?.es ?? muscleKey : "Grupo muscular";

  let goal: string;
  switch (kind as ChallengeKind) {
    case "workouts":
      goal = `${n} ${plural(target, "entreno", "entrenos")}`;
      break;
    case "volume":
      goal = `${n} kg`;
      break;
    case "exerciseMaxWeight":
      goal = `${exercise}: ${n} kg en un set`;
      break;
    case "exerciseVolume":
      goal = `${exercise}: ${n} kg`;
      break;
    case "exerciseReps":
      goal = `${exercise}: ${n} ${plural(target, "repetición", "repeticiones")}`;
      break;
    case "muscleVolume":
      goal = `${muscle}: ${n} kg`;
      break;
    case "muscleSets":
      goal = `${muscle}: ${n} ${plural(target, "serie", "series")}`;
      break;
  }
  if (weekly) goal += " por semana";

  const startsAt = asDate(data.startsAt);
  const endsAt = asDate(data.endsAt);
  const timeZone = typeof data.timezone === "string" && data.timezone ? data.timezone : null;
  const days =
    typeof data.durationDays === "number" && Number.isFinite(data.durationDays) ? data.durationDays : null;

  if (startsAt && endsAt) return `${goal} ${describeChallengeWindow(startsAt, endsAt, timeZone)}`;
  if (days !== null) {
    if (weekly) {
      const weeks = Math.max(1, Math.round(days / 7));
      return `${goal} · ${weeks} ${plural(weeks, "semana", "semanas")}`;
    }
    return `${goal} en ${days} ${plural(days, "día", "días")}`;
  }
  // No period at all: say it is cumulative, except where «en un set» already says what counts.
  if (!weekly && kind !== "exerciseMaxWeight") return `${goal} en total`;
  return goal;
}

/** `{threadId}/{messageId}` — how a message target is named by the app. */
export function parseMessageTargetId(targetId: string): { threadId: string; messageId: string } | null {
  const parts = targetId.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { threadId: parts[0], messageId: parts[1] };
}

/** Decodes one `social_reports` document; `null` for a shape the queue cannot show. */
export function decodeModerationReport(
  id: string,
  data: Record<string, unknown>,
  toIso: (value: unknown) => string | null,
): ModerationReport | null {
  if (!isReportTargetType(data.targetType)) return null;
  if (typeof data.targetId !== "string" || !data.targetId) return null;
  if (typeof data.reporterUid !== "string" || !data.reporterUid) return null;
  const reason = isReportReason(data.reason) ? data.reason : "other";
  const status = isReportStatus(data.status) ? data.status : "open";
  return {
    id,
    reporterUid: data.reporterUid,
    targetType: data.targetType,
    targetId: data.targetId,
    targetOwnerUid: typeof data.targetOwnerUid === "string" ? data.targetOwnerUid : "",
    reason,
    note: typeof data.note === "string" && data.note.trim() ? data.note.trim() : null,
    status,
    createdAtISO: toIso(data.createdAt),
    resolvedAtISO: toIso(data.resolvedAt),
    resolvedBy: typeof data.resolvedBy === "string" ? data.resolvedBy : null,
    resolution: typeof data.resolution === "string" ? data.resolution : null,
  };
}
