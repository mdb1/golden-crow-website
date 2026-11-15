import Link from "next/link";
import { Activity, ArrowUpRight, Clock3, Pause } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatWorkoutElapsed,
  type ActiveWorkoutCardData,
} from "@/lib/gc-fitness/notifications-feed";

// The "client is training right now" hero card at the top of
// /gc-fitness/notifications (#507 — split out of the page).
export function ActiveWorkoutCard({
  item,
  t,
}: {
  item: ActiveWorkoutCardData;
  t: (key: string) => string;
}) {
  const elapsedLabel = formatWorkoutElapsed(item.elapsedSeconds);

  return (
    <section className="overflow-hidden rounded-card border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            <Activity className="h-3.5 w-3.5" />
            {t("activeWorkoutBadge")}
          </div>
          <div className="space-y-1">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground break-words sm:text-3xl">
              {item.clientName}
            </h2>
            <p className="text-lg font-medium text-muted-foreground break-words">
              {item.workoutName}
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-border bg-background px-4 py-2 shadow-sm">
          <span className="inline-flex items-center gap-2 font-mono text-xl font-semibold tabular-nums text-foreground">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            {elapsedLabel}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-background/75 p-4">
          <p className="text-sm font-medium text-muted-foreground">
            {t("currentExercise")}
          </p>
          <p className="mt-1 break-words text-xl font-semibold text-foreground">
            {item.currentExerciseName}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background/75 p-4">
          <p className="text-sm font-medium text-muted-foreground">
            {t("currentSet")}
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {item.currentSet} / {item.totalSets}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background/75 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">
              {t("progress")}
            </p>
            <p className="text-sm font-semibold text-foreground">
              {Math.round(item.progress * 100)}%
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.max(4, item.progress * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button asChild className="h-11 flex-1 gap-2 rounded-full">
          <Link href={`/gc-fitness/clients/${item.clientId}/sessions/${item.assignmentId}/run`}>
            <Pause className="h-4 w-4" />
            {t("pauseWorkout")}
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 flex-1 gap-2 rounded-full">
          <Link href={`/gc-fitness/clients/${item.clientId}`}>
            <ArrowUpRight className="h-4 w-4" />
            {t("viewDetails")}
          </Link>
        </Button>
      </div>
    </section>
  );
}
