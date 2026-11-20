"use client";

// CoachClientsTable — #534: the admin coach detail's client list, sortable by every
// column (name, last activity, billing urgency, next due, last payment, compliance,
// Corvo, signup). Rows come fully shaped from the server (`CoachClientOverviewRow`);
// sorting is in memory — no reads here. The per-row admin actions (transfer / unlink /
// deactivate / delete) are rendered by the PAGE (server) and handed in as nodes keyed by
// uid, so the Server Action IDs and forms stay exactly as they were (#382).

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  daysAgo,
  defaultSortDir,
  sortClientRows,
  type ClientSortKey,
  type CoachClientOverviewRow,
  type LastActivityKind,
  type SortDir,
} from "@/lib/gc-fitness/admin-coach-overview-model";
import type { BillingState } from "@/lib/gc-fitness/billing";

import { billingBadgeVariant, civilLabel, instantLabel, langOf, money } from "./overview-format";

export function CoachClientsTable({
  coachUid,
  rows,
  nowMs,
  timezone,
  actions = {},
  initialSort = "lastActivity",
}: {
  coachUid: string;
  rows: CoachClientOverviewRow[];
  nowMs: number;
  timezone: string;
  actions?: Record<string, ReactNode>;
  initialSort?: ClientSortKey;
}) {
  const t = useTranslations("admin.coachDetail.overview.clients");
  const tp = useTranslations("payments");
  const tl = useTranslations("admin.coachDetail.linked");
  // Literal keys (checked by i18n-literal-keys.test), not `status.${…}`.
  const kindLabel: Record<LastActivityKind, string> = {
    workout: t("activityKind.workout"),
    habit: t("activityKind.habit"),
    photo: t("activityKind.photo"),
    corvo: t("activityKind.corvo"),
    app_open: t("activityKind.app_open"),
  };
  const stateLabel: Record<BillingState, string> = {
    none: tp("status.none"),
    up_to_date: tp("status.up_to_date"),
    due_soon: tp("status.due_soon"),
    overdue: tp("status.overdue"),
  };
  const lang = langOf(useLocale());
  const [sort, setSort] = useState<{ key: ClientSortKey; dir: SortDir }>({
    key: initialSort,
    dir: defaultSortDir(initialSort),
  });
  const [showDeleted, setShowDeleted] = useState(false);
  const deletedCount = rows.filter((r) => r.deleted).length;

  const visible = useMemo(
    () => sortClientRows(showDeleted ? rows : rows.filter((r) => !r.deleted), sort.key, sort.dir),
    [rows, showDeleted, sort],
  );

  const onSort = (key: ClientSortKey) =>
    setSort((cur) =>
      cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultSortDir(key) },
    );

  const header = (key: ClientSortKey, label: string, className?: string) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead
        className={className}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => onSort(key)}
          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
          aria-label={t("sortBy", { column: label })}
          data-testid={`coach-clients-sort-${key}`}
        >
          {label}
          <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} aria-hidden />
        </button>
      </TableHead>
    );
  };

  const ago = (ms: number | null) => {
    const d = daysAgo(ms, nowMs);
    if (d === null) return t("never");
    return d === 0 ? t("today") : t("daysAgo", { days: d });
  };

  const billingText = (r: CoachClientOverviewRow): string | null => {
    if (r.billingState === "none") return null;
    if (r.planKind === "class_pack" || r.planKind === "per_class") {
      return r.billingState === "overdue" ? null : tp("classesLeft", { count: r.billingDays });
    }
    if (r.billingState === "overdue") return tp("overdueDays", { days: r.billingDays });
    if (r.nextDueCivil === null) return tp("noDue");
    return r.billingDays === 0 ? tp("dueToday") : tp("dueInDays", { days: r.billingDays });
  };

  return (
    <div className="space-y-2">
      {deletedCount > 0 ? (
        <label className="flex items-center gap-2 px-6 pt-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            data-testid="coach-clients-show-deleted"
          />
          {t("showDeleted", { count: deletedCount })}
        </label>
      ) : null}
      <div className="overflow-x-auto">
        <Table data-testid="coach-clients-table">
          <TableHeader>
            <TableRow>
              {header("name", t("col.name"))}
              {header("lastActivity", t("col.lastActivity"))}
              {header("billing", t("col.billing"))}
              {header("nextDue", t("col.nextDue"))}
              {header("lastPayment", t("col.lastPayment"))}
              {header("compliance", t("col.compliance"))}
              <TableHead>{t("col.nutrition")}</TableHead>
              {header("corvo", t("col.corvo"))}
              {header("signup", t("col.signup"))}
              <TableHead className="text-right">{t("col.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => {
                const detail = billingText(r);
                return (
                  <TableRow key={r.uid} data-testid={`coach-client-row-${r.uid}`}>
                    <TableCell className="min-w-[12rem]">
                      <Link
                        href={`/gc-fitness/admin/coaches/${coachUid}/clients/${r.uid}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.displayName || r.email || r.uid}
                      </Link>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {r.deleted ? <Badge variant="secondary">{tl("deleted")}</Badge> : null}
                        {r.entitlementTier === "premium" ? <Badge variant="violet">{t("premium")}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs" data-testid={`coach-client-activity-${r.uid}`}>
                      <div className="font-medium text-foreground">{ago(r.lastActivityAtMs)}</div>
                      {r.lastActivityKind ? (
                        <div className="text-muted-foreground">
                          {kindLabel[r.lastActivityKind]}
                          {r.lastActivityAtMs !== null ? ` · ${instantLabel(lang, r.lastActivityAtMs, timezone)}` : ""}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs" data-testid={`coach-client-billing-${r.uid}`}>
                      <Badge variant={billingBadgeVariant(r.billingState)}>{stateLabel[r.billingState]}</Badge>
                      {r.planName ? (
                        <div className="mt-0.5 text-muted-foreground">
                          {r.planName} · {money(lang, r.amount, r.currency)}
                        </div>
                      ) : null}
                      {detail ? <div className="text-muted-foreground">{detail}</div> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{civilLabel(lang, r.nextDueCivil)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.lastPaymentCivil ? (
                        <>
                          <div>{civilLabel(lang, r.lastPaymentCivil)}</div>
                          <div className="text-muted-foreground">
                            {money(lang, r.lastPaymentAmount, r.currency ?? "ARS")}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.complianceRatio === null ? (
                        "—"
                      ) : (
                        <div className="font-medium tabular-nums">{Math.round(r.complianceRatio * 100)}%</div>
                      )}
                      {r.workoutsScheduledThisMonth ? (
                        <div className="text-muted-foreground">
                          {t("workoutsMonth", {
                            done: r.workoutsCompletedThisMonth ?? 0,
                            total: r.workoutsScheduledThisMonth,
                          })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.nutritionPlanName ? (
                        <>
                          <div>{r.nutritionPlanName}</div>
                          {r.nutritionPercent7d !== null ? (
                            <div className="text-muted-foreground tabular-nums">{r.nutritionPercent7d}% · 7d</div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">{t("noPlan")}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.corvoTurnsTotal > 0 ? (
                        <>
                          <div className="tabular-nums">{t("turns", { count: r.corvoTurnsTotal })}</div>
                          <div className="text-muted-foreground">{ago(r.corvoLastMessageAtMs)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{instantLabel(lang, r.signupAtMs, timezone)}</TableCell>
                    <TableCell className="text-right">{actions[r.uid] ?? null}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
