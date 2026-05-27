import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  CalendarDays,
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
  const recentPage = parsePage(params.recentPage);
  const attentionPage = parsePage(params.attentionPage);
  const recentTotalPages = Math.max(
    1,
    Math.ceil(lastActionRows.length / RECENT_ACTIONS_PAGE_SIZE),
  );
  const attentionTotalPages = Math.max(
    1,
    Math.ceil(staleRows.length / ATTENTION_PAGE_SIZE),
  );
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
        <Card className="bg-gradient-to-b from-card to-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("clients")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.clients}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-b from-card to-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("templates")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.templates}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-b from-card to-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("exercises")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.exercises}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-b from-card to-card/70">
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
            className="rounded-lg border bg-card p-5 text-card-foreground transition hover:border-primary/50 hover:bg-accent/30"
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
              <Badge variant="secondary">{tCommon("open")}</Badge>
            </div>
          </Link>
        ))}
      </section>

      <section className="rounded-lg border bg-card/90 p-5">
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
        <Card>
          <CardHeader>
            <CardTitle>Last action by client</CardTitle>
            <p className="text-xs text-muted-foreground">
              Latest action per client. Sorted newest first.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentPageRows.map((row) => (
              <div key={row.uid} className="rounded-md border bg-background/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/gc-fitness/clients/${row.uid}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {row.lastActivityAt ? formatRelative(row.lastActivityAt) : "No activity"}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium">{row.lastActionTitle}</p>
                <p className="text-xs text-muted-foreground">{row.lastActionDetail}</p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Page {recentPage} of {recentTotalPages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild disabled={recentPage <= 1}>
                  <Link href={`?recentPage=${Math.max(1, recentPage - 1)}&attentionPage=${attentionPage}`}>
                    Previous
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  disabled={recentPage >= recentTotalPages}
                >
                  <Link href={`?recentPage=${Math.min(recentTotalPages, recentPage + 1)}&attentionPage=${attentionPage}`}>
                    Next
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clients needing attention</CardTitle>
            <p className="text-xs text-muted-foreground">
              Clients with the oldest inactivity first.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {attentionPageRows.map((row) => (
              <div key={`attention-${row.uid}`} className="rounded-md border bg-background/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/gc-fitness/clients/${row.uid}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  <Badge variant="secondary">
                    {row.lastActivityAt ? formatRelative(row.lastActivityAt) : "No activity yet"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last action: {row.lastActionTitle}
                </p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Page {attentionPage} of {attentionTotalPages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild disabled={attentionPage <= 1}>
                  <Link href={`?recentPage=${recentPage}&attentionPage=${Math.max(1, attentionPage - 1)}`}>
                    Previous
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  disabled={attentionPage >= attentionTotalPages}
                >
                  <Link href={`?recentPage=${recentPage}&attentionPage=${Math.min(attentionTotalPages, attentionPage + 1)}`}>
                    Next
                  </Link>
                </Button>
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
