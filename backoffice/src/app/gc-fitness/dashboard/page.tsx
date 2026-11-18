import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Gauge,
  ScrollText,
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
import { lastActionMessageKey } from "@/lib/gc-fitness/last-activity-kind";
import { getCoachPulse } from "@/lib/gc-fitness/coach-pulse-actions";
import { listClientsWithNothingAssignedSoon } from "@/lib/gc-fitness/coach-attention-actions";
import { listPendingChecklistItems } from "@/lib/gc-fitness/coach-checklist-actions";
import { safe } from "@/lib/gc-fitness/safe-load";

import {
  DailyBars,
  DailyLineChart,
  TopPerformers,
} from "./_components/coach-pulse";
import { AttentionTodayCard } from "./_components/attention-today-card";
import { PaymentsDueCard } from "./_components/payments-due-card";
import { attentionQueue, paymentsDue } from "./_components/today-model";
import { ChecklistPending } from "./_components/checklist-pending";
import { UnassignedClientsCard } from "./_components/unassigned-clients-card";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "Corvo - <dashboard>" (issue #170).
export const generateMetadata = () => sectionMetadata("dashboard");

export const dynamic = "force-dynamic";
const ATTENTION_PAGE_SIZE = 10;

interface DashboardPageProps {
  searchParams: Promise<{ attentionPage?: string }>;
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
  //
  // #490: the four loaders are independent — run them in PARALLEL. They used
  // to be awaited one after another, so the page waited for the SUM of the
  // four round-trips instead of the slowest one. Each loader re-checks auth;
  // `getCurrentTrainer` is per-request cached (#491), so that costs nothing.
  const [rosterResult, pulseResult, checklistResult, unassignedResult, tDashboard, tNav] =
    await Promise.all([
      safe("client roster", () => listClientsForRoster()),
      safe("coach pulse", () => getCoachPulse()),
      // Overdue + due-today checklist items for the dashboard widget.
      safe("coach checklist", () => listPendingChecklistItems()),
      // 260612-e9t (#245): active clients with nothing assigned in the next 4 days.
      safe("unassigned clients", () => listClientsWithNothingAssignedSoon()),
      getTranslations("dashboard"),
      getTranslations("nav"),
    ]);
  const roster = rosterResult ?? [];
  // Full zeroed fallback so a failed pulse load degrades to empty cards
  // (never null-derefs in the JSX below).
  const pulse = pulseResult ?? {
    habitDaily: [],
    workoutDaily: [],
    weekHabitPct: 0,
    weekWorkoutPct: 0,
    topPerformersWeek: [],
    topPerformersToday: [],
    customExerciseCount: 0,
  };
  const pendingChecklist = checklistResult ?? [];
  const unassignedSoon = unassignedResult ?? { rows: [], truncated: false, scanned: 0 };

  // Literal keys (the i18n-literal-keys gate checks them against the catalog).
  const lastActionLabels = {
    lastActionWorkout: tDashboard("lastActionWorkout"),
    lastActionHabit: tDashboard("lastActionHabit"),
    lastActionPhoto: tDashboard("lastActionPhoto"),
    noActivity: tDashboard("noActivity"),
  } as const;
  const activeClients = roster.filter((client) => client.source === "active");

  // #535 — «Necesitan tu atención»: the SAME predicate as the KPI tile and the
  // roster filter (it used to be an inactivity-only list at the bottom of the
  // page, so the tile said 4 and the list showed 1), with the reasons named.
  const queue = attentionQueue(roster);
  const params = await searchParams;
  const requestedAttentionPage = parsePage(params.attentionPage);
  const attentionTotalPages = Math.max(
    1,
    Math.ceil(queue.length / ATTENTION_PAGE_SIZE),
  );
  const attentionPage = Math.min(attentionTotalPages, requestedAttentionPage);
  const attentionPageRows = queue
    .slice((attentionPage - 1) * ATTENTION_PAGE_SIZE, attentionPage * ATTENTION_PAGE_SIZE)
    .map((row) => ({
      row,
      // #488: the client's REAL last action (workout / habit / photo) + when.
      lastActivityLabel: row.lastActivityAt
        ? `${lastActionLabels[lastActionMessageKey(row.lastActivityKind)]} · ${formatRelative(row.lastActivityAt, tDashboard)}`
        : lastActionLabels.noActivity,
    }));
  const due = paymentsDue(roster);
  const anyPlan = activeClients.some((client) => client.billing);

  const activeClientCount = activeClients.length;
  // #513 — the tile links to `/clients?filter=attention`, so it counts EXACTLY
  // what that filter shows: every roster row whose `needsAttention` fired for
  // ANY of the six reasons of client-attention.ts (#499) — not only inactivity
  // (that narrower list is the "Needs review" panel below, labelled as such).
  const atRiskCount = roster.filter((client) => client.needsAttention).length;

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
            <Button asChild className="rounded-full min-h-10">
              <Link href="/gc-fitness/clients">
                {tDashboard("addOrManageClients")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full min-h-10">
              <Link href="/gc-fitness/recent-logs">
                <ScrollText className="size-4" />
                {tNav("recentLogs")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full min-h-10">
              <Link href="/gc-fitness/my-activity">
                <Activity className="size-4" />
                {tNav("myActivity")}
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
          label={tDashboard("kpiNeedsAttention")}
        />
      </div>

      {/* #535 — what to do today, first: who needs you (and why) + who owes you. */}
      <div className={anyPlan ? "grid gap-4 xl:grid-cols-[3fr_2fr]" : "grid gap-4"}>
        <AttentionTodayCard
          rows={attentionPageRows}
          total={queue.length}
          footer={
            <Pager
              page={attentionPage}
              total={attentionTotalPages}
              buildHref={(p) => `?attentionPage=${p}`}
              t={tDashboard}
            />
          }
        />
        <PaymentsDueCard due={due} anyPlan={anyPlan} />
      </div>

      {/* Pending checklist (overdue + due today) */}
      <ChecklistPending items={pendingChecklist} />

      {/* 260612-e9t (#245): clients with nothing assigned in the next 4 days */}
      <UnassignedClientsCard
        rows={unassignedSoon.rows}
        truncated={unassignedSoon.truncated}
        scanned={unassignedSoon.scanned}
      />

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
            className="inline-flex min-h-10 items-center rounded-full border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            {t("previous")}
          </Link>
        ) : null}
        {hasNext ? (
          <Link
            href={buildHref(page + 1)}
            className="inline-flex min-h-10 items-center rounded-full border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
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
