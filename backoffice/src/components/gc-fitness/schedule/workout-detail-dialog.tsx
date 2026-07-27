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

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Download,
  MessageCircle,
  Pencil,
  Play,
  Repeat,
  Trash2,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";

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
import {
  getWorkoutLogDetailByAssignment,
  type WorkoutLogDetail,
} from "@/lib/gc-fitness/recent-logs-actions";

import {
  ShareAssignmentCard,
  ShareWorkoutCard,
} from "@/components/gc-fitness/share-workout-card";
import { getSupersetGroupRest } from "@/lib/gc-fitness/superset-groups";
import {
  SET_TYPE_LABELS_ES,
  SET_TYPE_TEXT_CLASS,
  plannedSetType,
  setDisplayLabels,
} from "@/lib/gc-fitness/set-type";
import { WorkoutLogDetailView } from "@/components/gc-fitness/workout-log-detail-view";
import { WorkoutAssignmentDeleteDialog } from "@/components/gc-fitness/workout-assignment-delete-dialog";
import { WorkoutAssignmentEditDialog } from "./workout-assignment-edit-dialog";
import { WorkoutRecurrenceEditDialog } from "./workout-recurrence-edit-dialog";

interface WorkoutDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  /**
   * Fired after the user confirms a delete OR saves an edit and the underlying
   * mutation resolves. Parent invalidates the calendar query in response.
   */
  onDeleted: () => void;
}

const STATUS_LABEL: Record<AssignmentDetail["status"], string> = {
  scheduled: "Programado",
  started: "Programado",
  completed: "Completado",
  missed: "No realizado",
};

