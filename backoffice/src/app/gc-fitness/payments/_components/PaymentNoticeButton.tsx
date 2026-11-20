"use client";

// PaymentNoticeButton.tsx — gc-fitness #1697: «Aviso de pago» desde las filas que NO son el
// tablero de Cobros (la lista de clientes y la tarjeta «Cobros» de Inicio, #535). Abre el mismo
// `PaymentNoticeDialog` que `ClientPaymentActions`; el nombre del coach y sus «Datos de cobro»
// se leen recién al abrir (una vez por pestaña), así que esas pantallas no cargan nada de más.
//
// Las filas de esas pantallas navegan al tocarlas: el clic (y lo que pasa adentro del diálogo,
// que React propaga por el árbol aunque el portal esté afuera) NO sube a la fila.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
// The Server Action module is imported ON USE, not at the top: this component is mounted by
// screens whose tests render it without the Admin SDK (roster, Inicio, Cobros) — a static
// import drags firebase-admin into every one of them. Same action, same ID (#382).
import type { ClientBillingView } from "@/lib/gc-fitness/payments-model";
import { useCoachPaymentDetails } from "@/lib/gc-fitness/use-coach-payment-details";

import { PaymentNoticeDialog } from "./PaymentNoticeDialog";

let coachNameCache: Promise<string> | null = null;

function loadCoachName(): Promise<string> {
  if (!coachNameCache) {
    coachNameCache = import("@/lib/gc-fitness/payments-actions")
      .then(({ getCoachDisplayName }) => getCoachDisplayName())
      .catch(() => {
        coachNameCache = null;
        return "";
      });
  }
  return coachNameCache;
}

/** Sólo para tests. */
export function resetPaymentNoticeCoachNameCache() {
  coachNameCache = null;
}

interface Props {
  clientId: string;
  clientName: string;
  billing: ClientBillingView;
}

export function PaymentNoticeButton({ clientId, clientName, billing }: Props) {
  const t = useTranslations("payments");
  const [open, setOpen] = useState(false);
  const [coachName, setCoachName] = useState<string | null>(null);
  const details = useCoachPaymentDetails(open);

  useEffect(() => {
    if (!open || coachName !== null) return;
    let alive = true;
    void loadCoachName().then((name) => {
      if (alive) setCoachName(name);
    });
    return () => {
      alive = false;
    };
  }, [open, coachName]);

  const firstName = clientName.trim().split(/\s+/)[0] || clientName;

  return (
    <span
      className="inline-flex"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9"
        aria-label={t("noticeAction")}
        title={t("noticeAction")}
        data-testid={`payment-notice-${clientId}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ReceiptText className="size-4" aria-hidden />
      </Button>
      <PaymentNoticeDialog
        clientId={clientId}
        clientName={clientName}
        clientFirstName={firstName}
        coachName={coachName ?? ""}
        billing={billing}
        paymentDetails={details.value}
        detailsLoaded={details.loaded && coachName !== null}
        open={open}
        onOpenChange={setOpen}
      />
    </span>
  );
}
