// /gc-fitness/library/page.tsx — consolidated "Biblioteca" (redesign 2026-06).
//
// Folds the former standalone Workouts / Exercises / Habits list views into one
// tabbed surface, matching the reference design. The deep routes (`/new`,
// `/[id]/edit`, detail) are untouched; only the three LIST views move here. The
// old list routes redirect to the matching tab.
//
// Each tab reuses its existing client + QueryProvider in `embedded` mode (the
// shared PageHeader supplies the title), so no data/logic is duplicated.

import { redirect } from "next/navigation";
import { Dumbbell, ListChecks, Activity } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { PillTabs } from "@/components/gc-fitness/pill-tabs";

import { TemplatesQueryProvider } from "../templates/providers";
import { TemplatesLibraryClient } from "../templates/client";
import { ExerciseQueryProvider } from "../exercises/providers";
import { ExerciseLibraryClient } from "../exercises/client";
import { HabitsQueryProvider } from "../habits/providers";
import { HabitsLibraryClient } from "../habits/client";

export const dynamic = "force-dynamic";

type LibraryTab = "workouts" | "exercises" | "habits";

function resolveTab(raw: string | undefined): LibraryTab {
  if (raw === "exercises" || raw === "habits") return raw;
  return "workouts";
}

interface LibraryPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  let trainerUid: string;
  try {
    const trainer = await getCurrentTrainer();
    trainerUid = trainer.uid;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const { tab: rawTab } = await searchParams;
  const tab = resolveTab(rawTab);
  const tNav = await getTranslations("nav");

  return (
    <div className="gc-page flex min-w-0 flex-col gap-6">
      <PageHeader
        title={tNav("library")}
        subtitle={tNav("contentSectionDescription")}
      />

      <PillTabs
        activeKey={tab}
        items={[
          {
            key: "workouts",
            label: tNav("workouts"),
            icon: <Dumbbell />,
            href: "/gc-fitness/library?tab=workouts",
          },
          {
            key: "exercises",
            label: tNav("exercises"),
            icon: <Activity />,
            href: "/gc-fitness/library?tab=exercises",
          },
          {
            key: "habits",
            label: tNav("habits"),
            icon: <ListChecks />,
            href: "/gc-fitness/library?tab=habits",
          },
        ]}
      />

      {tab === "workouts" ? (
        <TemplatesQueryProvider>
          <TemplatesLibraryClient trainerUid={trainerUid} embedded />
        </TemplatesQueryProvider>
      ) : null}

      {tab === "exercises" ? (
        <ExerciseQueryProvider>
          <ExerciseLibraryClient trainerUid={trainerUid} embedded />
        </ExerciseQueryProvider>
      ) : null}

      {tab === "habits" ? <HabitsTab trainerUid={trainerUid} /> : null}
    </div>
  );
}

async function HabitsTab({ trainerUid }: { trainerUid: string }) {
  const clients = await listClients();
  const clientRoster = clients.map((c) => ({
    uid: c.uid,
    displayName: c.displayName,
    email: c.email,
    photoURL: c.photoURL,
    pendingProvisioning: c.pendingProvisioning,
  }));
  return (
    <HabitsQueryProvider>
      <HabitsLibraryClient
        clientRoster={clientRoster}
        trainerUid={trainerUid}
        embedded
      />
    </HabitsQueryProvider>
  );
}
