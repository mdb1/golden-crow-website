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

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { AssignTemplateModal } from "./assign-template-modal";
import { MoveAssignmentDialog } from "./move-assignment-dialog";
import { NewHabitDialog } from "./new-habit-dialog";
import { WorkoutDetailDialog } from "./workout-detail-dialog";
import { HabitDetailDialog } from "./habit-detail-dialog";

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
  { chip: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  { chip: "bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/40", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  { chip: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  { chip: "bg-violet-500/15 text-violet-800 dark:text-violet-300 border-violet-500/40", dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300" },
  { chip: "bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/40", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
  { chip: "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/40", dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" },
  { chip: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/40", dot: "bg-cyan-500", text: "text-cyan-700 dark:text-cyan-300" },
  { chip: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/40", dot: "bg-indigo-500", text: "text-indigo-700 dark:text-indigo-300" },
];

function paletteFor(clients: ClientLite[], clientId: string) {
  const idx = clients.findIndex((c) => c.uid === clientId);
  if (idx < 0) return CLIENT_PALETTE[0];
  return CLIENT_PALETTE[idx % CLIENT_PALETTE.length];
}

// Status-first palette that overrides the per-client tint for terminal
// states so trainers can scan the calendar for "what's still pending"
// vs "what already happened". Client color is preserved only on
// scheduled / started chips, where ownership ambiguity actually matters.
const STATUS_PALETTE: Record<
  MonthWorkoutChip["status"] | MonthHabitChip["status"],
  string
> = {
  completed:
    "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  done: "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  started:
    "border-sky-500/50 bg-sky-500/15 text-sky-900 dark:text-sky-200",
  missed:
    "border-rose-400/40 bg-rose-500/10 text-rose-900 dark:text-rose-200",
  scheduled: "",
};

// Cards are now grouped under a per-client colored header, so the chip itself
// encodes STATUS ONLY (no client tint) — this removes the old ambiguity where
// a green client tint looked identical to the green "completed" status.
// Scheduled → neutral card surface; terminal states keep their status color.
function workoutChipClass(status: MonthWorkoutChip["status"]): string {
  if (status === "scheduled") return "border-border bg-card text-foreground";
  return STATUS_PALETTE[status];
}

function habitChipClass(status: MonthHabitChip["status"]): string {
  if (status === "scheduled")
    return "border-border bg-card text-muted-foreground";
  return STATUS_PALETTE[status];
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

type CalendarView = "month" | "week" | "3day";

/** Monday-first index: 0=Mon … 6=Sun. */
function mondayIndex(civil: string): number {
  const [y, m, d] = civil.split("-").map(Number);
  const gd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return gd === 0 ? 6 : gd - 1;
}

/** Monday that starts the week containing `civil`. */
function startOfWeekMon(civil: string): string {
  return addCivilDays(civil, -mondayIndex(civil));
}

/** "28 May" style short label for range headers. */
function shortDateLabel(civil: string): string {
  const [, m, d] = civil.split("-").map(Number);
  return `${d} ${MONTH_LABELS_ES[m - 1].slice(0, 3)}`;
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
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(todayCivil);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialClientIds),
  );

  const sortedKey = useMemo(
    () => Array.from(selectedIds).sort().join(","),
    [selectedIds],
  );

  // Active window for week / 3-day views (null in month view, where the whole
  // month is fetched from monthFirst instead).
  const range = useMemo(() => {
    if (view === "week") {
      const start = startOfWeekMon(anchor);
      return { start, end: addCivilDays(start, 6) };
    }
    if (view === "3day") return { start: anchor, end: addCivilDays(anchor, 2) };
    return null;
  }, [view, anchor]);

  const { data, isFetching } = useQuery({
    queryKey: [
      "schedule",
      view,
      range ? `${range.start}_${range.end}` : monthFirst,
      sortedKey,
    ],
    queryFn: () =>
      range
        ? listMonthForClients({
            startCivil: range.start,
            endCivil: range.end,
            clientIds: Array.from(selectedIds),
            todayCivil,
          })
        : listMonthForClients({
            monthFirstCivil: monthFirst,
            clientIds: Array.from(selectedIds),
            todayCivil,
          }),
    placeholderData: (prev) => prev,
    initialData:
      view === "month" &&
      monthFirst === initialMonthFirst &&
      sortedKey === Array.from(new Set(initialClientIds)).sort().join(",")
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
      // 260531-fwc — always write the explicit selection (including the empty
      // string) so it's fully reload-safe AND an absent param unambiguously
      // means "nobody selected". Previously "all selected" deleted the param,
      // which collided with the new default-empty behavior.
      const ids = Array.from(nextSelected);
      params.set("clientIds", ids.join(","));
      startUrlTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router],
  );

  function setMonthAndSync(nextMonth: string) {
    setMonthFirst(nextMonth);
    syncUrl(nextMonth, selectedIds);
  }

  function toggleClient(uid: string) {
    // syncUrl() triggers router.replace + startTransition, which are side
    // effects — must run in the event handler, NOT inside the setState updater
    // (the updater runs during render → "Cannot update Router while rendering").
    // Mirrors selectAll / clearAll below.
    const next = new Set(selectedIds);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelectedIds(next);
    syncUrl(monthFirst, next);
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
  const [detailHabit, setDetailHabit] = useState<
    { habitId: string; civilDate: string; clientName: string } | null
  >(null);
  // Type filters — both on by default. Also drive the "+" menu: with a single
  // type enabled the menu is skipped and the add flow fires directly.
  const [showWorkouts, setShowWorkouts] = useState(true);
  const [showHabits, setShowHabits] = useState(true);

  // Per-cell "+" assignment opener. We capture (date, suggestedClientId).
  const [assignContext, setAssignContext] = useState<
    | { date: string; clientId: string }
    | null
  >(null);
  const [newHabitContext, setNewHabitContext] = useState<
    | { date: string; clientId: string; clientName: string }
    | null
  >(null);
  // Day-cell "+" was clicked but multiple clients are selected — show a
  // micro-picker first. `kind` carries through so we know which surface
  // to open after the client is chosen.
  const [pickClientForDate, setPickClientForDate] = useState<
    | { date: string; kind: "workout" | "habit" }
    | null
  >(null);

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
        queryKey: ["schedule"],
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

  const cells: { civil: string; inMonth: boolean }[] = range
    ? Array.from({ length: view === "week" ? 7 : 3 }, (_, i) => ({
        civil: addCivilDays(range.start, i),
        inMonth: true,
      }))
    : buildGrid(monthFirst).cells;
  const gridColsClass = view === "3day" ? "grid-cols-3" : "grid-cols-7";
  // Week / 3-day cells are roomier (fewer rows on screen).
  const cellMinHClass = view === "month" ? "min-h-[120px]" : "min-h-[420px]";

  // Prev / next + "Hoy" behave per view (shift month vs shift the anchor).
  function goPrev() {
    if (view === "month") setMonthAndSync(shiftMonth(monthFirst, -1));
    else setAnchor(addCivilDays(anchor, view === "week" ? -7 : -3));
  }
  function goNext() {
    if (view === "month") setMonthAndSync(shiftMonth(monthFirst, 1));
    else setAnchor(addCivilDays(anchor, view === "week" ? 7 : 3));
  }
  function goToday() {
    setAnchor(todayCivil);
    if (view === "month") setMonthAndSync(`${todayCivil.slice(0, 7)}-01`);
  }
  const rangeTitle = range
    ? `${shortDateLabel(range.start)} – ${shortDateLabel(range.end)}`
    : monthLabel(monthFirst);

  function openNewHabit(date: string, clientId: string) {
    const c = clients.find((x) => x.uid === clientId);
    setNewHabitContext({
      date,
      clientId,
      clientName: c?.displayName ?? clientId,
    });
  }

  function onCellAddClicked(civil: string, kind: "workout" | "habit") {
    if (selectedIds.size === 0) {
      toast.error("Elegí al menos un cliente primero");
      return;
    }
    if (selectedIds.size === 1) {
      const onlyId = Array.from(selectedIds)[0];
      if (kind === "workout") {
        setAssignContext({ date: civil, clientId: onlyId });
      } else {
        openNewHabit(civil, onlyId);
      }
      return;
    }
    setPickClientForDate({ date: civil, kind });
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
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3">
          <span className="text-xs font-medium text-muted-foreground">
            Mostrar
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showWorkouts}
              onChange={(e) => setShowWorkouts(e.target.checked)}
              className="size-4 rounded border"
            />
            <Dumbbell className="size-4 text-amber-600 dark:text-amber-400" />
            Workouts
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showHabits}
              onChange={(e) => setShowHabits(e.target.checked)}
              className="size-4 rounded border"
            />
            <Circle className="size-4 text-emerald-600 dark:text-emerald-400" />
            Hábitos
          </label>
        </div>
      </section>

      {/* ── Calendar nav + view switcher ──────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrev}
            aria-label="Anterior"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[12ch] text-center text-2xl font-semibold tracking-tight">
            {rangeTitle}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={goNext}
            aria-label="Siguiente"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            {(
              [
                ["month", "Mes"],
                ["week", "Semana"],
                ["3day", "3 días"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition",
                  view === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={goToday}>
            Hoy
          </Button>
          {isFetching ? (
            <span className="text-xs text-muted-foreground">Cargando…</span>
          ) : null}
        </div>
      </header>

      {/* ── Weekday header row ─────────────────────────────────────────── */}
      <div className="overflow-x-auto pb-1">
        <div
          className={cn(
            "grid min-w-[760px] gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:min-w-0",
            gridColsClass,
          )}
        >
          {view === "month"
            ? WEEKDAY_HEADERS.map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))
            : cells.map(({ civil }) => (
                <div key={civil} className="text-center">
                  {WEEKDAY_HEADERS[mondayIndex(civil)]} {shortDateLabel(civil)}
                </div>
              ))}
        </div>
      </div>

      {/* ── Calendar grid ──────────────────────────────────────────────── */}
      {selectedIds.size === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Elegí uno o más clientes arriba para ver su agenda.
        </div>
      ) : (
      <div className="overflow-x-auto pb-1">
      <div className={cn("grid min-w-[760px] gap-2 md:min-w-0", gridColsClass)}>
        {cells.map(({ civil, inMonth }) => {
          const workouts = showWorkouts
            ? (payload.workoutsByDay[civil] ?? []).filter((w) =>
                selectedIds.has(w.clientId),
              )
            : [];
          const habits = showHabits
            ? (payload.habitsByDay[civil] ?? []).filter((h) =>
                selectedIds.has(h.clientId),
              )
            : [];
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
              showWorkouts={showWorkouts}
              showHabits={showHabits}
              cellMinHClass={cellMinHClass}
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
              onClickHabit={(h) => {
                const habitId = h.id.slice(
                  0,
                  h.id.length - h.civilDate.length - 1,
                );
                const c = clients.find((x) => x.uid === h.clientId);
                setDetailHabit({
                  habitId,
                  civilDate: h.civilDate,
                  clientName: c?.displayName ?? h.clientId,
                });
              }}
              onClickAdd={(kind) => onCellAddClicked(civil, kind)}
            />
          );
        })}
      </div>
      </div>
      )}

      {/* ── Glossary footer (status colors at a glance) ───────────────── */}
      <section className="rounded-xl border bg-card/95 p-3 text-xs">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Referencia de colores
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <LegendItem
            label="Programado"
            sample="cliente"
            note="usa el color del cliente"
          />
          <LegendItem
            label="Iniciado"
            tone="border-sky-500/50 bg-sky-500/15 text-sky-900 dark:text-sky-200"
          />
          <LegendItem
            label="Completado"
            tone="border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200"
          />
          <LegendItem
            label="No realizado"
            tone="border-rose-400/40 bg-rose-500/10 text-rose-900 dark:text-rose-200"
          />
          <LegendItem
            label="Hoy"
            sample="día"
            note="borde ámbar"
          />
        </div>
      </section>

      {/* ── Pick-client picker (when adding from a cell w/ multi-select) ── */}
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
              {pickClientForDate.kind === "workout"
                ? "Asignar workout"
                : "Asignar hábito"}{" "}
              · {pickClientForDate.date}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              ¿Para qué cliente?
            </p>
            {(() => {
              const renderClientButton = (c: (typeof clients)[number]) => (
                <Button
                  key={c.uid}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (pickClientForDate.kind === "workout") {
                      setAssignContext({
                        date: pickClientForDate.date,
                        clientId: c.uid,
                      });
                    } else {
                      openNewHabit(pickClientForDate.date, c.uid);
                    }
                    setPickClientForDate(null);
                  }}
                >
                  {c.displayName}
                </Button>
              );
              const selected = clients.filter((c) => selectedIds.has(c.uid));
              const others = clients.filter((c) => !selectedIds.has(c.uid));
              return (
                <div className="flex flex-col gap-3">
                  {selected.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        En la agenda
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selected.map(renderClientButton)}
                      </div>
                    </div>
                  ) : null}
                  {others.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Otros clientes
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {others.map(renderClientButton)}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}
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
              queryKey: ["schedule"],
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
              queryKey: ["schedule"],
            });
            setDetailAssignmentId(null);
          }}
        />
      ) : null}

      {/* ── Habit detail dialog (recurrence + skip-day / delete CTAs) ───── */}
      {detailHabit ? (
        <HabitDetailDialog
          open
          onOpenChange={(open) => !open && setDetailHabit(null)}
          habitId={detailHabit.habitId}
          civilDate={detailHabit.civilDate}
          clientName={detailHabit.clientName}
          onChanged={() => {
            queryClient.invalidateQueries({
              queryKey: ["schedule"],
            });
            setDetailHabit(null);
          }}
        />
      ) : null}

      {/* ── New habit dialog (calendar-embedded HabitForm) ─────────────── */}
      {newHabitContext ? (
        <NewHabitDialog
          open
          onOpenChange={(open) => !open && setNewHabitContext(null)}
          clientId={newHabitContext.clientId}
          clientName={newHabitContext.clientName}
          startsOn={newHabitContext.date}
          onCreated={() => {
            queryClient.invalidateQueries({
              queryKey: ["schedule"],
            });
            setNewHabitContext(null);
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
  showWorkouts: boolean;
  showHabits: boolean;
  cellMinHClass: string;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStartChip: (chip: MonthWorkoutChip) => void;
  onClickChip: (chip: MonthWorkoutChip) => void;
  onClickHabit: (habit: MonthHabitChip) => void;
  onClickAdd: (kind: "workout" | "habit") => void;
}

function DayCell({
  civil,
  dayNumber,
  inMonth,
  isToday,
  workouts,
  habits,
  clients,
  showWorkouts,
  showHabits,
  cellMinHClass,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStartChip,
  onClickChip,
  onClickHabit,
  onClickAdd,
}: DayCellProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group relative flex flex-col rounded-lg border bg-card p-2.5 transition-colors",
        cellMinHClass,
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
        <AddPopover
          civil={civil}
          onPick={onClickAdd}
          showWorkouts={showWorkouts}
          showHabits={showHabits}
        />
      </div>

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
            const palette = paletteFor(clients, clientId);
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
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", w.id);
                        onDragStartChip(w);
                      }}
                      onClick={() => onClickChip(w)}
                      className={cn(
                        "group/chip relative flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded border px-1.5 py-1 pr-3 text-left text-[11px] leading-tight hover:brightness-95",
                        workoutChipClass(w.status),
                      )}
                      title={
                        movedFromLabel
                          ? `${w.templateName} — ${movedFromLabel}`
                          : w.templateName
                      }
                    >
                      <Dumbbell className="size-3 shrink-0 opacity-80" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {w.templateName}
                      </span>
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
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => onClickHabit(h)}
                        className={cn(
                          "inline-flex max-w-full items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium hover:brightness-95",
                          habitChipClass(h.status),
                        )}
                        title={`${h.habitName} · ${h.status}`}
                      >
                        <HabitStatusGlyph status={h.status} />
                        <span className="min-w-0 max-w-full truncate">
                          {h.habitName}
                        </span>
                      </button>
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

/**
 * Status indicator rendered as a "dogear" — a 12×12 folded-corner flag
 * pinned to the top-right of the chip. The triangle is a clip-path so
 * the colored fill matches the status tone while the chip's background
 * stays readable underneath.
 *
 * Visual reads at a glance:
 *   - emerald = completed
 *   - sky     = started
 *   - rose    = missed
 *   - amber   = scheduled (still pending)
 */
function StatusDogear({ status }: { status: MonthWorkoutChip["status"] }) {
  const tone =
    status === "completed"
      ? "bg-emerald-500"
      : status === "started"
        ? "bg-sky-500"
        : status === "missed"
          ? "bg-rose-500"
          : "bg-amber-500";
  const titleLabel =
    status === "completed"
      ? "Completado"
      : status === "started"
        ? "Iniciado"
        : status === "missed"
          ? "No realizado"
          : "Programado";
  return (
    <span
      aria-label={titleLabel}
      title={titleLabel}
      className={cn(
        "pointer-events-none absolute right-0 top-0 size-3",
        tone,
      )}
      style={{ clipPath: "polygon(100% 0, 100% 100%, 0 0)" }}
    />
  );
}

/**
 * Per-cell "+" popover. Click reveals two options (Workout / Habit) so
 * the trainer can add either kind of session from a single affordance.
 * Closes on selection — the parent fires the correct flow.
 */
function AddPopover({
  civil,
  onPick,
  showWorkouts,
  showHabits,
}: {
  civil: string;
  onPick: (kind: "workout" | "habit") => void;
  showWorkouts: boolean;
  showHabits: boolean;
}) {
  const [open, setOpen] = useState(false);
  const enabled: Array<"workout" | "habit"> = [
    ...(showWorkouts ? (["workout"] as const) : []),
    ...(showHabits ? (["habit"] as const) : []),
  ];

  // Neither type shown → nothing to add.
  if (enabled.length === 0) return null;

  // Exactly one type shown → skip the menu, fire the add flow directly.
  if (enabled.length === 1) {
    const only = enabled[0];
    return (
      <button
        type="button"
        className={cn(
          "rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:opacity-100",
          "opacity-0 group-hover:opacity-100",
        )}
        aria-label={`Asignar ${only === "workout" ? "workout" : "hábito"} el ${civil}`}
        onClick={() => onPick(only)}
      >
        <PlusIcon className="size-3.5" />
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:opacity-100",
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          aria-label={`Asignar el ${civil}`}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-44 p-1"
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => {
            onPick("workout");
            setOpen(false);
          }}
        >
          <Dumbbell className="size-4 text-amber-600 dark:text-amber-400" />
          Workout
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => {
            onPick("habit");
            setOpen(false);
          }}
        >
          <Circle className="size-4 text-emerald-600 dark:text-emerald-400" />
          Hábito
        </button>
      </PopoverContent>
    </Popover>
  );
}

function LegendItem({
  label,
  tone,
  sample,
  note,
}: {
  label: string;
  tone?: string;
  sample?: string;
  note?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex h-4 w-7 items-center justify-center rounded border text-[9px] font-semibold",
          tone ??
            "border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-200",
        )}
      >
        {sample ?? ""}
      </span>
      <span className="text-foreground/80">{label}</span>
      {note ? (
        <span className="text-muted-foreground">· {note}</span>
      ) : null}
    </span>
  );
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
