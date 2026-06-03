"use client";

// use-live-session.ts
//
// Client-side state machine for the coach-run live workout — the backoffice
// twin of iOS ActiveWorkoutViewModel. Holds the in-memory working buffer
// (rows per exercise), derives the SetLog array, and bridges to the
// live-workout Server Actions (start / sync / finalize). Coach is the single
// writer (D3); the buffer is the source of truth and is persisted on
// done-toggle (debounced) for reload-resume, then written once on finalize.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  finalizeWorkoutSession,
  startWorkoutSession,
  syncWorkoutSession,
} from "@/lib/gc-fitness/live-workout-actions";
import type {
  ActiveSession,
  PreviousSessionMap,
  SessionExercise,
  SessionSetLog,
} from "@/lib/gc-fitness/live-workout-types";

export interface SetRowState {
  /** Stable lowercased UUID — the SetLog id (arrayUnion dedup key). */
  id: string;
  weightKg: number;
  reps: number;
  durationSeconds: number | null;
  isWarmup: boolean;
  done: boolean;
  /** ISO instant the row was marked done (frozen once set). */
  completedAt: string | null;
}

export type SessionStatus =
  | "loading"
  | "active"
  | "finishing"
  | "finished"
  | "error";

export interface FinalizeArgs {
  mode: "session" | "session_and_future";
  rpe?: number | null;
  notes?: string | null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().toLowerCase();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function isTimeMetric(ex: SessionExercise): boolean {
  return ex.metric === "time";
}

/** Build the initial rows for an exercise, prefilling from the template
 *  prescription, then the previous-session map, then zeros. */
function initialRows(
  ex: SessionExercise,
  previous: PreviousSessionMap,
): SetRowState[] {
  const count = Math.max(1, ex.sets);
  const prev = previous[ex.exerciseId];
  const time = isTimeMetric(ex);
  return Array.from({ length: count }, (_, idx) => {
    const weightKg =
      ex.weightBySetKg?.[idx] ?? prev?.weightKg ?? 0;
    const reps =
      ex.repsBySet?.[idx] ?? (ex.reps || prev?.reps || 0);
    const durationSeconds = time
      ? ex.durationBySetSeconds?.[idx] ??
        ex.durationSeconds ??
        prev?.durationSeconds ??
        null
      : null;
    return {
      id: newId(),
      weightKg,
      reps,
      durationSeconds,
      isWarmup: false,
      done: false,
      completedAt: null,
    };
  });
}

/** Overlay already-logged sets (from a resumed session) onto fresh rows. */
function hydrateLoggedSets(
  rowsByExercise: Record<string, SetRowState[]>,
  loggedSets: SessionSetLog[],
): Record<string, SetRowState[]> {
  if (loggedSets.length === 0) return rowsByExercise;
  const next = { ...rowsByExercise };
  for (const set of loggedSets) {
    const rows = next[set.exerciseId];
    if (!rows || !rows[set.setIndex]) continue;
    rows[set.setIndex] = {
      id: set.id,
      weightKg: set.weightKg,
      reps: set.reps,
      durationSeconds: set.durationSeconds ?? null,
      isWarmup: set.isWarmup,
      done: true,
      completedAt: set.completedAt,
    };
  }
  return next;
}

export interface LiveSessionApi {
  status: SessionStatus;
  errorMessage: string | null;
  session: ActiveSession | null;
  /** Exercises in current (possibly reordered) order. */
  exercises: SessionExercise[];
  rowsByExercise: Record<string, SetRowState[]>;
  previous: PreviousSessionMap;
  doneCount: number;
  totalPlanned: number;
  setWeight: (exerciseId: string, idx: number, value: number) => void;
  setReps: (exerciseId: string, idx: number, value: number) => void;
  setDuration: (exerciseId: string, idx: number, value: number) => void;
  toggleWarmup: (exerciseId: string, idx: number) => void;
  toggleDone: (exerciseId: string, idx: number) => void;
  addSet: (exerciseId: string) => void;
  removeSet: (exerciseId: string, idx: number) => void;
  moveExercise: (exerciseId: string, dir: -1 | 1) => void;
  /** Called by the rest-timer / done flow when a set is completed. */
  onSetCompleted?: (ex: SessionExercise) => void;
  registerOnSetCompleted: (cb: (ex: SessionExercise) => void) => void;
  finalize: (args: FinalizeArgs) => Promise<{ futureUpdated: number } | null>;
}

export function useLiveSession(
  assignmentId: string,
  previous: PreviousSessionMap,
): LiveSessionApi {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [rowsByExercise, setRowsByExercise] = useState<
    Record<string, SetRowState[]>
  >({});

  const startedRef = useRef(false);
  const onCompletedRef = useRef<((ex: SessionExercise) => void) | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start (or resume) the session once on mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const s = await startWorkoutSession({ assignmentId });
        if (cancelled) return;
        const base: Record<string, SetRowState[]> = {};
        for (const ex of s.exercises) base[ex.exerciseId] = initialRows(ex, previous);
        setSession(s);
        setExercises(s.exercises);
        setRowsByExercise(hydrateLoggedSets(base, s.sets));
        setStatus("active");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "No se pudo iniciar la sesión.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // previous is intentionally read once at start; later changes don't reset rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const deriveLoggedSets = useCallback(
    (rows: Record<string, SetRowState[]>): SessionSetLog[] => {
      const out: SessionSetLog[] = [];
      for (const ex of exercises) {
        const exRows = rows[ex.exerciseId] ?? [];
        exRows.forEach((row, idx) => {
          if (!row.done) return;
          out.push({
            id: row.id,
            exerciseId: ex.exerciseId,
            setIndex: idx,
            weightKg: row.weightKg,
            reps: row.reps,
            completedAt: row.completedAt ?? new Date().toISOString(),
            isWarmup: row.isWarmup,
            clientLoggedAt: row.completedAt ?? new Date().toISOString(),
            durationSeconds: row.durationSeconds,
          });
        });
      }
      return out;
    },
    [exercises],
  );

