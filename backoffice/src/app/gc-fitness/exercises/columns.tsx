"use client";

// columns.tsx
//
// TanStack Table column defs for the trainer Exercise list view. Columns
// (in order):
//
//   1. Thumbnail (48×27, 16:9; SF-Symbol-equivalent lucide fallback)
//   2. Name (EN)
//   3. Muscles (badges, +N overflow)
//   4. Equipment (badges, +N overflow)
//   5. Source ("wger" muted / "Custom" primary — UI-SPEC convention)
//   6. Updated (relative time via Intl.RelativeTimeFormat)
//   7. Actions (DropdownMenu — Edit + Delete; disabled on wger rows)
//
// Actions are passed in via props from `client.tsx` so the column-def file
// stays free of router / state imports.

import type { ColumnDef } from "@tanstack/react-table";
import { Dumbbell, MoreHorizontal, Edit, Trash2 } from "lucide-react";

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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ExerciseRow } from "@/lib/gc-fitness/exercises-listener";

export interface ExerciseColumnHandlers {
  onEdit: (row: ExerciseRow) => void;
  onView: (row: ExerciseRow) => void;
  onDelete: (row: ExerciseRow) => void;
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

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

export function makeColumns(
  handlers: ExerciseColumnHandlers,
): ColumnDef<ExerciseRow>[] {
  return [
    {
      id: "thumbnail",
      header: "",
      cell: ({ row }) => {
        // We render a lucide Dumbbell as the fallback; the actual MP4
        // thumbnail (PNG first-frame from a future Cloud Function) lives
        // at `row.original.thumbnailURL` once 03-10 ships. The 48×27 box
        // is locked from UI-SPEC.
        const thumb = row.original.thumbnailURL;
        return (
          <div
            aria-hidden="true"
            className="flex h-[27px] w-[48px] items-center justify-center rounded-sm border border-border bg-muted/40 text-muted-foreground"
          >
            {thumb ? (
              // No <img/> render this phase — we don't resolve gs:// to
              // https on the list view (cost: every row would mint a
              // download URL on each render). Show the icon and defer to
              // the detail / view route for the actual playback.
              <Dumbbell className="h-4 w-4" />
            ) : (
              <Dumbbell className="h-4 w-4" />
            )}
          </div>
        );
      },
      enableSorting: false,
      size: 56,
    },
    {
      accessorKey: "name.en",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name.en || "(untitled)"}</span>
          {row.original.name.es && (
            <span className="text-xs text-muted-foreground">
              {row.original.name.es}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "muscleGroups",
      header: "Muscles",
      cell: ({ row }) => {
        const groups = row.original.muscleGroups;
        const visible = groups.slice(0, 3);
        const overflow = groups.length - visible.length;
        return (
          <div className="flex flex-wrap gap-1">
            {visible.map((m) => (
              <Badge key={m} variant="secondary" className="font-normal">
                {formatLabel(m)}
              </Badge>
            ))}
            {overflow > 0 && (
              <Badge variant="outline" className="font-normal">
                +{overflow}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "equipment",
      header: "Equipment",
      cell: ({ row }) => {
        const items = row.original.equipment;
        const visible = items.slice(0, 2);
        const overflow = items.length - visible.length;
        return (
          <div className="flex flex-wrap gap-1">
            {visible.map((e) => (
              <Badge key={e} variant="outline" className="font-normal">
                {formatLabel(e)}
              </Badge>
            ))}
            {overflow > 0 && (
              <Badge variant="outline" className="font-normal">
                +{overflow}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => (
        <Badge
          variant={row.original.source === "wger" ? "secondary" : "default"}
        >
          {row.original.source === "wger" ? "wger" : "Custom"}
        </Badge>
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
      cell: ({ row }) => {
        const isWger = row.original.source === "wger";

        const menu = (
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
              {isWger ? (
                <DropdownMenuItem onClick={() => handlers.onView(row.original)}>
                  <Edit className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => handlers.onEdit(row.original)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={isWger}
                onClick={() => handlers.onDelete(row.original)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );

        if (isWger) {
          // UI-SPEC: disabled Delete affordance + tooltip explaining the
          // Duplicate-to-customize path.
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>{menu}</div>
              </TooltipTrigger>
              <TooltipContent>
                wger exercises are read-only. Duplicate to customize.
              </TooltipContent>
            </Tooltip>
          );
        }
        return menu;
      },
      enableSorting: false,
      size: 56,
    },
  ];
}
