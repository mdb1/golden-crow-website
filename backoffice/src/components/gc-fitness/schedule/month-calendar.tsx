"use client";

// month-calendar.tsx
//
// Unified-roster month calendar. Replaces the per-client weekly view.
//
// Surfaces:
//   - Client filter chip bar at the top (multi-select, persisted in URL).
//   - Month nav (prev / today / next) with the rendered month label.
//   - 6 × 7 grid of day cells, each showing workout chips + habit dots.
//   - Drag a workout chip to a different day → MoveAssignmentDialog (one /
//     future / all).
//   - Click a workout chip → opens the existing delete/detail dialog.
//   - "+" on each cell → AssignTemplateModal preloaded with that day +
//     the first selected client. When multiple clients are selected, a
//     small picker appears first.
//
// The page-level React Query cache key is
// `["schedule-month", monthFirst, clientIds.sorted().joined(",")]`. Every
// mutation invalidates it.

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CalendarCheck,
  Check as CheckIcon,
  CheckCircle2,
  ChevronLeftIcon,
  ChevronRightIcon,
  Circle,
  Dumbbell,
  PlusIcon,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  listMonthForClients,
  moveAssignment,
  type MonthCalendarPayload,
  type MonthHabitChip,
  type MonthWorkoutChip,
} from "@/lib/gc-fitness/schedule-month-actions";

import { AssignTemplateModal } from "./assign-template-modal";
import { MoveAssignmentDialog } from "./move-assignment-dialog";
import { WorkoutDetailDialog } from "./workout-detail-dialog";

interface ClientLite {
  uid: string;
  displayName: string;
  email: string;
}

interface MonthCalendarProps {
  clients: ClientLite[];
  initialMonthFirst: string;
  initialClientIds: string[];
  initialPayload: MonthCalendarPayload;
  todayCivil: string;
}

