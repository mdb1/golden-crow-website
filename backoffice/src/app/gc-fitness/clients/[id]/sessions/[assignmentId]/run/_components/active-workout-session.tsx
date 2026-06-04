"use client";

// active-workout-session.tsx
//
// The coach-run live workout screen — backoffice twin of iOS
// ActiveWorkoutView. Holds the session via useLiveSession, renders the
// header + elapsed clock + progress, the meeting-link banner (#6), the
// exercise cards grouped into superset blocks, and the finalize control.
// (Rest timer = Phase 4; finalize "session vs future" dialog = Phase 5.)

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Timer, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { groupIntoSupersetBlocks } from "@/lib/gc-fitness/live-workout-supersets";
import {
  activeSessionKey,
  activeWorkoutSummariesKey,
  usePreviousSessionForClient,
} from "@/lib/gc-fitness/live-workout-listener";

import { CancelWorkoutDialog } from "./cancel-workout-dialog";
import { FinalizeDialog, type FinalizeMode } from "./finalize-dialog";
import { RestTimerOverlay } from "./rest-timer-overlay";
import { SessionExerciseCard } from "./session-exercise-card";
import { useRestTimer } from "./use-rest-timer";
import { useLiveSession } from "./use-live-session";
import type { ActiveSession, SessionExercise } from "@/lib/gc-fitness/live-workout-types";

