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

export const REPORT_TARGET_TYPES = ["profile", "routine", "comment", "message"] as const;
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
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Abiertos",
  actioned: "Con acción",
  dismissed: "Descartados",
};

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
