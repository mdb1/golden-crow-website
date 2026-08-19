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
//   • `habit_logs`       — #762. Same reason as the photos: ticking a habit
//                          writes to `habit_logs`, which no audit trigger
//                          watches, so the single most frequent CLIENT action in
//                          the app was invisible here ("faltan hábitos").
//   • `nutrition_logs`   — #949. Same shape as the habit ticks: marking a meal
//                          writes to `nutrition_logs`, which no audit trigger
//                          watches either, so "lo que van marcando los users"
//                          stopped at habits and left nutrition — the newest
//                          client-facing surface — invisible to monitoring.
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
  coachActivityKeysFor,
  describeNutritionMarks,
  findDuplicateCoachEventIds,
  mergeWorkoutWriteBacks,
  summarizeNutritionMarks,
  type AuditRecord,
  type ClassifiedEvent,
  type FeedAction,
  type FeedCategory,
  type FeedSignificance,
  type FeedSubjectRef,
  type FeedTarget,
  type NutritionMarkSummary,
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
  | "progress_photos"
  | "habit_logs"
  | "nutrition_logs";

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
  /**
   * #762 — the quick-filter checkboxes ("todos marcados por defecto"). A row
   * survives when its category is in the set. `undefined` (or an empty array)
   * means NO category filter, which is what an untouched form sends: HTML
   * omits unchecked boxes, so "everything checked" and "nothing checked" arrive
   * identically and the only sane reading of both is "show everything".
   * Composes with the single-value `category` above, which the pre-#762 links
   * still use.
   */
  categories?: FeedCategory[];
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
/**
 * #762 — per-COLLECTION cap for the `audit_log` fan-out below.
 *
 * The trail is written by one trigger per monitored collection into a single
 * collection, and the write rates are nowhere near each other: a measurement of
 * the live project found 337 `workout_assignments` rows, 45 `users`, 15
 * `workout_logs` and **3** `habits` inside one 24-hour window (a recurring
 * series materializes one doc per occurrence, and the 90-day self-routine
 * horizon renews itself in bursts). A single `orderBy(occurredAt).limit(400)`
 * therefore spans about a day and is ~85% assignment writes, so anything
 * low-volume — habits above all — falls off the end and is simply absent from
 * the feed. That is the "faltan hábitos" report, and it also makes a category
 * filter useless: filtering a starved window still shows nothing.
 *
 * So each monitored collection additionally gets its own small window, merged
 * and deduped with the global one. Every one of these is fail-soft: the
 * `collection ASC, occurredAt DESC` composite index they need is declared in
 * `gc-fitness/firestore.indexes.json`, and until it is deployed these queries
 * just fail and the feed degrades to exactly the pre-#762 global window.
 */
const PER_COLLECTION_CAP = 120;
/**
 * The collections `onAuditableWrite` captures (functions/src/audit — its
 * `MONITORED_COLLECTIONS`). Only used to aim the per-collection queries above;
 * an entry that no longer exists costs one empty query, and a NEW monitored
 * collection missing from this list still arrives through the global window.
 */
const AUDITED_COLLECTIONS = [
  "habits",
  "exercises",
  "workout_logs",
  "users",
  "workout_assignments",
] as const;
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
  options: { limit?: number; equals?: { field: string; value: unknown } } = {},
): Promise<FirebaseFirestore.QuerySnapshot | null> {
  let q = db.collection(collection).orderBy(timeField, "desc") as FirebaseFirestore.Query;
  if (options.equals) q = q.where(options.equals.field, "==", options.equals.value);
  if (from) q = q.where(timeField, ">=", Timestamp.fromDate(from));
  if (to) q = q.where(timeField, "<=", Timestamp.fromDate(to));
  return q
    .limit(options.limit ?? PER_SOURCE_CAP)
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
  // One global window plus one per monitored collection, so a high-volume
  // writer cannot starve the rest out of the page (see PER_COLLECTION_CAP).
  const snaps = await Promise.all([
    rangedQuery(db, FirestoreCollections.auditLog, "occurredAt", from, to, "audit_log"),
    ...AUDITED_COLLECTIONS.map((name) =>
      rangedQuery(db, FirestoreCollections.auditLog, "occurredAt", from, to, `audit_log/${name}`, {
        limit: PER_COLLECTION_CAP,
        equals: { field: "collection", value: name },
      }),
    ),
  ]);

  // The windows overlap by construction — the same doc comes back from the
  // global query and from its collection's query. First one wins; they are the
  // same document.
  const seen = new Set<string>();
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const snap of snaps) {
    if (!snap) continue;
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      docs.push(doc);
    }
  }

  // Re-sort: the concatenation above is per-query-newest-first, not globally
  // so. `groupRecurringAuditEntries` collapses ADJACENT sibling writes and
  // `findRecurrenceEdits` pairs a delete with the create next to it, so both
  // read order as meaning — an unsorted list silently stops collapsing.
  return docs
    .map((doc) => {
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
    })
    .sort((a, b) => (b.occurredAtISO ?? "").localeCompare(a.occurredAtISO ?? ""));
}

