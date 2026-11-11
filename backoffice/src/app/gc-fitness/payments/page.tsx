import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/gc-fitness/page-header";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { status } from "@/lib/gc-fitness/billing";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { coachVisibleClientName } from "@/lib/gc-fitness/client-name";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import {
  getCoachDisplayName,
  getCollectedThisMonth,
  listClientBillings,
  listClientPayments,
  listPaymentPlans,
} from "@/lib/gc-fitness/payments-actions";
import { clientFirstName } from "@/lib/gc-fitness/payments-model";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";

import { PaymentsClient } from "./_components/PaymentsClient";
import type { CollectionRow } from "./_components/types";

// gc-fitness #1540 — Pagos: planes, cobros e historial de los alumnos. Todo manual: el
// coach registra lo que cobró; no se procesa dinero. Tab title: "Corvo - Pagos" (#170).
export const generateMetadata = () => sectionMetadata("payments");

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/login");
    throw err;
  }

  const t = await getTranslations("payments");
  // Lecturas: el roster (cacheado), UNA query de billings, UNA de planes, el mes en curso
  // y la primera página del historial.
  const [roster, billings, plans, collected, history, coachName, timezone] = await Promise.all([
    listClients(),
    listClientBillings(),
    listPaymentPlans(),
    getCollectedThisMonth(),
    listClientPayments({}),
    getCoachDisplayName(),
    getTrainerTimezone(),
  ]);
  const todayCivil = civilDateToday(timezone);
  const byClient = new Map(billings.map((b) => [b.clientId, b]));

  // Sólo alumnos reales: a un pendiente de alta (`mirror:`) todavía no se le cobra.
  const clients = roster.filter((c) => !c.pendingProvisioning);
  const rows: CollectionRow[] = clients.map((c) => {
    const billing = byClient.get(c.uid) ?? null;
    return {
      clientId: c.uid,
      name: coachVisibleClientName(c),
      firstName: clientFirstName(c),
      billing,
      status: status(billing, todayCivil),
    };
  });

  // Los pagos de un alumno que ya no está siguen siendo del coach: el historial los
  // muestra con el id (no hay nombre en el roster para ellos).
  const clientOptions = clients.map((c) => ({ id: c.uid, name: coachVisibleClientName(c) }));

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <PaymentsClient
        rows={rows}
        plans={plans}
        collected={collected.totals}
        coachName={coachName}
        todayCivil={todayCivil}
        history={history}
        clients={clientOptions}
      />
    </div>
  );
}
