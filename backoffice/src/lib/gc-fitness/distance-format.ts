// distance-format.ts
//
// gc-fitness #1649 — distance / cardio. TS twin of GCFitnessCore `DistanceFormat` (Swift) and
// android/core `DistanceFormat` (Kotlin); the three run the SAME shared vectors
// (`__tests__/twin-vectors/distance-format-vectors.json`, pinned copy of gc-fitness
// `twin-vectors/`).
//
// THE WIRE IS ALWAYS METERS: `distance_meters` on logged sets and prs[], `distanceBySetMeters` on
// template / snapshot exercises. The display unit follows the weight preference
// (`users/{uid}.preferences.units`): "lb" ⇒ miles, anything else ⇒ km. The coach authors in km
// (the authoring unit, like kg); when the client uses miles the backoffice adds what the client
// saw, «5 km (3,11 mi)».
//
// Pure + framework-free (safe in client components and in "use server" callers).

import { isLb, roundedHalfAwayFromZero } from "./weight-units";

export type DistanceUnits = "km" | "mi";

export const METERS_PER_MILE = 1609.344;
export const METERS_PER_KM = 1000;
/** The longest distance a set can store (meters) — 1000 km. */
export const MAX_DISTANCE_METERS = 1_000_000;

/** True when the (weight) units string selects miles ("lb"). */
export function isMiles(units: unknown): boolean {
  return isLb(units);
}

export function distanceUnitLabel(units: unknown): DistanceUnits {
  return isMiles(units) ? "mi" : "km";
}

export function distanceDisplayValue(meters: number, units: unknown): number {
  return meters / (isMiles(units) ? METERS_PER_MILE : METERS_PER_KM);
}

function decimalSeparator(locale: string): string {
  const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal");
  return part?.value ?? ".";
}

/** Up to 2 decimals, half away from zero, trailing zeros dropped, locale separator, no grouping. */
export function distanceNumber(meters: number, units: unknown, locale: string): string {
  const value = distanceDisplayValue(meters, units);
  if (!Number.isFinite(value)) return "0";
  const rounded = roundedHalfAwayFromZero(value, 100);
  const hundredths = Math.round(Math.abs(rounded) * 100);
  const sign = rounded < 0 && hundredths !== 0 ? "-" : "";
  const whole = Math.floor(hundredths / 100);
  const fraction = hundredths % 100;
  if (fraction === 0) return `${sign}${whole}`;
  const sep = decimalSeparator(locale);
  if (fraction % 10 === 0) return `${sign}${whole}${sep}${fraction / 10}`;
  return `${sign}${whole}${sep}${fraction < 10 ? "0" : ""}${fraction}`;
}

/** «5,25 km» / «3.11 mi». */
export function distanceText(meters: number, units: unknown, locale: string): string {
  return `${distanceNumber(meters, units, locale)} ${distanceUnitLabel(units)}`;
}

/** A value typed in km / mi → whole meters, clamped 0…1 000 000; non-finite ⇒ 0. */
export function metersFromInput(value: number, units: unknown): number {
  if (!Number.isFinite(value)) return 0;
  const meters = roundedHalfAwayFromZero(value * (isMiles(units) ? METERS_PER_MILE : METERS_PER_KM), 1);
  return Math.min(MAX_DISTANCE_METERS, Math.max(0, meters));
}

/** Σ distance_meters > 0 (camel fallback). */
export function totalMeters(sets: ReadonlyArray<Record<string, unknown>>): number {
  let total = 0;
  for (const set of sets) {
    const raw = set.distance_meters ?? set.distanceMeters;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) total += raw;
  }
  return total;
}

/** Forgiving read of a logged / PR distance: finite and > 0, else null. */
export function readDistanceMeters(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** What the COACH reads: km, plus the miles the client saw when the client uses lb. */
export function coachDistanceText(meters: number, clientUnits: unknown, locale: string): string {
  const base = distanceText(meters, "kg", locale);
  return isMiles(clientUnits) ? `${base} (${distanceText(meters, "lb", locale)})` : base;
}
