"use client";

// assign-template-modal.tsx
//
// Single-client `+ Assign template` modal opened from WeekGrid day cells.
// Reuses `useWorkoutTemplates` from 04-04 for the template picker. The
// civil-date pre-fill comes from the day cell that opened the modal — the
// trainer can change it via shadcn Calendar before submitting.
//
// CIVIL-DATE CONTRACT (Pitfall 1):
//   - The shadcn Calendar uses `react-day-picker`'s `mode="single"` with a
//     Date object — internally it's wall-clock midnight in the user's local
//     timezone. We convert IN with `parseCivilToLocalDate` (constructs a
//     local-time Date at midnight from the YYYY-MM-DD parts) and OUT with
//     `formatLocalDateToCivil` (reads the local-time y/m/d and joins).
//     NEVER `toISOString().slice(0,10)` — that would UTC-shift the day.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";

import {
  assignTemplate,
  assignTemplateRecurring,
} from "@/lib/gc-fitness/workout-assignment-actions";
import { getWorkoutTemplateForAssignment } from "@/lib/gc-fitness/workout-template-actions";
import { useWorkoutTemplates } from "@/lib/gc-fitness/workout-templates-listener";

interface AssignTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Pre-filled civil date ("YYYY-MM-DD") from the clicked day cell. */
  defaultDate: string;
  trainerTimezone?: string;
  onAssigned?: () => void;
}

