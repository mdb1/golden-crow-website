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

/**
 * gc-fitness#1343 — the `weekdayFormat` wire marker on `habits/{id}`. Every
 * writer stamps `"iso"` on create and on any write of the schedule; readers
 * then take `scheduleWeekdays` as ISO Mon=1 … Sun=7 and NEVER run the legacy
 * Sun-first heuristic keyed on `startsOn`. Absent (pre-#1343 docs) or any
 * other value ⇒ the legacy heuristic, unchanged.
 * Twins: iOS `HabitWeekdayFormat`, Android `HabitWeekdayFormat`.
 */
export const HABIT_WEEKDAY_FORMAT_ISO = "iso" as const;

/** True only for the exact `"iso"` marker. */
export function isIsoWeekdayFormat(value: unknown): boolean {
  return value === HABIT_WEEKDAY_FORMAT_ISO;
}

/**
 * gc-fitness#1343 — the Sun-first decision `isHabitScheduledOn` takes for an
 * UNMARKED doc: the start day's ISO number is NOT in the list while its
 * Sun-first number IS. Twin of iOS `HabitSchedule.readsAsLegacySundayFirst`.
 */
export function readsAsLegacySundayFirst(
  weekdays: readonly number[],
  startsOn: unknown,
): boolean {
  if (weekdays.length === 0) return false;
  const start = civilString(startsOn);
  if (!start) return false;
  const startsApple = appleWeekday(start);
  if (startsApple === null) return false;
  const startsIso = startsApple === 1 ? 7 : startsApple - 1;
  return !weekdays.includes(startsIso) && weekdays.includes(startsApple);
}

/**
 * gc-fitness#1343 — weekly days as ISO Mon=1 … Sun=7, EXACTLY as
 * `isHabitScheduledOn` reads them (sorted, unique): with the marker the stored
 * list (1…7 only); without it Sun-first when `startsOn` says so, otherwise ISO
 * plus the zero-based-Sunday stray (0 ⇒ Sunday).
 *
 * Every editor that loads an existing habit into a form uses this (not the raw
 * array), so re-saving a legacy doc — which now stamps the marker — keeps the
 * real days. Twins: iOS/Android `HabitSchedule.isoWeekdays`.
 */
export function effectiveIsoWeekdaysOf(
  weekdays: readonly unknown[] | null | undefined,
  startsOn: unknown,
  weekdayFormat: unknown,
): number[] {
  const list = (Array.isArray(weekdays) ? weekdays : []).filter(
    (n): n is number => typeof n === "number" && Number.isInteger(n),
  );
  const inRange = list.filter((n) => n >= 1 && n <= 7);
  let out: number[];
  if (isIsoWeekdayFormat(weekdayFormat)) {
    out = inRange;
  } else if (readsAsLegacySundayFirst(list, startsOn)) {
    out = inRange.map((n) => (n === 1 ? 7 : n - 1));
  } else {
    out = list.includes(0) ? [...inRange, 7] : inRange;
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

/** {@link effectiveIsoWeekdaysOf} over a habit doc. */
export function effectiveIsoWeekdays(habit: HabitLike): number[] {
  return effectiveIsoWeekdaysOf(
    Array.isArray(habit.scheduleWeekdays) ? (habit.scheduleWeekdays as unknown[]) : [],
    habit.startsOn,
    habit.weekdayFormat,
  );
}

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

    // gc-fitness#1343 — an explicit marker wins: an ISO doc is read as ISO,
    // full stop. The `startsOn` heuristic below exists only for docs written
    // before the marker, and misread a NEW Mon/Wed/Fri habit started on a
    // Thursday as Sun/Tue/Thu.
    if (isIsoWeekdayFormat(habit.weekdayFormat)) {
      return weekdays.includes(isoWeekday);
    }

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
