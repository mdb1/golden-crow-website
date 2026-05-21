// /gc-fitness/clients/[id]/page.tsx — Per-client deep view (Server Component).
//
// Closes BO-08. Phase 11 Plan 11-07.
//
// Pattern C — page-level trainer-auth gate + per-client ownership check.
// The ownership check is BOTH at the rule layer (Firestore rules from
// P02-11) AND at the route layer (notFound() if coachId !== trainerUid)
// for defense in depth.
//
// Composition: 4 widgets wrapped in independent Suspense boundaries so
// a slow workout-log query doesn't block the chat history widget paint.
//
// Route placement note (Rule 4 inheritance from 11-03 + 11-05):
//   The plan frontmatter spelled the path as `(dashboard)/gc-fitness/clients/[id]/page.tsx`.
//   Plan 11-03 deferred the `git mv` into `(dashboard)/gc-fitness/` as a Rule 4
//   architectural deviation — the two auth chains (NextAuth in `(dashboard)/layout.tsx`
//   vs `next-firebase-auth-edge` for /gc-fitness) are incompatible. The existing
//   trainer routes (chat, habits, exercises, schedule, settings, templates,
//   clients) all live at the flat `/gc-fitness/*` path. This plan inherits
//   that decision — the roster (11-05) already routes row clicks to
//   `/gc-fitness/clients/${row.uid}`, not `/(dashboard)/gc-fitness/...`.

import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { Skeleton } from "@/components/ui/skeleton";

import { ClientHeader } from "./_components/ClientHeader";
import { RecentWorkoutsWidget } from "./_components/RecentWorkoutsWidget";
import { HabitComplianceWidget } from "./_components/HabitComplianceWidget";
import { ChatHistoryWidget } from "./_components/ChatHistoryWidget";
import { BodyWeightTrendChart } from "./_components/BodyWeightTrendChart";
import { ClientNotesCard } from "./_components/ClientNotesCard";
import { ProgressPhotosWidget } from "./_components/ProgressPhotosWidget";
import { ClientGoalsCard } from "./_components/ClientGoalsCard";
import { listClientGoals } from "@/lib/gc-fitness/client-goal-actions";
import { getClientNotes } from "@/lib/gc-fitness/client-notes-actions";
import { listProgressPhotosForClient } from "@/lib/gc-fitness/progress-photo-actions";
import { getClientDailyTimelineDay } from "@/lib/gc-fitness/client-daily-timeline-actions";
import { buildClientDailyTimelineDates } from "@/lib/gc-fitness/client-daily-timeline-utils";
import { ClientDailyTimeline } from "./_components/ClientDailyTimeline";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  // Ownership gate at the route layer (defense in depth — Firestore rules
  // also enforce this). notFound() — NOT redirect — keeps the URL surface
  // uniform: a missing client and a wrong-trainer-client are
  // indistinguishable to the caller.
  const db = gcFitnessFirestore();
  const clientSnap = await db
    .collection(FirestoreCollections.users)
    .doc(id)
    .get();
  if (!clientSnap.exists) notFound();
  const client = clientSnap.data() as {
    displayName?: string;
    email?: string;
    photoURL?: string;
    coachId?: string;
    timezone?: string;
    heightCm?: number;
    bodyWeightKg?: number;
  };
  if (client.coachId !== trainer.uid) notFound();

  const displayName = client.displayName ?? client.email ?? id;
  const timezone = client.timezone ?? "UTC";
  const todayCivil = new Date().toISOString().slice(0, 10);
  const [notes, progressPhotos, goals, initialDay] = await Promise.all([
    getClientNotes(id).catch(() => ({ notes: "", updatedAt: null, entries: [] })),
    listProgressPhotosForClient(id),
    listClientGoals(id),
    getClientDailyTimelineDay(id, todayCivil),
  ]);
  const dateWindow = buildClientDailyTimelineDates();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <ClientHeader
        clientId={id}
        displayName={displayName}
        email={client.email ?? ""}
        photoURL={client.photoURL ?? null}
        heightCm={typeof client.heightCm === "number" ? client.heightCm : null}
        bodyWeightKg={typeof client.bodyWeightKg === "number" ? client.bodyWeightKg : null}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Suspense fallback={<WidgetSkeleton title="Recent workouts" />}>
          <RecentWorkoutsWidget clientId={id} />
        </Suspense>

        <Suspense
          fallback={<WidgetSkeleton title="Habit compliance (last 7 days)" />}
        >
          <HabitComplianceWidget clientId={id} timezone={timezone} />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton title="Recent messages" />}>
          <ChatHistoryWidget clientId={id} trainerUid={trainer.uid} />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton title="Body weight (30 days)" />}>
          <BodyWeightTrendChart clientId={id} timezone={timezone} />
        </Suspense>

        <ClientNotesCard
          clientId={id}
          initialNotes={notes.notes}
          initialUpdatedAt={notes.updatedAt}
          initialEntries={notes.entries}
        />

        <ClientGoalsCard clientId={id} initialGoals={goals} />

        <ProgressPhotosWidget photos={progressPhotos} />

        <ClientDailyTimeline
          clientId={id}
          availableDates={dateWindow}
          initialDay={initialDay}
        />
      </div>
    </div>
  );
}

function WidgetSkeleton({ title }: { title: string }) {
  return (
    <section className="rounded-md border bg-card p-4">
      <h2 className="mb-3 font-medium">{title}</h2>
      <Skeleton className="h-32 w-full" />
    </section>
  );
}
