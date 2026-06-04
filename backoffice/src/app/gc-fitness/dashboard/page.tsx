import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Gauge,
  TrendingUp,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

type DashboardT = Awaited<ReturnType<typeof getTranslations>>;

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { StatCard } from "@/components/gc-fitness/stat-card";
import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { listClientsForRoster } from "@/lib/gc-fitness/client-roster";
import { listRecentLogsForTrainer } from "@/lib/gc-fitness/recent-logs-actions";
import { getCoachPulse } from "@/lib/gc-fitness/coach-pulse-actions";
import { safe } from "@/lib/gc-fitness/safe-load";
import { NEEDS_ATTENTION_INACTIVITY_HOURS } from "@/lib/gc-fitness/client-attention";

import {
  ActivityRow,
  DailyBars,
  DailyLineChart,
  TopPerformers,
} from "./_components/coach-pulse";

export const dynamic = "force-dynamic";
const RECENT_ACTIONS_PAGE_SIZE = 10;
const ATTENTION_PAGE_SIZE = 10;
const ATTENTION_INACTIVITY_THRESHOLD_DAYS = Math.round(
  NEEDS_ATTENTION_INACTIVITY_HOURS / 24,
);

interface DashboardPageProps {
  searchParams: Promise<{ recentPage?: string; attentionPage?: string }>;
}

