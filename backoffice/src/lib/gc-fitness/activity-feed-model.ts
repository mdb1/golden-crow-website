// activity-feed-model.ts
//
// Pure (no Firestore, no "use server") translation layer that turns RAW audit
// records into HUMAN events for the admin Monitoring & Observability feed
// (issue #671).
//
// Why: the dashboard used to render the DB-layer capture verbatim — one row per
// Firestore write, titled "Updated workout assignment" with a detail of
// `asg-oi1SgX6…-20260821-self-DF2F1298-… · templateSnapshot, updatedAt`. That is
// unreadable: it names no person, no workout, no routine, and it repeats once
// per occurrence of a recurring series. This module answers the questions an
// operator actually asks — WHO did WHAT, to WHICH thing, and where do I click
// to see it:
//
//   "Terminó un workout · Full Body A · 62 min · 6.410 kg"
//   "Se asignó un workout · Push · todas las semanas (lun)"
//   "Creó un hábito · Cena saludable · diario"
//   "Cambió la suscripción · free → premium (revenuecat)"
//
// Design:
//   • classifyAuditRecord() is a PURE (record → semantics) function. It reads the
//     `before`/`after` field snapshots the capture trigger already stores, so most
//     events need NO extra Firestore read. When the name lives in an elided field
//     (`templateSnapshot` is capped at 512 chars by the trigger) it returns a
//     `subjectRef` and the server reader hydrates that one doc.
//   • Every event carries a `target` the reader turns into an admin-safe href —
//     "todo tiene que poder ser tappeable".
//   • `significance: "low"` marks mechanical writes (a `updatedAt`-only touch, a
//     per-set workout-log update, an entitlement refresh that changed no tier).
//     The feed hides those unless the operator asks for them.
//
// Spanish copy on purpose: the app-level `coach_activity` titles this feed
// merges with are already Spanish ("Workout asignado: …"), so one voice reads
// better than two.

import { dateRangeLabel } from "@/lib/gc-fitness/audit-grouping";
import { bilingualText } from "@/lib/gc-fitness/coachless-user-model";

export type FeedCategory =
  | "workout"
  | "schedule"
  | "routine"
  | "habit"
  | "exercise"
  | "photo"
  | "account"
  | "coach"
  | "admin"
  | "other";

/** "key" = worth reading in the default feed; "low" = mechanical write noise. */
export type FeedSignificance = "key" | "low";

export type FeedAction = "create" | "assign" | "update" | "move" | "delete" | "request" | "other";

/**
 * A tap target, resolved to an href by the server reader (which knows each
 * user's coachId — the admin drill-down routes are coach-scoped).
 */
export type FeedTarget =
  | { kind: "workoutLog"; logId: string; clientId: string }
  | { kind: "exercise"; exerciseId: string }
  | { kind: "user"; uid: string }
  | { kind: "userPhotos"; uid: string };

/**
 * A doc the reader must point-read because the capture does not carry its name:
 * either the field was elided (`templateSnapshot`) or the write simply did not
 * touch `name` (an update only snapshots the CHANGED fields).
 */
export interface FeedSubjectRef {
  collection: "workout_templates" | "workout_logs" | "habits" | "exercises";
  id: string;
}

/** Raw `audit_log` doc, as read by the server (before/after included). */
export interface AuditRecord {
  id: string;
  collection: string;
  docId: string;
  op: string;
  changedFields: string[];
  changedFieldCount: number;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorUid: string | null;
  trainerId: string | null;
  coachId: string | null;
  clientId: string | null;
  occurredAtISO: string | null;
}

