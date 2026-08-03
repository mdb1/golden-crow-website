"use server";

// activity-feed-actions.ts
//
// The admin Monitoring & Observability READER (issue #671) — "un log de las
// cosas que van pasando en la app".
//
// It merges four trails into one newest-first feed of HUMAN events:
//
//   • `audit_log`        — DB-layer capture of every write to the monitored
//                          collections (workout_logs, workout_assignments,
//                          habits, exercises, users). This is where the mobile
//                          apps' own activity shows up: finished workouts,
//                          self-assigned routines, new habits, new accounts,
//                          subscription changes.
//   • `coach_activity`   — one app-level event per coach action.
//   • `admin_operations` — the operator trail (cascades, transfers, tiers).
//   • `progress_photos`  — read directly, because photo uploads are NOT one of
//                          the trigger-monitored collections and the ticket
//                          explicitly asks for "user cargó fotos".
//
// The readability work lives in the PURE `activity-feed-model.ts`
// (classification, Spanish copy, recurrence/frequency labels, the
// finish↔write-back merge). This file does the I/O around it:
//
//   1. bounded, date-ranged, fail-soft fetch per source,
//   2. collapse of recurring-series writes (`audit-grouping.ts`),
//   3. identity + entity hydration (names for the elided `templateSnapshot`),
//   4. href resolution — every event is tappable, and the admin drill-down
//      routes are coach-scoped, so we need each user's `coachId`/`role`.
//
// Reads stay point-reads (`.doc(id).get()`), never `getAll`/batchGet — the
// streaming RPC is unreliable on Vercel (see `firestore-getall-fails-on-vercel`).

import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import {
  classifyAuditRecord,
  mergeWorkoutWriteBacks,
  type AuditRecord,
  type ClassifiedEvent,
  type FeedAction,
  type FeedCategory,
  type FeedSignificance,
  type FeedSubjectRef,
  type FeedTarget,
} from "@/lib/gc-fitness/activity-feed-model";
import {
  findRecurrenceEdits,
  groupRecurringAuditEntries,
} from "@/lib/gc-fitness/audit-grouping";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { COACH_ACTIVITY_COLLECTION } from "@/lib/gc-fitness/coach-activity-log";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { bilingualText } from "@/lib/gc-fitness/coachless-user-model";

export type FeedSource =
  | "audit_log"
  | "coach_activity"
  | "admin_operations"
  | "progress_photos";

export interface FeedPerson {
  uid: string | null;
  name: string;
  email: string | null;
  /** How this person acted in the event. */
  role: "coach" | "client" | "admin" | "system";
  href: string | null;
}

export interface ActivityFeedEvent {
  id: string;
  source: FeedSource;
  category: FeedCategory;
  significance: FeedSignificance;
  action: FeedAction;
  occurredAtISO: string | null;
  /** Verb phrase — the actor is the implicit subject. */
  title: string;
  /** The entity the action was performed on ("Full Body A"). */
  subject: string | null;
  /**
   * Set while `subject` is still unresolved: the doc whose name has to be
   * point-read. `listActivityFeed` clears it once the name is filled in (or the
   * doc is gone), so a rendered event never carries one.
   */
  subjectRef?: FeedSubjectRef | null;
  meta: string[];
  /** Extra facts folded in from absorbed rows ("actualizó la rutina (3 …)"). */
  notes?: string[];
  actor: FeedPerson | null;
  client: FeedPerson | null;
  /** Primary tap target. */
  href: string | null;
  occurrenceCount?: number;
  isDeletion: boolean;
  /** Kept for filtering/debugging: the raw source kind (collection / op name). */
  kind: string;
  // Fields the pure merge step reads.
  clientUid: string | null;
  // Mirrored from the classifier rather than re-listed, so a new tag (e.g.
  // #697's `recurrence_edit`) cannot be added on one side only.
  correlation: ClassifiedEvent["correlation"];
}

export interface ActivityFeedFilters {
  source?: "all" | FeedSource;
  category?: "all" | FeedCategory;
  actorQuery?: string | null;
  clientQuery?: string | null;
  fromISO?: string | null;
  toISO?: string | null;
  /** Include mechanical writes (`updatedAt` touches, per-set log writes). */
  includeLowSignal?: boolean;
  /** Only entries that removed something. */
  deletionsOnly?: boolean;
  limit?: number;
}

