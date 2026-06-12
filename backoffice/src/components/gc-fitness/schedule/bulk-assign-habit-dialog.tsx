"use client";

// bulk-assign-habit-dialog.tsx
//
// "One habit → many clients" assignment. Complements NewHabitDialog (which
// assigns ONE habit to ONE client/day). Opened from the habits page header
// (and reusable from the Agenda) so a trainer can roll a single template out
// to a whole roster at once.
//
// Flow:
//   1. Pick a habit TEMPLATE (reuses the ExistingHabitPicker search-list
//      pattern from new-habit-dialog.tsx).
//   2. Multi-select clients via a checkbox list of the ACTIVE roster
//      (pendingProvisioning clients are excluded by the caller).
//   3. Optional start date (defaults to today, editable).
//   4. Submit → assignHabitTemplate({ templateId, clientIds, startsOn }) →
//      toast "{n} assigned" → onAssigned() so the parent invalidates caches.
//
// The server action `assignHabitTemplate` already creates one per-client
// /habits doc per clientId, copying the template (description/photoUrl/
// youtubeUrl/sourceTemplateId/schedule). This dialog is the UI entry point.
//
// #176 (Round 2): the dialog now also exposes an explicit RECURRENCE selector
// (mirrors the single-client HabitForm schedule UI). It is seeded from the
// picked template's schedule, so the prior behavior is the default; the trainer
// can override the recurrence (one-time / daily / weekly weekdays / monthly
// days) before assigning, and the chosen schedule flows through
// `assignHabitTemplate({ schedule })` into every created habit doc in the exact
// wire format iOS/Android consume (scheduleType / scheduleCadence /
// scheduleWeekdays / scheduleMonthDays / scheduleDayOfMonth / endsOn).

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  assignHabitTemplate,
  listHabitTemplates,
  type HabitTemplateRow,
} from "@/lib/gc-fitness/habit-actions";

export interface BulkAssignClient {
  uid: string;
  displayName: string;
}

type ScheduleCadence = "daily" | "weekly" | "monthly";

// Mirrors HabitForm's WEEKDAY_KEYS — 1=Mon … 7=Sun (the wire values iOS/Android
// expect in scheduleWeekdays).
const WEEKDAY_KEYS = [
  { value: 1, key: "mon" },
  { value: 2, key: "tue" },
  { value: 3, key: "wed" },
  { value: 4, key: "thu" },
  { value: 5, key: "fri" },
  { value: 6, key: "sat" },
  { value: 7, key: "sun" },
] as const;
const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);

/**
 * The schedule the bulk dialog will send. Seeded from the picked template, then
 * editable. Sent to `assignHabitTemplate` as the `schedule` override.
 */
interface BulkSchedule {
  scheduleType: "recurring" | "one-time";
  scheduleCadence: ScheduleCadence;
  scheduleWeekdays: number[];
  scheduleMonthDays: number[];
  endsOn?: string;
}

function scheduleFromTemplate(tpl: HabitTemplateRow): BulkSchedule {
  const scheduleType = tpl.scheduleType === "one-time" ? "one-time" : "recurring";
  const scheduleCadence: ScheduleCadence =
    tpl.scheduleCadence === "weekly" || tpl.scheduleCadence === "monthly"
      ? tpl.scheduleCadence
      : "daily";
  return {
    scheduleType,
    scheduleCadence,
    scheduleWeekdays: Array.isArray(tpl.scheduleWeekdays)
      ? [...tpl.scheduleWeekdays]
      : [],
    scheduleMonthDays: Array.isArray(tpl.scheduleMonthDays)
      ? [...tpl.scheduleMonthDays]
      : typeof tpl.scheduleDayOfMonth === "number"
        ? [tpl.scheduleDayOfMonth]
        : [],
    endsOn: tpl.endsOn,
  };
}

interface BulkAssignHabitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ACTIVE roster (caller excludes pendingProvisioning clients). */
  clients: BulkAssignClient[];
  /** Fires after a successful assign so the parent can invalidate caches. */
  onAssigned: () => void;
}

function todayCivilDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function BulkAssignHabitDialog({
  open,
  onOpenChange,
  clients,
  onAssigned,
}: BulkAssignHabitDialogProps) {
  const t = useTranslations("habits.bulkAssign");
  const [selectedTemplate, setSelectedTemplate] =
    useState<HabitTemplateRow | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [startsOn, setStartsOn] = useState<string>(() => todayCivilDate());
  const [schedule, setSchedule] = useState<BulkSchedule | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Seed the recurrence selector from the picked template's schedule, so the
  // current "inherit the template" behavior is the default. Re-seeds whenever
  // the trainer picks a different template (and clears when they go back to the
  // picker). Trainer edits then live in `schedule` until the next template swap.
  useEffect(() => {
    setSchedule(
      selectedTemplate ? scheduleFromTemplate(selectedTemplate) : null,
    );
  }, [selectedTemplate]);

  function reset() {
    setSelectedTemplate(null);
    setSelectedClientIds(new Set());
    setStartsOn(todayCivilDate());
    setSchedule(null);
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function toggleClient(uid: string) {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function selectAll() {
    setSelectedClientIds(new Set(clients.map((c) => c.uid)));
  }

  function clearAll() {
    setSelectedClientIds(new Set());
  }

  const selectedCount = selectedClientIds.size;
  const canSubmit =
    !!selectedTemplate && selectedCount > 0 && startsOn.length > 0;

  async function onSubmit() {
    if (!selectedTemplate || selectedCount === 0) return;
    setSubmitting(true);
    try {
      const result = await assignHabitTemplate({
        templateId: selectedTemplate.id,
        clientIds: Array.from(selectedClientIds),
        startsOn,
        ...(schedule
          ? {
              schedule: {
                scheduleType: schedule.scheduleType,
                ...(schedule.scheduleType === "recurring"
                  ? {
                      scheduleCadence: schedule.scheduleCadence,
                      ...(schedule.scheduleCadence === "weekly"
                        ? { scheduleWeekdays: schedule.scheduleWeekdays }
                        : {}),
                      ...(schedule.scheduleCadence === "monthly"
                        ? { scheduleMonthDays: schedule.scheduleMonthDays }
                        : {}),
                    }
                  : {}),
                ...(schedule.endsOn ? { endsOn: schedule.endsOn } : {}),
              },
            }
          : {}),
      });
      toast.success(t("assignedToast", { count: result.created }));
      onAssigned();
      handleOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("assignFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(96vw,72rem)] sm:max-w-5xl lg:max-w-6xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="flex flex-col gap-4">
              {/* Step 1 — habit template */}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">{t("habitLabel")}</p>
                {selectedTemplate ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {selectedTemplate.name.en || selectedTemplate.name.es}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedTemplate(null)}
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      {t("changeHabit")}
                    </button>
                  </div>
                ) : (
                  <BulkHabitPicker onPick={setSelectedTemplate} />
                )}
              </div>

              {/* Step 4 — recurrence (#176). Seeded from the template; editable. */}
              {selectedTemplate && schedule ? (
                <div className="flex flex-col gap-3 rounded-md border p-3">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-sm font-medium">{t("scheduleLabel")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("scheduleHint")}
                    </p>
                  </div>

                  {/* Type: recurring vs one-time */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("scheduleTypeLabel")}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(["recurring", "one-time"] as const).map((value) => {
                        const active = schedule.scheduleType === value;
                        return (
                          <Button
                            key={value}
                            type="button"
                            variant={active ? "default" : "outline"}
                            size="sm"
                            aria-pressed={active}
                            onClick={() =>
                              setSchedule((prev) =>
                                prev ? { ...prev, scheduleType: value } : prev,
                              )
                            }
                          >
                            {value === "recurring"
                              ? t("scheduleTypeRecurring")
                              : t("scheduleTypeOneTime")}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {schedule.scheduleType === "recurring" ? (
                    <>
                      {/* Cadence */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("cadenceLabel")}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {(["daily", "weekly", "monthly"] as const).map(
                            (cadence) => {
                              const active = schedule.scheduleCadence === cadence;
                              return (
                                <Button
                                  key={cadence}
                                  type="button"
                                  variant={active ? "default" : "outline"}
                                  size="sm"
                                  aria-pressed={active}
                                  onClick={() =>
                                    setSchedule((prev) => {
                                      if (!prev) return prev;
                                      const next: BulkSchedule = {
                                        ...prev,
                                        scheduleCadence: cadence,
                                      };
                                      // Seed a sensible default day when switching
                                      // to monthly with nothing chosen yet.
                                      if (
                                        cadence === "monthly" &&
                                        next.scheduleMonthDays.length === 0
                                      ) {
                                        next.scheduleMonthDays = [1];
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  {cadence === "daily"
                                    ? t("cadenceDaily")
                                    : cadence === "weekly"
                                      ? t("cadenceWeekly")
                                      : t("cadenceMonthly")}
                                </Button>
                              );
                            },
                          )}
                        </div>
                      </div>

                      {/* Weekly → weekday chips */}
                      {schedule.scheduleCadence === "weekly" ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {t("weekdaysLabel")}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {WEEKDAY_KEYS.map((weekday) => {
                              const active = schedule.scheduleWeekdays.includes(
                                weekday.value,
                              );
                              return (
                                <Button
                                  key={weekday.value}
                                  type="button"
                                  variant={active ? "default" : "outline"}
                                  size="sm"
                                  aria-pressed={active}
                                  onClick={() =>
                                    setSchedule((prev) => {
                                      if (!prev) return prev;
                                      const set = new Set(prev.scheduleWeekdays);
                                      if (set.has(weekday.value))
                                        set.delete(weekday.value);
                                      else set.add(weekday.value);
                                      return {
                                        ...prev,
                                        scheduleWeekdays: Array.from(set).sort(
                                          (a, b) => a - b,
                                        ),
                                      };
                                    })
                                  }
                                >
                                  {t(`weekdayShort.${weekday.key}`)}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {/* Monthly → day-of-month chips */}
                      {schedule.scheduleCadence === "monthly" ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {t("monthDaysLabel")}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {MONTH_DAY_OPTIONS.map((monthDay) => {
                              const active =
                                schedule.scheduleMonthDays.includes(monthDay);
                              return (
                                <Button
                                  key={monthDay}
                                  type="button"
                                  variant={active ? "default" : "outline"}
                                  size="sm"
                                  aria-pressed={active}
                                  onClick={() =>
                                    setSchedule((prev) => {
                                      if (!prev) return prev;
                                      const set = new Set(prev.scheduleMonthDays);
                                      if (set.has(monthDay)) set.delete(monthDay);
                                      else set.add(monthDay);
                                      return {
                                        ...prev,
                                        scheduleMonthDays: Array.from(set).sort(
                                          (a, b) => a - b,
                                        ),
                                      };
                                    })
                                  }
                                >
                                  {monthDay}
                                </Button>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t("monthDaysHint")}
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-4">
              {/* Step 2 — clients */}
              <div className="flex flex-col gap-1.5 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {t("clientsLabel", { count: selectedCount })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAll}
                      disabled={clients.length === 0}
                    >
                      {t("selectAll")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearAll}
                      disabled={selectedCount === 0}
                    >
                      {t("clearAll")}
                    </Button>
                  </div>
                </div>
                {clients.length === 0 ? (
                  <p className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">
                    {t("noClients")}
                  </p>
                ) : (
                  <ul className="flex max-h-[42vh] flex-col gap-0.5 overflow-y-auto rounded-md border p-2">
                    {clients.map((c) => {
                      const checked = selectedClientIds.has(c.uid);
                      return (
                        <li key={c.uid}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition hover:bg-accent",
                              checked && "bg-accent/60",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleClient(c.uid)}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {c.displayName}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Step 3 — start date */}
              <div className="flex flex-col gap-1.5 rounded-md border p-3">
                <label htmlFor="bulk-assign-starts-on" className="text-sm font-medium">
                  {t("startsOnLabel")}
                </label>
                <input
                  id="bulk-assign-starts-on"
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  className="h-10 w-48 rounded-md border bg-background px-3 text-sm"
                />
                <p className="text-xs text-muted-foreground">{t("startsOnHint")}</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!canSubmit || submitting}>
            {submitting
              ? t("assigning")
              : t("submit", { count: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Searchable template picker — mirrors the ExistingHabitPicker list pattern
 * from new-habit-dialog.tsx (search input + scrollable result list), trimmed
 * to the "pick one" use case for the bulk flow.
 */
function BulkHabitPicker({
  onPick,
}: {
  onPick: (tpl: HabitTemplateRow) => void;
}) {
  const t = useTranslations("habits.bulkAssign");
  const [search, setSearch] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["habit-templates", "bulk-assign-picker"],
    queryFn: () => listHabitTemplates(),
  });

  const filtered = useMemo(() => {
    const list = templates as HabitTemplateRow[];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((tpl) =>
      `${tpl.name.en} ${tpl.name.es}`.toLowerCase().includes(needle),
    );
  }, [templates, search]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md border px-3">
        <Search className="h-4 w-4 shrink-0 opacity-50" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <ul className="flex max-h-[35vh] flex-col gap-1 overflow-y-auto rounded-md border p-2">
        {isLoading ? (
          <li className="py-4 text-center text-sm text-muted-foreground">
            {t("loadingHabits")}
          </li>
        ) : filtered.length === 0 ? (
          <li className="py-4 text-center text-sm text-muted-foreground">
            {search.trim() ? t("noMatches") : t("noHabits")}
          </li>
        ) : (
          filtered.map((tpl) => {
            const esName =
              tpl.name.es && tpl.name.es !== tpl.name.en ? tpl.name.es : null;
            return (
              <li key={tpl.id}>
                <button
                  type="button"
                  onClick={() => onPick(tpl)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-accent"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {tpl.name.en || tpl.name.es}
                    </span>
                    {esName ? (
                      <span className="truncate text-xs italic text-muted-foreground">
                        {esName}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