const MONTH_LABELS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const WEEKDAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Distinct chip colors per client — stable mod-N pick using the index in
// the visible roster. Brand-amber stays for the most-selected client.
const CLIENT_PALETTE = [
  { chip: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40", dot: "bg-amber-500" },
  { chip: "bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/40", dot: "bg-sky-500" },
  { chip: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40", dot: "bg-emerald-500" },
  { chip: "bg-violet-500/15 text-violet-800 dark:text-violet-300 border-violet-500/40", dot: "bg-violet-500" },
  { chip: "bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/40", dot: "bg-rose-500" },
  { chip: "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/40", dot: "bg-orange-500" },
  { chip: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/40", dot: "bg-cyan-500" },
  { chip: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/40", dot: "bg-indigo-500" },
];

function paletteFor(clients: ClientLite[], clientId: string) {
  const idx = clients.findIndex((c) => c.uid === clientId);
  if (idx < 0) return CLIENT_PALETTE[0];
  return CLIENT_PALETTE[idx % CLIENT_PALETTE.length];
}

function addCivilDays(civil: string, days: number): string {
  const [y, m, d] = civil.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  const ny = shifted.getUTCFullYear();
  const nm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

function shiftMonth(monthFirst: string, delta: number): string {
  const [y, m] = monthFirst.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** Build the 6 × 7 grid (Mon-first). Pads with the prev/next month so the
 *  grid is always rectangular — the UI dims pad days. */
function buildGrid(monthFirst: string): {
  cells: { civil: string; inMonth: boolean }[];
} {
  const [y, m] = monthFirst.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0=Sun..6=Sat
  // Mon-first → 0=Mon..6=Sun. Convert.
  const monFirstOffset = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const start = addCivilDays(monthFirst, -monFirstOffset);
  const cells: { civil: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const civil = addCivilDays(start, i);
    cells.push({ civil, inMonth: civil.slice(0, 7) === monthFirst.slice(0, 7) });
  }
  return { cells };
}

function monthLabel(monthFirst: string): string {
  const [y, m] = monthFirst.split("-").map(Number);
  return `${MONTH_LABELS_ES[m - 1]} ${y}`;
}

function clientInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function MonthCalendar({
  clients,
  initialMonthFirst,
  initialClientIds,
  initialPayload,
  todayCivil,
}: MonthCalendarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [, startUrlTransition] = useTransition();

  const [monthFirst, setMonthFirst] = useState(initialMonthFirst);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialClientIds),
  );

  const sortedKey = useMemo(
    () => Array.from(selectedIds).sort().join(","),
    [selectedIds],
  );

  const { data, isFetching } = useQuery({
    queryKey: ["schedule-month", monthFirst, sortedKey],
    queryFn: () =>
      listMonthForClients({
        monthFirstCivil: monthFirst,
        clientIds: Array.from(selectedIds),
        todayCivil,
      }),
    placeholderData: (prev) => prev,
    initialData:
      monthFirst === initialMonthFirst &&
      sortedKey ===
        Array.from(new Set(initialClientIds)).sort().join(",")
        ? initialPayload
        : undefined,
  });

  const payload = data ?? {
    monthStart: monthFirst,
    monthEnd: monthFirst,
    workoutsByDay: {},
    habitsByDay: {},
  };

  // Persist month + selected clients to the URL so the surface is
  // reload-safe + linkable from the client profile.
  const syncUrl = useCallback(
    (nextMonth: string, nextSelected: Set<string>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("month", nextMonth.slice(0, 7));
      const ids = Array.from(nextSelected);
      if (ids.length === clients.length) {
        params.delete("clientIds");
      } else {
        params.set("clientIds", ids.join(","));
      }
      startUrlTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router, clients.length],
  );

  function setMonthAndSync(nextMonth: string) {
    setMonthFirst(nextMonth);
    syncUrl(nextMonth, selectedIds);
  }

  function toggleClient(uid: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      syncUrl(monthFirst, next);
      return next;
    });
  }

  function selectAll() {
    const next = new Set(clients.map((c) => c.uid));
    setSelectedIds(next);
    syncUrl(monthFirst, next);
  }
  function clearAll() {
    const next = new Set<string>();
    setSelectedIds(next);
    syncUrl(monthFirst, next);
  }

  // Per-cell drag-and-drop state.
  const [dragChip, setDragChip] = useState<MonthWorkoutChip | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  // Pending move → MoveAssignmentDialog (prompts the scope for recurring).
  const [pendingMove, setPendingMove] = useState<
    | { chip: MonthWorkoutChip; newDate: string }
    | null
  >(null);

  // Click-a-chip → opens the read-only workout detail dialog. Removal
  // is reachable from inside that dialog (which then opens the
  // recurrence-aware delete confirmer).
  const [detailAssignmentId, setDetailAssignmentId] = useState<string | null>(
    null,
  );

  // Per-cell "+" assignment opener. We capture (date, suggestedClientId).
  const [assignContext, setAssignContext] = useState<
    | { date: string; clientId: string }
    | null
  >(null);
  // Day-cell "+" was clicked but multiple clients are selected — show a
  // micro-picker first.
  const [pickClientForDate, setPickClientForDate] = useState<string | null>(
    null,
  );

  const moveMutation = useMutation({
    mutationFn: (input: {
      id: string;
      newScheduledFor: string;
      scope: "one" | "future" | "all";
    }) => moveAssignment(input),
    onSuccess: ({ movedCount }) => {
      toast.success(
        movedCount === 1
          ? "Workout movido"
          : `${movedCount} workouts movidos`,
      );
      queryClient.invalidateQueries({
        queryKey: ["schedule-month", monthFirst, sortedKey],
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "No se pudo mover");
    },
  });

  function onCellDrop(targetDay: string) {
    setDragOverDay(null);
    const chip = dragChip;
    setDragChip(null);
    if (!chip) return;
    if (chip.scheduledFor === targetDay) return;
    if (chip.seriesId && chip.recurrenceKind && chip.recurrenceKind !== "single") {
      setPendingMove({ chip, newDate: targetDay });
      return;
    }
    moveMutation.mutate({
      id: chip.id,
      newScheduledFor: targetDay,
      scope: "one",
    });
  }

  const { cells } = buildGrid(monthFirst);

  function onCellAddClicked(civil: string) {
    if (selectedIds.size === 0) {
      toast.error("Elegí al menos un cliente primero");
      return;
    }
    if (selectedIds.size === 1) {
      const onlyId = Array.from(selectedIds)[0];
      setAssignContext({ date: civil, clientId: onlyId });
      return;
    }
    setPickClientForDate(civil);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Client filter bar ─────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card/95 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">
              Clientes en pantalla{" "}
              <span className="text-muted-foreground">
                ({selectedIds.size}/{clients.length})
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Marcá uno o varios. El calendario va a mostrar sus workouts y hábitos juntos.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={
                selectedIds.size === clients.length ? "ghost" : "outline"
              }
              size="sm"
              onClick={selectAll}
              disabled={selectedIds.size === clients.length}
            >
              Marcar todos
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={selectedIds.size === 0}
            >
              Limpiar
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {clients.map((c) => {
            const active = selectedIds.has(c.uid);
            const palette = paletteFor(clients, c.uid);
            return (
              <button
                key={c.uid}
                type="button"
                onClick={() => toggleClient(c.uid)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  active
                    ? `${palette.chip} ring-1 ring-current/30`
                    : "border-dashed border-foreground/30 bg-background text-foreground/70 hover:border-foreground/60 hover:bg-muted/40",
                )}
              >
                {active ? (
                  <CheckIcon className="size-3.5" strokeWidth={3} />
                ) : (
                  <PlusIcon className="size-3.5 opacity-70" strokeWidth={2.5} />
                )}
                {c.displayName}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Month nav ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMonthAndSync(shiftMonth(monthFirst, -1))}
            aria-label="Mes anterior"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[14ch] text-center text-2xl font-semibold tracking-tight">
            {monthLabel(monthFirst)}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMonthAndSync(shiftMonth(monthFirst, 1))}
            aria-label="Mes próximo"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMonthAndSync(`${todayCivil.slice(0, 7)}-01`)}
          >
            Hoy
          </Button>
          {isFetching ? (
            <span className="text-xs text-muted-foreground">Cargando…</span>
          ) : null}
        </div>
      </header>

      {/* ── Weekday header row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_HEADERS.map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>

      {/* ── Month grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-2">
        {cells.map(({ civil, inMonth }) => {
          const workouts = (payload.workoutsByDay[civil] ?? []).filter((w) =>
            selectedIds.has(w.clientId),
          );
          const habits = (payload.habitsByDay[civil] ?? []).filter((h) =>
            selectedIds.has(h.clientId),
          );
          const isToday = civil === todayCivil;
          const dayNumber = Number(civil.slice(8, 10));
          return (
            <DayCell
              key={civil}
              civil={civil}
              dayNumber={dayNumber}
              inMonth={inMonth}
              isToday={isToday}
              workouts={workouts}
              habits={habits}
              clients={clients}
              isDragOver={dragOverDay === civil}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverDay(civil);
              }}
              onDragLeave={() => {
                if (dragOverDay === civil) setDragOverDay(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                onCellDrop(civil);
              }}
              onDragStartChip={(chip) => setDragChip(chip)}
              onClickChip={(chip) => setDetailAssignmentId(chip.id)}
              onClickAdd={() => onCellAddClicked(civil)}
            />
          );
        })}
      </div>

      {/* ── Pick-client picker (when assigning from a cell w/ multi-select) ── */}
      {pickClientForDate ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
          onClick={() => setPickClientForDate(null)}
        >
          <div
            className="m-4 max-w-md rounded-xl bg-background p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-sm font-medium">
              ¿Para qué cliente? · {pickClientForDate}
            </p>
            <div className="flex flex-wrap gap-2">
              {clients
                .filter((c) => selectedIds.has(c.uid))
                .map((c) => (
                  <Button
                    key={c.uid}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAssignContext({
                        date: pickClientForDate,
                        clientId: c.uid,
                      });
                      setPickClientForDate(null);
                    }}
                  >
                    {c.displayName}
                  </Button>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Assign workout modal (reuses existing) ─────────────────────── */}
      {assignContext ? (
        <AssignTemplateModal
          open
          onOpenChange={(open) => !open && setAssignContext(null)}
          clientId={assignContext.clientId}
          defaultDate={assignContext.date}
          onAssigned={() => {
            queryClient.invalidateQueries({
              queryKey: ["schedule-month", monthFirst, sortedKey],
            });
            setAssignContext(null);
          }}
        />
      ) : null}

      {/* ── Workout detail dialog (with delete CTA inside) ─────────────── */}
      {detailAssignmentId ? (
        <WorkoutDetailDialog
          open
          onOpenChange={(open) => !open && setDetailAssignmentId(null)}
          assignmentId={detailAssignmentId}
          onDeleted={() => {
            queryClient.invalidateQueries({
              queryKey: ["schedule-month", monthFirst, sortedKey],
            });
            setDetailAssignmentId(null);
          }}
        />
      ) : null}

      {/* ── Recurrence prompt on series move ───────────────────────────── */}
      {pendingMove ? (
        <MoveAssignmentDialog
          open
          chip={pendingMove.chip}
          newDate={pendingMove.newDate}
          onOpenChange={(open) => !open && setPendingMove(null)}
          onConfirm={(scope) => {
            moveMutation.mutate({
              id: pendingMove.chip.id,
              newScheduledFor: pendingMove.newDate,
              scope,
            });
            setPendingMove(null);
          }}
        />
      ) : null}

      {clients.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No tenés clientes activos todavía.
        </p>
      ) : null}
    </div>
  );

  // ── Inner components ─────────────────────────────────────────────────
  // (Inline so the chip palette + drag handlers share closure scope.)
  // The Day cell is split out so the markup above stays readable.
}

interface DayCellProps {
  civil: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  workouts: MonthWorkoutChip[];
  habits: MonthHabitChip[];
  clients: ClientLite[];
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStartChip: (chip: MonthWorkoutChip) => void;
  onClickChip: (chip: MonthWorkoutChip) => void;
  onClickAdd: () => void;
}

function DayCell({
  civil,
  dayNumber,
  inMonth,
  isToday,
  workouts,
  habits,
  clients,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStartChip,
  onClickChip,
  onClickAdd,
}: DayCellProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group relative flex min-h-[120px] flex-col rounded-lg border bg-card p-2 transition-colors",
        !inMonth && "bg-muted/20 opacity-60",
        isToday && "ring-2 ring-amber-500",
        isDragOver && "border-amber-500 bg-amber-50/50 dark:bg-amber-900/10",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "text-xs font-semibold",
            isToday ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
          )}
        >
          {dayNumber}
        </span>
        <button
          type="button"
          onClick={onClickAdd}
          className="rounded-full p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100"
          aria-label={`Asignar el ${civil}`}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {workouts.map((w) => {
          const palette = paletteFor(clients, w.clientId);
          const client = clients.find((c) => c.uid === w.clientId);
          const movedFromLabel = w.originallyScheduledFor
            ? formatMovedFromLabel(
                w.originallyScheduledFor,
                w.scheduledFor,
              )
            : null;
          return (
            <button
              key={w.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", w.id);
                onDragStartChip(w);
              }}
              onClick={() => onClickChip(w)}
              className={cn(
                "flex items-center gap-1.5 rounded border px-1.5 py-1 text-left text-[11px] leading-tight",
                palette.chip,
                "hover:brightness-95",
              )}
              title={
                movedFromLabel
                  ? `${client?.displayName ?? ""} · ${w.templateName} — ${movedFromLabel}`
                  : `${client?.displayName ?? ""} · ${w.templateName}`
              }
            >
              <StatusGlyph status={w.status} />
              <span className="truncate">
                <span className="font-semibold">
                  {client ? clientInitials(client.displayName) : ""}
                </span>{" "}
                {w.templateName}
              </span>
              {movedFromLabel ? (
                <ArrowRightLeft
                  className="size-3 shrink-0 opacity-70"
                  aria-label={movedFromLabel}
                />
              ) : null}
            </button>
          );
        })}

        {habits.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {habits.map((h) => {
              const palette = paletteFor(clients, h.clientId);
              return (
                <span
                  key={h.id}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                    palette.chip,
                  )}
                  title={`${h.habitName} · ${h.status}`}
                >
                  <HabitStatusGlyph status={h.status} />
                  <span className="max-w-[80px] truncate">{h.habitName}</span>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Build the "originalmente <día>, el cliente lo movió a <día>" hint
 * surfaced in the chip's tooltip + the `ArrowRightLeft` icon's aria
 * label. Both civil dates are parsed in UTC so the trainer's locale
 * doesn't shift the rendered weekday.
 */
function formatMovedFromLabel(
  originallyScheduledFor: string,
  scheduledFor: string,
): string | null {
  const original = parseCivilDateInUtc(originallyScheduledFor);
  const moved = parseCivilDateInUtc(scheduledFor);
  if (!original || !moved) return null;
  const fmt = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `Originalmente ${fmt.format(original)}, el cliente lo movió a ${fmt.format(moved)}`;
}

function parseCivilDateInUtc(civilDate: string): Date | null {
  const parts = civilDate.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function StatusGlyph({ status }: { status: MonthWorkoutChip["status"] }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === "missed") {
    return <XCircle className="size-3 text-rose-600 dark:text-rose-400" />;
  }
  if (status === "started") {
    return <CalendarCheck className="size-3 text-sky-600 dark:text-sky-400" />;
  }
  return <Dumbbell className="size-3 opacity-70" />;
}

function HabitStatusGlyph({ status }: { status: MonthHabitChip["status"] }) {
  if (status === "done") {
    return <CheckCircle2 className="size-2.5 text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === "missed") {
    return <XCircle className="size-2.5 text-rose-600 dark:text-rose-400" />;
  }
  return <Circle className="size-2.5 opacity-60" />;
}

