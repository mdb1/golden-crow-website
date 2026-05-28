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

import Image from "next/image";
import type { ColumnDef } from "@tanstack/react-table";
import { Dumbbell, MoreHorizontal, Edit, Trash2 } from "lucide-react";
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
        // back to thumbnailURL, then to the lucide Dumbbell icon. The
        // 48×27 box is locked from UI-SPEC.
        //
        // `unoptimized={!!src}` is INTENTIONAL and load-bearing:
        // storage.googleapis.com v2 signed URLs have
        // `?GoogleAccessId=…&Expires=…&Signature=…` query params that the
        // Next.js image optimizer strips when it rewrites src to
        // /_next/image, producing runtime 403. All exercise preview URLs
        // come from either signed Storage or wger CDN; none benefit from
        // the optimizer.
        const src = previewSrc(row.original);
        return (
          <div
            aria-hidden="true"
            className="flex h-[27px] w-[48px] items-center justify-center overflow-hidden rounded-sm border border-border bg-muted/40 text-muted-foreground"
          >
            {src ? (
              <Image
                src={src}
                alt=""
                width={48}
                height={27}
                unoptimized={!!src}
                className="h-[27px] w-[48px] rounded-sm object-cover"
              />
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
      header: t("name"),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{row.original.name.en || t("untitled")}</span>
            {/* TODO(26-07): replace title="Ejercicio por tiempo" with t("metricTimeBadgeTitle") */}
            {row.original.metric === "time" ? (
              <Badge
                variant="outline"
                className="px-1.5 py-0 text-[10px]"
                title="Ejercicio por tiempo"
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
        const isWger = row.original.source === "wger";

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
              {isWger ? (
                <DropdownMenuItem onClick={() => handlers.onView(row.original)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t("view")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => handlers.onEdit(row.original)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t("edit")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={isWger}
                onClick={() => handlers.onDelete(row.original)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
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
                {t("wgerReadOnlyTooltip")}
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
