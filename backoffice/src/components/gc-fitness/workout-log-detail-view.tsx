"use client";

// workout-log-detail-view.tsx
//
// THE single, canonical "real workout detail" body — the rich logged-actuals
// view (status/RPE/notes + per-exercise completed sets with timestamps and
// rest). Extracted from the recent-logs `/workouts/[logId]` page so the SAME
// view renders in every place a workout can be inspected:
//   - Recent Logs → /workouts/[logId] (full page)
//   - Calendar → WorkoutDetailDialog (modal, for COMPLETED assignments)
//
// Presentational only: it takes a fully-resolved `WorkoutLogDetail` (a plain
// serializable object, so a server component can fetch + pass it straight in)
// and renders the body. Action chrome (share image, open chat, edit, delete)
// stays with each host so the controls can adapt to the surface ("según
// contexto"): the calendar host adds edit/delete, the recent-logs host adds
// back/chat. This is a client component (uses `useTranslations`) and renders
// fine inside both server pages and client dialogs.

import { Trophy, Dumbbell, Gauge, NotebookText } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WorkoutLogDetail } from "@/lib/gc-fitness/recent-logs-actions";

/** Compact "previous PR" value for the PR row: duration for time PRs, else
 * "{weight} kg × {reps}" (issue #405). */
function prPreviousText(
  prev: NonNullable<WorkoutLogDetail["sets"][number]["prPrevious"]>,
): string {
  if (prev.durationSeconds !== null) return `${prev.durationSeconds}s`;
  return `${prev.weightKg} kg × ${prev.reps}`;
}

// Stable HSL palette — assigns each distinct exerciseId a recognisable
// accent so the per-exercise blocks read at a glance.
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
  supersetGroup: string | null;
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
        supersetGroup: set.supersetGroup,
      };
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.sets.push(set);
    if (set.metric !== "time" && set.weight !== null) {
      bucket.topWeight =
        bucket.topWeight === null ? set.weight : Math.max(bucket.topWeight, set.weight);
    }
    if (set.isPR) bucket.hasPR = true;
  }
  return order.map((id) => buckets.get(id)!);
}

