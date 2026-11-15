"use client";

// Cadence controls of the assign modal (#507 — split out of
// assign-template-modal.tsx): the mode select, the weekly day toggles, the
// every-N-days input, the monthly hint and the end-date presets. Fully
// controlled — every value and setter is the modal's own state.

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addCivilMonths,
  END_DATE_PRESET_MONTHS,
  inferEndDatePresetMonths,
} from "@/lib/gc-fitness/end-date-presets";
import {
  parseCivilToLocalDate,
  type AssignMode,
} from "@/lib/gc-fitness/assign-template-overrides";

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function AssignRecurrenceFields({
  civilDate,
  mode,
  setMode,
  recurringWeekdays,
  toggleWeekday,
  recurringEveryN,
  setRecurringEveryN,
  recurringEveryNDraft,
  setRecurringEveryNDraft,
  recurringEndEnabled,
  setRecurringEndEnabled,
  recurringEndDate,
  setRecurringEndDate,
  recurringEndPresetMonths,
  setRecurringEndPresetMonths,
}: {
  civilDate: string;
  mode: AssignMode;
  setMode: (mode: AssignMode) => void;
  recurringWeekdays: ReadonlySet<number>;
  toggleWeekday: (idx: number) => void;
  recurringEveryN: number;
  setRecurringEveryN: (value: number) => void;
  recurringEveryNDraft: string;
  setRecurringEveryNDraft: (value: string) => void;
  recurringEndEnabled: boolean;
  setRecurringEndEnabled: (value: boolean) => void;
  recurringEndDate: string;
  setRecurringEndDate: (value: string) => void;
  recurringEndPresetMonths: number | null;
  setRecurringEndPresetMonths: (value: number | null) => void;
}) {
  const t = useTranslations("schedule.assignModal");
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{t("modeLabel")}</label>
          <Select
            value={mode}
            onValueChange={(value) => setMode(value as AssignMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="once">{t("modeOnce")}</SelectItem>
              <SelectItem value="weekly">{t("modeWeekly")}</SelectItem>
              <SelectItem value="daily">{t("modeDaily")}</SelectItem>
              <SelectItem value="everyN">{t("modeEveryN")}</SelectItem>
              <SelectItem value="monthly">{t("modeMonthly")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === "weekly" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{t("repeatOnLabel")}</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_KEYS.map((key, idx) => {
              const active = recurringWeekdays.has(idx);
              return (
                <Button
                  key={key}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleWeekday(idx)}
                  aria-pressed={active}
                >
                  {t(`weekdays.${key}`).slice(0, 3)}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {mode === "everyN" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="every-n-input">
            {t("repeatEveryNLabel")}
          </label>
          <input
            id="every-n-input"
            type="number"
            min={2}
            max={30}
            value={recurringEveryNDraft}
            onChange={(event) => {
              const raw = event.target.value;
              setRecurringEveryNDraft(raw);
              if (raw.trim() === "") return;
              const next = Number(raw);
              if (!Number.isFinite(next)) return;
              setRecurringEveryN(Math.max(2, Math.min(30, next)));
            }}
            onBlur={() => {
              if (recurringEveryNDraft.trim() === "") {
                setRecurringEveryNDraft(String(recurringEveryN));
                return;
              }
              const next = Number(recurringEveryNDraft);
              if (!Number.isFinite(next)) {
                setRecurringEveryNDraft(String(recurringEveryN));
                return;
              }
              const normalized = Math.max(2, Math.min(30, next));
              setRecurringEveryN(normalized);
              setRecurringEveryNDraft(String(normalized));
            }}
            className="h-10 w-24 rounded-md border bg-background px-3 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t("repeatEveryNHint", { n: recurringEveryN })}
          </p>
        </div>
      ) : null}

      {mode === "monthly" ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">
            {t("repeatMonthlyHint", {
              day: parseCivilToLocalDate(civilDate).getDate(),
            })}
          </p>
        </div>
      ) : null}

      {mode !== "once" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <input
              id="recurring-end-enabled"
              type="checkbox"
              checked={recurringEndEnabled}
              onChange={(event) => {
                const next = event.target.checked;
                setRecurringEndEnabled(next);
                if (next) {
                  const preset = recurringEndPresetMonths ?? 3;
                  setRecurringEndPresetMonths(preset);
                  setRecurringEndDate(addCivilMonths(civilDate, preset));
                }
              }}
              className="h-4 w-4 rounded border"
            />
            <label htmlFor="recurring-end-enabled" className="text-sm">
              {t("setEndDate")}
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("endDateLabel")}</label>
            <div className="flex flex-wrap gap-2">
              {END_DATE_PRESET_MONTHS.map((months) => {
                const active =
                  recurringEndEnabled &&
                  recurringEndPresetMonths === months &&
                  recurringEndDate === addCivilMonths(civilDate, months);
                return (
                  <Button
                    key={months}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    aria-pressed={active}
                    onClick={() => {
                      setRecurringEndEnabled(true);
                      setRecurringEndPresetMonths(months);
                      setRecurringEndDate(addCivilMonths(civilDate, months));
                    }}
                  >
                    {t("endDatePreset", { months })}
                  </Button>
                );
              })}
            </div>
            <input
              type="date"
              value={recurringEndDate}
              disabled={!recurringEndEnabled}
              min={civilDate}
              onChange={(event) => {
                const next = event.target.value;
                setRecurringEndDate(next);
                setRecurringEndPresetMonths(
                  inferEndDatePresetMonths(civilDate, next),
                );
              }}
              className="h-10 rounded-md border bg-background px-3 text-sm disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              {recurringEndEnabled
                ? t("endDateHintWithEnd")
                : t("endDateHintNoEnd")}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
