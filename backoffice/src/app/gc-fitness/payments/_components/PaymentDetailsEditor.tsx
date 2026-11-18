"use client";

// gc-fitness #1697 — «Datos de cobro»: el texto libre del coach (alias, CBU, banco, link de
// pago) que sale en el «Aviso de pago» y en el «Recordar». Twin of the apps' Cobros editor;
// writes `users/{coach}.paymentDetails` through `updateCoachPaymentDetails`.

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Landmark } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_DETAILS_MAX_LENGTH } from "@/lib/gc-fitness/billing";
import { updateCoachPaymentDetails } from "@/lib/gc-fitness/payment-details-actions";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";
import {
  setCoachPaymentDetailsCache,
  useCoachPaymentDetails,
} from "@/lib/gc-fitness/use-coach-payment-details";

export function PaymentDetailsEditor() {
  const t = useTranslations("payments");
  const [open, setOpen] = useState(false);
  const details = useCoachPaymentDetails(open);
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The draft starts from what is saved, once it has loaded; reopening restarts from it.
  const value = draft ?? details.value ?? "";
  const tooLong = value.length > PAYMENT_DETAILS_MAX_LENGTH;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setDraft(null);
  }

  function save() {
    startTransition(async () => {
      try {
        const result = await updateCoachPaymentDetails({ paymentDetails: value });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setCoachPaymentDetailsCache(result.paymentDetails);
        toast.success(t("detailsSaved"));
        onOpenChange(false);
      } catch (err) {
        if (!noteIfStaleDeployment(err)) toast.error(t("errorGeneric"));
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="payment-details-open">
        <Landmark className="size-4" />
        {t("detailsTitle")}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg" data-testid="payment-details-dialog">
          <DialogHeader>
            <DialogTitle>{t("detailsTitle")}</DialogTitle>
            <DialogDescription>{t("detailsFooter")}</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label={t("detailsTitle")}
            data-testid="payment-details-text"
            rows={6}
            value={value}
            disabled={!details.loaded}
            placeholder={t("detailsPlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className={tooLong ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
            {tooLong ? t("detailsTooLong") : `${value.length}/${PAYMENT_DETAILS_MAX_LENGTH}`}
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={pending || tooLong || !details.loaded}
              data-testid="payment-details-save"
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
