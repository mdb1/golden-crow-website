"use client";

// assign-template-modal.tsx
//
// Single-client `+ Assign template` modal opened from WeekGrid day cells.
// Reuses `useWorkoutTemplates` from 04-04 for the template picker. The
// civil-date pre-fill comes from the day cell that opened the modal — the
// trainer can change it via shadcn Calendar before submitting.
//
// #507 — split by responsibility: the pure draft/override/recurrence model is
// `lib/gc-fitness/assign-template-overrides.ts`; the picker, the cadence
// controls and the per-exercise editor live in `./assign-template/`. This file
// keeps the state, the effects and the submit fork.
//
// CIVIL-DATE CONTRACT (Pitfall 1):
//   - The shadcn Calendar uses `react-day-picker`'s `mode="single"` with a
//     Date object — internally it's wall-clock midnight in the user's local
//     timezone. We convert IN with `parseCivilToLocalDate` (constructs a
//     local-time Date at midnight from the YYYY-MM-DD parts) and OUT with
//     `formatLocalDateToCivil` (reads the local-time y/m/d and joins).
//     NEVER `toISOString().slice(0,10)` — that would UTC-shift the day.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Plus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";

import {
  assignTemplate,
  assignTemplateRecurring,
} from "@/lib/gc-fitness/workout-assignment-actions";
import { getWorkoutTemplateForAssignment } from "@/lib/gc-fitness/workout-template-actions";
import { useWorkoutTemplates } from "@/lib/gc-fitness/workout-templates-listener";
import { addCivilMonths } from "@/lib/gc-fitness/end-date-presets";
import {
  expandRecurrenceDates,
  type ExpandableRecurrence,
} from "@/lib/gc-fitness/recurrence-expansion";
import {
  buildAssignRecurrence,
  buildExerciseOverrides,
  formatLocalDateToCivil,
  parseCivilToLocalDate,
  seedOverrideDrafts,
  toggleWeekdayIn,
  type AssignMode,
  type AssignOverrideDrafts,
} from "@/lib/gc-fitness/assign-template-overrides";

import { AssignExerciseOverrideCard } from "./assign-template/exercise-override-card";
import { AssignRecurrenceFields } from "./assign-template/recurrence-fields";
import { AssignTemplatePicker } from "./assign-template/template-picker";

// #294 — class applied to every day cell the recurrence will land on, so the
// trainer previews the series on the calendar before submitting. The anchor
// (selected) day keeps its solid `selected` styling on top of this.
const RECURRENCE_PREVIEW_CLASS =
  "rounded-md bg-primary/15 font-semibold text-primary";

interface AssignTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Pre-filled civil date ("YYYY-MM-DD") from the clicked day cell. */
  defaultDate: string;
  trainerTimezone?: string;
  onAssigned?: () => void;
}

