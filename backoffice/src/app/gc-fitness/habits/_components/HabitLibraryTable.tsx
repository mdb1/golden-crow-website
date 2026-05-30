"use client";

// HabitLibraryTable.tsx
//
// Read-only view of the trainer's reusable habit LIBRARY (global + own
// templates) — the habit definitions WITHOUT any per-client assignment. Shares
// the same pills/recurrence rendering as the assignments table (habit-pills).

import type { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HabitTemplateRow } from "@/lib/gc-fitness/habit-actions";
import {
  GoalPill,
  HabitTypePill,
  PILL_BASE,
  ReminderCell,
  TONE,
} from "./habit-pills";

type TFn = ReturnType<typeof useTranslations>;

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
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {[t("name"), t("type"), t("reminder"), t("scope")].map((h, i) => (
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
              const showEs =
                tpl.name.es && tpl.name.es !== tpl.name.en ? tpl.name.es : null;
              const isGlobal = tpl.scope === "global";
              return (
                <TableRow
                  key={tpl.id}
                  onClick={() => onRowClick(tpl)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <span className="font-medium">
                        {tpl.name.en || tpl.name.es || t("untitled")}
                      </span>
                      {/* Recurrence is intentionally NOT shown here: it's a
                          per-assignment property, not a library/template one.
                          Only the goal (numeric) is intrinsic to the template. */}
                      <GoalPill
                        type={tpl.type}
                        targetValue={tpl.targetValue}
                        unit={tpl.unit}
                        t={t}
                      />
                      {showEs ? (
                        <span className="text-xs text-muted-foreground">
                          {showEs}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <HabitTypePill type={tpl.type} t={t} />
                  </TableCell>
                  <TableCell>
                    <ReminderCell
                      reminderEnabled={tpl.reminderEnabled}
                      reminderTime={tpl.reminderTime}
                    />
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        PILL_BASE,
                        isGlobal ? TONE.sky : TONE.violet,
                      )}
                    >
                      {isGlobal ? t("scopeGlobal") : t("scopeMine")}
                    </span>
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
