// coach-broadcast-model.ts — golden-crow-website #500, «Mandar mensaje» desde
// el roster (acciones en lote).
//
// Pure helpers shared by the `"use server"` action (coach-broadcast-actions.ts)
// and the roster UI. No Firebase, no Next imports — unit-tested directly.
//
// THE RULES LIVE IN ONE PLACE. Validation, ownership, the 200-recipient cap
// and the 10-per-24h quota are enforced by the gc-fitness callable
// `broadcastCoachMessage` (mdb1/gc-fitness#1617). The constants below mirror
// that contract for UX only (live counter, disabled Send); Vercel never
// decides who may receive a message.

import type { ClientRosterRow } from "./client-roster";

export const BROADCAST_COACH_MESSAGE_FUNCTION = "broadcastCoachMessage";
/** Max chars after trim — mirrors the callable's BROADCAST_TEXT_MAX. */
export const BROADCAST_TEXT_MAX = 1000;
/** Max distinct recipients per call — mirrors BROADCAST_MAX_RECIPIENTS. */
export const BROADCAST_MAX_RECIPIENTS = 200;
/** Broadcasts per coach per rolling 24 h — mirrors the callable's daily cap. */
export const BROADCAST_DAILY_CAP = 10;

export type BroadcastErrorKind =
  | "daily_cap"
  | "forbidden"
  | "text"
  | "recipients"
  | "generic";

export interface BroadcastSuccess {
  broadcastId: string;
  sent: number;
  /** uids that are no longer this coach's clients — never written. */
  skipped: string[];
  /** Broadcasts left in the rolling 24 h window. */
  remaining: number;
}

/** `https://us-central1-<project>.cloudfunctions.net/broadcastCoachMessage`. */
export function broadcastCallableUrl(
  projectId: string,
  region = "us-central1",
): string {
  return `https://${region}-${projectId}.cloudfunctions.net/${BROADCAST_COACH_MESSAGE_FUNCTION}`;
}

/**
 * Maps a callable error body (`{ error: { status, details } }`) to a kind the
 * UI has copy for. Unknown / network / 5xx → "generic".
 */
export function classifyBroadcastError(
  status: string | undefined,
  details: unknown,
): BroadcastErrorKind {
  const reason =
    details && typeof details === "object"
      ? (details as { reason?: unknown }).reason
      : undefined;
  if (reason === "daily_cap" || status === "RESOURCE_EXHAUSTED") {
    return "daily_cap";
  }
  if (status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED") {
    return "forbidden";
  }
  if (status === "INVALID_ARGUMENT") {
    if (reason === "text") return "text";
    if (reason === "recipients") return "recipients";
  }
  return "generic";
}

/** Defensive decode of the callable's `result`; null when malformed. */
export function decodeBroadcastResult(result: unknown): BroadcastSuccess | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (r.ok !== true) return null;
  if (typeof r.sent !== "number" || !Number.isFinite(r.sent)) return null;
  const skipped = Array.isArray(r.skipped)
    ? r.skipped.filter((s): s is string => typeof s === "string")
    : [];
  return {
    broadcastId: typeof r.broadcastId === "string" ? r.broadcastId : "",
    sent: r.sent,
    skipped,
    remaining:
      typeof r.remaining === "number" && Number.isFinite(r.remaining)
        ? r.remaining
        : 0,
  };
}

/**
 * Only ACTIVE clients with an account can be selected for a bulk action.
 * A pending invite (`mirror:<email>` id, no `/users/{uid}` yet) has no chat
 * thread to write into, and `/schedule/bulk` → `bulkAssignTemplate` rejects
 * mirror ids too (`assertOwnClients` reads `/users/{id}`).
 */
export function isBulkSelectable(
  row: Pick<ClientRosterRow, "uid" | "pendingProvisioning">,
): boolean {
  return (
    !row.pendingProvisioning &&
    row.uid.length > 0 &&
    !row.uid.startsWith("mirror:")
  );
}

export type BroadcastDraftProblem =
  | "empty"
  | "too_long"
  | "no_recipients"
  | "too_many";

/** Client-side mirror of the callable's input checks (UX only). */
export function broadcastDraftProblem(
  text: string,
  recipientCount: number,
): BroadcastDraftProblem | null {
  if (recipientCount < 1) return "no_recipients";
  if (recipientCount > BROADCAST_MAX_RECIPIENTS) return "too_many";
  const trimmed = text.trim();
  if (trimmed.length === 0) return "empty";
  if (trimmed.length > BROADCAST_TEXT_MAX) return "too_long";
  return null;
}

/**
 * Header checkbox state over the VISIBLE selectable ids: all of them picked →
 * true, some → "indeterminate", none (or nothing selectable) → false.
 */
export function selectAllState(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): boolean | "indeterminate" {
  if (visibleIds.length === 0) return false;
  const picked = visibleIds.filter((id) => selected.has(id)).length;
  if (picked === 0) return false;
  return picked === visibleIds.length ? true : "indeterminate";
}

/**
 * Header checkbox click: when every visible id is already selected, drop them
 * (keeping selections hidden by the current filter); otherwise add them all.
 */
export function toggleAllVisible(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const next = new Set(selected);
  if (selectAllState(selected, visibleIds) === true) {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  return next;
}

export const BULK_SCHEDULE_CLIENTS_PARAM = "clients";

/** `/gc-fitness/schedule/bulk?clients=uid1,uid2` — preselects in BulkAssignForm. */
export function bulkScheduleHref(clientIds: readonly string[]): string {
  const ids = clientIds.filter((id) => id && !id.startsWith("mirror:"));
  if (ids.length === 0) return "/gc-fitness/schedule/bulk";
  return `/gc-fitness/schedule/bulk?${BULK_SCHEDULE_CLIENTS_PARAM}=${encodeURIComponent(ids.join(","))}`;
}

/**
 * Parses the `?clients=` search param into a de-duplicated id list, keeping
 * only ids present in `knownIds` (the coach's own roster) — a hand-edited URL
 * cannot preselect someone else's client.
 */
export function parsePreselectedClients(
  raw: string | string[] | undefined,
  knownIds: Iterable<string>,
): string[] {
  if (raw === undefined) return [];
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const known = new Set(knownIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of joined.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id) || !known.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
