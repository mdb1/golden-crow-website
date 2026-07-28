"use server";

// audit-actions.ts
//
// Admin-only Monitoring & Observability readers (GitHub issue #312, PR1).
//
// Merges the two EXISTING app-level audit trails into one chronological,
// filterable timeline so an operator can see "what happened" across the whole
// gc-fitness surface and trace an incident back to the action that caused it:
//
//   - `coach_activity`   — one durable event per coach action (workout/exercise
//                          created, workout/habit assigned, note, photo/weight
//                          request). A removal flips `deleted: true` + stamps
//                          `deletedAt` on the SAME event doc.
//   - `admin_operations` — the immutable operator trail (cascade deletes,
//                          client deactivation, pending-client removal, client
//                          transfer) with `actorUid`, `mode`, `status`,
//                          `summary`, `errorMessage`.
//
//   - `audit_log`        — (PR2) the immutable DB-layer trail written by the
//                          `onAuditableWrite` Cloud Functions: one entry per
//                          create/update/delete on a monitored collection,
//                          capturing raw Firestore-console edits, maintenance-
//                          script writes, and direct iOS/Android client writes
//                          that the two app-level trails above are blind to.
//                          Its actor is "system" (background triggers have no
//                          auth context; a best-effort `actorUid` may still be
//                          stamped on the doc).
//
// No new indexes (single-field range + matching orderBy per source). audit_log
// can be high-volume (max-fidelity capture), so it is read newest-first under
// the same bounded per-source cap as the other two.
//
// Query strategy: a date range (when set) is applied IN-QUERY on the single time
// field (`occurredAt` / `createdAt`) — a single-field range + matching orderBy
// needs no composite index. Every other filter (source, action, actor, client)
// is applied IN MEMORY after the merge: this is an admin-scale, bounded read
// (capped per source) and matches the existing in-memory admin readers
// (`listRecentCoachActivity`, `searchUsersByEmailForAdmin`). Each source query
// is fail-soft — one collection erroring never blanks the whole dashboard.

import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import {
  dateRangeLabel,
  groupRecurringAuditEntries,
} from "@/lib/gc-fitness/audit-grouping";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { COACH_ACTIVITY_COLLECTION } from "@/lib/gc-fitness/coach-activity-log";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

export type AuditSource = "coach_activity" | "admin_operations" | "audit_log";

export type AuditAction =
  | "create"
  | "assign"
  | "update"
  | "delete"
  | "request"
  | "other";

export interface AuditEntry {
  /** Stable, source-prefixed id (also the React key). */
  id: string;
  source: AuditSource;
  occurredAtISO: string | null;
  actorUid: string | null;
  actorName: string | null;
  actorEmail: string | null;
  /**
   * Who-kind: coach_activity events are coach actions; admin_operations are
   * admin actions; audit_log is a DB-layer capture with no auth context, so its
   * actor is "system" (best-effort actorUid may still be resolved from the doc).
   */
  actorRole: "coach" | "admin" | "system";
  /** Raw event/operation kind (e.g. "exercise", "delete_coach_cascade"). */
  kind: string;
  action: AuditAction;
  title: string;
  detail: string | null;
  clientId: string | null;
  /** Resolved client email / pending email, for display. */
  clientLabel: string | null;
  /** True when the entry represents something being removed. */
  isDeletion: boolean;
  /** admin_operations only: "success" | "failed". */
  status: string | null;
  /** admin_operations only: "dry_run" | "execute". */
  mode: string | null;
  /**
   * audit_log only: when a single coach edit re-wrote a recurring workout
   * series, the DB-layer capture emits one entry per future occurrence. We
   * collapse those into ONE row; this is how many occurrences it represents
   * (>1). Absent/undefined for ordinary single-doc entries.
   */
  occurrenceCount?: number;
}

