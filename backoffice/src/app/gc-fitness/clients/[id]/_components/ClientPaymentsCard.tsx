import Link from "next/link";
import { History, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { status } from "@/lib/gc-fitness/billing";
import {
  getClientBilling,
  getCoachDisplayName,
  listPaymentPlans,
} from "@/lib/gc-fitness/payments-actions";

import { ClientPaymentsSummary } from "@/app/gc-fitness/payments/_components/ClientPaymentsSummary";
import { ClientPaymentActions } from "@/app/gc-fitness/payments/_components/ClientPaymentActions";

/**
 * gc-fitness #1540 — card «Pagos» de la ficha: estado, plan, próximo vencimiento (o saldo
 * de clases), último pago y las acciones. El historial completo vive en `[id]/pagos`.
 *
 * Lecturas: el doc `client_billing/{coachId}_{clientId}` (get por id) y la biblioteca de
 * planes (para «Asignar plan»). Fail-soft como el resto de la ficha.
 */
export async function ClientPaymentsCard({
  clientId,
  clientName,
  clientFirstName,
  todayCivil,
}: {
  clientId: string;
  clientName: string;
  clientFirstName: string;
  todayCivil: string;
}) {
  const t = await getTranslations("payments");
  const [billing, plans, coachName] = await Promise.all([
    getClientBilling(clientId).catch(() => null),
    listPaymentPlans().catch(() => []),
    getCoachDisplayName().catch(() => ""),
  ]);
  const current = status(billing, todayCivil);

  return (
    <Card data-testid="client-payments-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="size-5" />
          {t("title")}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/gc-fitness/clients/${clientId}/pagos`}>
            <History className="size-4" />
            {t("history.viewAll")}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ClientPaymentsSummary billing={billing} status={current} />
        <ClientPaymentActions
          clientId={clientId}
          clientName={clientName}
          clientFirstName={clientFirstName}
          coachName={coachName}
          billing={billing}
          plans={plans}
          todayCivil={todayCivil}
        />
      </CardContent>
    </Card>
  );
}
