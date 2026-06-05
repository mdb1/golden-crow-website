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
// Only the currently-selected recurrence's sub-fields are mounted, so the host
// reads exactly the relevant arrays via formData.getAll(...).

import { useState } from "react";

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

export interface ChecklistRecurrenceDefaults {
  recurrence?: "none" | "daily" | "weekly" | "monthly";
  endsOn?: string | null;
  weekdays?: number[];
  monthDays?: number[];
}

function Chip({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: number;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
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
}: {
  idPrefix: string;
  defaults?: ChecklistRecurrenceDefaults;
}) {
  const [recurrence, setRecurrence] = useState(defaults.recurrence ?? "none");
  const weekdaySet = new Set(defaults.weekdays ?? []);
  const monthDaySet = new Set(defaults.monthDays ?? []);

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor={`${idPrefix}-recurrence`}>Recurrencia</Label>
        <select
          id={`${idPrefix}-recurrence`}
          name="recurrence"
          value={recurrence}
          onChange={(e) =>
            setRecurrence(e.target.value as ChecklistRecurrenceDefaults["recurrence"] & string)
          }
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
                  <Chip
                    key={d.value}
                    name="recurrenceWeekdays"
                    value={d.value}
                    label={d.label}
                    defaultChecked={weekdaySet.has(d.value)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {recurrence === "monthly" ? (
            <div className="grid gap-2">
              <Label>Días del mes</Label>
              <div className="flex flex-wrap gap-1.5">
                {MONTH_DAYS.map((d) => (
                  <Chip
                    key={d}
                    name="recurrenceMonthDays"
                    value={d}
                    label={String(d)}
                    defaultChecked={monthDaySet.has(d)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
