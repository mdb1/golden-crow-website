// workout-assignments-listener.ts
//
// TanStack Query hook that fetches a client's weekly workout assignments via
// the `listAssignmentsForClientWeek` Server Action. Shape mirrors
// `exercises-listener.ts` from P03-06 — same patterns, same caching contract.
//
// Why TanStack Query + Server Action (not a `firestore/onSnapshot` listener):
//   - The schedule view does not need real-time updates from peer trainers
//     in v1 (see 04-RESEARCH.md Pattern 1 — invalidate-on-mutate is enough).
//   - Server-Action driven fetches keep the Admin SDK as the single source
//     of truth for reads and writes; client-SDK reads would force us to
//     duplicate the auth + ownership checks at the rule layer (P04-02 does
//     enforce them, but the Admin SDK path is the test-covered surface
//     here).
//   - Invalidation: `assignTemplate`/`bulkAssignTemplate` callers should
//     call `queryClient.invalidateQueries({ queryKey: assignmentsKey(...) })`
//     on success so the grid re-fetches.
//
// CONTRACT (locked, do not regress):
//   - cache key: ["workout-assignments", clientId, weekStart]
//   - returns: WorkoutAssignmentRow[] (defined in workout-assignment-actions.ts)
//   - staleTime: 30s (trainer is unlikely to assign-and-immediately-assign
//                     a different template; a short window is enough)
//   - throws on Server-Action rejection — calling components surface via
//     React Query's `error` boundary.

"use client";

import { useQuery } from "@tanstack/react-query";

import {
  listAssignmentsForClientWeek,
  type WorkoutAssignmentRow,
} from "./workout-assignment-actions";

/** Cache key factory — exported so mutating Server-Action callers can
 * invalidate by exact key. */
export function assignmentsForClientWeekKey(
  clientId: string,
  weekStart: string,
): readonly unknown[] {
  return ["workout-assignments", clientId, weekStart] as const;
}

/**
 * Fetches the 7-day assignment window starting at `weekStart` (Monday by
 * convention, civil-date "YYYY-MM-DD") for `clientId`. Disabled if either
 * argument is the empty string, so the calling component can pass the
 * "no client selected yet" state without an extra `enabled` flag.
 */
export function useAssignmentsForClientWeek(
  clientId: string,
  weekStart: string,
) {
  return useQuery<WorkoutAssignmentRow[]>({
    queryKey: assignmentsForClientWeekKey(clientId, weekStart),
    queryFn: () => listAssignmentsForClientWeek(clientId, weekStart),
    enabled: Boolean(clientId) && Boolean(weekStart),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
