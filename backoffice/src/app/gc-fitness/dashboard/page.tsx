import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Gauge,
  ListChecks,
  Scale,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { listClientsForRoster } from "@/lib/gc-fitness/client-roster";
import {
  listRecentLogsForTrainer,
  type RecentLogCategory,
} from "@/lib/gc-fitness/recent-logs-actions";
import { getCoachPulse } from "@/lib/gc-fitness/coach-pulse-actions";
import { safe } from "@/lib/gc-fitness/safe-load";
import { NEEDS_ATTENTION_INACTIVITY_HOURS } from "@/lib/gc-fitness/client-attention";

import { DailyBars, TopPerformers } from "./_components/coach-pulse";

export const dynamic = "force-dynamic";
const RECENT_ACTIONS_PAGE_SIZE = 10;
const ATTENTION_PAGE_SIZE = 10;
const ATTENTION_INACTIVITY_THRESHOLD_DAYS = Math.round(
  NEEDS_ATTENTION_INACTIVITY_HOURS / 24,
);

interface DashboardPageProps {
  searchParams: Promise<{ recentPage?: string; attentionPage?: string }>;
}

async function getDashboardCounts(trainer: CurrentTrainer) {
  const db = gcFitnessFirestore();
  const [clients, templates] = await Promise.all([
    db
      .collection(FirestoreCollections.users)
      .where("coachId", "==", trainer.uid)
      .count()
      .get(),
    db
      .collection(FirestoreCollections.workoutTemplates)
      .where("trainerId", "==", trainer.uid)
      .where("deleted", "==", false)
      .count()
      .get(),
  ]);

  return {
    clients: clients.data().count,
    templates: templates.data().count,
  };
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
  const counts =
    (await safe("dashboard counts", () => getDashboardCounts(trainer))) ?? {
      clients: 0,
      templates: 0,
    };
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
        lastActionTitle: latestLog?.title ?? "No activity yet",
        lastActionDetail: latestLog?.detail ?? "No records yet.",
        category: latestLog?.category ?? null,
        rpe: latestLog?.workout?.rpe ?? null,
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
  const activeThisWeek = Math.max(0, activeClientCount - atRiskCount);
  const firstName = trainer.email.split("@")[0]?.split(".")[0] ?? "Coach";
  const attentionDays = ATTENTION_INACTIVITY_THRESHOLD_DAYS;

  return (
    <div className="gc-page flex flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Welcome back, {firstName}.
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeClientCount > 0
              ? `${activeClientCount} client${activeClientCount === 1 ? "" : "s"} on your roster · ${activeThisWeek} active in the last ${attentionDays} days.`
              : "No clients in your roster yet."}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/gc-fitness/clients">{tDashboard("addOrManageClients")}</Link>
        </Button>
      </header>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="At a glance"
          subtitle="Quick counts across your workspace."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            href="/gc-fitness/clients"
            icon={<Users className="h-4 w-4 text-primary" />}
            label="Clients"
            value={counts.clients}
            hint={`${activeClientCount} active`}
          />
          <KpiTile
            href="/gc-fitness/templates"
            icon={<Dumbbell className="h-4 w-4 text-primary" />}
            label="Workout templates"
            value={counts.templates}
            hint="reusable routines"
          />
          <KpiTile
            href="/gc-fitness/exercises?owner=mine"
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            label="Custom exercises"
            value={pulse?.customExerciseCount ?? 0}
            hint="created by you"
          />
          <KpiTile
            href="/gc-fitness/clients?filter=attention"
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            label="At risk"
            value={atRiskCount}
            hint={`no activity in ${attentionDays}+ days`}
            tone={atRiskCount > 0 ? "warning" : "default"}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Coach pulse"
          subtitle="Last 7 days across your whole roster."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-xl border-border/80 bg-card/95">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
              <div>
                <CardTitle className="text-base">Habit compliance</CardTitle>
                <p className="text-xs text-muted-foreground">
                  % of scheduled habits completed each day.
                </p>
              </div>
              <Badge variant="secondary">{pulse?.weekHabitPct ?? 0}% week</Badge>
            </CardHeader>
            <CardContent>
              <DailyBars
                data={pulse?.habitDaily ?? []}
                emptyLabel="No habits scheduled this week."
                unitLabel="habits"
              />
            </CardContent>
          </Card>
          <Card className="rounded-xl border-border/80 bg-card/95">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
              <div>
                <CardTitle className="text-base">Workout completion</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Assigned vs. logged workouts each day.
                </p>
              </div>
              <Badge variant="secondary">{pulse?.weekWorkoutPct ?? 0}% week</Badge>
            </CardHeader>
            <CardContent>
              <DailyBars
                data={pulse?.workoutDaily ?? []}
                emptyLabel="No workouts assigned this week."
                unitLabel="clients"
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-xl border-border/80 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top performers · today</CardTitle>
              <p className="text-xs text-muted-foreground">
                Habit compliance so far today. Tap a row to open the profile.
              </p>
            </CardHeader>
            <CardContent>
              <TopPerformers
                performers={pulse.topPerformersToday}
                emptyLabel="No habits done today yet."
              />
            </CardContent>
          </Card>
          <Card className="rounded-xl border-border/80 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top performers · 7 days</CardTitle>
              <p className="text-xs text-muted-foreground">
                Best habit compliance over the last 7 days.
              </p>
            </CardHeader>
            <CardContent>
              <TopPerformers
                performers={pulse.topPerformersWeek}
                emptyLabel="No habit activity to rank yet."
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Roster activity"
          subtitle="What clients did most recently and who hasn't moved."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-xl border-border/80 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Last action by client</CardTitle>
              <p className="text-xs text-muted-foreground">
                Newest first. Tap a row to open the client profile.
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {recentPageRows.length === 0 ? (
                <EmptyRow>No client activity yet.</EmptyRow>
              ) : (
                recentPageRows.map((row) => (
                  <ClientRow
                    key={row.uid}
                    href={`/gc-fitness/clients/${row.uid}`}
                    name={row.name}
                    photoURL={row.photoURL}
                    primary={row.lastActionTitle}
                    iso={row.lastActivityAt}
                    category={row.category}
                    rpe={row.rpe}
                  />
                ))
              )}
              <Pager
                page={recentPage}
                total={recentTotalPages}
                buildHref={(p) =>
                  `?recentPage=${p}&attentionPage=${attentionPage}`
                }
              />
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/80 bg-card/95">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Needs attention</CardTitle>
              <p className="text-xs text-muted-foreground">
                Hasn’t logged anything in {attentionDays}+ days. Oldest first.
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {attentionPageRows.length === 0 ? (
                <EmptyRow>Everyone is up to date — nice work.</EmptyRow>
              ) : (
                attentionPageRows.map((row) => (
                  <ClientRow
                    key={`attention-${row.uid}`}
                    href={`/gc-fitness/clients/${row.uid}`}
                    name={row.name}
                    photoURL={row.photoURL}
                    primary={row.lastActionTitle}
                    iso={row.lastActivityAt}
                    category={row.category}
                    rpe={row.rpe}
                  />
                ))
              )}
              <Pager
                page={attentionPage}
                total={attentionTotalPages}
                buildHref={(p) =>
                  `?recentPage=${recentPage}&attentionPage=${p}`
                }
              />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <p className="text-xs text-muted-foreground/80">{subtitle}</p>
    </div>
  );
}

