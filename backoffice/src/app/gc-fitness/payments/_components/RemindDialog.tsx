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
import type { ClientBillingView } from "@/lib/gc-fitness/payments-model";

import { usePaymentLabels } from "./payment-labels";

interface Props {
  clientFirstName: string;
  coachName: string;
  billing: ClientBillingView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function buildReminder(
  lang: "es" | "en",
  coachName: string,
  clientFirstName: string,
  billing: ClientBillingView | null,
): string {
  const amount = effectiveAmount(billing) ?? 0;
  return reminderText(
    lang,
    coachName,
    clientFirstName,
    amount,
    billing?.plan?.currency ?? "ARS",
    billing?.nextDueCivil ?? null,
  );
}

export function RemindDialog({ clientFirstName, coachName, billing, open, onOpenChange }: Props) {
  const t = useTranslations("payments");
  const { lang } = usePaymentLabels();
  const [text, setText] = useState(() => buildReminder(lang, coachName, clientFirstName, billing));

  function handleOpenChange(next: boolean) {
    if (next) setText(buildReminder(lang, coachName, clientFirstName, billing));
    onOpenChange(next);
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="remind-dialog">
        <DialogHeader>
          <DialogTitle>{t("remindTitle")}</DialogTitle>
        </DialogHeader>
        <Textarea
          aria-label={t("remindTitle")}
          data-testid="remind-text"
          rows={4}
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
