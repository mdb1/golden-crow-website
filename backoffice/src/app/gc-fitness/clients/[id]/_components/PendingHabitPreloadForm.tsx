"use client";

import { useMemo, useState } from "react";

type HabitType = "binary" | "multi-choice" | "numeric" | "weight";
type HabitScheduleType = "one-time" | "recurring";
type HabitCadence = "daily" | "weekly" | "monthly";

interface HabitTemplateOption {
  id: string;
  label: string;
  type: HabitType;
}

interface PendingHabitPreloadFormProps {
  templates: HabitTemplateOption[];
  submitAction: (formData: FormData) => Promise<void>;
}

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
] as const;

function todayCivilDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function PendingHabitPreloadForm({
  templates,
  submitAction,
}: PendingHabitPreloadFormProps) {
  const [templateId, setTemplateId] = useState("");
  const [type, setType] = useState<HabitType>("binary");
  const [scheduleType, setScheduleType] = useState<HabitScheduleType>("recurring");
  const [scheduleCadence, setScheduleCadence] = useState<HabitCadence>("daily");
  const [monthDays, setMonthDays] = useState<number[]>([1]);

  const startsOnDefault = useMemo(() => todayCivilDate(), []);
  const templateMode = templateId.length > 0;
  const selectedTemplateType = templateMode
    ? templates.find((template) => template.id === templateId)?.type
    : undefined;
  const effectiveType = selectedTemplateType ?? type;
  const showOptions = effectiveType === "multi-choice";
  const showTarget = effectiveType === "numeric";
  const showUnit = effectiveType === "numeric" || effectiveType === "weight";
  const showCadence = scheduleType === "recurring";
  const showWeekdays = showCadence && scheduleCadence === "weekly";
  const showMonthDay = showCadence && scheduleCadence === "monthly";

  return (
    <form action={submitAction} className="flex flex-col gap-4">
      <div className="grid gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hábito existente (opcional)</span>
          <select
            name="templateId"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="rounded border bg-background px-3 py-2 text-sm"
          >
            <option value="">Crear uno nuevo…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Si elegís un hábito existente, se ignoran los campos de abajo y se pre-carga ese template.
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {!templateMode ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Nombre del hábito</span>
                <input
                  type="text"
                  name="name"
                  required
                  minLength={1}
                  maxLength={80}
                  placeholder="Ej: 10 minutos de meditación"
                  className="rounded border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Tipo</span>
                <select
                  name="type"
                  value={type}
                  onChange={(event) => setType(event.target.value as HabitType)}
                  className="rounded border bg-background px-3 py-2 text-sm"
                >
                  <option value="binary">Binary</option>
                  <option value="multi-choice">Multi-choice</option>
                  <option value="numeric">Numeric</option>
                  <option value="weight">Weight</option>
                </select>
              </label>
            </>
          ) : (
            <input type="hidden" name="type" value={effectiveType} />
          )}
          {showOptions ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Opciones (coma separadas)</span>
              <input
                type="text"
                name="options"
                placeholder="Alta, Media, Baja"
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
          ) : null}
          {showTarget ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Target</span>
              <input
                type="number"
                name="targetValue"
                step="any"
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
          ) : null}
          {showUnit ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Unidad</span>
              <input
                type="text"
                name="unit"
                placeholder="kg, reps, min..."
                className="rounded border bg-background px-3 py-2 text-sm"
              />
            </label>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Tipo de recurrencia</span>
            <select
              name="scheduleType"
              value={scheduleType}
              onChange={(event) => setScheduleType(event.target.value as HabitScheduleType)}
              className="rounded border bg-background px-3 py-2 text-sm"
            >
              <option value="recurring">Recurrente</option>
              <option value="one-time">Una vez</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Inicio</span>
            <input
              type="date"
              name="startsOn"
              defaultValue={startsOnDefault}
              className="rounded border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Fin (opcional)</span>
            <input
              type="date"
              name="endsOn"
              className="rounded border bg-background px-3 py-2 text-sm"
            />
          </label>
          {showCadence ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Cadencia</span>
              <select
                name="scheduleCadence"
                value={scheduleCadence}
                onChange={(event) => {
                  const next = event.target.value as HabitCadence;
                  setScheduleCadence(next);
                  if (next === "monthly" && monthDays.length === 0) {
                    setMonthDays([1]);
                  }
                }}
                className="rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="daily">Diaria</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </label>
          ) : null}
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
                    name="scheduleWeekdays"
                    value={String(day.value)}
                    defaultChecked={day.value === 1}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {showMonthDay ? (
          <fieldset className="flex flex-col gap-2 text-sm">
            <span className="font-medium">Días del mes</span>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 31 }, (_, idx) => idx + 1).map((day) => {
                const active = monthDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setMonthDays((current) => {
                        const next = current.includes(day)
                          ? current.filter((d) => d !== day)
                          : [...current, day].sort((a, b) => a - b);
                        return next.length > 0 ? next : [1];
                      });
                    }}
                    className={`rounded border px-2 py-1 text-xs ${active ? "bg-primary text-primary-foreground" : "bg-background"}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            {monthDays.map((day) => (
              <input key={day} type="hidden" name="scheduleMonthDays" value={String(day)} />
            ))}
          </fieldset>
        ) : null}
      </div>

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
