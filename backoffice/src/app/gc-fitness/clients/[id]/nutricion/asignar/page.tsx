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
import { defaultNutritionStartsOn } from "@/lib/gc-fitness/nutrition-plan-form";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

import { AssignNutritionForm } from "./AssignNutritionForm";

export const generateMetadata = () => sectionMetadata("clients");

export const dynamic = "force-dynamic";

export default async function AssignNutritionPage({
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
  const { context } = await listNutritionPlansForClient(id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={`/gc-fitness/clients/${id}/nutricion`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("assignTitle")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("assignSubtitle", { name: clientName })}
          </p>
        </div>
      </div>

      <AssignNutritionForm
        clientId={id}
        // Today in the CLIENT's timezone, not the coach's: a coach in Buenos Aires
        // assigning at 21:30 must not default the phase to start tomorrow.
        defaultStartsOn={defaultNutritionStartsOn(context.clientTimezone)}
      />
    </div>
  );
}
