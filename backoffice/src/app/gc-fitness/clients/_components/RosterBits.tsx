"use client";

// RosterBits.tsx — small pieces the roster card AND the list view render the
// same way (golden-crow-website#535): payment status, habit trend, last activity.

import { useTranslations } from "next-intl";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { PaymentNoticeButton } from "@/app/gc-fitness/payments/_components/PaymentNoticeButton";
import { PaymentStatusChip, usePaymentLabels } from "@/app/gc-fitness/payments/_components/payment-labels";
import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";
import { cn } from "@/lib/utils";

import { RelativeTime } from "./RelativeTime";
import type { HabitTrend } from "./roster-metrics";

/** Chip («Vencido» / «Vence pronto» / «Al día» / «Sin plan») + the detail line. */
export function RosterPayment({ row, compact = false }: { row: ClientRosterRow; compact?: boolean }) {
  const labels = usePaymentLabels();
  const billing = row.billing ?? null;
  const detail = billing
    ? labels.detail({ state: billing.state, days: billing.days }, billing.classBased)
    : null;
  return (
    <div
      className={cn("flex min-w-0 items-center gap-1.5", compact ? "flex-col items-start gap-0.5" : "flex-wrap")}
      data-testid="roster-payment"
      data-state={billing?.state ?? "none"}
    >
      <PaymentStatusChip state={billing?.state ?? "none"} />
      {detail ? <span className="text-xs tabular-nums text-muted-foreground">{detail}</span> : null}
      {/* gc-fitness #1697 — «Aviso de pago» right from the roster. */}
      {billing?.view?.planId ? (
        <PaymentNoticeButton clientId={row.uid} clientName={row.displayName} billing={billing.view} />
      ) : null}
    </div>
  );
}

/** Up / down / flat vs the week before, with the points as text (never color-only). */
export function HabitTrendBadge({ trend }: { trend: HabitTrend | null }) {
  const t = useTranslations("clients.table");
  if (!trend) return null;
  const label =
    trend.direction === "up"
      ? t("trendUp", { points: trend.points })
      : trend.direction === "down"
        ? t("trendDown", { points: trend.points })
        : t("trendFlat");
  const Icon = trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        trend.direction === "up" && "text-status-ok",
        trend.direction === "down" && "text-status-overdue",
        trend.direction === "flat" && "text-muted-foreground",
      )}
      title={label}
      data-testid="roster-habit-trend"
      data-direction={trend.direction}
    >
      <Icon className="size-3.5" aria-hidden />
      <span aria-hidden>{trend.direction === "flat" ? "=" : `${trend.points}`}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** «hace 2 h · entrenamiento» — or «Sin actividad». */
export function RosterLastActivity({ row }: { row: ClientRosterRow }) {
  const t = useTranslations("clients.table");
  const kind =
    row.lastActivityKind === "workout"
      ? t("lastActivityKind.workout")
      : row.lastActivityKind === "habit"
        ? t("lastActivityKind.habit")
        : row.lastActivityKind === "photo"
          ? t("lastActivityKind.photo")
          : null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1" data-testid="roster-last-activity">
      <RelativeTime iso={row.lastActivityAt} />
      {row.lastActivityAt && kind ? <span className="text-muted-foreground">· {kind}</span> : null}
    </span>
  );
}
