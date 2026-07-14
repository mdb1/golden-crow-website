"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeftIcon,
  ChevronRightIcon,
  Dumbbell,
  Loader2,
  User,
  XCircle,
} from "lucide-react";

import {
  getClientCalendarPeek,
  type ClientCalendarPeekPayload,
} from "@/lib/gc-fitness/client-calendar-peek-actions";
import type { MonthWorkoutChip } from "@/lib/gc-fitness/schedule-month-actions";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HabitChip } from "@/components/gc-fitness/schedule/habit-chip";
import { WorkoutDetailDialog } from "@/components/gc-fitness/schedule/workout-detail-dialog";

const DAY_MS = 86_400_000;

// Workout-only card row data. Habits render separately as compact
// HabitChip pills (issue #447 — same visual hierarchy as the Agenda).
type PeekItem = {
  id: string;
  /** Raw MonthWorkoutChip.id = the assignment doc id, used to open the
   * WorkoutDetailDialog (issue #449 follow-up). Distinct from `id`, which is
   * `workout:`-prefixed for React keys. */
  assignmentId: string;
  name: string;
  status: MonthWorkoutChip["status"];
  detail: string | null;
  /** Issue #449 — true when the client created this workout for themselves
   * (issue #392: `trainerId === clientId`). Renders a User icon beside the
   * name, mirroring the Agenda calendar's client-created badge. */
  selfAssigned: boolean;
};

