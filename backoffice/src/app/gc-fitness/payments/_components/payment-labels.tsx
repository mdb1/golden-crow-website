"use client";

// gc-fitness #1540 — textos de pagos compartidos por /payments y la ficha del alumno.
// Claves LITERALES (switch) a propósito: así el test de i18n verifica cada una.

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  formatBillingAmount,
  type BillingModality,
  type BillingPlanKind,
  type BillingState,
  type BillingStatus,
  type PaymentCovers,
  type PaymentMethod,
} from "@/lib/gc-fitness/billing";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { cn } from "@/lib/utils";

export function usePaymentLabels() {
  const t = useTranslations("payments");
  const locale = useLocale();
  const lang: "es" | "en" = locale === "en" ? "en" : "es";

  return useMemo(
    () => ({
      lang,
      status(state: BillingState): string {
        switch (state) {
          case "up_to_date":
            return t("status.up_to_date");
          case "due_soon":
            return t("status.due_soon");
          case "overdue":
            return t("status.overdue");
          default:
            return t("status.none");
        }
      },
      /** La línea de detalle del estado: «Vence en 3 días», «Vencido hace 4 días», «2 clases…». */
      detail(status: BillingStatus, classBased: boolean): string | null {
        if (status.state === "none") return null;
        if (classBased) return t("classesLeft", { count: Math.max(0, status.days) });
        if (status.state === "overdue") return t("overdueDays", { days: status.days });
        if (status.state === "due_soon") {
          return status.days === 0 ? t("dueToday") : t("dueInDays", { days: status.days });
        }
        return status.days > 0 ? t("dueInDays", { days: status.days }) : null;
      },
      method(method: PaymentMethod): string {
        switch (method) {
          case "cash":
            return t("method.cash");
          case "transfer":
            return t("method.transfer");
          case "mercadopago":
            return t("method.mercadopago");
          case "card":
            return t("method.card");
          default:
            return t("method.other");
        }
      },
      covers(covers: PaymentCovers): string {
        switch (covers.kind) {
          case "months":
            return t("covers.months", { count: covers.months ?? 1 });
          case "classes":
            return t("covers.classes", { count: covers.classes ?? 1 });
          case "routine":
            return t("covers.routine");
          default:
            return t("covers.other");
        }
      },
      kind(kind: BillingPlanKind): string {
        switch (kind) {
          case "per_class":
            return t("plans.kind.per_class");
          case "class_pack":
            return t("plans.kind.class_pack");
          case "per_routine":
            return t("plans.kind.per_routine");
          case "monthly":
            return t("plans.kind.monthly");
          case "months_pack":
            return t("plans.kind.months_pack");
          default:
            return t("plans.kind.custom");
        }
      },
      modality(modality: BillingModality | null): string {
        switch (modality) {
          case "online":
            return t("plans.modality.online");
          case "in_person":
            return t("plans.modality.in_person");
          case "hybrid":
            return t("plans.modality.hybrid");
          default:
            return t("plans.modality.none");
        }
      },
      money(amount: number, currency: string): string {
        return formatBillingAmount(lang, amount, currency);
      },
      date(civil: string | null): string {
        if (!civil) return "—";
        return formatCivilDateLabel(civil, { day: "numeric", month: "short", year: "numeric" }, lang === "es" ? "es-AR" : "en-US");
      },
    }),
    [t, lang],
  );
}

const CHIP_CLASS: Record<BillingState, string> = {
  up_to_date: "border-status-ok/25 bg-status-ok-soft text-status-ok",
  due_soon: "border-status-due/25 bg-status-due-soft text-status-due",
  overdue: "border-status-overdue/25 bg-status-overdue-soft text-status-overdue",
  none: "border-border bg-muted text-muted-foreground",
};

/** Chip de estado: verde (al día) · ámbar (vence pronto) · rojo (vencido) · gris (sin plan). */
export function PaymentStatusChip({ state, className }: { state: BillingState; className?: string }) {
  const labels = usePaymentLabels();
  return (
    <Badge
      variant="outline"
      data-testid="payment-status-chip"
      data-state={state}
      className={cn("rounded-full font-medium", CHIP_CLASS[state], className)}
    >
      {labels.status(state)}
    </Badge>
  );
}