const PER_SOURCE_CAP = 400;
const DEFAULT_LIMIT = 150;
const MAX_LIMIT = 400;
/**
 * Cap on entity point-reads per page load. Hydration runs AFTER filtering, so
 * in practice it is well under this; the cap only bounds a pathological page
 * (and logs when it truncates rather than silently dropping names).
 */
const MAX_HYDRATIONS = MAX_LIMIT;

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function startOfDayUtc(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDayUtc(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Firestore rejects `/^__.*__$/` ids ("__standard__" template owner). */
function isReservedId(value: string): boolean {
  return /^__.+__$/.test(value);
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source fetchers (each fail-soft — one dead collection never blanks the feed)
// ─────────────────────────────────────────────────────────────────────────────

async function rangedQuery(
  db: Firestore,
  collection: string,
  timeField: string,
  from: Date | null,
  to: Date | null,
  label: string,
): Promise<FirebaseFirestore.QuerySnapshot | null> {
  let q = db.collection(collection).orderBy(timeField, "desc") as FirebaseFirestore.Query;
  if (from) q = q.where(timeField, ">=", Timestamp.fromDate(from));
  if (to) q = q.where(timeField, "<=", Timestamp.fromDate(to));
  return q
    .limit(PER_SOURCE_CAP)
    .get()
    .catch((err) => {
      console.warn(`[gc-fitness/feed] ${label} query failed`, err);
      return null;
    });
}

async function fetchAuditRecords(
  db: Firestore,
  from: Date | null,
  to: Date | null,
): Promise<AuditRecord[]> {
  const snap = await rangedQuery(
    db,
    FirestoreCollections.auditLog,
    "occurredAt",
    from,
    to,
    "audit_log",
  );
  if (!snap) return [];
  return snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    const changedFields = Array.isArray(d.changedFields)
      ? (d.changedFields as unknown[]).filter((f): f is string => typeof f === "string")
      : [];
    return {
      id: `audit_log:${doc.id}`,
      collection: typeof d.collection === "string" ? d.collection : "?",
      docId: typeof d.docId === "string" ? d.docId : "?",
      op: typeof d.op === "string" ? d.op : "update",
      changedFields,
      changedFieldCount:
        typeof d.changedFieldCount === "number" ? d.changedFieldCount : changedFields.length,
      before: snapshotRecord(d.before),
      after: snapshotRecord(d.after),
      actorUid: typeof d.actorUid === "string" ? d.actorUid : null,
      trainerId: typeof d.trainerId === "string" ? d.trainerId : null,
      coachId: typeof d.coachId === "string" ? d.coachId : null,
      clientId: typeof d.clientId === "string" ? d.clientId : null,
      occurredAtISO: toIso(d.occurredAt) ?? toIso(d.eventTime),
    } satisfies AuditRecord;
  });
}

interface RawCoachEvent {
  id: string;
  trainerId: string | null;
  clientId: string | null;
  pendingEmail: string | null;
  kind: string;
  deleted: boolean;
  title: string;
  detail: string | null;
  occurredAtISO: string | null;
}

async function fetchCoachEvents(
  db: Firestore,
  from: Date | null,
  to: Date | null,
): Promise<RawCoachEvent[]> {
  const snap = await rangedQuery(
    db,
    COACH_ACTIVITY_COLLECTION,
    "occurredAt",
    from,
    to,
    "coach_activity",
  );
  if (!snap) return [];
  return snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    const deleted = d.deleted === true;
    return {
      id: `coach_activity:${doc.id}`,
      trainerId: typeof d.trainerId === "string" ? d.trainerId : null,
      clientId: typeof d.clientId === "string" ? d.clientId : null,
      pendingEmail: typeof d.pendingEmail === "string" ? d.pendingEmail : null,
      kind: typeof d.kind === "string" ? d.kind : "workout_assignment",
      deleted,
      title: typeof d.title === "string" ? d.title : "Actividad",
      detail: typeof d.detail === "string" ? d.detail : null,
      occurredAtISO: (deleted ? toIso(d.deletedAt) : null) ?? toIso(d.occurredAt),
    };
  });
}

interface RawAdminOperation {
  id: string;
  actorUid: string | null;
  targetUid: string | null;
  kind: string;
  summaryAction: string | null;
  status: string | null;
  mode: string | null;
  summary: Record<string, unknown> | null;
  errorMessage: string | null;
  occurredAtISO: string | null;
}