export default async function GCFitnessDashboardPage({
  searchParams,
}: DashboardPageProps) {
  let trainer: CurrentTrainer;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  // 260529 RESILIENCE: each section loads behind `safe()` so a single failing
  // query (e.g. a composite index still BUILDING) degrades only that card
  // instead of 500ing the whole dashboard. See safe-load.ts for the why.
  const roster = (await safe("client roster", () => listClientsForRoster())) ?? [];
  const recentLogs = (await safe("recent logs", () =>
    listRecentLogsForTrainer(),
  )) ?? { logs: [], clients: [] };
  // Full zeroed fallback so a failed pulse load degrades to empty cards
  // (never null-derefs in the JSX below).
  const pulse = (await safe("coach pulse", () => getCoachPulse())) ?? {
    habitDaily: [],
    workoutDaily: [],
    weekHabitPct: 0,
    weekWorkoutPct: 0,
    topPerformersWeek: [],
    topPerformersToday: [],
    customExerciseCount: 0,
  };

  const latestLogByClient = new Map<string, (typeof recentLogs.logs)[number]>();
  for (const row of recentLogs.logs) {
    const existing = latestLogByClient.get(row.clientId);
    if (!existing || Date.parse(row.eventAt) > Date.parse(existing.eventAt)) {
      latestLogByClient.set(row.clientId, row);
    }
  }

  const tDashboard = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");

  const activeClients = roster.filter((client) => client.source === "active");
  const lastActionRows = activeClients
    .map((client) => {
      const latestLog = latestLogByClient.get(client.uid);
      return {
        uid: client.uid,
        name: client.displayName,
        photoURL: client.photoURL,
        lastActivityAt: client.lastActivityAt,
        lastActionTitle: latestLog?.title ?? tDashboard("noActivity"),
        lastActionDetail: latestLog?.detail ?? tDashboard("noRecords"),
        category: latestLog?.category ?? null,
        rpe: latestLog?.workout?.rpe ?? null,
        // % adherence over the last 7 days — drives the activity progress bar.
        ratio: client.thisWeekComplianceRatio ?? 0,
      };
    })
    .sort((a, b) => {
      const aMs = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bMs = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return bMs - aMs;
    });

  const attentionCutoffMs =
    Date.now() - NEEDS_ATTENTION_INACTIVITY_HOURS * 60 * 60 * 1000;
  const staleRows = lastActionRows
    .filter((row) => {
      if (!row.lastActivityAt) return true;
      return Date.parse(row.lastActivityAt) < attentionCutoffMs;
    })
    .sort((a, b) => {
      const aMs = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bMs = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return aMs - bMs;
    });

  const params = await searchParams;
  const requestedRecentPage = parsePage(params.recentPage);
  const requestedAttentionPage = parsePage(params.attentionPage);
  const recentTotalPages = Math.max(
    1,
    Math.ceil(lastActionRows.length / RECENT_ACTIONS_PAGE_SIZE),
  );
  const attentionTotalPages = Math.max(
    1,
    Math.ceil(staleRows.length / ATTENTION_PAGE_SIZE),
  );
  const recentPage = Math.min(recentTotalPages, requestedRecentPage);
  const attentionPage = Math.min(attentionTotalPages, requestedAttentionPage);
  const recentPageRows = lastActionRows.slice(
    (recentPage - 1) * RECENT_ACTIONS_PAGE_SIZE,
    recentPage * RECENT_ACTIONS_PAGE_SIZE,
  );
  const attentionPageRows = staleRows.slice(
    (attentionPage - 1) * ATTENTION_PAGE_SIZE,
    attentionPage * ATTENTION_PAGE_SIZE,
  );

  const activeClientCount = activeClients.length;
  const atRiskCount = staleRows.length;
  const attentionDays = ATTENTION_INACTIVITY_THRESHOLD_DAYS;
  const staleUids = new Set(staleRows.map((row) => row.uid));

  // Headline adherence KPI: prefer this-week habit %, fall back to workout %.
  const adherencePct = pulse?.weekHabitPct || pulse?.weekWorkoutPct || 0;
  // Workouts logged this week across the roster (sum of daily numerators).
  const workoutsThisWeek = (pulse?.workoutDaily ?? []).reduce(
    (sum, day) => sum + (day.numerator ?? 0),
    0,
  );

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={tDashboard("title")}
        subtitle={tDashboard("headerSubtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="rounded-full min-h-10"
            >
              <Link href="/gc-fitness/schedule">{tNav("schedule")}</Link>
            </Button>
            <Button asChild className="rounded-full min-h-10">
              <Link href="/gc-fitness/clients">
                {tDashboard("addOrManageClients")}
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPI hero row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          href="/gc-fitness/clients"
          icon={<Users />}
          value={activeClientCount}
          label={tDashboard("kpiActiveClients")}
        />
        <StatCard
          icon={<Gauge />}
          value={`${adherencePct}%`}
          label={tDashboard("kpiAdherence")}
          delta={adherencePct >= 70 ? tDashboard("kpiOnTrack") : undefined}
          trend={adherencePct >= 70 ? "up" : "neutral"}
        />
        <StatCard
          href="/gc-fitness/recent-logs"
          icon={<TrendingUp />}
          value={workoutsThisWeek}
          label={tDashboard("kpiWorkoutsThisWeek")}
        />
        <StatCard
          href="/gc-fitness/clients?filter=attention"
          icon={<AlertTriangle />}
          value={atRiskCount}
          label={tDashboard("kpiNeedsReview")}
          delta={atRiskCount > 0 ? `${atRiskCount}` : undefined}
          trend={atRiskCount > 0 ? "down" : "neutral"}
        />
      </div>

      {/* Charts: workouts (gold bars) + habits (line) */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="gc-page-title text-xl">
              {tDashboard("workoutAdherenceTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyBars
              data={pulse?.workoutDaily ?? []}
              emptyLabel={tDashboard("workoutAdherenceEmpty")}
              unitLabel={tDashboard("workoutUnit")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="gc-page-title text-xl">
              {tDashboard("habitAdherenceTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyLineChart
              data={pulse?.habitDaily ?? []}
              emptyLabel={tDashboard("habitAdherenceEmpty")}
              unitLabel={tDashboard("habitUnit")}
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent client activity */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="gc-page-title text-xl">
              {tDashboard("recentActivityTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {tDashboard("recentActivitySubtitle")}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/recent-logs">{tDashboard("viewAll")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {recentPageRows.length === 0 ? (
            <EmptyRow>{tDashboard("noRecentActivity")}</EmptyRow>
          ) : (
            recentPageRows.map((row) => (
              <ActivityRow
                key={row.uid}
                row={{
                  uid: row.uid,
                  name: row.name,
                  photoURL: row.photoURL,
                  primary: row.lastActionTitle,
                  timeLabel: row.lastActivityAt
                    ? formatRelative(row.lastActivityAt, tDashboard)
                    : tDashboard("noActivity"),
                  ratio: row.ratio,
                  stale: staleUids.has(row.uid),
                }}
              />
            ))
          )}
          <Pager
            page={recentPage}
            total={recentTotalPages}
            buildHref={(p) => `?recentPage=${p}&attentionPage=${attentionPage}`}
            t={tDashboard}
          />
        </CardContent>
      </Card>

      {/* Top performers */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="gc-page-title text-xl">
              {tDashboard("topPerformersTodayTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {tDashboard("topPerformersTodaySubtitle")}
            </p>
          </CardHeader>
          <CardContent>
            <TopPerformers
              performers={pulse.topPerformersToday}
              emptyLabel={tDashboard("topPerformersTodayEmpty")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="gc-page-title text-xl">
              {tDashboard("topPerformersWeekTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {tDashboard("topPerformersWeekSubtitle")}
            </p>
          </CardHeader>
          <CardContent>
            <TopPerformers
              performers={pulse.topPerformersWeek}
              emptyLabel={tDashboard("topPerformersWeekEmpty")}
            />
          </CardContent>
        </Card>
      </div>

      {/* Needs attention */}
      <Card>
        <CardHeader>
          <CardTitle className="gc-page-title text-xl">
            {tDashboard("needsReviewTitle")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {tDashboard("needsReviewSubtitle", { days: attentionDays })}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {attentionPageRows.length === 0 ? (
            <EmptyRow>{tDashboard("allCaughtUp")}</EmptyRow>
          ) : (
            attentionPageRows.map((row) => (
              <ActivityRow
                key={`attention-${row.uid}`}
                row={{
                  uid: row.uid,
                  name: row.name,
                  photoURL: row.photoURL,
                  primary: row.lastActionTitle,
                  timeLabel: row.lastActivityAt
                    ? formatRelative(row.lastActivityAt, tDashboard)
                    : tDashboard("noActivity"),
                  ratio: row.ratio,
                  stale: true,
                }}
              />
            ))
          )}
          <Pager
            page={attentionPage}
            total={attentionTotalPages}
            buildHref={(p) => `?recentPage=${recentPage}&attentionPage=${p}`}
            t={tDashboard}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed bg-background/40 px-3 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Pager({
  page,
  total,
  buildHref,
  t,
}: {
  page: number;
  total: number;
  buildHref: (page: number) => string;
  t: DashboardT;
}) {
  if (total <= 1) return null;
  const hasPrev = page > 1;
  const hasNext = page < total;
  return (
    <div className="flex items-center justify-between pt-3">
      <p className="text-xs text-muted-foreground">
        {t("pageOf", { page, total })}
      </p>
      <div className="flex gap-2">
        {hasPrev ? (
          <Link
            href={buildHref(page - 1)}
            className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            {t("previous")}
          </Link>
        ) : null}
        {hasNext ? (
          <Link
            href={buildHref(page + 1)}
            className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            {t("next")}
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function formatRelative(iso: string, t: DashboardT): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t("relativeUnknown");
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return t("relativeJustNow");
  if (diffSec < 3600)
    return t("relativeMinutes", { count: Math.floor(diffSec / 60) });
  if (diffSec < 86400)
    return t("relativeHours", { count: Math.floor(diffSec / 3600) });
  return t("relativeDays", { count: Math.floor(diffSec / 86400) });
}

function parsePage(raw?: string): number {
  if (!raw) return 1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}
