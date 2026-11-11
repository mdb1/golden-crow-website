"use client";

// gc-fitness #1540 — pestaña «Planes»: la biblioteca de formas de cobro del coach.
// Crear / editar / archivar (los planes no se borran: un alumno puede tener el snapshot
// de uno archivado). Editar un plan NO cambia lo asignado: cada alumno guarda el suyo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { savePaymentPlan, setPaymentPlanArchived } from "@/lib/gc-fitness/payments-actions";
import { parseMoneyInput, type PaymentPlan } from "@/lib/gc-fitness/payments-model";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";

import { SELECT_CLASS, usePaymentLabels } from "./payment-labels";

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

function PlanFormDialog({
  plan,
  open,
  onOpenChange,
}: {
  plan: PaymentPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    startTransition(async () => {
      try {
        const result = await savePaymentPlan({
          id: form.id,
          name: form.name,
          kind: form.kind,
          modality: form.modality || null,
          amount: Number.isFinite(amount) ? amount : -1,
          currency: form.currency,
          periodMonths: showPeriod && Number.isFinite(period) ? period : null,
          classCount: showClasses && Number.isFinite(classes) ? classes : null,
          description: form.description,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(t("plans.saved"));
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
              <select
                id="plan-kind"
                className={SELECT_CLASS}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as BillingPlanKind })}
              >
                {BILLING_PLAN_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {labels.kind(kind)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plan-modality">{t("plans.modalityLabel")}</Label>
              <select
                id="plan-modality"
                className={SELECT_CLASS}
                value={form.modality}
                onChange={(e) => setForm({ ...form, modality: e.target.value as BillingModality | "" })}
              >
                <option value="">{labels.modality(null)}</option>
                {BILLING_MODALITIES.map((modality) => (
                  <option key={modality} value={modality}>
                    {labels.modality(modality)}
                  </option>
                ))}
              </select>
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

export function PlansTab({ plans }: { plans: PaymentPlan[] }) {
  const t = useTranslations("payments");
  const labels = usePaymentLabels();
  const router = useRouter();
  const [editing, setEditing] = useState<PaymentPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  function openForm(plan: PaymentPlan | null) {
    setEditing(plan);
    setFormKey((k) => k + 1);
    setOpen(true);
  }

  function toggleArchived(plan: PaymentPlan) {
    startTransition(async () => {
      try {
        const result = await setPaymentPlanArchived({ planId: plan.id, archived: !plan.archived });
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
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => openForm(null)} data-testid="new-plan">
          <Plus className="size-4" />
          {t("plans.new")}
        </Button>
      </div>
      {plans.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{t("plans.empty")}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((plan) => (
            <Card key={plan.id} data-testid={`plan-${plan.id}`} className={plan.archived ? "opacity-60" : undefined}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{plan.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {labels.kind(plan.kind)}
                      {plan.modality ? ` · ${labels.modality(plan.modality)}` : ""}
                      {plan.periodMonths ? ` · ${t("covers.months", { count: plan.periodMonths })}` : ""}
                      {plan.classCount ? ` · ${t("covers.classes", { count: plan.classCount })}` : ""}
                    </div>
                  </div>
                  <div className="text-right font-semibold tabular-nums">{labels.money(plan.amount, plan.currency)}</div>
                </div>
                {plan.description ? <p className="whitespace-pre-line text-sm">{plan.description}</p> : null}
                <div className="flex items-center gap-2">
                  {plan.archived ? <Badge variant="secondary">{t("plans.archived")}</Badge> : null}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openForm(plan)}>
                      <Pencil className="size-4" />
                      {t("plans.edit")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggleArchived(plan)}>
                      {plan.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                      {plan.archived ? t("plans.unarchive") : t("plans.archive")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <PlanFormDialog key={formKey} plan={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}
