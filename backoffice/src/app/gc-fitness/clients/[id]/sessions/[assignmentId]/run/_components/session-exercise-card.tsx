"use client";

// session-exercise-card.tsx
//
// One exercise inside the coach-run live session. Mirrors the iOS active
// workout card: thumbnail + name + "N series · Ms descanso", coach note
// inline (editable, persisted per client+exercise — #7), an "open in new
// window" affordance to edit the exercise media (#4), and the 5-column set
// table (SET · ANTERIOR · KG · REPS/TIME · ✓).

import Image from "next/image";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Minus,
  NotebookPen,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setClientExerciseNote } from "@/lib/gc-fitness/live-workout-actions";
import {
  clientExerciseNoteKey,
  useClientExerciseNote,
} from "@/lib/gc-fitness/live-workout-listener";
import type {
  PreviousSetSummary,
  SessionExercise,
} from "@/lib/gc-fitness/live-workout-types";

import type { SetRowState } from "./use-live-session";

function fmtKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatPrevious(
  p: PreviousSetSummary | undefined,
  isTime: boolean,
): string | null {
  if (!p) return null;
  if (isTime && p.durationSeconds) {
    return p.weightKg > 0
      ? `${fmtKg(p.weightKg)} kg × ${p.durationSeconds}s`
      : `${p.durationSeconds}s`;
  }
  return `${fmtKg(p.weightKg)} kg × ${p.reps}`;
}

function formatRest(seconds: number): string {
  if (seconds <= 0) return "sin descanso";
  if (seconds < 60) return `${seconds}s descanso`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m descanso` : `${m}m ${s}s descanso`;
}

function clampInputNumber(raw: string, fallback: number, max: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, parsed));
}

function EditableNumberInput({
  value,
  onCommit,
  inputMode,
  max,
  disabled,
  className,
}: {
  value: number;
  onCommit: (next: number) => void;
  inputMode: "numeric" | "decimal";
  max: number;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [focused, value]);

  function commit(nextDraft: string) {
    const next = clampInputNumber(nextDraft, value, max);
    onCommit(next);
    setDraft(String(next));
  }

  return (
    <input
      type="text"
      inputMode={inputMode}
      disabled={disabled}
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className={className}
    />
  );
}

export interface SessionExerciseCardProps {
  clientId: string;
  exercise: SessionExercise;
  rows: SetRowState[];
  previous?: PreviousSetSummary;
  highlightNextRow?: number | null;
  onWeight: (idx: number, value: number) => void;
  onReps: (idx: number, value: number) => void;
  onDuration: (idx: number, value: number) => void;
  onToggleDone: (idx: number) => void;
  onToggleWarmup: (idx: number) => void;
  onAddSet: () => void;
  onRemoveSet: (idx: number) => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function SessionExerciseCard({
  clientId,
  exercise,
  rows,
  previous,
  highlightNextRow,
  onWeight,
  onReps,
  onDuration,
  onToggleDone,
  onToggleWarmup,
  onAddSet,
  onRemoveSet,
  onMove,
  canMoveUp,
  canMoveDown,
}: SessionExerciseCardProps) {
  const isTime = exercise.metric === "time";
  const prevLabel = formatPrevious(previous, isTime);
  const queryClient = useQueryClient();

  const noteQuery = useClientExerciseNote(clientId, exercise.exerciseId);
  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const coachNote = noteQuery.data?.note ?? exercise.notes ?? "";
  async function saveNote() {
    setSavingNote(true);
    try {
      await setClientExerciseNote({
        clientId,
        exerciseId: exercise.exerciseId,
        note: draftNote,
      });
      await queryClient.invalidateQueries({
        queryKey: clientExerciseNoteKey(clientId, exercise.exerciseId),
      });
      setEditingNote(false);
      toast.success("Nota guardada");
    } catch {
      toast.error("No se pudo guardar la nota");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
          {exercise.thumbnailURL ? (
            <Image
              src={exercise.thumbnailURL}
              alt=""
              fill
              unoptimized
              className="object-cover"
              sizes="56px"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base font-semibold">
            {exercise.name.en || exercise.name.es}
          </p>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "serie" : "series"} ·{" "}
            {formatRest(exercise.restSeconds)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="mr-1 flex flex-col">
            <button
              type="button"
              aria-label="Subir ejercicio"
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Bajar ejercicio"
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            title="Nota para este alumno"
            onClick={() => {
              setDraftNote(coachNote);
              setEditingNote((v) => !v);
            }}
          >
            <NotebookPen className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Editar ejercicio en otra ventana"
            asChild
          >
            <a
              href={`/gc-fitness/exercises/${exercise.exerciseId}/edit`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Coach note */}
      {editingNote ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="Nota para este alumno en este ejercicio…"
            rows={2}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">
            Esta nota queda guardada para este cliente y ejercicio, y se
            reutiliza en futuros workouts donde aparezca el mismo ejercicio.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveNote} disabled={savingNote}>
              {savingNote ? "Guardando…" : "Guardar nota"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingNote(false)}
              disabled={savingNote}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : coachNote ? (
        <p className="mt-3 rounded-lg bg-accent/40 px-3 py-2 text-[13px] text-muted-foreground">
          “{coachNote}”
        </p>
      ) : null}

      {/* Set table */}
      <div className="mt-4">
        <div className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem_2.5rem] items-center gap-2 px-1 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Set</span>
          <span>Anterior</span>
          <span className="text-center">Kg</span>
          <span className="text-center">{isTime ? "Seg" : "Reps"}</span>
          <span />
        </div>
        <div className="space-y-1.5">
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className={`grid grid-cols-[2rem_1fr_4.5rem_4.5rem_2.5rem] items-center gap-2 rounded-lg px-1 py-1 ${
                row.done
                  ? "bg-emerald-500/10"
                  : idx === highlightNextRow
                    ? "border border-amber-400/70 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]"
                    : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleWarmup(idx)}
                title={row.isWarmup ? "Quitar calentamiento" : "Marcar calentamiento"}
                className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold ${
                  row.isWarmup
                    ? "bg-amber-500/20 text-amber-600"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {row.isWarmup ? "W" : idx + 1}
              </button>
              <span className="truncate text-xs text-muted-foreground">
                {prevLabel ?? "—"}
              </span>
              <EditableNumberInput
                value={row.weightKg}
                onCommit={(next) => onWeight(idx, next)}
                inputMode="decimal"
                max={2000}
                disabled={row.done}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-center text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
              />
              <EditableNumberInput
                value={isTime ? row.durationSeconds ?? 0 : row.reps}
                onCommit={(next) =>
                  isTime ? onDuration(idx, next) : onReps(idx, next)
                }
                inputMode="numeric"
                max={isTime ? 86_400 : 100}
                disabled={row.done}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-center text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => onToggleDone(idx)}
                title={row.done ? "Desmarcar" : "Marcar como hecha"}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                  row.done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border text-muted-foreground hover:border-emerald-500 hover:text-emerald-500"
                }`}
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={onAddSet}>
            <Plus className="h-3.5 w-3.5" />
            Agregar serie
          </Button>
          {rows.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => onRemoveSet(rows.length - 1)}
            >
              <Minus className="h-3.5 w-3.5" />
              Quitar serie
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
