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
// SCOPE (PR1): a read-only dashboard over what is ALREADY logged. It is blind to
// raw Firestore-console edits, maintenance-script writes, and direct iOS/Android
// client writes — capturing those needs the Cloud Functions `audit_log` layer,
// which is a deliberate FOLLOW-UP (PR2). No new collections, no new indexes.
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
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { COACH_ACTIVITY_COLLECTION } from "@/lib/gc-fitness/coach-activity-log";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

export type AuditSource = "coach_activity" | "admin_operations";

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
  /** Who-kind: coach_activity events are coach actions; admin_operations are admin actions. */
  actorRole: "coach" | "admin";
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

function adminOperationTitle(kind: string, summaryAction: string | null): string {
  if (kind === "transfer_client") return "Transferred client";
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

/** Batch-resolve uid → { name, email } from the users collection (chunked getAll). */
async function resolveUsers(
  db: Firestore,
  uids: Set<string>,
): Promise<Map<string, { name: string; email: string }>> {
  const out = new Map<string, { name: string; email: string }>();
  const ids = Array.from(uids).filter((u) => u.length > 0);
  if (ids.length === 0) return out;

  const usersCol = db.collection(FirestoreCollections.users);
  // getAll has no hard arg cap, but chunk defensively to keep request size sane.
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const refs = chunk.map((id) => usersCol.doc(id));
    const snaps = await db.getAll(...refs).catch((err) => {
      console.warn("[gc-fitness/audit] user resolve chunk failed", err);
      return [] as FirebaseFirestore.DocumentSnapshot[];
    });
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() as { displayName?: string; email?: string };
      out.set(snap.id, {
        name: (data.displayName ?? data.email ?? snap.id) || snap.id,
        email: data.email ?? "",
      });
    }
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
  const [coachRaw, adminRaw] = await Promise.all([
    fetchCoachActivityEntries(db, from, to),
    fetchAdminOperationEntries(db, from, to),
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
      action: r.kind === "transfer_client" ? "update" : "delete",
      title: r.title,
      detail: r.detail,
      clientId: r.targetUid,
      clientLabel: targetUser?.email ?? null,
      // A transfer is not a deletion; everything else logged here removes data.
      isDeletion: r.kind !== "transfer_client",
      status: r.status,
      mode: r.mode,
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
