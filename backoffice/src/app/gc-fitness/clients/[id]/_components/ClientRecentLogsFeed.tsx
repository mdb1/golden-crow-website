"use client";

import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRightLeft,
  CalendarClock,
  Camera,
  ChevronRight,
  Dumbbell,
  Eye,
  Gauge,
  ListChecks,
  MessageCircle,
  Scale,
  StickyNote,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listRecentLogsForClient,
  listRecentLogsForClientAsAdmin,
  type RecentLogRow,
} from "@/lib/gc-fitness/recent-logs-actions";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";

// Must match the server page size (listRecentLogsForClient default). The feed
// pages through already-loaded rows in memory; only when the user crosses the
// loaded edge AND more rows may exist does it fetch the next window on demand.
const PAGE_SIZE = 20;

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
  /** The single client this feed belongs to — used for "load more" fetches. */
  clientId: string;
  /** IANA timezone used to render timestamps in the client's local time. */
  timezone: string;
  /** Cursor for the next page (from the server). Null/absent ⇒ no more to load. */
  initialCursor?: string | null;
  /** Whether another page may exist beyond the initially-loaded rows. */
  initialHasMore?: boolean;
  /**
   * When true, render the per-row chat + view-workout action buttons. The admin
   * god-mode surface is read-only and those targets are trainer-scoped (would
   * 403 for an admin), so admin passes `false`.
   */
  showActions?: boolean;
  /**
   * Routing context for making rows clickable. "trainer" links to the trainer
   * surfaces; "admin" links to the nested admin god-mode detail routes (which
   * require `coachUid`). A function prop can't cross the server→client boundary,
   * so the feed computes hrefs internally from these serializable inputs.
   */
  linkMode?: "trainer" | "admin";
  /** Coach uid — required when `linkMode === "admin"` to build the base path. */
  coachUid?: string;
}

/**
 * Recent-activity list for a SINGLE client, paginated 20 per page. Shared by the
 * trainer client-profile section and the admin god-mode client view. The initial
 * `logs` are page 1 (newest-first); "Anterior"/"Siguiente" page through loaded
 * rows in memory, and "Siguiente" fetches the next time-cursor window on demand
 * when the user reaches the loaded edge (260531-fwc). No exact total page count —
 * the feed loads only what's requested.
 */
export function ClientRecentLogsFeed({
  logs,
  clientId,
  timezone,
  initialCursor = null,
  initialHasMore = false,
  showActions = true,
  linkMode = "trainer",
  coachUid,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("clients.detail.recentLogs");
  const tf = useTranslations("recentLogs.feed");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<RecentLogRow[]>(logs);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [loading, setLoading] = useState(false);

  // Detail destination for a row, or null when the category has no detail
  // surface. Workout + photo are wired in both contexts (trainer routes and the
  // nested admin god-mode routes). Habit + weight have no detail page yet and
  // stay non-clickable.
  function hrefForRow(row: RecentLogRow): string | null {
    const adminBase =
      linkMode === "admin" && coachUid
        ? `/gc-fitness/admin/coaches/${coachUid}/clients/${row.clientId}`
        : null;
    // In admin mode without a coachUid we can't build a safe path — don't link.
    if (linkMode === "admin" && !adminBase) return null;

    switch (row.category) {
      case "workout":
        if (!row.workoutLogId) return null;
        return adminBase
          ? `${adminBase}/workouts/${row.workoutLogId}`
          : `/gc-fitness/recent-logs/workouts/${row.workoutLogId}`;
      case "photo":
        return adminBase
          ? `${adminBase}/photos`
          : `/gc-fitness/clients/${row.clientId}/compare-photos`;
      default:
        return null;
    }
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [rows, safePage],
  );
  // "Siguiente" can advance while there's another loaded page OR more to fetch.
  const canForward = safePage < pageCount - 1 || hasMore;

  async function handleNext() {
    // Cheap path: another page is already loaded in memory.
    if (safePage < pageCount - 1) {
      setPage(safePage + 1);
      return;
    }
    // Edge of loaded rows — fetch the next window on demand.
    if (!hasMore || loading) return;
    setLoading(true);
    try {
      const res =
        linkMode === "admin" && coachUid
          ? await listRecentLogsForClientAsAdmin(coachUid, clientId, cursor)
          : await listRecentLogsForClient(clientId, cursor);
      // Dedupe by row id — an inclusive `<=` cursor can re-return the boundary
      // row, and a few skewed rows (see action docs) can repeat across windows.
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const fresh = res.logs.filter((r) => !seen.has(r.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      // An empty window (nextCursor === null) means there's nothing older —
      // keep the old cursor and stop offering "Siguiente".
      setCursor(res.nextCursor ?? cursor);
      setHasMore(res.nextCursor ? res.hasMore : false);
      setPage(safePage + 1);
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
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
              <RowShell href={hrefForRow(row)}>
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
                      {tf("forDay", {
                        date: formatCivilDate(row.forCivilDate, locale),
                      })}
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
                  {row.workout ? (
                    <Badge
                      variant="outline"
                      className="gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground [&>svg]:size-3 [&>svg]:opacity-70"
                    >
                      {(row.workout.source ?? "client") === "coach"
                        ? tf("sourceCoach")
                        : tf("sourceClient")}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatDateTime(row.eventAt, timezone)}
                  {row.detail ? ` · ${row.detail}` : ""}
                </p>
              </RowShell>
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

      {pageCount > 1 || hasMore ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("pageCurrent", { current: safePage + 1 })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0 || loading}
            >
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={!canForward || loading}
            >
              {loading ? t("loading") : t("next")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Wraps a row's left content: a clickable Link (with a hover chevron) when the
// category has a detail destination, otherwise an inert div. Keeping the action
// buttons OUTSIDE this wrapper avoids nesting interactive elements in an anchor.
function RowShell({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  if (!href) {
    return <div className="min-w-0 flex-1">{children}</div>;
  }
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-1 items-center gap-2 rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function formatDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

// Render a "YYYY-MM-DD" civil date as a short day label. Construct from parts
// (NOT `new Date(iso)`) so a negative-offset host doesn't shift the day back.
function formatCivilDate(civil: string, locale: string): string {
  return formatCivilDateLabel(
    civil,
    { month: "short", day: "numeric" },
    locale,
  );
}
