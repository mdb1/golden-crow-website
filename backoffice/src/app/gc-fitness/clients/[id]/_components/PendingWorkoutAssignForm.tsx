"use client";

import { useState } from "react";

interface WorkoutTemplateOption {
  id: string;
  name: string;
}

interface PendingWorkoutAssignFormProps {
  templates: WorkoutTemplateOption[];
  submitAction: (formData: FormData) => Promise<void>;
}

type AssignMode = "once" | "weekly" | "daily" | "everyN";

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
] as const;

export function PendingWorkoutAssignForm({
  templates,
  submitAction,
}: PendingWorkoutAssignFormProps) {
  const [mode, setMode] = useState<AssignMode>("once");
  const isRecurring = mode !== "once";
  const showWeekdays = mode === "weekly";
  const showEveryN = mode === "everyN";

  return (
    <form action={submitAction} className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Template</span>
          <select
            name="templateId"
            required
            className="rounded border bg-background px-3 py-2 text-sm"
          >
            <option value="">Elegí un template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Fecha</span>
          <input
            type="date"
            name="scheduledFor"
            required
            className="rounded border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Modo</span>
          <select
            name="mode"
            className="rounded border bg-background px-3 py-2 text-sm"
            value={mode}
            onChange={(event) => setMode(event.target.value as AssignMode)}
          >
            <option value="once">Una vez</option>
            <option value="weekly">Semanal</option>
            <option value="daily">Diario</option>
            <option value="everyN">Cada N días</option>
          </select>
        </label>

        {showEveryN ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Cada N</span>
            <input
              type="number"
              name="everyN"
              min={2}
              max={30}
              defaultValue={2}
              className="rounded border bg-background px-3 py-2 text-sm"
            />
          </label>
        ) : null}

        {isRecurring ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Fin (opcional)</span>
            <input
              type="date"
              name="endDate"
              className="rounded border bg-background px-3 py-2 text-sm"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hora (opcional)</span>
          <input
            type="time"
            name="scheduledTime"
            className="rounded border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium">Notas (opcional)</span>
          <input
            type="text"
            name="meetingNotes"
            placeholder="Link o detalle de sesión"
            className="rounded border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {showWeekdays ? (
        <fieldset className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Weekdays</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <label
                key={day.value}
                className="inline-flex items-center gap-1 rounded border px-2 py-1"
              >
                <input
                  type="checkbox"
                  name="weekdays"
                  value={String(day.value)}
                  defaultChecked={day.value === 1}
                />
                <span>{day.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Pre-cargar
        </button>
      </div>
    </form>
  );
}
