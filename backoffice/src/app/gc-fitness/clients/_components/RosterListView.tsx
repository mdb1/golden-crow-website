"use client";

// RosterListView.tsx — the dense «Lista» view of the roster (golden-crow-website#535).
//
// The card grid shows two clients per row; a coach with thirty clients scrolls a
// lot to answer "who hasn't trained, who owes me". This is the same data as a
// table: one line per client, every column sortable from its header (the same
// `compareRosterRows` the toolbar uses, so both controls stay in sync), the
// payment state and the attention reasons as chips. On a phone it scrolls
// sideways inside its wrapper (never the page); the cards stay the default there.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";
import type { AttentionReason } from "@/lib/gc-fitness/client-attention";
import { isBulkSelectable } from "@/lib/gc-fitness/coach-broadcast-model";
import { cn } from "@/lib/utils";

import { HabitTrendBadge, RosterLastActivity, RosterPayment } from "./RosterBits";
import { COMPLIANCE_GOOD_PCT, habitCompliancePct, habitTrend, nutritionPct } from "./roster-metrics";
import type { RosterSortKey } from "./RosterTable";

export interface RosterListViewProps {
  rows: ClientRosterRow[];
  sortKey: RosterSortKey;
  sortDirection: "asc" | "desc";
  onSort: (key: RosterSortKey) => void;
  selected: Set<string>;
  onToggle: (uid: string) => void;
  showSelection: boolean;
  formatReason: (reason: AttentionReason) => string;
  hrefFor: (row: ClientRosterRow) => string;
}

export function RosterListView({
  rows,
  sortKey,
  sortDirection,
  onSort,
  selected,
  onToggle,
  showSelection,
  formatReason,
  hrefFor,
}: RosterListViewProps) {
  const router = useRouter();
  const t = useTranslations("clients.table");
  const tSort = useTranslations("clients.sort");
  const tCommon = useTranslations("common");
  const tBulk = useTranslations("clients.bulk");

  function header(key: RosterSortKey, label: string, className?: string) {
    const active = sortKey === key;
    const ariaSort = active ? (sortDirection === "asc" ? "ascending" : "descending") : "none";
    const Icon = !active ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={ariaSort} className={cn("px-3 py-2 text-left font-medium", className)}>
        <button
          type="button"
          onClick={() => onSort(key)}
          className={cn(
            "inline-flex min-h-10 items-center gap-1 rounded-md px-1 -mx-1 text-xs font-medium uppercase tracking-wide",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active ? "text-foreground" : "text-muted-foreground",
          )}
          data-testid={`roster-sort-${key}`}
          title={tSort("label")}
        >
          {label}
          <Icon className="size-3.5" aria-hidden />
        </button>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[1.25rem] border border-border bg-card" data-testid="roster-list">
      <table className="w-full min-w-[920px] border-collapse text-sm">
        <thead className="border-b border-border">
          <tr>
            {showSelection ? (
              <th scope="col" className="w-10 px-3 py-2">
                <span className="sr-only">{tBulk("selectAll")}</span>
              </th>
            ) : null}
            {header("name", t("client"))}
            {header("lastActivity", t("lastActivity"))}
            {header("habits", t("habitsWeek"))}
            {header("nutrition", t("nutrition"))}
            {header("workouts", t("workouts"))}
            {header("payment", t("payment"))}
            {header("attention", t("attention"))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = hrefFor(row);
            const habits = habitCompliancePct(row);
            const nutrition = nutritionPct(row);
            const selectable = showSelection && isBulkSelectable(row);
            return (
              <tr
                key={row.uid}
                data-testid="roster-list-row"
                onClick={() => router.push(href)}
                className="cursor-pointer border-b border-border last:border-b-0 hover:bg-accent/40"
              >
                {showSelection ? (
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {selectable ? (
                      <Checkbox
                        checked={selected.has(row.uid)}
                        onCheckedChange={() => onToggle(row.uid)}
                        aria-label={tBulk("selectClientAria", { name: row.displayName })}
                      />
                    ) : null}
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ClientAvatar name={row.displayName} photoURL={row.photoURL} size="sm" />
                    <div className="min-w-0">
                      <Link
                        href={href}
                        onClick={(e) => e.stopPropagation()}
                        className="block max-w-[14rem] truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {row.displayName}
                      </Link>
                      {row.pendingProvisioning ? (
                        <Badge variant="secondary" className="mt-0.5">
                          {tCommon("pendingSignIn")}
                        </Badge>
                      ) : (
                        <p className="max-w-[14rem] truncate text-xs text-muted-foreground">{row.email}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-sm">
                  <RosterLastActivity row={row} />
                </td>
                <td className="px-3 py-2">
                  {row.habitsScheduledThisWeek > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          habits >= COMPLIANCE_GOOD_PCT ? "text-foreground" : "text-status-due",
                        )}
                      >
                        {habits}%
                      </span>
                      <HabitTrendBadge trend={habitTrend(row)} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{tCommon("emDash")}</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {nutrition !== null ? (
                    <span className={cn("font-semibold", nutrition >= COMPLIANCE_GOOD_PCT ? "text-foreground" : "text-status-due")}>
                      {nutrition}%
                    </span>
                  ) : !row.nutritionHasActivePlan && !row.nutritionNeverHadPlan ? (
                    <span className="text-xs font-medium text-status-due">{t("nutritionNoPlan")}</span>
                  ) : (
                    <span className="text-muted-foreground">{tCommon("emDash")}</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {row.workoutsScheduledThisMonth > 0
                    ? `${row.workoutsCompletedThisMonth}/${row.workoutsScheduledThisMonth}`
                    : tCommon("emDash")}
                </td>
                <td className="px-3 py-2">
                  <RosterPayment row={row} compact />
                </td>
                <td className="px-3 py-2">
                  <div className="flex max-w-[16rem] flex-wrap gap-1">
                    {row.needsAttentionReasons.map((reason) => (
                      <Badge key={reason} variant="outline" data-testid="roster-attention-reason" className="border-status-due/40 text-status-due">
                        {formatReason(reason)}
                      </Badge>
                    ))}
                    {row.needsAttentionReasons.length === 0 && !row.pendingProvisioning ? (
                      <span className="text-xs text-muted-foreground">{t("allGood")}</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
