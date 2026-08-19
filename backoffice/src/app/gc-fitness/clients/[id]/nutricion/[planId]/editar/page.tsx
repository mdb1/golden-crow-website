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

import { AssignNutritionForm } from "../../asignar/AssignNutritionForm";

export const generateMetadata = () => sectionMetadata("clients");

export const dynamic = "force-dynamic";

/**
 * Editing one phase (#949).
 *
 * It renders the SAME form the assign flow uses, prefilled, with the scope selector on
 * top. There is no second editor because there is no second shape: a phase is a name, a
 * window, daily targets and meals whether it is being created or corrected, and two
 * editors would drift the first time a field is added to one of them.
 *
 * The self-authored plan of a coach-less client is NOT editable here. It is the client's
 * document (`source: "self"`, `trainerId === clientId`), the rules deny the coach's write,
 * and taking over somebody's own plan silently is not something a screen should offer.
 */
export default async function EditNutritionPhasePage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = await params;

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

  // Read the phase through the SAME loader the strip uses, so "which phase is current" is
  // decided once. Re-deriving it here from the dates would be a second resolver that can
  // disagree with the one the client's app runs.
  const { plans, context } = await listNutritionPlansForClient(id);
  const phase = buildNutritionPhaseStrip(plans, context.todayCivil).find(
    (candidate) => candidate.plan.id === planId,
  );
  if (!phase) notFound();
  // A soft-deleted or client-authored phase is not the coach's to rewrite.
  if (phase.plan.trainerId !== trainer.uid) notFound();

  const stateLabel =
    phase.state === "current"
      ? t("stateCurrent")
      : phase.state === "scheduled"
        ? t("stateScheduled")
        : t("statePast");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={`/gc-fitness/clients/${id}/nutricion`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("editSubtitle", {
              name: clientName,
              phase: `${phase.plan.name.es || phase.plan.name.en} · ${stateLabel}`,
            })}
          </p>
        </div>
      </div>

      <AssignNutritionForm
        clientId={id}
        defaultStartsOn={context.todayCivil}
        editing={{
          planId,
          plan: phase.plan,
          state: phase.state,
          // The client's today, not the coach's: the cutoff is a day in the life of
          // whoever is eating.
          todayCivil: context.todayCivil,
        }}
      />
    </div>
  );
}
