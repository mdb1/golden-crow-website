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
// #507 — split by responsibility: the pure date/label helpers live in
// `lib/gc-fitness/month-calendar-model.ts`; the day cells, chip pieces and
// palette in `./month-calendar/`. This file keeps the state, the query, the
// mutations and the layout.
//
// The page-level React Query cache key is
// `["schedule-month", monthFirst, clientIds.sorted().joined(",")]`. Every
// mutation invalidates it.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check as CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Circle,
  Dumbbell,
  Search as SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { filterClientsByQuery } from "@/lib/gc-fitness/client-name-search";
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
import { AssignTemplateModal } from "./assign-template-modal";
import { MoveAssignmentDialog } from "./move-assignment-dialog";
import { NewHabitDialog } from "./new-habit-dialog";
import { WorkoutDetailDialog } from "./workout-detail-dialog";
import { HabitDetailDialog } from "./habit-detail-dialog";
import { BulkAssignHabitDialog } from "./bulk-assign-habit-dialog";

import {
  addCivilDays,
  ageOnCivilDate,
  calendarCells,
  calendarRange,
  type CalendarView,
  type ClientLite,
  findWorkoutChip,
  habitIdFromChip,
  isBirthdayOn,
  mondayIndex,
  monthLabel,
  shiftMonth,
  shortDateLabel,
  WEEKDAY_HEADERS,
} from "@/lib/gc-fitness/month-calendar-model";
import { paletteFor } from "./month-calendar/palette";
import { DayCell } from "./month-calendar/day-cell";
import { ClientDayCell } from "./month-calendar/client-day-cell";

interface MonthCalendarProps {
  clients: ClientLite[];
  initialMonthFirst: string;
  initialClientIds: string[];
  initialPayload: MonthCalendarPayload;
  todayCivil: string;
  trainerUid: string;
}

/** #485: the chip search box appears once the roster stops fitting at a glance. */
const CLIENT_SEARCH_MIN_CLIENTS = 8;

