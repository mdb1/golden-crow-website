import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Library,
  ListChecks,
  MessagesSquare,
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
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { listClientsForRoster } from "@/lib/gc-fitness/client-roster";
import { listRecentLogsForTrainer } from "@/lib/gc-fitness/recent-logs-actions";

export const dynamic = "force-dynamic";
const RECENT_ACTIONS_PAGE_SIZE = 20;
const ATTENTION_PAGE_SIZE = 10;

interface DashboardPageProps {
  searchParams: Promise<{ recentPage?: string; attentionPage?: string }>;
}

const quickLinkSpecs = [
  { titleKey: "clientsTitle", descriptionKey: "clientsDescription", href: "/gc-fitness/clients", icon: Users },
  { titleKey: "scheduleTitle", descriptionKey: "scheduleDescription", href: "/gc-fitness/schedule", icon: CalendarDays },
  { titleKey: "chatTitle", descriptionKey: "chatDescription", href: "/gc-fitness/chat", icon: MessagesSquare },
  { titleKey: "workoutsTitle", descriptionKey: "workoutsDescription", href: "/gc-fitness/templates", icon: Dumbbell },
  { titleKey: "habitsTitle", descriptionKey: "habitsDescription", href: "/gc-fitness/habits", icon: ListChecks },
] as const;

const secondaryLinkSpecs = [
  { titleKey: "libraryTitle", descriptionKey: "libraryDescription", href: "/gc-fitness/exercises", icon: Library },
  { title: "Recent logs", description: "Review latest workout logs and training volume.", href: "/gc-fitness/recent-logs", icon: Activity },
] as const;

