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
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
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
import { ExercisePreviewThumb } from "@/components/gc-fitness/exercise-preview-thumb";

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
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [civilDate, setCivilDate] = useState<string>(defaultDate);
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [meetingNotes, setMeetingNotes] = useState<string>("");
  // Plan 21-04b: four cadence modes + monthly (added 26-05).
  type Mode = "once" | "weekly" | "daily" | "everyN" | "monthly";
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
  // Per-exercise edit buffer. `setRows` is one entry per prescribed set —
  // each carries its own reps + kg buffer, mirroring the authoring form's
  // per-set table. `sets` is derived from setRows.length on commit; the
  // trainer adds/removes rows via the +/- buttons rather than retyping a
  // count input. Notes + rest_seconds stay exercise-level.
  //
  // 26-03 — `duration` is additive (optional) on each row. Populated only
  // when the effective metric for that exercise is "time"; otherwise it
  // remains undefined and the submit-time transform omits
  // `durationBySetSeconds` from the override.
  const [overrideDrafts, setOverrideDrafts] = useState<
    Record<
      number,
      {
        rest_seconds: string;
        notes: string;
        setRows: Array<{ reps: string; kg: string; duration?: string }>;
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
            rest_seconds: string;
            notes: string;
            setRows: Array<{ reps: string; kg: string; duration?: string }>;
          }>>((acc, exercise) => {
            // Reconstruct one row per prescribed set. Pull reps from
            // repsBySet[i] if present, otherwise from the exercise-level
            // `reps` fallback. Same for kg from weightBySetKg[i]. The
            // canonical row count is the MAX of (sets, repsBySet.length,
            // weightBySetKg.length) so a desync at the source — like the
            // "sets=1 but weightBySetKg=[24,24,23]" template the operator
            // ran into — surfaces here as all 3 rows instead of silently
            // collapsing back to 1.
            const repsBySet = Array.isArray(exercise.repsBySet)
              ? exercise.repsBySet
              : [];
            const weightBySetKg = Array.isArray(exercise.weightBySetKg)
              ? exercise.weightBySetKg
              : [];
            // 26-03 — Per-set duration source (time exercises only).
            const durationBySetSeconds = Array.isArray(
              exercise.durationBySetSeconds,
            )
              ? exercise.durationBySetSeconds
              : [];
            const rowCount = Math.min(
              10,
              Math.max(
                exercise.sets ?? 1,
                repsBySet.length,
                weightBySetKg.length,
                durationBySetSeconds.length,
                1,
              ),
            );
            // 26-03 — effective metric per PATTERNS.md §17 + Shared 1.
            // Cascade: template metric ?? source exercise metric ?? "reps".
            const exerciseEffectiveMetric: "reps" | "time" =
              exercise.metric ?? exercise.sourceMetric ?? "reps";
            const setRows = Array.from({ length: rowCount }, (_, i) => ({
              reps: String(
                Number.isFinite(repsBySet[i])
                  ? repsBySet[i]
                  : exercise.reps ?? 0,
              ),
              kg: Number.isFinite(weightBySetKg[i])
                ? String(weightBySetKg[i])
                : "",
              ...(exerciseEffectiveMetric === "time"
                ? {
                    duration: String(
                      Number.isFinite(durationBySetSeconds[i])
                        ? durationBySetSeconds[i]
                        : exercise.durationSeconds ?? 60,
                    ),
                  }
                : {}),
            }));
            acc[exercise.index] = {
              rest_seconds: String(exercise.rest_seconds),
              notes: exercise.notes ?? "",
              setRows,
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

        // 26-03 — effective metric per PATTERNS.md §17 + Shared 1.
        const effectiveMetric: "reps" | "time" =
          exercise.metric ?? exercise.sourceMetric ?? "reps";

        // setRows → reps[] + kg[] + sets count, cleaning non-finite entries.
        const repsBySet = draft.setRows
          .map((row) => Number(row.reps))
          .map((n) => (Number.isFinite(n) ? Math.max(0, Math.min(50, Math.round(n))) : NaN));
        const weightBySetKg = draft.setRows
          .map((row) => row.kg.trim())
          .map((raw) => (raw === "" ? NaN : Number(raw)))
          .map((n) => (Number.isFinite(n) ? Math.max(0, Math.min(500, n)) : NaN));
        // 26-03 — Parallel duration cleanup (5..1800 clamp). Only used
        // when the effective metric is "time"; we still compute it
        // unconditionally so a metric flip mid-draft doesn't drop the
        // values the trainer just typed.
        const durationBySetSeconds = draft.setRows
          .map((row) => (row.duration ?? "").trim())
          .map((raw) => (raw === "" ? NaN : Number(raw)))
          .map((n) =>
            Number.isFinite(n) ? Math.max(5, Math.min(1800, Math.round(n))) : NaN,
          );

        const validRepsLen = repsBySet.filter((n) => Number.isFinite(n)).length;
        const validDurationLen = durationBySetSeconds.filter((n) =>
          Number.isFinite(n),
        ).length;
        // Set-count basis follows the primary metric: count the populated
        // duration entries on time exercises, populated reps entries on
        // reps exercises.
        const primaryValidLen =
          effectiveMetric === "time" ? validDurationLen : validRepsLen;
        const finalSets = Math.max(
          1,
          Math.min(10, primaryValidLen || draft.setRows.length),
        );
        const finalRepsBySet = repsBySet
          .slice(0, finalSets)
          .map((n) => (Number.isFinite(n) ? n : 0));
        const finalWeightsRaw = weightBySetKg.slice(0, finalSets);
        const hasAnyWeight = finalWeightsRaw.some((n) => Number.isFinite(n));
        const finalWeights = hasAnyWeight
          ? finalWeightsRaw.map((n) => (Number.isFinite(n) ? n : 0))
          : null;
        // 26-03 — Final duration array for time exercises.
        const finalDurationBySetSeconds = durationBySetSeconds
          .slice(0, finalSets)
          .map((n) => (Number.isFinite(n) ? n : 60));

        const nextRest = Number(draft.rest_seconds);
        const nextNotes = draft.notes.trim();

        const baseRepsBySet = Array.isArray(exercise.repsBySet) ? exercise.repsBySet : [];
        const baseWeightBySetKg = Array.isArray(exercise.weightBySetKg)
          ? exercise.weightBySetKg
          : [];
        const baseDurationBySetSeconds = Array.isArray(
          exercise.durationBySetSeconds,
        )
          ? exercise.durationBySetSeconds
          : [];

        const changedSets = finalSets !== exercise.sets;
        const changedReps =
          finalRepsBySet[0] !== undefined && finalRepsBySet[0] !== exercise.reps;
        const changedRepsBySet =
          finalRepsBySet.length !== baseRepsBySet.length ||
          finalRepsBySet.some((v, i) => v !== baseRepsBySet[i]);
        const changedWeights = finalWeights
          ? finalWeights.length !== baseWeightBySetKg.length ||
            finalWeights.some((v, i) => v !== baseWeightBySetKg[i])
          : baseWeightBySetKg.length > 0;
        const changedRest =
          Number.isFinite(nextRest) && nextRest !== exercise.rest_seconds;
        const changedNotes = nextNotes !== (exercise.notes ?? "").trim();
        // 26-03 — Duration change detection (only relevant when time).
        const changedDurations =
          effectiveMetric === "time" &&
          (finalDurationBySetSeconds.length !== baseDurationBySetSeconds.length ||
            finalDurationBySetSeconds.some(
              (v, i) => v !== baseDurationBySetSeconds[i],
            ));

        if (
          !changedSets &&
          !changedReps &&
          !changedRepsBySet &&
          !changedWeights &&
          !changedRest &&
          !changedNotes &&
          !changedDurations
        ) {
          return null;
        }
        return {
          index: exercise.index,
          ...(changedSets ? { sets: finalSets } : {}),
          // 26-03 — For reps exercises keep writing `reps` + `repsBySet`
          // as today. For time exercises we do NOT write reps at all —
          // PATTERNS.md §17: "do NOT write both arrays for the same
          // exercise."
          ...(effectiveMetric === "reps" && changedReps
            ? { reps: Math.max(0, Math.min(50, Math.round(finalRepsBySet[0] ?? 0))) }
            : {}),
          ...(effectiveMetric === "reps" && changedRepsBySet
            ? { repsBySet: finalRepsBySet }
            : {}),
          ...(changedWeights && finalWeights
            ? { weightBySetKg: finalWeights }
            : {}),
          ...(changedWeights && !finalWeights ? { weightBySetKg: [] } : {}),
          ...(changedRest
            ? { rest_seconds: Math.max(0, Math.min(600, Math.round(nextRest))) }
            : {}),
          ...(changedNotes ? { notes: nextNotes } : {}),
          // 26-03 — Duration override write (time exercises only).
          ...(effectiveMetric === "time" && changedDurations
            ? { durationBySetSeconds: finalDurationBySetSeconds }
            : {}),
        };
      })
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null,
      );
  }, [overrideDrafts, templateDetail]);

  function copyFirstSetToAll(exerciseIndex: number, metric: "reps" | "time") {
    setOverrideDrafts((prev) => {
      const cur = prev[exerciseIndex];
      const first = cur?.setRows[0];
      if (!cur || !first || cur.setRows.length <= 1) return prev;
      const next = cur.setRows.map((row, index) => {
        if (index === 0) return row;
        return {
          ...row,
          reps: first.reps,
          kg: first.kg,
          ...(metric === "time" ? { duration: first.duration ?? "60" } : {}),
        };
      });
      return {
        ...prev,
        [exerciseIndex]: { ...cur, setRows: next },
      };
    });
  }

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
          | { kind: "every_n_days"; everyN: number }
          | { kind: "monthly"; dayOfMonth: number };
        if (mode === "daily") {
          recurrence = { kind: "daily" };
        } else if (mode === "everyN") {
          recurrence = { kind: "every_n_days", everyN: recurringEveryN };
        } else if (mode === "monthly") {
          recurrence = {
            kind: "monthly",
            dayOfMonth: parseCivilToLocalDate(civilDate).getDate(),
          };
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
      {/* `overflow-hidden` overrides the default DialogContent `overflow-y-auto`
          so the WHOLE modal no longer scrolls. The inner body div below owns
          the scroll, which keeps the DialogFooter anchored at the bottom of
          the dialog box (no sticky/overlap weirdness 260528). */}
      <DialogContent className="sm:max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("templateLabel")}</label>
            {/* 260529 scroll fix — the template/routine picker now renders
                INLINE in the dialog body instead of a portaled Popover.
                Radix Popover portals its content to document.body, which
                sits OUTSIDE the Dialog's react-remove-scroll shard, so the
                wheel/touch scroll on the cmdk list was swallowed and long
                routine lists couldn't be scrolled. An in-flow disclosure
                panel lives inside DialogContent's allowed scroll region, so
                CommandList's own overflow scrolls normally. The routines
                already load — this was purely the scroll lock. */}
            <button
              type="button"
              role="combobox"
              aria-expanded={templatePickerOpen}
              onClick={() => setTemplatePickerOpen((prev) => !prev)}
              className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm"
            >
              <span
                className={cn(
                  "truncate",
                  !templateId && "text-muted-foreground",
                )}
              >
                {(() => {
                  const sel = (templates ?? []).find(
                    (x) => x.id === templateId,
                  );
                  if (sel)
                    return `${sel.name.en}${sel.tag ? ` · ${sel.tag}` : ""}`;
                  return templatesLoading
                    ? t("templateLoading")
                    : t("templatePlaceholder");
                })()}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </button>
            {templatePickerOpen ? (
              <div className="rounded-md border bg-popover text-popover-foreground shadow-sm">
                <Command shouldFilter={false}>
                  <CommandInput
                    value={templateSearch}
                    onValueChange={setTemplateSearch}
                    placeholder="Buscar por nombre o tag…"
                  />
                  <CommandList className="max-h-[min(45vh,320px)]">
                    {(() => {
                      const list = templates ?? [];
                      const needle = templateSearch.trim().toLowerCase();
                      const filtered = needle
                        ? list.filter((tpl) => {
                            const tags = Array.isArray(tpl.tags)
                              ? tpl.tags
                              : tpl.tag
                                ? [tpl.tag]
                                : [];
                            return `${tpl.name.en} ${tpl.name.es} ${tags.join(" ")}`
                              .toLowerCase()
                              .includes(needle);
                          })
                        : list;
                      if (filtered.length === 0) {
                        return (
                          <CommandEmpty>
                            {templatesLoading ? t("templateLoading") : "Sin resultados."}
                          </CommandEmpty>
                        );
                      }
                      return filtered.map((tpl) => {
                        const tags =
                          Array.isArray(tpl.tags) && tpl.tags.length
                            ? tpl.tags
                            : tpl.tag
                              ? [tpl.tag]
                              : [];
                        const selected = tpl.id === templateId;
                        return (
                          <CommandItem
                            key={tpl.id}
                            value={tpl.id}
                            onSelect={() => {
                              setTemplateId(tpl.id);
                              setTemplatePickerOpen(false);
                              setTemplateSearch("");
                            }}
                            className="flex items-center gap-2"
                          >
                            <Check
                              className={cn(
                                "size-4 shrink-0",
                                selected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {tpl.name.en}
                            </span>
                            {tags.length ? (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {tags.join(" · ")}
                              </span>
                            ) : null}
                          </CommandItem>
                        );
                      });
                    })()}
                  </CommandList>
                </Command>
              </div>
            ) : null}
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
            {templateDetail?.exercises.map((exercise, idx) => {
              const draft = overrideDrafts[exercise.index];
              if (!draft) return null;
              // 26-03 — effective metric cascade per PATTERNS.md §17.
              // Drives the SEGUNDOS↔REPS header swap + per-row input
              // field bind below.
              const effectiveMetric: "reps" | "time" =
                exercise.metric ?? exercise.sourceMetric ?? "reps";
              const group = exercise.supersetGroup ?? null;
              const prevGroup =
                idx > 0
                  ? templateDetail.exercises[idx - 1].supersetGroup ?? null
                  : null;
              const nextGroup =
                idx < templateDetail.exercises.length - 1
                  ? templateDetail.exercises[idx + 1].supersetGroup ?? null
                  : null;
              const isSupersetStart = group !== null && group !== prevGroup;
              const isInSuperset =
                group !== null && (group === prevGroup || group === nextGroup);
              return (
                <div
                  key={`${exercise.exerciseId}-${exercise.index}`}
                  className={
                    isInSuperset
                      ? "rounded-md border border-amber-500/40 bg-amber-50/40 p-3 dark:border-amber-400/40 dark:bg-amber-950/20"
                      : "rounded-md border border-border/60 bg-background/60 p-3"
                  }
                >
                  {isSupersetStart ? (
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      {t("supersetLabel", { group })}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ExercisePreviewThumb
                        src={exercise.previewUrl}
                        alt={exercise.exerciseName}
                        width={32}
                        height={32}
                      />
                      <p className="text-sm font-medium">{exercise.exerciseName}</p>
                      {group ? (
                        <span className="inline-flex h-5 items-center rounded-full bg-amber-500/20 px-2 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-400/20 dark:text-amber-200">
                          {group}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">
                        {t("exerciseOverridesRest")}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
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
                        className="h-8 w-20 rounded-md border bg-background px-2 text-sm"
                      />
                    </div>
                  </div>
                  {/* Per-set table — one row per prescribed set. Mirrors the
                      authoring form so the trainer assigns by editing the
                      exact (reps × kg) prescription set-by-set rather than
                      typing a comma-joined string. */}
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="grid grid-cols-[28px_minmax(80px,1fr)_minmax(80px,1fr)_28px] items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      <span>{t("exerciseOverridesSetHeader")}</span>
                      <span>
                        {effectiveMetric === "time"
                          ? t("exerciseOverridesSeconds")
                          : t("exerciseOverridesReps")}
                      </span>
                      <span>{t("exerciseOverridesWeightHeader")}</span>
                      <span aria-hidden="true" />
                    </div>
                    {draft.setRows.map((row, setIdx) => (
                      <div
                        key={`${exercise.exerciseId}-set-${setIdx + 1}`}
                        className="grid grid-cols-[28px_minmax(80px,1fr)_minmax(80px,1fr)_28px] items-center gap-2"
                      >
                        <span className="text-xs text-muted-foreground">{setIdx + 1}</span>
                        {/* 26-03 — Primary input branches on effectiveMetric.
                            Time exercises bind to row.duration (5..1800
                            placeholder 60); reps stays as today. */}
                        {effectiveMetric === "time" ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={row.duration ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              setOverrideDrafts((prev) => {
                                const cur = prev[exercise.index];
                                const next = cur.setRows.map((r, i) =>
                                  i === setIdx ? { ...r, duration: value } : r,
                                );
                                return {
                                  ...prev,
                                  [exercise.index]: { ...cur, setRows: next },
                                };
                              });
                            }}
                            placeholder="60"
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                            aria-label={`Duración serie ${setIdx + 1} en segundos`}
                          />
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={row.reps}
                            onChange={(event) => {
                              const value = event.target.value;
                              setOverrideDrafts((prev) => {
                                const cur = prev[exercise.index];
                                const next = cur.setRows.map((r, i) =>
                                  i === setIdx ? { ...r, reps: value } : r,
                                );
                                return {
                                  ...prev,
                                  [exercise.index]: { ...cur, setRows: next },
                                };
                              });
                            }}
                            placeholder={t("exerciseOverridesRepsPlaceholder")}
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          />
                        )}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.kg}
                          onChange={(event) => {
                            const value = event.target.value;
                            setOverrideDrafts((prev) => {
                              const cur = prev[exercise.index];
                              const next = cur.setRows.map((r, i) =>
                                i === setIdx ? { ...r, kg: value } : r,
                              );
                              return {
                                ...prev,
                                [exercise.index]: { ...cur, setRows: next },
                              };
                            });
                          }}
                          placeholder={t("exerciseOverridesKgPlaceholder")}
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setOverrideDrafts((prev) => {
                              const cur = prev[exercise.index];
                              if (cur.setRows.length <= 1) return prev;
                              const next = cur.setRows.filter((_, i) => i !== setIdx);
                              return {
                                ...prev,
                                [exercise.index]: { ...cur, setRows: next },
                              };
                            });
                          }}
                          disabled={draft.setRows.length <= 1}
                          tabIndex={-1}
                          aria-label={t("exerciseOverridesRemoveSet", { index: setIdx + 1 })}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideDrafts((prev) => {
                            const cur = prev[exercise.index];
                            if (cur.setRows.length >= 10) return prev;
                            // New row carries the previous row's values as a
                            // sensible default — common case is +1 set with
                            // same prescription as the prior set. 26-03
                            // additionally seeds `duration` when the
                            // effective metric is "time" so the new row
                            // surfaces a usable number instead of an empty
                            // string.
                            const last = cur.setRows[cur.setRows.length - 1];
                            const newRow: {
                              reps: string;
                              kg: string;
                              duration?: string;
                            } = {
                              reps: last?.reps ?? "0",
                              kg: last?.kg ?? "",
                            };
                            if (effectiveMetric === "time") {
                              newRow.duration = last?.duration ?? "60";
                            }
                            const next = [...cur.setRows, newRow];
                            return {
                              ...prev,
                              [exercise.index]: { ...cur, setRows: next },
                            };
                          });
                        }}
                        disabled={draft.setRows.length >= 10}
                        tabIndex={-1}
                        className="inline-flex h-7 items-center gap-1 self-start rounded-md border border-border/70 bg-background px-2 text-xs font-medium text-foreground hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        + {t("exerciseOverridesAddSet")}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyFirstSetToAll(exercise.index, effectiveMetric)}
                        disabled={draft.setRows.length <= 1}
                        tabIndex={-1}
                        className="inline-flex h-7 items-center gap-1 self-start rounded-md border border-border/70 bg-background px-2 text-xs font-medium text-foreground hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("exerciseOverridesCopyToAll")}
                      </button>
                    </div>
                  </div>
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
            tabIndex={-1}
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