async function fetchAdminOperations(
  db: Firestore,
  from: Date | null,
  to: Date | null,
): Promise<RawAdminOperation[]> {
  const snap = await rangedQuery(
    db,
    FirestoreCollections.adminOperations,
    "createdAt",
    from,
    to,
    "admin_operations",
  );
  if (!snap) return [];
  return snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    const summary = snapshotRecord(d.summary);
    return {
      id: `admin_operations:${doc.id}`,
      actorUid: typeof d.actorUid === "string" ? d.actorUid : null,
      targetUid: typeof d.targetUid === "string" ? d.targetUid : null,
      kind: typeof d.kind === "string" ? d.kind : "",
      summaryAction:
        summary && typeof summary.action === "string" ? summary.action : null,
      status: typeof d.status === "string" ? d.status : null,
      mode: typeof d.mode === "string" ? d.mode : null,
      summary,
      errorMessage:
        typeof d.errorMessage === "string" && d.errorMessage.length > 0
          ? d.errorMessage
          : null,
      occurredAtISO: toIso(d.createdAt),
    };
  });
}

interface RawPhotoUpload {
  id: string;
  clientId: string | null;
  setId: string | null;
  angle: string | null;
  occurredAtISO: string | null;
}

async function fetchPhotoUploads(
  db: Firestore,
  from: Date | null,
  to: Date | null,
): Promise<RawPhotoUpload[]> {
  const snap = await rangedQuery(
    db,
    FirestoreCollections.progressPhotos,
    "createdAt",
    from,
    to,
    "progress_photos",
  );
  if (!snap) return [];
  return snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: `progress_photos:${doc.id}`,
      clientId: typeof d.clientId === "string" ? d.clientId : null,
      setId: typeof d.setId === "string" ? d.setId : null,
      angle: typeof d.angle === "string" ? d.angle : null,
      occurredAtISO: toIso(d.createdAt) ?? toIso(d.takenAt),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hydration
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedUser {
  name: string;
  email: string;
  role: string | null;
  coachId: string | null;
  deleted: boolean;
}

async function resolveUsers(
  db: Firestore,
  uids: Set<string>,
): Promise<Map<string, ResolvedUser>> {
  const out = new Map<string, ResolvedUser>();
  const ids = Array.from(uids).filter((u) => u.length > 0 && !isReservedId(u));
  if (ids.length === 0) return out;

  const usersCol = db.collection(FirestoreCollections.users);
  const snaps = await Promise.all(
    ids.map((id) =>
      usersCol
        .doc(id)
        .get()
        .catch((err) => {
          console.warn(`[gc-fitness/feed] user resolve failed for ${id}`, err);
          return null;
        }),
    ),
  );
  for (const snap of snaps) {
    if (!snap || !snap.exists) continue;
    const d = snap.data() as Record<string, unknown>;
    out.set(snap.id, {
      name:
        (typeof d.displayName === "string" && d.displayName) ||
        (typeof d.email === "string" && d.email) ||
        snap.id,
      email: typeof d.email === "string" ? d.email : "",
      role: typeof d.role === "string" ? d.role : null,
      coachId: typeof d.coachId === "string" && d.coachId.trim() ? d.coachId : null,
      deleted: d.deleted === true,
    });
  }
  return out;
}

/**
 * Resolve display names for the docs the capture cannot name on its own:
 * `templateSnapshot` is capped at 512 chars by the trigger (so an assignment or
 * a workout log never carries its workout name), and an UPDATE only snapshots
 * the changed fields (so a habit whose schedule moved carries no `name`).
 * Bounded, deduped, parallel point reads; each one fail-soft. A doc that no
 * longer exists simply resolves to nothing and the row renders without a name.
 */
async function resolveEntityNames(
  db: Firestore,
  refs: FeedSubjectRef[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const seen = new Set<string>();
  const unique = refs.filter((r) => {
    const key = `${r.collection}:${r.id}`;
    if (seen.has(key) || isReservedId(r.id) || !r.id || r.id === "?") return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return out;

  if (unique.length > MAX_HYDRATIONS) {
    console.warn(
      `[gc-fitness/feed] ${unique.length - MAX_HYDRATIONS} entity names left unresolved (cap ${MAX_HYDRATIONS})`,
    );
  }
  const capped = unique.slice(0, MAX_HYDRATIONS);
  await Promise.all(
    capped.map(async (ref) => {
      const snap = await db
        .collection(ref.collection)
        .doc(ref.id)
        .get()
        .catch(() => null);
      if (!snap || !snap.exists) return;
      const d = snap.data() as Record<string, unknown>;
      const raw =
        ref.collection === "workout_logs"
          ? snapshotRecord(d.templateSnapshot)?.name
          : d.name;
      const name = bilingualText(raw, "");
      if (name) out.set(`${ref.collection}:${ref.id}`, name);
    }),
  );
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Href resolution — every event must be tappable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The admin drill-down for a user. Coach-less clients have their own god-mode
 * profile; coached clients live under their coach; trainers get the coach page.
 * A coach-less user is their own trainer-of-record, so `coachUid = uid` is the
 * documented fallback (see `adminCanViewClientUnderCoach`).
 */
function userHref(uid: string, users: Map<string, ResolvedUser>): string | null {
  const user = users.get(uid);
  if (!user) return null;
  if (user.role === "trainer") return `/gc-fitness/admin/coaches/${uid}`;
  if (!user.coachId) return `/gc-fitness/admin/coach-less-users/${uid}`;
  return `/gc-fitness/admin/coaches/${user.coachId}/clients/${uid}`;
}

/** The coach uid the client's admin routes are nested under. */
function coachScopeFor(uid: string, users: Map<string, ResolvedUser>): string {
  return users.get(uid)?.coachId ?? uid;
}

function targetHref(
  target: FeedTarget | null,
  users: Map<string, ResolvedUser>,
): string | null {
  if (!target) return null;
  switch (target.kind) {
    case "workoutLog":
      return `/gc-fitness/admin/coaches/${coachScopeFor(target.clientId, users)}/clients/${target.clientId}/workouts/${target.logId}`;
    case "userPhotos":
      return `/gc-fitness/admin/coaches/${coachScopeFor(target.uid, users)}/clients/${target.uid}/photos`;
    case "exercise":
      return `/gc-fitness/exercises/${target.exerciseId}/view`;
    case "user":
      return userHref(target.uid, users);
  }
}

function person(
  uid: string | null,
  role: FeedPerson["role"],
  users: Map<string, ResolvedUser>,
  fallbackName?: string | null,
): FeedPerson | null {
  if (!uid) {
    return fallbackName ? { uid: null, name: fallbackName, email: null, role, href: null } : null;
  }
  const user = users.get(uid);
  return {
    uid,
    name: user?.name ?? fallbackName ?? uid,
    email: user?.email || null,
    role: user?.role === "trainer" ? "coach" : role,
    href: userHref(uid, users),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// coach_activity / admin_operations copy
// ─────────────────────────────────────────────────────────────────────────────

const COACH_KIND_CATEGORY: Record<string, FeedCategory> = {
  workout_template: "routine",
  exercise: "exercise",
  workout_assignment: "schedule",
  workout_rest_edited: "routine",
  habit_assignment: "habit",
  note: "coach",
  progress_photo_request: "coach",
  weight_request: "coach",
  client_added: "account",
};

function coachKindAction(kind: string, deleted: boolean): FeedAction {
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
    case "client_added":
      return "create";
    default:
      return "other";
  }
}

/**
 * Coach-action copy, as an ACTOR-FIRST verb phrase ("Coach One · asignó un
 * workout · Día 1"). The stored `coach_activity.title` is noun-first
 * ("Workout asignado: Día 1"), which reads wrong after an actor name, so the
 * verb comes from the kind and only the entity name is taken from the title.
 */
const COACH_KIND_TITLE: Record<string, { active: string; deleted: string }> = {
  workout_template: { active: "Creó un workout", deleted: "Eliminó un workout" },
  exercise: { active: "Creó un ejercicio", deleted: "Eliminó un ejercicio" },
  workout_assignment: { active: "Asignó un workout", deleted: "Eliminó un workout asignado" },
  workout_rest_edited: { active: "Editó los descansos", deleted: "Editó los descansos" },
  habit_assignment: { active: "Asignó un hábito", deleted: "Eliminó un hábito asignado" },
  note: { active: "Escribió una nota", deleted: "Eliminó una nota" },
  progress_photo_request: { active: "Pidió fotos de progreso", deleted: "Canceló el pedido de fotos" },
  weight_request: { active: "Pidió el peso", deleted: "Canceló el pedido de peso" },
  client_added: { active: "Agregó un cliente", deleted: "Quitó un cliente" },
};

/** Kinds whose stored title names the CLIENT, not an entity — the row already
 *  links the client, so repeating the name as a subject is noise. */
const COACH_KINDS_WITHOUT_SUBJECT = new Set([
  "progress_photo_request",
  "weight_request",
  "note",
  // "Cliente agregado: Manu" — the row already links the client (or their
  // pending email) as the target chip.
  "client_added",
]);

/** "Workout asignado: Full Body" → "Full Body". */
function coachTitleSubject(title: string): string | null {
  const idx = title.indexOf(":");
  if (idx <= 0 || idx === title.length - 1) return null;
  const subject = title.slice(idx + 1).trim();
  return subject.length > 0 ? subject : null;
}

function coachEventCopy(event: RawCoachEvent): { title: string; subject: string | null } {
  const copy = COACH_KIND_TITLE[event.kind];
  const title = copy
    ? event.deleted
      ? copy.deleted
      : copy.active
    : // Unknown kind (a newer writer): fall back to the stored sentence.
      event.title;
  return {
    title,
    subject: COACH_KINDS_WITHOUT_SUBJECT.has(event.kind)
      ? null
      : coachTitleSubject(event.title),
  };
}

const NON_DELETION_ADMIN_KINDS = new Set([
  "transfer_client",
  "unlink_client",
  "set_entitlement",
]);

function adminOperationTitle(kind: string, summaryAction: string | null): string {
  if (kind === "transfer_client") return "Transfirió un cliente";
  if (kind === "unlink_client") return "Desvinculó un cliente de su coach";
  if (kind === "set_entitlement") return "Cambió el plan de un usuario";
  if (kind === "delete_coach_cascade") return "Eliminó un coach (cascada)";
  if (kind === "delete_client_cascade") {
    if (summaryAction === "deactivate_client") return "Desactivó un cliente";
    if (summaryAction === "remove_pending_client") return "Eliminó un cliente pendiente";
    return "Eliminó un cliente (cascada)";
  }
  return kind;
}

function adminOperationMeta(op: RawAdminOperation): string[] {
  const parts: string[] = [];
  if (op.mode) parts.push(op.mode === "dry_run" ? "dry run" : "execute");
  const s = op.summary ?? {};
  const docs =
    typeof s.deletedDocsApprox === "number"
      ? s.deletedDocsApprox
      : typeof s.totalApprox === "number"
        ? s.totalApprox
        : null;
  if (typeof docs === "number") parts.push(`${docs} docs`);
  if (typeof s.tier === "string") parts.push(`tier: ${s.tier}`);
  if (typeof s.email === "string") parts.push(s.email);
  if (op.errorMessage) parts.push(`error: ${op.errorMessage}`);
  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembly
// ─────────────────────────────────────────────────────────────────────────────

/** Collapse photo docs uploaded together into one "subió N fotos" event. */
function groupPhotoUploads(raw: RawPhotoUpload[]): Array<RawPhotoUpload & { count: number }> {
  const byKey = new Map<string, RawPhotoUpload & { count: number }>();
  const order: string[] = [];
  for (const photo of raw) {
    const key = photo.setId
      ? `set:${photo.setId}`
      : `min:${photo.clientId ?? ""}:${(photo.occurredAtISO ?? "").slice(0, 16)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byKey.set(key, { ...photo, count: 1 });
      order.push(key);
    }
  }
  return order.map((k) => byKey.get(k)!);
}

async function collectFeed(
  from: Date | null,
  to: Date | null,
): Promise<ActivityFeedEvent[]> {
  const db = gcFitnessFirestore();
  const [auditRaw, coachRaw, adminRaw, photoRaw] = await Promise.all([
    fetchAuditRecords(db, from, to),
    fetchCoachEvents(db, from, to),
    fetchAdminOperations(db, from, to),
    fetchPhotoUploads(db, from, to),
  ]);

  // Collapse recurring-series writes (one coach edit → one doc per occurrence).
  const auditGroups = groupRecurringAuditEntries(auditRaw);

  // #697 — a recurrence change arrives as "delete the future occurrences" plus
  // "write the new ones". Pair the halves so the row says what was actually done
  // (and so the re-expansion stops being read as the automatic horizon renewal),
  // then drop the delete half: on its own it reads as "eliminó workouts
  // agendados", which is the opposite of what the user did.
  const recurrenceEdits = findRecurrenceEdits(auditGroups);
  const editByCreate = new Map(recurrenceEdits.map((l) => [l.createIndex, l.deleteIndex]));
  const absorbedDeletes = new Set(recurrenceEdits.map((l) => l.deleteIndex));

  const classified = auditGroups
    .map((group, index) => ({ group, index }))
    .filter(({ index }) => !absorbedDeletes.has(index))
    .map(({ group, index }) => {
      const deleteIndex = editByCreate.get(index);
      const previous =
        deleteIndex === undefined ? null : auditGroups[deleteIndex].head.before?.recurrence;
      return {
        group,
        event: classifyAuditRecord(group.head, {
          count: group.count,
          dates: group.dates,
          recurrenceEdit:
            deleteIndex === undefined ? null : { previousRecurrence: previous ?? null },
        }),
      };
    });

  // ── identities ──
  const uids = new Set<string>();
  for (const { group } of classified) {
    const h = group.head;
    for (const uid of [h.actorUid, h.trainerId, h.coachId, h.clientId]) {
      if (uid) uids.add(uid);
    }
    if (h.collection === "users") uids.add(h.docId);
  }
  for (const c of coachRaw) {
    if (c.trainerId) uids.add(c.trainerId);
    if (c.clientId) uids.add(c.clientId);
  }
  for (const a of adminRaw) {
    if (a.actorUid) uids.add(a.actorUid);
    if (a.targetUid) uids.add(a.targetUid);
  }
  for (const p of photoRaw) {
    if (p.clientId) uids.add(p.clientId);
  }

  // Identities are needed HERE (hrefs + the actor/client filters). Entity names
  // are NOT: they are hydrated later, once filtering has cut the list down, so a
  // narrow filter costs a handful of point reads instead of a hundred.
  const users = await resolveUsers(db, uids);

  const events: ActivityFeedEvent[] = [];

  for (const { group, event } of classified) {
    const head = group.head;
    // WHO did it comes from the classifier (see `ClassifiedEvent.actorUid`) —
    // NOT from whoever owns the doc. `trainerId` is stamped on every coach-owned
    // doc, so falling back to it made the feed say "Ana Oller terminó un
    // workout" about her client's session. An unattributable write renders with
    // no name at all.
    const actorUid = event.actorUid;
    const clientUid =
      head.clientId ?? (head.collection === "users" ? head.docId : null);
    events.push({
      id: head.id,
      source: "audit_log",
      category: event.category,
      significance: event.significance,
      action: event.action,
      occurredAtISO: head.occurredAtISO,
      title: event.title,
      subject: event.subject,
      subjectRef: event.subjectRef,
      meta: event.meta,
      actor: person(actorUid, actorUid === clientUid ? "client" : "coach", users),
      client:
        clientUid && clientUid !== actorUid ? person(clientUid, "client", users) : null,
      href: targetHref(event.target, users),
      occurrenceCount: group.count > 1 ? group.count : undefined,
      isDeletion: event.isDeletion,
      kind: `${head.collection}.${head.op}`,
      clientUid,
      correlation: event.correlation,
    });
  }

  for (const c of coachRaw) {
    const { title, subject } = coachEventCopy(c);
    events.push({
      id: c.id,
      source: "coach_activity",
      category: COACH_KIND_CATEGORY[c.kind] ?? "coach",
      significance: "key",
      action: coachKindAction(c.kind, c.deleted),
      occurredAtISO: c.occurredAtISO,
      title,
      subject,
      meta: c.detail ? [c.detail] : [],
      actor: person(c.trainerId, "coach", users),
      client: person(c.clientId, "client", users, c.pendingEmail),
      href: c.clientId ? userHref(c.clientId, users) : null,
      isDeletion: c.deleted,
      kind: c.kind,
      clientUid: c.clientId,
      correlation: null,
    });
  }

  for (const a of adminRaw) {
    const isDeletion = !NON_DELETION_ADMIN_KINDS.has(a.kind);
    events.push({
      id: a.id,
      source: "admin_operations",
      category: "admin",
      significance: "key",
      action: isDeletion ? "delete" : "update",
      occurredAtISO: a.occurredAtISO,
      title: adminOperationTitle(a.kind, a.summaryAction),
      subject: a.targetUid ? (users.get(a.targetUid)?.name ?? a.targetUid) : null,
      meta: [...adminOperationMeta(a), a.status ? `status: ${a.status}` : null].filter(
        (m): m is string => !!m,
      ),
      actor: person(a.actorUid, "admin", users),
      client: person(a.targetUid, "client", users),
      href: a.targetUid ? userHref(a.targetUid, users) : null,
      isDeletion,
      kind: a.kind,
      clientUid: a.targetUid,
      correlation: null,
    });
  }

  for (const p of groupPhotoUploads(photoRaw)) {
    events.push({
      id: p.id,
      source: "progress_photos",
      category: "photo",
      significance: "key",
      action: "create",
      occurredAtISO: p.occurredAtISO,
      title: p.count > 1 ? "Subió fotos de progreso" : "Subió una foto de progreso",
      subject: p.count > 1 ? `${p.count} fotos` : (p.angle ?? null),
      meta: [],
      actor: person(p.clientId, "client", users),
      client: null,
      href: p.clientId
        ? targetHref({ kind: "userPhotos", uid: p.clientId }, users)
        : null,
      occurrenceCount: p.count > 1 ? p.count : undefined,
      isDeletion: false,
      kind: "progress_photo",
      clientUid: p.clientId,
      correlation: null,
    });
  }

  events.sort((a, b) => (b.occurredAtISO ?? "").localeCompare(a.occurredAtISO ?? ""));
  return mergeWorkoutWriteBacks(events);
}

function applyFilters(
  events: ActivityFeedEvent[],
  filters: ActivityFeedFilters,
): ActivityFeedEvent[] {
  const source = filters.source && filters.source !== "all" ? filters.source : null;
  const category = filters.category && filters.category !== "all" ? filters.category : null;
  const actorQuery = (filters.actorQuery ?? "").trim().toLowerCase();
  const clientQuery = (filters.clientQuery ?? "").trim().toLowerCase();

  return events.filter((e) => {
    if (!filters.includeLowSignal && e.significance === "low") return false;
    if (filters.deletionsOnly && !e.isDeletion) return false;
    if (source && e.source !== source) return false;
    if (category && e.category !== category) return false;
    if (actorQuery) {
      const hay =
        `${e.actor?.uid ?? ""} ${e.actor?.name ?? ""} ${e.actor?.email ?? ""}`.toLowerCase();
      if (!hay.includes(actorQuery)) return false;
    }
    if (clientQuery) {
      // On a self-serve event the client IS the actor (there is no separate
      // client chip), so their name has to be searchable from here too.
      const selfNames =
        e.clientUid && e.clientUid === e.actor?.uid
          ? `${e.actor.name} ${e.actor.email ?? ""}`
          : "";
      const hay =
        `${e.clientUid ?? ""} ${e.client?.name ?? ""} ${e.client?.email ?? ""} ${selfNames}`.toLowerCase();
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
 * Admin-gated activity feed: what people are doing in the app, newest first.
 * The date range is applied server-side (single-field range + matching orderBy,
 * so no composite index); everything else filters the loaded window in memory.
 */
export async function listActivityFeed(
  filters: ActivityFeedFilters = {},
): Promise<ActivityFeedEvent[]> {
  await getCurrentAdmin();
  const from = startOfDayUtc(filters.fromISO);
  const to = endOfDayUtc(filters.toISO);
  const all = await collectFeed(from, to);
  const page = applyFilters(all, filters).slice(0, clampLimit(filters.limit));

  // Name the entities of the events that survived — a workout log's routine, a
  // habit whose only changed field was its schedule, an assignment's template.
  const names = await resolveEntityNames(
    gcFitnessFirestore(),
    page.map((e) => e.subjectRef).filter((r): r is FeedSubjectRef => !!r),
  );
  return page.map((event) => {
    if (!event.subjectRef) return event;
    const { subjectRef, ...rest } = event;
    return {
      ...rest,
      subject:
        event.subject ?? names.get(`${subjectRef.collection}:${subjectRef.id}`) ?? null,
    };
  });
}
