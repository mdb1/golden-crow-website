"use client";

// gc-fitness #1540 — formulario de plan (crear / editar). Vive aparte para que «Asignar plan»
// (#535) pueda crear uno sin salir del diálogo: `onSaved` devuelve el plan con su id nuevo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BILLING_MODALITIES,
  BILLING_PLAN_KINDS,
  type BillingModality,
  type BillingPlanKind,
} from "@/lib/gc-fitness/billing";
import { savePaymentPlan } from "@/lib/gc-fitness/payments-actions";
import { normalizePlanInput, parseMoneyInput, type PaymentPlan } from "@/lib/gc-fitness/payments-model";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";

import { FormSelect } from "@/components/gc-fitness/form-select";

import { usePaymentLabels } from "./payment-labels";

interface FormState {
  id: string | null;
  name: string;
  kind: BillingPlanKind;
  modality: BillingModality | "";
  amount: string;
  currency: string;
  periodMonths: string;
  classCount: string;
  description: string;
}

function formFor(plan: PaymentPlan | null): FormState {
  return {
    id: plan?.id ?? null,
    name: plan?.name ?? "",
    kind: plan?.kind ?? "monthly",
    modality: plan?.modality ?? "",
    amount: plan ? String(plan.amount) : "",
    currency: plan?.currency ?? "ARS",
    periodMonths: plan?.periodMonths != null ? String(plan.periodMonths) : "3",
    classCount: plan?.classCount != null ? String(plan.classCount) : "8",
    description: plan?.description ?? "",
  };
}

export function PlanFormDialog({
  plan,
  open,
  onOpenChange,
  onSaved,
}: {
  plan: PaymentPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recibe el plan guardado (con el id que devolvió el servidor). */
  onSaved?: (plan: PaymentPlan) => void;
}) {
  const t = useTranslations("payments");
  const labels = usePaymentLabels();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => formFor(plan));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const showPeriod = form.kind === "months_pack" || form.kind === "custom";
  const showClasses = form.kind === "class_pack";

  function submit() {
    setError(null);
    const amount = parseMoneyInput(form.amount);
    const period = Number.parseInt(form.periodMonths, 10);
    const classes = Number.parseInt(form.classCount, 10);
    const payload = {
      id: form.id,
      name: form.name,
      kind: form.kind,
      modality: form.modality || null,
      amount: Number.isFinite(amount) ? amount : -1,
      currency: form.currency,
      periodMonths: showPeriod && Number.isFinite(period) ? period : null,
      classCount: showClasses && Number.isFinite(classes) ? classes : null,
      description: form.description,
    };
    startTransition(async () => {
      try {
        const result = await savePaymentPlan(payload);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(t("plans.saved"));
        if (onSaved) {
          // Misma normalización que aplicó el servidor (mensual ⇒ periodMonths 1, etc.).
          const { id: _ignored, ...fields } = normalizePlanInput(payload);
          void _ignored;
          onSaved({ ...fields, id: result.id, archived: plan?.archived ?? false });
        }
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        if (!noteIfStaleDeployment(err)) setError(t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="plan-form-dialog">
        <DialogHeader>
          <DialogTitle>{plan ? t("plans.edit") : t("plans.new")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="plan-name">{t("plans.name")}</Label>
            <Input id="plan-name" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="plan-kind">{t("plans.kindLabel")}</Label>
              <FormSelect
                id="plan-kind"
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v as BillingPlanKind })}
                className="data-[size=default]:h-9"
                options={BILLING_PLAN_KINDS.map((kind) => ({ value: kind, label: labels.kind(kind) }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plan-modality">{t("plans.modalityLabel")}</Label>
              <FormSelect
                id="plan-modality"
                value={form.modality}
                onValueChange={(v) => setForm({ ...form, modality: v as BillingModality | "" })}
                className="data-[size=default]:h-9"
                options={[
                  { value: "", label: labels.modality(null) },
                  ...BILLING_MODALITIES.map((modality) => ({ value: modality, label: labels.modality(modality) })),
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="plan-amount">{t("amount")}</Label>
              <Input id="plan-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plan-currency">{t("plans.currency")}</Label>
              <Input
                id="plan-currency"
                maxLength={3}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
            </div>
          </div>
          {showPeriod ? (
            <div className="grid gap-1.5">
              <Label htmlFor="plan-period">{t("plans.periodMonths")}</Label>
              <Input
                id="plan-period"
                type="number"
                min={form.kind === "months_pack" ? 2 : 1}
                max={24}
                value={form.periodMonths}
                onChange={(e) => setForm({ ...form, periodMonths: e.target.value })}
              />
            </div>
          ) : null}
          {showClasses ? (
            <div className="grid gap-1.5">
              <Label htmlFor="plan-classes">{t("plans.classCount")}</Label>
              <Input
                id="plan-classes"
                type="number"
                min={1}
                max={200}
                value={form.classCount}
                onChange={(e) => setForm({ ...form, classCount: e.target.value })}
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="plan-description">{t("plans.description")}</Label>
            <Textarea
              id="plan-description"
              maxLength={1000}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending} data-testid="plan-form-submit">
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
