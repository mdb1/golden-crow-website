"use client";

// workout-recurrence-edit-dialog.tsx
//
// Edits the cadence of a RECURRING workout series "from this occurrence
// forward" (de aquí en adelante). Opened from the read-only detail dialog's
// "Editar recurrencia" CTA, which only renders it for scheduled/started
// occurrences that carry a `seriesId`.
//
// The picker mirrors the recurrence section of assign-template-modal.tsx
// (mode + weekday chips + every-N + monthly) but is standalone and seeded from
// the occurrence's current recurrence rule. On save it calls
// editAssignmentRecurrence, which deletes the future scheduled docs in the
// series and re-expands the new rule over the same window (preserving past /
// completed occurrences). Copy is hardcoded Spanish to match the detail
// dialog's existing convention (the 26-07 i18n pass will lift both together).

import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { editAssignmentRecurrence } from "@/lib/gc-fitness/workout-assignment-actions";

type Mode = "weekly" | "daily" | "everyN" | "monthly";

type RecurrenceRule =
  | { kind: "daily" }
  | { kind: "weekly"; weekday: number }
  | { kind: "weekly_days"; weekdays: number[] }
  | { kind: "every_n_days"; everyN: number }
  | { kind: "monthly"; dayOfMonth: number };

interface WorkoutRecurrenceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  /** The viewed occurrence's civil date "YYYY-MM-DD" — the "from here" cutoff. */
  scheduledFor: string;
  /** The occurrence's current recurrence rule (used to seed the picker). */
  recurrence: Record<string, unknown> | null;
  onSaved: () => void;
}

// Weekday short labels, Sunday-first to match WEEKDAY_KEYS indexing in the
// assign modal (0 = Sunday … 6 = Saturday).
const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "YYYY-MM-DD" → day-of-month (1..31), or 1 when the date is malformed. */
function dayOfMonthFromCivil(civil: string): number {
  const parts = civil.split("-");
  const d = Number(parts[2]);
  return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1;
}

/** Derive the initial picker state from the occurrence's current recurrence. */
function seedFromRecurrence(
  recurrence: Record<string, unknown> | null,
  scheduledFor: string,
): { mode: Mode; weekdays: Set<number>; everyN: number } {
  const fallbackWeekday = (() => {
    const [y, m, d] = scheduledFor.split("-").map(Number);
    if (!y || !m || !d) return 1;
    return new Date(y, m - 1, d).getDay();
  })();
  const kind = recurrence?.kind;
  if (kind === "daily") {
    return { mode: "daily", weekdays: new Set([fallbackWeekday]), everyN: 2 };
  }
  if (kind === "every_n_days") {
    const n = Number(recurrence?.everyN);
    return {
      mode: "everyN",
      weekdays: new Set([fallbackWeekday]),
      everyN: Number.isFinite(n) ? Math.max(2, Math.min(30, n)) : 2,
    };
  }
  if (kind === "monthly") {
    return { mode: "monthly", weekdays: new Set([fallbackWeekday]), everyN: 2 };
  }
  if (kind === "weekly_days" && Array.isArray(recurrence?.weekdays)) {
    const days = (recurrence!.weekdays as unknown[])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    return {
      mode: "weekly",
      weekdays: new Set(days.length ? days : [fallbackWeekday]),
      everyN: 2,
    };
  }
  if (kind === "weekly" && Number.isInteger(Number(recurrence?.weekday))) {
    return {
      mode: "weekly",
      weekdays: new Set([Number(recurrence!.weekday)]),
      everyN: 2,
    };
  }
  // Unknown / single → default to a weekly picker seeded on the occurrence day.
  return { mode: "weekly", weekdays: new Set([fallbackWeekday]), everyN: 2 };
}

export function WorkoutRecurrenceEditDialog({
  open,
  onOpenChange,
  assignmentId,
  scheduledFor,
  recurrence,
  onSaved,
}: WorkoutRecurrenceEditDialogProps) {
  const seed = useMemo(
    () => seedFromRecurrence(recurrence, scheduledFor),
    [recurrence, scheduledFor],
  );
  const [mode, setMode] = useState<Mode>(seed.mode);
  const [weekdays, setWeekdays] = useState<Set<number>>(seed.weekdays);
  const [everyN, setEveryN] = useState<number>(seed.everyN);
  const [everyNDraft, setEveryNDraft] = useState<string>(String(seed.everyN));
  const [pending, setPending] = useState(false);

  function toggleWeekday(idx: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  function buildRule(): RecurrenceRule | null {
    if (mode === "daily") return { kind: "daily" };
    if (mode === "everyN") return { kind: "every_n_days", everyN };
    if (mode === "monthly") {
      return { kind: "monthly", dayOfMonth: dayOfMonthFromCivil(scheduledFor) };
    }
    // weekly
    const sorted = Array.from(weekdays).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    return sorted.length === 1
      ? { kind: "weekly", weekday: sorted[0] }
      : { kind: "weekly_days", weekdays: sorted };
  }

  async function handleSave() {
    const rule = buildRule();
    if (!rule) {
      toast.error("Elegí al menos un día de la semana.");
      return;
    }
    setPending(true);
    try {
      const result = await editAssignmentRecurrence(assignmentId, {
        recurrence: rule,
      });
      toast.success(
        `Recurrencia actualizada · ${result.createdCount} ${
          result.createdCount === 1 ? "fecha" : "fechas"
        } reprogramada${result.createdCount === 1 ? "" : "s"}.`,
      );
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la recurrencia.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return; // block close while in flight
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar recurrencia</DialogTitle>
          <DialogDescription>
            Cambia los días desde esta fecha en adelante. Las ocurrencias
            pasadas y completadas no se modifican.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Frecuencia</label>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as Mode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="daily">Diaria</SelectItem>
                <SelectItem value="everyN">Cada N días</SelectItem>
                <SelectItem value="monthly">Mensual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "weekly" ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Repetir los días</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_SHORT.map((label, idx) => {
                  const active = weekdays.has(idx);
                  return (
                    <Button
                      key={label}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleWeekday(idx)}
                      aria-pressed={active}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mode === "everyN" ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="recur-every-n">
                Repetir cada
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="recur-every-n"
                  type="number"
                  min={2}
                  max={30}
                  value={everyNDraft}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setEveryNDraft(raw);
                    if (raw.trim() === "") return;
                    const next = Number(raw);
                    if (!Number.isFinite(next)) return;
                    setEveryN(Math.max(2, Math.min(30, next)));
                  }}
                  onBlur={() => {
                    const next = Number(everyNDraft);
                    const normalized = Number.isFinite(next)
                      ? Math.max(2, Math.min(30, next))
                      : everyN;
                    setEveryN(normalized);
                    setEveryNDraft(String(normalized));
                  }}
                  className="h-10 w-24 rounded-md border bg-background px-3 text-sm"
                />
                <span className="text-sm text-muted-foreground">días</span>
              </div>
            </div>
          ) : null}

          {mode === "monthly" ? (
            <p className="text-xs text-muted-foreground">
              Se repetirá el día {dayOfMonthFromCivil(scheduledFor)} de cada mes.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="sm:mr-auto"
          >
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
