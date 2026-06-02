"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
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
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listRecentLogsForTrainerPage,
  type RecentLogRow,
} from "@/lib/gc-fitness/recent-logs-actions";

const PAGE_SIZE = 20;

interface Props {
  logs: RecentLogRow[];
  clients: Array<{ id: string; name: string }>;
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

// Subtle per-category tint for the type pill — colorful enough to scan at a
// glance, restrained enough to fit the backoffice. Only the type pill is
// colored; everything else stays neutral.
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

export function RecentLogsFeed({
  logs,
  clients,
  initialCursor = null,
  initialHasMore = false,
}: Props) {
  const t = useTranslations("recentLogs.feed");
  const router = useRouter();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // 260531-fwc — server-paginated. Filters refetch page 1 server-side (the
  // feed is no longer fully in memory); "Cargar más" appends the next window.
  const [rows, setRows] = useState<RecentLogRow[]>(logs);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [loading, setLoading] = useState(false);

  // Re-fetch page 1 whenever a filter changes (translates the filter to the
  // server-side client / type scope so pagination + filtering compose).
  async function applyFilters(nextClient: string, nextType: string) {
    setClientFilter(nextClient);
    setTypeFilter(nextType);
    setLoading(true);
    try {
      const res = await listRecentLogsForTrainerPage(
        null,
        PAGE_SIZE,
        nextClient === "all" ? null : nextClient,
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
        clientFilter === "all" ? null : clientFilter,
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

  const filtered = rows;
  const groups = useMemo(() => groupRowsByClientDay(filtered), [filtered]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4" />
            {t("filtersTitle")}
          </CardTitle>
          <CardDescription>{t("filtersDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-4xl gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("clientLabel")}</p>
            <Select
              value={clientFilter}
              onValueChange={(v) => applyFilters(v, typeFilter)}
              disabled={loading}
            >
              <SelectTrigger className="min-w-[14rem]">
                <SelectValue placeholder={t("allClients")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allClients")}</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("typeLabel")}</p>
            <Select
              value={typeFilter}
              onValueChange={(v) => applyFilters(clientFilter, v)}
              disabled={loading}
            >
              <SelectTrigger className="min-w-[14rem]">
                <SelectValue placeholder={t("allActivity")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allActivity")}</SelectItem>
                <SelectItem value="habit">{t("habitsOption")}</SelectItem>
                <SelectItem value="workout">{t("workoutsOption")}</SelectItem>
                <SelectItem value="reschedule">
                  {t("reschedulesOption")}
                </SelectItem>
                <SelectItem value="photo">{t("photosOption")}</SelectItem>
                <SelectItem value="weight">{t("weightOption")}</SelectItem>
                <SelectItem value="signup">{t("signupOption")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("noLogs")}
            </CardContent>
          </Card>
        ) : null}
        {groups.map((group) => {
          const openProfile = () => router.push(`/gc-fitness/clients/${group.clientId}`);
          return (
            <div
              key={group.key}
              role="button"
              tabIndex={0}
              onClick={openProfile}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openProfile();
                }
              }}
              className="group cursor-pointer rounded-lg border border-l-4 border-l-primary/45 bg-card transition-colors hover:border-primary/30 hover:border-l-primary hover:bg-accent/40"
            >
              <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <ClientAvatar
                    name={group.clientName}
                    photoURL={group.clientPhotoURL}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{group.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.dayLabel} · {group.rows.length} {group.rows.length === 1 ? t("groupItem") : t("groupItems")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    title={t("openChat")}
                  >
                    <Link href={`/gc-fitness/chat?chatId=${group.clientId}`}>
                      <MessageCircle className="h-4 w-4" />
                      <span className="sr-only">{t("openChat")}</span>
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="divide-y">
                {group.rows.map((row) => {
                  const CatIcon = CATEGORY_ICON[row.category];
                  return (
                    <div key={row.id} className="flex items-start gap-3 px-3 py-2.5 sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`gap-1 px-1.5 py-0 text-[11px] font-normal [&>svg]:size-3 ${CATEGORY_TONE[row.category]}`}
                          >
                            {CatIcon ? <CatIcon /> : null}
                            {t(CATEGORY_LABEL_KEY[row.category])}
                          </Badge>
                          <span className="min-w-0 flex-[1_1_12rem] break-words text-sm font-medium leading-snug sm:truncate">
                            {row.title}
                          </span>
                          {row.forCivilDate ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-normal text-amber-700 [&>svg]:size-3 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                            >
                              <CalendarClock />
                              {t("forDay", { date: formatCivilDate(row.forCivilDate) })}
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
                        </div>
                        <p className="mt-0.5 break-words text-xs text-muted-foreground sm:truncate">
                          {formatDateTime(row.eventAt)}
                          {row.detail ? ` · ${row.detail}` : ""}
                        </p>
                      </div>
                      <div
                        className="flex shrink-0 items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.workoutLogId ? (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-2.5"
                          >
                            <Link href={`/gc-fitness/recent-logs/workouts/${row.workoutLogId}`}>
                              <Eye className="h-4 w-4" />
                              {t("viewWorkout")}
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
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

function groupRowsByClientDay(rows: RecentLogRow[]): Array<{
  key: string;
  clientId: string;
  clientName: string;
  clientPhotoURL?: string | null;
  dayLabel: string;
  rows: RecentLogRow[];
}> {
  const groups = new Map<string, {
    key: string;
    clientId: string;
    clientName: string;
    clientPhotoURL?: string | null;
    dayLabel: string;
    rows: RecentLogRow[];
  }>();
  for (const row of rows) {
    const dayKey = dayKeyFromIso(row.eventAt);
    const key = `${row.clientId}:${dayKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(key, {
      key,
      clientId: row.clientId,
      clientName: row.clientName,
      clientPhotoURL: row.clientPhotoURL,
      dayLabel: formatDayHeading(row.eventAt),
      rows: [row],
    });
  }
  return Array.from(groups.values());
}

function dayKeyFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayHeading(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = dayKeyFromIso(iso);
  if (key === dayKeyFromIso(today.toISOString())) return "Hoy";
  if (key === dayKeyFromIso(yesterday.toISOString())) return "Ayer";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

// Render a "YYYY-MM-DD" civil date as a short day label ("May 29" / "29 may").
// Construct from parts (NOT `new Date(iso)`) so the local-time constructor is
// used instead of UTC-midnight parsing — otherwise a negative-offset host
// shifts the day back by one.
function formatCivilDate(civil: string): string {
  const [y, m, d] = civil.split("-").map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return civil;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return civil;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
