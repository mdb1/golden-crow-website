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

/**
 * Human-readable label for an attention reason string. Centralizing the
 * mapping here keeps it in lockstep with the Pitfall-7-locked union in
 * `client-attention.ts` — adding a new reason means updating the union
 * + the Jest cases + this mapping (3-line checklist).
 */
function formatReason(reason: AttentionReason): string {
  switch (reason) {
    case "missed-workouts":
      return "Missed workouts";
    case "low-compliance":
      return "Low habit compliance";
  }
}

export interface RosterTableProps {
  rows: ClientRosterRow[];
  trainerUid: string;
}

export function RosterTable({ rows }: RosterTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "lastActivityAt", desc: true },
  ]);
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

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
        header: "Name",
        cell: ({ row }) => {
          const reasons = row.original.needsAttentionReasons;
          const reasonText = reasons.map(formatReason).join(", ");
          return (
            <span className="flex items-center gap-1.5">
              <span className="font-medium">{row.original.displayName}</span>
              {row.original.needsAttention ? (
                <span
                  title={`Needs attention: ${reasonText}`}
                  aria-label={`Needs attention: ${reasonText}`}
                  className="inline-flex"
                >
                  <AlertCircle className="size-4 text-destructive" />
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        accessorKey: "lastActivityAt",
        header: "Last activity",
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
        header: "This week",
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
        header: "Unread",
        cell: ({ row }) =>
          row.original.unreadChatCount > 0 ? (
            <Badge variant="default">{row.original.unreadChatCount}</Badge>
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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
          Needs attention ({needsAttentionCount})
        </Button>
        {needsAttentionOnly ? (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setNeedsAttentionOnly(false)}
          >
            Clear filter
          </button>
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
                No clients in your roster yet.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() =>
                  router.push(`/gc-fitness/clients/${row.original.uid}`)
                }
                className="cursor-pointer hover:bg-muted/50"
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
