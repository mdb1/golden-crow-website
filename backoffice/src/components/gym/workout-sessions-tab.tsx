"use client";

import { useQuery } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { Skeleton } from "@/components/ui/skeleton";

interface LoggedExercise {
  id: string;
  exerciseName: string;
  sets: unknown[];
  isPersonalRecord: boolean;
}

interface WorkoutSessionRecord {
  id: string;
  userId: string;
  gymId: string;
  planId: string;
  dayId: string;
  dayLabel: string;
  date: string;
  durationSeconds: number | undefined;
  exercises: LoggedExercise[];
  notes: string | undefined;
}

export function WorkoutSessionsTab({ uid }: { uid: string }) {
  const sessions = useQuery({
    queryKey: ["gym-workout-sessions", uid],
    queryFn: () =>
      sdkFetch<{ sessions: WorkoutSessionRecord[] }>(
        `/gym/members/${uid}/workout-sessions`
      ),
  });

  return (
    <div className="mt-4 flex flex-col gap-3">
      {sessions.isLoading && <Skeleton className="h-32 w-full" />}
      {sessions.error && (
        <p className="text-sm text-destructive">
          Failed to load workout sessions.
        </p>
      )}
      {sessions.data && sessions.data.sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No workout sessions recorded yet.
        </p>
      )}
      {sessions.data && sessions.data.sessions.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Plan</th>
              <th className="pb-2 pr-4 font-medium">Day</th>
              <th className="pb-2 pr-4 font-medium">Exercises</th>
              <th className="pb-2 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {sessions.data.sessions.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {new Date(s.date).toLocaleDateString()}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                  {s.planId}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {s.dayLabel}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {s.exercises.length}
                </td>
                <td className="py-2 text-muted-foreground">
                  {s.durationSeconds != null
                    ? `${Math.round(s.durationSeconds / 60)} min`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
