// live-workout-listener.ts
//
// TanStack Query hooks for the live-workout surface. Same contract as the
// other gc-fitness listeners: Server-Action-backed reads (Admin SDK is the
// single source of truth), invalidate-on-mutate, no client-SDK onSnapshot.

"use client";

import { useQuery } from "@tanstack/react-query";

import {
  getActiveSessionForAssignment,
  getClientExerciseNote,
  getPreviousSessionForClient,
} from "./live-workout-actions";
import type { ActiveSession, PreviousSessionMap } from "./live-workout-types";

export function previousSessionKey(clientId: string): readonly unknown[] {
  return ["live-workout", "previous-session", clientId] as const;
}

/** Per-exercise most-recent performance for the "ANTERIOR" column. */
export function usePreviousSessionForClient(clientId: string) {
  return useQuery<PreviousSessionMap>({
    queryKey: previousSessionKey(clientId),
    queryFn: () => getPreviousSessionForClient(clientId),
    enabled: Boolean(clientId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function activeSessionKey(assignmentId: string): readonly unknown[] {
  return ["live-workout", "active-session", assignmentId] as const;
}

/** Existing active log for an assignment (drives resume / entry-button copy). */
export function useActiveSessionForAssignment(assignmentId: string) {
  return useQuery<ActiveSession | null>({
    queryKey: activeSessionKey(assignmentId),
    queryFn: () => getActiveSessionForAssignment(assignmentId),
    enabled: Boolean(assignmentId),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

export function clientExerciseNoteKey(
  clientId: string,
  exerciseId: string,
): readonly unknown[] {
  return ["live-workout", "exercise-note", clientId, exerciseId] as const;
}

/** Coach's private per-client per-exercise note (#7). */
export function useClientExerciseNote(clientId: string, exerciseId: string) {
  return useQuery<{ note: string }>({
    queryKey: clientExerciseNoteKey(clientId, exerciseId),
    queryFn: () => getClientExerciseNote({ clientId, exerciseId }),
    enabled: Boolean(clientId) && Boolean(exerciseId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
