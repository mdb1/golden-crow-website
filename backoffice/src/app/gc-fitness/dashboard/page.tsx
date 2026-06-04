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

  const activeClients = roster.filter((client) => client.source === "active");
  const lastActionRows = activeClients
    .map((client) => {
      const latestLog = latestLogByClient.get(client.uid);
      return {
        uid: client.uid,
        name: client.displayName,
        photoURL: client.photoURL,
        lastActivityAt: client.lastActivityAt,
        lastActionTitle: latestLog?.title ?? "Sin actividad",
        lastActionDetail: latestLog?.detail ?? "Sin registros.",
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
  const tDashboard = await getTranslations("dashboard");
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
        title="Dashboard"
        subtitle="Vista general de tus clientes y su progreso"
        actions={
          <Button asChild className="rounded-full">
            <Link href="/gc-fitness/clients">
              {tDashboard("addOrManageClients")}
            </Link>
          </Button>
        }
      />

      {/* KPI hero row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          href="/gc-fitness/clients"
          icon={<Users />}
          value={activeClientCount}
          label="Clientes activos"
        />
        <StatCard
          icon={<Gauge />}
          value={`${adherencePct}%`}
          label="Adherencia promedio"
          delta={adherencePct >= 70 ? "On track" : undefined}
          trend={adherencePct >= 70 ? "up" : "neutral"}
        />
        <StatCard
          href="/gc-fitness/recent-logs"
          icon={<TrendingUp />}
          value={workoutsThisWeek}
          label="Workouts esta semana"
        />
        <StatCard
          href="/gc-fitness/clients?filter=attention"
          icon={<AlertTriangle />}
          value={atRiskCount}
          label="Pendientes de revisar"
          delta={atRiskCount > 0 ? `${atRiskCount}` : undefined}
          trend={atRiskCount > 0 ? "down" : "neutral"}
        />
      </div>

      {/* Charts: workouts (gold bars) + habits (line) */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="gc-page-title text-xl">
              Adherencia a Workouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyBars
              data={pulse?.workoutDaily ?? []}
              emptyLabel="No hay workouts asignados esta semana."
              unitLabel="clientes"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="gc-page-title text-xl">
              Adherencia a Hábitos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyLineChart
              data={pulse?.habitDaily ?? []}
              emptyLabel="No hay hábitos programados esta semana."
              unitLabel="hábitos"
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent client activity */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="gc-page-title text-xl">
              Actividad Reciente de Clientes
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Última acción de cada cliente
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/recent-logs">Ver Todos</Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {recentPageRows.length === 0 ? (
            <EmptyRow>Todavía no hay actividad de clientes.</EmptyRow>
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
                    ? formatRelative(row.lastActivityAt)
                    : "Sin actividad",
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
          />
        </CardContent>
      </Card>

      {/* Top performers */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="gc-page-title text-xl">
              Top performers · hoy
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Cumplimiento de hábitos en lo que va del día.
            </p>
          </CardHeader>
          <CardContent>
            <TopPerformers
              performers={pulse.topPerformersToday}
              emptyLabel="Todavía nadie completó hábitos hoy."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="gc-page-title text-xl">
              Top performers · 7 días
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Mejor cumplimiento de hábitos en los últimos 7 días.
            </p>
          </CardHeader>
          <CardContent>
            <TopPerformers
              performers={pulse.topPerformersWeek}
              emptyLabel="Sin actividad de hábitos para rankear todavía."
            />
          </CardContent>
        </Card>
      </div>

      {/* Needs attention */}
      <Card>
        <CardHeader>
          <CardTitle className="gc-page-title text-xl">
            Pendientes de revisar
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sin registros en {attentionDays}+ días. Más antiguos primero.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {attentionPageRows.length === 0 ? (
            <EmptyRow>Todos al día — buen trabajo.</EmptyRow>
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
                    ? formatRelative(row.lastActivityAt)
                    : "Sin actividad",
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
}: {
  page: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  if (total <= 1) return null;
  const hasPrev = page > 1;
  const hasNext = page < total;
  return (
    <div className="flex items-center justify-between pt-3">
      <p className="text-xs text-muted-foreground">
        Página {page} de {total}
      </p>
      <div className="flex gap-2">
        {hasPrev ? (
          <Link
            href={buildHref(page - 1)}
            className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            Anterior
          </Link>
        ) : null}
        {hasNext ? (
          <Link
            href={buildHref(page + 1)}
            className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            Siguiente
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Desconocido";
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return "Hace instantes";
  if (diffSec < 3600) return `Hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `Hace ${Math.floor(diffSec / 3600)} h`;
  return `Hace ${Math.floor(diffSec / 86400)} d`;
}

function parsePage(raw?: string): number {
  if (!raw) return 1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}
