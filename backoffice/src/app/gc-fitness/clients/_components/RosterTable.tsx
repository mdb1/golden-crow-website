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
//
// #499 — every card lists its attention reasons as chips (most urgent first),
// and the toolbar sorts the roster by any of the card's columns. Default sort
// stays "last activity" (the server order), so nothing moves until the coach
// asks for it.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCircle2,
  Clock,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";
import {
  attentionRank,
  type AttentionReason,
} from "@/lib/gc-fitness/client-attention";
import { nutritionNeedsAttention } from "@/lib/gc-fitness/nutrition-coach-reply";
import {
  isBulkSelectable,
  selectAllState,
  toggleAllVisible,
} from "@/lib/gc-fitness/coach-broadcast-model";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./RelativeTime";
import { RosterBulkActions } from "./RosterBulkActions";
import { RosterEmptyState } from "./RosterEmptyState";
import { FormSelect } from "@/components/gc-fitness/form-select";

export interface RosterTableProps {
  rows: ClientRosterRow[];
  trainerUid: string;
  initialNeedsAttentionOnly?: boolean;
  /** The coach's IANA zone, resolved server-side (#747). */
  timezone: string;
}

export const ROSTER_SORT_KEYS = [
  "lastActivity",
  "attention",
  "name",
  "habits",
  "nutrition",
  "workouts",
  "unread",
] as const;
export type RosterSortKey = (typeof ROSTER_SORT_KEYS)[number];

/** The direction a column reads best in when first picked ("worst first" for the metrics). */
const DEFAULT_DIRECTION: Record<RosterSortKey, "asc" | "desc"> = {
  lastActivity: "desc",
  attention: "asc",
  name: "asc",
  habits: "asc",
  nutrition: "asc",
  workouts: "asc",
  unread: "desc",
};

function monthRatio(r: ClientRosterRow): number | null {
  return r.workoutsScheduledThisMonth > 0
    ? r.workoutsCompletedThisMonth / r.workoutsScheduledThisMonth
    : null;
}

function finiteOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Pure comparator for the roster sort (#499). Rows without a value for the
 * column (no nutrition asked, nothing scheduled this month, never active) go
 * LAST in both directions — an em dash is not "the worst" nor "the best".
 * Pending sign-ins always go last, like the server order. Ties → name.
 */
export function compareRosterRows(
  a: ClientRosterRow,
  b: ClientRosterRow,
  key: RosterSortKey,
  direction: "asc" | "desc",
): number {
  if (a.pendingProvisioning !== b.pendingProvisioning) {
    return a.pendingProvisioning ? 1 : -1;
  }
  const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  const sign = direction === "asc" ? 1 : -1;
  const nullable = (x: number | null, y: number | null): number => {
    if (x === null && y === null) return byName;
    if (x === null) return 1;
    if (y === null) return -1;
    return x === y ? byName : (x - y) * sign;
  };
  switch (key) {
    case "name":
      return byName * sign;
    case "lastActivity":
      return nullable(
        a.lastActivityAt ? Date.parse(a.lastActivityAt) : null,
        b.lastActivityAt ? Date.parse(b.lastActivityAt) : null,
      );
    case "attention": {
      // Most urgent reason first, then how many reasons; clients with none last.
      const ra = attentionRank(a.needsAttentionReasons);
      const rb = attentionRank(b.needsAttentionReasons);
      if (ra !== rb) {
        if (!Number.isFinite(ra)) return 1;
        if (!Number.isFinite(rb)) return -1;
        return (ra - rb) * sign;
      }
      const ca = a.needsAttentionReasons.length;
      const cb = b.needsAttentionReasons.length;
      return ca === cb ? byName : (cb - ca) * sign;
    }
    case "habits":
      return nullable(
        a.habitsScheduledThisWeek > 0 ? finiteOrNull(a.thisWeekComplianceRatio) : null,
        b.habitsScheduledThisWeek > 0 ? finiteOrNull(b.thisWeekComplianceRatio) : null,
      );
    case "nutrition":
      return nullable(finiteOrNull(a.nutritionRatio7Days), finiteOrNull(b.nutritionRatio7Days));
    case "workouts":
      return nullable(monthRatio(a), monthRatio(b));
    case "unread":
      return a.unreadChatCount === b.unreadChatCount
        ? byName
        : (a.unreadChatCount - b.unreadChatCount) * sign;
  }
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
  timezone,
}: RosterTableProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("clients");
  const tTable = useTranslations("clients.table");
  const tCommon = useTranslations("common");
  const tBulk = useTranslations("clients.bulk");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(
    initialNeedsAttentionOnly,
  );
  const [query, setQuery] = useState("");
  // #500 — bulk selection. Only ACTIVE clients with an account
  // (`isBulkSelectable`): a pending invite has no chat thread and
  // `bulkAssignTemplate` rejects `mirror:` ids. Selection survives filter /
  // search changes (Gmail-style); the dialog lists exactly who gets it.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const tSort = useTranslations("clients.sort");
  const [sortKey, setSortKey] = useState<RosterSortKey>("lastActivity");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Locale-aware label for an attention reason. Kept in lockstep with the
  // shared table in `client-attention.ts` (an unknown id from an older row
  // renders as the id instead of crashing the roster).
  const tReason = useTranslations("clients.attentionReasons");
  function formatReason(reason: AttentionReason): string {
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
  function sortLabel(key: RosterSortKey): string {
    switch (key) {
      case "lastActivity":
        return tSort("lastActivity");
      case "attention":
        return tSort("attention");
      case "name":
        return tSort("name");
      case "habits":
        return tSort("habits");
      case "nutrition":
        return tSort("nutrition");
      case "workouts":
        return tSort("workouts");
      case "unread":
        return tSort("unread");
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
    }).sort((a, b) => compareRosterRows(a, b, sortKey, sortDirection));
  }, [rows, needsAttentionOnly, query, sortKey, sortDirection]);

  const visibleSelectableIds = useMemo(
    () => filteredRows.filter(isBulkSelectable).map((r) => r.uid),
    [filteredRows],
  );
  const anySelectable = useMemo(() => rows.some(isBulkSelectable), [rows]);
  // In roster order, and only rows still present (a refresh can drop one).
  const selectedRecipients = useMemo(
    () =>
      rows
        .filter((r) => selected.has(r.uid) && isBulkSelectable(r))
        .map((r) => ({ uid: r.uid, displayName: r.displayName })),
    [rows, selected],
  );

  function toggleOne(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

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
        <div className="flex shrink-0 items-center gap-1">
          <FormSelect
            aria-label={tSort("label")}
            value={sortKey}
            onValueChange={(v) => {
              const key = v as RosterSortKey;
              setSortKey(key);
              setSortDirection(DEFAULT_DIRECTION[key]);
            }}
            className="w-auto rounded-full px-4 data-[size=default]:h-11"
            options={ROSTER_SORT_KEYS.map((key) => ({ value: key, label: sortLabel(key) }))}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={sortDirection === "asc" ? tSort("ascending") : tSort("descending")}
            title={sortDirection === "asc" ? tSort("ascending") : tSort("descending")}
            className="size-11 rounded-full"
          >
            {sortDirection === "asc" ? (
              <ArrowUpNarrowWide className="size-4" />
            ) : (
              <ArrowDownWideNarrow className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {anySelectable ? (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            id="roster-select-all"
            checked={selectAllState(selected, visibleSelectableIds)}
            disabled={visibleSelectableIds.length === 0}
            onCheckedChange={() =>
              setSelected((prev) => toggleAllVisible(prev, visibleSelectableIds))
            }
          />
          <label
            htmlFor="roster-select-all"
            className="cursor-pointer text-sm text-muted-foreground"
          >
            {tBulk("selectAll")}
          </label>
        </div>
      ) : null}

      <RosterBulkActions
        recipients={selectedRecipients}
        onClear={() => setSelected(new Set())}
      />

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
            // `typeof number` and not `!== null`: a row built before the field existed
            // carries `undefined`, and `Math.round(Math.min(1, undefined))` renders a
            // confident "NaN%" — a wrong number is worse than an em dash.
            const nutritionPct =
              typeof row.nutritionRatio7Days === "number" &&
              Number.isFinite(row.nutritionRatio7Days)
                ? Math.round(Math.min(1, Math.max(0, row.nutritionRatio7Days)) * 100)
                : null;
            const nutritionGood = (nutritionPct ?? 0) >= 70;
            // Had a phase, has none today. NOT the same as never having had one — this is
            // the one a coach has to act on, and it is invisible everywhere else.
            const nutritionExpired =
              !row.nutritionHasActivePlan && !row.nutritionNeverHadPlan;
            // #926 — the same predicate the client's own nutrition screen reads, so the
            // roster and the profile cannot disagree about who needs a conversation. It
            // is deliberately SEPARATE from `needsAttentionReasons` (three days of total
            // silence): a client training happily on a lapsed phase is not "at risk",
            // they are a client whose coach owes them a plan.
            const nutritionAttention = nutritionNeedsAttention({
              ratio7d:
                typeof row.nutritionRatio7Days === "number" &&
                Number.isFinite(row.nutritionRatio7Days)
                  ? row.nutritionRatio7Days
                  : null,
              hasActivePlan: row.nutritionHasActivePlan,
              neverHadPlan: row.nutritionNeverHadPlan,
            });
            const reasons = row.needsAttentionReasons.map(formatReason).join(", ");
            const attentionTitle = t("needsAttentionTitle", { reasons });
            const { short, medium, long } = row.goalsCount;
            const hasGoals = short + medium + long > 0;
            const href = row.pendingProvisioning
              ? `/gc-fitness/clients/pending/${encodeURIComponent(row.email)}`
              : `/gc-fitness/clients/${row.uid}`;

            const selectable = isBulkSelectable(row);
            return (
              <div key={row.uid} className="relative">
              {selectable ? (
                <Checkbox
                  checked={selected.has(row.uid)}
                  onCheckedChange={() => toggleOne(row.uid)}
                  aria-label={tBulk("selectClientAria", { name: row.displayName })}
                  className="absolute left-5 top-5 z-[1]"
                />
              ) : null}
              <Card
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
                  <div className={cn("flex items-start gap-3", anySelectable && "pl-7")}>
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
                        {row.needsAttentionReasons.map((reason) => (
                          <Badge
                            key={reason}
                            variant="outline"
                            data-testid="roster-attention-reason"
                            className="border-chart-4/40 text-chart-4"
                          >
                            {formatReason(reason)}
                          </Badge>
                        ))}
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

                  {/* Metrics row: adherencia + nutrición + esta semana */}
                  <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
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

                    {/* Nutrición (#923). Un coach con veinte clientes no entra a
                        veinte perfiles: si esto no está acá, no se mira.

                        Las tres formas de "no hay número" NO son la misma cosa y por eso
                        no comparten copy:
                          · nunca tuvo plan      → todavía no empezaron, nada que perseguir
                          · tuvo y no tiene      → SE LE VENCIÓ LA FASE y nadie cargó la
                            siguiente. Es el caso que este issue existe para detectar, y
                            el único que se pinta como alerta
                          · tiene plan, 0 pedido → la fase empieza mañana; no es un cero */}
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {tTable("nutrition")}
                      </p>
                      {nutritionPct !== null ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="text-lg font-semibold tabular-nums text-foreground">
                              {nutritionPct}%
                            </span>
                            {nutritionGood ? (
                              <TrendingUp className="size-4 text-chart-3" aria-hidden />
                            ) : (
                              <TrendingDown className="size-4 text-chart-4" aria-hidden />
                            )}
                          </div>
                          <ComplianceBar pct={nutritionPct} good={nutritionGood} />
                        </>
                      ) : (
                        <span className="text-lg font-semibold tabular-nums text-muted-foreground">
                          {tCommon("emDash")}
                        </span>
                      )}
                      {nutritionExpired ? (
                        <p
                          data-testid="roster-nutrition-expired"
                          className="text-xs font-medium text-chart-4"
                        >
                          {tTable("nutritionNoPlan")}
                        </p>
                      ) : nutritionAttention.reasons.includes("low-adherence") ? (
                        // A red arrow says the number is bad; it does not say to do
                        // anything. This is the line that names the action, in the same
                        // words the client's nutrition screen uses.
                        <p
                          data-testid="roster-nutrition-attention"
                          className="text-xs font-medium text-chart-4"
                        >
                          {tTable("nutritionNeedsTalk")}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {row.nutritionNeverHadPlan
                            ? tTable("nutritionNeverPlanned")
                            : nutritionPct === null
                              ? tTable("nutritionNothingAsked")
                              : null}
                        </p>
                      )}
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
                          {tTable("joined")}: {formatRosterDate(row.createdAt, locale, timezone)}
                        </>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
              </div>
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

// #747 — `timeZone` is explicit. Without it this rendered the UTC day on the
// server pass, so a client who joined at 21:30 in Buenos Aires was listed as
// having joined the NEXT day until hydration corrected it.
function formatRosterDate(iso: string | null, locale: string, timeZone: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", {
    dateStyle: "medium",
    timeZone,
  }).format(date);
}
