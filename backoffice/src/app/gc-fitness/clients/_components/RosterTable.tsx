"use client";

// RosterTable.tsx — interactive client roster table (P11-05 base, P11-06 filter chip).
//
// TanStack Table v8 over `ClientRosterRow[]` shipped from the Server
// Component shell (`page.tsx`). Default sort is `lastActivityAt DESC`;
// nulls go last via a custom `sortingFn`. Row click navigates to the
// per-client deep view at `/gc-fitness/clients/[id]` (implemented by 11-07).
//
// 11-06 extensions:
//   - "Needs attention (N)" toggle pill toolbar above the table.
//   - Per-row AlertCircle icon next to the name when `needsAttention === true`,
//     with a tooltip listing the firing reason strings.
//   - The pill count = number of rows where `needsAttention === true` in
//     the FULL row set (not the filtered set), so toggling the filter
//     doesn't change the chip's count.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

import type { ClientRosterRow } from "@/lib/gc-fitness/client-roster";
import type { AttentionReason } from "@/lib/gc-fitness/client-attention";
import { RelativeTime } from "./RelativeTime";
import { RosterEmptyState } from "./RosterEmptyState";

export interface RosterTableProps {
  rows: ClientRosterRow[];
  trainerUid: string;
}

export function RosterTable({ rows }: RosterTableProps) {
  const router = useRouter();
  const t = useTranslations("clients");
  const tTable = useTranslations("clients.table");
  const tCommon = useTranslations("common");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "lastActivityAt", desc: true },
  ]);
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

  // Locale-aware label for an attention reason string. Kept in lockstep with
  // the Pitfall-7-locked union in `client-attention.ts` — adding a new
  // reason means updating the union + the Jest cases + this mapping +
  // BOTH messages/{locale}.json catalogs.
  function formatReason(reason: AttentionReason): string {
    switch (reason) {
      case "missed-workouts":
        return t("missedWorkouts");
      case "low-compliance":
        return t("lowCompliance");
    }
  }

  // Computed against the FULL set so toggling the filter doesn't change
  // the chip's count.
  const needsAttentionCount = useMemo(
    () => rows.filter((r) => r.needsAttention).length,
    [rows],
  );

  const filteredRows = useMemo(
    () => (needsAttentionOnly ? rows.filter((r) => r.needsAttention) : rows),
    [rows, needsAttentionOnly],
  );

  const columns = useMemo<ColumnDef<ClientRosterRow>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: tTable("name"),
        cell: ({ row }) => {
          const reasons = row.original.needsAttentionReasons;
          const reasonText = reasons.map(formatReason).join(", ");
          const title = t("needsAttentionTitle", { reasons: reasonText });
          return (
            <div className="flex items-center gap-2">
              <span className="font-medium">{row.original.displayName}</span>
              {row.original.pendingProvisioning ? (
                <Badge variant="secondary">{tCommon("pendingSignIn")}</Badge>
              ) : null}
              {row.original.needsAttention ? (
                <span
                  title={title}
                  aria-label={title}
                  className="inline-flex"
                >
                  <AlertCircle className="size-4 text-destructive" />
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "source",
        header: tTable("status"),
        cell: ({ row }) =>
          row.original.pendingProvisioning ? (
            <Badge variant="secondary">{tCommon("pendingSignIn")}</Badge>
          ) : (
            <Badge variant="default">{tCommon("active")}</Badge>
          ),
      },
      {
        accessorKey: "lastActivityAt",
        header: tTable("lastActivity"),
        cell: ({ row }) => <RelativeTime iso={row.original.lastActivityAt} />,
        // Custom sort: ISO-8601 strings sort lexicographically; nulls go last.
        sortingFn: (a, b) => {
          const av = a.original.lastActivityAt;
          const bv = b.original.lastActivityAt;
          if (av && bv) return av.localeCompare(bv);
          if (av) return 1; // null b → b is "smaller" so b comes first under DESC
          if (bv) return -1;
          return 0;
        },
      },
      {
        accessorKey: "thisWeekComplianceRatio",
        header: tTable("thisWeek"),
        cell: ({ row }) => {
          const pct = Math.round(
            Math.max(0, Math.min(1, row.original.thisWeekComplianceRatio)) *
              100,
          );
          return (
            <div className="flex items-center gap-2">
              <Progress value={pct} className="h-2 w-20" />
              <span className="tabular-nums text-sm">{pct}%</span>
            </div>
          );
        },
      },
      {
        accessorKey: "unreadChatCount",
        header: tTable("unread"),
        cell: ({ row }) =>
          row.original.unreadChatCount > 0 ? (
            <Badge variant="default">{row.original.unreadChatCount}</Badge>
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      },
    ],
    // formatReason closes over `t`; tTable/tCommon are used directly in cells.
    // Re-memoize when any translator changes (e.g., locale switch via refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tTable, tCommon],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // 12-04 — short-circuit to the designed empty state when no clients
  // are assigned at all. Placed AFTER all hook calls so the rules-of-hooks
  // are honored (the hook count is identical across renders regardless
  // of whether rows is empty or populated).
  if (rows.length === 0) {
    return <RosterEmptyState />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={needsAttentionOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setNeedsAttentionOnly((v) => !v)}
          className="gap-1.5"
          aria-pressed={needsAttentionOnly}
        >
          <AlertCircle className="size-4" />
          At-risk clients ({needsAttentionCount})
        </Button>
        {needsAttentionOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNeedsAttentionOnly(false)}
          >
            {tCommon("clearFilter")}
          </Button>
        ) : null}
      </div>
      <div className="rounded-md border bg-card">
        <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const indicator =
                  sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : "";
                return (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="cursor-pointer select-none"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    {indicator}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-muted-foreground"
              >
                {tTable("noClientsRow")}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => {
                  if (row.original.pendingProvisioning) {
                    router.push(
                      `/gc-fitness/clients/pending/${encodeURIComponent(row.original.email)}`,
                    );
                    return;
                  }
                  router.push(`/gc-fitness/clients/${row.original.uid}`);
                }}
                // hover:bg-accent uses the brand-blue tint (`--accent`) and
                // is clearly perceptible in light mode vs. the previous
                // bg-muted/50 which was ~50% of a near-white token.
                className="cursor-pointer transition-colors hover:bg-accent"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        </Table>
      </div>
    </div>
  );
}
