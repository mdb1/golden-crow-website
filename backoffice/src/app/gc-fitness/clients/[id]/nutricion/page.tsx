import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { coachVisibleClientName } from "@/lib/gc-fitness/client-name";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { listNutritionPlansForClient } from "@/lib/gc-fitness/nutrition-actions";
import { buildNutritionPhaseStrip } from "@/lib/gc-fitness/nutrition-plan-form";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

import { NutritionPhaseStrip } from "./_components/NutritionPhaseStrip";
import { NutritionCurrentTargets } from "./_components/NutritionCurrentTargets";

export const generateMetadata = () => sectionMetadata("clients");

export const dynamic = "force-dynamic";

/**
 * The coach's nutrition surface for one client (#914).
 *
 * Two things, in this order: the PHASE STRIP (what has been, what is, what is queued) and
 * the targets in force TODAY. The strip comes first because nutrition here is not a state
 * but a sequence — "agosto definición, septiembre volumen" — and a coach's first question
 * is almost always "what block is he in", not "what are the numbers".
 */
export default async function ClientNutritionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trainer;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/login");
    throw err;
  }

  const clientSnap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(id)
    .get();
  if (!clientSnap.exists) notFound();
  const client = clientSnap.data() as {
    coachId?: string;
    displayName?: string;
    email?: string;
    coachNickname?: string;
  };
  if (client.coachId !== trainer.uid) notFound();

  const clientName = coachVisibleClientName({
    uid: id,
    displayName: client.displayName ?? client.email ?? id,
    email: client.email ?? "",
    coachNickname: client.coachNickname ?? null,
  });

  const t = await getTranslations("clients.detail.nutrition");

  // `listNutritionPlansForClient` re-checks ownership. That is deliberate duplication: the
  // page guard protects the render, the action guard protects the data — and the action is
  // also reachable from the form.
  const { plans, context } = await listNutritionPlansForClient(id);
  const phases = buildNutritionPhaseStrip(plans, context.todayCivil);
  const current = phases.find((phase) => phase.isActive) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
            <Link href={`/gc-fitness/clients/${id}`}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground text-sm">
              {clientName} · {t("subtitle")}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href={`/gc-fitness/clients/${id}/nutricion/asignar`}>{t("assign")}</Link>
        </Button>
      </div>

      <NutritionCurrentTargets phase={current} todayCivil={context.todayCivil} />

      <NutritionPhaseStrip
        clientId={id}
        phases={phases}
        todayCivil={context.todayCivil}
      />
    </div>
  );
}