function useElapsed(startedAt: string | null): string {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt || now === null) return "0:00";
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function formatMmss(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function resolveRestSeconds(
  exercise: SessionExercise,
): number {
  const base =
    exercise.restSeconds > 0
      ? exercise.restSeconds
      : exercise.transitionRestSeconds ?? 0;
  if (base > 0) return base;
  return 60;
}

export interface ActiveWorkoutSessionProps {
  clientId: string;
  assignmentId: string;
  initialSession: ActiveSession | null;
}

export function ActiveWorkoutSession({
  clientId,
  assignmentId,
  initialSession,
}: ActiveWorkoutSessionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const previousQuery = usePreviousSessionForClient(clientId);
  const previous = useMemo(() => previousQuery.data ?? {}, [previousQuery.data]);

  const live = useLiveSession(assignmentId, previous, initialSession);
  const elapsed = useElapsed(live.session?.startedAt ?? null);
  const timer = useRestTimer();
  const [restingExerciseId, setRestingExerciseId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const seenCompletedRowKeysRef = useRef<Set<string>>(new Set());

  const blocks = useMemo(
    () => groupIntoSupersetBlocks(live.exercises),
    [live.exercises],
  );

  const nextTarget = useMemo(() => {
    for (const ex of live.exercises) {
      const rows = live.rowsByExercise[ex.exerciseId] ?? [];
      const idx = rows.findIndex((row) => !row.done && !row.isWarmup);
      if (idx >= 0) {
        return { exerciseId: ex.exerciseId, rowIndex: idx };
      }
    }
    return null;
  }, [live.exercises, live.rowsByExercise]);

  useEffect(() => {
    if (!live.session) return;

    // Seed the completion cache with the current live rows first so a resumed
    // session doesn't auto-trigger a rest timer for already-done sets.
    if (seenCompletedRowKeysRef.current.size === 0) {
      for (const ex of live.exercises) {
        const rows = live.rowsByExercise[ex.exerciseId] ?? [];
        for (const row of rows) {
          if (row.done) {
            seenCompletedRowKeysRef.current.add(
              `${row.id}:${row.completedAt ?? "done"}`,
            );
          }
        }
      }
      return;
    }

    for (const ex of live.exercises) {
      const rows = live.rowsByExercise[ex.exerciseId] ?? [];
      for (const row of rows) {
        if (!row.done || row.isWarmup) continue;
        const completionKey = `${row.id}:${row.completedAt ?? "done"}`;
        if (seenCompletedRowKeysRef.current.has(completionKey)) continue;
        seenCompletedRowKeysRef.current.add(completionKey);
        setRestingExerciseId(ex.exerciseId);
        timer.start(resolveRestSeconds(ex));
        return;
      }
    }
  }, [live.session, live.exercises, live.rowsByExercise, timer.start]);

  async function finishWorkout(
    mode: FinalizeMode,
    notes: string | null,
    close: () => void,
  ) {
    setFinishing(true);
    try {
      const res = await live.finalize({ mode, notes });
      if (res) {
        close();
        void queryClient.invalidateQueries({ queryKey: activeWorkoutSummariesKey() });
        void queryClient.invalidateQueries({ queryKey: activeSessionKey(assignmentId) });
        toast.success(
          res.futureUpdated > 0
            ? `Entrenamiento finalizado · ${res.futureUpdated} futuro${
                res.futureUpdated === 1 ? "" : "s"
              } actualizado${res.futureUpdated === 1 ? "" : "s"}`
            : "Entrenamiento finalizado",
        );
        router.push(`/gc-fitness/clients/${clientId}`);
      }
    } finally {
      setFinishing(false);
    }
  }

  async function cancelWorkout(close: () => void) {
    setFinishing(true);
    try {
      const ok = await live.cancel();
      if (ok) {
        close();
        queryClient.removeQueries({ queryKey: activeWorkoutSummariesKey() });
        queryClient.removeQueries({ queryKey: activeSessionKey(assignmentId) });
        toast.success("Entrenamiento cancelado · volvió a programado");
        // Cancel is an operational action, not a client-detail action.
        // Send the coach back to the notifications hub so the canceled
        // workout does not re-enter the client profile flow.
        window.location.replace("/gc-fitness/notifications");
      }
    } finally {
      setFinishing(false);
    }
  }

  function renderCard(ex: SessionExercise) {
    const idx = live.exercises.findIndex((e) => e.exerciseId === ex.exerciseId);
    return (
      <SessionExerciseCard
        key={ex.exerciseId}
        clientId={clientId}
        exercise={ex}
        rows={live.rowsByExercise[ex.exerciseId] ?? []}
        previous={previous[ex.exerciseId]}
        onWeight={(i, v) => live.setWeight(ex.exerciseId, i, v)}
        onReps={(i, v) => live.setReps(ex.exerciseId, i, v)}
        onDuration={(i, v) => live.setDuration(ex.exerciseId, i, v)}
        onToggleDone={(i) => live.toggleDone(ex.exerciseId, i)}
        onToggleWarmup={(i) => live.toggleWarmup(ex.exerciseId, i)}
        onAddSet={() => live.addSet(ex.exerciseId)}
        onRemoveSet={(i) => live.removeSet(ex.exerciseId, i)}
        onMove={(dir) => live.moveExercise(ex.exerciseId, dir)}
        restCountdown={
          timer.active && restingExerciseId === ex.exerciseId
            ? formatMmss(timer.remainingSeconds)
            : null
        }
        highlightNextRow={
          nextTarget?.exerciseId === ex.exerciseId ? nextTarget.rowIndex : null
        }
        canMoveUp={idx > 0}
        canMoveDown={idx >= 0 && idx < live.exercises.length - 1}
      />
    );
  }

  if (live.status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (live.status === "error") {
    return (
      <div className="gc-page mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-destructive">
          {live.errorMessage ?? "No se pudo iniciar la sesión."}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  const session = live.session!;
  const workoutName = session.workoutName.en || session.workoutName.es || "Entrenamiento";

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 grid grid-cols-[auto_1fr_auto] items-center border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cerrar"
          onClick={() => setCancelOpen(true)}
        >
          <X className="h-5 w-5" />
        </Button>
        <div className="flex justify-center">
          <span className="font-mono text-lg tabular-nums">{elapsed}</span>
        </div>
        <div className="flex justify-end">
          {timer.active ? (
            <button
              type="button"
              onClick={timer.sheetOpen ? timer.minimize : timer.expand}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                timer.isPaused
                  ? "border-slate-400/40 bg-slate-500/10 text-slate-700 hover:bg-slate-500/15 dark:text-slate-300"
                  : "border-amber-400/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  timer.isPaused ? "bg-slate-500" : "bg-amber-500"
                }`}
              />
              <Timer className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">
                {formatMmss(timer.remainingSeconds)}
              </span>
              <span className="hidden sm:inline">
                {timer.isPaused ? "Pausado" : "Descanso"}
              </span>
            </button>
          ) : (
            <span className="w-9" />
          )}
        </div>
      </div>

      <div className="px-1 pt-4">
        <h1 className="gc-page-title text-2xl sm:text-3xl">{workoutName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {live.doneCount} / {live.totalPlanned} series completadas
        </p>
        {timer.active ? (
          <div className="sticky top-16 z-20 mt-3 overflow-hidden rounded-2xl border border-amber-400/60 bg-gradient-to-r from-amber-500/18 via-amber-400/10 to-background px-3 py-3 shadow-lg ring-1 ring-amber-400/20 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Timer
                  className={`h-4 w-4 ${
                    timer.isPaused
                      ? "text-slate-500 dark:text-slate-300"
                      : "text-amber-600 dark:text-amber-300"
                  }`}
                />
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      timer.isPaused
                        ? "text-slate-700 dark:text-slate-300"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    Descanso en curso
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Termina y suena solo cuando llegue a cero.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={timer.sheetOpen ? timer.minimize : timer.expand}
                className={`rounded-full border bg-background/85 px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-background ${
                  timer.isPaused
                    ? "border-slate-500/30 text-slate-700 dark:text-slate-300"
                    : "border-amber-500/30 text-amber-700 dark:text-amber-300"
                }`}
              >
                {timer.sheetOpen ? "Minimizar" : "Abrir"}
              </button>
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div
                className={`font-mono text-4xl font-semibold tabular-nums ${
                  timer.isPaused
                    ? "text-slate-700 dark:text-slate-300"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {Math.floor(timer.remainingSeconds / 60)}:
                {String(timer.remainingSeconds % 60).padStart(2, "0")}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                    timer.isPaused
                      ? "bg-slate-500/15 text-slate-700 dark:text-slate-300"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {timer.isPaused ? "Pausado" : "Corriendo"}
                </span>
                <button
                  type="button"
                  onClick={timer.skip}
                  className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  Saltar descanso
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Meeting link / reunion (#6) */}
        {session.meetingNotes ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
            {isUrl(session.meetingNotes) ? (
              <a
                href={session.meetingNotes}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-medium text-sky-600 underline"
              >
                {session.meetingNotes}
              </a>
            ) : (
              <span className="text-muted-foreground">{session.meetingNotes}</span>
            )}
          </div>
        ) : null}
      </div>

      {/* Exercise blocks */}
      <div className="mt-5 space-y-4">
        {blocks.map((block, bi) => {
          if (block.isSuperset) {
            return (
              <div
                key={`ss-${bi}`}
                className="space-y-3 rounded-3xl border border-violet-500/30 bg-violet-500/5 p-3"
              >
                <div className="flex items-center justify-between px-1">
                  <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-600">
                    Superserie {block.groupLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Alterná los ejercicios
                  </span>
                </div>
                {block.exercises.map((ex) => renderCard(ex))}
              </div>
            );
          }
          return renderCard(block.exercises[0]);
        })}
      </div>

      {/* Finalize bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button
            variant="outline"
            className="h-12 flex-1 rounded-full text-base"
            onClick={() => setCancelOpen(true)}
          >
            Cancelar
          </Button>
          <Button
            className="h-12 flex-1 rounded-full text-base"
            onClick={() => setFinalizeOpen(true)}
            disabled={finishing}
          >
            Finalizar
          </Button>
        </div>
      </div>

      <RestTimerOverlay timer={timer} />

      <FinalizeDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        assignmentId={assignmentId}
        hasSeries={Boolean(session.seriesId)}
        finishing={finishing}
        onConfirm={(mode, notes) => finishWorkout(mode, notes, () => setFinalizeOpen(false))}
      />

      <CancelWorkoutDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={finishing}
        onConfirm={() => cancelWorkout(() => setCancelOpen(false))}
      />
    </div>
  );
}
