"use client";

// RosterTable.tsx — interactive client roster as a responsive CARD GRID
// (2026-06 redesign). Previously a TanStack table; restyled into the
// reference card grid while preserving ALL data, links, and the
// at-risk filter behavior.
//
// Data mapping (every prior column is preserved, none dropped):
//   - name + email + avatar      → card header
//   - pendingProvisioning        → "Pending sign-in" badge
//   - needsAttention             → status icon (check ✓ when ok, clock when at-risk)
//   - thisWeekComplianceRatio    → "Adherencia <pct>%" colored bar + trend arrow
//   - habits done/scheduled      → habits compliance line
//   - workouts done/scheduled    → "Esta semana X/Y workouts"
//   - goals short/medium/long    → goal pills
//   - lastActivityAt             → "Última actividad: …"
//
// The "At-risk clients (N)" toggle and its full-set count are preserved
// verbatim from the table version. A name/email search box is added on top
// (purely client-side filtering of the already-loaded rows).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";
import type { AttentionReason } from "@/lib/gc-fitness/client-attention";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./RelativeTime";
import { RosterEmptyState } from "./RosterEmptyState";

export interface RosterTableProps {
  rows: ClientRosterRow[];
  trainerUid: string;
  initialNeedsAttentionOnly?: boolean;
}

function GoalPill({ label, count }: { label: string; count: number }) {
  const muted = count === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs tabular-nums",
        muted
          ? "border border-border text-muted-foreground"
          : "bg-primary/15 text-foreground",
      )}
    >
      <span className="font-semibold uppercase tracking-wide">{label}</span>
      <span>{count}</span>
    </span>
  );
}

/** Token-based progress bar with a green (good) / amber (at-risk) fill.
 *  Uses the theme chart tokens (CSS variables) — no raw hex, both themes work. */
