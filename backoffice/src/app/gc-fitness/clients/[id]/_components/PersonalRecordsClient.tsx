"use client";

// PersonalRecordsClient.tsx — issue #405 part (b). Renders a client's personal
// records with the record each one beat ("previous PR") and how long ago it was
// set, filterable by muscle group and sortable by "most recent" / "most common"
// (most-trained exercises first). Pure client filtering over a server-provided
// list — no extra fetches.

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Trophy } from "lucide-react";

import type { PersonalRecordEntry } from "@/lib/gc-fitness/personal-records";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PersonalRecordsLabels {
  empty: string;
  muscleGroupLabel: string;
  muscleGroupAll: string;
  sortLabel: string;
  sortRecent: string;
  sortMostCommon: string;
  previousLabel: string; // "Previous: {value}"
  estOneRm: string; // "Est. 1RM {value} kg"
  noDate: string;
}

type SortKey = "recent" | "common";

// "pull_up_bar" → "Pull up bar" — mirrors the exercise-progress filter casing.
function formatMuscleGroup(group: string): string {
  return group.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** Compact record value: duration for time PRs, "{w} kg × {r}" for weighted,
 * "{r} reps" for bodyweight. */
function recordValue(
  snap: { weightKg: number; reps: number; durationSeconds: number | null },
  metric: "reps" | "time",
): string {
  if (metric === "time" && snap.durationSeconds != null) return `${snap.durationSeconds}s`;
  if (snap.weightKg > 0) return `${snap.weightKg} kg × ${snap.reps}`;
  return `${snap.reps} reps`;
}

function formatAgo(ms: number | null, locale: string, noDate: string): string {
  if (ms == null) return noDate;
  const diff = ms - Date.now(); // negative → in the past
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < month) return rtf.format(Math.round(diff / day), "day");
  if (abs < year) return rtf.format(Math.round(diff / month), "month");
  return rtf.format(Math.round(diff / year), "year");
}

export function PersonalRecordsClient({
  records,
  labels,
}: {
  records: PersonalRecordEntry[];
  labels: PersonalRecordsLabels;
}) {
  const locale = useLocale();
  const [muscleGroup, setMuscleGroup] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const muscleGroups = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) for (const g of r.muscleGroups) set.add(g);
    return Array.from(set).sort((a, b) =>
      formatMuscleGroup(a).localeCompare(formatMuscleGroup(b)),
    );
  }, [records]);

  const visible = useMemo(() => {
    const filtered =
      muscleGroup === "all"
        ? records
        : records.filter((r) => r.muscleGroups.includes(muscleGroup));
    const sorted = [...filtered];
    if (sort === "common") {
      sorted.sort(
        (a, b) =>
          b.sessionCount - a.sessionCount ||
          a.exerciseName.localeCompare(b.exerciseName),
      );
    }
    // "recent" keeps the server order (most-recent PR first).
    return sorted;
  }, [records, muscleGroup, sort]);

  if (records.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        {labels.empty}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {muscleGroups.length >= 2 ? (
          <div className="flex flex-col gap-1.5 sm:w-44">
            <label
              htmlFor="pr-muscle"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {labels.muscleGroupLabel}
            </label>
            <Select value={muscleGroup} onValueChange={setMuscleGroup}>
              <SelectTrigger id="pr-muscle" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{labels.muscleGroupAll}</SelectItem>
                {muscleGroups.map((g) => (
                  <SelectItem key={g} value={g}>
                    {formatMuscleGroup(g)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label
            htmlFor="pr-sort"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {labels.sortLabel}
          </label>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger id="pr-sort" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">{labels.sortRecent}</SelectItem>
              <SelectItem value="common">{labels.sortMostCommon}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ul className="space-y-2">
        {visible.map((r) => (
          <li
            key={r.exerciseId}
            className="rounded-lg border border-border bg-background px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.exerciseName}</p>
                {r.muscleGroups.length > 0 ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.muscleGroups.map(formatMuscleGroup).join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="flex items-center justify-end gap-1 font-semibold">
                  <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  {recordValue(r.current, r.metric)}
                </p>
                {r.metric === "reps" && r.current.estimatedOneRM > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {labels.estOneRm.replace(
                      "{value}",
                      String(Math.round(r.current.estimatedOneRM * 10) / 10),
                    )}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {formatAgo(r.current.achievedAtMs, locale, labels.noDate)}
                </p>
              </div>
            </div>
            {r.previous ? (
              <p className="mt-1.5 border-t border-dashed border-border pt-1.5 text-xs text-muted-foreground">
                {labels.previousLabel.replace(
                  "{value}",
                  recordValue(r.previous, r.metric),
                )}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
