"use client";

// gc-fitness #1540 — pestaña «Cobros»: contadores/filtros por estado arriba (Vencidos ·
// Vencen pronto · Al día · Sin plan · Cobrado este mes) y la tabla de alumnos con sus
// acciones. El estado lo calcula el servidor con el gemelo `Billing.status`.

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { effectiveAmount, type BillingState } from "@/lib/gc-fitness/billing";
import { planHasClassBalance, type PaymentPlan } from "@/lib/gc-fitness/payments-model";
import { cn } from "@/lib/utils";

import { ClientPaymentActions } from "./ClientPaymentActions";
import { PaymentStatusChip, usePaymentLabels } from "./payment-labels";
import type { CollectionRow } from "./types";

interface Props {
  rows: CollectionRow[];
  plans: PaymentPlan[];
  collected: Array<{ currency: string; amount: number }>;
  coachName: string;
  todayCivil: string;
}

type Filter = BillingState | "all";

/** Orden de atención: vencidos (más días primero), vencen pronto, sin plan, al día. */
const STATE_ORDER: Record<BillingState, number> = { overdue: 0, due_soon: 1, none: 2, up_to_date: 3 };

export function sortCollectionRows(rows: CollectionRow[]): CollectionRow[] {
  return [...rows].sort((a, b) => {
    const s = STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state];
    if (s !== 0) return s;
    if (a.status.state === "overdue" && a.status.days !== b.status.days) return b.status.days - a.status.days;
    if (a.status.state === "due_soon" && a.status.days !== b.status.days) return a.status.days - b.status.days;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function CollectionsTab({ rows, plans, collected, coachName, todayCivil }: Props) {
  const t = useTranslations("payments");
  const labels = usePaymentLabels();
  const [filter, setFilter] = useState<Filter>("all");

  const counts: Record<BillingState, number> = { overdue: 0, due_soon: 0, up_to_date: 0, none: 0 };
  for (const row of rows) counts[row.status.state] += 1;
  const visible = sortCollectionRows(filter === "all" ? rows : rows.filter((r) => r.status.state === filter));

  const counters: Array<{ state: BillingState; tone: string }> = [
    { state: "overdue", tone: "text-red-700 dark:text-red-300" },
    { state: "due_soon", tone: "text-amber-700 dark:text-amber-300" },
    { state: "up_to_date", tone: "text-emerald-700 dark:text-emerald-300" },
    { state: "none", tone: "text-muted-foreground" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {counters.map(({ state, tone }) => (
          <button
            key={state}
            type="button"
            aria-pressed={filter === state}
            data-testid={`payments-counter-${state}`}
            onClick={() => setFilter(filter === state ? "all" : state)}
            className={cn(
              "rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/60",
              filter === state && "ring-2 ring-primary",
            )}
          >
            <div className={cn("text-2xl font-semibold tabular-nums", tone)}>{counts[state]}</div>
            <div className="text-sm text-muted-foreground">{labels.status(state)}</div>
          </button>
        ))}
        <div className="col-span-2 rounded-xl border bg-card p-3 md:col-span-1" data-testid="payments-collected">
          <div className="text-xl font-semibold tabular-nums">
            {collected.length === 0
              ? labels.money(0, "ARS")
              : collected.map((c) => labels.money(c.amount, c.currency)).join(" · ")}
          </div>
          <div className="text-sm text-muted-foreground">{t("collectedThisMonth")}</div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t("noClients")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("client")}</TableHead>
                  <TableHead>{t("plan")}</TableHead>
                  <TableHead>{t("amount")}</TableHead>
                  <TableHead>{t("nextDue")}</TableHead>
                  <TableHead>{t("status.title")}</TableHead>
                  <TableHead>{t("lastPayment")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => {
                  const billing = row.billing;
                  const amount = effectiveAmount(billing);
                  const classBased = planHasClassBalance(billing?.plan ?? null);
                  return (
                    <TableRow key={row.clientId} data-testid={`payments-row-${row.clientId}`}>
                      <TableCell className="font-medium">
                        <Link className="hover:underline" href={`/gc-fitness/clients/${row.clientId}`}>
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {billing?.plan ? (
                          <div className="flex flex-col">
                            <span>{billing.plan.name}</span>
                            <span className="text-xs text-muted-foreground">{labels.kind(billing.plan.kind)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {amount != null && billing?.plan ? labels.money(amount, billing.plan.currency) : "—"}
                      </TableCell>
                      <TableCell>
                        {classBased
                          ? t("classesLeft", { count: billing?.classesRemaining ?? 0 })
                          : billing?.plan
                            ? billing.nextDueCivil
                              ? labels.date(billing.nextDueCivil)
                              : t("noDue")
                            : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <PaymentStatusChip state={row.status.state} />
                          {!classBased ? (
                            <span className="text-xs text-muted-foreground">{labels.detail(row.status, false)}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {billing?.lastPaymentCivil ? (
                          <div className="flex flex-col">
                            <span>{labels.date(billing.lastPaymentCivil)}</span>
                            {billing.lastPaymentAmount != null ? (
                              <span className="text-xs text-muted-foreground">
                                {labels.money(billing.lastPaymentAmount, billing.plan?.currency ?? "ARS")}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <ClientPaymentActions
                            compact
                            clientId={row.clientId}
                            clientName={row.name}
                            clientFirstName={row.firstName}
                            coachName={coachName}
                            billing={billing}
                            plans={plans}
                            todayCivil={todayCivil}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
