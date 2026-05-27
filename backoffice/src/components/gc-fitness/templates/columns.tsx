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
  AlertCircle,
  ArrowUpDown,
  MoreHorizontal,
  Edit,
  Pencil,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { WorkoutTemplateRow } from "@/lib/gc-fitness/workout-template-actions";

// List-only extension of WorkoutTemplateRow: the templates client merges in
// virtual rows backed by the `gc-fitness:template-draft:new` localStorage
// entry. Drafts are not assignable / duplicatable / deletable — only "resume"
// is offered. Real Firestore rows never set `__isDraft`.
export type TemplateListRow = WorkoutTemplateRow & { __isDraft?: boolean };

export interface TemplateColumnHandlers {
  onEdit: (row: WorkoutTemplateRow) => void;
  onDelete: (row: WorkoutTemplateRow) => void;
  // P21 — duplicate ANY trainer-owned template (not just standard forks).
  onDuplicate: (row: WorkoutTemplateRow) => void;
  // Draft-only — opens the new-template page so the form restores from
  // localStorage. No-op when there is no draft (the list won't surface a
  // resume action for non-draft rows).
  onResumeDraft: () => void;
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
): ColumnDef<TemplateListRow>[] {
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
        <div className="flex items-center gap-2">
          {row.original.__isDraft ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    aria-label={t("draftBadgeTooltip")}
                    className="inline-flex shrink-0"
                  >
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("draftBadgeTooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <div className="flex flex-col">
            <span className="font-medium">
              {row.original.name.en
                || (row.original.__isDraft ? t("draftUntitled") : t("untitled"))}
            </span>
            {row.original.name.es && (
              <span className="text-xs text-muted-foreground">
                {row.original.name.es}
              </span>
            )}
          </div>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "tag",
      header: t("tag"),
      cell: ({ row }) => {
        // Prefer the canonical `tags[]` list; fall back to the legacy
        // single `tag` field for rows authored before multi-tag landed.
        const rowTags =
          row.original.tags && row.original.tags.length > 0
            ? row.original.tags
            : row.original.tag
              ? [row.original.tag]
              : [];
        const standardPrefix = row.original.isStandard ? "Standard" : null;
        const labelFor = (raw: string) => TAG_LABELS[raw] ?? raw;
        return (
          <div className="flex flex-wrap gap-1">
            {standardPrefix ? (
              <Badge variant="outline" className="capitalize">
                {standardPrefix}
              </Badge>
            ) : null}
            {rowTags.map((raw) => (
              <Badge key={raw} variant="secondary" className="capitalize">
                {labelFor(raw)}
              </Badge>
            ))}
          </div>
        );
      },
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
      // Drafts have no updatedAt; give them a sentinel that sorts ABOVE all
      // real templates in DESC order so they surface at the top of the list.
      accessorFn: (row) => (row.__isDraft ? "￿" : (row.updatedAt ?? "")),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.__isDraft
            ? t("draftPendingLabel")
            : formatRelative(row.original.updatedAt)}
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
            {row.original.__isDraft ? (
              <DropdownMenuItem onClick={() => handlers.onResumeDraft()}>
                <Pencil className="mr-2 h-4 w-4" />
                {t("draftResumeCta")}
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => handlers.onEdit(row.original)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {row.original.isStandard ? t("duplicate") : t("edit")}
                </DropdownMenuItem>
                {!row.original.isStandard ? (
                  <>
                    <DropdownMenuItem onClick={() => handlers.onDuplicate(row.original)}>
                      <Edit className="mr-2 h-4 w-4" />
                      {t("duplicate")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handlers.onDelete(row.original)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("delete")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      size: 56,
    },
  ];
}