export function WorkoutLogDetailView({ detail }: { detail: WorkoutLogDetail }) {
  const t = useTranslations("recentLogs.workoutDetail");
  const groups = groupSetsByExercise(detail.sets);
  const restMap = restBySetLogId(detail.sets);
  const completedAtForDisplay = resolveCompletedAtForDisplay(detail);
  const sessionDate = formatDateOnly(
    completedAtForDisplay ?? detail.startedAt,
    detail.clientTimezone,
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Dumbbell className="h-5 w-5" />
            {detail.clientName} · {detail.workoutName}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wide">
              {(detail.source ?? "client") === "coach"
                ? t("sourceCoach")
                : t("sourceClient")}
            </Badge>
          </div>
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
          <Metric label={t("metricStarted")} value={formatDateTime(detail.startedAt, detail.clientTimezone)} />
          <Metric
            label={t("metricCompleted")}
            value={formatDateTime(completedAtForDisplay, detail.clientTimezone)}
          />
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
          {sessionDate ? (
            <p className="text-sm capitalize text-muted-foreground">
              {sessionDate}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSetsLogged")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((group, gIdx) => {
                const palette = EXERCISE_COLORS[gIdx % EXERCISE_COLORS.length];
                const isTimeGroup =
                  group.sets.length > 0 &&
                  group.sets.every((set) => set.metric === "time");
                return (
                  <div
                    key={group.exerciseId}
                    className={`rounded-2xl border bg-card p-4 ring-1 ${palette.ring}`}
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${palette.chip}`}
                        >
                          {gIdx + 1}
                        </span>
                        <h3 className="text-sm font-semibold">{group.exerciseName}</h3>
                        {group.supersetGroup ? (
                          <span
                            className="inline-flex items-center rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300"
                            title="Superserie"
                          >
                            Superserie {group.supersetGroup}
                          </span>
                        ) : null}
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
                            <th className="py-1.5 pr-3">
                              {isTimeGroup ? t("columnDuration") : t("columnReps")}
                            </th>
                            {!isTimeGroup ? (
                              <th className="py-1.5 pr-3">{t("columnWeight")}</th>
                            ) : null}
                            <th className="py-1.5 pr-3">{t("columnCompletedAt")}</th>
                            <th className="py-1.5 pr-3">Descanso</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.sets.map((set) => {
                            const isTimeSet = set.metric === "time";
                            return (
                              <tr
                                key={`${set.index}-${set.setLogId}`}
                                className={
                                  set.isPR
                                    ? "border-b bg-amber-100/40 last:border-b-0 dark:bg-amber-900/20"
                                    : "border-b last:border-b-0"
                                }
                              >
                                <td className="py-2 pr-3">
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
                                    {set.isPR && set.prPrevious ? (
                                      <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                                        {t("prPreviousLabel", {
                                          value: prPreviousText(set.prPrevious),
                                        })}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="py-2 pr-3">
                                  {isTimeSet
                                    ? set.durationSeconds !== null
                                      ? `${set.durationSeconds}s`
                                      : t("emptyDash")
                                    : (set.reps ?? t("emptyDash"))}
                                </td>
                                {!isTimeGroup ? (
                                  <td className="py-2 pr-3">
                                    {!isTimeSet && set.weight !== null
                                      ? `${set.weight} ${t("weightUnit")}`
                                      : t("emptyDash")}
                                  </td>
                                ) : null}
                                <td className="py-2 pr-3 text-muted-foreground">
                                  {formatTimeOnly(set.completedAt, detail.clientTimezone)}
                                </td>
                                <td className="py-2 pr-3 text-muted-foreground">
                                  {restMap.has(set.setLogId)
                                    ? formatRest(restMap.get(set.setLogId)!)
                                    : t("emptyDash")}
                                </td>
                              </tr>
                            );
                          })}
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
    <div className="rounded-2xl border p-3">
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

// `timeZone` is the CLIENT's IANA zone — REQUIRED. Omitting it would format
// in the host tz (UTC). The recent-logs server page resolves it; the calendar
// dialog gets it from the same WorkoutLogDetail builder.
function formatDateTime(iso: string | null, timeZone: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

// Per-row timestamps only need the time — the date is shown once in the
// section header (it's the same day for the whole workout).
function formatTimeOnly(iso: string | null, timeZone: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function formatDateOnly(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  });
}

function resolveCompletedAtForDisplay(detail: WorkoutLogDetail): string | null {
  const startedAt = detail.startedAt;
  const completedAt = detail.completedAt;
  const durationSeconds = detail.durationSeconds;

  if (completedAt && startedAt && completedAt !== startedAt) {
    return completedAt;
  }

  if (durationSeconds !== null && durationSeconds > 0 && startedAt) {
    const startMs = Date.parse(startedAt);
    if (!Number.isNaN(startMs)) {
      return new Date(startMs + durationSeconds * 1000).toISOString();
    }
  }

  return completedAt ?? startedAt;
}

// Human rest gap between two consecutive set timestamps.
function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/**
 * Rest (seconds) BEFORE each set — the gap from the previous set's
 * completion. Keyed by setLogId. Computed across the flat, completion-ordered
 * set list so it reflects true inter-set rest even across supersets. First
 * set (and any non-positive/again-stamped gaps) → omitted.
 */
function restBySetLogId(
  sets: WorkoutLogDetail["sets"],
): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i < sets.length; i += 1) {
    const prev = sets[i - 1].completedAt;
    const cur = sets[i].completedAt;
    if (!prev || !cur || !sets[i].setLogId) continue;
    const delta = Math.round(
      (new Date(cur).getTime() - new Date(prev).getTime()) / 1000,
    );
    if (Number.isFinite(delta) && delta > 0) {
      map.set(sets[i].setLogId, delta);
    }
  }
  return map;
}
