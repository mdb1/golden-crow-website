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
import { coerceLegacyHabitLogValue } from "@/lib/gc-fitness/habit-compliance";
import { isHabitScheduledOn } from "@/lib/gc-fitness/habit-schedule";
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
  // Delegates to the shared iOS-parity predicate (incl. skippedDates +
  // disambiguated legacy weekday). See lib/gc-fitness/habit-schedule.ts.
  return isHabitScheduledOn(habit, civilDate);
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
      } & Record<string, unknown>;

      const logsSnap = await db
        .collection(FirestoreCollections.habitLogs)
        .where("habitId", "==", h.id)
        .where("civilDate", ">=", windowStart)
        .orderBy("civilDate", "desc")
        .limit(400)
        .get();

      const completedDates = new Set<string>();
      // Habits are binary-only: a log counts iff !deleted && value === true.
      for (const doc of logsSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        if (data.deleted === true) continue;
        const date = typeof data.civilDate === "string" ? data.civilDate : "";
        if (!date) continue;
        if (coerceLegacyHabitLogValue(data.value)) completedDates.add(date);
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
        // No scheduled days in the window → NO data (not 100%). #341: a habit
        // with nothing due in the range was rendering as 100% (0/0). The client
        // renders "—" when scheduled === 0 so it doesn't read as fully complete.
        // Matches the shared computeAdherence (0/0 → 0).
        const ratio = denom === 0 ? 0 : completed / denom;
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
        noScheduled: t("noScheduled"),
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
