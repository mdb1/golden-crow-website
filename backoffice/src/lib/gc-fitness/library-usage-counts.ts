// library-usage-counts.ts
//
// PURE tally helpers for the Biblioteca usage pills (no Firestore / no server
// deps — unit-testable). Two counts:
//
//  1. Exercise → in how many ROUTINES (workout templates) it's used.
//  2. Workout template → how many ASSIGNMENTS it has, where a recurring
//     assignment counts as ONE (grouped by series) and only today+future
//     occurrences count.
//
// The Server Actions in workout-template-actions / workout-assignment-actions
// fetch the docs and delegate the counting here.

/** Minimal shape of a workout-template doc needed to tally exercise usage. */
export interface TemplateForUsage {
  id: string;
  deleted?: boolean;
  exercises?: Array<{ exerciseId?: string | null } | null> | null;
}

/**
 * Map of `exerciseId` → number of DISTINCT (non-deleted) templates that
 * reference it. A template that lists the same exercise twice still counts
 * once for that template.
 */
export function tallyExerciseUsage(
  templates: TemplateForUsage[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const template of templates) {
    if (!template || template.deleted === true) continue;
    const exercises = Array.isArray(template.exercises)
      ? template.exercises
      : [];
    const idsInTemplate = new Set<string>();
    for (const ex of exercises) {
      const id = ex?.exerciseId;
      if (typeof id === "string" && id) idsInTemplate.add(id);
    }
    for (const id of idsInTemplate) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

/** Minimal shape of a workout-assignment doc needed to tally per template. */
export interface AssignmentForUsage {
  id: string;
  templateId?: string | null;
  scheduledFor?: string | null;
  /** Shared uuid across the docs of a recurring series; null on one-offs. */
  seriesId?: string | null;
}

/**
 * Map of `templateId` → number of DISTINCT assignment "series" scheduled for
 * `today` or later. Recurring assignments (same `seriesId` across many
 * occurrence docs) collapse to a single count; a series is counted as long as
 * it has at least one occurrence on/after `today`. Past-only assignments are
 * ignored. One-off docs (no `seriesId`) are keyed by their own doc id.
 *
 * `today` is a civil-date string `YYYY-MM-DD` in the trainer's timezone;
 * comparison is lexicographic (valid for zero-padded ISO dates).
 */
export function tallyTemplateAssignments(
  assignments: AssignmentForUsage[],
  today: string,
): Record<string, number> {
  // templateId → set of series keys with a today/future occurrence.
  const seriesByTemplate = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!a) continue;
    const templateId = a.templateId;
    const scheduledFor = a.scheduledFor;
    if (typeof templateId !== "string" || !templateId) continue;
    if (typeof scheduledFor !== "string" || scheduledFor < today) continue;
    const seriesKey =
      typeof a.seriesId === "string" && a.seriesId ? a.seriesId : a.id;
    let set = seriesByTemplate.get(templateId);
    if (!set) {
      set = new Set<string>();
      seriesByTemplate.set(templateId, set);
    }
    set.add(seriesKey);
  }
  const counts: Record<string, number> = {};
  for (const [templateId, set] of seriesByTemplate) {
    counts[templateId] = set.size;
  }
  return counts;
}
