import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/gc-fitness/page-header";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { listCoachChallenges } from "@/lib/gc-fitness/coach-challenge-actions";
import { coachChallengeMemberUids } from "@/lib/gc-fitness/coach-challenges";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { CoachChallengesClient } from "./CoachChallengesClient";

// gc-fitness #1475 (S6) — «Desafíos que crea el coach»: un desafío para TODOS los
// clientes del coach. Tab title: "Corvo - Desafíos" (issue #170).
export const generateMetadata = () => sectionMetadata("challenges");

export const dynamic = "force-dynamic";

export default async function CoachChallengesPage() {
  let trainerUid: string;
  try {
    trainerUid = (await getCurrentTrainer()).uid;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }
  const t = await getTranslations("coachChallenges");
  const [challenges, roster, timezone] = await Promise.all([
    listCoachChallenges(),
    listClients(),
    // Las fechas del formulario son días civiles en la zona del coach (#747).
    getTrainerTimezone(),
  ]);
  // Mismo filtro que la action al crear: clientes reales (no `mirror:` pendientes), sin el
  // coach y con un uid que el servidor social acepta.
  const inviteeCount = coachChallengeMemberUids(
    roster.filter((c) => !c.pendingProvisioning).map((c) => c.uid),
    trainerUid,
  ).length;

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("headerSubtitle")} />
      <CoachChallengesClient
        challenges={challenges}
        inviteeCount={inviteeCount}
        timezone={timezone}
        today={civilDateToday(timezone)}
        nowMs={Date.now()}
      />
    </div>
  );
}
