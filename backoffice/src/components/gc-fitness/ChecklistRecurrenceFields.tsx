"use client";

// ChecklistRecurrenceFields.tsx
//
// Self-contained recurrence controls for a coach reminder, shared by the create
// form and the edit dialog. Renders REAL named form inputs so the host's
// uncontrolled FormData submit picks them up:
//   - <select name="recurrence">              none | daily | weekly | monthly
//   - <input name="recurrenceEndsOn" type=date> end date (any recurrence)
//   - weekday checkboxes name="recurrenceWeekdays" value 1..7 (Mon..Sun) — weekly
//   - month-day checkboxes name="recurrenceMonthDays" value 1..31 — monthly
//
// The day chips are CONTROLLED so we can (a) auto-select today's weekday/day when
// the trainer switches to weekly/monthly with nothing selected, and (b) report
// validity to the host (a weekly/monthly reminder needs ≥1 day) so it can
// disable the submit button. Only the active recurrence's sub-fields are
// mounted, so the host reads exactly the relevant arrays via formData.getAll().

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// Mon=1 … Sun=7 (matches the habit/workout schedule weekday convention).
const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

type Recurrence = "none" | "daily" | "weekly" | "monthly";

export interface ChecklistRecurrenceDefaults {
  recurrence?: Recurrence;
  endsOn?: string | null;
  weekdays?: number[];
  monthDays?: number[];
}

function isoWeekdayToday(): number {
  const g = new Date().getDay(); // 0=Sun … 6=Sat
  return g === 0 ? 7 : g; // → 1=Mon … 7=Sun
}

function ToggleChip({
  name,
  value,
  label,
  checked,
  onToggle,
}: {
  name: string;
  value: number;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={onToggle}
        className="peer sr-only"
      />
      <span
        className={cn(
          "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-input px-2 text-sm tabular-nums transition-colors",
          "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
        )}
      >
        {label}
      </span>
    </label>
  );
}

export function ChecklistRecurrenceFields({
  idPrefix,
  defaults = {},
  onValidityChange,
}: {
  idPrefix: string;
  defaults?: ChecklistRecurrenceDefaults;
  /** Reports whether the current recurrence selection is complete (weekly /
   *  monthly need ≥1 day). The host disables submit when false. */
  onValidityChange?: (valid: boolean) => void;
}) {
  const [recurrence, setRecurrence] = useState<Recurrence>(
    defaults.recurrence ?? "none",
  );
  const [weekdays, setWeekdays] = useState<Set<number>>(
    new Set(defaults.weekdays ?? []),
  );
  const [monthDays, setMonthDays] = useState<Set<number>>(
    new Set(defaults.monthDays ?? []),
  );

  const valid =
    recurrence === "weekly"
      ? weekdays.size > 0
      : recurrence === "monthly"
        ? monthDays.size > 0
        : true;

  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  function changeRecurrence(next: Recurrence) {
    setRecurrence(next);
    // Auto-select today's weekday / day-of-month when there's nothing chosen yet
    // so the reminder is immediately submittable (and the button stays enabled).
    if (next === "weekly" && weekdays.size === 0) {
      setWeekdays(new Set([isoWeekdayToday()]));
    }
    if (next === "monthly" && monthDays.size === 0) {
      setMonthDays(new Set([new Date().getDate()]));
    }
  }

  function toggle(set: Set<number>, value: number): Set<number> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor={`${idPrefix}-recurrence`}>Recurrencia</Label>
        <select
          id={`${idPrefix}-recurrence`}
          name="recurrence"
          value={recurrence}
          onChange={(e) => changeRecurrence(e.target.value as Recurrence)}
          className={SELECT_CLASS}
        >
          <option value="none">Única</option>
          <option value="daily">Diaria</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
        </select>
      </div>

      {recurrence !== "none" ? (
        <div className="grid gap-3 rounded-md border border-border/70 bg-muted/30 p-3">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor={`${idPrefix}-ends`}>Fecha de fin (opcional)</Label>
            <Input
              id={`${idPrefix}-ends`}
              name="recurrenceEndsOn"
              type="date"
              defaultValue={defaults.endsOn ?? ""}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Dejá vacío para que se repita sin fin.
            </p>
          </div>

          {recurrence === "weekly" ? (
            <div className="grid gap-2">
              <Label>Días de la semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => (
                  <ToggleChip
                    key={d.value}
                    name="recurrenceWeekdays"
                    value={d.value}
                    label={d.label}
                    checked={weekdays.has(d.value)}
                    onToggle={() => setWeekdays((s) => toggle(s, d.value))}
                  />
                ))}
              </div>
              {!valid ? (
                <p className="text-xs text-destructive">
                  Elegí al menos un día.
                </p>
              ) : null}
            </div>
          ) : null}

          {recurrence === "monthly" ? (
            <div className="grid gap-2">
              <Label>Días del mes</Label>
              <div className="flex flex-wrap gap-1.5">
                {MONTH_DAYS.map((d) => (
                  <ToggleChip
                    key={d}
                    name="recurrenceMonthDays"
                    value={d}
                    label={String(d)}
                    checked={monthDays.has(d)}
                    onToggle={() => setMonthDays((s) => toggle(s, d))}
                  />
                ))}
              </div>
              {!valid ? (
                <p className="text-xs text-destructive">
                  Elegí al menos un día.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