  const scheduleSync = useCallback(
    (rows: Record<string, SetRowState[]>) => {
      if (!session) return;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      const logId = session.logId;
      const sets = deriveLoggedSets(rows);
      syncTimer.current = setTimeout(() => {
        void syncWorkoutSession({ logId, sets }).catch(() => {
          /* best-effort resilience; the finalize write is authoritative */
        });
      }, 1200);
    },
    [session, deriveLoggedSets],
  );

  const mutateRow = useCallback(
    (
      exerciseId: string,
      idx: number,
      patch: (row: SetRowState) => SetRowState,
      sync = false,
    ) => {
      setRowsByExercise((prev) => {
        const rows = prev[exerciseId];
        if (!rows || !rows[idx]) return prev;
        const nextRows = rows.slice();
        nextRows[idx] = patch(nextRows[idx]);
        const next = { ...prev, [exerciseId]: nextRows };
        if (sync) scheduleSync(next);
        return next;
      });
    },
    [scheduleSync],
  );

  const setWeight = useCallback(
    (exerciseId: string, idx: number, value: number) =>
      mutateRow(exerciseId, idx, (r) => ({ ...r, weightKg: Math.max(0, value) }), true),
    [mutateRow],
  );
  const setReps = useCallback(
    (exerciseId: string, idx: number, value: number) =>
      mutateRow(exerciseId, idx, (r) => ({ ...r, reps: Math.max(0, Math.round(value)) }), true),
    [mutateRow],
  );
  const setDuration = useCallback(
    (exerciseId: string, idx: number, value: number) =>
      mutateRow(exerciseId, idx, (r) => ({ ...r, durationSeconds: Math.max(0, Math.round(value)) }), true),
    [mutateRow],
  );
  const toggleWarmup = useCallback(
    (exerciseId: string, idx: number) =>
      mutateRow(exerciseId, idx, (r) => ({ ...r, isWarmup: !r.isWarmup }), true),
    [mutateRow],
  );

  const toggleDone = useCallback(
    (exerciseId: string, idx: number) => {
      let becameDone = false;
      mutateRow(
        exerciseId,
        idx,
        (r) => {
          becameDone = !r.done;
          return {
            ...r,
            done: !r.done,
            completedAt: !r.done ? new Date().toISOString() : null,
          };
        },
        true,
      );
      if (becameDone && onCompletedRef.current) {
        const ex = exercises.find((e) => e.exerciseId === exerciseId);
        if (ex && !rowsAreWarmup(rowsByExercise[exerciseId], idx)) {
          onCompletedRef.current(ex);
        }
      }
    },
    [mutateRow, exercises, rowsByExercise],
  );

