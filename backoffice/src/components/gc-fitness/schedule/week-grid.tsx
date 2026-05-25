"use client";

// week-grid.tsx
//
// Per-client 7-day weekly schedule grid for the GC Fitness trainer surface
// (WTPL-05). Reads assignments via the `useAssignmentsForClientWeek` hook
// (Server-Action backed) and renders Monday-Sunday columns; each cell shows
// existing assignment chips + a `+ Assign template` button that opens the
// AssignTemplateModal.
//
// CIVIL-DATE CONTRACT (Pitfall 1):
//   - Every day-cell civil-date is computed via `civilDateFormat(date, "UTC")`
//     from civil-date.ts — NEVER via `toISOString().slice(0,10)` and NEVER
//     via `new Date(...).toLocaleDateString()`. The TS twin of CivilDate.swift
//     is the only path that's IANA-aware and DST-safe.
//   - The starting Monday is derived from `civilDateToday(trainerTimezone)`
//     rounded back to the previous Monday in civil-date space. Trainer
//     timezone defaults to "UTC" if the client doesn't pass one (the
//     /users/{uid}.timezone field from P04-06 will populate this for
//     real trainers).
//
// LAYOUT (matches 04-UI-SPEC §Surface B):
//   - Sticky header row: Mon | Tue | Wed | Thu | Fri | Sat | Sun.
//   - Each column shows: date label + assignment chips + `+ Assign` CTA.
//   - Today's column gets a `ring-2 ring-primary` highlight.
//   - Previous/Next-week navigation arrows above the grid.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { civilDateFormat, civilDateToday } from "@/lib/gc-fitness/civil-date";
import {
  useAssignmentsForClientWeek,
  assignmentsForClientWeekKey,
} from "@/lib/gc-fitness/workout-assignments-listener";

import { AssignTemplateModal } from "./assign-template-modal";
import { WorkoutAssignmentDeleteDialog } from "@/components/gc-fitness/workout-assignment-delete-dialog";

interface WeekGridProps {
  clientId: string;
  focusDate?: string | null;
  /**
   * IANA timezone for the trainer's "today" anchor. Falls back to "UTC"
   * — works correctly because the trainer surface only needs day-level
   * resolution, and UTC and the trainer's local zone agree on the civil
   * day for the vast majority of the day. (Hot-take fix path: populate
   * from /users/{trainerUid}.timezone on the server side once P04-06's
   * iOS timezone capture has run for the trainer's account, but the
   * trainer is typically using Vercel servers — UTC is a fine default.)
   */
  trainerTimezone?: string;
}
const WEEKDAY_LABELS_WORKOUT: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

function recurrenceLabel(recurrence: unknown): string | null {
  if (!recurrence || typeof recurrence !== "object") return null;
  const rule = recurrence as { kind?: unknown; weekday?: unknown; weekdays?: unknown; everyN?: unknown };
  if (rule.kind === "daily") return "Diario";
  if (rule.kind === "weekly") {
    const d = Number(rule.weekday);
    return Number.isFinite(d) && WEEKDAY_LABELS_WORKOUT[d] ? `Semanal · ${WEEKDAY_LABELS_WORKOUT[d]}` : "Semanal";
  }
  if (rule.kind === "weekly_days") {
    const days = Array.isArray(rule.weekdays)
      ? rule.weekdays.map((d) => WEEKDAY_LABELS_WORKOUT[Number(d)]).filter((v): v is string => Boolean(v))
      : [];
    return days.length > 0 ? `Semanal · ${days.join(", ")}` : "Semanal";
  }
  if (rule.kind === "every_n_days") return `Cada ${Math.max(1, Number(rule.everyN ?? 1))} días`;
  return null;
}

/**
 * Returns the civil-date string for the Monday of the week containing
 * `civilDate`. Pure civil-date arithmetic — never touches wall-clock
 * instants beyond the UTC-midnight construction used inside
 * `civilDateFormat("UTC")`.
 */
function mondayOfWeek(civilDate: string): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  // Construct at UTC midnight so the weekday computation is exact-day.
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  // JS getUTCDay: Sunday=0, Monday=1, ..., Saturday=6. We want
  // dayOffset such that subtracting it lands on Monday.
  const dayOfWeek = utcMidnight.getUTCDay();
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday → 6 days back
  const monday = new Date(utcMidnight.getTime() - offset * 86_400_000);
  return civilDateFormat(monday, "UTC");
}

/**
 * Returns the civil-date string `days` after `civilDate`. Pure civil-date
 * arithmetic via `civilDateFormat("UTC")` — see addCivilDays in
 * workout-assignment-actions.ts for the same trick.
 */
function addCivilDays(civilDate: string, days: number): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const shifted = new Date(utcMidnight + days * 86_400_000);
  return civilDateFormat(shifted, "UTC");
}

