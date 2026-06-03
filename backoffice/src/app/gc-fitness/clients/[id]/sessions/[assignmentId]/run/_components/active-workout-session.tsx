"use client";

// active-workout-session.tsx
//
// The coach-run live workout screen — backoffice twin of iOS
// ActiveWorkoutView. Holds the session via useLiveSession, renders the
// header + elapsed clock + progress, the meeting-link banner (#6), the
// exercise cards grouped into superset blocks, and the finalize control.
// (Rest timer = Phase 4; finalize "session vs future" dialog = Phase 5.)

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { groupIntoSupersetBlocks } from "@/lib/gc-fitness/live-workout-supersets";
import { usePreviousSessionForClient } from "@/lib/gc-fitness/live-workout-listener";

import { SessionExerciseCard } from "./session-exercise-card";
import { useLiveSession } from "./use-live-session";

function useElapsed(startedAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return "0:00";
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

export interface ActiveWorkoutSessionProps {
  clientId: string;
  assignmentId: string;
}

export function ActiveWorkoutSession({
  clientId,
  assignmentId,
}: ActiveWorkoutSessionProps) {
  const router = useRouter();
  const previousQuery = usePreviousSessionForClient(clientId);
  const previous = useMemo(() => previousQuery.data ?? {}, [previousQuery.data]);

  const live = useLiveSession(assignmentId, previous);
  const elapsed = useElapsed(live.session?.startedAt ?? null);
  const [finishing, setFinishing] = useState(false);

  const blocks = useMemo(
    () => groupIntoSupersetBlocks(live.exercises),
    [live.exercises],
  );

  async function handleFinish() {
    // Phase 5 swaps this for the "esta sesión vs recurrencia futura" dialog.
    setFinishing(true);
    const res = await live.finalize({ mode: "session" });
    setFinishing(false);
    if (res) {
      toast.success("Entrenamiento finalizado");
      router.push(`/gc-fitness/clients/${clientId}`);
    }
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
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cerrar"
          onClick={() => router.back()}
        >
          <X className="h-5 w-5" />
        </Button>
        <span className="font-mono text-lg tabular-nums">{elapsed}</span>
        <span className="w-9" />
      </div>

      <div className="px-1 pt-4">
        <h1 className="font-heading text-2xl font-bold">{workoutName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {live.doneCount} / {live.totalPlanned} series completadas
        </p>

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
                {block.exercises.map((ex) => (
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
                  />
                ))}
              </div>
            );
          }
          const ex = block.exercises[0];
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
            />
          );
        })}
      </div>

      {/* Finalize bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button variant="outline" className="flex-1" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleFinish} disabled={finishing}>
            {finishing ? "Finalizando…" : "Finalizar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