/** "YYYY-MM-DD" → local-time Date at midnight (no UTC shift). */
function parseCivilToLocalDate(civil: string): Date {
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** local-time Date → "YYYY-MM-DD" using the local-time y/m/d parts. */
function formatLocalDateToCivil(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function AssignTemplateModal({
  open,
  onOpenChange,
  clientId,
  defaultDate,
  trainerTimezone,
  onAssigned,
}: AssignTemplateModalProps) {
  const t = useTranslations("schedule.assignModal");
  const { data: templates, isLoading: templatesLoading } = useWorkoutTemplates();

  const [templateId, setTemplateId] = useState<string>("");
  const [civilDate, setCivilDate] = useState<string>(defaultDate);
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [meetingNotes, setMeetingNotes] = useState<string>("");
  // Plan 21-04b: four cadence modes.
  type Mode = "once" | "weekly" | "daily" | "everyN";
  const [mode, setMode] = useState<Mode>("once");
  // Plan 21-04: multi-weekday recurrence — Set seeded with the cell's weekday.
  const [recurringWeekdays, setRecurringWeekdays] = useState<Set<number>>(
    () => new Set([parseCivilToLocalDate(defaultDate).getDay()]),
  );
  // Plan 21-04b: every-N-days step (default 2; range 2..30 per Zod).
  const [recurringEveryN, setRecurringEveryN] = useState<number>(2);
  const [recurringEveryNDraft, setRecurringEveryNDraft] = useState<string>("2");
  const [recurringEndEnabled, setRecurringEndEnabled] = useState(false);
  const [recurringEndDate, setRecurringEndDate] = useState<string>(defaultDate);
  const [templateDetail, setTemplateDetail] = useState<Awaited<
    ReturnType<typeof getWorkoutTemplateForAssignment>
  > | null>(null);
  const [templateDetailLoading, setTemplateDetailLoading] = useState(false);
  const [templateDetailError, setTemplateDetailError] = useState<string | null>(null);
  const [overrideDrafts, setOverrideDrafts] = useState<
    Record<
      number,
      {
        sets: string;
        reps: string;
        rest_seconds: string;
        notes: string;
        weightBySetKg: string;
      }
    >
  >({});
  const [submitting, setSubmitting] = useState(false);

  // Reset the local form state when the modal opens with a new defaultDate.
  useEffect(() => {
    if (open) {
      setCivilDate(defaultDate);
      setTemplateId("");
      setScheduledTime("");
      setMeetingNotes("");
      setMode("once");
      setRecurringWeekdays(
        new Set([parseCivilToLocalDate(defaultDate).getDay()]),
      );
      setRecurringEveryN(2);
      setRecurringEveryNDraft("2");
      setRecurringEndEnabled(false);
      setRecurringEndDate(defaultDate);
      setTemplateDetail(null);
      setTemplateDetailError(null);
      setOverrideDrafts({});
    }
  }, [open, defaultDate]);

  useEffect(() => {
    let cancelled = false;
    async function loadTemplateDetail(selectedTemplateId: string) {
      if (!selectedTemplateId) {
        setTemplateDetail(null);
        setTemplateDetailError(null);
        setOverrideDrafts({});
        return;
      }
      setTemplateDetailLoading(true);
      setTemplateDetailError(null);
      try {
        const detail = await getWorkoutTemplateForAssignment(selectedTemplateId);
        if (cancelled) return;
        setTemplateDetail(detail);
        setOverrideDrafts(
          detail.exercises.reduce<Record<number, {
            sets: string;
            reps: string;
            rest_seconds: string;
            notes: string;
            weightBySetKg: string;
          }>>((acc, exercise) => {
            acc[exercise.index] = {
              sets: String(exercise.sets),
              reps: String(exercise.reps),
              rest_seconds: String(exercise.rest_seconds),
              notes: exercise.notes ?? "",
              weightBySetKg: Array.isArray(exercise.weightBySetKg)
                ? exercise.weightBySetKg.join(", ")
                : "",
            };
            return acc;
          }, {}),
        );
      } catch (error) {
        if (cancelled) return;
        setTemplateDetail(null);
        setOverrideDrafts({});
        setTemplateDetailError(
          error instanceof Error ? error.message : t("errorTemplateDetailFallback"),
        );
      } finally {
        if (!cancelled) setTemplateDetailLoading(false);
      }
    }
    void loadTemplateDetail(templateId);
    return () => {
      cancelled = true;
    };
  }, [templateId, t]);

  const exerciseOverrides = useMemo(() => {
    if (!templateDetail) return [];
    return templateDetail.exercises
      .map((exercise) => {
        const draft = overrideDrafts[exercise.index];
        if (!draft) return null;
        const nextSets = Number(draft.sets);
        const nextReps = Number(draft.reps);
        const nextRest = Number(draft.rest_seconds);
        const nextNotes = draft.notes.trim();
        const nextWeights = draft.weightBySetKg
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
          .map(Number)
          .filter((value) => Number.isFinite(value));
        const changedSets = Number.isFinite(nextSets) && nextSets !== exercise.sets;
        const changedReps = Number.isFinite(nextReps) && nextReps !== exercise.reps;
        const changedRest =
          Number.isFinite(nextRest) && nextRest !== exercise.rest_seconds;
        const changedNotes = nextNotes !== (exercise.notes ?? "").trim();
        const defaultWeights = Array.isArray(exercise.weightBySetKg)
          ? exercise.weightBySetKg
          : [];
        const changedWeights =
          nextWeights.length > 0 &&
          (nextWeights.length !== defaultWeights.length ||
            nextWeights.some((value, idx) => value !== defaultWeights[idx]));
        if (!changedSets && !changedReps && !changedRest && !changedNotes && !changedWeights) {
          return null;
        }
        return {
          index: exercise.index,
          ...(changedSets ? { sets: Math.max(1, Math.min(10, Math.round(nextSets))) } : {}),
          ...(changedReps ? { reps: Math.max(1, Math.min(50, Math.round(nextReps))) } : {}),
          ...(changedRest
            ? { rest_seconds: Math.max(0, Math.min(600, Math.round(nextRest))) }
            : {}),
          ...(changedNotes ? { notes: nextNotes } : {}),
          ...(changedWeights ? { weightBySetKg: nextWeights.slice(0, 10) } : {}),
        };
      })
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null,
      );
  }, [overrideDrafts, templateDetail]);

  function toggleWeekday(idx: number) {
    setRecurringWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        // Don't let the trainer unselect the last one — at least one weekday
        // must remain selected.
        if (next.size === 1) return next;
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  async function onSubmit() {
    if (!templateId) {
      toast.error(t("errorPickTemplate"));
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "once") {
        await assignTemplate({
          templateId,
          clientId,
          scheduledFor: civilDate,
          scheduledTime: scheduledTime || undefined,
          meetingNotes: meetingNotes.trim() || undefined,
          timezone: trainerTimezone,
          exerciseOverrides: exerciseOverrides.length > 0 ? exerciseOverrides : undefined,
        });
        toast.success(t("successOnce"));
      } else {
        // Plan 21-04b: build the canonical recurrence rule based on the mode.
        let recurrence:
          | { kind: "daily" }
          | { kind: "weekly"; weekday: number }
          | { kind: "weekly_days"; weekdays: number[] }
          | { kind: "every_n_days"; everyN: number };
        if (mode === "daily") {
          recurrence = { kind: "daily" };
        } else if (mode === "everyN") {
          recurrence = { kind: "every_n_days", everyN: recurringEveryN };
        } else {
          const weekdays = Array.from(recurringWeekdays).sort((a, b) => a - b);
          recurrence =
            weekdays.length === 1
              ? { kind: "weekly", weekday: weekdays[0] }
              : { kind: "weekly_days", weekdays };
        }
        const result = await assignTemplateRecurring({
          templateId,
          clientId,
          startDate: civilDate,
          recurrence,
          endDate: recurringEndEnabled ? recurringEndDate : undefined,
          scheduledTime: scheduledTime || undefined,
          meetingNotes: meetingNotes.trim() || undefined,
          timezone: trainerTimezone,
          exerciseOverrides: exerciseOverrides.length > 0 ? exerciseOverrides : undefined,
        });
        toast.success(t("successRecurring", { count: result.count }));
      }
      onAssigned?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errorFallback");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("templateLabel")}</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    templatesLoading ? t("templateLoading") : t("templatePlaceholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name.en} · {tpl.tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("modeLabel")}</label>
              <Select
                value={mode}
                onValueChange={(value) => setMode(value as Mode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">{t("modeOnce")}</SelectItem>
                  <SelectItem value="weekly">{t("modeWeekly")}</SelectItem>
                  <SelectItem value="daily">{t("modeDaily")}</SelectItem>
                  <SelectItem value="everyN">{t("modeEveryN")}</SelectItem>
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

          {mode !== "once" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <input
                  id="recurring-end-enabled"
                  type="checkbox"
                  checked={recurringEndEnabled}
                  onChange={(event) => setRecurringEndEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                <label htmlFor="recurring-end-enabled" className="text-sm">
                  {t("setEndDate")}
                </label>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t("endDateLabel")}</label>
                <input
                  type="date"
                  value={recurringEndDate}
                  disabled={!recurringEndEnabled}
                  min={civilDate}
                  onChange={(event) => setRecurringEndDate(event.target.value)}
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

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("dayLabel")}</label>
            <Calendar
              mode="single"
              selected={parseCivilToLocalDate(civilDate)}
              onSelect={(d) => {
                if (d) setCivilDate(formatLocalDateToCivil(d));
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t("scheduledFor", { date: civilDate })}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("timeLabel")}</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(event) => setScheduledTime(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
              <p className="text-xs text-muted-foreground">{t("timeHint")}</p>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <label className="text-sm font-medium">{t("meetingNotesLabel")}</label>
              <textarea
                value={meetingNotes}
                onChange={(event) => setMeetingNotes(event.target.value)}
                placeholder={t("meetingNotesPlaceholder")}
                className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/40 p-3">
            <div>
              <p className="text-sm font-medium">{t("exerciseOverridesTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("exerciseOverridesHint")}
              </p>
            </div>
            {templateDetailLoading ? (
              <p className="text-xs text-muted-foreground">{t("exerciseOverridesLoading")}</p>
            ) : null}
            {templateDetailError ? (
              <p className="text-xs text-destructive">{templateDetailError}</p>
            ) : null}
            {templateDetail && templateDetail.exercises.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("exerciseOverridesEmpty")}</p>
            ) : null}
            {templateDetail?.exercises.map((exercise) => {
              const draft = overrideDrafts[exercise.index];
              if (!draft) return null;
              return (
                <div
                  key={`${exercise.exerciseId}-${exercise.index}`}
                  className="rounded-md border border-border/60 bg-background/60 p-3"
                >
                  <p className="text-sm font-medium">{exercise.exerciseName}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={draft.sets}
                      onChange={(event) => {
                        const value = event.target.value;
                        setOverrideDrafts((prev) => ({
                          ...prev,
                          [exercise.index]: { ...prev[exercise.index], sets: value },
                        }));
                      }}
                      placeholder={t("exerciseOverridesSets")}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={draft.reps}
                      onChange={(event) => {
                        const value = event.target.value;
                        setOverrideDrafts((prev) => ({
                          ...prev,
                          [exercise.index]: { ...prev[exercise.index], reps: value },
                        }));
                      }}
                      placeholder={t("exerciseOverridesReps")}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={draft.rest_seconds}
                      onChange={(event) => {
                        const value = event.target.value;
                        setOverrideDrafts((prev) => ({
                          ...prev,
                          [exercise.index]: {
                            ...prev[exercise.index],
                            rest_seconds: value,
                          },
                        }));
                      }}
                      placeholder={t("exerciseOverridesRest")}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    value={draft.weightBySetKg}
                    onChange={(event) => {
                      const value = event.target.value;
                      setOverrideDrafts((prev) => ({
                        ...prev,
                        [exercise.index]: {
                          ...prev[exercise.index],
                          weightBySetKg: value,
                        },
                      }));
                    }}
                    placeholder={t("exerciseOverridesWeightPlaceholder")}
                    className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm"
                  />
                  <textarea
                    value={draft.notes}
                    onChange={(event) => {
                      const value = event.target.value;
                      setOverrideDrafts((prev) => ({
                        ...prev,
                        [exercise.index]: { ...prev[exercise.index], notes: value },
                      }));
                    }}
                    placeholder={t("exerciseOverridesNotesPlaceholder")}
                    className="mt-2 min-h-16 w-full rounded-md border bg-background px-2 py-2 text-sm"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting || !templateId}
          >
            {submitting ? t("assigning") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