export function WeekGrid({ clientId, trainerTimezone = "UTC", focusDate }: WeekGridProps) {
  const t = useTranslations("schedule.weekGrid");
  const dayLabels: readonly string[] = [
    t("daysShort.mon"),
    t("daysShort.tue"),
    t("daysShort.wed"),
    t("daysShort.thu"),
    t("daysShort.fri"),
    t("daysShort.sat"),
    t("daysShort.sun"),
  ];
  const queryClient = useQueryClient();
  const todayCivil = civilDateToday(trainerTimezone);
  const initialMonday = mondayOfWeek(focusDate ?? todayCivil);

  const [weekStart, setWeekStart] = useState<string>(initialMonday);
  const [assignDate, setAssignDate] = useState<string | null>(null);
  // 260522-ki7 Task E — trash affordance state. Set when the trainer clicks the
  // Trash2 icon on an assignment card; cleared when the dialog closes.
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    scheduledFor: string;
    templateName: string;
    seriesId?: string | null;
  } | null>(null);

  const { data, isLoading, error } = useAssignmentsForClientWeek(
    clientId,
    weekStart,
  );

  const days = Array.from({ length: 7 }, (_, i) => addCivilDays(weekStart, i));

  function previousWeek() {
    setWeekStart(addCivilDays(weekStart, -7));
  }
  function nextWeek() {
    setWeekStart(addCivilDays(weekStart, 7));
  }

  function onAssigned() {
    // Re-fetch the current window so the new assignment chip appears.
    queryClient.invalidateQueries({
      queryKey: assignmentsForClientWeekKey(clientId, weekStart),
    });
    setAssignDate(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("weekOf", { date: weekStart })}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={previousWeek}
            aria-label={t("previousWeek")}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={nextWeek}
            aria-label={t("nextWeek")}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
        >
          {t("loadErrorPrefix")}{" "}
          {error instanceof Error ? error.message : t("loadErrorFallback")}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((civilDate, i) => {
          const isToday = civilDate === todayCivil;
          const dayAssignments = (data ?? []).filter(
            (a) => a.scheduledFor === civilDate,
          );
          return (
            <div
              key={civilDate}
              className={cn(
                "flex min-h-[8rem] flex-col gap-2 rounded-lg border bg-card p-3",
                isToday && "ring-2 ring-primary",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  {dayLabels[i]}
                </span>
                <span className="text-sm font-medium">{civilDate.slice(8)}</span>
              </div>

              {isLoading ? (
                <div className="text-xs text-muted-foreground">{t("loading")}</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {dayAssignments.map((a) => {
                    const snap = a.templateSnapshot as
                      | { name?: { en?: string; es?: string }; tag?: string }
                      | undefined;
                    const name = snap?.name?.en ?? t("untitledTemplate");
                    const recurrence = recurrenceLabel(a.recurrence);
                    return (
                      <li
                        key={a.id}
                        className="flex flex-col gap-0.5 rounded border bg-background p-1.5 text-xs"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="truncate font-medium">{name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({
                                id: a.id,
                                scheduledFor: a.scheduledFor,
                                templateName: name,
                                seriesId: a.seriesId ?? null,
                              });
                            }}
                            aria-label={t("removeWorkoutAria", { name })}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                        {snap?.tag ? (
                          <Badge variant="secondary" className="w-fit text-[10px]">
                            {snap.tag}
                          </Badge>
                        ) : null}
                        {recurrence ? (
                          <Badge variant="outline" className="w-fit text-[10px]">
                            {recurrence}
                          </Badge>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="mt-auto justify-start text-xs"
                onClick={() => setAssignDate(civilDate)}
              >
                <PlusIcon className="mr-1 h-3 w-3" />
                {t("assignTemplateCta")}
              </Button>
            </div>
          );
        })}
      </div>

      {assignDate ? (
        <AssignTemplateModal
          open={Boolean(assignDate)}
          onOpenChange={(open) => !open && setAssignDate(null)}
          clientId={clientId}
          defaultDate={assignDate}
          trainerTimezone={trainerTimezone}
          onAssigned={onAssigned}
        />
      ) : null}

      {/* 260522-ki7 Task E — recurring-aware delete dialog. Invalidates the */}
      {/* current week's React-Query window on success so the row disappears. */}
      {deleteTarget ? (
        <WorkoutAssignmentDeleteDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          assignmentId={deleteTarget.id}
          scheduledFor={deleteTarget.scheduledFor}
          templateName={deleteTarget.templateName}
          seriesId={deleteTarget.seriesId ?? null}
          onDeleted={() => {
            queryClient.invalidateQueries({
              queryKey: assignmentsForClientWeekKey(clientId, weekStart),
            });
            setDeleteTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
