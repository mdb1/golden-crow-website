import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { status } from "@/lib/gc-fitness/billing";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { coachVisibleClientName } from "@/lib/gc-fitness/client-name";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import {
  getClientBilling,
  getCoachDisplayName,
  listClientPayments,
  listPaymentPlans,
} from "@/lib/gc-fitness/payments-actions";
import { clientFirstName } from "@/lib/gc-fitness/payments-model";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";

import { ClientPaymentActions } from "@/app/gc-fitness/payments/_components/ClientPaymentActions";
import { ClientPaymentsSummary } from "@/app/gc-fitness/payments/_components/ClientPaymentsSummary";
import { PaymentHistory } from "@/app/gc-fitness/payments/_components/PaymentHistory";

export const generateMetadata = () => sectionMetadata("payments");

export const dynamic = "force-dynamic";

/**
 * gc-fitness #1540 — los pagos de UN alumno: el resumen de cobro con sus acciones y el
 * historial completo (anular, filtrar por mes/medio, exportar CSV). Mismo patrón de
 * guarda que `[id]/nutricion`: la página chequea que el alumno sea del coach y cada
 * action lo vuelve a chequear.
 */
export default async function ClientPaymentsPage({
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
  const firstName = clientFirstName({
    displayName: client.displayName ?? "",
    email: client.email ?? "",
    coachNickname: client.coachNickname ?? null,
  });

  const t = await getTranslations("payments");
  const [billing, plans, history, coachName, timezone] = await Promise.all([
    getClientBilling(id),
    listPaymentPlans(),
    listClientPayments({ clientId: id }),
    getCoachDisplayName(),
    getTrainerTimezone(),
  ]);
  const todayCivil = civilDateToday(timezone);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("history.back")}>
          <Link href={`/gc-fitness/clients/${id}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{clientName}</p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <ClientPaymentsSummary billing={billing} status={status(billing, todayCivil)} />
          <ClientPaymentActions
            clientId={id}
            clientName={clientName}
            clientFirstName={firstName}
            coachName={coachName}
            billing={billing}
            plans={plans}
            todayCivil={todayCivil}
          />
        </CardContent>
      </Card>

      <PaymentHistory
        initialPage={history}
        clients={[{ id, name: clientName }]}
        fixedClientId={id}
      />
    </div>
  );
}
