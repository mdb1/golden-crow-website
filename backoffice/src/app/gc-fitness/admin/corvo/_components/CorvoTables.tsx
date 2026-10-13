// CorvoTables — the three tables of /gc-fitness/admin/corvo (#1330): acceptance
// by proposal type, users near their daily quota, and reported replies.
// Presentational only (no hooks besides translations), so they render as server
// components on the page and mount directly in tests.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReportRow } from "@/lib/gc-fitness/ai-coach-admin-actions";
import {
  formatPercent,
  isKnownProposalType,
  totalAcceptance,
  type AcceptanceRow,
  type NearQuotaUser,
} from "@/lib/gc-fitness/ai-coach-admin-model";

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground" colSpan={colSpan}>
        {text}
      </TableCell>
    </TableRow>
  );
}

export function CorvoAcceptanceTable({ rows }: { rows: AcceptanceRow[] }) {
  const t = useTranslations("corvoAdmin.acceptance");
  const tType = useTranslations("corvoAdmin.proposalTypes");
  const total = totalAcceptance(rows);
  return (
    <div className="overflow-x-auto">
      <Table data-testid="corvo-acceptance-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("type")}</TableHead>
            <TableHead className="text-right">{t("shown")}</TableHead>
            <TableHead className="text-right">{t("applied")}</TableHead>
            <TableHead className="text-right">{t("dismissed")}</TableHead>
            <TableHead className="text-right">{t("failed")}</TableHead>
            <TableHead className="text-right">{t("expired")}</TableHead>
            <TableHead className="text-right">{t("pending")}</TableHead>
            <TableHead className="text-right">{t("rate")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={8} text={t("empty")} />
          ) : (
            <>
              {rows.map((row) => (
                <TableRow key={row.type} data-testid={`acceptance-${row.type}`}>
                  <TableCell>
                    <span className="font-medium">{isKnownProposalType(row.type) ? tType(row.type) : row.type}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{row.type}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.shown}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.applied}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.dismissed}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.failed}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.expired}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.pending}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums" data-testid={`acceptance-rate-${row.type}`}>
                    {formatPercent(row.rate)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">{t("total")}</TableCell>
                <TableCell className="text-right tabular-nums">{total.shown}</TableCell>
                <TableCell className="text-right tabular-nums">{total.applied}</TableCell>
                <TableCell colSpan={4} />
                <TableCell className="text-right font-semibold tabular-nums" data-testid="acceptance-rate-total">
                  {formatPercent(total.rate)}
                </TableCell>
              </TableRow>
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function CorvoNearQuotaTable({ rows }: { rows: NearQuotaUser[] }) {
  const t = useTranslations("corvoAdmin.nearQuota");
  return (
    <div className="overflow-x-auto">
      <Table data-testid="corvo-near-quota-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("user")}</TableHead>
            <TableHead>{t("tier")}</TableHead>
            <TableHead>{t("day")}</TableHead>
            <TableHead className="text-right">{t("usage")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={4} text={t("empty")} />
          ) : (
            rows.map((row) => (
              <TableRow key={row.uid} data-testid={`near-quota-${row.uid}`}>
                <TableCell>
                  <div className="font-medium">{row.email ?? row.displayName ?? "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.uid}</div>
                </TableCell>
                <TableCell>{t(row.tier)}</TableCell>
                <TableCell className="tabular-nums">{row.civilDate}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span data-testid={`near-quota-usage-${row.uid}`}>{`${row.count}/${row.quota}`}</span>
                  {row.reachedQuota ? (
                    <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                      {t("reached")}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function corvoReportHref(row: Pick<ReportRow, "uid" | "messageId">): string {
  return `/gc-fitness/admin/corvo/reports/${encodeURIComponent(row.uid)}/${encodeURIComponent(row.messageId)}`;
}

export function CorvoReportsTable({ rows }: { rows: ReportRow[] }) {
  const t = useTranslations("corvoAdmin.reports");
  const tReason = useTranslations("corvoAdmin.reasons");
  return (
    <div className="overflow-x-auto">
      <Table data-testid="corvo-reports-table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("user")}</TableHead>
            <TableHead>{t("reason")}</TableHead>
            <TableHead>{t("note")}</TableHead>
            <TableHead>{t("device")}</TableHead>
            <TableHead className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={6} text={t("empty")} />
          ) : (
            rows.map((row) => (
              <TableRow key={`${row.uid}/${row.messageId}`} data-testid={`report-${row.messageId}`}>
                <TableCell className="whitespace-nowrap text-xs tabular-nums">
                  {row.createdAtISO ? row.createdAtISO.slice(0, 16).replace("T", " ") : "—"}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.email ?? "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.uid}</div>
                </TableCell>
                <TableCell>{tReason(row.reason)}</TableCell>
                <TableCell className="max-w-xs whitespace-normal text-sm [overflow-wrap:anywhere]">
                  {row.note || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {[row.platform, row.appVersion].filter(Boolean).join(" ") || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={corvoReportHref(row)} className="text-sm font-medium underline underline-offset-2">
                    {t("open")}
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
