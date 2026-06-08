"use client";

// ClientSummaryLists.tsx
//
// Interactive (tappable) workout + habit lists for the client-detail Summary
// card. Requested 260529: the Summary used to render static rows; the trainer
// asked to be able to tap a workout/habit here and edit it "como en la agenda".
//
// We REUSE the agenda's existing detail dialogs verbatim:
//   • WorkoutDetailDialog — recurrence-aware edit + delete cascade.
//   • HabitDetailDialog   — recurrence detail + skip-day / delete.
// Both are id-driven and self-fetch, so this component only has to own the
// open/close state and hand off the tapped row's id.
//
// Why a client component (the Summary card is a Server Component): the detail
// dialogs use `useQuery`, so they need a QueryClientProvider ancestor — the
// `/gc-fitness/clients/[id]` route has none. We provide a local one here and
// keep the Server Component as the data source. After an edit/delete resolves
// we call `router.refresh()` so the server-rendered Summary re-fetches and the
// row reflects the change.

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { WorkoutDetailDialog } from "@/components/gc-fitness/schedule/workout-detail-dialog";
import { HabitDetailDialog } from "@/components/gc-fitness/schedule/habit-detail-dialog";

export interface SummaryWorkoutRow {
  /** Representative assignment id for the (grouped) row — opens its detail. */
  id: string;
  name: string;
  recurrence: string;
  count: number;
  nextDate: string;
}

export interface SummaryHabitRow {
  id: string;
  name: string;
  cadence: string;
}

interface ClientSummaryListsProps {
  clientName: string;
  /** Today's civil date (YYYY-MM-DD) resolved server-side. */
  todayCivil: string;
  workouts: SummaryWorkoutRow[];
  habits: SummaryHabitRow[];
  labels: {
    workouts: string;
    noWorkouts: string;
    habits: string;
    noHabits: string;
  };
  /** Past-workouts <details> block — rendered as-is from the server card. */
  pastWorkoutsSlot?: ReactNode;
  /** Past-habits <details> block — rendered as-is from the server card. */
  pastHabitsSlot?: ReactNode;
}

export function ClientSummaryLists({
  clientName,
  todayCivil,
  workouts,
  habits,
  labels,
  pastWorkoutsSlot,
  pastHabitsSlot,
}: ClientSummaryListsProps) {
  // Local query cache — the detail dialogs' `useQuery` needs a provider and the
  // detail route doesn't ship one. Mirrors RosterQueryProvider's defaults.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  const router = useRouter();

  const [detailAssignmentId, setDetailAssignmentId] = useState<string | null>(
    null,
  );
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Workouts */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.workouts}
          </p>
          <span className="text-xs text-muted-foreground">{workouts.length}</span>
        </div>
        {workouts.length === 0 ? (
          <p className="text-xs text-muted-foreground">{labels.noWorkouts}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {workouts.slice(0, 6).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setDetailAssignmentId(row.id)}
                  className="group flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {row.recurrence}
                      {row.nextDate ? ` · ${row.nextDate}` : ""}
                    </p>
                  </div>
                  {row.count > 1 ? (
                    <Badge variant="outline" className="text-[10px]">
                      x{row.count}
                    </Badge>
                  ) : null}
                  <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {pastWorkoutsSlot}
      </div>

      {/* Habits */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.habits}
          </p>
          <span className="text-xs text-muted-foreground">{habits.length}</span>
        </div>
        {habits.length === 0 ? (
          <p className="text-xs text-muted-foreground">{labels.noHabits}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {habits.slice(0, 8).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setDetailHabitId(row.id)}
                  className="group flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">
                      {row.cadence}
                    </span>
                    <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {pastHabitsSlot}
      </div>

      {detailAssignmentId ? (
        <WorkoutDetailDialog
          open
          onOpenChange={(open) => !open && setDetailAssignmentId(null)}
          assignmentId={detailAssignmentId}
          onDeleted={() => {
            setDetailAssignmentId(null);
            router.refresh();
          }}
        />
      ) : null}

      {detailHabitId ? (
        <HabitDetailDialog
          open
          onOpenChange={(open) => !open && setDetailHabitId(null)}
          habitId={detailHabitId}
          civilDate={todayCivil}
          clientName={clientName}
          onChanged={() => {
            setDetailHabitId(null);
            router.refresh();
          }}
        />
      ) : null}
    </QueryClientProvider>
  );
}