const STATUS_TONE: Record<AssignmentDetail["status"], string> = {
  scheduled: "bg-muted text-muted-foreground",
  started: "bg-muted text-muted-foreground",
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
  const [editOpen, setEditOpen] = useState(false);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  // Issue #449 — same key the calendar chips' badge uses, so the wording
  // stays identical ("Created by the client" / "Creado por el cliente").
  const tCal = useTranslations("schedule.calendar");

  const { data, isLoading, error } = useQuery({
    queryKey: ["assignment-detail", assignmentId],
    queryFn: () => getAssignmentDetail(assignmentId),
    enabled: open,
    staleTime: 30_000,
  });

  const displayStatus = data?.status === "started" ? "scheduled" : data?.status ?? null;

  // When the assignment is completed we share the LOGGED actuals (mirroring
  // iOS), so fetch the workout log by its assignmentId FK. Only runs while the
  // dialog is open AND the assignment is completed; otherwise the prescribed
  // card is shared straight from the already-loaded AssignmentDetail.
  const isCompleted = data?.status === "completed";
  const { data: logDetail, isLoading: isLogLoading } = useQuery({
    queryKey: ["assignment-log-detail", assignmentId],
    queryFn: () => getWorkoutLogDetailByAssignment(assignmentId),
    enabled: open && isCompleted,
    staleTime: 30_000,
  });

  // Clear the nested dialogs when the user closes the parent.
  useEffect(() => {
    if (!open) {
      setDeleteOpen(false);
      setEditOpen(false);
      setRecurrenceOpen(false);
    }
  }, [open]);

  // Issue #449 — client self-assigned workouts (trainerId === clientId) open
  // READ-ONLY: the coach views the prescription but does not manage it, so
  // every mutating CTA (edit / recurrence / delete) and the coach-owned
  // "Iniciar entrenamiento" live-session entry are hidden.
  const isSelfAssigned = data?.selfAssigned === true;

  // "Editar recurrencia" only applies to a recurring series (seriesId set) that
  // still has upcoming occurrences — i.e. scheduled or started, not a finished
  // (completed/missed) one. Single assignments have no recurrence to change.
  const canEditRecurrence =
    !isSelfAssigned &&
    Boolean(data?.seriesId) &&
    data?.status !== "completed" &&
    data?.status !== "missed";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="max-w-full whitespace-normal break-words text-left leading-tight sm:min-w-0 sm:truncate">
                {data ? data.templateName : "Detalle del entrenamiento"}
              </span>
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                {data ? (
                  <ShareCardSlot
                    data={data}
                    isCompleted={isCompleted}
                    isLogLoading={isLogLoading}
                    logDetail={logDetail ?? null}
                  />
                ) : null}
                {data ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="gap-1"
                  >
                    <Link href={`/gc-fitness/chat?chatId=${data.clientId}`}>
                      <MessageCircle className="h-4 w-4" />
                      Abrir chat
                    </Link>
                  </Button>
                ) : null}
                {isSelfAssigned ? (
                  // Issue #449 — marks the workout as client-created (same
                  // wording as the calendar chip's User badge).
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <User className="size-3" />
                    {tCal("clientCreatedBadge")}
                  </span>
                ) : null}
                {data ? (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[displayStatus ?? "scheduled"]}`}
                  >
                    {STATUS_LABEL[displayStatus ?? "scheduled"]}
                  </span>
                ) : null}
              </div>
            </DialogTitle>
            <DialogDescription>
              {isCompleted
                ? "Detalle del entrenamiento realizado."
                : "Vista de solo lectura del entrenamiento asignado."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
            {isLoading || (isCompleted && isLogLoading) ? (
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
            ) : isCompleted && logDetail ? (
              // Completed → THE single canonical "real workout" detail (logged
              // actuals), mirroring the Recent Logs page. Falls back to the
              // prescribed body only when the log fetch returns null (completed
              // flag but no log doc — an edge case).
              <WorkoutLogDetailView detail={logDetail} />
            ) : data ? (
              <DetailBody data={data} />
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="sm:mr-auto"
            >
              Cerrar
            </Button>
            {data &&
            !isSelfAssigned &&
            data.status !== "completed" &&
            data.status !== "missed" ? (
              <Button asChild className="gap-1">
                <Link
                  href={`/gc-fitness/clients/${data.clientId}/sessions/${data.id}/run`}
                >
                  <Play className="size-4" />
                  {data.status === "started"
                    ? "Seguir entrenamiento"
                    : "Iniciar entrenamiento"}
                </Link>
              </Button>
            ) : null}
            {canEditRecurrence ? (
              <Button
                variant="outline"
                disabled={!data || isLoading}
                onClick={() => setRecurrenceOpen(true)}
                className="gap-1"
              >
                <Repeat className="size-4" />
                Editar recurrencia
              </Button>
            ) : null}
            {!isSelfAssigned ? (
              <Button
                variant="outline"
                disabled={!data || isLoading}
                onClick={() => setEditOpen(true)}
                className="gap-1"
              >
                <Pencil className="size-4" />
                Editar
              </Button>
            ) : null}
            {!isSelfAssigned ? (
              <Button
                variant="destructive"
                disabled={!data || isLoading}
                onClick={() => setDeleteOpen(true)}
                className="gap-1"
              >
                <Trash2 className="size-4" />
                Eliminar
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {data && editOpen ? (
        <WorkoutAssignmentEditDialog
          open={editOpen}
          onOpenChange={(o) => setEditOpen(o)}
          assignmentId={data.id}
          onSaved={() => {
            setEditOpen(false);
            onOpenChange(false);
            onDeleted();
          }}
        />
      ) : null}

      {data && recurrenceOpen ? (
        <WorkoutRecurrenceEditDialog
          open={recurrenceOpen}
          onOpenChange={(o) => setRecurrenceOpen(o)}
          assignmentId={data.id}
          scheduledFor={data.scheduledFor}
          recurrence={data.recurrence}
          seriesEndDate={data.seriesEndDate}
          onSaved={() => {
            setRecurrenceOpen(false);
            onOpenChange(false);
            onDeleted();
          }}
        />
      ) : null}

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

/**
 * Renders the "Compartir imagen" share card in the dialog header, choosing the
 * variant the way iOS does:
 *   - completed assignment → share the LOGGED actuals (ShareWorkoutCard) once
 *     the log query resolves; show a disabled spinner button while it loads.
 *     If the log fetch returns null (completed flag but no log doc — an edge
 *     case), fall back to the prescribed card.
 *   - otherwise (scheduled/started/missed) → share the PRESCRIBED card built
 *     from the already-loaded AssignmentDetail.
 */
function ShareCardSlot({
  data,
  isCompleted,
  isLogLoading,
  logDetail,
}: {
  data: AssignmentDetail;
  isCompleted: boolean;
  isLogLoading: boolean;
  logDetail: WorkoutLogDetail | null;
}) {
  const t = useTranslations("recentLogs.workoutDetail");

  // Completed: keep a disabled spinner button while the actuals log loads.
  if (isCompleted && isLogLoading) {
    return (
      <Button variant="outline" size="sm" className="gap-1" disabled>
        <Download className="h-4 w-4 animate-pulse" />
        {t("shareLoading")}
      </Button>
    );
  }

  // Completed with a resolved log → share the logged actuals.
  if (isCompleted && logDetail) {
    return <ShareWorkoutCard detail={logDetail} />;
  }

  // Not completed, OR completed-but-no-log (edge fallback) → prescribed card.
  return <ShareAssignmentCard assignment={data} />;
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
              const nextGroup =
                idx < data.exercises.length - 1
                  ? data.exercises[idx + 1].supersetGroup ?? null
                  : null;
              const group = ex.supersetGroup ?? null;
              const isSupersetStart = group !== null && group !== prevGroup;
              // A REAL superset needs an adjacent same-label sibling. Only then
              // do we collapse rest to ONE group line (D10); a lone labelled
              // exercise keeps its own per-exercise rest line.
              const isRealSupersetMember =
                group !== null && (group === prevGroup || group === nextGroup);
              const isBlockEnd = isRealSupersetMember && group !== nextGroup;
              // D1 canonical group round rest = the block's last member's rest.
              const groupRoundRest = isRealSupersetMember
                ? getSupersetGroupRest(data.exercises, group).roundRestSeconds
                : null;
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
                  <ExerciseSetTable ex={ex} hideRest={isRealSupersetMember} />
                  {ex.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                      {ex.notes}
                    </p>
                  ) : null}
                  {/* D10 — one group rest line for the whole superset block. */}
                  {isBlockEnd && groupRoundRest !== null ? (
                    <p className="mt-2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      Descanso de la superserie: {groupRoundRest}s
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
  hideRest = false,
}: {
  ex: AssignmentDetail["exercises"][number];
  /** Suppress the per-exercise rest line — superset members show ONE group rest
   *  line at the block level instead (D10). */
  hideRest?: boolean;
}) {
  // 26-03 — Widen row shape for the time branch per PATTERNS.md §18.
  // The header column + the body cell both swap between Reps and Seg
  // based on `ex.metric`. Hardcoded Spanish strings match the file's
  // existing convention (this dialog is not yet `t()`-translated; the
  // 26-07 i18n pass will lift them into messages/{es,en}.json).
  // 260610-j67 (issue #159) — when the exercise carries the explicit
  // no-weight sentinel (weightBySetKg was an empty array = reps-only /
  // bodyweight), drop the Peso column entirely so the detail reads reps-only
  // with NO "kg" label. Legacy (nil) + weighted exercises keep the column.
  const noWeight = ex.metric === "time" || ex.hasExplicitNoWeightPrescription;
  // #582 — planned per-set types + Hevy display labels, the twin of iOS
  // `WorkoutAssignmentDetailView.setRows` (SetType.planned → SetTypeDisplay
  // .labels). Non-normal sets render their colored letter INSTEAD of a number,
  // and normal sets number counting only normals — so W/F/D are visible on the
  // read-only detail exactly as they are in the client's app.
  const setTypes = Array.from({ length: ex.sets }, (_, i) =>
    plannedSetType(i, ex.setTypesBySet),
  );
  const setLabels = setDisplayLabels(setTypes);
  const rows = Array.from({ length: ex.sets }, (_, i) => ({
    setNumber: i + 1,
    setType: setTypes[i],
    label: setLabels[i],
    reps: ex.repsBySet[i] ?? ex.reps,
    kg: ex.weightBySetKg[i] ?? null,
    durationSeconds:
      ex.durationBySetSeconds[i] ?? ex.durationSeconds ?? null,
  }));
  const gridCols = noWeight
    ? "grid-cols-[28px_minmax(60px,1fr)]"
    : "grid-cols-[28px_minmax(60px,1fr)_minmax(60px,1fr)]";
  return (
    <div className="mt-2">
      <div
        className={`grid ${gridCols} gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground`}
      >
        <span>#</span>
        {/* TODO(26-07): i18n for Reps/Seg header */}
        <span>{ex.metric === "time" ? "Seg" : "Reps"}</span>
        {!noWeight ? <span>Peso</span> : null}
      </div>
      {rows.map((row) => (
        <div
          key={row.setNumber}
          className={`grid ${gridCols} gap-2 border-t py-1 text-xs`}
        >
          <span
            className={
              row.setType === "normal"
                ? "text-muted-foreground"
                : `font-bold ${SET_TYPE_TEXT_CLASS[row.setType]}`
            }
            title={
              row.setType === "normal"
                ? undefined
                : SET_TYPE_LABELS_ES[row.setType]
            }
          >
            {row.label}
          </span>
          <span className="tabular-nums">
            {ex.metric === "time"
              ? row.durationSeconds !== null
                ? `${row.durationSeconds}s`
                : "–"
              : row.reps || "–"}
          </span>
          {!noWeight ? (
            <span className="tabular-nums">
              {row.kg !== null ? `${row.kg} kg` : "–"}
            </span>
          ) : null}
        </div>
      ))}
      {hideRest ? null : (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Descanso: {ex.rest_seconds}s
        </div>
      )}
    </div>
  );
}
