"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CalendarClock,
  Camera,
  Dumbbell,
  Eye,
  Gauge,
  ListChecks,
  MessageCircle,
  Scale,
  StickyNote,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RecentLogRow } from "@/lib/gc-fitness/recent-logs-actions";

const PAGE_SIZE = 10;

const CATEGORY_ICON: Record<
  RecentLogRow["category"],
  ComponentType<{ className?: string }>
> = {
  habit: ListChecks,
  workout: Dumbbell,
  reschedule: ArrowRightLeft,
  photo: Camera,
  weight: Scale,
  signup: User,
};

const CATEGORY_LABEL_KEY: Record<RecentLogRow["category"], string> = {
  habit: "badgeHabit",
  workout: "badgeWorkout",
  reschedule: "badgeReschedule",
  photo: "badgePhoto",
  weight: "badgeWeight",
  signup: "badgeSignup",
};

const CATEGORY_TONE: Record<RecentLogRow["category"], string> = {
  workout:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
  habit:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  reschedule:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  photo:
    "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950/40 dark:text-pink-300",
  weight:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300",
  signup:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
};

interface Props {
  logs: RecentLogRow[];
  /**
   * When true, render the per-row chat + view-workout action buttons. The admin
   * god-mode surface is read-only and those targets are trainer-scoped (would
   * 403 for an admin), so admin passes `false`.
   */
  showActions?: boolean;
}

/**
 * Paginated (10 per page) recent-activity list for a SINGLE client. Shared by
 * the trainer client-profile section and the admin god-mode client view. The
 * incoming `logs` are already sorted newest-first by the server action.
 */
export function ClientRecentLogsFeed({ logs, showActions = true }: Props) {
  const t = useTranslations("clients.detail.recentLogs");
  const tf = useTranslations("recentLogs.feed");
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => logs.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [logs, safePage],
  );

  if (logs.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {pageRows.map((row) => {
          const CatIcon = CATEGORY_ICON[row.category];
          return (
            <div
              key={row.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`gap-1 px-1.5 py-0 text-[11px] font-normal [&>svg]:size-3 ${CATEGORY_TONE[row.category]}`}
                  >
                    {CatIcon ? <CatIcon /> : null}
                    {tf(CATEGORY_LABEL_KEY[row.category])}
                  </Badge>
                  <span className="truncate text-sm font-medium">
                    {row.title}
                  </span>
                  {row.forCivilDate ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-normal text-amber-700 [&>svg]:size-3 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                    >
                      <CalendarClock />
                      {tf("forDay", { date: formatCivilDate(row.forCivilDate) })}
                    </Badge>
                  ) : null}
                  {row.workout?.rpe != null ? (
                    <Badge
                      variant="outline"
                      className="gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground [&>svg]:size-3 [&>svg]:opacity-70"
                    >
                      <Gauge />
                      RPE {row.workout.rpe}
                    </Badge>
                  ) : null}
                  {row.workout?.hasNotes ? (
                    <Badge
                      variant="outline"
                      className="gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground [&>svg]:size-3 [&>svg]:opacity-70"
                    >
                      <StickyNote />
                      {tf("notesBadge")}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatDateTime(row.eventAt)}
                  {row.detail ? ` · ${row.detail}` : ""}
                </p>
              </div>
              {showActions ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    title={tf("openChat")}
                  >
                    <Link href={`/gc-fitness/chat?chatId=${row.clientId}`}>
                      <MessageCircle className="h-4 w-4" />
                      <span className="sr-only">{tf("openChat")}</span>
                    </Link>
                  </Button>
                  {row.workoutLogId ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2.5"
                    >
                      <Link
                        href={`/gc-fitness/recent-logs/workouts/${row.workoutLogId}`}
                      >
                        <Eye className="h-4 w-4" />
                        {tf("viewWorkout")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("pageOf", { current: safePage + 1, total: pageCount })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
            >
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Render a "YYYY-MM-DD" civil date as a short day label. Construct from parts
// (NOT `new Date(iso)`) so a negative-offset host doesn't shift the day back.
function formatCivilDate(civil: string): string {
  const [y, m, d] = civil.split("-").map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return civil;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return civil;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
