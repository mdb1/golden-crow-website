import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  Dumbbell,
  Library,
  ListChecks,
  MessagesSquare,
  Users,
} from "lucide-react";

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

const quickLinks = [
  {
    title: "Clients",
    description: "Attach app users and open each client workspace.",
    href: "/gc-fitness/clients",
    icon: Users,
  },
  {
    title: "Schedule",
    description: "Assign workout templates to a client calendar.",
    href: "/gc-fitness/schedule",
    icon: CalendarDays,
  },
  {
    title: "Workouts",
    description: "Create reusable routines for assignments.",
    href: "/gc-fitness/templates",
    icon: Dumbbell,
  },
  {
    title: "Library",
    description: "Browse the preloaded exercise library.",
    href: "/gc-fitness/exercises",
    icon: Library,
  },
  {
    title: "Habits",
    description: "Create habit assignments for clients.",
    href: "/gc-fitness/habits",
    icon: ListChecks,
  },
  {
    title: "Chat",
    description: "Reply to client conversations.",
    href: "/gc-fitness/chat",
    icon: MessagesSquare,
  },
];

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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow">GC Fitness</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {trainer.email}.
          </p>
        </div>
        <Button asChild>
          <Link href="/gc-fitness/clients">Add or manage clients</Link>
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.clients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Workout templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.templates}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Exercises
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.exercises}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Conversations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.chats}</p>
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {quickLinks.map((item) => (
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
                    {item.title}
                  </h2>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <Badge variant="secondary">Open</Badge>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
