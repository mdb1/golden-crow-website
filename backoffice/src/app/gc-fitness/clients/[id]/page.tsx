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
import { getTranslations } from "next-intl/server";

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

  // P22 — pending-client (mirror) branch. The roster (client-roster.ts)
  // surfaces pending clients with uid prefixed `mirror:{normalizedEmail}`
  // so the trainer can click them; this page must branch on that prefix
  // BEFORE attempting `users.doc(id).get()` (which would notFound() the
  // missing canonical user doc and 404 the trainer out of their own
  // pending client). The pending-client variant reads from
  // /user_mirror/{normalizedEmail} and renders a minimal read-only view
  // explaining the pre-load state until the client first signs in.
  const db = gcFitnessFirestore();
  if (id.startsWith("mirror:")) {
    const normalizedEmail = id.slice("mirror:".length);
    const mirrorSnap = await db
      .collection(FirestoreCollections.userMirror)
      .doc(normalizedEmail)
      .get();
    if (!mirrorSnap.exists) notFound();
    const mirror = mirrorSnap.data() as {
      email?: string;
      displayName?: string;
      coachId?: string;
      coachDisplayName?: string;
      coachPhotoURL?: string;
      pre_created?: boolean;
    };
    if (mirror.coachId !== trainer.uid) notFound();
    return (
      <PendingClientView
        normalizedEmail={normalizedEmail}
        mirror={mirror}
      />
    );
  }

  // Ownership gate at the route layer (defense in depth — Firestore rules
  // also enforce this). notFound() — NOT redirect — keeps the URL surface
  // uniform: a missing client and a wrong-trainer-client are
  // indistinguishable to the caller.
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
  const tSkeleton = await getTranslations("clients.detail.skeleton");

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
        <Suspense fallback={<WidgetSkeleton title={tSkeleton("recentWorkouts")} />}>
          <RecentWorkoutsWidget clientId={id} />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton title={tSkeleton("habitCompliance")} />}>
          <HabitComplianceWidget clientId={id} timezone={timezone} />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton title={tSkeleton("recentMessages")} />}>
          <ChatHistoryWidget clientId={id} trainerUid={trainer.uid} />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton title={tSkeleton("bodyWeight")} />}>
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

/**
 * P22 — Pending-client (mirror) view. Renders when `[id]` is a
 * `mirror:{normalizedEmail}` segment from the roster. The full per-client
 * widget tree (workouts / habits / chat / progress / notes / goals /
 * daily timeline) is hidden because the canonical /users/{uid} doc
 * doesn't exist yet — all those readers query by `clientId == uid` and
 * would error against a non-existent uid.
 *
 * Shipped: minimal readable surface so the trainer can confirm who's
 * waiting + see when they invited them.
 * Deferred: actual pre-loading of workouts/habits/chat templates to
 * `user_mirror/{email}/*` subcollections + matching pre-load UI. The
 * `convertMirrorToCanonical` Cloud Function (functions/src/auth/) would
 * need to migrate those subcollections on first sign-in; both halves
 * are queued for a follow-on phase (MIRROR-04 in REQUIREMENTS.md).
 */
function PendingClientView({
  normalizedEmail,
  mirror,
}: {
  normalizedEmail: string;
  mirror: {
    email?: string;
    displayName?: string;
    coachId?: string;
    coachDisplayName?: string;
    coachPhotoURL?: string;
    pre_created?: boolean;
  };
}) {
  const displayName = mirror.displayName ?? mirror.email ?? normalizedEmail;
  const email = mirror.email ?? normalizedEmail;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="section-eyebrow">GC Fitness · Pending</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {displayName}
        </h1>
        <p className="text-sm text-muted-foreground">{email}</p>
      </header>

      <section className="rounded-md border bg-card p-6">
        <h2 className="mb-2 text-base font-semibold">Pendiente de ingreso</h2>
        <p className="text-sm text-muted-foreground">
          Este cliente fue pre-invitado y todavía no inició sesión por
          primera vez. Cuando lo haga con la cuenta de Google asociada a{" "}
          <code className="rounded bg-muted px-1 py-0.5">{email}</code>, se
          va a crear su perfil canónico automáticamente y vas a poder
          asignarle workouts, hábitos, mandarle mensajes y ver su
          progreso desde acá.
        </p>
      </section>

      <section className="rounded-md border bg-card p-6">
        <h2 className="mb-2 text-base font-semibold">Pre-cargar contenido</h2>
        <p className="text-sm text-muted-foreground">
          Próximamente vas a poder dejarle workouts y hábitos listos antes
          de que se registre, así arranca con todo configurado el primer
          día. Por ahora, esperá a que ingrese y después asignále desde la
          vista normal del cliente. Si querés que apure el ingreso,
          recordále que se registre con Google usando{" "}
          <strong>{email}</strong>.
        </p>
      </section>
    </div>
  );
}