export function AssignTemplateModal({
  open,
  onOpenChange,
  clientId,
  defaultDate,
  trainerTimezone,
  onAssigned,
}: AssignTemplateModalProps) {
  const t = useTranslations("schedule.assignModal");
  const {
    data: templates,
    isLoading: templatesLoading,
    refetch: refetchTemplates,
  } = useWorkoutTemplates();
  // #535 — «Crear rutina» opens the editor in a NEW tab, so this dialog keeps the
  // client, date and recurrence the coach already chose; when they come back to
  // this tab the list refetches and the new routine is there to pick.
  useEffect(() => {
    if (!open) return;
    const onFocus = () => void refetchTemplates();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, refetchTemplates]);

  const [templateId, setTemplateId] = useState<string>("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [civilDate, setCivilDate] = useState<string>(defaultDate);
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [meetingNotes, setMeetingNotes] = useState<string>("");
  // Plan 21-04b: four cadence modes + monthly (added 26-05).
  const [mode, setMode] = useState<AssignMode>("once");
  // Plan 21-04: multi-weekday recurrence — Set seeded with the cell's weekday.
  const [recurringWeekdays, setRecurringWeekdays] = useState<Set<number>>(
    () => new Set([parseCivilToLocalDate(defaultDate).getDay()]),
  );
  // Plan 21-04b: every-N-days step (default 2; range 2..30 per Zod).
  const [recurringEveryN, setRecurringEveryN] = useState<number>(2);
  const [recurringEveryNDraft, setRecurringEveryNDraft] = useState<string>("2");
  const [recurringEndEnabled, setRecurringEndEnabled] = useState(false);
  const [recurringEndDate, setRecurringEndDate] = useState<string>(defaultDate);
  const [recurringEndPresetMonths, setRecurringEndPresetMonths] = useState<
    number | null
  >(3);
  const [templateDetail, setTemplateDetail] = useState<Awaited<
    ReturnType<typeof getWorkoutTemplateForAssignment>
  > | null>(null);
  const [templateDetailLoading, setTemplateDetailLoading] = useState(false);
  const [templateDetailError, setTemplateDetailError] = useState<string | null>(null);
  // Per-exercise edit buffer (one draft per template exercise; see
  // `AssignOverrideDraft` for the shape and why set types live on the rows).
  const [overrideDrafts, setOverrideDrafts] = useState<AssignOverrideDrafts>({});
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
      setRecurringEndEnabled(true);
      setRecurringEndDate(addCivilMonths(defaultDate, 3));
      setRecurringEndPresetMonths(3);
      setTemplateDetail(null);
      setTemplateDetailError(null);
      setOverrideDrafts({});
    }
  }, [open, defaultDate]);

  useEffect(() => {
    if (!recurringEndEnabled) return;
    if (recurringEndPresetMonths == null) return;
    const nextEndDate = addCivilMonths(civilDate, recurringEndPresetMonths);
    if (nextEndDate === recurringEndDate) return;
    setRecurringEndDate(nextEndDate);
  }, [civilDate, recurringEndEnabled, recurringEndDate, recurringEndPresetMonths]);

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
          seedOverrideDrafts(detail.exercises),
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

  const exerciseOverrides = useMemo(
    () => buildExerciseOverrides(templateDetail, overrideDrafts),
    [overrideDrafts, templateDetail],
  );

  // #294 — civil dates the recurrence will land on, for the calendar preview.
  // Mirrors the rule built in `onSubmit` and expands it with the SAME
  // `expandRecurrenceDates` the assignTemplateRecurring action uses, so the
  // highlighted days are exactly the sessions that will be created. "once" →
  // no extra highlight (just the single selected day).
  const previewDates = useMemo<Date[]>(() => {
    if (mode === "once") return [];
    const recurrence: ExpandableRecurrence = buildAssignRecurrence(mode, {
      civilDate,
      recurringWeekdays,
      recurringEveryN,
    });
    const dates = expandRecurrenceDates(
      recurrence,
      civilDate,
      recurringEndEnabled ? recurringEndDate : undefined,
    );
    return dates.map(parseCivilToLocalDate);
  }, [
    mode,
    recurringWeekdays,
    recurringEveryN,
    civilDate,
    recurringEndEnabled,
    recurringEndDate,
  ]);

  function toggleWeekday(idx: number) {
    // At least one weekday must remain selected.
    setRecurringWeekdays((prev) => toggleWeekdayIn(prev, idx));
  }

  async function onSubmit() {
    // #307 — unreachable while the CTA is disabled: the submit button is
    // `disabled={submitting || !templateId}`, so this toast has never fired.
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
        const recurrence = buildAssignRecurrence(mode, {
          civilDate,
          recurringWeekdays,
          recurringEveryN,
        });
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
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">{t("templateLabel")}</label>
              <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1 rounded-full px-2.5 text-xs">
                <Link href="/gc-fitness/templates/new" target="_blank" rel="noopener">
                  <Plus className="h-3.5 w-3.5" />
                  {t("createTemplate")}
                </Link>
              </Button>
            </div>
            {/* 260529 scroll fix — rendered INLINE, not in a portaled Popover
                (see template-picker.tsx). */}
            <AssignTemplatePicker
              templates={templates}
              templatesLoading={templatesLoading}
              templateId={templateId}
              templatePickerOpen={templatePickerOpen}
              templateSearch={templateSearch}
              onToggle={() => setTemplatePickerOpen((prev) => !prev)}
              onTemplateSearchChange={setTemplateSearch}
              onSelect={(id) => {
                setTemplateId(id);
                setTemplatePickerOpen(false);
                setTemplateSearch("");
              }}
            />
          </div>

          <AssignRecurrenceFields
            civilDate={civilDate}
            mode={mode}
            setMode={setMode}
            recurringWeekdays={recurringWeekdays}
            toggleWeekday={toggleWeekday}
            recurringEveryN={recurringEveryN}
            setRecurringEveryN={setRecurringEveryN}
            recurringEveryNDraft={recurringEveryNDraft}
            setRecurringEveryNDraft={setRecurringEveryNDraft}
            recurringEndEnabled={recurringEndEnabled}
            setRecurringEndEnabled={setRecurringEndEnabled}
            recurringEndDate={recurringEndDate}
            setRecurringEndDate={setRecurringEndDate}
            recurringEndPresetMonths={recurringEndPresetMonths}
            setRecurringEndPresetMonths={setRecurringEndPresetMonths}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("dayLabel")}</label>
            <Calendar
              mode="single"
              selected={parseCivilToLocalDate(civilDate)}
              onSelect={(d) => {
                if (d) setCivilDate(formatLocalDateToCivil(d));
              }}
              modifiers={{ recurrence: previewDates }}
              modifiersClassNames={{ recurrence: RECURRENCE_PREVIEW_CLASS }}
            />
            <p className="text-xs text-muted-foreground">
              {t("scheduledFor", { date: civilDate })}
            </p>
            {mode !== "once" ? (
              <p className="text-xs font-medium text-primary">
                {t("recurrencePreviewCount", { count: previewDates.length })}
              </p>
            ) : null}
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
              <p className="text-xs text-muted-foreground">
                Si hace falta, también podés iniciar este workout desde el backoffice.
              </p>
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
              return (
                <AssignExerciseOverrideCard
                  key={`${exercise.exerciseId}-${exercise.index}`}
                  exercise={exercise}
                  idx={idx}
                  exercises={templateDetail.exercises}
                  draft={draft}
                  overrideDrafts={overrideDrafts}
                  setOverrideDrafts={setOverrideDrafts}
                />
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
