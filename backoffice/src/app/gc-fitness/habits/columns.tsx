"use client";

// columns.tsx
//
// TanStack Table column defs for the trainer Habits list view. Columns
// (in order):
//
//   1. Client (resolved displayName via a clientId→displayName map prop)
//   2. Type (badge — binary / multi-choice / numeric / weight)
//   3. Name (EN, ES subtitle)
//   4. Reminder (HH:mm if enabled, otherwise em-dash)
//   5. Updated (relative time via Intl.RelativeTimeFormat)
//   6. Actions (DropdownMenu — Edit + Delete)
//
// Handlers are passed in via props from `client.tsx` so this file stays
// free of router / state imports. Same pattern as `exercises/columns.tsx`.

import type { ColumnDef } from "@tanstack/react-table";
import { Edit, MoreHorizontal, Trash2, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { HabitRow } from "@/lib/gc-fitness/habit-actions";
import type { HabitType } from "@/lib/gc-fitness/habit-schema";

export interface HabitColumnHandlers {
  onEdit: (row: HabitRow) => void;
  onView: (row: HabitRow) => void;
  onDelete: (row: HabitRow) => void;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = then - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, "day");
  const diffMon = Math.round(diffDay / 30);
  if (Math.abs(diffMon) < 12) return rtf.format(diffMon, "month");
  const diffYr = Math.round(diffMon / 12);
  return rtf.format(diffYr, "year");
}

const TYPE_LABELS: Record<HabitType, string> = {
  binary: "Yes/No",
  "multi-choice": "Choice",
  numeric: "Numeric",
  weight: "Weight",
};

export function makeHabitColumns(
  handlers: HabitColumnHandlers,
  clientNameMap: Map<string, string>,
): ColumnDef<HabitRow>[] {
  return [
    {
      accessorKey: "clientId",
      header: "Client",
      cell: ({ row }) => (
        <span className="font-medium">
          {clientNameMap.get(row.original.clientId) ?? row.original.clientId}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="secondary" className="font-normal">
          {TYPE_LABELS[row.original.type] ?? row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: "name.en",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {row.original.name.en || "(untitled)"}
          </span>
          {row.original.name.es && (
            <span className="text-xs text-muted-foreground">
              {row.original.name.es}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "reminder",
      header: "Reminder",
      cell: ({ row }) =>
        row.original.reminderEnabled && row.original.reminderTime ? (
          <span className="font-mono text-sm">
            {row.original.reminderTime}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatRelative(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actions"
              className="h-8 w-8"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handlers.onView(row.original)}>
              <Eye className="mr-2 h-4 w-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handlers.onEdit(row.original)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handlers.onDelete(row.original)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      size: 56,
    },
  ];
}
