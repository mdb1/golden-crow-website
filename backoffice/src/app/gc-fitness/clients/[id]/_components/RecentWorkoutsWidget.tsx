// RecentWorkoutsWidget.tsx — Per-client deep view: last 5 workout_logs.
//
// Async React Server Component. Calls Firestore directly via the Admin
// SDK (the parent page's ownership gate guarantees the trainer owns this
// client — defense-in-depth comes from Firestore rules from P02-11 +
// the route-layer notFound() in page.tsx).
//
// Query budget: 1 read (`workout_logs where clientId == X orderBy
// startedAt desc limit 5`).
//
// Rendering: a thin <ul> with one row per log: template name (bold),
// start date (locale-formatted), set count. The empty state matches the
// neutral copy the iOS surface uses ("No workouts logged yet.") so the
// trainer sees the same phrasing on both surfaces.
//
// Field shape sourced from collections.ts:60 — `workout_logs` docs carry
// a flat `sets[]` array + a denormalized `templateSnapshot` (`{ name,
// ... }`) at start-time. Both are optional in this widget — if the log
// somehow shipped without them we degrade gracefully to "(unnamed)" + 0
// sets rather than crashing the Suspense boundary.

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

export interface RecentWorkoutsWidgetProps {
  clientId: string;
}

interface WorkoutLogRow {
  id: string;
  startedAt: Date | null;
  templateName: string;
  setCount: number;
}

function localizedText(value: unknown, fallback = "(unnamed)"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const localized = value as { en?: unknown; es?: unknown };
    if (typeof localized.en === "string" && localized.en.trim()) return localized.en;
    if (typeof localized.es === "string" && localized.es.trim()) return localized.es;
  }
  return fallback;
}

function toDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function RecentWorkoutsWidget({
  clientId,
}: RecentWorkoutsWidgetProps) {
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(FirestoreCollections.workoutLogs)
    .where("clientId", "==", clientId)
    .orderBy("startedAt", "desc")
    .limit(5)
    .get();

  const rows: WorkoutLogRow[] = snap.docs.map((d) => {
    const data = d.data() as {
      startedAt?: unknown;
      templateSnapshot?: { name?: unknown };
      sets?: unknown[];
    };
    return {
      id: d.id,
      startedAt: toDate(data.startedAt),
      templateName: localizedText(data.templateSnapshot?.name),
      setCount: Array.isArray(data.sets) ? data.sets.length : 0,
    };
  });

  return (
    <section className="rounded-md border bg-card p-4">
      <h2 className="mb-3 font-medium">Recent workouts</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium">{row.templateName}</span>
                <span className="text-xs text-muted-foreground">
                  {row.startedAt
                    ? row.startedAt.toLocaleDateString()
                    : "—"}{" "}
                  · {row.setCount} set{row.setCount === 1 ? "" : "s"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
