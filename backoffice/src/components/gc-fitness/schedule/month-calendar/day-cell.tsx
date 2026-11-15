"use client";

// One day of the MONTH grid (#507 — split out of month-calendar.tsx): the
// day number + birthday badge, the workout chips grouped per client and the
// habit chips, with drag-to-move and the "+" add popover.

import { useTranslations } from "next-intl";
import { ArrowRightLeft, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonthHabitChip, MonthWorkoutChip } from "@/lib/gc-fitness/schedule-month-actions";
import { ClientOwnedBadge, HabitChip, InheritedBadge } from "../habit-chip";

import { type ClientLite, formatMovedFromLabel } from "@/lib/gc-fitness/month-calendar-model";
import { paletteFor, workoutChipClass } from "./palette";
import { AddPopover, inlineWorkoutSummary, StatusDogear, workoutSummaryLabel } from "./chip-parts";

export interface DayCellProps {
  civil: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  birthdayBadge: string;
  birthdayNames: Array<{ name: string; age: number | null }>;
  locale: string;
  workouts: MonthWorkoutChip[];
  habits: MonthHabitChip[];
  clients: ClientLite[];
  clientColorOrder: string[];
  showWorkouts: boolean;
  showHabits: boolean;
  cellMinHClass: string;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStartChip: (chip: MonthWorkoutChip) => void;
  onDragEndChip: () => void;
  onClickChip: (chip: MonthWorkoutChip) => void;
  onClickHabit: (habit: MonthHabitChip) => void;
  onClickAdd: (kind: "workout" | "habit") => void;
}

export function DayCell({
  civil,
  dayNumber,
  inMonth,
  isToday,
  birthdayBadge,
  birthdayNames,
  locale,
  workouts,
  habits,
  clients,
  clientColorOrder,
  showWorkouts,
  showHabits,
  cellMinHClass,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStartChip,
  onDragEndChip,
  onClickChip,
  onClickHabit,
  onClickAdd,
}: DayCellProps) {
  // Issue #449 — chip tooltip suffix for client self-assigned workouts.
  const t = useTranslations("schedule.calendar");
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-card p-2.5 transition-colors",
        cellMinHClass,
        !inMonth && "bg-muted/20 opacity-60",
        // ring-inset so the today highlight draws INSIDE the rounded card —
        // an outset ring-2 gets clipped/doubled by the column/scroll container
        // (esp. in the tall week / 3-day columns on mobile).
        isToday && "bg-primary/10 ring-2 ring-inset ring-primary/40",
        isDragOver && "border-primary bg-primary/5",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "text-xs font-semibold",
            isToday ? "text-primary" : "text-muted-foreground",
          )}
        >
          {dayNumber}
        </span>
        <AddPopover
          civil={civil}
          onPick={onClickAdd}
          showWorkouts={showWorkouts}
          showHabits={showHabits}
        />
      </div>

      {birthdayNames.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {birthdayNames.map(({ name, age }) => (
            <span
              key={name}
              className="inline-flex items-center rounded-full border border-highlight/30 bg-highlight/10 px-2 py-0.5 text-[10px] font-medium text-highlight"
            >
              🎂 {birthdayBadge}: {name}
              {age != null ? ` · ${age} ${locale === "es" ? "años" : "years"}` : ""}
            </span>
          ))}
        </div>
      ) : null}

      <div className="min-w-0 flex flex-1 flex-col gap-3.5">
        {(() => {
          // Group everything by client so each day reads as
          // "‹client header› → their workouts + habits". The header carries
          // the client color; the cards no longer repeat the name.
          const groups = new Map<
            string,
            { workouts: MonthWorkoutChip[]; habits: MonthHabitChip[] }
          >();
          const ensure = (id: string) => {
            let g = groups.get(id);
            if (!g) {
              g = { workouts: [], habits: [] };
              groups.set(id, g);
            }
            return g;
          };
          for (const w of workouts) ensure(w.clientId).workouts.push(w);
          for (const h of habits) ensure(h.clientId).habits.push(h);
          const orderedIds = [
            ...clients.map((c) => c.uid).filter((id) => groups.has(id)),
            ...Array.from(groups.keys()).filter(
              (id) => !clients.some((c) => c.uid === id),
            ),
          ];

          return orderedIds.map((clientId, gi) => {
            const group = groups.get(clientId)!;
            const palette = paletteFor(clientId, clientColorOrder);
            const client = clients.find((c) => c.uid === clientId);
            return (
              <div
                key={clientId}
                className={cn(
                  "min-w-0 flex flex-col gap-1.5",
                  gi > 0 && "border-t border-border/60 pt-3.5",
                )}
              >
                <span
                  className={cn(
                    "mb-0.5 max-w-full truncate text-[11px] font-bold uppercase tracking-wider",
                    palette.text,
                  )}
                >
                  {client?.displayName ?? clientId}
                </span>

                {group.workouts.map((w) => {
                  const movedFromLabel = w.originallyScheduledFor
                    ? formatMovedFromLabel(w.originallyScheduledFor, w.scheduledFor)
                    : null;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      // Issue #449 — self-assigned chips are NOT draggable:
                      // dropping would hit moveAssignment's ownership throw
                      // (the coach must not move a client's own workout).
                      draggable={!w.selfAssigned && !w.inherited}
                      onDragStart={(e) => {
                        if (w.selfAssigned || w.inherited) return;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", w.id);
                        onDragStartChip(w);
                      }}
                      onDragEnd={onDragEndChip}
                      onClick={() => onClickChip(w)}
                      className={cn(
                        "group/chip relative flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded border px-1.5 py-1 pr-3 text-left text-[11px] leading-tight hover:brightness-95",
                        workoutChipClass(w.status),
                      )}
                      title={[
                        w.templateName,
                        w.plannedExercises === 0 ? t("freeWorkoutHint") : null,
                        workoutSummaryLabel(w.logged, t),
                        movedFromLabel,
                        w.selfAssigned ? t("clientCreatedBadge") : null,
                        w.inherited ? t("inheritedBadge") : null,
                      ]
                        .filter(Boolean)
                        .join(" — ")}
                    >
                      <Dumbbell className="size-3 shrink-0 opacity-80" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {w.templateName}
                        {inlineWorkoutSummary(w, t) ? (
                          <span className="font-normal opacity-70">
                            {inlineWorkoutSummary(w, t)}
                          </span>
                        ) : null}
                      </span>
                      {w.selfAssigned ? <ClientOwnedBadge /> : null}
                      {w.inherited ? <InheritedBadge /> : null}
                      {movedFromLabel ? (
                        <ArrowRightLeft
                          className="size-3 shrink-0 opacity-70"
                          aria-label={movedFromLabel}
                        />
                      ) : null}
                      <StatusDogear status={w.status} />
                    </button>
                  );
                })}

                {group.habits.length > 0 ? (
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {group.habits.map((h) => (
                      <HabitChip
                        key={h.id}
                        habit={h}
                        onClick={() => onClickHabit(h)}
                        title={`${h.habitName} · ${h.status}`}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
