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
import { setPaymentPlanArchived } from "@/lib/gc-fitness/payments-actions";
import { type PaymentPlan } from "@/lib/gc-fitness/payments-model";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";

import { PlanFormDialog } from "./PlanFormDialog";
import { usePaymentLabels } from "./payment-labels";

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
