"use client";

// gc-fitness #1540 — «Asignar / cambiar plan». Elige un plan de la biblioteca (o «Sin
// plan»), fecha de inicio, precio especial opcional, días de aviso y — para planes con
// periodo — el próximo vencimiento (prellenado: el vigente, o el inicio). También
// sirve para corregir el vencimiento o el saldo de clases a mano.

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
import { DEFAULT_REMINDER_DAYS_BEFORE } from "@/lib/gc-fitness/billing";
import { assignClientPlan, updateClientBilling } from "@/lib/gc-fitness/payments-actions";
import {
  parseMoneyInput,
  planHasClassBalance,
  planIsPeriodic,
  type ClientBillingView,
  type PaymentPlan,
} from "@/lib/gc-fitness/payments-model";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";

import { SELECT_CLASS, usePaymentLabels } from "./payment-labels";

interface Props {
  clientId: string;
  clientName: string;
  billing: ClientBillingView | null;
  plans: PaymentPlan[];
  todayCivil: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function initialState(billing: ClientBillingView | null, todayCivil: string) {
  return {
    planId: billing?.planId ?? "",
    startCivil: billing?.startCivil ?? todayCivil,
    amount: billing?.amount != null ? String(billing.amount) : "",
    reminderDays: String(billing?.reminderDaysBefore ?? DEFAULT_REMINDER_DAYS_BEFORE),
    nextDueCivil: billing?.nextDueCivil ?? "",
    classesRemaining: billing?.classesRemaining != null ? String(billing.classesRemaining) : "",
  };
}

export function AssignPlanDialog({ clientId, clientName, billing, plans, todayCivil, open, onOpenChange }: Props) {
  const t = useTranslations("payments");
  const labels = usePaymentLabels();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(() => initialState(billing, todayCivil));
  const [error, setError] = useState<string | null>(null);

  const selectable = plans.filter((p) => !p.archived || p.id === billing?.planId);
  const selected = selectable.find((p) => p.id === form.planId) ?? null;
  const samePlan = !!selected && selected.id === billing?.planId;
  const periodic = planIsPeriodic(selected);
  const classBased = planHasClassBalance(selected);

  function handleOpenChange(next: boolean) {
    if (next) {
      setForm(initialState(billing, todayCivil));
      setError(null);
    }
    onOpenChange(next);
  }

  function submit() {
    setError(null);
    const amount = form.amount.trim() ? parseMoneyInput(form.amount) : null;
    if (amount !== null && !Number.isFinite(amount)) {
      setError(t("errorAmount"));
      return;
    }
    const reminderDaysBefore = Number.parseInt(form.reminderDays, 10);
    startTransition(async () => {
      try {
        const result = await assignClientPlan({
          clientId,
          planId: form.planId || null,
          amount,
          startCivil: form.startCivil || null,
          // Sin tocar el campo, el servidor decide (el vigente o el inicio).
          ...(periodic && form.nextDueCivil ? { nextDueCivil: form.nextDueCivil } : {}),
          reminderDaysBefore: Number.isFinite(reminderDaysBefore) ? reminderDaysBefore : DEFAULT_REMINDER_DAYS_BEFORE,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // El saldo de clases se corrige aparte (no viene del plan).
        if (samePlan && classBased && form.classesRemaining.trim() !== "") {
          const classesRemaining = Number.parseInt(form.classesRemaining, 10);
          if (Number.isFinite(classesRemaining) && classesRemaining !== billing?.classesRemaining) {
            const fix = await updateClientBilling({
              clientId,
              nextDueCivil: null,
              classesRemaining: Math.max(0, classesRemaining),
              reminderDaysBefore: Number.isFinite(reminderDaysBefore) ? reminderDaysBefore : DEFAULT_REMINDER_DAYS_BEFORE,
            });
            if (!fix.ok) {
              setError(fix.error);
              return;
            }
          }
        }
        toast.success(t("planAssigned"));
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        if (!noteIfStaleDeployment(err)) setError(t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="assign-plan-dialog">
        <DialogHeader>
          <DialogTitle>{billing?.planId ? t("changePlan") : t("assignPlan")}</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="assign-plan">{t("plan")}</Label>
            <select
              id="assign-plan"
              className={SELECT_CLASS}
              value={form.planId}
              onChange={(e) => setForm({ ...form, planId: e.target.value })}
            >
              <option value="">{t("noPlanOption")}</option>
              {selectable.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {labels.kind(plan.kind)} · {labels.money(plan.amount, plan.currency)}
                </option>
              ))}
            </select>
            {plans.length === 0 ? <p className="text-xs text-muted-foreground">{t("plans.empty")}</p> : null}
          </div>

          {selected ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="assign-start">{t("startDate")}</Label>
                  <Input
                    id="assign-start"
                    type="date"
                    value={form.startCivil}
                    onChange={(e) => setForm({ ...form, startCivil: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="assign-amount">{t("specialPrice")}</Label>
                  <Input
                    id="assign-amount"
                    inputMode="decimal"
                    placeholder={labels.money(selected.amount, selected.currency)}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
              </div>

              {periodic ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="assign-next-due">{t("nextDue")}</Label>
                    <Input
                      id="assign-next-due"
                      type="date"
                      value={form.nextDueCivil}
                      onChange={(e) => setForm({ ...form, nextDueCivil: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="assign-reminder">{t("reminderDays")}</Label>
                    <Input
                      id="assign-reminder"
                      type="number"
                      min={0}
                      max={30}
                      value={form.reminderDays}
                      onChange={(e) => setForm({ ...form, reminderDays: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}

              {classBased && samePlan ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="assign-classes">{t("covers.classesLabel")}</Label>
                  <Input
                    id="assign-classes"
                    type="number"
                    min={0}
                    value={form.classesRemaining}
                    onChange={(e) => setForm({ ...form, classesRemaining: e.target.value })}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending} data-testid="assign-plan-submit">
            {billing?.planId ? t("changePlan") : t("assignPlan")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
