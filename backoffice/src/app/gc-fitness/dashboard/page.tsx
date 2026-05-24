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

export const dynamic = "force-dynamic";

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

export default async function GCFitnessDashboardPage() {
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
  const t = await getTranslations("dashboard");
  const tCards = await getTranslations("dashboard.cards");
  const tQuick = await getTranslations("dashboard.quickLinks");
  const tCommon = await getTranslations("common");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("clients")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.clients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("templates")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.templates}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tCards("exercises")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.exercises}</p>
          </CardContent>
        </Card>
        <Card>
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

      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-4 font-heading text-base font-semibold">Secondary tools</h2>
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
    </div>
  );
}
