// HabitTrendsWidget.tsx — Per-client habit adherence with a time-range
// selector (All time / 90d / 30d / 7d). Async React Server Component.
//
// Replaces the fixed 7-day HabitComplianceWidget. The compliance % per
// habit is recomputed for every range server-side from a single 365-day
// log fetch, then handed to HabitTrendsClient which toggles the displayed
// range without a round-trip. Visual: the same per-habit cards (name +
// streak badge + progress bar + "X/Y días") the trainer already knows,
// mirroring the iOS habit compliance surface.
//
// Query budget per habit: 1 read (habit_logs where habitId == X and
// civilDate >= today-365, limit 400). Habits per client are few (<20),
// so this stays well within a Suspense-friendly budget.
//
// Trust: parent page's ownership gate + Firestore rules guarantee the
// trainer owns this client. No user-controlled HTML is rendered (names
// land inside React-escaped text nodes).

import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import type { HabitType } from "@/lib/gc-fitness/habit-schema";
import { TREND_RANGES, type TrendRangeKey, addCivilDays } from "./trend-range";
import { HabitTrendsClient, type HabitTrendRow } from "./HabitTrendsClient";

export interface HabitTrendsWidgetProps {
  clientId: string;
  timezone: string;
}

const MAX_LOOKBACK_DAYS = 365;

function isHabitScheduledOnDate(
  habit: Record<string, unknown>,
  civilDate: string,
): boolean {
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

export async function HabitTrendsWidget({ clientId, timezone }: HabitTrendsWidgetProps) {
  const t = await getTranslations("clients.detail.habitTrends");
  const unnamed = t("unnamed");
  const db = gcFitnessFirestore();

  const habitsSnap = await db
    .collection(FirestoreCollections.habits)
    .where("clientId", "==", clientId)
    .where("deleted", "==", false)
    .get();

  const today = civilDateFormat(new Date(), timezone);
  // Ascending list of the trailing 365 civil dates ending today. Each
  // range is a suffix slice of this array (last 7 / 30 / 90 / all).
  const allDates: string[] = [];
  for (let offset = MAX_LOOKBACK_DAYS - 1; offset >= 0; offset -= 1) {
    allDates.push(addCivilDays(today, -offset));
  }
  const windowStart = allDates[0] ?? today;

  const rows: HabitTrendRow[] = await Promise.all(
    habitsSnap.docs.map(async (h) => {
      const habit = h.data() as {
        name?: string | { en?: string; es?: string };
        type?: HabitType;
        targetValue?: number;
      } & Record<string, unknown>;

      const logsSnap = await db
        .collection(FirestoreCollections.habitLogs)
        .where("habitId", "==", h.id)
        .where("civilDate", ">=", windowStart)
        .orderBy("civilDate", "desc")
        .limit(400)
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
          completed =
            Number.isFinite(numeric) &&
            (targetValue === undefined ? numeric > 0 : numeric >= targetValue);
        }
        if (completed) completedDates.add(date);
      }

      const byRange = {} as Record<
        TrendRangeKey,
        { pct: number; completed: number; scheduled: number }
      >;
      for (const range of TREND_RANGES) {
        const windowDates = allDates.slice(
          Math.max(0, allDates.length - range.days),
        );
        const scheduled = windowDates.filter((d) =>
          isHabitScheduledOnDate(habit, d),
        );
        const completed = scheduled.filter((d) => completedDates.has(d)).length;
        const denom = scheduled.length;
        // No scheduled days in the window → 100% (nothing was due), matching
        // the iOS surface + the previous compliance widget.
        const ratio = denom === 0 ? 1 : completed / denom;
        byRange[range.key] = {
          pct: Math.round(Math.max(0, Math.min(1, ratio)) * 100),
          completed,
          scheduled: denom,
        };
      }

      const streak = computeHabitStreak(habit, completedDates, today);

      return {
        id: h.id,
        name: localizedName(habit.name, unnamed),
        streak,
        streakTooltip:
          streak >= 3 ? t("streakTooltip", { count: streak }) : null,
        byRange,
      } satisfies HabitTrendRow;
    }),
  );

  return (
    <HabitTrendsClient
      rows={rows}
      labels={{
        title: t("title"),
        empty: t("empty"),
        daysCompleted: t("daysCompleted"),
        ranges: {
          all: t("rangeAll"),
          "90": t("range90"),
          "30": t("range30"),
          "7": t("range7"),
        },
      }}
    />
  );
}

function localizedName(
  value: string | { en?: string; es?: string } | undefined,
  fallback: string,
): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (value && typeof value === "object") {
    return value.en?.trim() || value.es?.trim() || fallback;
  }
  return fallback;
}

/**
 * Recurrence-aware streak: walks BACKWARD only over days the habit is
 * scheduled on, counting consecutive completions. Today is a grace day.
 * Capped at 365 days. Mirrors GCFitnessCore HabitStreakCalculator.
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
    if (isHabitScheduledOnDate(habit, cursor)) {
      if (completedDays.has(cursor)) {
        streak += 1;
        sawScheduledDay = true;
      } else if (sawScheduledDay || cursor !== today) {
        return streak;
      }
    }
    cursor = addCivilDays(cursor, -1);
  }
  return streak;
}