export interface ClassifiedEvent {
  category: FeedCategory;
  significance: FeedSignificance;
  action: FeedAction;
  /** Verb phrase with the actor as implicit subject: "Terminó un workout". */
  title: string;
  /** The entity name, when the capture snapshot already carries it. */
  subject: string | null;
  /** Doc to hydrate when `subject` is null because the field was elided. */
  subjectRef: FeedSubjectRef | null;
  /** Short supporting facts, rendered as a "·"-joined line. */
  meta: string[];
  target: FeedTarget | null;
  /** True when the acting principal is the client themself (self-serve). */
  isSelfService: boolean;
  isDeletion: boolean;
  /** Tag used by `mergeWorkoutWriteBacks` to fold related rows together. */
  correlation: "workout_finished" | "prescription_writeback" | "assignment_completed" | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small value helpers
// ─────────────────────────────────────────────────────────────────────────────

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Numbers survive the capture as numbers via the Admin SDK, but a value that
 * round-tripped through the REST/JSON shape can arrive as a numeric string.
 */
function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** True when the capture elided this field's value ("[omitted: 2107 chars]"). */
export function isElided(value: unknown): boolean {
  return typeof value === "string" && /^\[omitted: \d+ chars\]$/.test(value);
}

/** Set-equality helper: every changed field is in `allowed`. */
export function changedOnly(fields: string[], allowed: string[]): boolean {
  const set = new Set(allowed);
  return fields.length > 0 && fields.every((f) => set.has(f));
}

const WEEKDAY_SUN_FIRST = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** ISO weekday (Mon=1 … Sun=7) short names, the habit convention. */
const WEEKDAY_ISO = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/**
 * Spanish label for a `workout_assignments.recurrence` map.
 *
 * Weekday convention here is JS `getDay()` (Sun=0 … Sat=6) — the one
 * `recurrence-expansion.ts` matches against. NOT the ISO convention habits use.
 */
export function recurrenceLabel(recurrence: unknown): string | null {
  if (!recurrence || typeof recurrence !== "object") return null;
  const r = recurrence as Record<string, unknown>;
  switch (str(r.kind)) {
    case "single":
      return null;
    case "daily":
      return "todos los días";
    case "weekly": {
      const day = num(r.weekday);
      return day === null
        ? "todas las semanas"
        : `todas las semanas (${WEEKDAY_SUN_FIRST[((day % 7) + 7) % 7]})`;
    }
    case "weekly_days": {
      const days = Array.isArray(r.weekdays)
        ? r.weekdays.map(num).filter((d): d is number => d !== null)
        : [];
      if (days.length === 0) return "todas las semanas";
      return `semanal (${days.map((d) => WEEKDAY_SUN_FIRST[((d % 7) + 7) % 7]).join(", ")})`;
    }
    case "every_n_days": {
      const n = num(r.everyN);
      return n === null ? "cada N días" : n === 1 ? "todos los días" : `cada ${n} días`;
    }
    case "monthly": {
      const d = num(r.dayOfMonth);
      return d === null ? "todos los meses" : `todos los meses (día ${d})`;
    }
    default:
      return null;
  }
}

/** Spanish frequency label for a habit doc (`scheduleType` + `scheduleCadence`). */
export function habitFrequencyLabel(habit: Record<string, unknown>): string {
  if (str(habit.scheduleType) === "one-time") {
    const on = str(habit.startsOn);
    return on ? `una vez (${on})` : "una vez";
  }
  const cadence = str(habit.scheduleCadence) ?? "daily";
  if (cadence === "weekly") {
    const days = Array.isArray(habit.scheduleWeekdays)
      ? (habit.scheduleWeekdays as unknown[]).map(num).filter((d): d is number => d !== null)
      : [];
    return days.length > 0
      ? `semanal (${days.map((d) => WEEKDAY_ISO[d] ?? String(d)).join(", ")})`
      : "semanal";
  }
  if (cadence === "monthly") {
    const days = Array.isArray(habit.scheduleMonthDays)
      ? (habit.scheduleMonthDays as unknown[]).map(num).filter((d): d is number => d !== null)
      : [];
    const single = num(habit.scheduleDayOfMonth);
    const all = days.length > 0 ? days : single !== null ? [single] : [];
    return all.length > 0 ? `mensual (día ${all.join(", ")})` : "mensual";
  }
  return "diario";
}

/** 3743 → "1 h 2 min"; 900 → "15 min". Null when unusable. */
export function durationLabel(seconds: unknown): string | null {
  const s = num(seconds);
  if (s === null || s <= 0) return null;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** 6410 → "6.410 kg" (es-AR thousands separator, no decimals). */
export function volumeLabel(kg: unknown): string | null {
  const v = num(kg);
  if (v === null || v <= 0) return null;
  return `${Math.round(v).toLocaleString("es-AR")} kg`;
}

/** "asg-…-20260821-self-DF2F…" → "2026-08-21" (occurrence date from the id). */
export function occurrenceDateFromId(docId: string): string | null {
  const m = /-(\d{8})-/.exec(docId);
  if (!m) return null;
  const d = m[1];
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

/** Fields whose change carries no operator-visible meaning on their own. */
const MECHANICAL_FIELDS = [
  "updatedAt",
  "createdAt",
  "lastModifiedAt",
  "version",
  "fcmTokens",
  "lastSeenAt",
  "lastActiveAt",
];

/** The write-back a client's finished workout performs on future occurrences. */
const PRESCRIPTION_FIELDS = ["templateSnapshot", "updatedAt", "prescriptionUpdatedAt"];

/** The assignment's own "done" stamp — the workout-log event already says it. */
const ASSIGNMENT_DONE_FIELDS = ["status", "completed_at", "completedAt", "updatedAt"];

function subjectOf(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const raw = data.name;
  if (raw === undefined || isElided(raw)) return null;
  const text = bilingualText(raw, "").trim();
  return text.length > 0 ? text : null;
}

/** Ref to hydrate the name from, or null when the snapshot already had it. */
function refFor(
  collection: FeedSubjectRef["collection"],
  docId: string,
  name: string | null,
): FeedSubjectRef | null {
  return name ? null : { collection, id: docId };
}

/**
 * Turn ONE raw capture record into a human event. `count` is how many sibling
 * writes collapsed into it (a recurring series edit re-writes every occurrence),
 * and `dates` are those occurrences' civil dates.
 */
export function classifyAuditRecord(
  record: AuditRecord,
  group: { count: number; dates: string[] } = { count: 1, dates: [] },
): ClassifiedEvent {
  const subject = record.op === "delete" ? record.before : record.after;
  const before = record.before ?? {};
  const after = record.after ?? {};
  const fields = record.changedFields;
  const selfService =
    !!record.clientId && !!record.trainerId && record.clientId === record.trainerId;
  // The row carries an "×N" badge, so the meta line only needs to say WHICH
  // occurrences a collapsed group covers — the date span, not the count again.
  const occurrences =
    group.count > 1
      ? [dateRangeLabel(group.dates) ?? `${group.count} ocurrencias`]
      : [];

  switch (record.collection) {
    // ── Workouts actually performed ──────────────────────────────────────
    case "workout_logs": {
      if (record.op === "create") {
        const done = str(after.status) === "completed" || !!after.completedAt;
        const meta = [
          durationLabel(after.duration_seconds ?? after.durationSeconds),
          volumeLabel(after.total_volume_kg ?? after.totalVolumeKg),
        ].filter((m): m is string => !!m);
        return {
          category: "workout",
          significance: "key",
          action: "create",
          title: done ? "Terminó un workout" : "Registró un workout",
          subject: null,
          subjectRef: { collection: "workout_logs", id: record.docId },
          meta,
          target: record.clientId
            ? { kind: "workoutLog", logId: record.docId, clientId: record.clientId }
            : null,
          isSelfService: selfService,
          isDeletion: false,
          correlation: done ? "workout_finished" : null,
        };
      }
      if (record.op === "delete") {
        return {
          category: "workout",
          significance: "key",
          action: "delete",
          title: "Eliminó un workout registrado",
          subject: null,
          subjectRef: null,
          meta: [],
          target: record.clientId ? { kind: "user", uid: record.clientId } : null,
          isSelfService: selfService,
          isDeletion: true,
          correlation: null,
        };
      }
      // Per-set / RPE / notes writes during and after a session: real, but the
      // "Terminó un workout" row above already tells the story.
      return {
        category: "workout",
        significance: "low",
        action: "update",
        title: "Actualizó un workout registrado",
        subject: null,
        subjectRef: { collection: "workout_logs", id: record.docId },
        meta: [fields.join(", ")],
        target: record.clientId
          ? { kind: "workoutLog", logId: record.docId, clientId: record.clientId }
          : null,
        isSelfService: selfService,
        isDeletion: false,
        correlation: null,
      };
    }

    // ── Scheduling ───────────────────────────────────────────────────────
    case "workout_assignments": {
      const templateId = str(after.templateId) ?? str(before.templateId);
      const ref: FeedSubjectRef | null = templateId
        ? { collection: "workout_templates", id: templateId }
        : null;
      const isSelf = after.selfAssigned === true || before.selfAssigned === true || selfService;

      if (record.op === "create") {
        const meta = [
          recurrenceLabel(after.recurrence),
          ...occurrences,
          str(after.scheduledFor) ? `desde ${str(after.scheduledFor)}` : null,
          str(after.scheduledTime),
        ].filter((m): m is string => !!m);
        return {
          category: "schedule",
          significance: "key",
          action: "assign",
          title: isSelf ? "Se asignó un workout" : "Asignó un workout",
          subject: null,
          subjectRef: ref,
          meta,
          target: record.clientId ? { kind: "user", uid: record.clientId } : null,
          isSelfService: isSelf,
          isDeletion: false,
          correlation: null,
        };
      }

      if (record.op === "delete") {
        return {
          category: "schedule",
          significance: "key",
          action: "delete",
          title: group.count > 1 ? "Eliminó workouts agendados" : "Eliminó un workout agendado",
          subject: null,
          subjectRef: ref,
          meta: [
            recurrenceLabel(before.recurrence),
            ...(group.count > 1 ? occurrences : [occurrenceDateFromId(record.docId)]),
          ].filter((m): m is string => !!m),
          target: record.clientId ? { kind: "user", uid: record.clientId } : null,
          isSelfService: isSelf,
          isDeletion: true,
          correlation: null,
        };
      }

      // Re-scheduled: the civil date moved.
      if (fields.includes("scheduledFor") && str(before.scheduledFor) !== str(after.scheduledFor)) {
        return {
          category: "schedule",
          significance: "key",
          action: "move",
          title: "Movió un workout de día",
          subject: null,
          subjectRef: ref,
          meta: [`${str(before.scheduledFor) ?? "—"} → ${str(after.scheduledFor) ?? "—"}`],
          target: record.clientId ? { kind: "user", uid: record.clientId } : null,
          isSelfService: isSelf,
          isDeletion: false,
          correlation: null,
        };
      }

      // The prescription write-back a finished workout performs on the future
      // occurrences of a self-created routine (#567). On its own this is the
      // useless `templateSnapshot, updatedAt` row from the ticket; named, and
      // folded into the finish it followed, it answers "¿actualizó el template?".
      if (changedOnly(fields, PRESCRIPTION_FIELDS) && fields.includes("templateSnapshot")) {
        return {
          category: "routine",
          significance: "key",
          action: "update",
          title: "Actualizó la rutina",
          subject: null,
          subjectRef: ref,
          meta: occurrences,
          target: record.clientId ? { kind: "user", uid: record.clientId } : null,
          isSelfService: isSelf,
          isDeletion: false,
          correlation: "prescription_writeback",
        };
      }

      // "Done" stamp that mirrors the workout log.
      if (changedOnly(fields, ASSIGNMENT_DONE_FIELDS) && str(after.status) === "completed") {
        return {
          category: "workout",
          significance: "low",
          action: "update",
          title: "Marcó el workout como completado",
          subject: null,
          subjectRef: ref,
          meta: [],
          target: record.clientId ? { kind: "user", uid: record.clientId } : null,
          isSelfService: isSelf,
          isDeletion: false,
          correlation: "assignment_completed",
        };
      }

      if (fields.includes("scheduledTime") || fields.includes("reminderEnabled")) {
        return {
          category: "schedule",
          significance: "key",
          action: "update",
          title: "Cambió el horario del workout",
          subject: null,
          subjectRef: ref,
          meta: [
            `${str(before.scheduledTime) ?? "sin hora"} → ${str(after.scheduledTime) ?? "sin hora"}`,
            ...occurrences,
          ],
          target: record.clientId ? { kind: "user", uid: record.clientId } : null,
          isSelfService: isSelf,
          isDeletion: false,
          correlation: null,
        };
      }

      return {
        category: "schedule",
        significance: "low",
        action: "update",
        title: "Actualizó un workout agendado",
        subject: null,
        subjectRef: ref,
        meta: [fields.join(", "), ...occurrences],
        target: record.clientId ? { kind: "user", uid: record.clientId } : null,
        isSelfService: isSelf,
        isDeletion: false,
        correlation: null,
      };
    }

    // ── Habits ───────────────────────────────────────────────────────────
    case "habits": {
      const name = subjectOf(subject);
      const clientOwned = after.clientOwned === true || before.clientOwned === true || selfService;
      if (record.op === "create") {
        return {
          category: "habit",
          significance: "key",
          action: clientOwned ? "create" : "assign",
          title: clientOwned ? "Creó un hábito" : "Asignó un hábito",
          subject: name,
          subjectRef: refFor("habits", record.docId, name),
          meta: [
            habitFrequencyLabel(after),
            str(after.startsOn) ? `desde ${str(after.startsOn)}` : null,
            str(after.endsOn) ? `hasta ${str(after.endsOn)}` : null,
          ].filter((m): m is string => !!m),
          target: record.clientId ? { kind: "user", uid: record.clientId } : null,
          isSelfService: clientOwned,
          isDeletion: false,
          correlation: null,
        };
      }
      const softDeleted = record.op === "update" && after.deleted === true;
      if (record.op === "delete" || softDeleted) {
        return {
          category: "habit",
          significance: "key",
          action: "delete",
          title: "Eliminó un hábito",
          subject: name,
          subjectRef: refFor("habits", record.docId, name),
          meta: [],
          target: record.clientId ? { kind: "user", uid: record.clientId } : null,
          isSelfService: clientOwned,
          isDeletion: true,
          correlation: null,
        };
      }
      const scheduleTouched = fields.some((f) =>
        ["startsOn", "endsOn", "scheduleCadence", "scheduleType", "scheduleWeekdays", "scheduleMonthDays", "skippedDates"].includes(f),
      );
      return {
        category: "habit",
        significance: scheduleTouched || fields.includes("name") ? "key" : "low",
        action: "update",
        title: scheduleTouched ? "Cambió la programación de un hábito" : "Actualizó un hábito",
        subject: name,
        subjectRef: refFor("habits", record.docId, name),
        meta: scheduleTouched ? [habitFrequencyLabel(after)] : [fields.join(", ")],
        target: record.clientId ? { kind: "user", uid: record.clientId } : null,
        isSelfService: clientOwned,
        isDeletion: false,
        correlation: null,
      };
    }

    // ── Exercise library ─────────────────────────────────────────────────
    case "exercises": {
      const name = subjectOf(subject);
      const owner = str(subject?.ownerId);
      const target: FeedTarget = { kind: "exercise", exerciseId: record.docId };
      if (record.op === "create") {
        return {
          category: "exercise",
          significance: "key",
          action: "create",
          title: "Creó un ejercicio",
          subject: name,
          subjectRef: refFor("exercises", record.docId, name),
          meta: [str(subject?.primaryMuscleGroup), owner ? null : "biblioteca"].filter(
            (m): m is string => !!m,
          ),
          target,
          isSelfService: false,
          isDeletion: false,
          correlation: null,
        };
      }
      const softDeleted = record.op === "update" && after.deleted === true;
      if (record.op === "delete" || softDeleted) {
        return {
          category: "exercise",
          significance: "key",
          action: "delete",
          title: "Eliminó un ejercicio",
          subject: name,
          subjectRef: refFor("exercises", record.docId, name),
          meta: [],
          target,
          isSelfService: false,
          isDeletion: true,
          correlation: null,
        };
      }
      return {
        category: "exercise",
        significance: changedOnly(fields, MECHANICAL_FIELDS) ? "low" : "key",
        action: "update",
        title: "Editó un ejercicio",
        subject: name,
        subjectRef: refFor("exercises", record.docId, name),
        meta: [fields.join(", ")],
        target,
        isSelfService: false,
        isDeletion: false,
        correlation: null,
      };
    }

    // ── Accounts / subscriptions ─────────────────────────────────────────
    case "users": {
      const target: FeedTarget = { kind: "user", uid: record.docId };
      if (record.op === "create") {
        const role = str(after.role) ?? "client";
        return {
          category: "account",
          significance: "key",
          action: "create",
          title: role === "trainer" ? "Nuevo coach" : "Nuevo usuario",
          subject: (str(after.displayName) ?? str(after.email) ?? record.docId).trim(),
          subjectRef: null,
          meta: [
            str(after.email),
            str(after.coachDisplayName) ? `coach: ${str(after.coachDisplayName)}` : null,
            after.autoAssignedCoach === true ? "coach auto-asignado" : null,
          ].filter((m): m is string => !!m),
          target,
          isSelfService: true,
          isDeletion: false,
          correlation: null,
        };
      }
      if (record.op === "delete") {
        return {
          category: "account",
          significance: "key",
          action: "delete",
          title: "Cuenta eliminada",
          subject: str(before.displayName) ?? str(before.email) ?? record.docId,
          subjectRef: null,
          meta: [],
          target: null,
          isSelfService: false,
          isDeletion: true,
          correlation: null,
        };
      }

      if (fields.includes("entitlement")) {
        const beforeTier = str((before.entitlement as Record<string, unknown> | null)?.tier);
        const afterEnt = (after.entitlement ?? {}) as Record<string, unknown>;
        const afterTier = str(afterEnt.tier);
        const changed = beforeTier !== afterTier;
        return {
          category: "account",
          significance: changed ? "key" : "low",
          action: "update",
          title: changed ? "Cambió la suscripción" : "Refrescó la suscripción",
          subject: `${beforeTier ?? "sin plan"} → ${afterTier ?? "sin plan"}`,
          subjectRef: null,
          meta: [str(afterEnt.source), str(afterEnt.productId)].filter(
            (m): m is string => !!m,
          ),
          target,
          isSelfService: false,
          isDeletion: false,
          correlation: null,
        };
      }

      if (fields.includes("coachId")) {
        const nowCoached = !!str(after.coachId);
        const previousCoach = str(before.coachDisplayName) ?? str(before.coachId);
        return {
          category: "account",
          significance: "key",
          action: "update",
          title: nowCoached ? "Cambió de coach" : "Quedó sin coach",
          subject: nowCoached
            ? (str(after.coachDisplayName) ?? str(after.coachId))
            : null,
          subjectRef: null,
          meta: previousCoach ? [`antes: ${previousCoach}`] : [],
          target,
          isSelfService: false,
          isDeletion: false,
          correlation: null,
        };
      }

      if (fields.includes("role")) {
        return {
          category: "account",
          significance: "key",
          action: "update",
          title: "Cambió de rol",
          subject: `${str(before.role) ?? "—"} → ${str(after.role) ?? "—"}`,
          subjectRef: null,
          meta: [],
          target,
          isSelfService: false,
          isDeletion: false,
          correlation: null,
        };
      }

      if (after.deleted === true && before.deleted !== true) {
        return {
          category: "account",
          significance: "key",
          action: "delete",
          title: "Cuenta desactivada",
          subject: null,
          subjectRef: null,
          meta: [],
          target,
          isSelfService: false,
          isDeletion: true,
          correlation: null,
        };
      }

      const profileTouched = fields.some((f) =>
        ["displayName", "email", "photoURL", "birthDate", "timezone", "locale"].includes(f),
      );
      return {
        category: "account",
        significance: "low",
        action: "update",
        title: profileTouched ? "Actualizó su perfil" : "Actualizó su cuenta",
        subject: null,
        subjectRef: null,
        meta: [fields.join(", ")],
        target,
        isSelfService: false,
        isDeletion: false,
        correlation: null,
      };
    }

    default:
      return {
        category: "other",
        significance: "low",
        action: record.op === "create" ? "create" : record.op === "delete" ? "delete" : "update",
        title: `${record.op} ${record.collection}`,
        subject: null,
        subjectRef: null,
        meta: [fields.join(", ")],
        target: null,
        isSelfService: false,
        isDeletion: record.op === "delete",
        correlation: null,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-merge: fold the write-back + the "done" stamp into the finish event
// ─────────────────────────────────────────────────────────────────────────────

/** The shape `mergeWorkoutWriteBacks` needs — a subset of the rendered event. */
export interface MergeableEvent {
  id: string;
  occurredAtISO: string | null;
  clientUid: string | null;
  correlation: ClassifiedEvent["correlation"];
  occurrenceCount?: number;
  /** Filled in by the merge: badges to render on the surviving finish event. */
  notes?: string[];
}

/** How long after a finish a write-back still counts as part of it. */
const WRITE_BACK_WINDOW_MS = 10 * 60 * 1000;

/**
 * Ticket #671 items 1 + 3: a finished workout emits, in the same breath, a
 * `templateSnapshot` re-write on every future occurrence of the routine and a
 * `status: completed` stamp on the assignment. Rendered separately those are the
 * unreadable rows the operator complained about; folded in they become the
 * answer to "¿y actualizó o no el template?".
 *
 * Input MUST be newest-first (the feed's natural order). Returns a NEW list
 * minus the absorbed rows, with `notes` attached to the surviving finish.
 */
export function mergeWorkoutWriteBacks<T extends MergeableEvent>(events: T[]): T[] {
  const absorbed = new Set<string>();
  const notesById = new Map<string, string[]>();

  for (const event of events) {
    if (event.correlation !== "workout_finished" || !event.clientUid) continue;
    const finishedMs = event.occurredAtISO ? Date.parse(event.occurredAtISO) : NaN;
    if (!Number.isFinite(finishedMs)) continue;

    for (const other of events) {
      if (other === event || absorbed.has(other.id)) continue;
      if (other.clientUid !== event.clientUid) continue;
      if (
        other.correlation !== "prescription_writeback" &&
        other.correlation !== "assignment_completed"
      ) {
        continue;
      }
      const otherMs = other.occurredAtISO ? Date.parse(other.occurredAtISO) : NaN;
      if (!Number.isFinite(otherMs)) continue;
      // The write-back lands within a few seconds AFTER the log is written; allow
      // a small negative slack for out-of-order server timestamps.
      const delta = otherMs - finishedMs;
      if (delta < -60_000 || delta > WRITE_BACK_WINDOW_MS) continue;

      absorbed.add(other.id);
      if (other.correlation === "prescription_writeback") {
        const count = other.occurrenceCount ?? 1;
        notesById.set(event.id, [
          ...(notesById.get(event.id) ?? []),
          count > 1 ? `actualizó la rutina (${count} ocurrencias)` : "actualizó la rutina",
        ]);
      }
    }
  }

  return events
    .filter((e) => !absorbed.has(e.id))
    .map((e) => {
      const notes = notesById.get(e.id);
      return notes ? { ...e, notes: [...(e.notes ?? []), ...notes] } : e;
    });
}