export function ClientCalendarPeek({
  clientId,
  initialPayload,
}: {
  clientId: string;
  initialPayload: ClientCalendarPeekPayload;
}) {
  const locale = useLocale();
  const t = useTranslations("clients.detail.calendarPeek");
  const [peek, setPeek] = useState(initialPayload);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The WorkoutDetailDialog uses `useQuery`, so it needs a QueryClientProvider
  // ancestor — the client-detail route ships none. Mirror ClientSummaryLists'
  // local provider defaults (issue #449 follow-up).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  const [detailAssignmentId, setDetailAssignmentId] = useState<string | null>(
    null,
  );

  const days = useMemo(
    () => civilDaysInRange(peek.startCivil, peek.endCivil),
    [peek.startCivil, peek.endCivil],
  );
  const totals = useMemo(
    () =>
      days.reduce(
        (acc, day) => {
          acc.workouts += peek.calendar.workoutsByDay[day]?.length ?? 0;
          acc.habits += peek.calendar.habitsByDay[day]?.length ?? 0;
          return acc;
        },
        { workouts: 0, habits: 0 },
      ),
    [days, peek.calendar.habitsByDay, peek.calendar.workoutsByDay],
  );

  const scheduleHref = `/gc-fitness/schedule?month=${peek.anchorCivil.slice(
    0,
    7,
  )}&clientIds=${encodeURIComponent(clientId)}`;

  async function loadAnchor(anchorCivil: string) {
    setLoading(true);
    setError(null);
    try {
      const next = await getClientCalendarPeek({ clientId, anchorCivil });
      setPeek(next);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  const rangeTitle = formatRange(peek.startCivil, peek.endCivil, locale);
  const isOnTodayWeek = peek.anchorCivil === peek.todayCivil;

  return (
   <QueryClientProvider client={queryClient}>
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium">
            <CalendarDays className="size-4" />
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {rangeTitle} · {t("rangeSummary", totals)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ‹ [week range] › — mirrors the Agenda month-calendar rangeNav. */}
          <div className="flex items-center gap-1 rounded-full border bg-background p-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              disabled={loading}
              onClick={() => void loadAnchor(addCivilDays(peek.anchorCivil, -7))}
              aria-label={t("previousWeek")}
              title={t("previousWeek")}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="min-w-0 flex-1 truncate px-2 text-center text-sm font-semibold tracking-tight sm:min-w-[13ch] sm:flex-none">
              {rangeTitle}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              disabled={loading}
              onClick={() => void loadAnchor(addCivilDays(peek.anchorCivil, 7))}
              aria-label={t("nextWeek")}
              title={t("nextWeek")}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>

          {/* Separate jump-to-today button, disabled on today's week. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-full"
            disabled={loading || isOnTodayWeek}
            onClick={() => void loadAnchor(peek.todayCivil)}
          >
            {t("today")}
          </Button>

          <Button variant="outline" size="sm" className="h-9 rounded-full" asChild>
            <Link href={scheduleHref}>
              {t("openSchedule")}
              <ArrowUpRight className="ml-1.5 size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("loading")}
        </div>
      ) : null}

      {error ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[780px] grid-cols-7 gap-2 xl:min-w-0">
          {days.map((day) => {
            const workouts = peek.calendar.workoutsByDay[day] ?? [];
            const habits = peek.calendar.habitsByDay[day] ?? [];
            const workoutItems = buildWorkoutItems(workouts, t);
            const isToday = day === peek.todayCivil;

            return (
              <div
                key={day}
                className={cn(
                  "flex min-h-48 flex-col rounded-lg border bg-background p-2",
                  isToday && "border-primary bg-primary/5",
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">
                      {formatCivilDateLabel(day, { weekday: "short" }, locale)}
                    </p>
                    <p className="text-base font-semibold tabular-nums">
                      {day.slice(8, 10)}
                    </p>
                  </div>
                  {isToday ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                      {t("today")}
                    </span>
                  ) : null}
                </div>

                {workoutItems.length === 0 && habits.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-md border border-dashed px-2 text-center text-xs text-muted-foreground">
                    {t("emptyDay")}
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col gap-1.5">
                    {workoutItems.map((item) => (
                      <PeekItemRow
                        key={item.id}
                        item={item}
                        onOpenDetail={setDetailAssignmentId}
                      />
                    ))}
                    {habits.length > 0 ? (
                      <div className="flex min-w-0 flex-wrap gap-1">
                        {habits.map((h) => (
                          <HabitChip
                            key={h.id}
                            habit={h}
                            title={`${h.habitName} · ${t(`habitStatus.${h.status}`)}`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>

    {detailAssignmentId ? (
      <WorkoutDetailDialog
        open
        onOpenChange={(open) => !open && setDetailAssignmentId(null)}
        assignmentId={detailAssignmentId}
        onDeleted={() => {
          setDetailAssignmentId(null);
          // Refresh the currently-viewed week so an edit/delete reflects here.
          void loadAnchor(peek.anchorCivil);
        }}
      />
    ) : null}
   </QueryClientProvider>
  );
}

function PeekItemRow({
  item,
  onOpenDetail,
}: {
  item: PeekItem;
  onOpenDetail: (assignmentId: string) => void;
}) {
  const t = useTranslations("clients.detail.calendarPeek");
  const Icon = itemIcon(item);
  return (
    <button
      type="button"
      onClick={() => onOpenDetail(item.assignmentId)}
      className={cn(
        "flex w-full min-w-0 items-start gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors hover:border-primary/50 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        itemClassName(item),
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1">
          <span className="truncate font-medium">{item.name}</span>
          {/* Issue #449 — client self-assigned workout marker (same User
              icon the Agenda calendar's chips use). */}
          {item.selfAssigned ? (
            <span title={t("clientCreated")} className="inline-flex shrink-0">
              <User
                className="size-3 shrink-0 opacity-70"
                aria-label={t("clientCreated")}
              />
            </span>
          ) : null}
        </p>
        {item.detail ? (
          <p className="truncate text-[10px] opacity-75">{item.detail}</p>
        ) : null}
      </div>
    </button>
  );
}

function buildWorkoutItems(
  workouts: MonthWorkoutChip[],
  t: ReturnType<typeof useTranslations>,
): PeekItem[] {
  return workouts.map((workout): PeekItem => ({
    id: `workout:${workout.id}`,
    assignmentId: workout.id,
    name: workout.templateName,
    status: workout.status,
    detail: workout.templateTag
      ? `${t(`workoutStatus.${workout.status}`)} · ${workout.templateTag}`
      : t(`workoutStatus.${workout.status}`),
    selfAssigned: workout.selfAssigned,
  }));
}

function itemIcon(item: PeekItem) {
  if (item.status === "completed") return CheckCircle2;
  if (item.status === "missed") return XCircle;
  return Dumbbell;
}

function itemClassName(item: PeekItem): string {
  if (item.status === "completed") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200";
  }
  if (item.status === "missed") {
    return "border-rose-400/40 bg-rose-500/10 text-rose-900 dark:text-rose-200";
  }
  if (item.status === "started") {
    return "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200";
  }
  return "border-border bg-muted/40 text-foreground";
}

function civilDaysInRange(startCivil: string, endCivil: string): string[] {
  const days: string[] = [];
  for (
    let day = startCivil;
    day <= endCivil && days.length < 14;
    day = addCivilDays(day, 1)
  ) {
    days.push(day);
  }
  return days;
}

function addCivilDays(civilDate: string, days: number): string {
  return formatCivilDate(
    new Date(parseCivilDate(civilDate).getTime() + days * DAY_MS),
  );
}

function formatRange(startCivil: string, endCivil: string, locale: string): string {
  return `${formatCivilDateLabel(startCivil, { day: "numeric", month: "short" }, locale)} - ${formatCivilDateLabel(
    endCivil,
    { day: "numeric", month: "short" },
    locale,
  )}`;
}

function parseCivilDate(civilDate: string): Date {
  const [year, month, day] = civilDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatCivilDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
