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

import { useEffect, useState } from "react";
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
import { Calendar } from "@/components/ui/calendar";

import {
  assignTemplate,
  assignTemplateRecurring,
} from "@/lib/gc-fitness/workout-assignment-actions";
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

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

export function AssignTemplateModal({
  open,
  onOpenChange,
  clientId,
  defaultDate,
  trainerTimezone,
  onAssigned,
}: AssignTemplateModalProps) {
  const { data: templates, isLoading: templatesLoading } = useWorkoutTemplates();

  const [templateId, setTemplateId] = useState<string>("");
  const [civilDate, setCivilDate] = useState<string>(defaultDate);
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [meetingNotes, setMeetingNotes] = useState<string>("");
  const [mode, setMode] = useState<"once" | "weekly">("once");
  const [recurringWeekday, setRecurringWeekday] = useState<number>(
    parseCivilToLocalDate(defaultDate).getDay(),
  );
  const [recurringEndEnabled, setRecurringEndEnabled] = useState(false);
  const [recurringEndDate, setRecurringEndDate] = useState<string>(defaultDate);
  const [submitting, setSubmitting] = useState(false);

  // Reset the local form state when the modal opens with a new defaultDate.
  useEffect(() => {
    if (open) {
      setCivilDate(defaultDate);
      setTemplateId("");
      setScheduledTime("");
      setMeetingNotes("");
      setMode("once");
      setRecurringWeekday(parseCivilToLocalDate(defaultDate).getDay());
      setRecurringEndEnabled(false);
      setRecurringEndDate(defaultDate);
    }
  }, [open, defaultDate]);

  async function onSubmit() {
    if (!templateId) {
      toast.error("Pick a template first.");
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
        });
        toast.success("Template assigned.");
      } else {
        const result = await assignTemplateRecurring({
          templateId,
          clientId,
          startDate: civilDate,
          weekday: recurringWeekday,
          endDate: recurringEndEnabled ? recurringEndDate : undefined,
          scheduledTime: scheduledTime || undefined,
          meetingNotes: meetingNotes.trim() || undefined,
          timezone: trainerTimezone,
        });
        toast.success(`Recurring assignment created (${result.count} workouts).`);
      }
      onAssigned?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Assignment failed.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign a workout template</DialogTitle>
          <DialogDescription>
            Pick a template and confirm the day. Snapshot is frozen at submit
            time — editing the template later won&rsquo;t change this
            assignment.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    templatesLoading ? "Loading…" : "Choose a template"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name.en} · {t.tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Assignment mode</label>
              <Select
                value={mode}
                onValueChange={(value) => setMode(value as "once" | "weekly")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">One-time</SelectItem>
                  <SelectItem value="weekly">Weekly recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "weekly" ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Repeat on</label>
                <Select
                  value={String(recurringWeekday)}
                  onValueChange={(value) => setRecurringWeekday(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {mode === "weekly" ? (
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
                  Set end date
                </label>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">End date</label>
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
                    ? "Repeats weekly until this date."
                    : "No end date: creates the next 12 months."}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Day</label>
            <Calendar
              mode="single"
              selected={parseCivilToLocalDate(civilDate)}
              onSelect={(d) => {
                if (d) setCivilDate(formatLocalDateToCivil(d));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Scheduled for {civilDate}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Time</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(event) => setScheduledTime(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Optional for live or virtual sessions.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <label className="text-sm font-medium">Meeting notes</label>
              <textarea
                value={meetingNotes}
                onChange={(event) => setMeetingNotes(event.target.value)}
                placeholder="Zoom / Meet link, instructions, prep notes..."
                className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting || !templateId}
          >
            {submitting ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
