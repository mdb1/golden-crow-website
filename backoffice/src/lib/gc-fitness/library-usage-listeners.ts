// library-usage-listeners.ts
//
// React-Query bridges for the Biblioteca usage pills. Both wrap a Server
// Action (same rationale as workout-templates-listener: the count queries are
// trainer-scoped and run server-side). Counts are cheap to be slightly stale,
// so a 60s staleTime is plenty live for a library overview.

"use client";

import { useQuery } from "@tanstack/react-query";

import { countExerciseTemplateUsage } from "./workout-template-actions";
import {
  countTemplateAssignments,
  listWorkoutAssignmentGroups,
  type WorkoutAssignmentGroup,
} from "./workout-assignment-actions";

export type { WorkoutAssignmentGroup } from "./workout-assignment-actions";

export const EXERCISE_USAGE_QUERY_KEY = [
  "gc-fitness",
  "exercise-usage-counts",
] as const;

export const TEMPLATE_ASSIGNMENT_QUERY_KEY = [
  "gc-fitness",
  "template-assignment-counts",
] as const;

/** `exerciseId` → number of routines (templates) using it. */
export function useExerciseUsageCounts() {
  return useQuery<Record<string, number>>({
    queryKey: EXERCISE_USAGE_QUERY_KEY,
    queryFn: () => countExerciseTemplateUsage(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** `templateId` → number of today/future assignment series (recurring = 1). */
export function useTemplateAssignmentCounts() {
  return useQuery<Record<string, number>>({
    queryKey: TEMPLATE_ASSIGNMENT_QUERY_KEY,
    queryFn: () => countTemplateAssignments(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export const WORKOUT_ASSIGNMENT_GROUPS_QUERY_KEY = [
  "gc-fitness",
  "workout-assignment-groups",
] as const;

/** Today/future workout assignments grouped by template → client (lazy). */
export function useWorkoutAssignmentGroups(enabled: boolean) {
  return useQuery<WorkoutAssignmentGroup[]>({
    queryKey: WORKOUT_ASSIGNMENT_GROUPS_QUERY_KEY,
    queryFn: () => listWorkoutAssignmentGroups(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled,
  });
}
