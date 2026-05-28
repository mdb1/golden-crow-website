import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  MessageCircle,
  Dumbbell,
  Trophy,
  Gauge,
  NotebookText,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWorkoutLogDetail,
  type WorkoutLogDetail,
} from "@/lib/gc-fitness/recent-logs-actions";

interface PageProps {
  params: Promise<{ logId: string }>;
}

export const dynamic = "force-dynamic";

// Stable HSL palette — assigns each distinct exerciseId a recognisable
// accent so the per-exercise blocks read at a glance. Hue rotates around
// the wheel at the golden angle so adjacent groups stay distinct.
const EXERCISE_COLORS = [
  { ring: "ring-amber-400/50", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { ring: "ring-sky-400/50", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { ring: "ring-emerald-400/50", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { ring: "ring-violet-400/50", chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { ring: "ring-rose-400/50", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  { ring: "ring-cyan-400/50", chip: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  { ring: "ring-orange-400/50", chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  { ring: "ring-indigo-400/50", chip: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
];

interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  sets: WorkoutLogDetail["sets"];
  topWeight: number | null;
  hasPR: boolean;
}

function groupSetsByExercise(sets: WorkoutLogDetail["sets"]): ExerciseGroup[] {
  // Preserve the order in which each exerciseId first appeared so the
  // visual layout matches the workout flow.
  const order: string[] = [];
  const buckets = new Map<string, ExerciseGroup>();
  for (const set of sets) {
    const key = set.exerciseId || set.exerciseName;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        exerciseId: key,
        exerciseName: set.exerciseName,
        sets: [],
        topWeight: null,
        hasPR: false,
      };
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.sets.push(set);
    if (set.weight !== null) {
      bucket.topWeight =
        bucket.topWeight === null ? set.weight : Math.max(bucket.topWeight, set.weight);
    }
    if (set.isPR) bucket.hasPR = true;
  }
  return order.map((id) => buckets.get(id)!);
}

export default async function WorkoutLogDetailPage({ params }: PageProps) {
  const { logId } = await params;
  const t = await getTranslations("recentLogs.workoutDetail");

  try {
    const detail = await getWorkoutLogDetail(logId);
    const groups = groupSetsByExercise(detail.sets);

    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href="/gc-fitness/recent-logs">
              <ChevronLeft className="h-4 w-4" />
              {t("backToLogs")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/gc-fitness/chat?chatId=${detail.clientId}`}>
              <MessageCircle className="h-4 w-4" />
              {t("openChat")}
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
            <Metric
              label={t("metricStatus")}
              value={
                detail.status === "completed"
                  ? t("statusCompleted")
                  : t("statusStarted")
              }
            />
            <Metric label={t("metricStarted")} value={formatDateTime(detail.startedAt)} />
            <Metric label={t("metricCompleted")} value={formatDateTime(detail.completedAt)} />
            <Metric label={t("metricExercises")} value={String(detail.exerciseCount)} />
            <Metric label={t("metricSetsLogged")} value={`${detail.completedSetCount}/${detail.setCount}`} />
            <Metric label={t("metricLogId")} value={detail.id} mono />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4" />
                {t("rpeTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detail.rpe === null ? (
                <p className="text-sm text-muted-foreground">{t("rpeNotReported")}</p>
              ) : (
                <RpeMeter value={detail.rpe} label={t("rpeValue", { value: detail.rpe })} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <NotebookText className="h-4 w-4" />
                {t("athleteNotesTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detail.athleteNotes ? (
                <p className="whitespace-pre-wrap text-sm">{detail.athleteNotes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noAthleteNotes")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("setDetailTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noSetsLogged")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((group, gIdx) => {
                  const palette = EXERCISE_COLORS[gIdx % EXERCISE_COLORS.length];
                  return (
                    <div
                      key={group.exerciseId}
                      className={`rounded-lg border bg-card p-4 ring-1 ${palette.ring}`}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${palette.chip}`}
                          >
                            {gIdx + 1}
                          </span>
                          <h3 className="text-sm font-semibold">{group.exerciseName}</h3>
                          {group.hasPR ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
                              title={t("prBadge")}
                            >
                              <Trophy className="h-3 w-3" />
                              {t("prBadge")}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {t("exerciseSetCount", { count: group.sets.length })}
                          </span>
                          <span>
                            {group.topWeight !== null
                              ? t("exerciseTopWeight", { weight: group.topWeight })
                              : t("exerciseNoWeight")}
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[420px] text-sm">
                          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="py-1.5 pr-3">{t("columnHash")}</th>
                              <th className="py-1.5 pr-3">{t("columnReps")}</th>
                              <th className="py-1.5 pr-3">{t("columnWeight")}</th>
                              <th className="py-1.5 pr-3">{t("columnCompletedAt")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.sets.map((set) => (
                              <tr
                                key={`${set.index}-${set.setLogId}`}
                                className={
                                  set.isPR
                                    ? "border-b bg-amber-100/40 last:border-b-0 dark:bg-amber-900/20"
                                    : "border-b last:border-b-0"
                                }
                              >
                                <td className="py-2 pr-3">
                                  <div className="flex items-center gap-1.5">
                                    <span>{set.index}</span>
                                    {set.isPR ? (
                                      <span
                                        title={
                                          set.prEstimatedOneRM !== null
                                            ? t("prBadgeTitle", {
                                                value: Math.round(set.prEstimatedOneRM * 10) / 10,
                                              })
                                            : t("prBadge")
                                        }
                                      >
                                        <Trophy
                                          className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                                          aria-label={t("prBadge")}
                                        />
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="py-2 pr-3">{set.reps ?? t("emptyDash")}</td>
                                <td className="py-2 pr-3">
                                  {set.weight !== null
                                    ? `${set.weight} ${t("weightUnit")}`
                                    : t("emptyDash")}
                                </td>
                                <td className="py-2 pr-3 text-muted-foreground">
                                  {formatDateTime(set.completedAt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
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

function RpeMeter({ value, label }: { value: number; label: string }) {
  // Color ramps from emerald (light effort) to amber (8-9) to rose (10).
  const tone =
    value <= 4
      ? "bg-emerald-500"
      : value <= 7
        ? "bg-amber-500"
        : "bg-rose-500";
  const pct = Math.max(0, Math.min(100, value * 10));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xl font-semibold tabular-nums">{label}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
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
