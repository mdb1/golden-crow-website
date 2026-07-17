import { getTranslations } from "next-intl/server";

import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { isHabitNotDeleted } from "@/lib/gc-fitness/habit-visibility";
import type { ClientGoalRow } from "@/lib/gc-fitness/client-goal-actions";
import { Badge } from "@/components/ui/badge";
import { ClientSummaryLists } from "./ClientSummaryLists";
const WEEKDAY_LABELS_WORKOUT: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

export async function ClientSummaryCard({
  clientId,
  clientName,
  timezone,
  goals,
}: {
  clientId: string;
  clientName: string;
  timezone: string;
  goals: ClientGoalRow[];
}) {
  const t = await getTranslations("clients.detail.summary");
  const db = gcFitnessFirestore();

  // Fail-soft on summary data: this card must never break the whole
  // client detail route. Some projects can be temporarily missing the
  // compound index required by strict status+date filters.
  const [assignmentsSnap, habitsSnap] = await Promise.all([
    db
      .collection(FirestoreCollections.workoutAssignments)
      .where("clientId", "==", clientId)
      .orderBy("scheduledFor", "asc")
      .limit(80)
      .get()
      .catch(() => ({ docs: [] as Array<{ id: string; data: () => Record<string, unknown> }> })),
    // Issue #437/#400: fetch by clientId only; filter `deleted === true` in
    // memory (isHabitNotDeleted) below. A `.where("deleted","==",false)`
    // equality drops client-created habits that never write the field. PR #230.
    // WR-03: the cap counts SOFT-DELETED docs too (soft-delete is the only
    // delete path, so they accumulate over a client's lifetime) — raised
    // 40 → 200 so live habits don't silently drop off the summary card;
    // truncation warning below when the raw fetch hits the cap.
    db
      .collection(FirestoreCollections.habits)
      .where("clientId", "==", clientId)
      .limit(200)
      .get()
      .catch(() => ({ docs: [] as Array<{ id: string; data: () => Record<string, unknown> }> })),
  ]);

  const workouts = assignmentsSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      if (data.status !== "scheduled") return null;
      const nameValue = (data.templateSnapshot as { name?: unknown } | undefined)?.name;
      const recurrence = recurrenceLabel(data.recurrence as Record<string, unknown> | undefined, t);
      return {
        id: doc.id,
        name: localizedName(nameValue, t("untitledWorkout")),
        recurrence,
        scheduledFor: typeof data.scheduledFor === "string" ? data.scheduledFor : "",
        isRecurring: isRecurringRecurrence(data.recurrence as Record<string, unknown> | undefined),
      };
    })
    .filter((row): row is { id: string; name: string; recurrence: string; scheduledFor: string; isRecurring: boolean } => row !== null)
    .slice(0, 30);

  // Overall workout streak — consecutive completed (no-miss) past
  // assignments. Mirrors the iOS dashboard chip's `workoutStreak` so
  // trainer + client see the same number. Uses the SAME 80-doc fetch
  // above (no extra query).
  const todayCivil = civilDateToday(timezone);
  const workoutStreak = computeWorkoutStreak(assignmentsSnap.docs, todayCivil);
  const visibleWorkouts = workouts.filter((row) => row.isRecurring || row.scheduledFor >= todayCivil);
  const pastWorkouts = workouts.filter((row) => !row.isRecurring && row.scheduledFor < todayCivil);
  const workoutsGrouped = groupWorkouts(visibleWorkouts);

  if (habitsSnap.docs.length >= 200) {
    // WR-03: raw fetch filled the cap — soft-deleted docs consume the
    // budget, so live habits may be missing from the card.
    console.warn(
      "[gc-fitness/client-summary] habit fetch hit its cap — live habits may be truncated",
      { clientId, cap: 200 },
    );
  }
  const habits = habitsSnap.docs
    .filter((doc) => isHabitNotDeleted(doc.data() as Record<string, unknown>))
    .map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      name: localizedName(data.name, t("untitledHabit")),
      cadence: habitCadenceLabel(data, t),
      startsOn: typeof data.startsOn === "string" ? data.startsOn : "",
      endsOn: typeof data.endsOn === "string" ? data.endsOn : null,
    };
  });
  const activeHabits = habits.filter((row) => !row.endsOn || row.endsOn >= todayCivil);
  const pastHabits = habits.filter((row) => row.endsOn && row.endsOn < todayCivil);

  // Tally goals by horizon for the compact summary chip row.
  const goalsByHorizon = goals.reduce(
    (acc, g) => {
      if (g.status !== "active") return acc;
      if (g.horizon === "short") acc.short += 1;
      else if (g.horizon === "medium") acc.medium += 1;
      else if (g.horizon === "long") acc.long += 1;
      return acc;
    },
    { short: 0, medium: 0, long: 0 },
  );

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {workoutStreak >= 2 ? (
          <Badge
            variant="secondary"
            className="gap-1 self-start text-xs"
            title={t("workoutStreakTooltip", { count: workoutStreak })}
          >
            <span aria-hidden>{workoutStreak >= 5 ? "🔥🔥" : "🔥"}</span>
            {t("workoutStreakLabel", { count: workoutStreak })}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Workouts + Habits — interactive (tap a row to open its detail /
            edit dialog, mirroring the agenda). Rendered by a client island so
            the row taps can open the agenda's `useQuery`-backed dialogs while
            this card stays a Server Component data source. */}
        <ClientSummaryLists
          clientName={clientName}
          todayCivil={todayCivil}
          workouts={workoutsGrouped.map((row) => ({
            id: row.id,
            name: row.name,
            recurrence: row.recurrence,
            count: row.count,
            nextDate: row.nextDate,
          }))}
          habits={activeHabits}
          labels={{
            workouts: t("workouts"),
            noWorkouts: t("noWorkouts"),
            habits: t("habits"),
            noHabits: t("noHabits"),
          }}
          pastWorkoutsSlot={
            pastWorkouts.length > 0 ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {t("showPastWorkouts", { count: pastWorkouts.length })}
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {groupWorkouts(pastWorkouts).map((row) => (
                    <li
                      key={row.key}
                      className="rounded-md border bg-muted/60 px-2 py-1.5"
                    >
                      <p className="font-medium">{row.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {row.recurrence} · {row.nextDate}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : undefined
          }
          pastHabitsSlot={
            pastHabits.length > 0 ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {t("showPastHabits", { count: pastHabits.length })}
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {pastHabits.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-md border bg-muted/60 px-2 py-1.5"
                    >
                      <p className="font-medium">{row.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {row.cadence}
                        {row.endsOn
                          ? ` · ${pastHabitDateLabel({
                              startsOn: row.startsOn,
                              removedFrom: addCivilDays(row.endsOn, 1),
                              t,
                            })}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : undefined
          }
        />

        {/* Goals — compact chip view */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("goals")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <GoalChip label="Corto" count={goalsByHorizon.short} tone="emerald" />
            <GoalChip label="Medio" count={goalsByHorizon.medium} tone="amber" />
            <GoalChip label="Largo" count={goalsByHorizon.long} tone="sky" />
          </div>
          {goals.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noGoals")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {goals.slice(0, 4).map((goal) => (
                <li
                  key={goal.id}
                  className="rounded-md border bg-background px-2 py-1.5 text-xs"
                >
                  <p className="truncate font-medium">{goal.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {goal.horizon} · {goal.status}
                    {goal.targetDate ? ` · ${goal.targetDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function GoalChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "sky";
}) {
  const palette =
    count === 0
      ? "border-border bg-muted/40 text-muted-foreground"
      : tone === "emerald"
        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
        : tone === "amber"
          ? "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300"
          : "border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${palette}`}
    >
      {label}
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

function addCivilDays(civilDate: string, days: number): string {
  const [year, month, day] = civilDate.split("-").map(Number);
  if (!year || !month || !day) return civilDate;
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pastHabitDateLabel({
  startsOn,
  removedFrom,
  t,
}: {
  startsOn: string;
  removedFrom: string;
  t: (key: string, values?: Record<string, string>) => string;
}): string {
  if (startsOn) {
    return t("activeThenRemoved", { startsOn, removedFrom });
  }
  return t("removedFrom", { date: removedFrom });
}

function localizedName(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const localized = value as { en?: unknown; es?: unknown };
    if (typeof localized.en === "string" && localized.en.trim()) return localized.en;
    if (typeof localized.es === "string" && localized.es.trim()) return localized.es;
  }
  return fallback;
}

function recurrenceLabel(
  recurrence: Record<string, unknown> | undefined,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (!recurrence || typeof recurrence.kind !== "string") return t("once");
  if (recurrence.kind === "weekly") {
    const weekday = Number(recurrence.weekday);
    const dayLabel = Number.isFinite(weekday) ? WEEKDAY_LABELS_WORKOUT[weekday] : null;
    return dayLabel ? `${t("weekly")} · ${dayLabel}` : t("weekly");
  }
  if (recurrence.kind === "weekly_days") {
    const days = Array.isArray(recurrence.weekdays)
      ? (recurrence.weekdays as number[])
          .map((d) => WEEKDAY_LABELS_WORKOUT[d])
          .filter((v): v is string => Boolean(v))
      : [];
    return days.length > 0 ? `${t("weeklyDays")} · ${days.join(", ")}` : t("weeklyDays");
  }
  if (recurrence.kind === "every_n_days") return t("everyNDays", { everyN: Number(recurrence.everyN ?? 1) });
  if (recurrence.kind === "monthly") {
    return t("monthlyOnDay", { day: Number(recurrence.dayOfMonth ?? 1) });
  }
  return t("custom");
}

function isRecurringRecurrence(recurrence: Record<string, unknown> | undefined): boolean {
  if (!recurrence || typeof recurrence.kind !== "string") return false;
  return recurrence.kind !== "one-time";
}

function habitCadenceLabel(
  habit: Record<string, unknown>,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (habit.scheduleType === "one-time") return t("once");
  const cadence = typeof habit.scheduleCadence === "string" ? habit.scheduleCadence : "daily";
  if (cadence === "weekly") {
    const weekdays = Array.isArray(habit.scheduleWeekdays) ? (habit.scheduleWeekdays as number[]) : [];
    const mapped = weekdays
      .map((d) => WEEKDAY_LABELS_WORKOUT[d === 7 ? 0 : d])
      .filter((v): v is string => Boolean(v));
    return mapped.length > 0 ? `${t("weekly")} · ${mapped.join(", ")}` : t("weeklyCount", { count: 1 });
  }
  if (cadence === "monthly") {
    const monthDays = Array.isArray(habit.scheduleMonthDays)
      ? (habit.scheduleMonthDays as number[])
      : typeof habit.scheduleDayOfMonth === "number"
        ? [habit.scheduleDayOfMonth as number]
        : [];
    return monthDays.length > 0 ? `${t("monthlyCount", { count: monthDays.length })} · ${monthDays.join(", ")}` : t("monthlyCount", { count: 1 });
  }
  return t("daily");
}

/**
 * Mirrors GCFitnessCore `DashboardAggregator.workoutStreak` (Swift).
 * Walks past-or-today assignments in DESC scheduledFor order:
 *   - `.completed` → streak += 1
 *   - `.missed`     → break
 *   - `.scheduled` / `.started` past their `scheduledFor` → treat as
 *                     missed (rule layer will eventually auto-flip them
 *                     to `missed` via the user-midnight Cloud Function,
 *                     but until then they read as past-due).
 *   - Today's not-yet-finished assignment is the grace window — skipped,
 *                     neither breaks nor counts.
 *
 * Future-scheduled rows are excluded — they don't contribute or break.
 */
function computeWorkoutStreak(
  docs: Array<{ data: () => Record<string, unknown> }>,
  todayCivil: string,
): number {
  const rows = docs
    .map((doc) => {
      const data = doc.data();
      return {
        scheduledFor: typeof data.scheduledFor === "string" ? data.scheduledFor : "",
        status: typeof data.status === "string" ? data.status : "",
      };
    })
    .filter((row) => row.scheduledFor && row.scheduledFor <= todayCivil)
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));

  let streak = 0;
  for (const row of rows) {
    if (row.status === "completed") {
      streak += 1;
      continue;
    }
    if (row.status === "missed") return streak;
    // .scheduled / .started past their date — treat as miss unless it's
    // today (grace window).
    if (row.scheduledFor === todayCivil) continue;
    return streak;
  }
  return streak;
}

function groupWorkouts(
  rows: Array<{ id: string; name: string; recurrence: string; scheduledFor: string }>,
): Array<{ key: string; id: string; name: string; recurrence: string; count: number; nextDate: string }> {
  const map = new Map<
    string,
    { key: string; id: string; name: string; recurrence: string; count: number; nextDate: string }
  >();
  for (const row of rows) {
    const key = `${row.name}__${row.recurrence}`;
    const existing = map.get(key);
    if (!existing) {
      // `id` is the representative assignment for the group — the one whose
      // `scheduledFor` we surface as `nextDate`. Tapping the row opens THIS
      // assignment's detail dialog. Recurrence edits/deletes cascade across
      // the series via the dialog's recurrence-aware flow.
      map.set(key, {
        key,
        id: row.id,
        name: row.name,
        recurrence: row.recurrence,
        count: 1,
        nextDate: row.scheduledFor,
      });
      continue;
    }
    existing.count += 1;
    if (!existing.nextDate || (row.scheduledFor && row.scheduledFor < existing.nextDate)) {
      existing.nextDate = row.scheduledFor;
      existing.id = row.id;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
