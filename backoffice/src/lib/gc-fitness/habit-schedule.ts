/**
 * Single source of truth (backoffice side) for "is this habit scheduled on
 * this civil date?". Faithful TypeScript parity of the iOS
 * `HabitSchedule.isActive(_:on:)` in
 * `gc-fitness/iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/HabitSchedule.swift`.
 *
 * Why this file exists
 * --------------------
 * The same scheduling predicate had drifted into FOUR hand-rolled copies
 * (recent-logs, client-daily-timeline — deleted in #309 —, coach-pulse,
 * HabitTrendsWidget). Two of them disagreed with iOS and inflated the trainer-facing "X/Y habits done
 * today" denominator vs. what the client sees in the app:
 *
 *   1. MISSING `skippedDates`. When a trainer removes a habit from a single day
 *      ("quitar de este día"), iOS hides it for that day. recent-logs /
 *      client-daily-timeline never checked `skippedDates`, so a skipped habit
 *      still counted toward the denominator (client sees 4, trainer feed shows
 *      "/5").
 *   2. OVER-BROAD legacy weekday alias. The copies accepted BOTH the canonical
 *      ISO weekday (Mon=1…Sun=7) AND an unconditional Sun=1…Sat=7 alias, which
 *      matched a weekly habit on TWO adjacent real-world days. iOS only opts
 *      into the legacy mapping when it can DISAMBIGUATE from `startsOn`.
 *
 * Both bugs are the "2/5 habits done today, but the client has 4 habits today"
 * report. Centralizing here keeps the four call sites byte-identical to iOS.
 *
 * NOTE on `deleted`: iOS `isActive` does NOT consider soft-delete (that lives in
 * `isVisibleForClientTimeline`). This helper matches `isActive` and likewise
 * ignores `deleted`; callers keep their own soft-delete handling (some filter
 * `deleted == false` in the Firestore query, some guard inline).
 *
 * Field semantics (mirror `.planning/schemas/habits.md`):
 *   - `startsOn` / `endsOn`: inclusive civil-date window bounds ("YYYY-MM-DD").
 *   - `skippedDates`: civil dates explicitly removed from the recurrence.
 *   - `scheduleType`: "one-time" → only `startsOn`; otherwise "recurring".
 *   - `scheduleCadence`: "daily" | "weekly" | "monthly".
 *   - `scheduleWeekdays`: canonical ISO Mon=1 … Sun=7.
 *   - `scheduleMonthDays` (preferred, multi-day) or legacy `scheduleDayOfMonth`.
 */

type HabitLike = Record<string, unknown>;

function civilString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Apple-style weekday (Sun=1 … Sat=7) for a civil date string, computed at noon
 * UTC. A civil date maps to exactly one weekday regardless of timezone, so this
 * matches iOS's tz-aware calendar component for the same "YYYY-MM-DD".
 * Returns null when the civil date can't be parsed.
 */
function appleWeekday(civilDate: string): number | null {
  const date = new Date(`${civilDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCDay() + 1; // getUTCDay: Sun=0..Sat=6 → Sun=1..Sat=7
}

export function isHabitScheduledOn(
  habit: HabitLike,
  civilDate: string,
): boolean {
  const startsOn = civilString(habit.startsOn);
  const endsOn = civilString(habit.endsOn);

  if (startsOn && civilDate < startsOn) return false;
  if (endsOn && civilDate > endsOn) return false;

  // Trainer removed this specific day from the recurrence ("quitar de este
  // día"). Takes precedence over the cadence below — mirrors iOS.
  if (
    Array.isArray(habit.skippedDates) &&
    (habit.skippedDates as unknown[]).includes(civilDate)
  ) {
    return false;
  }

  const scheduleType =
    habit.scheduleType === "one-time" ? "one-time" : "recurring";
  if (scheduleType === "one-time") {
    return startsOn ? civilDate === startsOn : true;
  }

  const cadence =
    habit.scheduleCadence === "weekly" || habit.scheduleCadence === "monthly"
      ? habit.scheduleCadence
      : "daily";
  if (cadence === "daily") return true;

  const apple = appleWeekday(civilDate);
  if (apple === null) return false;

  if (cadence === "weekly") {
    const weekdays = Array.isArray(habit.scheduleWeekdays)
      ? (habit.scheduleWeekdays as number[])
      : [];
    if (weekdays.length === 0) return false;

    const isoWeekday = apple === 1 ? 7 : apple - 1; // Mon=1..Sun=7
    const legacySundayFirstWeekday = apple; // Sun=1..Sat=7
    const zeroBasedSunday = apple - 1; // Sun=0..Sat=6

    const isoMatch = weekdays.includes(isoWeekday);

    // Legacy Sun=1..Sat=7 support: only opt in when `startsOn` lets us
    // DISAMBIGUATE the stored convention (iOS parity). Without that guard the
    // old code matched two adjacent weekdays and over-counted.
    const shouldUseLegacySundayFirst = (() => {
      if (!startsOn) return false;
      const startsApple = appleWeekday(startsOn);
      if (startsApple === null) return false;
      const startsIso = startsApple === 1 ? 7 : startsApple - 1;
      const matchesIso = weekdays.includes(startsIso);
      const matchesLegacy = weekdays.includes(startsApple);
      // Ambiguous (or both false): keep canonical ISO.
      if (matchesIso === matchesLegacy) return false;
      return matchesLegacy;
    })();

    if (shouldUseLegacySundayFirst) {
      return weekdays.includes(legacySundayFirstWeekday);
    }

    // Zero-based Sunday fallback for stray docs (iOS parity).
    if (!isoMatch && weekdays.includes(zeroBasedSunday)) {
      return true;
    }
    return isoMatch;
  }

  // monthly
  const monthDays = Array.isArray(habit.scheduleMonthDays)
    ? (habit.scheduleMonthDays as number[])
    : typeof habit.scheduleDayOfMonth === "number"
      ? [habit.scheduleDayOfMonth]
      : [1];
  const dayOfMonth = new Date(`${civilDate}T12:00:00Z`).getUTCDate();
  return monthDays.includes(dayOfMonth);
}
