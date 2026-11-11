"use client";

// gc-fitness #1540 — «Registrar pago». El monto, la moneda y «qué cubre» vienen
// PRELLENADOS desde el plan del alumno (mensual ⇒ 1 mes; pack ⇒ N meses; clases ⇒
// classCount): si coincide con lo que pagó, es un toque. Escribe `recordClientPayment`
// (un batch: pago + vencimiento movido por `Billing.applyPayment`).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PAYMENT_COVERS_KINDS,
  PAYMENT_METHODS,
  defaultCovers,
  effectiveAmount,
  type PaymentCoversKind,
  type PaymentMethod,
} from "@/lib/gc-fitness/billing";
import { parseMoneyInput, type ClientBillingView } from "@/lib/gc-fitness/payments-model";
import { recordClientPayment } from "@/lib/gc-fitness/payments-actions";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";
import { cn } from "@/lib/utils";

import { SELECT_CLASS, usePaymentLabels } from "./payment-labels";

interface Props {
  clientId: string;
  clientName: string;
  billing: ClientBillingView | null;
  todayCivil: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function initialState(billing: ClientBillingView | null, todayCivil: string) {
  const covers = defaultCovers(billing?.plan ?? null);
  const amount = effectiveAmount(billing);
  return {
    amount: amount != null && amount > 0 ? String(amount) : "",
    currency: billing?.plan?.currency ?? "ARS",
    paidCivil: todayCivil,
    method: "transfer" as PaymentMethod,
    methodNote: "",
    coversKind: covers.kind as PaymentCoversKind,
    coversCount: String(covers.months ?? covers.classes ?? 1),
    note: "",
  };
}

export function RecordPaymentDialog({ clientId, clientName, billing, todayCivil, open, onOpenChange }: Props) {
  const t = useTranslations("payments");
  const labels = usePaymentLabels();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(() => initialState(billing, todayCivil));
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (next) {
      setForm(initialState(billing, todayCivil));
      setError(null);
    }
    onOpenChange(next);
  }

  function coversLabelFor(kind: PaymentCoversKind): string {
    switch (kind) {
      case "months":
        return t("covers.monthsLabel");
      case "classes":
        return t("covers.classesLabel");
      case "routine":
        return t("covers.routine");
      default:
        return t("covers.other");
    }
  }

  function submit() {
    setError(null);
    const amount = parseMoneyInput(form.amount);
    const count = Number.parseInt(form.coversCount, 10);
    const hasCount = form.coversKind === "months" || form.coversKind === "classes";
    startTransition(async () => {
      try {
        const result = await recordClientPayment({
          clientId,
          amount: Number.isFinite(amount) ? amount : 0,
          currency: form.currency,
          paidCivil: form.paidCivil,
          method: form.method,
          methodNote: form.methodNote,
          covers: {
            kind: form.coversKind,
            months: form.coversKind === "months" && hasCount && count > 0 ? count : null,
            classes: form.coversKind === "classes" && hasCount && count > 0 ? count : null,
          },
          note: form.note,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(t("recorded"));
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        if (!noteIfStaleDeployment(err)) setError(t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="record-payment-dialog">
        <DialogHeader>
          <DialogTitle>{t("record")}</DialogTitle>
          <DialogDescription>
            {clientName}
            {billing?.plan ? ` · ${billing.plan.name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="payment-amount">{t("amount")}</Label>
              <Input
                id="payment-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="payment-currency">{t("plans.currency")}</Label>
              <Input
                id="payment-currency"
                maxLength={3}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payment-date">{t("date")}</Label>
            <Input
              id="payment-date"
              type="date"
              value={form.paidCivil}
              onChange={(e) => setForm({ ...form, paidCivil: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t("method.title")}</span>
            <div role="radiogroup" aria-label={t("method.title")} className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  role="radio"
                  aria-checked={form.method === method}
                  data-testid={`payment-method-${method}`}
                  onClick={() => setForm({ ...form, method })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    form.method === method
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input text-muted-foreground hover:text-foreground",
                  )}
                >
                  {labels.method(method)}
                </button>
              ))}
            </div>
            {form.method === "other" || form.methodNote ? (
              <Input
                aria-label={t("method.note")}
                placeholder={t("method.note")}
                maxLength={120}
                value={form.methodNote}
                onChange={(e) => setForm({ ...form, methodNote: e.target.value })}
              />
            ) : null}
          </div>

          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="payment-covers">{t("covers.title")}</Label>
              <select
                id="payment-covers"
                className={SELECT_CLASS}
                value={form.coversKind}
                onChange={(e) => setForm({ ...form, coversKind: e.target.value as PaymentCoversKind })}
              >
                {PAYMENT_COVERS_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {coversLabelFor(kind)}
                  </option>
                ))}
              </select>
            </div>
            {form.coversKind === "months" || form.coversKind === "classes" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="payment-covers-count">#</Label>
                <Input
                  id="payment-covers-count"
                  inputMode="numeric"
                  value={form.coversCount}
                  onChange={(e) => setForm({ ...form, coversCount: e.target.value })}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payment-note">{t("note")}</Label>
            <Textarea
              id="payment-note"
              maxLength={500}
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending} data-testid="record-payment-submit">
            {t("record")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
