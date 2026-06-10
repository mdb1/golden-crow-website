// progress-photo-checkin-policy.ts
// Pure eligibility policy for the progress-photo weekly check-in gate (issue #160) —
// TypeScript twin of iOS `ProgressPhotoCheckInPolicy` (GCFitnessCore) and the Android
// Kotlin twin (`:core` progress/ProgressPhotoCheckInPolicy.kt).
//
// SAME-SOURCE-OF-TRUTH CONTRACT: any behavioral change here MUST be matched in the SAME
// commit in the Swift + Kotlin twins, and the shared fixtures in all three test suites
// must continue to agree.
//
// Firebase/React-free: takes plain values in, civil-date strings out, so the backoffice
// computes the SAME next-eligible date from the `progressPhotos` it already loads — NO new
// Firestore read, NO new denormalized field.
//
// Eligibility model (issue #160, LOCKED):
//  - Baseline complete == at least one photo AND no used angle is stuck at exactly 1 (every
//    angle the client has ANY photo of has >= 2). While baseline incomplete, uploads are FREE.
//  - Once baseline complete: gate to one check-in per 7 days.
//  - A "check-in" groups photos by civil date (`checkInDate ?? civilDate(takenAt ?? createdAt)`);
//    the last check-in date is the MAX such civil date.
//  - nextEligibleDate = lastCheckInDate + 7 days. isEligible = !baselineComplete || today >= next
//    (lexicographic compare of zero-padded "YYYY-MM-DD").

import { civilDateFormat } from "./civil-date";

/** The gate window, in days, once a client's baseline is complete. */
export const PROGRESS_PHOTO_GATE_DAYS = 7;

/** One photo's eligibility-relevant inputs. Pure value type — no Firestore. */
export interface ProgressPhotoCheckInInput {
  angle?: string | null;
  checkInDate?: string | null;
  /** ISO instant string (or Date) for fallback grouping when checkInDate is absent. */
  takenAt?: string | Date | null;
  createdAt?: string | Date | null;
}

export interface ProgressPhotoCheckInResult {
  baselineComplete: boolean;
  lastCheckInDate: string | null;
  nextEligibleDate: string | null;
  isEligible: boolean;
}

/**
 * Evaluate the weekly check-in gate over a list of photos.
 *
 * @param photos the client's progress photos (any order).
 * @param today today's civil date "YYYY-MM-DD" in the client's timezone.
 * @param timezone IANA zone used to derive a photo's civil date from its
 *   `takenAt ?? createdAt` instant when `checkInDate` is absent.
 */
export function evaluateProgressPhotoCheckIn(
  photos: readonly ProgressPhotoCheckInInput[],
  today: string,
  timezone: string,
): ProgressPhotoCheckInResult {
  if (photos.length === 0) {
    return {
      baselineComplete: false,
      lastCheckInDate: null,
      nextEligibleDate: null,
      isEligible: true,
    };
  }

  // Baseline: bucket counts by angle (null angle is its own "single" bucket, consistent with
  // the `angle ?? "single"` upload convention).
  const counts = new Map<string, number>();
  for (const photo of photos) {
    const bucket = photo.angle ?? "single";
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const baselineComplete =
    counts.size > 0 && ![...counts.values()].some((count) => count === 1);

  // Last check-in date == MAX civil date across all photos.
  let lastCheckInDate: string | null = null;
  for (const photo of photos) {
    const civil = civilDateForPhoto(photo, timezone);
    if (!civil) continue;
    if (lastCheckInDate === null || civil > lastCheckInDate) {
      lastCheckInDate = civil;
    }
  }

  const nextEligibleDate: string | null =
    baselineComplete && lastCheckInDate
      ? addCivilDays(lastCheckInDate, PROGRESS_PHOTO_GATE_DAYS)
      : null;

  let isEligible: boolean;
  if (!baselineComplete) {
    isEligible = true;
  } else if (nextEligibleDate) {
    isEligible = today >= nextEligibleDate;
  } else {
    // Baseline complete but no resolvable date — degrade open rather than lock out forever.
    isEligible = true;
  }

  return { baselineComplete, lastCheckInDate, nextEligibleDate, isEligible };
}

// MARK: - Helpers

/**
 * A photo's civil date: explicit `checkInDate`, else the civil date of
 * `takenAt ?? createdAt` in the given zone, else null.
 */
function civilDateForPhoto(
  photo: ProgressPhotoCheckInInput,
  timezone: string,
): string | null {
  if (photo.checkInDate) return photo.checkInDate;
  const instant = toDate(photo.takenAt) ?? toDate(photo.createdAt);
  if (!instant) return null;
  return civilDateFormat(instant, timezone);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Add `days` to a "YYYY-MM-DD" civil date via UTC date math. The input has no time
 * component, so anchoring at UTC noon makes the day shift DST-independent. Returns the
 * input unchanged on malformed input (defensive — callers pass well-formed civil dates).
 */
export function addCivilDays(civilDate: string, days: number): string {
  const [yearText, monthText, dayText] = civilDate.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);
  if (!year || !month || !day) return civilDate;

  const base = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return civilDateFormat(base, "UTC");
}
