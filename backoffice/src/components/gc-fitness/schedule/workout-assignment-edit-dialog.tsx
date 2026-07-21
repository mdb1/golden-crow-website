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
import { Info, Plus, Trash2 } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
// quick-260714-m57 (#403) — Hevy-style per-set types on the assignment's
// frozen snapshot (same picker as the template editor).
import {
  SET_TYPES,
  type SetType,
  plannedSetType,
  setDisplayLabels,
  SET_TYPE_LETTERS,
  SET_TYPE_LABELS_ES,
  SET_TYPE_TEXT_CLASS,
} from "@/lib/gc-fitness/set-type";
import { ExercisePickerPopover } from "@/components/gc-fitness/exercise-picker-popover";
import { useExercisesQuery } from "@/lib/gc-fitness/exercises-listener";
import {
  getAssignmentDetail,
  type AssignmentDetail,
} from "@/lib/gc-fitness/schedule-month-actions";
import {
  editAssignmentExercises,
  editAssignmentRecurrence,
} from "@/lib/gc-fitness/workout-assignment-actions";
import {
  addCivilMonths,
  END_DATE_PRESET_MONTHS,
  inferEndDatePresetMonths,
  type EndDatePresetMonths,
} from "@/lib/gc-fitness/end-date-presets";

interface WorkoutAssignmentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  /** Fired after a successful save so the parent can invalidate the calendar. */
  onSaved: () => void;
}

type RecurrenceRule =
  | { kind: "daily" }
  | { kind: "weekly"; weekday: number }
  | { kind: "weekly_days"; weekdays: number[] }
  | { kind: "every_n_days"; everyN: number }
  | { kind: "monthly"; dayOfMonth: number };

interface SetRow {
  reps: string;
  kg: string;
}
interface ExerciseDraftRow {
  rowId: string;
  exerciseId: string;
  name: { en: string; es: string };
  previewUrl: string | null;
  rest: string;
  transitionRest: string;
  notes: string;
  setRows: SetRow[];
  /**
   * 260610-j67 (issue #159) — explicit "Sin peso" / no-weight intent for
   * this exercise. When true, the payload writes `weightBySetKg: []` (the
   * reps-only sentinel) and the kg column is hidden. Seeded from the
   * assignment's `hasExplicitNoWeightPrescription` so an already-no-weight
   * assignment stays no-weight on edit (the legacy `hasAnyWeight ? […] : []`
   * derivation would otherwise be ambiguous with a weighted exercise whose
   * weights were all cleared).
   */
  noWeight: boolean;
  metric: "reps" | "time";
  durationBySetSeconds: number[];
  durationSeconds: number | null;
  supersetGroup: string | null;
  /**
   * quick-260714-m57 (#403) — per-set types, ALWAYS aligned 1:1 with
   * `setRows` (add/remove set keeps them in lockstep). Payload emits
   * `setTypesBySet`; the server drops it when all-normal.
   */
  setTypes: SetType[];
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

function makeRowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function initialEndDateForSeries(data: AssignmentDetail | undefined): string {
  if (!data) return "";
  return data.seriesEndDate &&
    CIVIL_DATE_RE.test(data.seriesEndDate) &&
    data.seriesEndDate >= data.scheduledFor
    ? data.seriesEndDate
    : data.scheduledFor;
}

function normalizeRecurrenceRule(
  recurrence: Record<string, unknown> | null,
): RecurrenceRule | null {
  if (!recurrence) return null;
  const kind = recurrence.kind;
  if (kind === "daily") return { kind: "daily" };
  if (kind === "weekly") {
    const weekday = Number(recurrence.weekday);
    return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      ? { kind: "weekly", weekday }
      : null;
  }
  if (kind === "weekly_days" && Array.isArray(recurrence.weekdays)) {
    const weekdays = recurrence.weekdays
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    return weekdays.length > 0 ? { kind: "weekly_days", weekdays } : null;
  }
  if (kind === "every_n_days") {
    const everyN = Number(recurrence.everyN);
    return Number.isInteger(everyN) && everyN >= 2 && everyN <= 30
      ? { kind: "every_n_days", everyN }
      : null;
  }
  if (kind === "monthly") {
    const dayOfMonth = Number(recurrence.dayOfMonth);
    return Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31
      ? { kind: "monthly", dayOfMonth }
      : null;
  }
  return null;
}

function exerciseName(ex: AssignmentDetail["exercises"][number]): { en: string; es: string } {
  return { en: ex.exerciseName, es: "" };
}

function seedDraftRows(exercises: AssignmentDetail["exercises"]): ExerciseDraftRow[] {
  return exercises.map((ex) => {
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
    const rows = setRows.length > 0 ? setRows : [{ reps: "0", kg: "" }];
    return {
      rowId: makeRowId(),
      exerciseId: ex.exerciseId,
      name: exerciseName(ex),
      previewUrl: ex.previewUrl ?? null,
      rest: String(ex.rest_seconds ?? 60),
      transitionRest: String(ex.transition_rest_seconds ?? 60),
      notes: ex.notes ?? "",
      setRows: rows,
      // 260610-j67 — preserve the no-weight sentinel across edits.
      noWeight: ex.hasExplicitNoWeightPrescription === true,
      metric: ex.metric,
      durationBySetSeconds: ex.durationBySetSeconds ?? [],
      durationSeconds: ex.durationSeconds ?? null,
      supersetGroup: ex.supersetGroup ?? null,
      // quick-260714-m57 (#403) — aligned 1:1 with setRows; missing / short /
      // unknown entries coerce to "normal" (forgiving decode).
      setTypes: rows.map((_, i) => plannedSetType(i, ex.setTypesBySet)),
    };
  });
}

export function WorkoutAssignmentEditDialog({
  open,
  onOpenChange,
  assignmentId,
  onSaved,
}: WorkoutAssignmentEditDialogProps) {
  const [drafts, setDrafts] = useState<ExerciseDraftRow[]>([]);
  const [scope, setScope] = useState<"one" | "series">("one");
  const [seriesEndDate, setSeriesEndDate] = useState("");
  const [seriesEndPresetMonths, setSeriesEndPresetMonths] =
    useState<EndDatePresetMonths | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: exerciseLibrary } = useExercisesQuery();

