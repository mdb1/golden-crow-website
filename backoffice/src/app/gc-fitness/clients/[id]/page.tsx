// /gc-fitness/clients/[id]/page.tsx — Per-client deep view (Server Component).
//
// Closes BO-08. Phase 11 Plan 11-07.
//
// Pattern C — page-level trainer-auth gate + per-client ownership check.
// The ownership check is BOTH at the rule layer (Firestore rules from
// P02-11) AND at the route layer (notFound() if coachId !== trainerUid)
// for defense in depth.
//
// LAYOUT (2026-08 pass). The page had grown by accretion: every feature landed
// as one more card in a two-column grid, so a coach scrolled past identity,
// requests and notes — each edited a handful of times per client — before
// reaching anything they read daily. The order is now frequency of use:
//
//   header (⚙ ajustes · 📝 notas · chat)   ← the once-per-client things, in dialogs
//   mini calendario                        ← what is happening this week
//   resumen                                ← what is assigned
//   gráficos                               ← all seven, with a visibility switchboard
//   fotos de progreso                      ← full width
//   [ chat | actividad reciente ]
//   desvincular
//
// The `/clients/[id]/progress` route is gone: its two charts are slots in the
// charts section, so comparing tonnage against weekly sets no longer means
// changing page.
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

import { listClientAppDevices } from "@/lib/gc-fitness/client-app-devices";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { evaluateProgressPhotoCheckIn } from "@/lib/gc-fitness/progress-photo-checkin-policy";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { coachVisibleClientName } from "@/lib/gc-fitness/client-name";
import {
  CLIENT_CHARTS_COOKIE,
  isChartVisible,
  parseHiddenCharts,
  type ClientChartId,
} from "@/lib/gc-fitness/client-chart-preferences";
import { Skeleton } from "@/components/ui/skeleton";

import { ClientHeader } from "./_components/ClientHeader";
import { ClientSettingsDialog } from "./_components/ClientSettingsDialog";
import { ClientNotesDialog } from "./_components/ClientNotesDialog";
import { ClientRequestRow } from "./_components/ClientRequestRow";
import {
  ClientChartsSection,
  type ClientChartSlot,
} from "./_components/ClientChartsSection";
import { WorkoutTrendsWidget } from "./_components/WorkoutTrendsWidget";
import { HabitTrendsWidget } from "./_components/HabitTrendsWidget";
import { ChatHistoryWidget } from "./_components/ChatHistoryWidget";
import { BodyWeightTrendChart } from "./_components/BodyWeightTrendChart";
import { DailyStepsWidget } from "./_components/DailyStepsWidget";
import { ProgressPhotosWidget } from "./_components/ProgressPhotosWidget";
import { PersonalRecordsWidget } from "./_components/PersonalRecordsWidget";
import { ClientRecentLogsWidget } from "./_components/ClientRecentLogsWidget";
import { ExerciseProgressClient } from "./_components/ExerciseProgressClient";
import { MuscleGroupProgressClient } from "./_components/MuscleGroupProgressClient";
import { addCivilDays } from "./_components/trend-range";
import { listClientGoals } from "@/lib/gc-fitness/client-goal-actions";
import { getClientNotes } from "@/lib/gc-fitness/client-notes-actions";
import { getClientExerciseProgress } from "@/lib/gc-fitness/exercise-progress-actions";
import { listProgressPhotosForClient } from "@/lib/gc-fitness/progress-photo-actions";
import { getClientCalendarPeek } from "@/lib/gc-fitness/client-calendar-peek-actions";
import {
  bodyWeightFulfillment,
  progressPhotosFulfillment,
} from "@/lib/gc-fitness/client-request-fulfillment";
import { PendingClientPreload } from "./_components/PendingClientPreload";
import { RemovePendingClientButton } from "./_components/RemovePendingClientButton";
import { UnlinkClientButton } from "./_components/UnlinkClientButton";
import { ClientSummaryCard } from "./_components/ClientSummaryCard";
import { NutritionProfileWidget } from "./_components/NutritionProfileWidget";
import { ClientCalendarPeek } from "./_components/ClientCalendarPeek";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <clients>" (issue #170).
export const generateMetadata = () => sectionMetadata("clients");

export const dynamic = "force-dynamic";

