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
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { Skeleton } from "@/components/ui/skeleton";

import { ClientHeader } from "./_components/ClientHeader";
import { WorkoutTrendsWidget } from "./_components/WorkoutTrendsWidget";
import { HabitTrendsWidget } from "./_components/HabitTrendsWidget";
import { ChatHistoryWidget } from "./_components/ChatHistoryWidget";
import { BodyWeightTrendChart } from "./_components/BodyWeightTrendChart";
import { ClientNotesCard } from "./_components/ClientNotesCard";
import { ProgressPhotosWidget } from "./_components/ProgressPhotosWidget";
import { ClientRecentLogsWidget } from "./_components/ClientRecentLogsWidget";
import ClientRequestActionsCard from "./_components/ClientRequestActionsCard";
import { listClientGoals } from "@/lib/gc-fitness/client-goal-actions";
import { getClientNotes } from "@/lib/gc-fitness/client-notes-actions";
import { listProgressPhotosForClient } from "@/lib/gc-fitness/progress-photo-actions";
import {
  bodyWeightFulfillment,
  progressPhotosFulfillment,
} from "@/lib/gc-fitness/client-request-fulfillment";
import { PendingClientPreload } from "./_components/PendingClientPreload";
import { ClientSummaryCard } from "./_components/ClientSummaryCard";

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
    progressPhotosRequestedAt?: unknown;
    bodyWeightRequestedAt?: unknown;
    preferences?: {
      workoutPrefillSource?: string;
    };
  };
  if (client.coachId !== trainer.uid) notFound();

  const displayName = client.displayName ?? client.email ?? id;
  const timezone = client.timezone ?? "UTC";
  // Contract: every client activity surface below reads this explicit IANA
  // timezone. Leaf components must not infer UTC or the host timezone.
  const todayCivil = civilDateToday(timezone);
  const [notes, progressPhotos, goals, bodyWeightFulfilled] = await Promise.all([
    getClientNotes(id).catch(() => ({ notes: "", updatedAt: null, entries: [] })),
    listProgressPhotosForClient(id),
    listClientGoals(id),
    // C1 — one bounded read-only query for body-weight fulfillment. Progress-
    // photo fulfillment reuses the `progressPhotos` slice loaded above (no
    // extra read). Both compare upload time against the request timestamp.
    bodyWeightFulfillment(id, client.bodyWeightRequestedAt ?? null).catch(
      () => ({ fulfilled: false, fulfilledAt: null }),
    ),
  ]);
  const progressPhotosFulfilled = progressPhotosFulfillment(
    client.progressPhotosRequestedAt ?? null,
    progressPhotos,
  );
  const tSkeleton = await getTranslations("clients.detail.skeleton");
  const tPreferences = await getTranslations("clients.detail.preferences");
  const workoutPrefillSource =
    client.preferences?.workoutPrefillSource === "template"
      ? "template"
      : "previousWorkout";

  return (
    <div className="gc-page flex w-full flex-col gap-6">
      <ClientHeader
        clientId={id}
        displayName={displayName}
        email={client.email ?? ""}
        photoURL={client.photoURL ?? null}
        heightCm={typeof client.heightCm === "number" ? client.heightCm : null}
        bodyWeightKg={typeof client.bodyWeightKg === "number" ? client.bodyWeightKg : null}
      />
      <ClientWorkoutPreferencesCard
        title={tPreferences("title")}
        label={tPreferences("workoutPrefillLabel")}
        value={
          workoutPrefillSource === "template"
            ? tPreferences("workoutPrefillTemplate")
            : tPreferences("workoutPrefillPrevious")
        }
        description={
          workoutPrefillSource === "template"
            ? tPreferences("workoutPrefillTemplateDescription")
            : tPreferences("workoutPrefillPreviousDescription")
        }
      />

      <ClientSummaryCard
        clientId={id}
        clientName={displayName}
        timezone={timezone}
        goals={goals}
      />

      <ClientRequestActionsCard
        clientId={id}
        clientName={displayName}
        timezone={timezone}
        progressPhotosRequestedAt={client.progressPhotosRequestedAt ?? null}
        bodyWeightRequestedAt={client.bodyWeightRequestedAt ?? null}
        progressPhotosFulfilled={progressPhotosFulfilled}
        bodyWeightFulfilled={bodyWeightFulfilled}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Suspense fallback={<WidgetSkeleton title={tSkeleton("workoutTrends")} />}>
          <WorkoutTrendsWidget clientId={id} timezone={timezone} />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton title={tSkeleton("habitTrends")} />}>
          <HabitTrendsWidget clientId={id} timezone={timezone} />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton title={tSkeleton("recentMessages")} />}>
          <ChatHistoryWidget clientId={id} trainerUid={trainer.uid} timezone={timezone} />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton title={tSkeleton("bodyWeight")} />}>
          <BodyWeightTrendChart clientId={id} timezone={timezone} />
        </Suspense>

        <ClientNotesCard
          clientId={id}
          timezone={timezone}
          todayCivil={todayCivil}
          initialNotes={notes.notes}
          initialUpdatedAt={notes.updatedAt}
          initialEntries={notes.entries}
        />

        <ProgressPhotosWidget photos={progressPhotos} clientId={id} timezone={timezone} />

        <Suspense fallback={<WidgetSkeleton title={tSkeleton("recentLogs")} />}>
          <ClientRecentLogsWidget clientId={id} timezone={timezone} />
        </Suspense>
      </div>
    </div>
  );
}

function ClientWorkoutPreferencesCard({
  title,
  label,
  value,
  description,
}: {
  title: string;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-eyebrow">{title}</p>
          <h2 className="text-lg font-semibold">{label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="w-fit rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium">
          {value}
        </span>
      </div>
    </section>
  );
}

function WidgetSkeleton({ title }: { title: string }) {
  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
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
 * Shipped: minimal readable surface + PendingClientPreload so the trainer can
 * pre-load workouts/habits before first sign-in. Mirror migration is handled
 * by `convertMirrorToCanonical` (functions/src/auth/) via pendingEmail swap.
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
    <div className="gc-page flex w-full flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="section-eyebrow">GC Fitness · Pending</p>
        <h1 className="gc-page-title text-[1.7rem] leading-tight sm:text-3xl">
          {displayName}
        </h1>
        <p className="text-sm text-muted-foreground">{email}</p>
      </header>

      <section className="rounded-[1.25rem] border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">Pendiente de ingreso</h2>
        <p className="text-sm text-muted-foreground">
          Este cliente fue pre-invitado y todavía no inició sesión por
          primera vez. Cuando lo haga con la cuenta de Google asociada a{" "}
          <code className="rounded bg-muted px-1 py-0.5">{email}</code>, se
          va a crear su perfil canónico automáticamente y vas a poder
          asignarle workouts, hábitos, mandarle mensajes y ver su
          progreso desde acá.
        </p>
      </section>

      {/* P22-04 — pre-load workouts + habits for this pending client.
          Server actions inside PendingClientPreload write to
          workout_assignments + habits with pendingEmail set. On first
          sign-in, convertMirrorToCanonical migrates clientId atomically. */}
      <PendingClientPreload normalizedEmail={normalizedEmail} />

      <p className="text-xs text-muted-foreground">
        Cuando <strong>{email}</strong> inicie sesión con Google por primera
        vez, su perfil se va a crear automáticamente y todo el contenido
        pre-cargado va a aparecer en su cliente activo.
      </p>
    </div>
  );
}