function KpiTile({
  href,
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  href?: string;
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "warning";
}) {
  const inner = (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-xl border bg-card/95 px-4 py-3 transition-colors",
        tone === "warning"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border/80",
        href && "hover:border-primary/40 hover:bg-accent/30",
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="font-heading text-2xl font-semibold leading-none">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// Category → label + icon. NEUTRAL: a single muted `secondary` badge per the
// backoffice style — no per-category rainbow.
const CATEGORY_META: Record<
  RecentLogCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  workout: { label: "Workout", icon: Dumbbell },
  habit: { label: "Habit", icon: ListChecks },
  photo: { label: "Photo", icon: Camera },
  weight: { label: "Weight", icon: Scale },
  reschedule: { label: "Reschedule", icon: ArrowRightLeft },
  signup: { label: "Sign-up", icon: User },
};

function ClientRow({
  href,
  name,
  photoURL,
  primary,
  iso,
  category,
  rpe,
}: {
  href: string;
  name: string;
  photoURL: string | null;
  primary: string;
  iso: string | null;
  category: RecentLogCategory | null;
  rpe: number | null;
}) {
  const cat = category ? CATEGORY_META[category] : null;
  const CatIcon = cat?.icon;
  const timestampLabel = iso ? formatRelative(iso) : "No activity";
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md border border-border/70 bg-background/60 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <ClientAvatar name={name} photoURL={photoURL} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{name}</p>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {timestampLabel}
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          {cat ? (
            <Badge
              variant="secondary"
              className="gap-1 px-1.5 py-0 text-[10px] font-normal [&>svg]:size-3 [&>svg]:opacity-70"
            >
              {CatIcon ? <CatIcon /> : null}
              {cat.label}
            </Badge>
          ) : null}
          {category === "workout" && rpe !== null ? (
            <Badge
              variant="outline"
              className="gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground [&>svg]:size-3 [&>svg]:opacity-70"
            >
              <Gauge />
              RPE {rpe}
            </Badge>
          ) : null}
          <p className="truncate text-xs text-muted-foreground">{primary}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
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
    <div className="flex items-center justify-between pt-1.5">
      <p className="text-[11px] text-muted-foreground">
        Page {page} of {total}
      </p>
      <div className="flex gap-2">
        {hasPrev ? (
          <Link
            href={buildHref(page - 1)}
            className="inline-flex h-7 items-center rounded-md border border-foreground/15 bg-background px-2 text-[11px] font-medium hover:border-foreground/30 hover:bg-muted"
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            Previous
          </Link>
        ) : null}
        {hasNext ? (
          <Link
            href={buildHref(page + 1)}
            className="inline-flex h-7 items-center rounded-md border border-foreground/15 bg-background px-2 text-[11px] font-medium hover:border-foreground/30 hover:bg-muted"
          >
            Next
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function parsePage(raw?: string): number {
  if (!raw) return 1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}
