import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MessageCircle, Dumbbell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkoutLogDetail } from "@/lib/gc-fitness/recent-logs-actions";

interface PageProps {
  params: Promise<{ logId: string }>;
}

export const dynamic = "force-dynamic";

export default async function WorkoutLogDetailPage({ params }: PageProps) {
  const { logId } = await params;

  try {
    const detail = await getWorkoutLogDetail(logId);

    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href="/gc-fitness/recent-logs">
              <ChevronLeft className="h-4 w-4" />
              Back to logs
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/gc-fitness/chat?chatId=${detail.clientId}`}>
              <MessageCircle className="h-4 w-4" />
              Open chat
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Dumbbell className="h-5 w-5" />
              {detail.clientName} · {detail.workoutName}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-3">
            <Metric label="Status" value={detail.status === "completed" ? "Completed" : "Started"} />
            <Metric label="Started" value={formatDateTime(detail.startedAt)} />
            <Metric label="Completed" value={formatDateTime(detail.completedAt)} />
            <Metric label="Exercises" value={String(detail.exerciseCount)} />
            <Metric label="Sets logged" value={`${detail.completedSetCount}/${detail.setCount}`} />
            <Metric label="Log ID" value={detail.id} mono />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Set Detail</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.sets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sets logged for this workout.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="border-b text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Exercise</th>
                      <th className="py-2 pr-3">Reps</th>
                      <th className="py-2 pr-3">Weight</th>
                      <th className="py-2 pr-3">Completed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.sets.map((set) => (
                      <tr key={`${set.index}-${set.exerciseName}`} className="border-b last:border-b-0">
                        <td className="py-2 pr-3">{set.index}</td>
                        <td className="py-2 pr-3 font-medium">{set.exerciseName}</td>
                        <td className="py-2 pr-3">{set.reps ?? "-"}</td>
                        <td className="py-2 pr-3">
                          {set.weight !== null ? `${set.weight} kg` : "-"}
                        </td>
                        <td className="py-2 pr-3">{formatDateTime(set.completedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown";
    if (message === "Workout log not found." || message === "Forbidden") {
      notFound();
    }
    throw error;
  }
}

function Metric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</p>
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
