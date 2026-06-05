"use client";

// workout-assignment-edit-dialog.tsx
//
// Edits the per-exercise prescription (reps/kg per set, rest, per-client notes)
// of an already-assigned workout, straight from the calendar's detail view.
// The trainer chooses the scope: just this occurrence, or every future
// occurrence in the same series. Writes go to the assignment's frozen snapshot
// via editAssignmentExercises — the template is never touched.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getAssignmentDetail,
  type AssignmentDetail,
} from "@/lib/gc-fitness/schedule-month-actions";
import { editAssignmentExercises } from "@/lib/gc-fitness/workout-assignment-actions";

interface WorkoutAssignmentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  /** Fired after a successful save so the parent can invalidate the calendar. */
  onSaved: () => void;
}

interface SetRow {
  reps: string;
  kg: string;
}
interface ExerciseDraft {
  rest: string;
  transitionRest: string;
  notes: string;
  setRows: SetRow[];
}

function InfoTooltip({ text, label }: { text: string; label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title={text}
            className="inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function seedDrafts(exercises: AssignmentDetail["exercises"]): Record<number, ExerciseDraft> {
  const out: Record<number, ExerciseDraft> = {};
  for (const ex of exercises) {
    const baseReps =
      ex.repsBySet.length > 0
        ? ex.repsBySet
        : Array.from({ length: Math.max(1, ex.sets) }, () => ex.reps);
    const setRows: SetRow[] = baseReps.map((reps, i) => ({
      reps: String(reps ?? ex.reps ?? 0),
      kg:
        ex.weightBySetKg[i] !== undefined && ex.weightBySetKg[i] !== null
          ? String(ex.weightBySetKg[i])
          : "",
    }));
    out[ex.index] = {
      rest: String(ex.rest_seconds ?? 60),
      transitionRest: String(ex.transition_rest_seconds ?? 60),
      notes: ex.notes ?? "",
      setRows: setRows.length > 0 ? setRows : [{ reps: "0", kg: "" }],
    };
  }
  return out;
}

export function WorkoutAssignmentEditDialog({
  open,
  onOpenChange,
  assignmentId,
  onSaved,
}: WorkoutAssignmentEditDialogProps) {
  const [drafts, setDrafts] = useState<Record<number, ExerciseDraft>>({});
  const [scope, setScope] = useState<"one" | "series">("one");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["assignment-detail", assignmentId],
    queryFn: () => getAssignmentDetail(assignmentId),
    enabled: open,
    staleTime: 30_000,
  });

  // Seed the editable drafts once the detail loads (and reset on reopen).
  useEffect(() => {
    if (data) setDrafts(seedDrafts(data.exercises));
  }, [data]);
  useEffect(() => {
    if (!open) setScope("one");
  }, [open]);

  const isSeries = Boolean(data?.seriesId || data?.recurrence);

  const exercises = useMemo(() => data?.exercises ?? [], [data]);

  function patch(index: number, next: Partial<ExerciseDraft>) {
    setDrafts((prev) => ({ ...prev, [index]: { ...prev[index], ...next } }));
  }
  function patchRow(index: number, rowIdx: number, next: Partial<SetRow>) {
    setDrafts((prev) => {
      const cur = prev[index];
      const setRows = cur.setRows.map((r, i) =>
        i === rowIdx ? { ...r, ...next } : r,
      );
      return { ...prev, [index]: { ...cur, setRows } };
    });
  }
  function copyFirstSetToAll(index: number) {
    setDrafts((prev) => {
      const cur = prev[index];
      const first = cur?.setRows[0];
      if (!cur || !first) return prev;
      return {
        ...prev,
        [index]: {
          ...cur,
          setRows: cur.setRows.map(() => ({ ...first })),
        },
      };
    });
  }

  function buildPayload() {
    return exercises.map((ex) => {
      const draft = drafts[ex.index];
      const repsBySet = draft.setRows.map((r) => {
        const n = Number(r.reps);
        return Number.isFinite(n) ? Math.max(0, Math.min(50, Math.round(n))) : 0;
      });
      const weightsRaw = draft.setRows.map((r) => {
        const raw = r.kg.trim();
        return raw === "" ? NaN : Number(raw);
      });
      const hasAnyWeight = weightsRaw.some((n) => Number.isFinite(n));
      const weightBySetKg = hasAnyWeight
        ? weightsRaw.map((n) =>
            Number.isFinite(n) ? Math.max(0, Math.min(500, n)) : 0,
          )
        : [];
      const rest = Number(draft.rest);
      return {
        index: ex.index,
        repsBySet: repsBySet.length > 0 ? repsBySet : [0],
        weightBySetKg,
        rest_seconds: Number.isFinite(rest)
          ? Math.max(0, Math.min(600, Math.round(rest)))
          : 60,
        transition_rest_seconds: Number.isFinite(Number(draft.transitionRest))
          ? Math.max(0, Math.min(600, Math.round(Number(draft.transitionRest))))
          : 60,
        notes: draft.notes.trim(),
      };
    });
  }

  async function onSave() {
    setSaving(true);
    try {
      const result = await editAssignmentExercises(assignmentId, {
        scope,
        exercises: buildPayload(),
      });
      toast.success(
        result.updatedCount === 1
          ? "Workout actualizado"
          : `${result.updatedCount} ocurrencias actualizadas`,
      );
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo guardar la edición",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-4 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">
            Editar {data ? data.templateName : "entrenamiento"}
          </DialogTitle>
          <DialogDescription>
            Cambiá reps, peso, descanso y notas de este workout asignado. No
            modifica la plantilla.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Si cambiás los <strong className="font-medium text-foreground">pesos</strong>, el
              alumno verá los nuevos la próxima vez que haga esta rutina y después
              vuelve a usar los suyos. Cambiar solo notas o descanso{" "}
              <strong className="font-medium text-foreground">no toca</strong> los pesos
              que ya viene usando.
            </span>
          </div>
          {isSeries ? (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-100">
              Esta asignación pertenece a una recurrencia. Elegí abajo si los
              cambios aplican solo a esta fecha o también a las siguientes
              ocurrencias antes de guardar.
            </div>
          ) : null}
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error instanceof Error ? error.message : "No se pudo cargar."}
            </p>
          ) : data ? (
            exercises.map((ex) => {
              const draft = drafts[ex.index];
              if (!draft) return null;
              return (
                <div
                  key={`${ex.exerciseId}-${ex.index}`}
                  className="rounded-lg border p-3"
                >
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium">{ex.exerciseName}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Descanso (seg)
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draft.rest}
                          onChange={(e) => patch(ex.index, { rest: e.target.value })}
                          className="h-8 w-20 rounded-md border bg-background px-2 text-sm text-foreground"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-500/5 px-2 py-1 text-xs text-amber-700 dark:text-amber-100">
                        Descanso entre ejercicios (s)
                        <InfoTooltip
                          text="Este es el descanso que el cliente ve después de terminar el ejercicio anterior. Si el siguiente ejercicio planificado es distinto, se usa como pausa antes de empezar el siguiente bloque."
                          label="Explicar descanso entre ejercicios"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draft.transitionRest}
                          onChange={(e) =>
                            patch(ex.index, { transitionRest: e.target.value })
                          }
                          className="h-8 w-20 rounded-md border border-amber-400/50 bg-background px-2 text-sm text-foreground"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-[28px_minmax(80px,1fr)_minmax(80px,1fr)_max-content] items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>#</span>
                    <span>Reps</span>
                    <span>Kg</span>
                    <span />
                  </div>
                  {draft.setRows.map((row, rowIdx) => {
                    const lastLogged =
                      data.lastLoggedSetsByExerciseId?.[ex.exerciseId]?.[
                        rowIdx
                      ];
                    return (
                    <div
                      key={rowIdx}
                      className="mt-1 grid grid-cols-[28px_minmax(80px,1fr)_minmax(80px,1fr)_max-content] items-start gap-2"
                    >
                      <span className="pt-2 text-xs text-muted-foreground">
                        {rowIdx + 1}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.reps}
                        onChange={(e) =>
                          patchRow(ex.index, rowIdx, { reps: e.target.value })
                        }
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                      />
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.kg}
                          placeholder="Kg"
                          onChange={(e) =>
                            patchRow(ex.index, rowIdx, { kg: e.target.value })
                          }
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                        />
                        {lastLogged ? (
                          <span className="px-0.5 text-[10px] text-muted-foreground">
                            Último: {lastLogged.weightKg}kg × {lastLogged.reps}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-end gap-1 pt-1">
                        {rowIdx === 0 ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            disabled={draft.setRows.length <= 1}
                            onClick={() => copyFirstSetToAll(ex.index)}
                            className="inline-flex h-7 items-center rounded-md border border-border/70 bg-background px-2 text-xs font-medium hover:border-foreground/30 disabled:opacity-50"
                          >
                            Copiar a todas
                          </button>
                        ) : null}
                        <button
                          type="button"
                          tabIndex={-1}
                          disabled={draft.setRows.length <= 1}
                          aria-label={`Quitar serie ${rowIdx + 1}`}
                          onClick={() =>
                            patch(ex.index, {
                              setRows: draft.setRows.filter(
                                (_, i) => i !== rowIdx,
                              ),
                            })
                          }
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-30"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    );
                  })}
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={draft.setRows.length >= 10}
                    onClick={() => {
                      const last = draft.setRows[draft.setRows.length - 1];
                      patch(ex.index, {
                        setRows: [
                          ...draft.setRows,
                          { reps: last?.reps ?? "0", kg: last?.kg ?? "" },
                        ],
                      });
                    }}
                    className="mt-1 inline-flex h-7 items-center gap-1 self-start rounded-md border border-border/70 bg-background px-2 text-xs font-medium hover:border-foreground/30 disabled:opacity-50"
                  >
                    + Agregar serie
                  </button>
                  <textarea
                    value={draft.notes}
                    onChange={(e) => patch(ex.index, { notes: e.target.value })}
                    placeholder="Notas específicas para este cliente en este ejercicio"
                    className="mt-2 min-h-16 w-full rounded-md border bg-background px-2 py-2 text-sm"
                  />
                </div>
              );
            })
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {isSeries ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Aplicar a
              </span>
              <div className="inline-flex rounded-lg border p-0.5">
                {(
                  [
                    ["one", "Solo este día"],
                    ["series", "Toda la serie (futuros)"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    tabIndex={-1}
                    onClick={() => setScope(value)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition",
                      scope === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              tabIndex={-1}
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={onSave} disabled={saving || !data}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
