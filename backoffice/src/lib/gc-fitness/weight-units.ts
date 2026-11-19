// weight-units.ts
//
// gc-fitness #1646 — kg / lb. TS twin of GCFitnessCore `WeightFormat` (Swift) and android/core
// `WeightFormat` (Kotlin); the three run the SAME shared vectors
// (`__tests__/twin-vectors/weight-units-vectors.json`, pinned copy of gc-fitness
// `twin-vectors/`).
//
// THE WIRE IS ALWAYS KILOGRAMS (`weight_kg`, `weightBySetKg`, body weight, PRs, volume). A client
// who chose pounds (`users/{uid}.preferences.units == "lb"`) TYPES in lb and the app stores
// `lb ÷ 2.2046226218` rounded to the gram — so a log can now carry 61.235 kg. The coach keeps
// reading kg (it is the authoring unit of every template and assignment); when the client uses
// lb the backoffice adds the lb the client actually saw, «61,24 kg (135 lb)».
//
// Pure + framework-free (safe in client components and in "use server" callers).

export type WeightUnits = "kg" | "lb";

/** IUPAC kg → lb factor (identical in Swift and Kotlin). */
export const KG_TO_LB = 2.2046226218;

/** The heaviest load a set can store (kg). */
export const MAX_LOAD_KG = 500;

/** True when the units string selects pounds (case-insensitive; anything else = kg). */
export function isLb(units: unknown): boolean {
  return typeof units === "string" && units.toLowerCase() === "lb";
}

/** `users/{uid}.preferences.units` → "kg" | "lb" (absent / unknown ⇒ kg). */
export function clientWeightUnits(userDoc: unknown): WeightUnits {
  if (!userDoc || typeof userDoc !== "object") return "kg";
  const prefs = (userDoc as { preferences?: unknown }).preferences;
  if (!prefs || typeof prefs !== "object") return "kg";
  return isLb((prefs as { units?: unknown }).units) ? "lb" : "kg";
}

export function unitLabel(units: unknown): WeightUnits {
  return isLb(units) ? "lb" : "kg";
}

/** Canonical kg → the numeric value in the preferred unit. */
export function displayValue(kg: number, units: unknown): number {
  return isLb(units) ? kg * KG_TO_LB : kg;
}

/** Half away from zero on `value × scale`, on the exact fractional part (Swift/Kotlin twin). */
export function roundedHalfAwayFromZero(value: number, scale: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * scale;
  const whole = Math.trunc(scaled);
  let rounded = whole;
  if (Math.abs(scaled - whole) >= 0.5) rounded += scaled < 0 ? -1 : 1;
  return rounded / scale;
}

/** A value typed in the preferred unit → canonical kg (lb rounded to the gram; kg unchanged). */
export function kgFromInput(value: number, units: unknown): number {
  if (!Number.isFinite(value)) return 0;
  if (!isLb(units)) return value;
  return roundedHalfAwayFromZero(value / KG_TO_LB, 1000);
}

function decimalSeparator(locale: string): string {
  const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal");
  return part?.value ?? ".";
}

/** One decimal, half away from zero, trailing «.0» dropped, locale separator, no grouping. */
export function weightNumber(value: number, locale: string): string {
  if (!Number.isFinite(value)) return "0";
  const tenths = value * 10;
  const whole = Math.trunc(tenths);
  let rounded = whole;
  if (Math.abs(tenths - whole) >= 0.5) rounded += tenths < 0 ? -1 : 1;
  const magnitude = Math.abs(rounded);
  const sign = rounded < 0 ? "-" : "";
  const intPart = Math.floor(magnitude / 10);
  const decimal = magnitude % 10;
  if (decimal === 0) return `${sign}${intPart}`;
  return `${sign}${intPart}${decimalSeparator(locale)}${decimal}`;
}

/** A set's load (no unit): kg up to TWO decimals, lb ONE. Same rule as the apps. */
export function loadNumber(kg: number, units: unknown, locale: string): string {
  if (isLb(units)) return weightNumber(displayValue(kg, units), locale);
  if (!Number.isFinite(kg)) return "0";
  const rounded = roundedHalfAwayFromZero(kg, 100);
  const hundredths = Math.round(Math.abs(rounded) * 100);
  const sign = rounded < 0 && hundredths !== 0 ? "-" : "";
  const whole = Math.floor(hundredths / 100);
  const fraction = hundredths % 100;
  if (fraction === 0) return `${sign}${whole}`;
  const sep = decimalSeparator(locale);
  if (fraction % 10 === 0) return `${sign}${whole}${sep}${fraction / 10}`;
  return `${sign}${whole}${sep}${fraction < 10 ? "0" : ""}${fraction}`;
}

/** «61,25 kg» / «135 lb». */
export function loadText(kg: number, units: unknown, locale: string): string {
  return `${loadNumber(kg, units, locale)} ${unitLabel(units)}`;
}

/**
 * What the COACH reads for a client's load: always kg, plus the lb the client saw when the
 * client uses pounds — «61,24 kg (135 lb)». kg clients: «61,25 kg».
 */
export function coachLoadText(kg: number, clientUnits: unknown, locale: string): string {
  const base = loadText(kg, "kg", locale);
  return isLb(clientUnits) ? `${base} (${loadText(kg, "lb", locale)})` : base;
}
