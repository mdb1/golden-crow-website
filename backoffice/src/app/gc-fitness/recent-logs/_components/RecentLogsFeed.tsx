"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Bell,
  CalendarClock,
  MessageCircle,
  Filter,
  Dumbbell,
  Gauge,
  ListChecks,
  Eye,
  Camera,
  Scale,
  StickyNote,
  User,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import { PillTabs, type PillTabItem } from "@/components/gc-fitness/pill-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import {
  listRecentLogsForTrainerPage,
  type RecentLogRow,
} from "@/lib/gc-fitness/recent-logs-actions";
import {
  formatRecentLogDayHeading,
  formatRecentLogTime,
  recentLogDayKeyFromIso,
} from "@/lib/gc-fitness/recent-logs-time";

const PAGE_SIZE = 20;

interface Props {
  logs: RecentLogRow[];
  clients: Array<{ id: string; name: string; photoURL: string | null }>;
  trainerTimezone: string;
  /** Cursor for the next page (from the server). Null ⇒ nothing more to load. */
  initialCursor?: string | null;
  /** Whether another page may exist beyond the initially-loaded rows. */
  initialHasMore?: boolean;
}

// Category → icon + label key. NEUTRAL: one muted `secondary` badge per the
// backoffice style — no per-category colors.
const CATEGORY_ICON: Record<
  RecentLogRow["category"],
  ComponentType<{ className?: string }>
> = {
  habit: ListChecks,
  workout: Dumbbell,
  reschedule: ArrowRightLeft,
  reminder: Bell,
  photo: Camera,
  weight: Scale,
  signup: User,
  profile: User,
};
const CATEGORY_LABEL_KEY: Record<RecentLogRow["category"], string> = {
  habit: "badgeHabit",
  workout: "badgeWorkout",
  reschedule: "badgeReschedule",
  reminder: "badgeReminder",
  photo: "badgePhoto",
  weight: "badgeWeight",
  signup: "badgeSignup",
  profile: "badgeProfile",
};