  const registerOnSetCompleted = useCallback(
    (cb: (ex: SessionExercise) => void) => {
      onCompletedRef.current = cb;
    },
    [],
  );

  const addSet = useCallback(
    (exerciseId: string) => {
      setRowsByExercise((prev) => {
        const rows = prev[exerciseId];
        if (!rows) return prev;
        const last = rows[rows.length - 1];
        const next = {
          ...prev,
          [exerciseId]: [
            ...rows,
            {
              id: newId(),
              weightKg: last?.weightKg ?? 0,
              reps: last?.reps ?? 0,
              durationSeconds: last?.durationSeconds ?? null,
              isWarmup: false,
              done: false,
              completedAt: null,
            },
          ],
        };
        return next;
      });
    },
    [],
  );

  const removeSet = useCallback(
    (exerciseId: string, idx: number) => {
      setRowsByExercise((prev) => {
        const rows = prev[exerciseId];
        if (!rows || rows.length <= 1) return prev; // keep at least one row
        const nextRows = rows.slice(0, idx).concat(rows.slice(idx + 1));
        const next = { ...prev, [exerciseId]: nextRows };
        scheduleSync(next);
        return next;
      });
    },
    [scheduleSync],
  );

  const moveExercise = useCallback(
    (exerciseId: string, dir: -1 | 1) => {
      setExercises((prev) => {
        const i = prev.findIndex((e) => e.exerciseId === exerciseId);
        const j = i + dir;
        if (i === -1 || j < 0 || j >= prev.length) return prev;
        const next = prev.slice();
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
    },
    [],
  );

  const finalize = useCallback(
    async (args: FinalizeArgs) => {
      if (!session) return null;
      setStatus("finishing");
      try {
        const sets = deriveLoggedSets(rowsByExercise);
        // "Future recurrence" should MATCH what the coach just performed: the
        // future prescription is rebuilt from the performed rows (set count,
        // per-set reps + weight + duration), keeping rest/superset/metric.
        const editedExercises =
          args.mode === "session_and_future"
            ? exercises.map((ex, i) => {
                const rows = rowsByExercise[ex.exerciseId] ?? [];
                const isTime = ex.metric === "time";
                return {
                  exerciseId: ex.exerciseId,
                  sets: Math.max(1, rows.length),
                  reps: rows[0]?.reps ?? ex.reps,
                  restSeconds: ex.restSeconds,
                  notes: ex.notes ?? null,
                  order: i + 1,
                  supersetGroup: ex.supersetGroup ?? null,
                  repsBySet: rows.map((r) => r.reps),
                  weightBySetKg: rows.map((r) => r.weightKg),
                  metric: ex.metric ?? null,
                  durationBySetSeconds: isTime
                    ? rows.map((r) => r.durationSeconds ?? 0)
                    : null,
                  durationSeconds: ex.durationSeconds ?? null,
                };
              })
            : undefined;
        const res = await finalizeWorkoutSession({
          logId: session.logId,
          sets,
          rpe: args.rpe ?? null,
          notes: args.notes ?? null,
          mode: args.mode,
          editedExercises,
        });
        setStatus("finished");
        return { futureUpdated: res.futureUpdated };
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "No se pudo finalizar.");
        setStatus("active");
        return null;
      }
    },
    [session, rowsByExercise, exercises, deriveLoggedSets],
  );

  const { doneCount, totalPlanned } = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const ex of exercises) {
      const rows = rowsByExercise[ex.exerciseId] ?? [];
      total += rows.length;
      done += rows.filter((r) => r.done).length;
    }
    return { doneCount: done, totalPlanned: total };
  }, [exercises, rowsByExercise]);

  return {
    status,
    errorMessage,
    session,
    exercises,
    rowsByExercise,
    previous,
    doneCount,
    totalPlanned,
    setWeight,
    setReps,
    setDuration,
    toggleWarmup,
    toggleDone,
    addSet,
    removeSet,
    moveExercise,
    registerOnSetCompleted,
    finalize,
  };
}

function rowsAreWarmup(rows: SetRowState[] | undefined, idx: number): boolean {
  return rows?.[idx]?.isWarmup === true;
}
