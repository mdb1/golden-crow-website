"use client";

// gc-fitness #1540 — las acciones de cobro de UN alumno (fila del tablero y card de la
// ficha): Registrar pago · Recordar · Aviso de pago (#1697) · Asignar/cambiar plan · Descontar clase.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BellRing, CalendarCog, Minus, Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { consumeClientClass } from "@/lib/gc-fitness/payments-actions";
import {
  planHasClassBalance,
  type ClientBillingView,
  type PaymentPlan,
} from "@/lib/gc-fitness/payments-model";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";
import { useCoachPaymentDetails } from "@/lib/gc-fitness/use-coach-payment-details";

import { AssignPlanDialog } from "./AssignPlanDialog";
import { PaymentNoticeDialog } from "./PaymentNoticeDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { RemindDialog } from "./RemindDialog";

interface Props {
  clientId: string;
  clientName: string;
  clientFirstName: string;
  coachName: string;
  billing: ClientBillingView | null;
  plans: PaymentPlan[];
  todayCivil: string;
  /** Botones chicos (fila de tabla) o normales (card). */
  compact?: boolean;
}

export function ClientPaymentActions({
  clientId,
  clientName,
  clientFirstName,
  coachName,
  billing,
  plans,
  todayCivil,
  compact = false,
}: Props) {
  const t = useTranslations("payments");
  const router = useRouter();
  const [recordOpen, setRecordOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  // #1697 — los «Datos de cobro» se leen recién cuando un diálogo los necesita (una vez por pestaña).
  const details = useCoachPaymentDetails(remindOpen || noticeOpen);
  const [pending, startTransition] = useTransition();
  const size = compact ? "sm" : "default";
  const hasPlan = !!billing?.planId;

  function consume() {
    startTransition(async () => {
      try {
        const result = await consumeClientClass({ clientId });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        if (!noteIfStaleDeployment(err)) toast.error(t("errorGeneric"));
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size={size} onClick={() => setRecordOpen(true)} data-testid={`record-payment-${clientId}`}>
        <Plus className="size-4" />
        {t("record")}
      </Button>
      {hasPlan ? (
        <Button size={size} variant="outline" onClick={() => setRemindOpen(true)}>
          <BellRing className="size-4" />
          {t("remind")}
        </Button>
      ) : null}
      {hasPlan ? (
        <Button
          size={size}
          variant="outline"
          onClick={() => setNoticeOpen(true)}
          data-testid={`payment-notice-${clientId}`}
        >
          <ReceiptText className="size-4" />
          {t("noticeAction")}
        </Button>
      ) : null}
      {hasPlan && planHasClassBalance(billing?.plan ?? null) ? (
        <Button size={size} variant="outline" onClick={consume} disabled={pending || (billing?.classesRemaining ?? 0) <= 0}>
          <Minus className="size-4" />
          {t("consumeClass")}
        </Button>
      ) : null}
      <Button size={size} variant="ghost" onClick={() => setAssignOpen(true)} data-testid={`assign-plan-${clientId}`}>
        <CalendarCog className="size-4" />
        {hasPlan ? t("changePlan") : t("assignPlan")}
      </Button>

      <RecordPaymentDialog
        clientId={clientId}
        clientName={clientName}
        billing={billing}
        todayCivil={todayCivil}
        open={recordOpen}
        onOpenChange={setRecordOpen}
      />
      <RemindDialog
        clientFirstName={clientFirstName}
        coachName={coachName}
        billing={billing}
        paymentDetails={details.value}
        open={remindOpen}
        onOpenChange={setRemindOpen}
      />
      <PaymentNoticeDialog
        clientId={clientId}
        clientName={clientName}
        clientFirstName={clientFirstName}
        coachName={coachName}
        billing={billing}
        paymentDetails={details.value}
        detailsLoaded={details.loaded}
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
      />
      <AssignPlanDialog
        clientId={clientId}
        clientName={clientName}
        billing={billing}
        plans={plans}
        todayCivil={todayCivil}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
    </div>
  );
}
