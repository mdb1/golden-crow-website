"use client";

// templates/columns.tsx
//
// TanStack Table column defs for the trainer Workout Template list view.
// Columns (in order):
//
//   1. Name (EN primary, ES subtitle) — sortable
//   2. Tag — Badge (push/pull/legs/full-body/upper/lower/custom)
//   3. Exercise count
//   4. Updated — relative time via Intl.RelativeTimeFormat — sortable
//   5. Actions — DropdownMenu (Edit + Delete)
//
// Sortable columns use `column.toggleSorting(column.getIsSorted() === "asc")`
// per RESEARCH §Pattern 6. Per-row handlers (`onEdit`, `onDelete`) are
// injected via the props to keep the column-defs file free of router /
// state imports — mirrors the P03-06 `columns.tsx` style.

import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  MoreHorizontal,
  Edit,
  Trash2,
} from "lucide-react";
import type { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { WorkoutTemplateRow } from "@/lib/gc-fitness/workout-template-actions";
export interface TemplateColumnHandlers {
  onEdit: (row: WorkoutTemplateRow) => void;
  onDelete: (row: WorkoutTemplateRow) => void;
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

// Tag → Badge variant + label. We use a stable mapping so the visual
// language matches the iOS app's Tag rendering when that lands.
const TAG_LABELS: Record<string, string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  upper: "Upper",
  lower: "Lower",
  "full-body": "Full body",
  custom: "Custom",
};

type TFn = ReturnType<typeof useTranslations>;

export function makeTemplateColumns(
  handlers: TemplateColumnHandlers,
  t: TFn,
): ColumnDef<WorkoutTemplateRow>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <button
          type="button"
          onClick={() =>
            column.toggleSorting(column.getIsSorted() === "asc")
          }
          className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {t("name")}
          <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      // Sort by EN name (stable across language); secondary fallback is ES.
      accessorFn: (row) => row.name.en || row.name.es || "",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {row.original.name.en || t("untitled")}
          </span>
          {row.original.name.es && (
            <span className="text-xs text-muted-foreground">
              {row.original.name.es}
            </span>
          )}
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "tag",
      header: t("tag"),
      cell: ({ row }) => (
        <Badge variant="secondary" className="capitalize">
          {(row.original.isStandard ? "Standard · " : "") +
            (TAG_LABELS[row.original.tag] ?? row.original.tag)}
        </Badge>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "exerciseCount",
      header: t("exercises"),
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.exerciseCount}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <button
          type="button"
          onClick={() =>
            column.toggleSorting(column.getIsSorted() === "asc")
          }
          className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {t("updated")}
          <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      // Sort by raw ISO string — lexicographic order matches chronological
      // order for ISO 8601, so no Date allocation needed per row compare.
      accessorFn: (row) => row.updatedAt ?? "",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatRelative(row.original.updatedAt)}
        </span>
      ),
      enableSorting: true,
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
              aria-label={t("actionsAria")}
              className="h-8 w-8"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handlers.onEdit(row.original)}>
              <Edit className="mr-2 h-4 w-4" />
              {row.original.isStandard ? t("duplicate") : t("edit")}
            </DropdownMenuItem>
            {!row.original.isStandard ? (
              <DropdownMenuItem
                onClick={() => handlers.onDelete(row.original)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      size: 56,
    },
  ];
}