const MAX_LOOKBACK_DAYS = 365;

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
    coachNickname?: string;
    birthDate?: string;
    coachId?: string;
    timezone?: string;
    heightCm?: number;
    bodyWeightKg?: number;
    progressPhotosRequestedAt?: unknown;
    bodyWeightRequestedAt?: unknown;
  };
  if (client.coachId !== trainer.uid) notFound();

  const displayName = coachVisibleClientName({
    uid: id,
    displayName: client.displayName ?? client.email ?? id,
    email: client.email ?? "",
    coachNickname: client.coachNickname ?? null,
  });
  // #747 — the client's own zone when we know it, the COACH's otherwise. The
  // old `?? "UTC"` was not a neutral default: a client who has not opened the
  // app yet (or signed up before the field existed) has no `timezone`, so every
  // instant on this page rendered in UTC — "09:04 PM" for an action taken at
  // 18:04 in Buenos Aires. Nobody reading this screen lives in UTC.
  const timezone = client.timezone ?? (await getTrainerTimezone());
  // Contract: every client activity surface below reads this explicit IANA
  // timezone. Leaf components must not infer UTC or the host timezone.
  const todayCivil = civilDateToday(timezone);

  // Which charts this coach wants. Read BEFORE the queries below, because a
  // hidden chart must not cost a Firestore read — that is the whole reason the
  // preference lives in a cookie instead of localStorage.
  const hiddenCharts = parseHiddenCharts(
    (await cookies()).get(CLIENT_CHARTS_COOKIE)?.value,
  );
  const showsChart = (chartId: ClientChartId) =>
    isChartVisible(chartId, hiddenCharts);
  // ONE aggregation feeds both the muscle-group and the exercise-evolution
  // panels, so it runs when EITHER is on — and not at all when neither is.
  const needsExerciseAggregation =
    showsChart("muscleGroups") || showsChart("exerciseProgress");

  const [notes, progressPhotos, goals, bodyWeightFulfilled, calendarPeek, appDevices, exerciseProgress] =
    await Promise.all([
    getClientNotes(id).catch(() => ({ notes: "", updatedAt: null, entries: [] })),
    listProgressPhotosForClient(id),
    listClientGoals(id),
    // C1 — one bounded read-only query for body-weight fulfillment. Progress-
    // photo fulfillment reuses the `progressPhotos` slice loaded above (no
    // extra read). Both compare upload time against the request timestamp.
    bodyWeightFulfillment(id, client.bodyWeightRequestedAt ?? null).catch(
      () => ({ fulfilled: false, fulfilledAt: null }),
    ),
    getClientCalendarPeek({ clientId: id, anchorCivil: todayCivil }),
    // #785 — which app build(s) the client is running, for the header badges.
    // Fail-soft: a support detail must never 500 the profile.
    listClientAppDevices(gcFitnessFirestore(), id).catch(() => []),
    needsExerciseAggregation
      ? getClientExerciseProgress(id, timezone).catch(() => null)
      : Promise.resolve(null),
  ]);
  // Header "Peso" = the client's most recent weigh-in BY MEASUREMENT DATE.
  // On a transient read error fall back to NULL (em dash), never to the
  // denormalized `users.bodyWeightKg` — that field tracks WRITE order and is
  // exactly the stale value this fix removes (it showed an Oct-dated 63.5kg
  // entry logged after a newer one).
  const latestBodyWeightKg = await getLatestBodyWeightKg(id).catch(() => null);
  const progressPhotosFulfilled = progressPhotosFulfillment(
    client.progressPhotosRequestedAt ?? null,
    progressPhotos,
  );
  // Issue #160 — derive the client's next-eligible check-in date from the photos
  // already loaded above (no extra Firestore read). Once the client's baseline is
  // complete (ANY angle group ≥2 photos), the coach's "request progress photos"
  // button stays disabled until that date — re-requesting before then can't help.
  const progressPhotosCheckIn = evaluateProgressPhotoCheckIn(
    progressPhotos.map((p) => ({
      angle: p.angle,
      checkInDate: p.checkInDate,
      takenAt: p.takenAt,
      createdAt: p.createdAt,
    })),
    todayCivil,
    timezone,
  );
  const tSkeleton = await getTranslations("clients.detail.skeleton");
  const tCharts = await getTranslations("clients.detail.charts");
  const tExercise = await getTranslations("clients.exerciseProgress");

  // Anchor every range to today so the local filter windows match the other
  // trend widgets on this page.
  const rangeStarts = {
    all: addCivilDays(todayCivil, -(MAX_LOOKBACK_DAYS - 1)),
    "90": addCivilDays(todayCivil, -89),
    "30": addCivilDays(todayCivil, -29),
    "7": addCivilDays(todayCivil, -6),
  };

  const weightRequestRow = (
    <ClientRequestRow
      clientId={id}
      clientName={displayName}
      kind="weight"
      timezone={timezone}
      requestedAt={client.bodyWeightRequestedAt ?? null}
      fulfilled={bodyWeightFulfilled}
      checkInEligible={progressPhotosCheckIn.isEligible}
      nextEligibleDate={progressPhotosCheckIn.nextEligibleDate}
    />
  );

  // Every chart id appears here even when hidden — the configurator needs its
  // label to offer it back. `node: null` is what "switched off" means, and it
  // is why the queries above are conditional.
  const chartSlots: ClientChartSlot[] = [
    {
      id: "bodyWeight",
      label: tCharts("items.bodyWeight"),
      span: "half",
      node: showsChart("bodyWeight") ? (
        <Suspense fallback={<WidgetSkeleton title={tSkeleton("bodyWeight")} />}>
          <BodyWeightTrendChart
            clientId={id}
            timezone={timezone}
            requestSlot={weightRequestRow}
          />
        </Suspense>
      ) : null,
    },
    {
      id: "muscleGroups",
      label: tCharts("items.muscleGroups"),
      span: "full",
      node:
        showsChart("muscleGroups") && exerciseProgress ? (
          <MuscleGroupProgressClient
            weeks={exerciseProgress.muscleGroupWeeks}
            availableGroups={exerciseProgress.availableMuscleGroups}
            currentWeekStart={exerciseProgress.currentWeekStart}
            rangeStarts={rangeStarts}
          />
        ) : null,
    },
    {
      id: "volume",
      label: tCharts("items.volume"),
      span: "half",
      node: showsChart("volume") ? (
        <Suspense fallback={<WidgetSkeleton title={tSkeleton("workoutTrends")} />}>
          <WorkoutTrendsWidget clientId={id} timezone={timezone} />
        </Suspense>
      ) : null,
    },
    {
      id: "habits",
      label: tCharts("items.habits"),
      span: "half",
      node: showsChart("habits") ? (
        <Suspense fallback={<WidgetSkeleton title={tSkeleton("habitTrends")} />}>
          <HabitTrendsWidget clientId={id} timezone={timezone} />
        </Suspense>
      ) : null,
    },
    {
      id: "exerciseProgress",
      label: tCharts("items.exerciseProgress"),
      span: "full",
      node:
        showsChart("exerciseProgress") && exerciseProgress ? (
          <ExerciseProgressClient
            exercises={exerciseProgress.exercises}
            points={exerciseProgress.points}
            setSessions={exerciseProgress.exerciseSetSessions}
            truncatedSetHistoryExerciseIds={
              exerciseProgress.truncatedSetHistoryExerciseIds
            }
            today={todayCivil}
            rangeStarts={rangeStarts}
            labels={{
              exercisePickerLabel: tExercise("exercisePickerLabel"),
              metricTopSet: tExercise("metricTopSet"),
              metricE1rm: tExercise("metricE1rm"),
              metricVolume: tExercise("metricVolume"),
              weightUnit: tExercise("weightUnit"),
              volumeUnit: tExercise("volumeUnit"),
              latestPrefix: tExercise("latestPrefix"),
              emptyNoExercises: tExercise("emptyNoExercises"),
              emptyNoData: tExercise("emptyNoData"),
              tooltipTopSet: tExercise("tooltipTopSet"),
              tooltipE1rm: tExercise("tooltipE1rm"),
              tooltipVolume: tExercise("tooltipVolume"),
              ranges: {
                all: tExercise("rangeAll"),
                "90": tExercise("range90"),
                "30": tExercise("range30"),
                "7": tExercise("range7"),
              },
            }}
          />
        ) : null,
    },
    {
      id: "dailySteps",
      label: tCharts("items.dailySteps"),
      span: "half",
      node: showsChart("dailySteps") ? (
        <Suspense fallback={<WidgetSkeleton title={tSkeleton("dailySteps")} />}>
          <DailyStepsWidget clientId={id} timezone={timezone} />
        </Suspense>
      ) : null,
    },
    {
      id: "personalRecords",
      label: tCharts("items.personalRecords"),
      span: "half",
      node: showsChart("personalRecords") ? (
        <Suspense fallback={<WidgetSkeleton title={tSkeleton("personalRecords")} />}>
          <PersonalRecordsWidget clientId={id} />
        </Suspense>
      ) : null,
    },
  ];

  return (
    <div className="gc-page flex w-full flex-col gap-6">
      <ClientHeader
        clientId={id}
        displayName={displayName}
        appDisplayName={client.displayName ?? client.email ?? id}
        email={client.email ?? ""}
        photoURL={client.photoURL ?? null}
        coachNickname={client.coachNickname ?? null}
        birthDate={client.birthDate ?? null}
        heightCm={typeof client.heightCm === "number" ? client.heightCm : null}
        bodyWeightKg={latestBodyWeightKg}
        appDevices={appDevices}
        settingsSlot={
          <ClientSettingsDialog
            clientId={id}
            clientName={displayName}
            birthDate={client.birthDate ?? null}
            initialNickname={client.coachNickname ?? null}
            weightRequestSlot={weightRequestRow}
          />
        }
        notesSlot={
          <ClientNotesDialog
            clientId={id}
            timezone={timezone}
            todayCivil={todayCivil}
            initialEntries={notes.entries}
          />
        }
      />

      <ClientCalendarPeek clientId={id} initialPayload={calendarPeek} />

      <ClientSummaryCard
        clientId={id}
        clientName={displayName}
        timezone={timezone}
        goals={goals}
      />

      {/* #949 — nutrición era UN BOTÓN en el header y nada más. Ahora es una
          sección propia, justo debajo del resumen, y con estado vacío: un
          cliente sin plan es el caso más accionable y era el único del que la
          página no decía nada. */}
      <Suspense fallback={<WidgetSkeleton title={tSkeleton("nutrition")} />}>
        <NutritionProfileWidget clientId={id} timezone={timezone} />
      </Suspense>

      <ClientChartsSection
        slots={chartSlots}
        hidden={hiddenCharts}
        labels={{
          title: tCharts("title"),
          subtitle: tCharts("subtitle"),
          configure: tCharts("configure"),
          configureTitle: tCharts("configureTitle"),
          configureHelp: tCharts("configureHelp"),
          allHidden: tCharts("allHidden"),
        }}
      />

      <ProgressPhotosWidget
        photos={progressPhotos}
        clientId={id}
        timezone={timezone}
        requestSlot={
          <ClientRequestRow
            clientId={id}
            clientName={displayName}
            kind="progressPhotos"
            timezone={timezone}
            requestedAt={client.progressPhotosRequestedAt ?? null}
            fulfilled={progressPhotosFulfilled}
            checkInEligible={progressPhotosCheckIn.isEligible}
            nextEligibleDate={progressPhotosCheckIn.nextEligibleDate}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Suspense fallback={<WidgetSkeleton title={tSkeleton("recentMessages")} />}>
          <ChatHistoryWidget clientId={id} trainerUid={trainer.uid} timezone={timezone} />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton title={tSkeleton("recentLogs")} />}>
          <ClientRecentLogsWidget clientId={id} timezone={timezone} />
        </Suspense>
      </div>

      {/* #753 — last on the page on purpose: it is the only control here that
          removes the client from the roster, and nothing above it should be
          reachable by an accidental tap on the way to it. */}
      <UnlinkClientButton clientId={id} clientName={displayName} />
    </div>
  );
}