async function getDashboardCounts(trainer: CurrentTrainer) {
  const db = gcFitnessFirestore();
  const [clients, templates, exercises, chats] = await Promise.all([
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
    db.collection(FirestoreCollections.exercises).count().get(),
    db
      .collection(FirestoreCollections.chats)
      .where("coachId", "==", trainer.uid)
      .count()
      .get(),
  ]);

  return {
    clients: clients.data().count,
    templates: templates.data().count,
    exercises: exercises.data().count,
    chats: chats.data().count,
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

  const counts = await getDashboardCounts(trainer);
  const roster = await listClientsForRoster();
  const recentLogs = await listRecentLogsForTrainer();
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
        lastActivityAt: client.lastActivityAt,
        lastActionTitle: latestLog?.title ?? "No activity yet",
        lastActionDetail: latestLog?.detail ?? "No records yet.",
      };
    })
    .sort((a, b) => {
      const aMs = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bMs = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return bMs - aMs;
    });
  const staleRows = [...lastActionRows].sort((a, b) => {
    const aMs = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const bMs = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    return aMs - bMs;
  });
  const params = await searchParams;
  const t = await getTranslations("dashboard");
  const tCards = await getTranslations("dashboard.cards");
  const tQuick = await getTranslations("dashboard.quickLinks");
  const tCommon = await getTranslations("common");
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

  return (
    <div className="gc-page flex flex-col gap-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow">GC Fitness</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("signedInAs", { email: trainer.email })}
          </p>
        </div>
        <Button asChild>
          <Link href="/gc-fitness/clients">{t("addOrManageClients")}</Link>
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-xl border-border/80 bg-gradient-to-b from-card to-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("clients")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.clients}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/80 bg-gradient-to-b from-card to-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("templates")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.templates}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/80 bg-gradient-to-b from-card to-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("exercises")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.exercises}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/80 bg-gradient-to-b from-card to-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("chats")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.chats}</p>
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {quickLinkSpecs.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-border/80 bg-card p-5 text-card-foreground transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/30"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 text-primary" />
                  <h2 className="font-heading text-base font-semibold">
                    {tQuick(item.titleKey)}
                  </h2>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {tQuick(item.descriptionKey)}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {tCommon("open")}
              </Badge>
            </div>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border bg-card/90 p-5">
        <h2 className="mb-1 font-heading text-base font-semibold">Support tools</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Library and activity views that help with coaching quality control.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {secondaryLinkSpecs.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border bg-background p-4 text-card-foreground transition hover:border-primary/50 hover:bg-accent/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <item.icon className="h-4 w-4 text-primary" />
                    <h3 className="font-heading text-sm font-semibold">
                      {"titleKey" in item ? tQuick(item.titleKey) : item.title}
                    </h3>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {"descriptionKey" in item
                      ? tQuick(item.descriptionKey)
                      : item.description}
                  </p>
                </div>
                <Badge variant="secondary">{tCommon("open")}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-xl border-border/80 bg-card/95">
          <CardHeader className="pb-3">
            <CardTitle>Last action by client</CardTitle>
            <p className="text-xs text-muted-foreground">
              Latest action per client. Sorted newest first.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentPageRows.length === 0 ? (
              <div className="rounded-md border border-dashed bg-background/50 p-8 text-center text-sm text-muted-foreground">
                No client activity yet.
              </div>
            ) : null}
            {recentPageRows.map((row) => (
              <div key={row.uid} className="rounded-md border bg-background/70 px-3 py-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <Link href={`/gc-fitness/clients/${row.uid}`} className="truncate font-medium hover:underline">
                      {row.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{row.lastActionTitle}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {row.lastActivityAt ? formatRelative(row.lastActivityAt) : "No activity"}
                  </Badge>
                </div>
                {row.lastActionDetail !== "No records yet." ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{row.lastActionDetail}</p>
                ) : null}
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Page {recentPage} of {recentTotalPages}
              </p>
              <div className="flex gap-2">
                <Link
                  aria-disabled={recentPage <= 1}
                  className={cn(
                    "inline-flex h-7 items-center rounded-[min(var(--radius-md),12px)] border border-foreground/20 bg-background px-2.5 text-[0.8rem] font-medium transition-colors",
                    recentPage <= 1
                      ? "pointer-events-none opacity-50"
                      : "hover:border-foreground/30 hover:bg-muted",
                  )}
                  href={`?recentPage=${Math.max(1, recentPage - 1)}&attentionPage=${attentionPage}`}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  Previous
                </Link>
                <Link
                  aria-disabled={recentPage >= recentTotalPages}
                  className={cn(
                    "inline-flex h-7 items-center rounded-[min(var(--radius-md),12px)] border border-foreground/20 bg-background px-2.5 text-[0.8rem] font-medium transition-colors",
                    recentPage >= recentTotalPages
                      ? "pointer-events-none opacity-50"
                      : "hover:border-foreground/30 hover:bg-muted",
                  )}
                  href={`?recentPage=${Math.min(recentTotalPages, recentPage + 1)}&attentionPage=${attentionPage}`}
                >
                  Next
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/80 bg-card/95">
          <CardHeader className="pb-3">
            <CardTitle>Clients needing attention</CardTitle>
            <p className="text-xs text-muted-foreground">
              Clients with the oldest inactivity first.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {attentionPageRows.length === 0 ? (
              <div className="rounded-md border border-dashed bg-background/50 p-8 text-center text-sm text-muted-foreground">
                No clients to review yet.
              </div>
            ) : null}
            {attentionPageRows.map((row) => (
              <div key={`attention-${row.uid}`} className="rounded-md border bg-background/70 px-3 py-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <Link href={`/gc-fitness/clients/${row.uid}`} className="truncate font-medium hover:underline">
                    {row.name}
                  </Link>
                  <Badge variant="secondary" className="shrink-0">
                    {row.lastActivityAt ? formatRelative(row.lastActivityAt) : "No activity yet"}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  Last action: {row.lastActionTitle}
                </p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Page {attentionPage} of {attentionTotalPages}
              </p>
              <div className="flex gap-2">
                <Link
                  aria-disabled={attentionPage <= 1}
                  className={cn(
                    "inline-flex h-7 items-center rounded-[min(var(--radius-md),12px)] border border-foreground/20 bg-background px-2.5 text-[0.8rem] font-medium transition-colors",
                    attentionPage <= 1
                      ? "pointer-events-none opacity-50"
                      : "hover:border-foreground/30 hover:bg-muted",
                  )}
                  href={`?recentPage=${recentPage}&attentionPage=${Math.max(1, attentionPage - 1)}`}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  Previous
                </Link>
                <Link
                  aria-disabled={attentionPage >= attentionTotalPages}
                  className={cn(
                    "inline-flex h-7 items-center rounded-[min(var(--radius-md),12px)] border border-foreground/20 bg-background px-2.5 text-[0.8rem] font-medium transition-colors",
                    attentionPage >= attentionTotalPages
                      ? "pointer-events-none opacity-50"
                      : "hover:border-foreground/30 hover:bg-muted",
                  )}
                  href={`?recentPage=${recentPage}&attentionPage=${Math.min(attentionTotalPages, attentionPage + 1)}`}
                >
                  Next
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
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
