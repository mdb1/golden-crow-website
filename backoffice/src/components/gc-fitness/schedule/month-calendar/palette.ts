// Chip colors of the schedule calendar (#507 — split out of month-calendar.tsx).

import type { MonthHabitChip, MonthWorkoutChip } from "@/lib/gc-fitness/schedule-month-actions";

// Distinct chip colors per client — assigned in touch/select order so the
// surface starts neutral and only gains client color after the trainer
// actively picks clients.
export const CLIENT_PALETTE = [
  { chip: "bg-category-1/15 text-category-1 border-category-1/40", dot: "bg-category-1", text: "text-category-1" },
  { chip: "bg-category-2/15 text-category-2 border-category-2/40", dot: "bg-category-2", text: "text-category-2" },
  { chip: "bg-category-3/15 text-category-3 border-category-3/40", dot: "bg-category-3", text: "text-category-3" },
  { chip: "bg-category-4/15 text-category-4 border-category-4/40", dot: "bg-category-4", text: "text-category-4" },
  { chip: "bg-category-5/15 text-category-5 border-category-5/40", dot: "bg-category-5", text: "text-category-5" },
  { chip: "bg-category-6/15 text-category-6 border-category-6/40", dot: "bg-category-6", text: "text-category-6" },
  { chip: "bg-category-7/15 text-category-7 border-category-7/40", dot: "bg-category-7", text: "text-category-7" },
  { chip: "bg-category-8/15 text-category-8 border-category-8/40", dot: "bg-category-8", text: "text-category-8" },
];

export const NEUTRAL_CLIENT_PALETTE = {
  chip: "bg-muted/40 text-foreground border-border/70",
  dot: "bg-border",
  text: "text-foreground",
};

export function paletteFor(clientId: string, clientColorOrder: string[]) {
  const idx = clientColorOrder.indexOf(clientId);
  if (idx < 0) return NEUTRAL_CLIENT_PALETTE;
  return CLIENT_PALETTE[idx % CLIENT_PALETTE.length];
}

// Status-first palette that overrides the per-client tint for terminal
// states so trainers can scan the calendar for "what's still pending"
// vs "what already happened". Client color is preserved only on
// scheduled chips, where ownership ambiguity actually matters.
export const STATUS_PALETTE: Record<
  MonthWorkoutChip["status"] | MonthHabitChip["status"],
  string
> = {
  completed:
    "border-success/50 bg-success/15 text-success",
  done: "border-success/50 bg-success/15 text-success",
  started: "",
  missed:
    "border-danger/40 bg-danger/10 text-danger",
  scheduled: "",
};

// Cards are now grouped under a per-client colored header, so the chip itself
// encodes STATUS ONLY (no client tint) — this removes the old ambiguity where
// a green client tint looked identical to the green "completed" status.
// Scheduled → neutral card surface; terminal states keep their status color.
export function workoutChipClass(status: MonthWorkoutChip["status"]): string {
  if (status === "scheduled") return "border-border bg-card text-foreground";
  return STATUS_PALETTE[status];
}
