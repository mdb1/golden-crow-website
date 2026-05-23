// HabitComplianceWidget.tsx — Per-client deep view: 7-day compliance
// across every active habit. Async React Server Component.
//
// Reuses `computeCompliance` from habit-compliance.ts verbatim
// (Pattern B / Pitfall 7) so the trainer's per-client view matches
// the per-habit detail view AND the roster's "This week" column to
// within a tie-breaking round.
//
// Schema notes (sourced from habit-schema.ts and the roster aggregator
// 11-05):
//   - The on-wire habit-type field is `type` — NOT `habitType` (the
//     plan pseudo-code used `habitType`, same Rule 3 fix the 11-05
//     aggregator already applied).
//   - `computeCompliance(...)` returns `{ ratio, dailyCounts }` —
//     the plan pseudo-code destructured a number directly (same
//     Rule 3 fix as 11-05).
//   - Soft-deleted habits filtered at query layer (`deleted == false`)
//     — same convention as habit-actions.ts and the roster aggregator.
//   - Per-habit logs over-fetched at 50 to absorb idempotent re-tap
//     duplicates / soft-deleted entries still in the index (mirrors
//     the roster's per-habit window).
//
// Per-client today resolution: `civilDateToday(client.timezone ?? "UTC")`
// resolves the day boundary in the client's local zone when known.
// The Pattern-B `computeCompliance` accepts a timezone for parity with
// the Swift signature but does the actual day-step in UTC arithmetic;
// the timezone parameter currently only controls the `today` anchor.
//
// Rendering: ONE row per habit (sorted by ratio DESC) with the habit
// name on the left, a shadcn `<Progress />` bar, and a tabular-nums
// percentage on the right. The roster column uses the same Progress
// component so the trainer sees the same visual idiom at both depths.

import { getTranslations } from "next-intl/server";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import {
  computeCompliance,
  type HabitLogRow,
} from "@/lib/gc-fitness/habit-compliance";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import type { HabitType } from "@/lib/gc-fitness/habit-schema";
import { Progress } from "@/components/ui/progress";

export interface HabitComplianceWidgetProps {
  clientId: string;
  timezone: string;
}

interface HabitRow {
  id: string;
  name: string;
  ratio: number;
  pct: number;
}

export async function HabitComplianceWidget({
  clientId,
  timezone,
}: HabitComplianceWidgetProps) {
  const t = await getTranslations("clients.detail.habitCompliance");
  const unnamed = t("unnamed");
  const db = gcFitnessFirestore();

  const habitsSnap = await db
    .collection(FirestoreCollections.habits)
    .where("clientId", "==", clientId)
    .where("deleted", "==", false)
    .get();

  const today = civilDateToday(timezone);

  const rows: HabitRow[] = await Promise.all(
    habitsSnap.docs.map(async (h) => {
      const habit = h.data() as {
        name?: string | { en?: string; es?: string };
        type?: HabitType;
        targetValue?: number;
      };
      const habitType: HabitType = (habit.type ?? "binary") as HabitType;
      const targetValue =
        typeof habit.targetValue === "number" ? habit.targetValue : undefined;

      const logsSnap = await db
        .collection(FirestoreCollections.habitLogs)
        .where("habitId", "==", h.id)
        .orderBy("loggedAt", "desc")
        .limit(50)
        .get();

      const logs: HabitLogRow[] = logsSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          habitId: (data.habitId as string) ?? "",
          clientId: (data.clientId as string) ?? "",
          civilDate: (data.civilDate as string) ?? "",
          value: data.value as boolean | string | number,
          unit: typeof data.unit === "string" ? data.unit : undefined,
          deleted: data.deleted === true,
        };
      });

      // Rule 3 / Pitfall 7 — destructure { ratio } from the return shape.
      // The plan pseudo-code treated computeCompliance as returning a
      // number; the actual signature returns { ratio, dailyCounts }.
      // Same fix the 11-05 aggregator landed.
      const { ratio } = computeCompliance(
        habitType,
        logs,
        7,
        today,
        timezone,
        targetValue,
      );

      const clamped = Math.max(0, Math.min(1, ratio));
      return {
        id: h.id,
        name: localizedName(habit.name, unnamed),
        ratio: clamped,
        pct: Math.round(clamped * 100),
      };
    }),
  );

  rows.sort((a, b) => b.ratio - a.ratio);

  return (
    <section className="rounded-md border bg-card p-4">
      <h2 className="mb-3 font-medium">{t("title")}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 text-sm"
            >
              <span className="flex-1 truncate font-medium">{row.name}</span>
              <Progress value={row.pct} className="h-2 w-24" />
              <span className="w-10 text-right tabular-nums text-muted-foreground">
                {row.pct}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function localizedName(
  value: string | { en?: string; es?: string } | undefined,
  fallback: string,
): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (value && typeof value === "object") {
    return value.en?.trim() || value.es?.trim() || fallback;
  }
  return fallback;
}
