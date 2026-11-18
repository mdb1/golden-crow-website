// attention-today-card.tsx — golden-crow-website#535: «Necesitan tu atención».
//
// The clients the roster flags (same predicate as the KPI tile and
// /clients?filter=attention), each with the REASONS as chips and what they last
// did. Server component; rows come already sorted + paged from today-model.ts.

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import type { AttentionReason } from "@/lib/gc-fitness/client-attention";
import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";

export interface AttentionTodayRow {
  row: ClientRosterRow;
  /** «Hace 3 d · entrenamiento» / «Sin actividad», resolved by the page. */
  lastActivityLabel: string;
}

interface Props {
  rows: AttentionTodayRow[];
  total: number;
  /** The pager (built by the page, which owns the URL). */
  footer?: React.ReactNode;
}

export async function AttentionTodayCard({ rows, total, footer }: Props) {
  const t = await getTranslations("dashboard");
  const tReason = await getTranslations("clients.attentionReasons");
  // Literal keys: the i18n-literal-keys gate checks each one against the catalog.
  function reasonLabel(reason: AttentionReason): string {
    switch (reason) {
      case "inactive":
        return tReason("inactive");
      case "nothingAssigned":
        return tReason("nothingAssigned");
      case "missedWorkouts":
        return tReason("missedWorkouts");
      case "overduePayment":
        return tReason("overduePayment");
      case "lowNutrition":
        return tReason("lowNutrition");
      case "unreadChat":
        return tReason("unreadChat");
      default:
        return String(reason);
    }
  }

  return (
    <Card data-testid="attention-today">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="gc-page-title text-xl">{t("attentionTodayTitle", { count: total })}</CardTitle>
          <CardDescription>{t("attentionTodaySubtitle")}</CardDescription>
        </div>
        {total > 0 ? (
          <Link
            href="/gc-fitness/clients?filter=attention"
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("attentionTodayViewAll")}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col">
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="attention-today-empty">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {t("allCaughtUp")}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map(({ row, lastActivityLabel }) => (
              <li key={row.uid}>
                <Link
                  href={`/gc-fitness/clients/${row.uid}`}
                  data-testid="attention-today-row"
                  className="flex flex-col gap-2 rounded-lg px-2 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ClientAvatar name={row.displayName} photoURL={row.photoURL} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-foreground">{row.displayName}</span>
                      <span className="text-xs text-muted-foreground">{lastActivityLabel}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1 sm:justify-end">
                    {row.needsAttentionReasons.map((reason) => (
                      <Badge
                        key={reason}
                        variant="outline"
                        data-testid="attention-today-reason"
                        className="border-status-due/40 text-status-due"
                      >
                        {reasonLabel(reason)}
                      </Badge>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
