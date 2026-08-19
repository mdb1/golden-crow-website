import "server-only";

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

// coach-activity-log.ts
//
// Durable, append-style event log of significant coach actions, used by the
// "My Activity" feed. The feed previously reconstructed assignment activity by
// scanning the raw `workout_assignments` collection — but a single recurring
// assignment writes ONE doc per (client, date) (a weekly "Nicky Day 1" series
// = 54 docs sharing one seriesId + createdAt). With thousands of occurrence
// docs, a bounded per-source fetch could never reliably retrieve one
// representative per series, so whole assignments silently vanished from the
// feed.
//
// This log stores ONE event per assign ACTION (keyed by seriesId, or the
// assignment id for singles), so the feed reads a small, complete, ordered set.
// Writes are BEST-EFFORT: a logging failure must never break the underlying
// mutation, so `recordCoachActivityEvent` swallows its own errors.
//
// The collection is written and read ONLY by the Admin SDK (server side); the
// Firestore rules deny all client access.

export const COACH_ACTIVITY_COLLECTION = "coach_activity";

export type CoachActivityLogKind =
  | "workout_template"
  | "exercise"
  | "workout_assignment"
  // Emitted by the iOS-facing `editAssignmentRests` Cloud Function when a
  // client edits the rest times of an assigned workout (written from the
  // functions repo, not the backoffice). Listed here so the kind union stays
  // consistent across both writers.
  | "workout_rest_edited"
  | "habit_assignment"
  | "note"
  | "progress_photo_request"
  | "weight_request"
  // #682 — the coach linking a client to themselves (`provisionClient`). It is
  // the only coach action that had NO trail at all: the mirror branch writes to
  // `user_mirror`, which no audit trigger watches, and the existing-user branch
  // writes `/users/{uid}` whose audit row is attributed to the CLIENT (it is
  // their doc), so the feed never showed the coach doing anything.
  | "client_added"
  // #914 — the coach assigning, editing or closing a nutrition PHASE. Nutrition
  // is phase-shaped (startsOn / endsOn), so one assign can also trim or
  // supersede a sibling phase; each affected plan gets its own event, because
  // "My Activity" answers "what did I do to this client" and a silent trim is
  // exactly the thing a coach later swears they never did.
  | "nutrition_plan"
  // #918 — the coach's nutrition LIBRARY: a meal or a whole template created or duplicated.
  // Only creates and duplicates, deliberately: an EDIT does not reach anything already
  // assigned (a plan carries frozen copies), so logging edits here would suggest a client's
  // day changed when nothing of the sort happened.
  | "nutrition_library";

export interface CoachActivityEvent {
  /** Deterministic id so re-runs / per-occurrence triggers are idempotent. */
  eventId: string;
  trainerId: string;
  kind: CoachActivityLogKind;
  title: string;
  detail: string | null;
  clientId: string | null;
  pendingEmail: string | null;
  /** Action time. Omitted → server time (the action is happening now). */
  occurredAt?: Date | null;
  /** True when the event represents a deletion (e.g. a series was removed). */
  deleted?: boolean;
  /**
   * #927 — ties together the events ONE action produced across several clients, so the
   * feed can render them as a single row.
   *
   * Deliberately grouped at READ and not at write. A bulk nutrition assign touches N
   * DIFFERENT clients, and the alternative — one event with `clientId: null` — would
   * vanish the moment a coach filters "Mi Actividad" by a client, which is exactly the
   * question ("¿qué le hice a esta persona?") the feed exists to answer. Writing one
   * event per client keeps that filter honest; the collapse in
   * `coach-activity-grouping.ts` keeps the unfiltered feed from turning into 15 lines.
   */
  groupId?: string | null;
}

export function localizedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    if (typeof raw.es === "string" && raw.es.trim()) return raw.es;
    if (typeof raw.en === "string" && raw.en.trim()) return raw.en;
  }
  return "";
}

