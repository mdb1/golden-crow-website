// assigned-by.ts — gc-fitness#1504: WHO PUT THIS ON THE CLIENT'S PLAN.
//
// TWIN of gc-fitness `functions/src/coach/assignedBy.ts`, iOS
// `GCFitnessCore/AssignedBy.swift` and Android `core/algorithms/AssignedBy.kt`;
// the agreement is locked by the shared vector (`__tests__/assigned-by.vector.json`,
// a byte copy of `functions/test/coach/fixtures/assigned-by.json`).
//
// A client who swaps coach keeps every doc the former one authored, with
// `trainerId` frozen on it (a swap deletes nothing). `trainerId` is therefore the
// AUTHORSHIP, and only comparing it with `users/{client}.coachId` tells a live
// plan from an inherited one:
//   - `self`    the client's own (`trainerId == clientId`);
//   - `current` the coach they have now;
//   - `former`  anyone else, also when they have no coach at all any more.
//
// Inherited work is never deleted by this: it just stops counting.
//
// The two defensive branches both refuse to call something `former` without
// proof: a doc with no authorship can't have been inherited, and a pending doc
// (`clientId` null) has no client who could have left, so it belongs to its author.
//
// Pure, no firebase imports.

export type AssignedBy = "self" | "current" | "former";

function nonBlank(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export function assignedBy(
  doc: { trainerId?: unknown; clientId?: unknown },
  user: { coachId?: unknown },
): AssignedBy {
  const trainerId = nonBlank(doc.trainerId);
  if (!trainerId) return "self";
  const clientId = nonBlank(doc.clientId);
  if (!clientId) return "current";
  if (trainerId === clientId) return "self";
  return trainerId === nonBlank(user.coachId) ? "current" : "former";
}

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Would «Terminar plan» remove this assignment? The per-doc half of the planner
 * (minus the log check, which needs a read): decides whether to offer the exit.
 */
export function isEndableAssignment(
  doc: {
    trainerId?: unknown;
    clientId?: unknown;
    status?: unknown;
    scheduledFor?: unknown;
    selfAssigned?: unknown;
  },
  user: { coachId?: unknown },
  today: string,
): boolean {
  if (assignedBy(doc, user) !== "former" || doc.selfAssigned === true) return false;
  const when = nonBlank(doc.scheduledFor);
  if (!when || !CIVIL_DATE_RE.test(when) || when < today) return false;
  return nonBlank(doc.status) === null || doc.status === "scheduled";
}

/** Same for a habit: live, not the client's, and not already over. */
export function isEndableHabit(
  doc: {
    trainerId?: unknown;
    clientId?: unknown;
    clientOwned?: unknown;
    deleted?: unknown;
    scheduleType?: unknown;
    startsOn?: unknown;
    endsOn?: unknown;
  },
  user: { coachId?: unknown },
  today: string,
): boolean {
  if (assignedBy(doc, user) !== "former" || doc.clientOwned === true || doc.deleted === true) {
    return false;
  }
  const endsOn = nonBlank(doc.endsOn);
  if (endsOn && CIVIL_DATE_RE.test(endsOn) && endsOn < today) return false;
  const startsOn = nonBlank(doc.startsOn);
  if (doc.scheduleType === "one-time" && startsOn && CIVIL_DATE_RE.test(startsOn) && startsOn < today) {
    return false;
  }
  return true;
}

/**
 * Same for a nutrition plan (#1504 Q2): live, not the client's own (`source == "self"`), and
 * not a past phase.
 */
export function isEndablePlan(
  doc: {
    trainerId?: unknown;
    clientId?: unknown;
    source?: unknown;
    deleted?: unknown;
    endsOn?: unknown;
  },
  user: { coachId?: unknown },
  today: string,
): boolean {
  if (assignedBy(doc, user) !== "former" || doc.source === "self" || doc.deleted === true) {
    return false;
  }
  const endsOn = nonBlank(doc.endsOn);
  if (endsOn && CIVIL_DATE_RE.test(endsOn) && endsOn < today) return false;
  return true;
}
