"use client";

// workout-detail-dialog.tsx
//
// Read-only detail view of a single workout assignment, opened when the
// trainer clicks a chip on the month calendar. Shows template name,
// client, date, recurrence info, and the per-exercise sets prescription
// (denormalized snapshot — no extra exercise lookups on the way in).
//
// The "Eliminar" CTA in the footer hands off to the existing
// WorkoutAssignmentDeleteDialog so the recurrence-aware cascade prompt
// is preserved.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Trash2, User } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import {
  getAssignmentDetail,
  type AssignmentDetail,
} from "@/lib/gc-fitness/schedule-month-actions";

import { WorkoutAssignmentDeleteDialog } from "@/components/gc-fitness/workout-assignment-delete-dialog";

interface WorkoutDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  /**
   * Fired after the user confirms a delete and the underlying mutation
   * resolves. Parent invalidates the calendar query in response.
   */
  onDeleted: () => void;
}

const STATUS_LABEL: Record<AssignmentDetail["status"], string> = {
  scheduled: "Programado",
  started: "Iniciado",
  completed: "Completado",
  missed: "No realizado",
};

const STATUS_TONE: Record<AssignmentDetail["status"], string> = {
  scheduled: "bg-muted text-muted-foreground",
  started: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  completed: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  missed: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
};

function recurrenceLabel(recurrence: Record<string, unknown> | null): string | null {
  if (!recurrence || typeof recurrence.kind !== "string") return null;
  const kind = recurrence.kind;
  if (kind === "daily") return "Diaria";
  if (kind === "weekly") return "Semanal";
  if (kind === "weekly_days") return "Semanal · varios días";
  if (kind === "every_n_days") {
    const n = Number(recurrence.everyN ?? 0);
    return Number.isFinite(n) && n > 0 ? `Cada ${n} días` : "Cada N días";
  }
  if (kind === "monthly") {
    const d = Number(recurrence.dayOfMonth ?? 0);
    return Number.isFinite(d) && d > 0 ? `Mensual · día ${d}` : "Mensual";
  }
  if (kind === "single") return "Única";
  return null;
}

export function WorkoutDetailDialog({
  open,
  onOpenChange,
  assignmentId,
  onDeleted,
}: WorkoutDetailDialogProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["assignment-detail", assignmentId],
    queryFn: () => getAssignmentDetail(assignmentId),
    enabled: open,
    staleTime: 30_000,
  });

  // Clear the nested delete dialog when the user closes the parent.
  useEffect(() => {
    if (!open) setDeleteOpen(false);
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span className="truncate">
                {data ? data.templateName : "Detalle del entrenamiento"}
              </span>
              {data ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[data.status]}`}
                >
                  {STATUS_LABEL[data.status]}
                </span>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              Vista de solo lectura del entrenamiento asignado.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
            {isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : error ? (
              <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : "No se pudo cargar el detalle."}
              </p>
            ) : data ? (
              <DetailBody data={data} />
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="sm:mr-auto"
            >
              Cerrar
            </Button>
            <Button
              variant="destructive"
              disabled={!data || isLoading}
              onClick={() => setDeleteOpen(true)}
              className="gap-1"
            >
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {data && deleteOpen ? (
        <WorkoutAssignmentDeleteDialog
          open={deleteOpen}
          onOpenChange={(o) => setDeleteOpen(o)}
          assignmentId={data.id}
          scheduledFor={data.scheduledFor}
          templateName={data.templateName}
          seriesId={data.seriesId}
          onDeleted={() => {
            setDeleteOpen(false);
            onOpenChange(false);
            onDeleted();
          }}
        />
      ) : null}
    </>
  );
}

function DetailBody({ data }: { data: AssignmentDetail }) {
  const recurrence = recurrenceLabel(data.recurrence);

  return (
    <>
      <section className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Cliente
            </p>
            <p className="font-medium">{data.clientName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Fecha
            </p>
            <p className="font-medium">
              {data.scheduledFor}
              {data.scheduledTime ? ` · ${data.scheduledTime}` : ""}
            </p>
          </div>
        </div>
        {data.templateTag ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Etiqueta
            </p>
            <Badge variant="secondary" className="mt-1">
              {data.templateTag}
            </Badge>
          </div>
        ) : null}
        {recurrence ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Recurrencia
            </p>
            <p className="font-medium">{recurrence}</p>
          </div>
        ) : null}
      </section>

      {data.meetingNotes ? (
        <section className="rounded-lg border bg-background p-3 text-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Notas de sesión
          </p>
          <p className="whitespace-pre-wrap">{data.meetingNotes}</p>
        </section>
      ) : null}

      <section>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Ejercicios ({data.exercises.length})
        </p>
        {data.exercises.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Esta plantilla no tiene ejercicios.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.exercises.map((ex, idx) => {
              const prevGroup =
                idx > 0 ? data.exercises[idx - 1].supersetGroup ?? null : null;
              const isSupersetStart =
                ex.supersetGroup !== null && ex.supersetGroup !== prevGroup;
              return (
                <div
                  key={`${ex.exerciseId}-${ex.index}`}
                  className={
                    ex.supersetGroup
                      ? "rounded-md border border-amber-500/40 bg-amber-50/40 p-3 dark:border-amber-400/40 dark:bg-amber-950/20"
                      : "rounded-md border bg-background p-3"
                  }
                >
                  {isSupersetStart ? (
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Superserie {ex.supersetGroup}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{ex.exerciseName}</p>
                    {ex.supersetGroup ? (
                      <span className="inline-flex h-5 items-center rounded-full bg-amber-500/20 px-2 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-400/20 dark:text-amber-200">
                        {ex.supersetGroup}
                      </span>
                    ) : null}
                  </div>
                  <ExerciseSetTable ex={ex} />
                  {ex.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                      {ex.notes}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function ExerciseSetTable({
  ex,
}: {
  ex: AssignmentDetail["exercises"][number];
}) {
  const rows = Array.from({ length: ex.sets }, (_, i) => ({
    setNumber: i + 1,
    reps: ex.repsBySet[i] ?? ex.reps,
    kg: ex.weightBySetKg[i] ?? null,
  }));
  return (
    <div className="mt-2">
      <div className="grid grid-cols-[28px_minmax(60px,1fr)_minmax(60px,1fr)] gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>#</span>
        <span>Reps</span>
        <span>Peso</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.setNumber}
          className="grid grid-cols-[28px_minmax(60px,1fr)_minmax(60px,1fr)] gap-2 border-t py-1 text-xs"
        >
          <span className="text-muted-foreground">{row.setNumber}</span>
          <span className="tabular-nums">{row.reps || "–"}</span>
          <span className="tabular-nums">
            {row.kg !== null ? `${row.kg} kg` : "–"}
          </span>
        </div>
      ))}
      <div className="mt-1 text-[10px] text-muted-foreground">
        Descanso: {ex.rest_seconds}s
      </div>
    </div>
  );
}