export function MonthCalendar({
  clients,
  initialMonthFirst,
  initialClientIds,
  initialPayload,
  todayCivil,
  trainerUid,
}: MonthCalendarProps) {
  const t = useTranslations("schedule.calendar");
  const locale = useLocale();
  const tNav = useTranslations("nav");
  const birthdayBadge = t("birthdayBadge");
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [monthFirst, setMonthFirst] = useState(initialMonthFirst);
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(todayCivil);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialClientIds),
  );
  const [clientColorOrder, setClientColorOrder] = useState<string[]>([]);

  const sortedKey = useMemo(
    () => Array.from(selectedIds).sort().join(","),
    [selectedIds],
  );

  // Active window for week / 3-day views (null in month view, where the whole
  // month is fetched from monthFirst instead).
  const range = useMemo(() => calendarRange(view, anchor), [view, anchor]);

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
    if (!selectedIds.has(uid)) {
      setClientColorOrder((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
    }
    syncUrl(monthFirst, next);
  }

  // #485: search box over the chip wall — with dozens of clients picking one
  // by scanning chips is unusable. Filters what is SHOWN only; "Select all"
  // still selects the whole roster.
  const [clientQuery, setClientQuery] = useState("");
  const visibleClients = useMemo(
    () => filterClientsByQuery(clients, clientQuery),
    [clients, clientQuery],
  );

  function selectAll() {
    const nextIds = clients.map((c) => c.uid);
    const next = new Set(nextIds);
    setSelectedIds(next);
    setClientColorOrder((prev) => {
      const ordered = [...prev];
      for (const id of nextIds) {
        if (!ordered.includes(id)) ordered.push(id);
      }
      return ordered;
    });
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

  // Regression (#451): a drag that ends WITHOUT a drop on a day cell (released
  // outside the grid, Esc, dropped on a non-target) must not leave the chip
  // "in hand" — otherwise the next unrelated drop on a cell moves that stale
  // workout. The chip's own onDragEnd covers the normal case; the window
  // listeners cover a source chip that unmounted mid-drag (refetch).
  const clearDrag = useCallback(() => {
    setDragChip(null);
    setDragOverDay(null);
  }, []);
  useEffect(() => {
    if (!dragChip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearDrag();
    };
    window.addEventListener("dragend", clearDrag);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("dragend", clearDrag);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragChip, clearDrag]);

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
  // 260612-e9t (#176): bulk habit assignment reachable from the Agenda.
  const [bulkHabitOpen, setBulkHabitOpen] = useState(false);
  // Day-cell "+" was clicked but multiple clients are selected — show a
  // micro-picker first. `kind` carries through so we know which surface
  // to open after the client is chosen.
  const [pickClientForDate, setPickClientForDate] = useState<
    | { date: string; kind: "workout" | "habit" }
    | null
  >(null);

  const moveMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      newScheduledFor: string;
      scope: "one" | "future" | "all";
    }) => {
      // #513 — the action RETURNS its failure (a thrown one is redacted in
      // production); re-raise it here so `onError` keeps owning the toast.
      const result = await moveAssignment(input);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
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
    requestMove(chip, targetDay);
  }

  // The ONE move path — shared by the HTML5 drop above and the detail
  // dialog's "Mover a fecha…" (#493, keyboard/touch). Same-day is a no-op;
  // a recurring chip asks for the scope first.
  function requestMove(chip: MonthWorkoutChip, targetDay: string) {
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

  const cells = calendarCells(view, range, monthFirst);
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
    const habitId = habitIdFromChip(h);
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
    // #381: `flex w-full` (not `inline-flex`) so the pill fills the width its
    // `flex-1` parent allocates on mobile. As an inline-flex it sized to its
    // own content and overflowed the parent, painting the month label over the
    // "Hoy" button and hiding the next-range (>) chevron. Filling the parent
    // lets the label `truncate` instead of overflowing.
    <div className="flex w-full min-w-0 items-center gap-1 rounded-full border bg-card p-1 sm:inline-flex sm:w-auto">
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
          cleanly on a phone instead of overflowing horizontally.

          #394: the date nav + "Hoy" keep their OWN row and get width priority
          so the month/range label never collapses to "J.." on a phone; the
          bulk-action buttons drop to a separate full-width row below on mobile
          (all inline on ≥sm). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full overflow-x-auto sm:w-auto sm:overflow-visible">
          {viewSwitcher}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <div className="min-w-0 flex-1 sm:flex-none">{rangeNav}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[40px] shrink-0 rounded-full"
            onClick={goToday}
          >
            {t("today")}
          </Button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[40px] rounded-full"
            asChild
          >
            <Link href="/gc-fitness/schedule/bulk">{t("bulkAssign")}</Link>
          </Button>
          {/* 260612-e9t (#176): bulk habit assignment from the Agenda. The
              assigned habit carries its template's recurring schedule (the dialog
              copies scheduleCadence/Weekdays/etc. server-side). */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[40px] rounded-full"
            onClick={() => setBulkHabitOpen(true)}
            disabled={clients.length === 0}
          >
            {t("bulkAssignHabit")}
          </Button>
        </div>
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
        {clients.length > CLIENT_SEARCH_MIN_CLIENTS ? (
          <div className="relative mt-4 max-w-sm">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder={t("clientSearchPlaceholder")}
              aria-label={t("clientSearchPlaceholder")}
              className="min-h-[44px] rounded-full pl-9"
              data-testid="calendar-client-search"
            />
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleClients.length === 0 && clientQuery.trim() ? (
            <p className="text-sm text-muted-foreground">
              {t("clientSearchEmpty")}
            </p>
          ) : null}
          {visibleClients.map((c) => {
            const active = selectedIds.has(c.uid);
            const palette = paletteFor(c.uid, clientColorOrder);
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
            <Dumbbell className="size-4 text-warning" />
            {t("workouts")}
          </label>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full px-3 text-sm">
            <input
              type="checkbox"
              checked={showHabits}
              onChange={(e) => setShowHabits(e.target.checked)}
              className="size-4 rounded border accent-primary"
            />
            <Circle className="size-4 text-success" />
            {t("habits")}
          </label>
        </div>
      </Card>

      {/* ── Calendar surface ───────────────────────────────────────────── */}
      {selectedIds.size === 0 ? (
        <div className="rounded-card border border-dashed p-10 text-center text-sm text-muted-foreground">
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
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-1 overflow-hidden rounded-t-card">
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
                  const birthdayNames = clients
                    .filter(
                      (c) =>
                        selectedIds.has(c.uid) &&
                        isBirthdayOn(c.birthDate ?? null, civil),
                    )
                    .map((c) => ({
                      name: c.displayName,
                      age: ageOnCivilDate(c.birthDate ?? null, civil),
                    }));
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
                      clientColorOrder={clientColorOrder}
                      showWorkouts={showWorkouts}
                      showHabits={showHabits}
                      birthdayBadge={birthdayBadge}
                      birthdayNames={birthdayNames}
                      locale={locale}
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
                      onDragEndChip={clearDrag}
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
                        const isBirthday = isBirthdayOn(client.birthDate ?? null, civil);
                        const birthdayAge = ageOnCivilDate(client.birthDate ?? null, civil);
                        return (
                          <ClientDayCell
                            key={civil}
                            civil={civil}
                            isToday={isToday}
                            birthdayBadge={birthdayBadge}
                            isBirthday={isBirthday}
                            birthdayAge={birthdayAge}
                            locale={locale}
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
                            onDragEndChip={clearDrag}
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
      <section className="rounded-card border bg-card/95 p-3 text-xs shadow-sm">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Referencia de colores
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <LegendItem
            label="Programado"
            sample="cliente"
            note="usa el color asignado al tocarlo"
          />
          <LegendItem
            label="Completado"
            tone="border-success/50 bg-success/15 text-success"
          />
          <LegendItem
            label="No realizado"
            tone="border-danger/40 bg-danger/10 text-danger"
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
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-card border bg-background p-4 shadow-2xl"
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
          onMoveTo={(newDate) => {
            const chip = findWorkoutChip(payload.workoutsByDay, detailAssignmentId);
            setDetailAssignmentId(null);
            if (chip) requestMove(chip, newDate);
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

      {/* ── 260612-e9t (#176): bulk habit assignment from the Agenda ─────── */}
      <BulkAssignHabitDialog
        open={bulkHabitOpen}
        onOpenChange={setBulkHabitOpen}
        clients={clients.map((c) => ({
          uid: c.uid,
          displayName: c.displayName,
        }))}
        onAssigned={() => {
          // Refresh the month so newly assigned habits appear on the calendar.
          queryClient.invalidateQueries({ queryKey: ["schedule"] });
          setBulkHabitOpen(false);
        }}
      />

      {clients.length === 0 ? (
        <p className="rounded-card border border-dashed p-6 text-center text-sm text-muted-foreground">
          No tenés clientes activos todavía.
        </p>
      ) : null}
    </div>
  );

  // ── Inner components ─────────────────────────────────────────────────
  // (Inline so the chip palette + drag handlers share closure scope.)
  // The Day cell is split out so the markup above stays readable.
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
            "border-warning bg-warning-soft text-warning",
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
