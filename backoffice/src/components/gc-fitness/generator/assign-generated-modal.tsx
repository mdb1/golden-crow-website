"use client";

// assign-generated-modal.tsx
//
// Multi-client + recurrence assignment launched from the generator success
// screen (issue #296: "allow user to select one or multiple clients, and to
// select the recurrence"). Thin wrapper over the existing `bulkAssignTemplate`
// Server Action — same cadence vocabulary as AssignTemplateModal /
// BulkAssignForm so behavior matches the rest of the schedule surface.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { bulkAssignTemplate } from "@/lib/gc-fitness/workout-assignment-actions";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { addCivilMonths } from "@/lib/gc-fitness/end-date-presets";
import type { ClientRosterEntry } from "@/lib/gc-fitness/client-roster";

import { useGeneratorStrings } from "./strings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  clients: ClientRosterEntry[];
  trainerTimezone?: string;
}

type Mode = "once" | "weekly" | "daily" | "everyN" | "monthly";

function parseCivilToLocalDate(civil: string): Date {
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function AssignGeneratedModal({
  open,
  onOpenChange,
  templateId,
  clients,
  trainerTimezone,
}: Props) {
  const s = useGeneratorStrings();

  const tz = useMemo(
    () => trainerTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    [trainerTimezone],
  );
  const today = useMemo(() => civilDateToday(tz), [tz]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState<string>(today);
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [mode, setMode] = useState<Mode>("once");
  const [weekdays, setWeekdays] = useState<Set<number>>(
    () => new Set([parseCivilToLocalDate(today).getDay()]),
  );
  const [everyN, setEveryN] = useState(2);
  const [endEnabled, setEndEnabled] = useState(true);
  const [endDate, setEndDate] = useState<string>(addCivilMonths(today, 3));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setDate(today);
    setScheduledTime("");
    setMode("once");
    setWeekdays(new Set([parseCivilToLocalDate(today).getDay()]));
    setEveryN(2);
    setEndEnabled(true);
    setEndDate(addCivilMonths(today, 3));
  }, [open, today]);

  function toggleClient(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === clients.length ? new Set() : new Set(clients.map((c) => c.uid)),
    );
  }
  function toggleWeekday(idx: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        if (next.size === 1) return next;
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  async function onSubmit() {
    // #307 — unreachable while the CTA is disabled: the assign button is
    // `disabled={submitting || selected.size === 0}`, so `s.pickClient` has
    // never been rendered on either half of the dictionary.
    if (selected.size === 0) {
      toast.error(s.pickClient);
      return;
    }
    setSubmitting(true);
    try {
      let recurrence:
        | { kind: "daily" }
        | { kind: "weekly"; weekday: number }
        | { kind: "weekly_days"; weekdays: number[] }
        | { kind: "every_n_days"; everyN: number }
        | { kind: "monthly"; dayOfMonth: number }
        | undefined;
      if (mode === "daily") recurrence = { kind: "daily" };
      else if (mode === "everyN") recurrence = { kind: "every_n_days", everyN };
      else if (mode === "monthly")
        recurrence = { kind: "monthly", dayOfMonth: parseCivilToLocalDate(date).getDate() };
      else if (mode === "weekly") {
        const days = Array.from(weekdays).sort((a, b) => a - b);
        recurrence =
          days.length === 1
            ? { kind: "weekly", weekday: days[0] }
            : { kind: "weekly_days", weekdays: days };
      }

      const result = await bulkAssignTemplate({
        templateId,
        clientIds: Array.from(selected),
        scheduledFor: date,
        scheduledTime: scheduledTime || undefined,
        timezone: tz,
        recurrence,
        endDate: mode !== "once" && endEnabled ? endDate : undefined,
      });
      toast.success(s.assignedOk.replace("{n}", String(result.ids.length)));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : s.assignFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{s.assignTitle}</DialogTitle>
          <DialogDescription>{s.assignSubtitle}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
          {/* clients */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {s.clients} · {selected.size}
              </span>
              {clients.length > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
                  {s.selectAll}
                </Button>
              ) : null}
            </div>
            {clients.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {s.noClients}
              </p>
            ) : (
              <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {clients.map((c) => {
                  const active = selected.has(c.uid);
                  return (
                    <button
                      key={c.uid}
                      type="button"
                      onClick={() => toggleClient(c.uid)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:border-foreground/30",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                        )}
                      >
                        {active ? "✓" : ""}
                      </span>
                      <span className="min-w-0 truncate">
                        {c.coachNickname || c.displayName || c.email}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* cadence */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{s.cadence}</label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">{s.once}</SelectItem>
                  <SelectItem value="weekly">{s.weekly}</SelectItem>
                  <SelectItem value="daily">{s.daily}</SelectItem>
                  <SelectItem value="everyN">{s.everyN}</SelectItem>
                  <SelectItem value="monthly">{s.monthly}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{s.day}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
            </div>
          </div>

          {mode === "weekly" ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{s.repeatOn}</label>
              <div className="flex flex-wrap gap-2">
                {s.weekdays.map((label, idx) => (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={weekdays.has(idx) ? "default" : "outline"}
                    aria-pressed={weekdays.has(idx)}
                    onClick={() => toggleWeekday(idx)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "everyN" ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{s.everyNDays}</label>
              <input
                type="number"
                min={2}
                max={30}
                value={everyN}
                onChange={(e) =>
                  setEveryN(Math.max(2, Math.min(30, Number(e.target.value) || 2)))
                }
                className="h-10 w-24 rounded-md border bg-background px-3 text-sm"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{s.time}</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
            </div>
            {mode !== "once" ? (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={endEnabled}
                    onChange={(e) => setEndEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border"
                  />
                  {s.setEnd}
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={date}
                  disabled={!endEnabled}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-10 rounded-md border bg-background px-3 text-sm disabled:opacity-50"
                />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {s.cancel}
          </Button>
          <Button onClick={onSubmit} disabled={submitting || selected.size === 0}>
            {submitting ? s.assigning : s.assignAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
