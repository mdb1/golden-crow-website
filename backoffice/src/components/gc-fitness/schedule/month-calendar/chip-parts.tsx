"use client";

// Small pieces of the schedule calendar's chips (#507 — split out of
// month-calendar.tsx): the logged-work summaries, the status glyph / dogear
// and the per-cell "+" popover.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, Dumbbell, PlusIcon, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonthWorkoutChip } from "@/lib/gc-fitness/schedule-month-actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * #785 — "4 ejercicios · 12 series · 38 min", from what was actually performed.
 *
 * The reported gap: a coach opens a client's calendar and sees two chips that
 * say **"Entreno libre"** and nothing else — "¿qué son esos libres?". They are
 * workouts the athlete started empty and built while training (#541), so their
 * NAME is a placeholder by construction and no amount of reading it will ever
 * answer the question. What was done is in the log, which the month query
 * already loads.
 *
 * Returns null when nothing was logged, so a scheduled-but-not-done chip is
 * unchanged.
 */
export function workoutSummaryLabel(
  logged: MonthWorkoutChip["logged"],
  t: ReturnType<typeof useTranslations>,
): string | null {
  if (!logged) return null;
  if (logged.sets === 0) return t("loggedNothing");
  return [
    t("loggedExercises", { count: logged.exercises }),
    t("loggedSets", { count: logged.sets }),
    logged.durationMinutes !== null ? t("loggedMinutes", { count: logged.durationMinutes }) : null,
    logged.volumeKg !== null ? t("loggedVolume", { count: logged.volumeKg }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The compact suffix a FREE workout's chip carries inline (the month grid has
 * room for a few characters, not for the whole summary — that lives in the
 * tooltip). Only free workouts get it: a named routine already says what it is,
 * and repeating "· 4 ej" on every completed chip is noise.
 */
export function inlineWorkoutSummary(
  w: MonthWorkoutChip,
  t: ReturnType<typeof useTranslations>,
): string | null {
  if (w.plannedExercises > 0) return null;
  if (!w.logged || w.logged.sets === 0) return null;
  return ` · ${t("loggedExercises", { count: w.logged.exercises })}`;
}

export function StatusGlyph({ status }: { status: MonthWorkoutChip["status"] }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-3 text-success" />;
  }
  if (status === "missed") {
    return <XCircle className="size-3 text-danger" />;
  }
  return <Dumbbell className="size-3 opacity-70" />;
}

/**
 * Status indicator rendered as a "dogear" — a 12×12 folded-corner flag
 * pinned to the top-right of the chip. The triangle is a clip-path so
 * the colored fill matches the status tone while the chip's background
 * stays readable underneath.
 *
 * Visual reads at a glance:
 *   - emerald = completed
 *   - rose    = missed
 *   - amber   = scheduled (still pending)
 */
export function StatusDogear({ status }: { status: MonthWorkoutChip["status"] }) {
  const tone =
    status === "completed"
      ? "bg-success"
      : status === "missed"
          ? "bg-danger"
          : "bg-warning";
  const titleLabel =
    status === "completed"
      ? "Completado"
      : status === "missed"
          ? "No realizado"
          : "Programado";
  return (
    <span
      aria-label={titleLabel}
      title={titleLabel}
      className={cn(
        "pointer-events-none absolute right-0 top-0 size-3",
        tone,
      )}
      style={{ clipPath: "polygon(100% 0, 100% 100%, 0 0)" }}
    />
  );
}

/**
 * Per-cell "+" popover. Click reveals two options (Workout / Habit) so
 * the trainer can add either kind of session from a single affordance.
 * Closes on selection — the parent fires the correct flow.
 */
export function AddPopover({
  civil,
  onPick,
  showWorkouts,
  showHabits,
  variant = "icon",
}: {
  civil: string;
  onPick: (kind: "workout" | "habit") => void;
  showWorkouts: boolean;
  showHabits: boolean;
  /** "icon" = compact reveal-on-hover "+" (month grid header). "cell" = full
   *  dashed add affordance filling an empty week/3-day cell. "row" = slim
   *  always-visible "+" mini-row appended below existing chips so a week/3-day
   *  cell that already has content can still take another workout/habit. */
  variant?: "icon" | "cell" | "row";
}) {
  const t = useTranslations("schedule.calendar");
  const [open, setOpen] = useState(false);
  const enabled: Array<"workout" | "habit"> = [
    ...(showWorkouts ? (["workout"] as const) : []),
    ...(showHabits ? (["habit"] as const) : []),
  ];

  const iconTriggerClass = cn(
    "rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:opacity-100",
    // Always visible on touch (no hover); reveal-on-hover only where hover exists.
    open
      ? "opacity-100"
      : "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
  );
  const cellTriggerClass =
    "flex min-h-[40px] w-full flex-1 items-center justify-center rounded-xl border border-dashed border-foreground/20 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary";
  const rowTriggerClass =
    "flex h-6 w-full items-center justify-center rounded-md border border-dashed border-foreground/15 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary";
  const triggerClass =
    variant === "cell"
      ? cellTriggerClass
      : variant === "row"
        ? rowTriggerClass
        : iconTriggerClass;
  const plusClass = variant === "cell" ? "size-4" : "size-3.5";

  // Neither type shown → nothing to add.
  if (enabled.length === 0) return null;

  // Exactly one type shown → skip the menu, fire the add flow directly.
  if (enabled.length === 1) {
    const only = enabled[0];
    return (
      <button
        type="button"
        className={triggerClass}
        aria-label={
          only === "workout"
            ? t("addWorkoutOnAria", { date: civil })
            : t("addHabitOnAria", { date: civil })
        }
        onClick={() => onPick(only)}
      >
        <PlusIcon className={plusClass} />
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={triggerClass}
          aria-label={t("addOnAria", { date: civil })}
        >
          <PlusIcon className={plusClass} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-44 p-1"
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => {
            onPick("workout");
            setOpen(false);
          }}
        >
          <Dumbbell className="size-4 text-warning" />
          {t("addMenuWorkout")}
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => {
            onPick("habit");
            setOpen(false);
          }}
        >
          <Circle className="size-4 text-success" />
          {t("addMenuHabit")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