export function RecentLogsFeed({
  logs,
  clients,
  trainerTimezone,
  initialCursor = null,
  initialHasMore = false,
}: Props) {
  const t = useTranslations("recentLogs.feed");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // 260531-fwc — server-paginated. Filters refetch page 1 server-side (the
  // feed is no longer fully in memory); "Cargar más" appends the next window.
  const [rows, setRows] = useState<RecentLogRow[]>(logs);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [loading, setLoading] = useState(false);

  // Re-fetch page 1 whenever a filter changes (translates the filter to the
  // server-side client / type scope so pagination + filtering compose).
  async function applyFilters(nextClientIds: Set<string>, nextType: string) {
    setSelectedClientIds(new Set(nextClientIds));
    setTypeFilter(nextType);
    if (nextClientIds.size === 0) {
      setRows([]);
      setCursor(null);
      setHasMore(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listRecentLogsForTrainerPage(
        null,
        PAGE_SIZE,
        Array.from(nextClientIds),
        nextType === "all" ? null : (nextType as RecentLogRow["category"]),
      );
      setRows(res.logs);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!hasMore || loading) return;
    setLoading(true);
    try {
      const res = await listRecentLogsForTrainerPage(
        cursor,
        PAGE_SIZE,
        Array.from(selectedClientIds),
        typeFilter === "all" ? null : (typeFilter as RecentLogRow["category"]),
      );
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const fresh = res.logs.filter((r) => !seen.has(r.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      setCursor(res.nextCursor ?? cursor);
      setHasMore(res.nextCursor ? res.hasMore : false);
    } finally {
      setLoading(false);
    }
  }

  function toggleClient(clientId: string) {
    const next = new Set(selectedClientIds);
    if (next.has(clientId)) next.delete(clientId);
    else next.add(clientId);
    void applyFilters(next, typeFilter);
  }

  function selectAllClients() {
    void applyFilters(new Set(clients.map((client) => client.id)), typeFilter);
  }

  function clearClients() {
    void applyFilters(new Set(), typeFilter);
  }

  const filtered = rows;
  // Flat rows grouped under day headings so the date moves out of every row
  // into a single per-day header. (Per-client grouping was removed — the Client
  // filter above covers that need.)
  const chronoSections = useMemo(
    () => groupRowsByDayFlat(filtered, trainerTimezone, locale, t("today"), t("yesterday")),
    [filtered, locale, t, trainerTimezone],
  );

  // Category filter pills — wired 1:1 to the EXISTING single-category server
  // filter (`typeFilter`). Each pill re-fetches page 1 scoped to that category.
  // No count badges: the feed is server-paginated, so a count would only reflect
  // the rows loaded SO FAR and jump as more pages load — misleading, so we drop
  // it and keep the labels clean.
  const tabItems: PillTabItem[] = [
    {
      key: "all",
      label: t("tabAll"),
      onSelect: () => applyFilters(selectedClientIds, "all"),
    },
    {
      key: "workout",
      label: t("workoutsOption"),
      icon: <Dumbbell />,
      onSelect: () => applyFilters(selectedClientIds, "workout"),
    },
    {
      key: "habit",
      label: t("habitsOption"),
      icon: <ListChecks />,
      onSelect: () => applyFilters(selectedClientIds, "habit"),
    },
    {
      key: "reschedule",
      label: t("reschedulesOption"),
      icon: <ArrowRightLeft />,
      onSelect: () => applyFilters(selectedClientIds, "reschedule"),
    },
    {
      key: "reminder",
      label: t("remindersOption"),
      icon: <Bell />,
      onSelect: () => applyFilters(selectedClientIds, "reminder"),
    },
    {
      key: "photo",
      label: t("photosOption"),
      icon: <Camera />,
      onSelect: () => applyFilters(selectedClientIds, "photo"),
    },
    {
      key: "weight",
      label: t("weightOption"),
      icon: <Scale />,
      onSelect: () => applyFilters(selectedClientIds, "weight"),
    },
    {
      key: "signup",
      label: t("signupOption"),
      icon: <User />,
      onSelect: () => applyFilters(selectedClientIds, "signup"),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="min-w-0 max-w-full overflow-x-auto">
            <PillTabs activeKey={typeFilter} items={tabItems} />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {t("clientLabel")}
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {t("selectedClients", {
                    selected: selectedClientIds.size,
                    total: clients.length,
                  })}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={selectAllClients}
                  disabled={loading || selectedClientIds.size === clients.length}
                >
                  <Users className="size-4" />
                  {tCommon("selectAll")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={clearClients}
                  disabled={loading || selectedClientIds.size === 0}
                >
                  {tCommon("clear")}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {clients.map((client) => {
                const active = selectedClientIds.has(client.id);
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => toggleClient(client.id)}
                    disabled={loading}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors disabled:opacity-60",
                      active
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-border bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <ClientAvatar
                      name={client.name}
                      photoURL={client.photoURL}
                      size="sm"
                    />
                    <span className="truncate">{client.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {selectedClientIds.size === 0 ? t("pickClients") : t("noLogs")}
            </CardContent>
          </Card>
        ) : null}
        {chronoSections.map((section) => (
          <div key={section.key} className="flex flex-col gap-2">
            <h3 className="sticky top-0 z-10 -mx-0.5 bg-background/95 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
              {section.label}
            </h3>
            {section.rows.map((row) => (
              <RecentLogItem
                key={row.id}
                row={row}
                router={router}
                t={t}
                timezone={trainerTimezone}
                locale={locale}
              />
            ))}
          </div>
        ))}
      </div>

      {hasMore || loading ? (
        <div className="flex justify-center pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loading || !hasMore}
          >
            {loading ? t("loading") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RecentLogItem({
  row,
  router,
  t,
  timezone,
  locale,
}: {
  row: RecentLogRow;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslations>;
  timezone: string;
  locale: string;
}) {
  const CatIcon = CATEGORY_ICON[row.category];
  const openProfile = () => router.push(`/gc-fitness/clients/${row.clientId}`);
  // The client name is already shown as the gold link, but row.title also
  // embeds it (e.g. "Ezcurra - Workout completed: …"). Strip the leading name
  // + separator so it isn't shown twice; fall back to the full title if it
  // doesn't lead with the name (e.g. reschedule/system rows).
  const actionTitle = row.title.startsWith(row.clientName)
    ? row.title.slice(row.clientName.length).replace(/^[\s\-–—·:]+/, "") ||
      row.title
    : row.title;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openProfile}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openProfile();
        }
      }}
      className="group flex cursor-pointer flex-wrap items-start gap-x-3 gap-y-2 rounded-[1.25rem] border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30 hover:bg-accent/40 sm:flex-nowrap"
    >
      <ClientAvatar name={row.clientName} photoURL={row.clientPhotoURL} size="md" />
      <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {row.clientId ? (
            <Link
              href={`/gc-fitness/clients/${row.clientId}`}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 break-words rounded-sm text-sm font-semibold leading-snug text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.clientName}
            </Link>
          ) : (
            <span className="min-w-0 break-words text-sm font-semibold leading-snug text-foreground">
              {row.clientName}
            </span>
          )}
          <span className="min-w-0 break-words text-sm text-foreground sm:truncate">
            {actionTitle}
          </span>
          <span
            aria-hidden
            className="inline-flex items-center text-muted-foreground [&>svg]:size-3.5"
            title={t(CATEGORY_LABEL_KEY[row.category])}
          >
            {CatIcon ? <CatIcon /> : null}
          </span>
          {row.forCivilDate ? (
            <Badge
              variant="warning"
              className="gap-1 px-1.5 py-0 text-[10px] font-normal [&>svg]:size-3"
            >
              <CalendarClock />
              {t("forDay", { date: formatCivilDate(row.forCivilDate, locale) })}
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
              {t("notesBadge")}
            </Badge>
          ) : null}
          {row.workout ? (
            <Badge
              variant="outline"
              className="gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground [&>svg]:size-3 [&>svg]:opacity-70"
            >
              {(row.workout.source ?? "client") === "coach"
                ? t("sourceCoach")
                : t("sourceClient")}
            </Badge>
          ) : null}
        </div>
        {row.detail ? (
          <p className="mt-0.5 break-words text-xs text-muted-foreground sm:truncate">
            {row.detail}
          </p>
        ) : null}
      </div>
      <div className="flex w-full shrink-0 basis-full items-center justify-between gap-2 sm:w-auto sm:basis-auto sm:justify-end">
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:mt-0.5">
          {formatRecentLogTime(row.eventAt, timezone, locale)}
        </span>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground sm:size-9"
            title={t("openChat")}
          >
            <Link href={`/gc-fitness/chat?chatId=${row.clientId}`}>
              <MessageCircle className="h-4 w-4" />
              <span className="sr-only">{t("openChat")}</span>
            </Link>
          </Button>
          {row.workoutLogId ? (
            <Button asChild variant="outline" size="sm" className="h-11 gap-1.5 px-3 sm:h-9 sm:px-2.5">
              <Link href={`/gc-fitness/recent-logs/workouts/${row.workoutLogId}`}>
                <Eye className="h-4 w-4" />
                {t("viewWorkout")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function groupRowsByDayFlat(
  rows: RecentLogRow[],
  timezone: string,
  locale: string,
  todayLabel: string,
  yesterdayLabel: string,
): Array<{ key: string; label: string; rows: RecentLogRow[] }> {
  const map = new Map<string, { key: string; label: string; rows: RecentLogRow[] }>();
  for (const row of rows) {
    const key = recentLogDayKeyFromIso(row.eventAt, timezone);
    const existing = map.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(key, {
      key,
      label: formatRecentLogDayHeading(row.eventAt, timezone, locale, {
        today: todayLabel,
        yesterday: yesterdayLabel,
      }),
      rows: [row],
    });
  }
  return Array.from(map.values());
}

// Render a "YYYY-MM-DD" civil date as a short day label ("May 29" / "29 may").
// Construct from parts (NOT `new Date(iso)`) so the local-time constructor is
// used instead of UTC-midnight parsing — otherwise a negative-offset host
// shifts the day back by one.
function formatCivilDate(civil: string, locale: string): string {
  return formatCivilDateLabel(civil, { month: "short", day: "numeric" }, locale);
}
