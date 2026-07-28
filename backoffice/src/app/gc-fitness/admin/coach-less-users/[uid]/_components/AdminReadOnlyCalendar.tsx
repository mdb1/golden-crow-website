"use client";

// AdminReadOnlyCalendar.tsx
//
// Read-only month calendar for the god-mode coach-less profile.
//
// WHY NOT REUSE THE COACH'S CALENDAR: `ClientCalendarPeek` / the Agenda
// `MonthCalendar` carry drag-and-drop rescheduling, move dialogs and assign
// modals, and refetch through trainer-gated actions. Every admin drill-down in
// this codebase is deliberately READ-ONLY, so bending those components would
// both destabilise the coach's surface and hand an operator mutation
// affordances they must not have. This renders the SAME `MonthCalendarPayload`
// — the data path is shared, only the interaction surface differs.
//
// Month navigation calls `listMonthForClientAsAdmin`, which re-verifies the
// admin AND the coach/client relationship on every hop (the uid in the closure
// is never trusted server-side).

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { ChevronLeft, ChevronRight, Dumbbell, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  chunkWeeks,
  monthGridDays,
  monthLabel,
  nextMonthFirst,
  previousMonthFirst,
} from "@/lib/gc-fitness/month-grid";
import {
  listMonthForClientAsAdmin,
  type MonthCalendarPayload,
} from "@/lib/gc-fitness/schedule-month-actions";

const WEEKDAY_KEYS = [
  "2026-07-06", // Mon … a known Monday-start week, formatted per locale below.
  "2026-07-07",
  "2026-07-08",
  "2026-07-09",
  "2026-07-10",
  "2026-07-11",
  "2026-07-12",
];

/** Workout chip colouring by status — same semantics as the coach calendar. */
const WORKOUT_STATUS_CLASS: Record<string, string> = {
  completed:
    "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  started: "border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-300",
  missed: "border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-300",
  scheduled: "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

const HABIT_STATUS_CLASS: Record<string, string> = {
  done: "bg-emerald-500",
  missed: "bg-rose-500",
  scheduled: "bg-muted-foreground/40",
};

export function AdminReadOnlyCalendar({
  coachUid,
  clientId,
  todayCivil,
  initialMonthFirst,
  initialPayload,
}: {
  /** For a coach-less user this equals `clientId` (self-as-coach). */
  coachUid: string;
  clientId: string;
  todayCivil: string;
  initialMonthFirst: string;
  initialPayload: MonthCalendarPayload;
}) {
  const locale = useLocale();
  const [monthCivil, setMonthCivil] = useState(initialMonthFirst);
  const [payload, setPayload] = useState(initialPayload);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function goToMonth(nextMonth: string) {
    setError(null);
    startTransition(async () => {
      try {
        const next = await listMonthForClientAsAdmin({
          coachUid,
          clientId,
          monthFirstCivil: nextMonth,
          todayCivil,
        });
        setMonthCivil(nextMonth);
        setPayload(next);
      } catch {
        setError("Could not load that month.");
      }
    });
  }

  const weeks = chunkWeeks(monthGridDays(monthCivil));
  const weekdayLabels = WEEKDAY_KEYS.map((iso) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    ),
  );

  const monthWorkouts = Object.entries(payload.workoutsByDay).reduce(
    (n, [, chips]) => n + chips.length,
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Previous month"
            disabled={isPending}
            onClick={() => goToMonth(previousMonthFirst(monthCivil))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium capitalize">
            {monthLabel(monthCivil, locale)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Next month"
            disabled={isPending}
            onClick={() => goToMonth(nextMonthFirst(monthCivil))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {monthWorkouts} workout{monthWorkouts === 1 ? "" : "s"} this month
          {isPending ? " · loading…" : ""}
        </span>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[38rem]">
          <div className="grid grid-cols-7 gap-1 pb-1">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((day) => {
              const workouts = payload.workoutsByDay[day.civil] ?? [];
              const habits = payload.habitsByDay[day.civil] ?? [];
              const isToday = day.civil === todayCivil;
              return (
                <div
                  key={day.civil}
                  className={cn(
                    "min-h-[5.5rem] rounded-lg border p-1.5 text-xs",
                    day.inMonth ? "bg-card" : "bg-muted/30 opacity-60",
                    isToday && "border-primary ring-1 ring-primary/40",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 text-[11px] tabular-nums",
                      isToday ? "font-semibold text-primary" : "text-muted-foreground",
                    )}
                  >
                    {day.dayOfMonth}
                  </div>

                  <div className="flex flex-col gap-1">
                    {workouts.map((chip) => (
                      <div
                        key={chip.id}
                        title={`${chip.templateName} · ${chip.status}`}
                        className={cn(
                          "flex items-center gap-1 truncate rounded border px-1 py-0.5",
                          WORKOUT_STATUS_CLASS[chip.status] ??
                            WORKOUT_STATUS_CLASS.scheduled,
                        )}
                      >
                        {chip.selfAssigned ? (
                          <User className="size-3 shrink-0" aria-hidden />
                        ) : (
                          <Dumbbell className="size-3 shrink-0" aria-hidden />
                        )}
                        <span className="truncate">{chip.templateName}</span>
                      </div>
                    ))}
                  </div>

                  {habits.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {habits.map((habit) => (
                        <span
                          key={habit.id}
                          title={`${habit.habitName} · ${habit.status}`}
                          className={cn(
                            "size-1.5 rounded-full",
                            HABIT_STATUS_CLASS[habit.status] ??
                              HABIT_STATUS_CLASS.scheduled,
                          )}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <LegendDot className="bg-amber-500" label="scheduled" />
        <LegendDot className="bg-sky-500" label="started" />
        <LegendDot className="bg-emerald-500" label="completed" />
        <LegendDot className="bg-rose-500" label="missed" />
        <span className="inline-flex items-center gap-1">
          <User className="size-3" aria-hidden /> self-created
        </span>
        <span>· small dots = habits</span>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}
