// last-activity-kind.ts
//
// #488: which client surface produced a roster row's `lastActivityAt`.
// Pure module (imported by the "use server" roster file and by the
// dashboard page) so the label the "needs attention" card shows is the
// client's REAL last action — the card used to hardcode "No activity"
// next to "4 days ago", which contradicted itself.

export type LastActivityKind = "workout" | "habit" | "photo";

/** Most recent of the three timestamps; ties go workout → habit → photo. */
export function pickLastActivityKind(input: {
  workout: Date | null;
  habit: Date | null;
  photo: Date | null;
}): LastActivityKind | null {
  let best: { kind: LastActivityKind; ms: number } | null = null;
  for (const kind of ["workout", "habit", "photo"] as const) {
    const d = input[kind];
    if (!d) continue;
    const ms = d.getTime();
    if (Number.isNaN(ms)) continue;
    if (!best || ms > best.ms) best = { kind, ms };
  }
  return best?.kind ?? null;
}

/** i18n key (namespace `dashboard`) for a row's primary "last action" text. */
export function lastActionMessageKey(
  kind: LastActivityKind | null | undefined,
):
  | "lastActionWorkout"
  | "lastActionHabit"
  | "lastActionPhoto"
  | "noActivity" {
  switch (kind) {
    case "workout":
      return "lastActionWorkout";
    case "habit":
      return "lastActionHabit";
    case "photo":
      return "lastActionPhoto";
    default:
      return "noActivity";
  }
}
