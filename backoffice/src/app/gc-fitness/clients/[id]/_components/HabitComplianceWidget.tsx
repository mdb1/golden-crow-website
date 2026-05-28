import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import type { HabitType } from "@/lib/gc-fitness/habit-schema";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export interface HabitComplianceWidgetProps {
  clientId: string;
  timezone: string;
}

interface HabitRow {
  id: string;
  name: string;
  ratio: number;
  pct: number;
  scheduledCount: number;
  completedCount: number;
  /** Recurrence-aware streak (consecutive scheduled completions up to today). */
  streak: number;
}

function buildLastSevenCivilDates(timezone: string): string[] {
  const dates: string[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    dates.push(civilDateFormat(d, timezone));
  }
  return dates;
}

function isHabitScheduledOnDate(habit: Record<string, unknown>, civilDate: string): boolean {
  const startsOn =
    typeof habit.startsOn === "string" && habit.startsOn.length > 0
      ? habit.startsOn
      : null;
  const endsOn =
    typeof habit.endsOn === "string" && habit.endsOn.length > 0
      ? habit.endsOn
      : null;

  if (startsOn && civilDate < startsOn) return false;
  if (endsOn && civilDate > endsOn) return false;

  const scheduleType = habit.scheduleType === "one-time" ? "one-time" : "recurring";
  if (scheduleType === "one-time") {
    return startsOn ? civilDate === startsOn : true;
  }

  const cadence =
    habit.scheduleCadence === "weekly" || habit.scheduleCadence === "monthly"
      ? habit.scheduleCadence
      : "daily";

  if (cadence === "daily") return true;

  const date = new Date(`${civilDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;

  if (cadence === "weekly") {
    const weekdays = Array.isArray(habit.scheduleWeekdays)
      ? (habit.scheduleWeekdays as number[])
      : [];
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const legacyWeekday = weekday === 7 ? 1 : weekday + 1;
    return weekdays.includes(weekday) || weekdays.includes(legacyWeekday);
  }

  const monthDays = Array.isArray(habit.scheduleMonthDays)
    ? (habit.scheduleMonthDays as number[])
    : typeof habit.scheduleDayOfMonth === "number"
      ? [habit.scheduleDayOfMonth]
      : [1];

  return monthDays.includes(date.getUTCDate());
}

export async function HabitComplianceWidget({ clientId, timezone }: HabitComplianceWidgetProps) {
  const t = await getTranslations("clients.detail.habitCompliance");
  const unnamed = t("unnamed");
  const db = gcFitnessFirestore();

  const habitsSnap = await db
    .collection(FirestoreCollections.habits)
    .where("clientId", "==", clientId)
    .where("deleted", "==", false)
    .get();

  const lastSevenDates = buildLastSevenCivilDates(timezone);
  const windowStart = lastSevenDates[0] ?? civilDateFormat(new Date(), timezone);
  // 90-day streak window — covers any realistic active streak we'd
  // want to advertise (a daily habit hit for 90 days reads "90+"; a
  // weekly habit hit once a week for 3 months reads ~12). Mirrors the
  // iOS TodaysHabitsViewModel's clientLogsStream window.
  const today = civilDateFormat(new Date(), timezone);
  const streakWindowStart = civilDateFormat(
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    timezone,
  );

  const rows: HabitRow[] = await Promise.all(
    habitsSnap.docs.map(async (h) => {
      const habit = h.data() as {
        name?: string | { en?: string; es?: string };
        type?: HabitType;
        targetValue?: number;
      } & Record<string, unknown>;

      // Fetch a 90-day window so the streak walk has enough history.
      // The 7-day compliance pills + the 90-day streak share this one
      // query.
      const logsSnap = await db
        .collection(FirestoreCollections.habitLogs)
        .where("habitId", "==", h.id)
        .where("civilDate", ">=", streakWindowStart)
        .orderBy("civilDate", "desc")
        .limit(120)
        .get();

      const completedDates = new Set<string>();
      const targetValue =
        typeof habit.targetValue === "number" ? habit.targetValue : undefined;
      const habitType = (habit.type ?? "binary") as HabitType;
      for (const doc of logsSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        if (data.deleted === true) continue;
        const date = typeof data.civilDate === "string" ? data.civilDate : "";
        if (!date) continue;

        const value = data.value;

        let completed = false;
        if (habitType === "binary") {
          completed = value === true;
        } else {
          const numeric = typeof value === "number" ? value : Number(value);
          completed = Number.isFinite(numeric) && (
            targetValue === undefined ? numeric > 0 : numeric >= targetValue
          );
        }

        if (completed) completedDates.add(date);
      }

      const scheduledDates = lastSevenDates.filter((d) => isHabitScheduledOnDate(habit, d));
      const denominator = scheduledDates.length;
      const numerator = scheduledDates.filter((d) => completedDates.has(d)).length;
      const ratio = denominator === 0 ? 1 : numerator / denominator;
      const clamped = Math.max(0, Math.min(1, ratio));

      const streak = computeHabitStreak(habit, completedDates, today);

      return {
        id: h.id,
        name: localizedName(habit.name, unnamed),
        ratio: clamped,
        pct: Math.round(clamped * 100),
        scheduledCount: denominator,
        completedCount: numerator,
        streak,
      };
    }),
  );

  rows.sort((a, b) => b.ratio - a.ratio);

  return (
    <section className="rounded-md border bg-card p-4">
      <h2 className="mb-3 font-medium">{t("title")}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-md border bg-muted/35 p-3 text-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">{row.name}</span>
                  {row.streak >= 3 ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 gap-1 px-1.5 py-0 text-[10px]"
                      title={t("streakTooltip", { count: row.streak })}
                    >
                      <span aria-hidden>{row.streak >= 10 ? "🔥🔥" : "🔥"}</span>
                      {row.streak}
                    </Badge>
                  ) : null}
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {row.pct}%
                </Badge>
              </div>
              <Progress value={row.pct} className="h-2.5 w-full" />
              <p className="mt-2 text-xs text-muted-foreground">
                {row.completedCount}/{row.scheduledCount || 0} {t("daysCompleted")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function localizedName(
  value: string | { en?: string; es?: string } | undefined,
  fallback: string,
): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (value && typeof value === "object") return value.en?.trim() || value.es?.trim() || fallback;
  return fallback;
}

/**
 * Mirrors GCFitnessCore `HabitStreakCalculator.computeScheduledStreak`
 * (Swift). Walks BACKWARD only over days the habit is scheduled on,
 * counting consecutive completions. Today is a grace day — if today is
 * scheduled but not yet completed, we don't break the streak yet
 * (let yesterday's scheduled occurrence anchor it).
 *
 * Capped at 365 days to keep a long-dormant habit's lookback bounded.
 */
function computeHabitStreak(
  habit: Record<string, unknown>,
  completedDays: Set<string>,
  today: string,
): number {
  let streak = 0;
  let cursor: string | null = today;
  let sawScheduledDay = false;
  for (let i = 0; i < 365; i += 1) {
    if (cursor === null) break;
    const isScheduled = isHabitScheduledOnDate(habit, cursor);
    if (isScheduled) {
      if (completedDays.has(cursor)) {
        streak += 1;
        sawScheduledDay = true;
      } else if (sawScheduledDay || cursor !== today) {
        // Past scheduled day with no completion → break.
        return streak;
      }
      // Today's grace day: not yet completed, but we're not breaking.
    }
    cursor = previousCivilDay(cursor);
  }
  return streak;
}

function previousCivilDay(civilDate: string): string | null {
  const parts = civilDate.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() - 1);
  const yy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
