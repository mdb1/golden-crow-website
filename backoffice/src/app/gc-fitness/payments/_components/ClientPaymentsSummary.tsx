"use client";

// gc-fitness #1540 — el resumen de cobro de UN alumno (card de la ficha y `[id]/pagos`):
// chip de estado + detalle, plan y monto, vencimiento o saldo de clases, último pago.

import { useTranslations } from "next-intl";

import { effectiveAmount, type BillingStatus } from "@/lib/gc-fitness/billing";
import { planHasClassBalance, type ClientBillingView } from "@/lib/gc-fitness/payments-model";

import { PaymentStatusChip, usePaymentLabels } from "./payment-labels";

export function ClientPaymentsSummary({
  billing,
  status,
}: {
  billing: ClientBillingView | null;
  status: BillingStatus;
}) {
  const t = useTranslations("payments");
  const labels = usePaymentLabels();
  const plan = billing?.plan ?? null;
  const classBased = planHasClassBalance(plan);
  const amount = effectiveAmount(billing);
  const detail = labels.detail(status, classBased);

  return (
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4" data-testid="client-payments-summary">
      <div>
        <dt className="text-muted-foreground">{t("status.title")}</dt>
        <dd className="mt-1 flex flex-wrap items-center gap-2">
          <PaymentStatusChip state={status.state} />
          {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t("plan")}</dt>
        <dd className="mt-1 font-medium">
          {plan ? (
            <>
              {plan.name}
              <span className="block text-xs font-normal text-muted-foreground">
                {labels.kind(plan.kind)}
                {amount != null ? ` · ${labels.money(amount, plan.currency)}` : ""}
              </span>
            </>
          ) : (
            t("status.none")
          )}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{classBased ? t("covers.classesLabel") : t("nextDue")}</dt>
        <dd className="mt-1 font-medium">
          {classBased
            ? t("classesLeft", { count: billing?.classesRemaining ?? 0 })
            : billing?.nextDueCivil
              ? labels.date(billing.nextDueCivil)
              : plan
                ? t("noDue")
                : "—"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t("lastPayment")}</dt>
        <dd className="mt-1 font-medium">
          {billing?.lastPaymentCivil ? (
            <>
              {labels.date(billing.lastPaymentCivil)}
              {billing.lastPaymentAmount != null ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  {labels.money(billing.lastPaymentAmount, plan?.currency ?? "ARS")}
                </span>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </dd>
      </div>
    </dl>
  );
}