  const { data, isLoading, error } = useQuery({
    queryKey: ["assignment-detail", assignmentId],
    queryFn: () => getAssignmentDetail(assignmentId),
    enabled: open,
    staleTime: 30_000,
  });
  const exerciseById = useMemo(
    () =>
      new Map(
        (exerciseLibrary ?? []).map((exercise) => [exercise.id, exercise]),
      ),
    [exerciseLibrary],
  );

  // Seed the editable drafts once the detail loads (and reset on reopen).
  useEffect(() => {
    if (!data) return;
    setDrafts(seedDraftRows(data.exercises));
    const nextEndDate = initialEndDateForSeries(data);
    setSeriesEndDate(nextEndDate);
    setSeriesEndPresetMonths(
      inferEndDatePresetMonths(data.scheduledFor, nextEndDate),
    );
  }, [data]);
  useEffect(() => {
    if (!open) {
      setScope("one");
      setSeriesEndDate("");
      setSeriesEndPresetMonths(null);
    }
  }, [open]);

  const isSeries = Boolean(data?.seriesId || data?.recurrence);
  const initialSeriesEndDate = initialEndDateForSeries(data);
  const seriesEndDateChanged =
    isSeries &&
    scope === "series" &&
    seriesEndDate !== "" &&
    seriesEndDate !== initialSeriesEndDate;

  const exercises = useMemo(() => drafts, [drafts]);