export function recurrenceLabel(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.kind === "daily") return "diaria";
  if (rec.kind === "weekly") return "semanal";
  if (rec.kind === "weekly_days") return "semanal";
  if (rec.kind === "monthly") return "mensual";
  if (rec.kind === "every_n_days") {
    const everyN = Number(rec.everyN ?? 0);
    return Number.isFinite(everyN) && everyN > 0 ? `cada ${everyN} días` : "cada N días";
  }
  return null;
}

/** Builds the title/detail for a single (non-recurring) assignment event. */
export function singleAssignmentEvent(args: {
  trainerId: string;
  assignmentId: string;
  templateName: unknown;
  clientId: string | null;
  pendingEmail: string | null;
  scheduledFor: string | null;
  occurredAt?: Date | null;
}): CoachActivityEvent {
  const name = localizedText(args.templateName);
  return {
    eventId: `asg:${args.assignmentId}`,
    trainerId: args.trainerId,
    kind: "workout_assignment",
    title: name ? `Workout asignado: ${name}` : "Workout asignado",
    detail: args.scheduledFor ? `Fecha: ${args.scheduledFor}` : null,
    clientId: args.clientId,
    pendingEmail: args.pendingEmail,
    occurredAt: args.occurredAt ?? null,
  };
}

/** Builds the title/detail for a recurring/series assignment event. */
export function seriesAssignmentEvent(args: {
  trainerId: string;
  seriesId: string;
  templateName: unknown;
  clientId: string | null;
  pendingEmail: string | null;
  recurrence: unknown;
  dates: string[];
  occurredAt?: Date | null;
}): CoachActivityEvent {
  const name = localizedText(args.templateName);
  const sorted = [...args.dates].sort((a, b) => a.localeCompare(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const label = recurrenceLabel(args.recurrence);
  const detailParts = [
    label ? `Recurrencia: ${label}` : null,
    `${sorted.length} fechas`,
    first && last && first !== last ? `${first} a ${last}` : first ? `desde ${first}` : null,
  ].filter((p): p is string => Boolean(p));
  return {
    eventId: `asg:${args.seriesId}`,
    trainerId: args.trainerId,
    kind: "workout_assignment",
    title: name ? `Workout asignado: ${name}` : "Workout asignado",
    detail: detailParts.join(" · ") || null,
    clientId: args.clientId,
    pendingEmail: args.pendingEmail,
    occurredAt: args.occurredAt ?? null,
  };
}

/** Workout template created (no client). eventId `tpl:${id}`. */
export function templateCreatedEvent(args: {
  trainerId: string;
  templateId: string;
  name: unknown;
  occurredAt?: Date | null;
}): CoachActivityEvent {
  const name = localizedText(args.name);
  return {
    eventId: `tpl:${args.templateId}`,
    trainerId: args.trainerId,
    kind: "workout_template",
    title: name ? `Workout creado: ${name}` : "Workout creado",
    detail: null,
    clientId: null,
    pendingEmail: null,
    occurredAt: args.occurredAt ?? null,
  };
}

/** Exercise created (no client). eventId `exr:${id}`. */
export function exerciseCreatedEvent(args: {
  trainerId: string;
  exerciseId: string;
  name: unknown;
  occurredAt?: Date | null;
}): CoachActivityEvent {
  const name = localizedText(args.name);
  return {
    eventId: `exr:${args.exerciseId}`,
    trainerId: args.trainerId,
    kind: "exercise",
    title: name ? `Ejercicio creado: ${name}` : "Ejercicio creado",
    detail: null,
    clientId: null,
    pendingEmail: null,
    occurredAt: args.occurredAt ?? null,
  };
}

/**
 * A nutrition LIBRARY entry created or duplicated (no client). #918.
 *
 * eventId `nutlib:${entity}:${id}` — deterministic, so a retried action rewrites the same
 * row instead of adding a second one.
 */
export function nutritionLibraryEvent(args: {
  trainerId: string;
  entity: "meal" | "template";
  entityId: string;
  name: unknown;
  change: "created" | "duplicated";
  occurredAt?: Date | null;
}): CoachActivityEvent {
  const name = localizedText(args.name);
  const noun = args.entity === "meal" ? "Comida" : "Plantilla de nutrición";
  const verb = args.change === "created" ? "creada" : "duplicada";
  return {
    eventId: `nutlib:${args.entity}:${args.entityId}`,
    trainerId: args.trainerId,
    kind: "nutrition_library",
    title: name ? `${noun} ${verb}: ${name}` : `${noun} ${verb}`,
    detail: null,
    clientId: null,
    pendingEmail: null,
    occurredAt: args.occurredAt ?? null,
  };
}

/** Habit assigned to a client. eventId `hab:${id}`. */
export function habitAssignedEvent(args: {
  trainerId: string;
  habitId: string;
  name: unknown;
  clientId: string | null;
  pendingEmail: string | null;
  occurredAt?: Date | null;
}): CoachActivityEvent {
  const name = localizedText(args.name);
  return {
    eventId: `hab:${args.habitId}`,
    trainerId: args.trainerId,
    kind: "habit_assignment",
    title: name ? `Hábito asignado: ${name}` : "Hábito asignado",
    detail: null,
    clientId: args.clientId,
    pendingEmail: args.pendingEmail,
    occurredAt: args.occurredAt ?? null,
  };
}

/**
 * Nutrition phase assigned / edited / closed. eventId `nut:${planId}` so a later edit of
 * the same phase MERGES onto its own row instead of stacking duplicates in the feed.
 *
 * `detail` carries the validity window because that is what distinguishes two phases of
 * the same plan for a coach scrolling the feed — "Definición" twice tells them nothing.
 */
export function nutritionPlanEvent(args: {
  trainerId: string;
  planId: string;
  name: unknown;
  clientId: string | null;
  startsOn: string;
  endsOn: string | null;
  /** "assigned" | "edited" | "trimmed" | "closed" — what happened to THIS plan. */
  change: "assigned" | "edited" | "trimmed" | "closed";
  occurredAt?: Date | null;
  /** #927 — set when this event is one client's share of a bulk assign. */
  groupId?: string | null;
}): CoachActivityEvent {
  const name = localizedText(args.name);
  const verb =
    args.change === "assigned"
      ? "Nutrición asignada"
      : args.change === "edited"
        ? "Nutrición editada"
        : args.change === "trimmed"
          ? "Fase de nutrición recortada"
          : "Fase de nutrición cerrada";
  const window = args.endsOn
    ? `${args.startsOn} → ${args.endsOn}`
    : `${args.startsOn} → sin fecha de fin`;
  return {
    eventId: `nut:${args.planId}`,
    trainerId: args.trainerId,
    kind: "nutrition_plan",
    title: name ? `${verb}: ${name}` : verb,
    detail: window,
    clientId: args.clientId,
    pendingEmail: null,
    occurredAt: args.occurredAt ?? null,
    groupId: args.groupId ?? null,
  };
}

/** Coach note added for a client. eventId `note:${docId}:${entryKey}`. */
export function noteAddedEvent(args: {
  trainerId: string;
  noteDocId: string;
  entryKey: string;
  body: string | null;
  clientId: string | null;
  occurredAt?: Date | null;
}): CoachActivityEvent {
  return {
    eventId: `note:${args.noteDocId}:${args.entryKey}`,
    trainerId: args.trainerId,
    kind: "note",
    title: "Nota agregada",
    detail: args.body ? args.body.slice(0, 120) : null,
    clientId: args.clientId,
    pendingEmail: null,
    occurredAt: args.occurredAt ?? null,
  };
}

/** Coach requested new progress photos from a client. eventId `req:photo:{uid}:{stamp}`. */
export function progressPhotoRequestedEvent(args: {
  trainerId: string;
  clientId: string;
  clientName: string;
  requestedAt: Date;
}): CoachActivityEvent {
  return {
    eventId: `req:photo:${args.clientId}:${args.requestedAt.toISOString()}`,
    trainerId: args.trainerId,
    kind: "progress_photo_request",
    title: `Pedir fotos de progreso: ${args.clientName}`,
    detail: "Válido durante 3 días",
    clientId: args.clientId,
    pendingEmail: null,
    occurredAt: args.requestedAt,
  };
}

/** Coach requested a body-weight check-in from a client. eventId `req:weight:{uid}:{stamp}`. */
export function weightRequestedEvent(args: {
  trainerId: string;
  clientId: string;
  clientName: string;
  requestedAt: Date;
}): CoachActivityEvent {
  return {
    eventId: `req:weight:${args.clientId}:${args.requestedAt.toISOString()}`,
    trainerId: args.trainerId,
    kind: "weight_request",
    title: `Pedir peso: ${args.clientName}`,
    detail: "Válido durante 3 días",
    clientId: args.clientId,
    pendingEmail: null,
    occurredAt: args.requestedAt,
  };
}

/**
 * Coach linked a client to their roster. eventId `client:{coachUid}:{email}` —
 * keyed by the pair, so re-adding the same person after an unlink overwrites
 * the previous row instead of stacking duplicates.
 *
 * `mode` is which branch of `provisionClient` ran, and it is the whole point of
 * the detail line: "existente" means the person already had an account and is
 * now on the roster, "pre-creado" means only a `user_mirror` placeholder exists
 * and the link completes on their first sign-in.
 */
export function clientAddedEvent(args: {
  trainerId: string;
  email: string;
  displayName: string | null;
  /** Resolved uid on the existing-user branch; null for a mirror pre-create. */
  clientId: string | null;
  mode: "attached-existing-user" | "precreated-mirror";
  occurredAt?: Date | null;
}): CoachActivityEvent {
  const who = args.displayName?.trim() || args.email;
  return {
    eventId: `client:${args.trainerId}:${args.email}`,
    trainerId: args.trainerId,
    kind: "client_added",
    title: `Cliente agregado: ${who}`,
    detail:
      args.mode === "attached-existing-user"
        ? `${args.email} · cuenta existente`
        : `${args.email} · pre-creado (se vincula al primer ingreso)`,
    clientId: args.clientId,
    pendingEmail: args.clientId ? null : args.email,
    occurredAt: args.occurredAt ?? null,
  };
}

/**
 * Writes (or merges) one event. BEST-EFFORT — never throws: logging must not
 * break the mutation that triggered it.
 */
export async function recordCoachActivityEvent(
  db: Firestore,
  event: CoachActivityEvent,
): Promise<void> {
  try {
    await db
      .collection(COACH_ACTIVITY_COLLECTION)
      .doc(event.eventId)
      .set(
        {
          trainerId: event.trainerId,
          kind: event.kind,
          title: event.title,
          detail: event.detail,
          clientId: event.clientId,
          pendingEmail: event.pendingEmail,
          deleted: event.deleted ?? false,
          // Only written when there IS one: an unconditional `groupId: null` on every
          // event would rewrite the field on every merge of a pre-#927 row for nothing.
          ...(event.groupId ? { groupId: event.groupId } : {}),
          occurredAt: event.occurredAt
            ? Timestamp.fromDate(event.occurredAt)
            : FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err) {
    console.warn(`[coach-activity-log] failed to record ${event.eventId}`, err);
  }
}

/** Marks an existing assignment-series/single event as deleted (best-effort). */
export async function markCoachActivityDeleted(
  db: Firestore,
  eventId: string,
): Promise<void> {
  try {
    await db
      .collection(COACH_ACTIVITY_COLLECTION)
      .doc(eventId)
      .set(
        { deleted: true, deletedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
  } catch (err) {
    console.warn(`[coach-activity-log] failed to mark deleted ${eventId}`, err);
  }
}