/** Namespaces the coach eventId inside the feed's global id space. */
const COACH_EVENT_ID_PREFIX = "coach_activity:";

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
      id: `${COACH_EVENT_ID_PREFIX}${doc.id}`,
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

/**
 * #762 — a habit tick. `habit_logs` is one doc per (habit, civil day), written
 * by the client's app and re-written (`deleted: true`) when they untick, so the
 * doc id is stable and the newest write wins.
 */
interface RawHabitCheckIn {
  id: string;
  habitId: string | null;
  clientId: string | null;
  civilDate: string | null;
  unticked: boolean;
  occurredAtISO: string | null;
}

async function fetchHabitCheckIns(
  db: Firestore,
  from: Date | null,
  to: Date | null,
): Promise<RawHabitCheckIn[]> {
  // Ordered/ranged on `createdAt`, NOT on `civilDate`: the feed is a timeline of
  // when things HAPPENED, and a back-dated tick ("marqué el hábito de ayer")
  // carries an older civil day than the moment it was written. `updatedAt` would
  // be the truer instant for an untick, but only `createdAt` is guaranteed on
  // every doc — the untick's own timestamp is surfaced in the row's meta instead.
  const snap = await rangedQuery(
    db,
    FirestoreCollections.habitLogs,
    "createdAt",
    from,
    to,
    "habit_logs",
  );
  if (!snap) return [];
  return snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: `habit_logs:${doc.id}`,
      habitId: typeof d.habitId === "string" ? d.habitId : null,
      clientId: typeof d.clientId === "string" ? d.clientId : null,
      civilDate: typeof d.civilDate === "string" ? d.civilDate : null,
      unticked: d.deleted === true || d.value === false,
      occurredAtISO: toIso(d.createdAt) ?? toIso(d.loggedAt),
    };
  });
}

/**
 * #949 — a client marking their meals. One doc per (client, civil day), rewritten
 * on every mark, so ONE row per day carrying the whole day's split.
 */
interface RawNutritionDay {
  id: string;
  clientId: string | null;
  civilDate: string | null;
  summary: NutritionMarkSummary;
  occurredAtISO: string | null;
}