  function patch(rowId: string, next: Partial<ExerciseDraftRow>) {
    setDrafts((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...next } : row)),
    );
  }
  // D10 — write a group rest value through to EVERY member of the superset
  // label (D1/D2). `rest` = round rest, `transitionRest` = after-superset rest.
  function patchGroupRest(
    group: string | null,
    field: "rest" | "transitionRest",
    value: string,
  ) {
    if (group === null) return;
    setDrafts((prev) =>
      prev.map((row) =>
        (row.supersetGroup ?? null) === group ? { ...row, [field]: value } : row,
      ),
    );
  }
  function patchRow(rowId: string, rowIdx: number, next: Partial<SetRow>) {
    setDrafts((prev) => {
      const cur = prev.find((row) => row.rowId === rowId);
      if (!cur) return prev;
      const setRows = cur.setRows.map((r, i) =>
        i === rowIdx ? { ...r, ...next } : r,
      );
      return prev.map((row) => (row.rowId === rowId ? { ...cur, setRows } : row));
    });
  }
  function copyFirstSetToAll(rowId: string) {
    setDrafts((prev) => {
      const cur = prev.find((row) => row.rowId === rowId);
      const first = cur?.setRows[0];
      if (!cur || !first) return prev;
      return prev.map((row) =>
        row.rowId === rowId
          ? {
              ...cur,
              setRows: cur.setRows.map(() => ({ ...first })),
            }
          : row,
      );
    });
  }

  function appendExerciseRow() {
    setDrafts((prev) => [
      ...prev,
      {
        rowId: makeRowId(),
        exerciseId: "",
        name: { en: "", es: "" },
        previewUrl: null,
        rest: "60",
        transitionRest: "60",
        notes: "",
        setRows: [{ reps: "10", kg: "" }],
        noWeight: false,
        metric: "reps",
        durationBySetSeconds: [],
        durationSeconds: null,
        supersetGroup: null,
        setTypes: ["normal"],
      },
    ]);
  }

  // quick-260714-m57 (#403) — per-set type mutation (aligned with setRows).
  function setRowType(rowId: string, rowIdx: number, type: SetType) {
    setDrafts((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const setTypes = row.setRows.map(
          (_, i) => (i === rowIdx ? type : row.setTypes[i] ?? "normal"),
        );
        return { ...row, setTypes };
      }),
    );
  }

  function removeExerciseRow(rowId: string) {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.rowId !== rowId)));
  }

  function selectExercise(rowId: string, exerciseId: string) {
    const selected = exerciseById.get(exerciseId);
    setDrafts((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        return {
          ...row,
          exerciseId,
          name: selected?.name ?? row.name,
          previewUrl:
            selected?.gifUrl ?? selected?.imageUrl ?? selected?.thumbnailURL ?? row.previewUrl,
          metric: selected?.metric ?? row.metric,
        };
      }),
    );
  }

  function buildPayload() {
    return exercises.map((draft) => {
      const repsBySet = draft.setRows.map((r) => {
        const n = Number(r.reps);
        return Number.isFinite(n) ? Math.max(0, Math.min(50, Math.round(n))) : 0;
      });
      const weightsRaw = draft.setRows.map((r) => {
        const raw = r.kg.trim();
        return raw === "" ? NaN : Number(raw);
      });
      // 260610-j67 (issue #159) — when "Sin peso" is on, ALWAYS emit the
      // explicit empty-array sentinel `[]` (reps-only), regardless of any
      // stray typed kg. Otherwise an empty kg input means 0kg, not "no load".
      const weightBySetKg = draft.noWeight
        ? []
        : Array.from({ length: repsBySet.length || 1 }, (_, i) => {
            const n = weightsRaw[i];
            return Number.isFinite(n) ? Math.max(0, Math.min(500, n)) : 0;
          });
      const rest = Number(draft.rest);
      return {
        exerciseId: draft.exerciseId,
        name: draft.name,
        previewUrl: draft.previewUrl,
        repsBySet: repsBySet.length > 0 ? repsBySet : [0],
        weightBySetKg,
        rest_seconds: Number.isFinite(rest)
          ? Math.max(0, Math.min(600, Math.round(rest)))
          : 60,
        transition_rest_seconds: Number.isFinite(Number(draft.transitionRest))
          ? Math.max(0, Math.min(600, Math.round(Number(draft.transitionRest))))
          : 60,
        notes: draft.notes.trim(),
        metric: draft.metric,
        durationBySetSeconds: draft.durationBySetSeconds,
        durationSeconds: draft.durationSeconds,
        supersetGroup: draft.supersetGroup,
        noWeight: draft.noWeight,
        // quick-260714-m57 (#403) — always send the FULL aligned array; the
        // server normalizes (writes only when some entry is non-normal, and
        // deletes the stale key otherwise).
        setTypesBySet: (repsBySet.length > 0 ? repsBySet : [0]).map(
          (_, i) => draft.setTypes[i] ?? "normal",
        ),
      };
    });
  }

  async function onSave() {
    if (
      exercises.some(
        (row) =>
          row.exerciseId.trim().length === 0 || row.name.en.trim().length === 0,
      )
    ) {
      toast.error("Elegí un ejercicio para cada fila antes de guardar.");
      return;
    }
    if (isSeries && scope === "series") {
      if (!CIVIL_DATE_RE.test(seriesEndDate)) {
        toast.error("Elegí una fecha de fin válida.");
        return;
      }
      if (data && seriesEndDate < data.scheduledFor) {
        toast.error("La fecha de fin debe ser igual o posterior a esta fecha.");
        return;
      }
      if (
        seriesEndDateChanged &&
        !normalizeRecurrenceRule(data?.recurrence ?? null)
      ) {
        toast.error("No se pudo leer la recurrencia actual de la serie.");
        return;
      }
    }
    setSaving(true);
    try {
      const result = await editAssignmentExercises(assignmentId, {
        scope,
        exercises: buildPayload(),
      });
      let recurrenceCreatedCount: number | null = null;
      if (data && seriesEndDateChanged) {
        const recurrence = normalizeRecurrenceRule(data.recurrence);
        if (!recurrence) {
          throw new Error("No se pudo leer la recurrencia actual de la serie.");
        }
        const recurrenceResult = await editAssignmentRecurrence(assignmentId, {
          recurrence,
          endDate: seriesEndDate,
        });
        recurrenceCreatedCount = recurrenceResult.createdCount;
      }
      toast.success(
        recurrenceCreatedCount !== null
          ? `Workout actualizado · ${recurrenceCreatedCount} ${
              recurrenceCreatedCount === 1 ? "fecha" : "fechas"
            } en la serie.`
          : result.updatedCount === 1
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
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {exercises.length} ejercicio
                  {exercises.length === 1 ? "" : "s"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={appendExerciseRow}
                >
                  <Plus className="h-4 w-4" />
                  Agregar ejercicio
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {exercises.map((draft, index) => {
                  const selectedExercise = exerciseById.get(draft.exerciseId);
                  const showRemove = exercises.length > 1;
                  // D10 — superset adjacency + canonical group rest (last member).
                  const group = draft.supersetGroup ?? null;
                  const prevGroup =
                    index > 0 ? exercises[index - 1].supersetGroup ?? null : null;
                  const nextGroup =
                    index < exercises.length - 1
                      ? exercises[index + 1].supersetGroup ?? null
                      : null;
                  const isInSuperset =
                    group !== null && (group === prevGroup || group === nextGroup);
                  const isSupersetStart = group !== null && group !== prevGroup;
                  const memberRows = isInSuperset
                    ? exercises.filter((d) => (d.supersetGroup ?? null) === group)
                    : [];
                  const lastMember = memberRows[memberRows.length - 1];
                  const groupRoundRest = lastMember?.rest ?? "";
                  const groupAfterRest = lastMember?.transitionRest ?? "";
                  return (
                    <div key={draft.rowId} className="rounded-lg border p-3">
                      {/* D10 — one group rest editor per superset block. */}
                      {isSupersetStart ? (
                        <div className="mb-3 rounded-md border border-amber-400/50 bg-amber-50/60 p-3 dark:border-amber-300/35 dark:bg-amber-950/20">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            Superserie {group}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="text-xs text-amber-800 dark:text-amber-200">
                              Descanso de la superserie (s)
                              <input
                                type="text"
                                inputMode="numeric"
                                value={groupRoundRest}
                                onChange={(e) =>
                                  patchGroupRest(group, "rest", e.target.value)
                                }
                                className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                              />
                            </label>
                            <label className="text-xs text-amber-800 dark:text-amber-200">
                              Descanso al terminar la superserie (s)
                              <input
                                type="text"
                                inputMode="numeric"
                                value={groupAfterRest}
                                onChange={(e) =>
                                  patchGroupRest(
                                    group,
                                    "transitionRest",
                                    e.target.value,
                                  )
                                }
                                className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                              />
                            </label>
                          </div>
                        </div>
                      ) : null}
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            Ejercicio {index + 1}
                          </p>
                          <div className="mt-2">
                            <ExercisePickerPopover
                              value={draft.exerciseId}
                              onChange={(value) =>
                                selectExercise(draft.rowId, value)
                              }
                              placeholder="Elegí un ejercicio"
                              ariaLabel={`Elegir ejercicio ${index + 1}`}
                            />
                          </div>
                          {selectedExercise ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {selectedExercise.name.en}
                              {selectedExercise.name.es &&
                              selectedExercise.name.es !== selectedExercise.name.en
                                ? ` · ${selectedExercise.name.es}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-pressed={draft.noWeight}
                            onClick={() =>
                              patch(draft.rowId, { noWeight: !draft.noWeight })
                            }
                            className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium ${
                              draft.noWeight
                                ? "border-foreground bg-foreground text-background"
                                : "border-border/70 bg-background text-foreground hover:border-foreground/30"
                            }`}
                          >
                            Sin peso
                          </button>
                          {/* D10 — superset members edit rest at the group
                              level (above); hide the per-member field. */}
                          {isInSuperset ? null : (
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            Descanso (seg)
                            <input
                              type="text"
                              inputMode="numeric"
                              value={draft.rest}
                              onChange={(e) =>
                                patch(draft.rowId, { rest: e.target.value })
                              }
                              className="h-8 w-20 rounded-md border bg-background px-2 text-sm text-foreground"
                            />
                          </label>
                          )}
                          {showRemove ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              aria-label={`Quitar ejercicio ${index + 1}`}
                              onClick={() => removeExerciseRow(draft.rowId)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div
                        className={`grid items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ${
                          draft.noWeight
                            ? "grid-cols-[28px_minmax(80px,1fr)_max-content]"
                            : "grid-cols-[28px_minmax(80px,1fr)_minmax(80px,1fr)_max-content]"
                        }`}
                      >
                        <span>#</span>
                        <span>Reps</span>
                        {!draft.noWeight ? <span>Kg</span> : null}
                        <span />
                      </div>
                      {draft.setRows.map((row, rowIdx) => {
                        const lastLogged =
                          data.lastLoggedSetsByExerciseId?.[draft.exerciseId]?.[
                            rowIdx
                          ];
                        // quick-260714-m57 (#403) — Hevy label: colored
                        // letter for non-normal; number counting ONLY
                        // normal sets otherwise.
                        const rowType = draft.setTypes[rowIdx] ?? "normal";
                        const rowLabel = setDisplayLabels(
                          draft.setRows.map(
                            (_, i) => draft.setTypes[i] ?? "normal",
                          ),
                        )[rowIdx];
                        return (
                          <div
                            key={`${draft.rowId}-${rowIdx}`}
                            className={`mt-1 grid items-start gap-2 ${
                              draft.noWeight
                                ? "grid-cols-[28px_minmax(80px,1fr)_max-content]"
                                : "grid-cols-[28px_minmax(80px,1fr)_minmax(80px,1fr)_max-content]"
                            }`}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  aria-label={`Tipo de la serie ${rowIdx + 1}: ${SET_TYPE_LABELS_ES[rowType]}`}
                                  title="Cambiar tipo de serie"
                                  className={cn(
                                    "mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-muted",
                                    rowType === "normal"
                                      ? "text-muted-foreground"
                                      : cn(
                                          "font-bold",
                                          SET_TYPE_TEXT_CLASS[rowType],
                                        ),
                                  )}
                                >
                                  {rowLabel}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {SET_TYPES.map((type) => (
                                  <DropdownMenuItem
                                    key={type}
                                    onSelect={() =>
                                      setRowType(draft.rowId, rowIdx, type)
                                    }
                                    className={cn(
                                      "gap-2",
                                      type === rowType && "bg-muted",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "w-4 text-center font-semibold",
                                        SET_TYPE_TEXT_CLASS[type],
                                      )}
                                    >
                                      {SET_TYPE_LETTERS[type] ?? "#"}
                                    </span>
                                    {SET_TYPE_LABELS_ES[type]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={row.reps}
                              onChange={(e) =>
                                patchRow(draft.rowId, rowIdx, {
                                  reps: e.target.value,
                                })
                              }
                              className="h-9 rounded-md border bg-background px-2 text-sm"
                            />
                            {!draft.noWeight ? (
                              <div className="flex flex-col gap-0.5">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.kg}
                                  placeholder="Kg"
                                  onChange={(e) =>
                                    patchRow(draft.rowId, rowIdx, {
                                      kg: e.target.value,
                                    })
                                  }
                                  className="h-9 rounded-md border bg-background px-2 text-sm"
                                />
                                {lastLogged ? (
                                  <span className="px-0.5 text-[10px] text-muted-foreground">
                                    Último: {lastLogged.weightKg}kg × {lastLogged.reps}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="flex items-center justify-end gap-1 pt-1">
                              {rowIdx === 0 ? (
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  disabled={draft.setRows.length <= 1}
                                  onClick={() => copyFirstSetToAll(draft.rowId)}
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
                                  patch(draft.rowId, {
                                    setRows: draft.setRows.filter(
                                      (_, i) => i !== rowIdx,
                                    ),
                                    // quick-260714-m57 (#403) — keep types
                                    // aligned with setRows.
                                    setTypes: draft.setRows
                                      .map(
                                        (_, i) =>
                                          draft.setTypes[i] ?? "normal",
                                      )
                                      .filter((_, i) => i !== rowIdx),
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
                          patch(draft.rowId, {
                            setRows: [
                              ...draft.setRows,
                              { reps: last?.reps ?? "0", kg: last?.kg ?? "" },
                            ],
                            // quick-260714-m57 (#403) — a new set starts as
                            // "normal" (values copy from the last row, the
                            // type does not).
                            setTypes: [
                              ...draft.setRows.map(
                                (_, i) => draft.setTypes[i] ?? "normal",
                              ),
                              "normal",
                            ],
                          });
                        }}
                        className="mt-1 inline-flex h-7 items-center gap-1 self-start rounded-md border border-border/70 bg-background px-2 text-xs font-medium hover:border-foreground/30 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Agregar serie
                      </button>
                      <textarea
                        value={draft.notes}
                        onChange={(e) =>
                          patch(draft.rowId, { notes: e.target.value })
                        }
                        placeholder="Notas específicas para este cliente en este ejercicio"
                        className="mt-2 min-h-16 w-full rounded-md border bg-background px-2 py-2 text-sm"
                      />
                      {/* D10 — superset members edit the after-superset rest at
                          the group level (above); hide the per-member field. */}
                      {isInSuperset ? null : (
                      <label className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-100">
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
                            patch(draft.rowId, {
                              transitionRest: e.target.value,
                            })
                          }
                          className="h-8 w-20 rounded-md border border-amber-400/50 bg-background px-2 text-sm text-foreground"
                        />
                      </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {isSeries ? (
            <div className="flex max-w-full flex-col gap-3 text-sm">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Aplicar a
                </span>
                <div className="inline-flex w-fit max-w-full self-start rounded-lg border p-0.5">
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
                        "whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition",
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
              {scope === "series" ? (
                <div className="flex max-w-md flex-col gap-2 rounded-lg border bg-muted/30 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor="assignment-series-end-date"
                    >
                      Fecha de fin de la serie
                    </label>
                    {seriesEndDateChanged ? (
                      <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        Se actualizará
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {END_DATE_PRESET_MONTHS.map((months) => {
                      const presetDate = data
                        ? addCivilMonths(data.scheduledFor, months)
                        : "";
                      const active =
                        seriesEndPresetMonths === months &&
                        seriesEndDate === presetDate;
                      return (
                        <Button
                          key={months}
                          type="button"
                          variant={active ? "default" : "outline"}
                          size="sm"
                          className="h-7 rounded-full px-2 text-xs"
                          aria-pressed={active}
                          disabled={!data}
                          onClick={() => {
                            setSeriesEndPresetMonths(months);
                            setSeriesEndDate(presetDate);
                          }}
                        >
                          {months} meses
                        </Button>
                      );
                    })}
                  </div>
                  <input
                    id="assignment-series-end-date"
                    type="date"
                    value={seriesEndDate}
                    min={data?.scheduledFor ?? ""}
                    onChange={(event) => {
                      const next = event.target.value;
                      setSeriesEndDate(next);
                      setSeriesEndPresetMonths(
                        data
                          ? inferEndDatePresetMonths(data.scheduledFor, next)
                          : null,
                      );
                    }}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Reprograma las ocurrencias futuras hasta esta fecha inclusive.
                  </p>
                </div>
              ) : null}
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
            <Button
              onClick={onSave}
              disabled={
                saving ||
                !data ||
                exercises.some(
                  (row) =>
                    row.exerciseId.trim().length === 0 ||
                    row.name.en.trim().length === 0,
                )
              }
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
