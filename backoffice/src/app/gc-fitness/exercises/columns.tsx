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
import { MoreHorizontal, Eye, Copy, Edit, Trash2 } from "lucide-react";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExercisePreviewThumb } from "@/components/gc-fitness/exercise-preview-thumb";
import type { ExerciseRow } from "@/lib/gc-fitness/exercises-listener";

// Preview-source helpers — local duplicate of the picker pattern
// (`exercise-picker-popover.tsx`). Lifting to a shared module is out of
// scope for this plan to keep blast radius minimal.
function previewUrl(url?: string | null): string | null {
  if (typeof url === "string" && /^https?:\/\//.test(url)) return url;
  return null;
}

function previewSrc(
  row: Pick<ExerciseRow, "gifUrl" | "imageUrl" | "thumbnailURL">,
): string | null {
  return (
    previewUrl(row.gifUrl) ??
    previewUrl(row.imageUrl) ??
    previewUrl(row.thumbnailURL)
  );
}

// Retained for parity with the picker, but NOT the gate for `unoptimized`
// — see the cell below. The optimizer rewrites src to /_next/image which
// strips Firebase Storage v2 signed-URL query params (`?GoogleAccessId=…
// &Expires=…&Signature=…`) → runtime 403, regardless of whether the
// upstream is a GIF or a static JPG. All exercise preview URLs come from
// either signed Storage or wger CDN; none benefit from Next.js
// optimization, so `unoptimized` is unconditional.
function isGifUrl(url: string | null): boolean {
  return typeof url === "string" && /\.gif(\?|$)/i.test(url);
}
void isGifUrl;

export interface ExerciseColumnHandlers {
  onEdit: (row: ExerciseRow) => void;
  onView: (row: ExerciseRow) => void;
  onDuplicate: (row: ExerciseRow) => void;
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

type TFn = ReturnType<typeof useTranslations>;

export function makeColumns(
  handlers: ExerciseColumnHandlers,
  t: TFn,
): ColumnDef<ExerciseRow>[] {
  return [
    {
      id: "thumbnail",
      header: "",
      cell: ({ row }) => {
        // 260522-orr — render a real preview thumbnail when the Free-
        // Exercise-DB seed pipeline has provided gifUrl/imageUrl, falling
        // back to thumbnailURL, then to a Dumbbell icon. The 48×27 box is
        // locked from UI-SPEC.
        //
        // Uses the shared `ExercisePreviewThumb` (same as the picker) so a
        // 1s hover opens the enlarged preview popover, and clicks bubble
        // through to the row's view-on-click handler. `unoptimized` is
        // handled inside the component (signed-Storage URLs 403 through the
        // Next.js optimizer).
        return (
          <ExercisePreviewThumb
            src={previewSrc(row.original)}
            width={48}
            height={27}
          />
        );
      },
      enableSorting: false,
      size: 56,
    },
    {
      accessorKey: "name.en",
      header: t("name"),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{row.original.name.en || t("untitled")}</span>
            {row.original.metric === "time" ? (
              <Badge
                variant="outline"
                className="px-1.5 py-0 text-[10px]"
                title={t("metricTimeBadgeTitle")}
              >
                {"⏱"}
              </Badge>
            ) : null}
          </div>
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
      header: t("muscles"),
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
      header: t("equipment"),
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
      header: t("source"),
      cell: ({ row }) => {
        const isLibrary =
          row.original.source === "wger" ||
          row.original.source === "free-exercise-db";
        return (
          <div className="flex flex-wrap gap-1">
            <Badge variant={isLibrary ? "secondary" : "default"}>
              {row.original.source === "wger" ? t("sourceWger") : t("sourceCustom")}
            </Badge>
            <Badge variant="outline">
              {isLibrary ? t("ownershipLibrary") : t("ownershipMine")}
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "updatedAt",
      header: t("updated"),
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
        // Library exercises (wger + free-exercise-db) are read-only — they
        // canNOT be edited or deleted (the edit page redirects them to /view
        // and the Server Actions reject the write). They get View +
        // Duplicate-to-customize. Trainer-owned exercises get View + Edit +
        // Delete. NOTE: gating on `!== "trainer"` (not just `=== "wger"`) is
        // the fix for the free-exercise-db rows that used to show Edit and
        // 404'd on click.
        const isLibrary = row.original.source !== "trainer";

        const menu = (
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
              {isLibrary ? (
                // Library exercises are read-only: View (read-only detail) +
                // Duplicate-to-customize.
                <>
                  <DropdownMenuItem
                    onClick={() => handlers.onView(row.original)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    {t("view")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handlers.onDuplicate(row.original)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("duplicate")}
                  </DropdownMenuItem>
                </>
              ) : (
                // Trainer-owned: there's no separate read-only "view" — opening
                // your own exercise IS the editable form. Edit + Delete.
                <>
                  <DropdownMenuItem
                    onClick={() => handlers.onEdit(row.original)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    {t("edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handlers.onDelete(row.original)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );

        // Stop row-level click (view-on-click) from firing when the trainer
        // interacts with the actions menu.
        if (isLibrary) {
          // Tooltip explaining the Duplicate-to-customize path on the
          // read-only library rows.
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div onClick={(e) => e.stopPropagation()}>{menu}</div>
              </TooltipTrigger>
              <TooltipContent>{t("wgerReadOnlyTooltip")}</TooltipContent>
            </Tooltip>
          );
        }
        return <div onClick={(e) => e.stopPropagation()}>{menu}</div>;
      },
      enableSorting: false,
      size: 56,
    },
  ];
}
