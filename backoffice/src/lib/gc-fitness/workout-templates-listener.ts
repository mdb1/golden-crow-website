// workout-templates-listener.ts
//
// React-Query bridge for the trainer workout-templates list view.
//
// Unlike `exercises-listener.ts` (which subscribes to a Firestore client-SDK
// `onSnapshot` for live updates) this hook wraps the `listWorkoutTemplates`
// Server Action. Why a Server Action and not a client listener:
//
//  - Templates are listed scoped by `trainerId == session.uid` for T-04-16.
//    Performing that scope in a client listener requires the client-SDK to
//    know the trainer's uid, AND requires the security rules to allow the
//    read — both more brittle than a server-side query.
//  - The trainer surface is dramatically lower throughput than the
//    exercises list (handful of templates per trainer vs ~150 wger seeds);
//    React-Query's `staleTime: 30s` is plenty live.
//  - The Server Action keeps Firestore + auth-helpers + tag-index logic in
//    ONE place. Drift cost is zero — there's no client query to maintain.
//
// Cache key: `["gc-fitness", "workout-templates", tag, includeDeleted]`.
// Components that mutate templates (`createWorkoutTemplate`,
// `updateWorkoutTemplate`, `softDeleteWorkoutTemplate`) should call
// `queryClient.invalidateQueries({ queryKey: WORKOUT_TEMPLATES_BASE_KEY })`
// to force a refetch.
//
// CONTRACT NOTE: This file is OWNED BY PLAN 04-04. It mounts inside a
// `'use client'` component and calls the gc-fitness Server Action via
// next's "use server" boundary.

"use client";

import { useQuery } from "@tanstack/react-query";

import {
  listWorkoutTemplates,
  type WorkoutTemplateRow,
} from "./workout-template-actions";
import type { WorkoutTag } from "./workout-template-schema";

export type { WorkoutTemplateRow } from "./workout-template-actions";

/** Top-level cache namespace — useful for blanket invalidation on mutate. */
export const WORKOUT_TEMPLATES_BASE_KEY = [
  "gc-fitness",
  "workout-templates",
] as const;

export interface UseWorkoutTemplatesOptions {
  /** Optional tag filter (e.g. `"push"`). When provided, scopes the query. */
  tag?: WorkoutTag;
  /** Include soft-deleted templates. Defaults to false. */
  includeDeleted?: boolean;
}

/**
 * Trainer workout-template feed. Returns a React-Query `UseQueryResult`
 * with `data: WorkoutTemplateRow[] | undefined` + standard `isLoading` /
 * `error` boundaries.
 *
 * The cache key includes the tag + includeDeleted so switching filters
 * results in a separate cache slot (no stale-data flashes mid-filter).
 */
export function useWorkoutTemplates(opts?: UseWorkoutTemplatesOptions) {
  const tag = opts?.tag;
  const includeDeleted = opts?.includeDeleted ?? false;
  return useQuery<WorkoutTemplateRow[]>({
    queryKey: [...WORKOUT_TEMPLATES_BASE_KEY, tag ?? null, includeDeleted],
    queryFn: async () => {
      const result = await listWorkoutTemplates({ tag, includeDeleted });
      return result.templates;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
