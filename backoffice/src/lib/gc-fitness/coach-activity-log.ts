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
  | "weight_request";

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
