"use client";

import { useEffect, useRef, useState } from "react";
import {
  addCivilMonths,
  END_DATE_PRESET_MONTHS,
  type EndDatePresetMonths,
} from "@/lib/gc-fitness/end-date-presets";

// Habits are binary-only (yes/no) now.
type HabitScheduleType = "one-time" | "recurring";
type HabitCadence = "daily" | "weekly" | "monthly";

interface HabitTemplateOption {
  id: string;
  label: string;
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
  const [scheduleType, setScheduleType] = useState<HabitScheduleType>("recurring");
  const [scheduleCadence, setScheduleCadence] = useState<HabitCadence>("daily");
  const [monthDays, setMonthDays] = useState<number[]>([1]);
  const [startsOn, setStartsOn] = useState(() => todayCivilDate());
  const [endsOn, setEndsOn] = useState(() => addCivilMonths(todayCivilDate(), 3));
  const [selectedEndPresetMonths, setSelectedEndPresetMonths] =
    useState<EndDatePresetMonths>(3);
  const formRef = useRef<HTMLFormElement>(null);

  const templateMode = templateId.length > 0;
  const showCadence = scheduleType === "recurring";
  const showWeekdays = showCadence && scheduleCadence === "weekly";
  const showMonthDay = showCadence && scheduleCadence === "monthly";

  useEffect(() => {
    setEndsOn(addCivilMonths(startsOn, selectedEndPresetMonths));
  }, [selectedEndPresetMonths, startsOn]);

  async function handleSubmit(formData: FormData) {
    await submitAction(formData);
    setTemplateId("");
    setScheduleType("recurring");
    setScheduleCadence("daily");
    setMonthDays([1]);
    setStartsOn(todayCivilDate());
    setEndsOn(addCivilMonths(todayCivilDate(), 3));
    setSelectedEndPresetMonths(3);
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
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
            Si elegís un hábito existente, se ignoran los campos de abajo y se pre-carga esa plantilla.
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {!templateMode ? (
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
          ) : null}
          {/* Habits are binary-only — type is always "binary". */}
          <input type="hidden" name="type" value="binary" />
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
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
              className="rounded border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-col gap-2 text-sm">
            <span className="font-medium">Fin (opcional)</span>
            <div className="flex flex-wrap gap-2">
              {END_DATE_PRESET_MONTHS.map((months) => {
                const active =
                  selectedEndPresetMonths === months &&
                  endsOn === addCivilMonths(startsOn, months);
                return (
                  <button
                    key={months}
                    type="button"
                    onClick={() => {
                      setSelectedEndPresetMonths(months);
                      setEndsOn(addCivilMonths(startsOn, months));
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                    aria-pressed={active}
                  >
                    {months} mes{months === 1 ? "" : "es"}
                  </button>
                );
              })}
            </div>
            <input
              type="date"
              name="endsOn"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
              className="rounded border bg-background px-3 py-2 text-sm"
            />
          </div>
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
