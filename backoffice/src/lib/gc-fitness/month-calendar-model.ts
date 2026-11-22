// month-calendar-model.ts
//
// Pure civil-date + label helpers of the schedule calendar (#507 — moved out
// of components/gc-fitness/schedule/month-calendar.tsx). No React; unit tested
// in __tests__/month-calendar-model.test.ts. Moved verbatim.

import type { MonthWorkoutChip } from "@/lib/gc-fitness/schedule-month-actions";

export interface ClientLite {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  birthDate?: string | null;
}

export const MONTH_LABELS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const WEEKDAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** The calendar chip for an assignment id, wherever it sits in the payload. */
export function findWorkoutChip(
  workoutsByDay: Record<string, MonthWorkoutChip[]>,
  id: string,
): MonthWorkoutChip | null {
  for (const chips of Object.values(workoutsByDay)) {
    const hit = chips.find((c) => c.id === id);
    if (hit) return hit;
  }
  return null;
}

export function addCivilDays(civil: string, days: number): string {
  const [y, m, d] = civil.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  const ny = shifted.getUTCFullYear();
  const nm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export function shiftMonth(monthFirst: string, delta: number): string {
  const [y, m] = monthFirst.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** Build the 6 × 7 grid (Mon-first). Pads with the prev/next month so the
 *  grid is always rectangular — the UI dims pad days. */
export function buildGrid(monthFirst: string): {
  cells: { civil: string; inMonth: boolean }[];
} {
  const [y, m] = monthFirst.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0=Sun..6=Sat
  // Mon-first → 0=Mon..6=Sun. Convert.
  const monFirstOffset = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const start = addCivilDays(monthFirst, -monFirstOffset);
  const cells: { civil: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const civil = addCivilDays(start, i);
    cells.push({ civil, inMonth: civil.slice(0, 7) === monthFirst.slice(0, 7) });
  }
  return { cells };
}

export function monthLabel(monthFirst: string): string {
  const [y, m] = monthFirst.split("-").map(Number);
  return `${MONTH_LABELS_ES[m - 1]} ${y}`;
}

export type CalendarView = "month" | "week" | "3day";

/** Monday-first index: 0=Mon … 6=Sun. */
export function mondayIndex(civil: string): number {
  const [y, m, d] = civil.split("-").map(Number);
  const gd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return gd === 0 ? 6 : gd - 1;
}

/** Monday that starts the week containing `civil`. */
export function startOfWeekMon(civil: string): string {
  return addCivilDays(civil, -mondayIndex(civil));
}

/** "28 May" style short label for range headers. */
export function shortDateLabel(civil: string): string {
  const [, m, d] = civil.split("-").map(Number);
  return `${d} ${MONTH_LABELS_ES[m - 1].slice(0, 3)}`;
}

export function clientInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Build the "originalmente <día>, el cliente lo movió a <día>" hint
 * surfaced in the chip's tooltip + the `ArrowRightLeft` icon's aria
 * label. Both civil dates are parsed in UTC so the trainer's locale
 * doesn't shift the rendered weekday.
 */
export function formatMovedFromLabel(
  originallyScheduledFor: string,
  scheduledFor: string,
): string | null {
  const original = parseCivilDateInUtc(originallyScheduledFor);
  const moved = parseCivilDateInUtc(scheduledFor);
  if (!original || !moved) return null;
  const fmt = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `Originalmente ${fmt.format(original)}, el cliente lo movió a ${fmt.format(moved)}`;
}

export function parseCivilDateInUtc(civilDate: string): Date | null {
  const parts = civilDate.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function monthDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [, month, day] = parts;
  if (!month || !day) return null;
  return `${month}-${day}`;
}

export function isBirthdayOn(birthDate: string | null | undefined, civil: string): boolean {
  return monthDay(birthDate) != null && monthDay(birthDate) === monthDay(civil);
}

export function ageOnCivilDate(birthDate: string | null | undefined, civil: string): number | null {
  if (!birthDate) return null;
  const birth = parseCivilDateInUtc(birthDate);
  const today = parseCivilDateInUtc(civil);
  if (!birth || !today) return null;
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  const beforeBirthday =
    monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** Active window for week / 3-day views (null in month view, where the whole
 *  month is fetched from monthFirst instead). */
export function calendarRange(
  view: CalendarView,
  anchor: string,
): { start: string; end: string } | null {
  if (view === "week") {
    const start = startOfWeekMon(anchor);
    return { start, end: addCivilDays(start, 6) };
  }
  if (view === "3day") return { start: anchor, end: addCivilDays(anchor, 2) };
  return null;
}

/** The day cells a view renders: the window's days, or the 6 × 7 month grid. */
export function calendarCells(
  view: CalendarView,
  range: { start: string; end: string } | null,
  monthFirst: string,
): { civil: string; inMonth: boolean }[] {
  return range
    ? Array.from({ length: view === "week" ? 7 : 3 }, (_, i) => ({
        civil: addCivilDays(range.start, i),
        inMonth: true,
      }))
    : buildGrid(monthFirst).cells;
}

/** A habit chip's id is `${habitId}_${civilDate}`; recover the habit id. */
export function habitIdFromChip(chip: { id: string; civilDate: string }): string {
  return chip.id.slice(0, chip.id.length - chip.civilDate.length - 1);
}
