// ComplianceWidget.tsx — per-habit trainer compliance view.
//
// Plan 06-08 Task 2. React Server Component (default in Next.js 16 App
// Router) that calls `fetchHabitCompliance(habitId)` server-side and renders:
//   - 7-day compliance ratio numeral
//   - 30-day compliance ratio numeral
//   - 30-day daily-bar sparkline (oldest → newest, left → right)
//
// WHY A SERVER COMPONENT:
//   The Server Action `fetchHabitCompliance` is server-only (it uses
//   firebase-admin via `gcFitnessFirestore()`); calling it from a Server
//   Component avoids the network round-trip of a client `useEffect +
//   await fetchHabitCompliance(...)` pattern. Suspense-boundary placement
//   in the parent route (`[id]/page.tsx`) lets the rest of the habit
//   detail page render immediately while compliance fetches.
//
// TRAINER-OWNERSHIP DEFENSE-IN-DEPTH:
//   The parent route's Server Component already verifies the trainer owns
//   the habit before rendering this widget. `fetchHabitCompliance` ALSO
//   re-verifies ownership before reading /habit_logs (the Admin SDK
//   bypasses Firestore rules, so we re-enforce at the Server Action layer
//   too). The widget is therefore safe to render regardless of upstream
//   guard correctness — three independent checks would all have to fail
//   for a leak.

import {
  fetchHabitCompliance,
  type HabitComplianceResponse,
} from "@/lib/gc-fitness/habit-compliance-actions";

import { ComplianceSparkline } from "./ComplianceSparkline";

interface ComplianceWidgetProps {
  habitId: string;
}

export async function ComplianceWidget({ habitId }: ComplianceWidgetProps) {
  const data: HabitComplianceResponse = await fetchHabitCompliance(habitId);
  const { sevenDayRatio, thirtyDayRatio, dailyCounts } = data;

  return (
    <section
      aria-labelledby="compliance-heading"
      className="flex flex-col gap-4"
    >
      <h3 id="compliance-heading" className="sr-only">
        Compliance summary
      </h3>
      <div className="flex flex-wrap gap-4">
        <RatioCard label="7-day compliance" ratio={sevenDayRatio} />
        <RatioCard label="30-day compliance" ratio={thirtyDayRatio} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Last 30 days
        </p>
        <ComplianceSparkline counts={dailyCounts} />
      </div>
    </section>
  );
}

/**
 * Single-ratio card. Pulled out so the layout stays declarative and the
 * percentage formatting lives in ONE place — never `Math.round` inline
 * elsewhere in the file (consistency makes the type-conditional design
 * variant in v2 trivial).
 */
function RatioCard({ label, ratio }: { label: string; ratio: number }) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {pct}
        <span className="text-base font-medium text-muted-foreground">%</span>
      </div>
    </div>
  );
}

/**
 * Skeleton fallback for the Suspense boundary in `[id]/page.tsx`. Shows
 * placeholder shapes matching the final layout so the page reflow is
 * minimized when data arrives.
 */
export function ComplianceWidgetSkeleton() {
  return (
    <section
      aria-labelledby="compliance-heading-skeleton"
      className="flex flex-col gap-4"
      aria-busy="true"
    >
      <h3 id="compliance-heading-skeleton" className="sr-only">
        Loading compliance summary
      </h3>
      <div className="flex flex-wrap gap-4">
        <div className="h-[72px] w-[140px] animate-pulse rounded-lg border bg-muted/30" />
        <div className="h-[72px] w-[140px] animate-pulse rounded-lg border bg-muted/30" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Last 30 days
        </p>
        <div className="h-[28px] w-[300px] animate-pulse rounded bg-muted/30" />
      </div>
    </section>
  );
}
