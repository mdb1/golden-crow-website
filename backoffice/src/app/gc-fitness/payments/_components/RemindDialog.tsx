"use client";

// gc-fitness #1540 — «Recordar»: el recordatorio al alumno es MANUAL (decisión del
// dueño): no hay push. El coach copia el texto (`Billing.reminderText`) o lo abre en
// WhatsApp (`wa.me/?text=`) y elige el contacto ahí.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { effectiveAmount, reminderText, whatsappShareUrl } from "@/lib/gc-fitness/billing";
import { noticeDueCivil } from "@/lib/gc-fitness/payment-notice";
import type { ClientBillingView } from "@/lib/gc-fitness/payments-model";

import { usePaymentLabels } from "./payment-labels";

interface Props {
  clientFirstName: string;
  coachName: string;
  billing: ClientBillingView | null;
  /** #1697 — los «Datos de cobro» del coach; van en el texto antes de la despedida. */
  paymentDetails?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function buildReminder(
  lang: "es" | "en",
  coachName: string,
  clientFirstName: string,
  billing: ClientBillingView | null,
  paymentDetails: string | null = null,
): string {
  const amount = effectiveAmount(billing) ?? 0;
  // #1697 — un plan por clases no tiene vencimiento que recordar (la regla de las apps).
  return reminderText(
    lang,
    coachName,
    clientFirstName,
    amount,
    billing?.plan?.currency ?? "ARS",
    noticeDueCivil(billing),
    paymentDetails,
  );
}

export function RemindDialog({
  clientFirstName,
  coachName,
  billing,
  paymentDetails = null,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations("payments");
  const { lang } = usePaymentLabels();
  // El texto se arma CADA VEZ que el diálogo se abre (y si el cobro cambia estando abierto).
  // El padre lo abre con `open`, así que Radix nunca llama `onOpenChange(true)`: armarlo sólo
  // al montar dejaba el vencimiento de cuando cargó la página — después de «Registrar pago»
  // la card decía «1 de dic» y el recordatorio seguía en «1 de noviembre».
  const fresh = buildReminder(lang, coachName, clientFirstName, billing, paymentDetails);
  const [text, setText] = useState(fresh);
  const [shownFor, setShownFor] = useState<string | null>(open ? fresh : null);
  if (open && shownFor !== fresh) {
    setShownFor(fresh);
    setText(fresh);
  } else if (!open && shownFor !== null) {
    setShownFor(null);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"));
    } catch {
      // Sin permiso de portapapeles: el texto queda seleccionable en el área.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="remind-dialog">
        <DialogHeader>
          <DialogTitle>{t("remindTitle")}</DialogTitle>
        </DialogHeader>
        <Textarea
          aria-label={t("remindTitle")}
          data-testid="remind-text"
          rows={paymentDetails ? 8 : 4}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={copy}>
            <Copy className="size-4" />
            {t("copyText")}
          </Button>
          <Button asChild>
            <a
              href={whatsappShareUrl(text)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="remind-whatsapp"
            >
              <MessageCircle className="size-4" />
              {t("openWhatsapp")}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