export interface AuditFilters {
  source?: "all" | AuditSource;
  action?: "all" | AuditAction;
  /** Case-insensitive "contains" match against actor uid / name / email. */
  actorQuery?: string | null;
  /** Case-insensitive "contains" match against client uid / label. */
  clientQuery?: string | null;
  /** Inclusive start date (YYYY-MM-DD, treated as 00:00:00 UTC). */
  fromISO?: string | null;
  /** Inclusive end date (YYYY-MM-DD, treated as 23:59:59.999 UTC). */
  toISO?: string | null;
  limit?: number;
}

// How many docs to pull per source BEFORE merge/slice. Generous so a busy day
// of one source can't crowd the other out of the page, but still bounded.
const PER_SOURCE_CAP = 400;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

/** YYYY-MM-DD → Date at UTC start-of-day, or null if blank/invalid. */
function startOfDayUtc(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD → Date at UTC end-of-day, or null if blank/invalid. */
function endOfDayUtc(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function coachActivityAction(kind: string, deleted: boolean): AuditAction {
  if (deleted) return "delete";
  switch (kind) {
    case "workout_template":
    case "exercise":
    case "note":
      return "create";
    case "workout_assignment":
    case "habit_assignment":
      return "assign";
    case "workout_rest_edited":
      return "update";
    case "progress_photo_request":
    case "weight_request":
      return "request";
    default:
      return "other";
  }
}

/** Reword a "created/assigned" title as a "deleted" title (mirrors the My Activity reader). */
function deletedTitle(title: string): string {
  return title
    .replace("Workout asignado:", "Workout eliminado:")
    .replace("Workout creado:", "Workout eliminado:")
    .replace("Ejercicio creado:", "Ejercicio eliminado:")
    .replace("Hábito asignado:", "Hábito eliminado:");
}

/**
 * Admin operations that CHANGE something rather than remove it. Everything else
 * logged to `admin_operations` deletes data, which is what drives the audit
 * dashboard's "deletion" styling + filter.
 */
const NON_DELETION_ADMIN_KINDS = new Set([
  "transfer_client",
  "unlink_client",
  "set_entitlement",
]);

function adminOperationTitle(kind: string, summaryAction: string | null): string {
  if (kind === "transfer_client") return "Transferred client";
  if (kind === "unlink_client") return "Unlinked client from coach";
  if (kind === "set_entitlement") return "Changed subscription tier";
  if (kind === "delete_coach_cascade") return "Deleted coach (cascade)";
  if (kind === "delete_client_cascade") {
    if (summaryAction === "deactivate_client") return "Deactivated client";
    if (summaryAction === "remove_pending_client") return "Removed pending client";
    return "Deleted client (cascade)";
  }
  return kind;
}

function adminOperationDetail(args: {
  mode: string | null;
  summary: Record<string, unknown> | null;
  errorMessage: string | null;
}): string | null {
  const parts: string[] = [];
  if (args.mode) parts.push(args.mode === "dry_run" ? "dry run" : "execute");

  const s = args.summary ?? {};
  const docs =
    typeof s.deletedDocsApprox === "number"
      ? s.deletedDocsApprox
      : typeof s.totalApprox === "number"
        ? s.totalApprox
        : null;
  if (typeof docs === "number") parts.push(`${docs} docs`);
  if (typeof s.fromCoachId === "string" && typeof s.toCoachId === "string") {
    parts.push(`${s.fromCoachId} → ${s.toCoachId}`);
  }
  if (typeof s.email === "string") parts.push(s.email);
  if (args.errorMessage) parts.push(`error: ${args.errorMessage}`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

async function fetchCoachActivityEntries(
  db: Firestore,
  from: Date | null,
  to: Date | null,
): Promise<
  Array<{
    id: string;
    actorUid: string | null;
    clientId: string | null;
    pendingEmail: string | null;
    kind: string;
    deleted: boolean;
    title: string;
    detail: string | null;
    occurredAtISO: string | null;
  }>
> {
  let q = db
    .collection(COACH_ACTIVITY_COLLECTION)
    .orderBy("occurredAt", "desc") as FirebaseFirestore.Query;
  if (from) q = q.where("occurredAt", ">=", Timestamp.fromDate(from));
  if (to) q = q.where("occurredAt", "<=", Timestamp.fromDate(to));
  const snap = await q
    .limit(PER_SOURCE_CAP)
    .get()
    .catch((err) => {
      console.warn("[gc-fitness/audit] coach_activity query failed", err);
      return null;
    });
  if (!snap) return [];

  return snap.docs.map((doc) => {
    const data = doc.data() as {
      trainerId?: string;
      clientId?: string;
      pendingEmail?: string;
      kind?: string;
      deleted?: boolean;
      title?: string;
      detail?: string | null;
      occurredAt?: unknown;
      deletedAt?: unknown;
    };
    const deleted = data.deleted === true;
    const rawTitle = typeof data.title === "string" ? data.title : "Actividad";
    // A deletion's true timing is `deletedAt`; fall back to the original
    // `occurredAt` for non-deletions (and old deletions missing `deletedAt`).
    const timeIso =
      (deleted ? toIso(data.deletedAt) : null) ?? toIso(data.occurredAt);
    return {
      id: `coach_activity:${doc.id}`,
      actorUid: typeof data.trainerId === "string" ? data.trainerId : null,
      clientId: typeof data.clientId === "string" ? data.clientId : null,
      pendingEmail:
        typeof data.pendingEmail === "string" && data.pendingEmail.length > 0
          ? data.pendingEmail
          : null,
      kind: typeof data.kind === "string" ? data.kind : "workout_assignment",
      deleted,
      title: deleted ? deletedTitle(rawTitle) : rawTitle,
      detail: typeof data.detail === "string" ? data.detail : null,
      occurredAtISO: timeIso,
    };
  });
}

async function fetchAdminOperationEntries(
  db: Firestore,
  from: Date | null,
  to: Date | null,
): Promise<
  Array<{
    id: string;
    actorUid: string | null;
    targetUid: string | null;
    kind: string;
    summaryAction: string | null;
    title: string;
    detail: string | null;
    status: string | null;
    mode: string | null;
    occurredAtISO: string | null;
  }>
> {
  let q = db
    .collection(FirestoreCollections.adminOperations)
    .orderBy("createdAt", "desc") as FirebaseFirestore.Query;
  if (from) q = q.where("createdAt", ">=", Timestamp.fromDate(from));
  if (to) q = q.where("createdAt", "<=", Timestamp.fromDate(to));
  const snap = await q
    .limit(PER_SOURCE_CAP)
    .get()
    .catch((err) => {
      console.warn("[gc-fitness/audit] admin_operations query failed", err);
      return null;
    });
  if (!snap) return [];

  return snap.docs.map((doc) => {
    const data = doc.data() as {
      actorUid?: string;
      targetUid?: string;
      kind?: string;
      mode?: string;
      status?: string;
      summary?: Record<string, unknown>;
      errorMessage?: string | null;
      createdAt?: unknown;
    };
    const kind = typeof data.kind === "string" ? data.kind : "";
    const summary =
      data.summary && typeof data.summary === "object" ? data.summary : null;
    const summaryAction =
      summary && typeof summary.action === "string" ? summary.action : null;
    const mode = typeof data.mode === "string" ? data.mode : null;
    return {
      id: `admin_operations:${doc.id}`,
      actorUid: typeof data.actorUid === "string" ? data.actorUid : null,
      targetUid: typeof data.targetUid === "string" ? data.targetUid : null,
      kind,
      summaryAction,
      title: adminOperationTitle(kind, summaryAction),
      detail: adminOperationDetail({
        mode,
        summary,
        errorMessage:
          typeof data.errorMessage === "string" && data.errorMessage.length > 0
            ? data.errorMessage
            : null,
      }),
      status: typeof data.status === "string" ? data.status : null,
      mode,
      occurredAtISO: toIso(data.createdAt),
    };
  });
}

const OP_PAST: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
};

/** "workout_assignments" → "workout assignment" (singular-ish, for titles). */
function humanCollection(collection: string): string {
  const spaced = collection.replace(/_/g, " ");
  return spaced.endsWith("s") ? spaced.slice(0, -1) : spaced;
}

async function fetchAuditLogEntries(
  db: Firestore,
  from: Date | null,
  to: Date | null,
): Promise<
  Array<{
    id: string;
    collection: string;
    docId: string;
    op: string;
    changedFields: string[];
    changedFieldCount: number;
    actorUid: string | null;
    trainerId: string | null;
    coachId: string | null;
    clientId: string | null;
    occurredAtISO: string | null;
  }>
> {
  let q = db
    .collection(FirestoreCollections.auditLog)
    .orderBy("occurredAt", "desc") as FirebaseFirestore.Query;
  if (from) q = q.where("occurredAt", ">=", Timestamp.fromDate(from));
  if (to) q = q.where("occurredAt", "<=", Timestamp.fromDate(to));
  const snap = await q
    .limit(PER_SOURCE_CAP)
    .get()
    .catch((err) => {
      console.warn("[gc-fitness/audit] audit_log query failed", err);
      return null;
    });
  if (!snap) return [];

  return snap.docs.map((doc) => {
    const data = doc.data() as {
      collection?: string;
      docId?: string;
      op?: string;
      changedFields?: unknown;
      changedFieldCount?: number;
      actorUid?: string | null;
      trainerId?: string | null;
      coachId?: string | null;
      clientId?: string | null;
      occurredAt?: unknown;
      eventTime?: unknown;
    };
    const changedFields = Array.isArray(data.changedFields)
      ? data.changedFields.filter((f): f is string => typeof f === "string")
      : [];
    return {
      id: `audit_log:${doc.id}`,
      collection: typeof data.collection === "string" ? data.collection : "?",
      docId: typeof data.docId === "string" ? data.docId : "?",
      op: typeof data.op === "string" ? data.op : "update",
      changedFields,
      changedFieldCount:
        typeof data.changedFieldCount === "number"
          ? data.changedFieldCount
          : changedFields.length,
      actorUid: typeof data.actorUid === "string" ? data.actorUid : null,
      trainerId: typeof data.trainerId === "string" ? data.trainerId : null,
      coachId: typeof data.coachId === "string" ? data.coachId : null,
      clientId: typeof data.clientId === "string" ? data.clientId : null,
      // `occurredAt` is the server write time; `eventTime` is the CloudEvent
      // time — prefer occurredAt, fall back to eventTime.
      occurredAtISO: toIso(data.occurredAt) ?? toIso(data.eventTime),
    };
  });
}

/**
 * Firestore rejects document ids matching `/^__.*__$/` ("reserved"); the shared
 * standard templates use the `__standard__` sentinel owner. `.doc("__standard__")`
 * throws, so reserved ids are dropped before any point read (mirrors the
 * data-hygiene scan's guard). See `firestore-reserved-id-standard-sentinel`.
 */
function isReservedId(value: string): boolean {
  return /^__.+__$/.test(value);
}

/**
 * Resolve uid → { name, email } from the users collection.
 *
 * Uses INDIVIDUAL point reads (`.doc(id).get()`), NOT `getAll`/batchGet. The
 * batchGet streaming RPC proved unreliable in the Vercel serverless runtime — it
 * rejected, the rejection was swallowed by the catch, and EVERY actor/client in
 * the dashboard fell back to a raw uid (no names/emails ever resolved). The
 * unary get path is the one the other admin readers (`listRecentCoachActivity`,
 * the hygiene scan) use successfully in the same runtime. Unique uids per page
 * are bounded (tens), so N parallel point reads are cheap. Each read is
 * fail-soft so one bad id never blanks the rest.
 */
async function resolveUsers(
  db: Firestore,
  uids: Set<string>,
): Promise<Map<string, { name: string; email: string }>> {
  const out = new Map<string, { name: string; email: string }>();
  const ids = Array.from(uids).filter((u) => u.length > 0 && !isReservedId(u));
  if (ids.length === 0) return out;

  const usersCol = db.collection(FirestoreCollections.users);
  const snaps = await Promise.all(
    ids.map((id) =>
      usersCol
        .doc(id)
        .get()
        .catch((err) => {
          console.warn(`[gc-fitness/audit] user resolve failed for ${id}`, err);
          return null;
        }),
    ),
  );
  for (const snap of snaps) {
    if (!snap || !snap.exists) continue;
    const data = snap.data() as { displayName?: string; email?: string };
    out.set(snap.id, {
      name: (data.displayName ?? data.email ?? snap.id) || snap.id,
      email: data.email ?? "",
    });
  }
  return out;
}

/**
 * Core: fetch both sources (date-bounded), resolve identities, and merge into a
 * single time-sorted `AuditEntry[]`. NOT sliced and NOT action/actor/client
 * filtered — the public functions below apply those + the limit. Admin-gated.
 */
async function collectAuditEntries(
  from: Date | null,
  to: Date | null,
): Promise<AuditEntry[]> {
  const db = gcFitnessFirestore();
  const [coachRaw, adminRaw, auditRaw] = await Promise.all([
    fetchCoachActivityEntries(db, from, to),
    fetchAdminOperationEntries(db, from, to),
    fetchAuditLogEntries(db, from, to),
  ]);

  const uids = new Set<string>();
  for (const r of coachRaw) {
    if (r.actorUid) uids.add(r.actorUid);
    if (r.clientId) uids.add(r.clientId);
  }
  for (const r of adminRaw) {
    if (r.actorUid) uids.add(r.actorUid);
    if (r.targetUid) uids.add(r.targetUid);
  }
  for (const r of auditRaw) {
    if (r.actorUid) uids.add(r.actorUid);
    // Background triggers carry no auth principal, so attribute the DB-layer
    // capture to the owning trainer/coach stamped on the doc — that's the
    // "whose data changed" answer (far more useful than a bare "system").
    if (r.trainerId) uids.add(r.trainerId);
    if (r.coachId) uids.add(r.coachId);
    if (r.clientId) uids.add(r.clientId);
  }
  const userById = await resolveUsers(db, uids);

  const entries: AuditEntry[] = [];

  for (const r of coachRaw) {
    const actor = r.actorUid ? userById.get(r.actorUid) : undefined;
    const clientUser = r.clientId ? userById.get(r.clientId) : undefined;
    entries.push({
      id: r.id,
      source: "coach_activity",
      occurredAtISO: r.occurredAtISO,
      actorUid: r.actorUid,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: "coach",
      kind: r.kind,
      action: coachActivityAction(r.kind, r.deleted),
      title: r.title,
      detail: r.detail,
      clientId: r.clientId,
      clientLabel: clientUser?.email || r.pendingEmail || null,
      isDeletion: r.deleted,
      status: null,
      mode: null,
    });
  }

  for (const r of adminRaw) {
    const actor = r.actorUid ? userById.get(r.actorUid) : undefined;
    const targetUser = r.targetUid ? userById.get(r.targetUid) : undefined;
    entries.push({
      id: r.id,
      source: "admin_operations",
      occurredAtISO: r.occurredAtISO,
      actorUid: r.actorUid,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: "admin",
      kind: r.kind,
      action: NON_DELETION_ADMIN_KINDS.has(r.kind) ? "update" : "delete",
      title: r.title,
      detail: r.detail,
      clientId: r.targetUid,
      clientLabel: targetUser?.email ?? null,
      // A transfer / unlink / tier change is not a deletion; everything else
      // logged here removes data.
      isDeletion: !NON_DELETION_ADMIN_KINDS.has(r.kind),
      status: r.status,
      mode: r.mode,
    });
  }

  // Collapse recurring-series writes into one row each (auditRaw is newest-first;
  // the grouping preserves that order and exposes the newest member as `head`).
  for (const g of groupRecurringAuditEntries(auditRaw)) {
    const head = g.head;
    // No auth context on the trigger → attribute to the doc's owner (trainer,
    // then coach), falling back to any explicitly-stamped actor field.
    const effectiveActorUid =
      head.actorUid ?? head.trainerId ?? head.coachId ?? null;
    const actor = effectiveActorUid ? userById.get(effectiveActorUid) : undefined;
    const clientUser = head.clientId ? userById.get(head.clientId) : undefined;
    const op = (["create", "update", "delete"].includes(head.op)
      ? head.op
      : "update") as AuditAction;
    const fieldList = head.changedFields.slice(0, 8).join(", ");
    const moreFields = head.changedFieldCount > 8 ? "…" : "";
    const baseTitle = `${OP_PAST[head.op] ?? head.op} ${humanCollection(head.collection)}`;

    let title = baseTitle;
    let detail: string;
    if (g.count > 1 && g.root) {
      const range = dateRangeLabel(g.dates);
      title = `${baseTitle} · recurring`;
      const bits = [g.root, `${g.count} occurrences`];
      if (range) bits.push(range);
      if (fieldList) bits.push(`${fieldList}${moreFields}`);
      detail = bits.join(" · ");
    } else {
      detail = fieldList ? `${head.docId} · ${fieldList}${moreFields}` : head.docId;
    }

    entries.push({
      id: head.id,
      source: "audit_log",
      occurredAtISO: head.occurredAtISO,
      actorUid: effectiveActorUid,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: "system",
      kind: head.collection,
      action: op,
      title,
      detail,
      clientId: head.clientId,
      clientLabel: clientUser?.email ?? null,
      isDeletion: head.op === "delete",
      status: null,
      mode: null,
      occurrenceCount: g.count > 1 ? g.count : undefined,
    });
  }

  entries.sort((a, b) =>
    (b.occurredAtISO ?? "").localeCompare(a.occurredAtISO ?? ""),
  );
  return entries;
}

function applyInMemoryFilters(
  entries: AuditEntry[],
  filters: AuditFilters,
): AuditEntry[] {
  const source = filters.source && filters.source !== "all" ? filters.source : null;
  const action = filters.action && filters.action !== "all" ? filters.action : null;
  const actorQuery = (filters.actorQuery ?? "").trim().toLowerCase();
  const clientQuery = (filters.clientQuery ?? "").trim().toLowerCase();

  return entries.filter((e) => {
    if (source && e.source !== source) return false;
    if (action && e.action !== action) return false;
    if (actorQuery) {
      const hay = `${e.actorUid ?? ""} ${e.actorName ?? ""} ${e.actorEmail ?? ""}`.toLowerCase();
      if (!hay.includes(actorQuery)) return false;
    }
    if (clientQuery) {
      const hay = `${e.clientId ?? ""} ${e.clientLabel ?? ""}`.toLowerCase();
      if (!hay.includes(clientQuery)) return false;
    }
    return true;
  });
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.trunc(limit), MAX_LIMIT));
}

/**
 * Unified, admin-gated observability timeline across `coach_activity` +
 * `admin_operations`, newest first. Date range is applied server-side; all
 * other filters in memory.
 */
export async function listAuditTimeline(
  filters: AuditFilters = {},
): Promise<AuditEntry[]> {
  await getCurrentAdmin();
  const from = startOfDayUtc(filters.fromISO);
  const to = endOfDayUtc(filters.toISO);
  const all = await collectAuditEntries(from, to);
  return applyInMemoryFilters(all, filters).slice(0, clampLimit(filters.limit));
}

/**
 * Deletion history: the same merged feed restricted to entries that REMOVED
 * something — coach_activity events flipped `deleted: true` plus admin cascade /
 * deactivation / pending-removal operations (transfers excluded). Answers
 * "who deleted what, and when". The `action` filter is ignored here (the view
 * is implicitly action=delete).
 */
export async function listDeletionHistory(
  filters: AuditFilters = {},
): Promise<AuditEntry[]> {
  await getCurrentAdmin();
  const from = startOfDayUtc(filters.fromISO);
  const to = endOfDayUtc(filters.toISO);
  const all = await collectAuditEntries(from, to);
  const deletions = all.filter((e) => e.isDeletion);
  return applyInMemoryFilters(deletions, { ...filters, action: "all" }).slice(
    0,
    clampLimit(filters.limit),
  );
}
