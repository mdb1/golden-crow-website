// ai-coach-report-triage.ts — #504: triage of Corvo reports (new / reviewed /
// resolved + an internal note). Pure.
//
// WHERE IT LIVES. Not on the report doc: `ai_coach/{uid}/reports/{messageId}` is
// READABLE BY ITS OWNER (the app shows «Reportado»), so an operator's note
// written there would be shown to — or at least downloadable by — the user who
// filed it. The triage is a server-only sibling collection, one doc per report:
//
//   ai_coach_report_triage/{uid}_{messageId} = {
//     uid, messageId, status: "reviewed" | "resolved", note,
//     reportCreatedAt, updatedAt, updatedBy
//   }
//
// No triage doc = "new" (every report filed before #504, and every one since
// until an operator touches it). Setting a report back to "new" keeps the doc
// (and its note) with status "new".

export const AI_COACH_REPORT_TRIAGE_COLLECTION = "ai_coach_report_triage";

export const REPORT_TRIAGE_STATES = ["new", "reviewed", "resolved"] as const;
export type ReportTriageState = (typeof REPORT_TRIAGE_STATES)[number];

export type ReportStateFilter = "all" | ReportTriageState;
export const REPORT_STATE_FILTERS: ReportStateFilter[] = ["all", ...REPORT_TRIAGE_STATES];

export const REPORT_TRIAGE_NOTE_MAX = 1000;

export interface ReportTriage {
  status: ReportTriageState;
  note: string;
  updatedAtISO: string | null;
  updatedBy: string | null;
}

export const NEW_REPORT_TRIAGE: ReportTriage = {
  status: "new",
  note: "",
  updatedAtISO: null,
  updatedBy: null,
};

export function isReportTriageState(raw: unknown): raw is ReportTriageState {
  return typeof raw === "string" && (REPORT_TRIAGE_STATES as readonly string[]).includes(raw);
}

export function parseReportStateFilter(raw: unknown): ReportStateFilter {
  return raw === "all" || isReportTriageState(raw) ? (raw as ReportStateFilter) : "new";
}

/** Doc id of a report's triage. Both parts are Firestore ids (no "/"). */
export function reportTriageDocId(uid: string, messageId: string): string {
  return `${uid}_${messageId}`;
}

function iso(raw: unknown): string | null {
  if (raw && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  if (raw instanceof Date) return raw.toISOString();
  return typeof raw === "string" && raw ? raw : null;
}

export function decodeReportTriage(data: Record<string, unknown> | null | undefined): ReportTriage {
  if (!data) return NEW_REPORT_TRIAGE;
  return {
    status: isReportTriageState(data.status) ? data.status : "new",
    note: typeof data.note === "string" ? data.note.slice(0, REPORT_TRIAGE_NOTE_MAX) : "",
    updatedAtISO: iso(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
  };
}

export interface ReportTriageInput {
  uid: string;
  messageId: string;
  status: ReportTriageState;
  note: string;
}

/** Validates the operator's form. Throws a short English message on bad input. */
export function normalizeReportTriageInput(raw: unknown): ReportTriageInput {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const uid = typeof r.uid === "string" ? r.uid.trim() : "";
  const messageId = typeof r.messageId === "string" ? r.messageId.trim() : "";
  if (!uid || !messageId || uid.includes("/") || messageId.includes("/")) {
    throw new Error("Invalid report.");
  }
  if (!isReportTriageState(r.status)) throw new Error("Invalid status.");
  const note = typeof r.note === "string" ? r.note.trim() : "";
  if (note.length > REPORT_TRIAGE_NOTE_MAX) throw new Error("Note too long.");
  return { uid, messageId, status: r.status, note };
}

export interface ReportStateCounts {
  all: number;
  new: number;
  reviewed: number;
  resolved: number;
}

/**
 * From three count() aggregations: every report, and the triage docs in each
 * non-new state. "new" is the rest, clamped — a triage doc can outlive its
 * report (the user deleted the conversation, which deletes the reports).
 */
export function reportStateCounts(total: number, reviewed: number, resolved: number): ReportStateCounts {
  return {
    all: total,
    new: Math.max(0, total - reviewed - resolved),
    reviewed,
    resolved,
  };
}
