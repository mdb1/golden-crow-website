"use client";

// habit-detail-dialog.tsx
//
// Read-only detail of a single habit occurrence, opened when the trainer taps
// a habit chip on the month calendar. Shows the habit's name, type and full
// recurrence, plus two destructive actions:
//
//   • "Quitar de este día"  → skipHabitOccurrence (adds civilDate to the
//     habit's skippedDates; recurring habits only).
//   • "Eliminar el hábito"  → deleteHabitRecurrenceFromDate (caps endsOn to
//     the day before the tapped civilDate — removes the tapped day forward,
//     keeps past occurrences + logs intact).
//
// Mirrors WorkoutDetailDialog's structure (useQuery load + confirm-then-mutate
// footer). Each destructive action requires an inline confirm tap.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, CalendarDays, CalendarOff, Pencil, Repeat, Trash2, User } from "lucide-react";
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
import { StorageImagePreview } from "@/components/gc-fitness/StorageImagePreview";
import {
  getHabit,
  skipHabitOccurrence,
  deleteHabitRecurrenceFromDate,
  type HabitRow,
} from "@/lib/gc-fitness/habit-actions";

interface HabitDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habitId: string;
  civilDate: string; // the tapped day, YYYY-MM-DD
  clientName: string;
  /** Fired after a skip/delete resolves so the parent can invalidate. */
  onChanged: () => void;
}

// Habits are binary-only (yes/no) now.
const HABIT_TYPE_LABEL = "Sí / no";

const WEEKDAY_SHORT = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Reminder weekdays use Apple's Calendar convention (Sun=1 … Sat=7) — the iOS
// reminder editor writes DateComponents.weekday — which differs from the
// schedule weekdays (ISO Mon=1). Keep a separate map so labels are correct.
const REMINDER_WEEKDAY_SHORT = ["", "Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function reminderLabel(h: HabitRow): string {
  if (!h.reminderEnabled) return "Desactivado";
  const time = h.reminderTime ?? "—";
  const cadence = h.reminderCadence ?? "daily";
  if (cadence === "weekly") {
    const days = (h.reminderWeekdays ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((n) => REMINDER_WEEKDAY_SHORT[n] ?? String(n))
      .join(", ");
    return days ? `${time} · ${days}` : `${time} · Semanal`;
  }
  if (cadence === "monthly") {
    const monthDays =
      h.reminderMonthDays ??
      (typeof h.reminderDayOfMonth === "number" ? [h.reminderDayOfMonth] : []);
    return monthDays.length
      ? `${time} · día ${monthDays.slice().sort((a, b) => a - b).join(", ")}`
      : `${time} · Mensual`;
  }
  return `${time} · Diario`;
}

function recurrenceLabel(h: HabitRow): string {
  if (h.scheduleType === "one-time") return "Única";
  const cadence = h.scheduleCadence ?? "daily";
  if (cadence === "daily") return "Diaria";
  if (cadence === "weekly") {
    const days = (h.scheduleWeekdays ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((n) => WEEKDAY_SHORT[n] ?? String(n))
      .join(", ");
    return days ? `Semanal · ${days}` : "Semanal";
  }
  const monthDays =
    h.scheduleMonthDays ??
    (typeof h.scheduleDayOfMonth === "number" ? [h.scheduleDayOfMonth] : []);
  return monthDays.length
    ? `Mensual · día ${monthDays.slice().sort((a, b) => a - b).join(", ")}`
    : "Mensual";
}

export function HabitDetailDialog({
  open,
  onOpenChange,
  habitId,
  civilDate,
  clientName,
  onChanged,
}: HabitDetailDialogProps) {
  const [confirm, setConfirm] = useState<null | "skip" | "delete">(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["habit-detail", habitId],
    queryFn: () => getHabit(habitId),
    enabled: open,
    staleTime: 30_000,
  });

  // Reset the inline confirm when the dialog closes.
  useEffect(() => {
    if (!open) setConfirm(null);
  }, [open]);

  const skipMutation = useMutation({
    mutationFn: () => skipHabitOccurrence({ habitId, civilDate }),
    onSuccess: () => {
      toast.success("Quitado de este día");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudo quitar"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteHabitRecurrenceFromDate(habitId, civilDate),
    onSuccess: () => {
      toast.success("Hábito eliminado desde este día en adelante");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar"),
  });

  const pending = skipMutation.isPending || deleteMutation.isPending;
  const isRecurring = data ? data.scheduleType !== "one-time" : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate">
            {data ? data.name.en || data.name.es : "Detalle del hábito"}
          </DialogTitle>
          <DialogDescription>
            {data?.name.es && data.name.es !== data.name.en
              ? data.name.es
              : "Hábito asignado al cliente."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error instanceof Error
                ? error.message
                : "No se pudo cargar el hábito."}
            </p>
          ) : data ? (
            <>
            {data.photoUrl ? (
              <div className="flex justify-center rounded-lg border bg-muted/40 p-3">
                <StorageImagePreview
                  value={data.photoUrl}
                  alt={data.name.es || data.name.en}
                />
              </div>
            ) : null}
            <section className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <User className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Cliente
                  </p>
                  <p className="font-medium">{clientName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Día
                  </p>
                  <p className="font-medium">{civilDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Repeat className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Recurrencia
                  </p>
                  <p className="font-medium">{recurrenceLabel(data)}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Tipo
                </p>
                <p className="font-medium">{HABIT_TYPE_LABEL}</p>
              </div>
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Recordatorio
                  </p>
                  <p className="font-medium">{reminderLabel(data)}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Vigencia
                </p>
                <p className="font-medium">
                  {data.startsOn}
                  {data.endsOn ? ` → ${data.endsOn}` : " → sin fin"}
                </p>
              </div>
            </section>
            </>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch sm:space-x-0">
          {confirm === "skip" ? (
            <ConfirmRow
              label={`Quitar el hábito solo del ${civilDate}.`}
              confirmLabel="Quitar de este día"
              pending={skipMutation.isPending}
              onConfirm={() => skipMutation.mutate()}
              onCancel={() => setConfirm(null)}
            />
          ) : confirm === "delete" ? (
            <ConfirmRow
              label={`Elimina el hábito desde el ${civilDate} en adelante. El historial anterior se conserva.`}
              confirmLabel="Eliminar el hábito"
              pending={deleteMutation.isPending}
              onConfirm={() => deleteMutation.mutate()}
              onCancel={() => setConfirm(null)}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                asChild
                variant="outline"
                className="gap-1"
                disabled={!data || pending}
              >
                <Link href={`/gc-fitness/habits/${habitId}/edit`}>
                  <Pencil className="size-4" />
                  Editar hábito
                </Link>
              </Button>
              {isRecurring ? (
                <Button
                  variant="outline"
                  className="gap-1"
                  disabled={!data || pending}
                  onClick={() => setConfirm("skip")}
                >
                  <CalendarOff className="size-4" />
                  Quitar de este día
                </Button>
              ) : null}
              <Button
                variant="destructive"
                className="gap-1"
                disabled={!data || pending}
                onClick={() => setConfirm("delete")}
              >
                <Trash2 className="size-4" />
                {isRecurring ? "Eliminar el hábito (desde este día)" : "Eliminar el hábito"}
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmRow({
  label,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  label: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          className="flex-1"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Aplicando…" : confirmLabel}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
