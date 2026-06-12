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
import { Eye, Copy, Pencil, Trash2 } from "lucide-react";
import type { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExercisePreviewThumb } from "@/components/gc-fitness/exercise-preview-thumb";
import type { ExerciseRow } from "@/lib/gc-fitness/exercises-listener";

// Difficulty level → semantic Badge variant per the redesign doc
// (beginner → success, intermediate → brand, expert/advanced → violet).
function levelBadgeVariant(
  level: string | null | undefined,
): "success" | "brand" | "violet" | "secondary" {
  const v = (level ?? "").toLowerCase();
  if (/(beginner|principiante)/.test(v)) return "success";
  if (/(intermediate|intermedio)/.test(v)) return "brand";
  if (/(expert|advanced|avanzado)/.test(v)) return "violet";
  return "secondary";
}

// Localized-ish display labels for FEXD difficulty levels. The catalog has no
// dedicated keys yet, so fall back to a humanized version of the raw value.
const LEVEL_LABELS: Record<string, string> = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  expert: "Avanzado",
  advanced: "Avanzado",
};

function previewSrc(
  row: Pick<ExerciseRow, "gifUrl" | "imageUrl" | "thumbnailURL">,
): string | null {
  return row.gifUrl ?? row.imageUrl ?? row.thumbnailURL ?? null;
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
          {row.original.tags?.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {row.original.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal">
                  {formatLabel(tag)}
                </Badge>
              ))}
              {row.original.tags.length > 2 ? (
                <Badge variant="secondary" className="font-normal">
                  +{row.original.tags.length - 2}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "category",
      header: t("category"),
      cell: ({ row }) => {
        // Prefer the FEXD `category`; fall back to the first muscle group so
        // legacy / trainer rows that predate the category enrichment still
        // show something meaningful in the column.
        const raw = row.original.category ?? row.original.muscleGroups[0] ?? null;
        if (!raw) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <Badge variant="brand" className="font-medium">
            {formatLabel(raw)}
          </Badge>
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
      id: "level",
      header: t("difficulty"),
      cell: ({ row }) => {
        const level = row.original.level;
        if (!level) {
          return <span className="text-muted-foreground">—</span>;
        }
        const label = LEVEL_LABELS[level.toLowerCase()] ?? formatLabel(level);
        return (
          <Badge variant={levelBadgeVariant(level)} className="font-medium">
            {label}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: t("actionsHeader"),
      cell: ({ row }) => {
        // Library exercises (wger + free-exercise-db) are read-only — they
        // canNOT be edited or deleted (the edit page redirects them to /view
        // and the Server Actions reject the write). They get View +
        // Duplicate-to-customize. Trainer-owned exercises get Edit + Delete.
        // NOTE: gating on `!== "trainer"` (not just `=== "wger"`) is the fix
        // for the free-exercise-db rows that used to show Edit and 404'd.
        const isLibrary = row.original.source !== "trainer";

        const buttons = isLibrary ? (
          // Library: read-only detail + Duplicate-to-customize.
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("view")}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlers.onView(row.original);
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("wgerReadOnlyTooltip")}</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("duplicate")}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                handlers.onDuplicate(row.original);
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </>
        ) : (
          // Trainer-owned: Edit + Delete as direct icon buttons.
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("edit")}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                handlers.onEdit(row.original);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("delete")}
              className="h-9 w-9 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handlers.onDelete(row.original);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        );

        return (
          <div className="flex items-center justify-end gap-1">{buttons}</div>
        );
      },
      enableSorting: false,
      size: 96,
    },
  ];
}
