// payments-due-card.tsx — golden-crow-website#535: «Cobros» on the Inicio screen.
//
// Who is overdue and whose payment comes due inside their reminder window, from
// the roster rows the page already has (the roster reads `client_billing` once
// for the whole coach). Hidden when the coach has no client with a plan, so a
// coach who doesn't charge through Corvo never sees an empty money card.

import Link from "next/link";
import { CheckCircle2, CreditCard } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import { PaymentStatusChip } from "@/app/gc-fitness/payments/_components/payment-labels";
import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";

import type { PaymentsDue } from "./today-model";

const MAX_ROWS = 6;

export async function PaymentsDueCard({ due, anyPlan }: { due: PaymentsDue; anyPlan: boolean }) {
  if (!anyPlan) return null;
  const t = await getTranslations("dashboard");
  const tPay = await getTranslations("payments");

  function detail(row: ClientRosterRow): string {
    const b = row.billing!;
    if (b.classBased) return tPay("classesLeft", { count: Math.max(0, b.days) });
    if (b.state === "overdue") return tPay("overdueDays", { days: b.days });
    return b.days === 0 ? tPay("dueToday") : tPay("dueInDays", { days: b.days });
  }

  const rows = [...due.overdue, ...due.dueSoon];
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <Card data-testid="payments-due">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="gc-page-title flex items-center gap-2 text-xl">
            <CreditCard className="size-5" aria-hidden />
            {t("paymentsDueTitle")}
          </CardTitle>
          <CardDescription>
            {t("paymentsDueSubtitle", { overdue: due.overdue.length, soon: due.dueSoon.length })}
          </CardDescription>
        </div>
        <Link
          href="/gc-fitness/payments"
          className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("paymentsDueViewAll")}
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="payments-due-empty">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {t("paymentsDueEmpty")}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {shown.map((row) => (
              <li key={row.uid}>
                <Link
                  href={`/gc-fitness/clients/${row.uid}/pagos`}
                  data-testid="payments-due-row"
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ClientAvatar name={row.displayName} photoURL={row.photoURL} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-foreground">{row.displayName}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{detail(row)}</span>
                    </span>
                  </span>
                  <PaymentStatusChip state={row.billing!.state} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows.length > shown.length ? (
          <p className="pt-2 text-xs text-muted-foreground">
            {t("paymentsDueMore", { count: rows.length - shown.length })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