function ComplianceBar({ pct, good }: { pct: number; good: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          good ? "bg-chart-3" : "bg-chart-4",
        )}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function RosterTable({
  rows,
  initialNeedsAttentionOnly = false,
}: RosterTableProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("clients");
  const tTable = useTranslations("clients.table");
  const tCommon = useTranslations("common");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(
    initialNeedsAttentionOnly,
  );
  const [query, setQuery] = useState("");

  // Locale-aware label for an attention reason string. Kept in lockstep with
  // the Pitfall-7-locked union in `client-attention.ts`.
  function formatReason(reason: AttentionReason): string {
    switch (reason) {
      case "inactive-3-days":
        return t("inactive3Days");
    }
  }

  // Computed against the FULL set so toggling the filter doesn't change
  // the chip's count.
  const needsAttentionCount = useMemo(
    () => rows.filter((r) => r.needsAttention).length,
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (needsAttentionOnly && !r.needsAttention) return false;
      if (q) {
        const hay = `${r.displayName} ${r.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, needsAttentionOnly, query]);

  // 12-04 — designed empty state when no clients are assigned at all.
  if (rows.length === 0) {
    return <RosterEmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filters toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tCommon("search")}
            aria-label={tCommon("search")}
            className="h-11 rounded-full pl-9"
          />
        </div>
        <Button
          type="button"
          variant={needsAttentionOnly ? "default" : "outline"}
          onClick={() => setNeedsAttentionOnly((v) => !v)}
          aria-pressed={needsAttentionOnly}
          className="h-11 shrink-0 gap-2 rounded-full px-4"
        >
          <Clock className="size-4" />
          {t("needsAttentionFilter", { count: needsAttentionCount })}
        </Button>
        {needsAttentionOnly ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setNeedsAttentionOnly(false)}
            className="h-11 shrink-0 rounded-full"
          >
            {tCommon("clearFilter")}
          </Button>
        ) : null}
      </div>

      {filteredRows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {tTable("noClientsRow")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredRows.map((row) => {
            const compliancePct = Math.round(
              Math.min(1, Math.max(0, row.thisWeekComplianceRatio)) * 100,
            );
            const complianceGood = compliancePct >= 70;
            const habitsPct =
              row.habitsScheduledThisWeek > 0
                ? Math.round(
                    Math.min(
                      1,
                      row.habitsCompletedThisWeek / row.habitsScheduledThisWeek,
                    ) * 100,
                  )
                : null;
            const reasons = row.needsAttentionReasons.map(formatReason).join(", ");
            const attentionTitle = t("needsAttentionTitle", { reasons });
            const { short, medium, long } = row.goalsCount;
            const hasGoals = short + medium + long > 0;
            const href = row.pendingProvisioning
              ? `/gc-fitness/clients/pending/${encodeURIComponent(row.email)}`
              : `/gc-fitness/clients/${row.uid}`;

            return (
              <Card
                key={row.uid}
                role="link"
                tabIndex={0}
                onClick={() => router.push(href)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(href);
                  }
                }}
                className="cursor-pointer gap-0 py-0 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardContent className="flex flex-col gap-4 p-5">
                  {/* Header: avatar + name/email + status icon */}
                  <div className="flex items-start gap-3">
                    <ClientAvatar
                      name={row.displayName}
                      photoURL={row.photoURL}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-foreground">
                          {row.displayName}
                        </p>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {row.email}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {row.autoAssignedCoach ? (
                          <Badge
                            variant="default"
                            title="Se registró sin pre-asignación y quedó asignado a vos. Revisalo o transferilo desde el panel de admin."
                          >
                            NEW
                          </Badge>
                        ) : null}
                        {row.pendingProvisioning ? (
                          <Badge variant="secondary">
                            {tCommon("pendingSignIn")}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    {row.needsAttention ? (
                      <span
                        title={attentionTitle}
                        aria-label={attentionTitle}
                        className="inline-flex shrink-0"
                      >
                        <Clock className="size-5 text-chart-4" />
                      </span>
                    ) : (
                      <CheckCircle2
                        className="size-5 shrink-0 text-chart-3"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  {/* Metrics row: adherencia + esta semana */}
                  <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
                    {/* Adherencia (habit compliance ratio) */}
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {tTable("habits")}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-semibold tabular-nums text-foreground">
                          {compliancePct}%
                        </span>
                        {complianceGood ? (
                          <TrendingUp className="size-4 text-chart-3" aria-hidden />
                        ) : (
                          <TrendingDown className="size-4 text-chart-4" aria-hidden />
                        )}
                      </div>
                      <ComplianceBar pct={compliancePct} good={complianceGood} />
                      {habitsPct !== null ? (
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {row.habitsCompletedThisWeek}/
                          {row.habitsScheduledThisWeek}
                        </p>
                      ) : null}
                    </div>

                    {/* Este mes — workouts completados (los números son
                        mensuales: completados/programados del mes en curso) */}
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {tTable("thisMonth")}
                      </p>
                      <span className="text-lg font-semibold tabular-nums text-foreground">
                        {row.workoutsScheduledThisMonth > 0
                          ? `${row.workoutsCompletedThisMonth}/${row.workoutsScheduledThisMonth}`
                          : tCommon("emDash")}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {tTable("workouts")}
                      </p>
                    </div>
                  </div>

                  {/* Goals + last activity footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    {hasGoals ? (
                      <div className="flex items-center gap-1">
                        <GoalPill label={tTable("goalsShort")} count={short} />
                        <GoalPill label={tTable("goalsMedium")} count={medium} />
                        <GoalPill label={tTable("goalsLong")} count={long} />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {tTable("goals")}: {tCommon("emDash")}
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {row.lastActivityAt ? (
                        <>
                          {tTable("lastActivity")}: <RelativeTime iso={row.lastActivityAt} />
                        </>
                      ) : (
                        <>
                          {tTable("joined")}: {formatRosterDate(row.createdAt, locale)}
                        </>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {needsAttentionCount > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="size-3.5 text-chart-4" />
          {t("needsAttention", { count: needsAttentionCount })}
        </p>
      ) : null}
    </div>
  );
}

function formatRosterDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", {
    dateStyle: "medium",
  }).format(date);
}
