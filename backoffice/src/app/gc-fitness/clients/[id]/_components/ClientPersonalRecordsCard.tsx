"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { ArrowUpRight, Dumbbell, Loader2, Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  listClientPersonalRecordsPage,
  type ClientPersonalRecordRow,
  type ClientPersonalRecordsFilter,
  type ClientPersonalRecordsPage,
} from "@/lib/gc-fitness/client-personal-records-actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ClientPersonalRecordsCard({
  initialPage,
}: {
  initialPage: ClientPersonalRecordsPage;
}) {
  const locale = useLocale();
  const t = useTranslations("clients.detail.personalRecords");
  const [filter, setFilter] = useState<ClientPersonalRecordsFilter>({ kind: "all" });
  const [rows, setRows] = useState(initialPage.rows);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasCommon = initialPage.filters.commonExercises.length > 0;
  const hasMuscleGroups = initialPage.filters.muscleGroups.length > 0;

  const rowCountLabel = useMemo(
    () => t("visibleCount", { count: rows.length }),
    [rows.length, t],
  );

  function applyFilter(nextFilter: ClientPersonalRecordsFilter) {
    setFilter(nextFilter);
    setError(null);
    startTransition(async () => {
      try {
        const nextPage = await listClientPersonalRecordsPage({
          clientId: initialPage.clientId,
          filter: nextFilter,
        });
        setRows(nextPage.rows);
        setCursor(nextPage.nextCursor);
        setHasMore(nextPage.hasMore);
      } catch {
        setError(t("loadFailed"));
      }
    });
  }

  function loadMore() {
    if (!cursor || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const nextPage = await listClientPersonalRecordsPage({
          clientId: initialPage.clientId,
          filter,
          cursor,
        });
        setRows((current) => [...current, ...nextPage.rows]);
        setCursor(nextPage.nextCursor);
        setHasMore(nextPage.hasMore);
      } catch {
        setError(t("loadFailed"));
      }
    });
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium">
            <Trophy className="size-4 text-amber-600" />
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Badge variant="outline" className="w-fit">
          {rowCountLabel}
        </Badge>
      </div>

      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterButton
            active={filter.kind === "all"}
            onClick={() => applyFilter({ kind: "all" })}
          >
            {t("filterAll")}
          </FilterButton>
          <FilterButton
            active={filter.kind === "common"}
            disabled={!hasCommon}
            onClick={() => applyFilter({ kind: "common" })}
          >
            {t("filterCommon")}
          </FilterButton>
        </div>

        {hasMuscleGroups ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("muscleGroupLabel")}
            </span>
            <Select
              value={filter.kind === "muscle" ? filter.muscleGroup : "all"}
              onValueChange={(value) =>
                applyFilter(
                  value === "all"
                    ? { kind: "all" }
                    : { kind: "muscle", muscleGroup: value },
                )
              }
            >
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("muscleGroupAll")}</SelectItem>
                {initialPage.filters.muscleGroups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {formatMuscleGroup(group)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {filter.kind === "common" && hasCommon ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {initialPage.filters.commonExercises.slice(0, 8).map((exercise) => (
            <span
              key={exercise.exerciseId}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
            >
              <Dumbbell className="size-3" />
              {exercise.name}
              <span className="tabular-nums">x{exercise.prCount}</span>
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {rows.map((row) => (
            <PersonalRecordRow
              key={row.id}
              row={row}
              locale={locale}
              labels={{
                current: t("current"),
                previous: t("previous"),
                first: t("firstPr"),
                openWorkout: t("openWorkout"),
              }}
            />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={loadMore}
            disabled={isPending || !cursor}
          >
            {isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function FilterButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {children}
    </button>
  );
}

function PersonalRecordRow({
  row,
  locale,
  labels,
}: {
  row: ClientPersonalRecordRow;
  locale: string;
  labels: {
    current: string;
    previous: string;
    first: string;
    openWorkout: string;
  };
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-md border bg-background p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{row.exerciseName}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {row.workoutName}
          </p>
        </div>
        <Badge className="shrink-0 bg-amber-500/20 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300">
          PR
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label={labels.current} value={formatPrValue(row)} strong />
        <Metric
          label={labels.previous}
          value={formatPreviousPrValue(row) ?? labels.first}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{formatRelative(row.achievedAtISO, locale)}</span>
        <Link
          href={`/gc-fitness/recent-logs/workouts/${row.workoutLogId}`}
          className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
        >
          {labels.openWorkout}
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("truncate tabular-nums", strong && "font-semibold")}>
        {value}
      </p>
    </div>
  );
}

function formatPrValue(row: ClientPersonalRecordRow): string {
  if (row.durationSeconds !== null && row.durationSeconds > 0) {
    return formatDuration(row.durationSeconds);
  }
  const parts: string[] = [];
  if (row.weightKg !== null) parts.push(`${formatNumber(row.weightKg)} kg`);
  if (row.reps !== null) parts.push(`x ${Math.round(row.reps)}`);
  const lifted = parts.join(" ");
  const e1rm =
    row.estimatedOneRM !== null && row.estimatedOneRM > 0
      ? `${formatNumber(row.estimatedOneRM)} kg 1RM`
      : "";
  return [lifted, e1rm].filter(Boolean).join(" · ") || "PR";
}

function formatPreviousPrValue(row: ClientPersonalRecordRow): string | null {
  if (row.previousDurationSeconds !== null && row.previousDurationSeconds > 0) {
    return formatDuration(row.previousDurationSeconds);
  }
  if (
    row.previousEstimatedOneRM !== null &&
    row.previousEstimatedOneRM > 0
  ) {
    return `${formatNumber(row.previousEstimatedOneRM)} kg 1RM`;
  }
  return null;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatRelative(iso: string | null, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, "day");
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return rtf.format(diffMonths, "month");
  return rtf.format(Math.round(diffMonths / 12), "year");
}

function formatMuscleGroup(group: string): string {
  return group.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}
