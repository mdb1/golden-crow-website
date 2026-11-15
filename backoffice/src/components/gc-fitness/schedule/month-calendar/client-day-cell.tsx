"use client";

// One client × day cell of the week / 3-day "client rows" layout (#507 —
// split out of month-calendar.tsx).

import { useTranslations } from "next-intl";
import { ArrowRightLeft, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonthHabitChip, MonthWorkoutChip } from "@/lib/gc-fitness/schedule-month-actions";
import { ClientOwnedBadge, HabitChip, InheritedBadge } from "../habit-chip";

import { formatMovedFromLabel } from "@/lib/gc-fitness/month-calendar-model";
import { workoutChipClass } from "./palette";
import { AddPopover, inlineWorkoutSummary, StatusDogear, workoutSummaryLabel } from "./chip-parts";

export interface ClientDayCellProps {
  civil: string;
  isToday: boolean;
  birthdayBadge: string;
  isBirthday: boolean;
  birthdayAge: number | null;
  locale: string;
  workouts: MonthWorkoutChip[];
  habits: MonthHabitChip[];
  showWorkouts: boolean;
  showHabits: boolean;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStartChip: (chip: MonthWorkoutChip) => void;
  onDragEndChip: () => void;
  onClickChip: (chip: MonthWorkoutChip) => void;
  onClickHabit: (habit: MonthHabitChip) => void;
  onClickAdd: (kind: "workout" | "habit") => void;
}

/**
 * A single client × day cell for the week / 3-day "client rows" table layout
 * (the screenshot reference). Holds that client's workout chips + a habit
 * count chip, or a subtle dashed "+" add affordance when the day is empty.
 * Shares all the same interactions (drag-to-move, click-to-detail, add) as the
 * month grid's `DayCell`.
 */
export function ClientDayCell({
  civil,
  isToday,
  birthdayBadge,
  isBirthday,
  birthdayAge,
  locale,
  workouts,
  habits,
  showWorkouts,
  showHabits,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStartChip,
  onDragEndChip,
  onClickChip,
  onClickHabit,
  onClickAdd,
}: ClientDayCellProps) {
  // Issue #449 — chip tooltip suffix for client self-assigned workouts.
  const t = useTranslations("schedule.calendar");
  const isEmpty = workouts.length === 0 && habits.length === 0;
  return (
    <td
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group/cell border-b border-l p-1.5 align-top transition-colors",
        isToday && "bg-primary/[0.06]",
        isDragOver && "bg-primary/10",
      )}
    >
      <div className="flex min-h-[88px] min-w-0 flex-col gap-1.5">
        {isBirthday ? (
          <span className="inline-flex w-fit items-center rounded-full border border-highlight/30 bg-highlight/10 px-2 py-0.5 text-[10px] font-medium text-highlight">
            🎂 {birthdayBadge}
            {birthdayAge != null ? ` · ${birthdayAge} ${locale === "es" ? "años" : "years"}` : ""}
          </span>
        ) : null}
        {workouts.map((w) => {
          const movedFromLabel = w.originallyScheduledFor
            ? formatMovedFromLabel(w.originallyScheduledFor, w.scheduledFor)
            : null;
          return (
            <button
              key={w.id}
              type="button"
              // Issue #449 — self-assigned chips are NOT draggable: dropping
              // would hit moveAssignment's ownership throw (the coach must
              // not move a client's own workout).
              draggable={!w.selfAssigned && !w.inherited}
              onDragStart={(e) => {
                if (w.selfAssigned || w.inherited) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", w.id);
                onDragStartChip(w);
              }}
              onDragEnd={onDragEndChip}
              onClick={() => onClickChip(w)}
              className={cn(
                // Same chip styling as the month grid's DayCell so workouts
                // read identically across all views (the trainer preferred the
                // 30-day look): compact rectangle + status dog-ear.
                "group/chip relative flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded border px-1.5 py-1 pr-3 text-left text-[11px] leading-tight hover:brightness-95",
                workoutChipClass(w.status),
              )}
              title={[
                w.templateName,
                w.plannedExercises === 0 ? t("freeWorkoutHint") : null,
                workoutSummaryLabel(w.logged, t),
                movedFromLabel,
                w.selfAssigned ? t("clientCreatedBadge") : null,
                w.inherited ? t("inheritedBadge") : null,
              ]
                .filter(Boolean)
                .join(" — ")}
            >
              <Dumbbell className="size-3 shrink-0 opacity-80" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {w.templateName}
                {inlineWorkoutSummary(w, t) ? (
                  <span className="font-normal opacity-70">
                    {inlineWorkoutSummary(w, t)}
                  </span>
                ) : null}
              </span>
              {w.selfAssigned ? <ClientOwnedBadge /> : null}
              {w.inherited ? <InheritedBadge /> : null}
              {movedFromLabel ? (
                <ArrowRightLeft
                  className="size-3 shrink-0 opacity-70"
                  aria-label={movedFromLabel}
                />
              ) : null}
              <StatusDogear status={w.status} />
            </button>
          );
        })}

        {/* Individual habit chips (one per habit) so the coach can see and open
            each one. Same compact, wrapping "pill" treatment as the month
            grid's DayCell — visually distinct from the rectangular workout
            chips (the trainer preferred the 30-day look across all views). */}
        {habits.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-1">
            {habits.map((h) => (
              <HabitChip
                key={h.id}
                habit={h}
                onClick={() => onClickHabit(h)}
                title={`${h.habitName} · ${h.status}`}
              />
            ))}
          </div>
        ) : null}

        {/* The add affordance is ALWAYS present: a prominent dashed fill when
            the cell is empty, and a slim "+" mini-row below the chips when it
            already has content — so a day with a workout/habit can still take
            another one (this was missing, the "+" only showed on empty cells). */}
        <AddPopover
          civil={civil}
          onPick={onClickAdd}
          showWorkouts={showWorkouts}
          showHabits={showHabits}
          variant={isEmpty ? "cell" : "row"}
        />
      </div>
    </td>
  );
}