async function fetchNutritionDays(
  db: Firestore,
  from: Date | null,
  to: Date | null,
): Promise<RawNutritionDay[]> {
  // Ranged on `updatedAt`, NOT `createdAt` — unlike every other source here.
  // The day's document is created by the FIRST mark and rewritten by each one
  // after it, so `createdAt` would place a day the client finished at 22:00 in
  // the feed at breakfast time, and a day they came back to tomorrow would never
  // reappear at all. `updatedAt` is guaranteed on every doc: the rule layer's
  // create branch requires it and the update branch's whitelist is exactly
  // `['meals','updatedAt']`.
  const snap = await rangedQuery(
    db,
    FirestoreCollections.nutritionLogs,
    "updatedAt",
    from,
    to,
    "nutrition_logs",
  );
  if (!snap) return [];
  return snap.docs.flatMap((doc) => {
    const d = doc.data() as Record<string, unknown>;
    const meals =
      d.meals && typeof d.meals === "object"
        ? (d.meals as Record<string, { status: string }>)
        : {};
    // A day document with no marks at all is not an event. It exists because
    // some other path created it, and "marcó 0 de 4" is a row that says nothing
    // happened.
    if (Object.keys(meals).length === 0) return [];
    const snapshot = d.targetsSnapshot as { meals?: Array<{ mealId?: unknown }> } | undefined;
    const snapshotMealIds = (snapshot?.meals ?? [])
      .map((meal) => (typeof meal?.mealId === "string" ? meal.mealId : null))
      .filter((id): id is string => id !== null);
    return [
      {
        id: `nutrition_logs:${doc.id}`,
        clientId: typeof d.clientId === "string" ? d.clientId : null,
        civilDate: typeof d.civilDate === "string" ? d.civilDate : null,
        summary: summarizeNutritionMarks(meals, snapshotMealIds),
        occurredAtISO: toIso(d.updatedAt) ?? toIso(d.createdAt),
      },
    ];
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
/**
 * #785 — recover a deleted assignment's name from the workout it produced.
 *
 * Returns null for any other collection, and for an assignment that never
 * produced a log (nothing was performed, so there is nothing left to read).
 */
async function nameFromWorkoutLogOfAssignment(
  db: Firestore,
  ref: FeedSubjectRef,
): Promise<string | null> {
  if (ref.collection !== "workout_assignments") return null;
  const snap = await db
    .collection(FirestoreCollections.workoutLogs)
    .where("assignmentId", "==", ref.id)
    .limit(1)
    .get()
    .catch(() => null);
  const doc = snap?.docs[0];
  if (!doc) return null;
  const name = bilingualText(
    snapshotRecord(doc.data().templateSnapshot)?.name,
    "",
  );
  return name || null;
}

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
      if (!snap || !snap.exists) {
        // #785 — "se asignó un workout · ver detalle", with no name at all.
        //
        // The capture elides `templateSnapshot` (512-char cap), so an
        // assignment's name can ONLY come from hydration — and hydration reads
        // the live doc, which is gone for any assignment that was since deleted
        // (a cancelled ad-hoc workout cleans its own assignment up). The row
        // then names nothing, next to sibling rows that do, which reads as the
        // feed dropping information rather than the doc being gone.
        //
        // The workout it produced still knows: every `workout_logs` doc carries
        // both the `assignmentId` FK and its own frozen `templateSnapshot`. One
        // query, only on the path that already failed.
        const recovered = await nameFromWorkoutLogOfAssignment(db, ref);
        if (recovered) out.set(`${ref.collection}:${ref.id}`, recovered);
        return;
      }
      const d = snap.data() as Record<string, unknown>;
      // A log and an assignment both carry the workout's name inside their
      // `templateSnapshot`; a template / habit / exercise carries it top-level.
      // #713 — assignments were not in this list, so a routine edit (whose
      // changed-field snapshot has no `templateId` to point at a template) had
      // no way to be named at all.
      const raw =
        ref.collection === "workout_logs" || ref.collection === "workout_assignments"
          ? (snapshotRecord(d.templateSnapshot)?.name ?? d.name)
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
  // Nutrition is scheduled work assigned to a client, same family as a workout
  // assignment — it belongs in the schedule bucket, not in a bucket of its own.
  nutrition_plan: "schedule",
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
    case "nutrition_plan":
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
  nutrition_plan: {
    active: "Asignó nutrición",
    deleted: "Eliminó una fase de nutrición",
  },
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
  const [auditRaw, coachRaw, adminRaw, photoRaw, habitCheckInRaw, nutritionDayRaw] =
    await Promise.all([
      fetchAuditRecords(db, from, to),
      fetchCoachEvents(db, from, to),
      fetchAdminOperations(db, from, to),
      fetchPhotoUploads(db, from, to),
      fetchHabitCheckIns(db, from, to),
      fetchNutritionDays(db, from, to),
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
  for (const h of habitCheckInRaw) {
    if (h.clientId) uids.add(h.clientId);
  }
  for (const n of nutritionDayRaw) {
    if (n.clientId) uids.add(n.clientId);
  }

  // Identities are needed HERE (hrefs + the actor/client filters). Entity names
  // are NOT: they are hydrated later, once filtering has cut the list down, so a
  // narrow filter costs a handful of point reads instead of a hundred.
  const users = await resolveUsers(db, uids);

  const events: ActivityFeedEvent[] = [];
  // #748 — the tokens each row can be recognised by across sources. Kept beside
  // the events rather than on them: the feed is serialised to the client, and
  // this is scaffolding for the merge, not something a row renders.
  const entityKeys = new Map<string, string[]>();
  const pendingClientEvents = new Set<string>();

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
    entityKeys.set(head.id, coachActivityKeysFor(head));
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
    // The doc id IS the eventId (`asg:<seriesId>`, `exr:<id>`, …) — that is the
    // whole bridge to the audit half. See `coachActivityKeysFor`.
    entityKeys.set(c.id, [c.id.slice(COACH_EVENT_ID_PREFIX.length)]);
    if (c.pendingEmail) pendingClientEvents.add(c.id);
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

  for (const h of habitCheckInRaw) {
    events.push({
      id: h.id,
      source: "habit_logs",
      category: "habit",
      significance: "key",
      action: h.unticked ? "update" : "create",
      occurredAtISO: h.occurredAtISO,
      title: h.unticked ? "Desmarcó un hábito" : "Marcó un hábito",
      subject: null,
      // The tick doc carries only the habit id, so the name is a point read —
      // the same bounded, post-filter hydration the elided `templateSnapshot`
      // rows use. A habit that was hard-deleted since simply renders unnamed.
      subjectRef: h.habitId ? { collection: "habits", id: h.habitId } : null,
      // Only when the tick is NOT for the day it was written: a back-dated
      // check-in is the interesting case, and on the normal one the civil date
      // just repeats the day header the row already sits under.
      meta:
        h.civilDate && h.civilDate !== (h.occurredAtISO ?? "").slice(0, 10)
          ? [`día ${h.civilDate}`]
          : [],
      actor: person(h.clientId, "client", users),
      client: null,
      href: h.clientId ? userHref(h.clientId, users) : null,
      // An untick is the client changing their mind, not data being removed —
      // keeping it out of the Eliminaciones tab, which is about bajas.
      isDeletion: false,
      kind: "habit_log",
      clientUid: h.clientId,
      correlation: null,
    });
  }

  for (const n of nutritionDayRaw) {
    events.push({
      id: n.id,
      source: "nutrition_logs",
      category: "nutrition",
      significance: "key",
      action: "update",
      occurredAtISO: n.occurredAtISO,
      title: n.summary.isComplete ? "Cerró el día de comidas" : "Marcó comidas del plan",
      // The plan's name would cost a point read per day-row and answers a
      // question nobody asks here — the operator is reading WHO marked and HOW
      // MUCH, and the client's nutrition screen is one tap away for the rest.
      subject: null,
      meta: describeNutritionMarks(n.summary, n.civilDate, n.occurredAtISO),
      actor: person(n.clientId, "client", users),
      client: null,
      // The client's admin page, exactly like a habit tick. There is no
      // admin-side nutrition route to deep-link into yet, and inventing one that
      // 404s would be worse than landing one level up.
      href: n.clientId ? userHref(n.clientId, users) : null,
      isDeletion: false,
      kind: "nutrition_log",
      clientUid: n.clientId,
      correlation: null,
    });
  }

  events.sort((a, b) => (b.occurredAtISO ?? "").localeCompare(a.occurredAtISO ?? ""));

  // #748 — the same coach action reaches the feed through two independent
  // recorders. Drop the coach-log half wherever the audit half already told it.
  const duplicates = findDuplicateCoachEventIds(
    events.map((e) => ({
      id: e.id,
      source: e.source,
      occurredAtISO: e.occurredAtISO,
      clientUid: e.clientUid,
      entityKeys: entityKeys.get(e.id) ?? [],
      hasPendingClient: pendingClientEvents.has(e.id),
    })),
  );

  return mergeWorkoutWriteBacks(events.filter((e) => !duplicates.has(e.id)));
}

function applyFilters(
  events: ActivityFeedEvent[],
  filters: ActivityFeedFilters,
): ActivityFeedEvent[] {
  const source = filters.source && filters.source !== "all" ? filters.source : null;
  const category = filters.category && filters.category !== "all" ? filters.category : null;
  // Empty / absent = no filter (see ActivityFeedFilters.categories).
  const categories =
    filters.categories && filters.categories.length > 0 ? new Set(filters.categories) : null;
  const actorQuery = (filters.actorQuery ?? "").trim().toLowerCase();
  const clientQuery = (filters.clientQuery ?? "").trim().toLowerCase();

  return events.filter((e) => {
    if (!filters.includeLowSignal && e.significance === "low") return false;
    if (filters.deletionsOnly && !e.isDeletion) return false;
    if (source && e.source !== source) return false;
    if (category && e.category !== category) return false;
    if (categories && !categories.has(e.category)) return false;
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
