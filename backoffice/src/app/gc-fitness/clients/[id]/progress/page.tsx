// /gc-fitness/clients/[id]/progress/page.tsx — Per-client per-exercise progress
// charts (backlog C4). Mirrors the iOS Progress charts but lets the coach pick
// ONE exercise from this client's logged history and chart its progression
// (top-set weight / estimated 1RM / volume) over a selectable time range.
//
// Server Component. Same auth + ownership gate as the sibling client pages
// (trainer-auth + coachId === trainerUid, defense in depth alongside the
// Firestore rules). The aggregation is ONE bounded Firestore read — see
// getClientExerciseProgress (reuses the existing clientId+startedAt index).

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { coachVisibleClientName } from "@/lib/gc-fitness/client-name";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { getClientExerciseProgress } from "@/lib/gc-fitness/exercise-progress-actions";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { addCivilDays } from "../_components/trend-range";
import { ExerciseProgressClient } from "./ExerciseProgressClient";

export const dynamic = "force-dynamic";

const MAX_LOOKBACK_DAYS = 365;

export default async function ClientExerciseProgressPage({
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

  // Per-exercise progress only makes sense for a canonical (signed-in) client.
  // Pending `mirror:` clients have no logged history yet — 404 them here.
  if (id.startsWith("mirror:")) notFound();

  const db = gcFitnessFirestore();
  const clientSnap = await db
    .collection(FirestoreCollections.users)
    .doc(id)
    .get();
  if (!clientSnap.exists) notFound();
  const client = clientSnap.data() as {
    displayName?: string;
    email?: string;
    coachId?: string;
    timezone?: string;
    coachNickname?: string;
  };
  if (client.coachId !== trainer.uid) notFound();

  const displayName = coachVisibleClientName({
    uid: id,
    displayName: client.displayName ?? client.email ?? id,
    email: client.email ?? "",
    coachNickname: client.coachNickname ?? null,
  });
  const timezone = client.timezone ?? "UTC";
  const today = civilDateToday(timezone);

  const t = await getTranslations("clients.exerciseProgress");

  const { exercises, points } = await getClientExerciseProgress(id, timezone);

  // Anchor each range to today so the local filter windows match the other
  // client-detail trend widgets.
  const rangeStarts = {
    all: addCivilDays(today, -(MAX_LOOKBACK_DAYS - 1)),
    "90": addCivilDays(today, -89),
    "30": addCivilDays(today, -29),
    "7": addCivilDays(today, -6),
  };

  return (
    <div className="gc-page flex w-full flex-col gap-6">
      <Link
        href={`/gc-fitness/clients/${id}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {displayName}
      </Link>

      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <ExerciseProgressClient
        exercises={exercises}
        points={points}
        today={today}
        rangeStarts={rangeStarts}
        labels={{
          exercisePickerLabel: t("exercisePickerLabel"),
          metricTopSet: t("metricTopSet"),
          metricE1rm: t("metricE1rm"),
          metricVolume: t("metricVolume"),
          weightUnit: t("weightUnit"),
          volumeUnit: t("volumeUnit"),
          latestPrefix: t("latestPrefix"),
          emptyNoExercises: t("emptyNoExercises"),
          emptyNoData: t("emptyNoData"),
          tooltipTopSet: t("tooltipTopSet"),
          tooltipE1rm: t("tooltipE1rm"),
          tooltipVolume: t("tooltipVolume"),
          ranges: {
            all: t("rangeAll"),
            "90": t("range90"),
            "30": t("range30"),
            "7": t("range7"),
          },
        }}
      />
    </div>
  );
}
