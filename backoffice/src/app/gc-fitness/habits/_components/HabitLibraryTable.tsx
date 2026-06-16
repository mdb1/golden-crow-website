"use client";

// HabitLibraryTable.tsx
//
// Read-only view of the trainer's reusable habit LIBRARY (global + own
// templates) — the habit definitions WITHOUT any per-client assignment. Shares
// the same pills/recurrence rendering as the assignments table (habit-pills).
//
// Columns: a small habit photo/thumbnail (when the template has one), the name
// (+ ES subtitle), and the scope (Global / Mine). The "Reminder" column is
// intentionally absent — reminders are a per-ASSIGNMENT concern, not a library
// /template one (backlog B2).

import { ImageIcon } from "lucide-react";
import { useLocale, type useTranslations } from "next-intl";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StorageImagePreview } from "@/components/gc-fitness/StorageImagePreview";
import { FavoriteStarButton } from "@/components/gc-fitness/favorite-star-button";
import type { HabitTemplateRow } from "@/lib/gc-fitness/habit-actions";
import { localizedNamePair } from "@/lib/gc-fitness/localized-name";
import { ScopePill } from "./habit-pills";

type TFn = ReturnType<typeof useTranslations>;

const THUMB_CLASS = "size-11 max-h-none rounded-lg object-cover";

function HabitThumb({ photoUrl }: { photoUrl?: string }) {
  if (photoUrl && photoUrl.trim().length > 0) {
    return <StorageImagePreview value={photoUrl} className={THUMB_CLASS} />;
  }
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
      <ImageIcon className="size-4" aria-hidden="true" />
    </span>
  );
}

export function HabitLibraryTable({
  templates,
  isLoading,
  t,
  emptyText,
  loadingText,
  onRowClick,
}: {
  templates: HabitTemplateRow[];
  isLoading: boolean;
  t: TFn;
  emptyText: string;
  loadingText: string;
  onRowClick: (template: HabitTemplateRow) => void;
}) {
  const locale = useLocale();
  return (
    <div className="min-w-0 overflow-x-auto rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-16">
              <span className="sr-only">{t("photo")}</span>
            </TableHead>
            {[t("name"), t("scope")].map((h, i) => (
              <TableHead
                key={i}
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-24 text-center text-muted-foreground"
              >
                {loadingText}
              </TableCell>
            </TableRow>
          ) : templates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-32 text-center">
                <p className="text-sm text-muted-foreground">{emptyText}</p>
              </TableCell>
            </TableRow>
          ) : (
            templates.map((tpl) => {
              const { primary, secondary } = localizedNamePair(
                tpl.name,
                locale,
              );
              const isGlobal = tpl.scope === "global";
              return (
                <TableRow
                  key={tpl.id}
                  onClick={() => onRowClick(tpl)}
                  className="cursor-pointer"
                >
                  <TableCell className="py-2">
                    <FavoriteStarButton kind="habitTemplate" id={tpl.id} />
                  </TableCell>
                  <TableCell className="py-2">
                    <HabitThumb photoUrl={tpl.photoUrl} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <span className="font-medium">
                        {primary || t("untitled")}
                      </span>
                      {/* Recurrence is intentionally NOT shown here: it's a
                          per-assignment property, not a library/template one. */}
                      {secondary ? (
                        <span className="text-xs text-muted-foreground">
                          {secondary}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ScopePill isGlobal={isGlobal} t={t} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
