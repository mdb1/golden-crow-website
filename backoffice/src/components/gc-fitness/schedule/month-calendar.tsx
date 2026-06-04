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

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowRightLeft,
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
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { PillTabs } from "@/components/gc-fitness/pill-tabs";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
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
  photoURL?: string | null;
}

interface MonthCalendarProps {
  clients: ClientLite[];
  initialMonthFirst: string;
  initialClientIds: string[];
  initialPayload: MonthCalendarPayload;
  todayCivil: string;
  trainerUid: string;
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
// scheduled chips, where ownership ambiguity actually matters.
const STATUS_PALETTE: Record<
  MonthWorkoutChip["status"] | MonthHabitChip["status"],
  string
> = {
  completed:
    "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  done: "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  started: "",
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
  trainerUid,
}: MonthCalendarProps) {
  const t = useTranslations("schedule.calendar");
  const tNav = useTranslations("nav");
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

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
      // Shallow URL update (Next.js-supported) instead of router.replace.
      // router.replace re-ran the force-dynamic page.tsx — re-reading the
      // whole selection's assignments + habits SERVER-side — on EVERY toggle,
      // and that navigation raced with the client-side React Query call to the
      // `listMonthForClients` server action: the nav could strand the
      // in-flight call, leaving `isFetching` stuck `true` forever (the
      // calendar "loading" that only cleared once you picked another client).
      // history.replaceState keeps the URL bookmark/reload-safe with no
      // navigation, no redundant server re-fetch, and no aborted query.
      window.history.replaceState(null, "", `?${params.toString()}`);
    },
    [searchParams],
  );

  function setMonthAndSync(nextMonth: string) {
    setMonthFirst(nextMonth);
    syncUrl(nextMonth, selectedIds);
  }

  function toggleClient(uid: string) {
    // syncUrl() updates the URL (history.replaceState) — a side effect, so it
    // runs in the event handler, NOT inside the setState updater (the updater
    // can re-run during render). Mirrors selectAll / clearAll below.
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
  // 3-day is the comfortable phone view: a narrower min-width lets sticky
  // "Cliente" + 3 day columns nearly fit a 390px screen, so only a small
  // horizontal nudge is needed. Week (7 cols) keeps the wider 760px floor.
  const gridMinWClass = view === "3day" ? "min-w-[560px]" : "min-w-[760px]";

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
      toast.error(t("pickClientFirstToast"));
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

  function openHabitDetail(h: MonthHabitChip) {
    const habitId = h.id.slice(0, h.id.length - h.civilDate.length - 1);
    const c = clients.find((x) => x.uid === h.clientId);
    setDetailHabit({
      habitId,
      civilDate: h.civilDate,
      clientName: c?.displayName ?? h.clientId,
    });
  }

  const viewSwitcher = (
    <PillTabs
      size="sm"
      activeKey={view}
      items={[
        { key: "3day", label: t("view3Day"), onSelect: () => setView("3day") },
        { key: "week", label: t("viewWeek"), onSelect: () => setView("week") },
        { key: "month", label: t("viewMonth"), onSelect: () => setView("month") },
      ]}
    />
  );

  const rangeNav = (
    <div className="inline-flex min-w-0 items-center gap-1 rounded-full border bg-card p-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 rounded-full"
        onClick={goPrev}
        aria-label={t("previousAria")}
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </Button>
      <span className="min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold tracking-tight sm:min-w-[10ch] sm:flex-none">
        {rangeTitle}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 rounded-full"
        onClick={goNext}
        aria-label={t("nextAria")}
      >
        <ChevronRightIcon className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={tNav("schedule")}
        subtitle={t("headerSubtitle")}
        actions={
          isFetching ? (
            <span className="text-xs text-muted-foreground">{t("loading")}</span>
          ) : null
        }
      />

      {/* ── Calendar toolbar ──────────────────────────────────────────────
          Restructured for mobile (~390px): the view switcher, month nav,
          "Hoy" and "Asignación masiva" controls live in their own wrapping
          toolbar instead of the PageHeader actions row, so they stack/wrap
          cleanly on a phone instead of overflowing horizontally. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full overflow-x-auto sm:w-auto sm:overflow-visible">
          {viewSwitcher}
        </div>
        <div className="min-w-0 flex-1 sm:flex-none">{rangeNav}</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[40px] rounded-full"
          onClick={goToday}
        >
          {t("today")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-[40px] rounded-full"
          asChild
        >
          <Link href="/gc-fitness/schedule/bulk">{t("bulkAssign")}</Link>
        </Button>
      </div>

      {/* ── Client filter bar ─────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold tracking-tight">
              {t("clientsOnScreen")}{" "}
              <span className="text-muted-foreground">
                ({selectedIds.size}/{clients.length})
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {t("clientsOnScreenHint")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] rounded-full"
              onClick={selectAll}
              disabled={selectedIds.size === clients.length}
            >
              {t("selectAll")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[44px] rounded-full"
              onClick={clearAll}
              disabled={selectedIds.size === 0}
            >
              {t("clear")}
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
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
                  "group/chip inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm font-medium transition-all",
                  active
                    ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <span className="relative inline-flex shrink-0">
                  <ClientAvatar
                    name={c.displayName}
                    photoURL={c.photoURL}
                    size="sm"
                  />
                  {active ? (
                    <span className="absolute -bottom-0.5 -right-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-primary-foreground text-primary ring-2 ring-primary">
                      <CheckIcon className="size-2.5" strokeWidth={3.5} />
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    palette.dot,
                    active && "ring-1 ring-primary-foreground/60",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{c.displayName}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="mr-1 text-sm font-medium text-muted-foreground">
            {t("show")}
          </span>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full px-3 text-sm">
            <input
              type="checkbox"
              checked={showWorkouts}
              onChange={(e) => setShowWorkouts(e.target.checked)}
              className="size-4 rounded border accent-primary"
            />
            <Dumbbell className="size-4 text-amber-600 dark:text-amber-400" />
            {t("workouts")}
          </label>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full px-3 text-sm">
            <input
              type="checkbox"
              checked={showHabits}
              onChange={(e) => setShowHabits(e.target.checked)}
              className="size-4 rounded border accent-primary"
            />
            <Circle className="size-4 text-emerald-600 dark:text-emerald-400" />
            {t("habits")}
          </label>
        </div>
      </Card>

      {/* ── Calendar surface ───────────────────────────────────────────── */}
      {selectedIds.size === 0 ? (
        <div className="rounded-[1.25rem] border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t("pickClientsPrompt")}
        </div>
      ) : (
        // Selected clients' calendar. `placeholderData` keeps the PRIOR grid
        // mounted while the new selection's assignments load, so without a
        // signal it just looks like "no data". Dim the grid + show a spinner
        // overlay whenever the query is fetching.
        <div className="relative">
          {/* Non-blocking loading hint: a thin indeterminate bar across the top
              of the calendar while the selection's assignments refetch. The grid
              stays fully visible + interactive (placeholderData keeps the prior
              data), so this never blocks. */}
          {isFetching ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-1 overflow-hidden rounded-t-[1.25rem]">
              <div className="gc-loading-bar h-full w-full" />
            </div>
          ) : null}
          <div>
            {view === "month" ? (
              // ── Month view: classic calendar grid in a framed card ──────
              <Card className="min-w-0 max-w-full overflow-hidden p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[760px] p-3 md:min-w-0">
              <div
                className={cn(
                  "grid gap-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  gridColsClass,
                )}
              >
                {WEEKDAY_HEADERS.map((d) => (
                  <div key={d} className="text-center">
                    {d}
                  </div>
                ))}
              </div>
              <div className={cn("grid gap-2", gridColsClass)}>
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
                      onClickHabit={openHabitDetail}
                      onClickAdd={(kind) => onCellAddClicked(civil, kind)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        // ── Week / 3-day view: clients as rows, days as columns ─────────
        <Card className="min-w-0 max-w-full overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className={cn("w-full border-separate border-spacing-0", gridMinWClass)}>
              <thead>
                <tr>
                  <th className="z-20 w-28 min-w-28 border-b bg-card px-3 py-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:sticky sm:left-0 sm:w-40 sm:min-w-40 sm:px-4">
                    Cliente
                  </th>
                  {cells.map(({ civil }) => {
                    const isToday = civil === todayCivil;
                    return (
                      <th
                        key={civil}
                        className={cn(
                          "border-b border-l px-2 py-3 text-center align-bottom",
                          isToday && "bg-primary/10",
                        )}
                      >
                        <div
                          className={cn(
                            "text-xs font-semibold uppercase tracking-wide",
                            isToday
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {WEEKDAY_HEADERS[mondayIndex(civil)]}
                        </div>
                        <div
                          className={cn(
                            "text-lg font-bold tabular-nums",
                            isToday ? "text-primary" : "text-foreground",
                          )}
                        >
                          {Number(civil.slice(8, 10))}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {clients
                  .filter((c) => selectedIds.has(c.uid))
                  .map((client) => (
                    <tr key={client.uid} className="group/row">
                      <th
                        scope="row"
                        className="z-10 w-28 min-w-28 border-b bg-card px-3 py-3 text-left align-top sm:sticky sm:left-0 sm:w-40 sm:min-w-40 sm:px-4"
                      >
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          <ClientAvatar
                            name={client.displayName}
                            photoURL={client.photoURL}
                            size="sm"
                          />
                          {/* Hard max-width so a long name TRUNCATES instead of
                              widening the sticky column and eating the day cells
                              on mobile (auto table-layout sizes to content, so
                              `truncate` alone isn't enough without a width cap). */}
                          <span
                            className="block max-w-[5.5rem] truncate text-sm font-semibold text-foreground sm:max-w-[9rem]"
                            title={client.displayName}
                          >
                            {client.displayName}
                          </span>
                        </div>
                      </th>
                      {cells.map(({ civil }) => {
                        const workouts = showWorkouts
                          ? (payload.workoutsByDay[civil] ?? []).filter(
                              (w) => w.clientId === client.uid,
                            )
                          : [];
                        const habits = showHabits
                          ? (payload.habitsByDay[civil] ?? []).filter(
                              (h) => h.clientId === client.uid,
                            )
                          : [];
                        const isToday = civil === todayCivil;
                        return (
                          <ClientDayCell
                            key={civil}
                            civil={civil}
                            isToday={isToday}
                            workouts={workouts}
                            habits={habits}
                            showWorkouts={showWorkouts}
                            showHabits={showHabits}
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
                            onClickChip={(chip) =>
                              setDetailAssignmentId(chip.id)
                            }
                            onClickHabit={openHabitDetail}
                            onClickAdd={(kind) =>
                              onCellAddClicked(civil, kind)
                            }
                          />
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
            )}
          </div>
        </div>
      )}

      {/* ── Glossary footer (status colors at a glance) ───────────────── */}
      <section className="rounded-[1.25rem] border bg-card/95 p-3 text-xs shadow-sm">
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPickClientForDate(null)}
        >
          <div
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[1.25rem] border bg-background p-4 shadow-2xl"
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
          trainerUid={trainerUid}
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
        <p className="rounded-[1.25rem] border border-dashed p-6 text-center text-sm text-muted-foreground">
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

interface ClientDayCellProps {
  civil: string;
  isToday: boolean;
  workouts: MonthWorkoutChip[];
  habits: MonthHabitChip[];
  showWorkouts: boolean;
  showHabits: boolean;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStartChip: (chip: MonthWorkoutChip) => void;
  onClickChip: (chip: MonthWorkoutChip) => void;
  onClickHabit: (habit: MonthHabitChip) => void;
  onClickAdd: (kind: "workout" | "habit") => void;
}

/**
 * A single client × day cell for the week / 3-day "client rows" table layout
 * (the screenshot reference). Holds that client's workout chips + a habit
 * count chip, or a subtle dashed "+" add affordance when the day is empty.
 * Shares all the same interactions (drag-to-move, click-to-detail, add) as the
 * month grid's `DayCell`.
 */
function ClientDayCell({
  civil,
  isToday,
  workouts,
  habits,
  showWorkouts,
  showHabits,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStartChip,
  onClickChip,
  onClickHabit,
  onClickAdd,
}: ClientDayCellProps) {
  const isEmpty = workouts.length === 0 && habits.length === 0;
  return (
    <td
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group/cell border-b border-l p-1.5 align-top transition-colors",
        isToday && "bg-primary/[0.06]",
        isDragOver && "bg-primary/10",
      )}
    >
      <div className="flex min-h-[88px] min-w-0 flex-col gap-1.5">
        {workouts.map((w) => {
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
                // Same chip styling as the month grid's DayCell so workouts
                // read identically across all views (the trainer preferred the
                // 30-day look): compact rectangle + status dog-ear.
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

        {/* Individual habit chips (one per habit) so the coach can see and open
            each one. Same compact, wrapping "pill" treatment as the month
            grid's DayCell — visually distinct from the rectangular workout
            chips (the trainer preferred the 30-day look across all views). */}
        {habits.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-1">
            {habits.map((h) => (
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

        {/* The add affordance is ALWAYS present: a prominent dashed fill when
            the cell is empty, and a slim "+" mini-row below the chips when it
            already has content — so a day with a workout/habit can still take
            another one (this was missing, the "+" only showed on empty cells). */}
        <AddPopover
          civil={civil}
          onPick={onClickAdd}
          showWorkouts={showWorkouts}
          showHabits={showHabits}
          variant={isEmpty ? "cell" : "row"}
        />
      </div>
    </td>
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
 *   - rose    = missed
 *   - amber   = scheduled (still pending)
 */
function StatusDogear({ status }: { status: MonthWorkoutChip["status"] }) {
  const tone =
    status === "completed"
      ? "bg-emerald-500"
      : status === "missed"
          ? "bg-rose-500"
          : "bg-amber-500";
  const titleLabel =
    status === "completed"
      ? "Completado"
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
  variant = "icon",
}: {
  civil: string;
  onPick: (kind: "workout" | "habit") => void;
  showWorkouts: boolean;
  showHabits: boolean;
  /** "icon" = compact reveal-on-hover "+" (month grid header). "cell" = full
   *  dashed add affordance filling an empty week/3-day cell. "row" = slim
   *  always-visible "+" mini-row appended below existing chips so a week/3-day
   *  cell that already has content can still take another workout/habit. */
  variant?: "icon" | "cell" | "row";
}) {
  const [open, setOpen] = useState(false);
  const enabled: Array<"workout" | "habit"> = [
    ...(showWorkouts ? (["workout"] as const) : []),
    ...(showHabits ? (["habit"] as const) : []),
  ];

  const iconTriggerClass = cn(
    "rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:opacity-100",
    // Always visible on touch (no hover); reveal-on-hover only where hover exists.
    open
      ? "opacity-100"
      : "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
  );
  const cellTriggerClass =
    "flex min-h-[40px] w-full flex-1 items-center justify-center rounded-xl border border-dashed border-foreground/20 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary";
  const rowTriggerClass =
    "flex h-6 w-full items-center justify-center rounded-md border border-dashed border-foreground/15 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary";
  const triggerClass =
    variant === "cell"
      ? cellTriggerClass
      : variant === "row"
        ? rowTriggerClass
        : iconTriggerClass;
  const plusClass = variant === "cell" ? "size-4" : "size-3.5";

  // Neither type shown → nothing to add.
  if (enabled.length === 0) return null;

  // Exactly one type shown → skip the menu, fire the add flow directly.
  if (enabled.length === 1) {
    const only = enabled[0];
    return (
      <button
        type="button"
        className={triggerClass}
        aria-label={`Asignar ${only === "workout" ? "workout" : "hábito"} el ${civil}`}
        onClick={() => onPick(only)}
      >
        <PlusIcon className={plusClass} />
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={triggerClass}
          aria-label={`Asignar el ${civil}`}
        >
          <PlusIcon className={plusClass} />
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