// The client's most recent body-weight measurement BY MEASUREMENT DATE
// (`recordedAt`), NOT by write order. A coach/client can backfill an old date
// AFTER logging a newer one (log today's 57kg, then add a 63.5kg entry dated
// last October); the header must still show today's 57kg. This mirrors the
// BodyWeightTrendChart "Último" value (its last point) so the header and the
// chart never disagree. `recordedAt` is the measurement timestamp; `createdAt`
// and the denormalized `users.bodyWeightKg` field reflect write order and are
// deliberately NOT used here. Since the query is `recordedAt`-descending, the
// first doc carrying a numeric `valueKg` is the latest measurement.
async function getLatestBodyWeightKg(
  clientId: string,
): Promise<number | null> {
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .collection("body_weight_logs")
    .orderBy("recordedAt", "desc")
    .limit(50)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as { valueKg?: unknown; recordedAt?: unknown };
    if (typeof data.valueKg !== "number") continue;
    if (!toDate(data.recordedAt)) continue;
    return data.valueKg;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
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
          asignarle entrenamientos, hábitos, mandarle mensajes y ver su
          progreso desde acá.
        </p>
      </section>

      {/* P22-04 — pre-load workouts + habits for this pending client.
          Server actions inside PendingClientPreload write to
          workout_assignments + habits with pendingEmail set. On first
          sign-in, convertMirrorToCanonical migrates clientId atomically. */}
      <PendingClientPreload normalizedEmail={normalizedEmail} />

      {/* #753 — undo a mistyped invite without asking an operator. */}
      <RemovePendingClientButton email={normalizedEmail} />

      <p className="text-xs text-muted-foreground">
        Cuando <strong>{email}</strong> inicie sesión con Google por primera
        vez, su perfil se va a crear automáticamente y todo el contenido
        pre-cargado va a aparecer en su cliente activo.
      </p>
    </div>
  );
}
