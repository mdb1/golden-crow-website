"use client";

// bulk-assign-form.tsx
//
// Trainer Bulk Assign form (WTPL-06). Builds a multi-client selection via
// shadcn Checkbox + a TanStack-Table-like list, picks a template + a civil
// date, opens BulkConfirmModal listing every (client, date) pair, then
// fires `bulkAssignTemplate` Server Action on confirm.
//
// CIVIL-DATE CONTRACT (Pitfall 1):
//   - Calendar uses local-time Date with the parseCivilToLocalDate /
//     formatLocalDateToCivil bridge (same pattern as AssignTemplateModal).
//   - Default civil-date = today in the trainer's timezone via
//     civilDateToday(trainerTimezone).
//
// CONTRACT (locked, do not regress):
//   - Submit button is disabled when clientIds.length < 1 OR > 166.
//   - Submit opens the BulkConfirmModal — does NOT call the Server Action
//     yet (per CONTEXT.md §Specifics line 165 — confirm-before-write).
//   - On confirm, the FINAL subset (post-uncheck) is what gets written.
//   - Success toast: "Assigned to N clients" (the actual N count from the
//     Server-Action response). Redirect to /schedule?clientId=<first>.
//   - Error toast: surfaces the verbatim error message from the Server
//     Action — no UID lists (T-04-24).

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { useWorkoutTemplates } from "@/lib/gc-fitness/workout-templates-listener";
import { bulkAssignTemplate } from "@/lib/gc-fitness/workout-assignment-actions";
import { MAX_CLIENTS_PER_BATCH } from "@/lib/gc-fitness/workout-assignment-schema";
import {
  addCivilMonths,
  END_DATE_PRESET_MONTHS,
} from "@/lib/gc-fitness/end-date-presets";
import type { ClientRosterEntry } from "@/lib/gc-fitness/client-roster";

import { BulkConfirmModal } from "./bulk-confirm-modal";

interface BulkAssignFormProps {
  clients: ClientRosterEntry[];
  trainerTimezone?: string;
}

// 260612-e9t (#175): same cadence vocabulary the single-client
// AssignTemplateModal exposes. "once" → no recurrence (single date on the
// picked day, byte-identical to the pre-recurrence bulk path).
type RecurrenceMode = "once" | "weekly" | "daily" | "everyN" | "monthly";

type BulkRecurrenceRule =
  | { kind: "daily" }
  | { kind: "weekly"; weekday: number }
  | { kind: "weekly_days"; weekdays: number[] }
  | { kind: "every_n_days"; everyN: number }
  | { kind: "monthly"; dayOfMonth: number };

const BULK_WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function parseCivilToLocalDate(civil: string): Date {
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDateToCivil(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function BulkAssignForm({
  clients,
  trainerTimezone,
}: BulkAssignFormProps) {
  const t = useTranslations("schedule.bulkAssign");
  const router = useRouter();
  const { data: templates, isLoading: templatesLoading } = useWorkoutTemplates();
  const resolvedTimezone =
    trainerTimezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";

  const [templateId, setTemplateId] = useState<string>("");
  const [civilDate, setCivilDate] = useState<string>(() =>
    civilDateToday(resolvedTimezone),
  );
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [meetingNotes, setMeetingNotes] = useState<string>("");
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 260612-e9t (#175): recurrence picker state, mirroring AssignTemplateModal.
  const [mode, setMode] = useState<RecurrenceMode>("once");
  const [recurringWeekdays, setRecurringWeekdays] = useState<Set<number>>(
    () => new Set([parseCivilToLocalDate(civilDateToday(resolvedTimezone)).getDay()]),
  );
  const [recurringEveryN, setRecurringEveryN] = useState<number>(2);
  const [recurringEveryNDraft, setRecurringEveryNDraft] = useState<string>("2");
  const [recurringEndEnabled, setRecurringEndEnabled] = useState(true);
  const [recurringEndDate, setRecurringEndDate] = useState<string>(() =>
    addCivilMonths(civilDateToday(resolvedTimezone), 3),
  );
  const [recurringEndPresetMonths, setRecurringEndPresetMonths] = useState<
    number | null
  >(3);

  function toggleWeekday(idx: number) {
    setRecurringWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        // Never let the multi-select drop to zero weekdays.
        if (next.size > 1) next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  // Build the canonical recurrence rule from the current mode (null for "once").
  function buildRecurrence(): BulkRecurrenceRule | null {
    if (mode === "once") return null;
    if (mode === "daily") return { kind: "daily" };
    if (mode === "everyN") return { kind: "every_n_days", everyN: recurringEveryN };
    if (mode === "monthly") {
      return { kind: "monthly", dayOfMonth: parseCivilToLocalDate(civilDate).getDate() };
    }
    const weekdays = Array.from(recurringWeekdays).sort((a, b) => a - b);
    return weekdays.length === 1
      ? { kind: "weekly", weekday: weekdays[0] }
      : { kind: "weekly_days", weekdays };
  }

  // Human-readable recurrence summary for the confirm modal (null when once).
  const recurrenceSummary = useMemo(() => {
    if (mode === "once") return null;
    if (mode === "daily") return t("summaryDaily");
    if (mode === "everyN") return t("summaryEveryN", { n: recurringEveryN });
    if (mode === "monthly") {
      return t("summaryMonthly", {
        day: parseCivilToLocalDate(civilDate).getDate(),
      });
    }
    const labels = Array.from(recurringWeekdays)
      .sort((a, b) => a - b)
      .map((idx) => t(`weekdays.${BULK_WEEKDAY_KEYS[idx]}`).slice(0, 3))
      .join(", ");
    return t("summaryWeekly", { days: labels });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, recurringEveryN, recurringWeekdays, civilDate, t]);

  const selectedClients = useMemo(
    () => clients.filter((c) => selectedUids.has(c.uid)),
    [clients, selectedUids],
  );

  const selectedTemplate = useMemo(
    () => (templates ?? []).find((t) => t.id === templateId),
    [templates, templateId],
  );

  const isWithinCap = selectedUids.size >= 1 && selectedUids.size <= MAX_CLIENTS_PER_BATCH;

  function localizeBulkAssignError(message: string): string {
    if (message.includes("Pick at least one client")) {
      return t("errorKeepOne");
    }
    if (
      message.includes("Bulk-assign supports at most") ||
      message.includes("at most")
    ) {
      return t("overCapMessage", {
        count: selectedUids.size,
        cap: MAX_CLIENTS_PER_BATCH,
      });
    }
    if (message.includes("templateId is required") || message.includes("Template not found")) {
      return t("errorPickTemplate");
    }
    return t("errorBulkFailed");
  }

  function toggleUid(uid: string) {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function selectAll() {
    setSelectedUids(new Set(clients.slice(0, MAX_CLIENTS_PER_BATCH).map((c) => c.uid)));
  }

  function selectNone() {
    setSelectedUids(new Set());
  }

  async function onConfirm(finalClientIds: string[]) {
    if (!selectedTemplate) {
      toast.error(t("errorPickTemplate"));
      return;
    }
    if (finalClientIds.length === 0) {
      toast.error(t("errorKeepOne"));
      return;
    }
    setSubmitting(true);
    try {
      const recurrence = buildRecurrence();
      const result = await bulkAssignTemplate({
        templateId,
        clientIds: finalClientIds,
        scheduledFor: civilDate,
        scheduledTime: scheduledTime || undefined,
        meetingNotes: meetingNotes.trim() || undefined,
        timezone: resolvedTimezone,
        // Only send recurrence/endDate when recurring — keeps the "once" path
        // byte-identical to the pre-260612 single-date submit.
        ...(recurrence ? { recurrence } : {}),
        ...(recurrence && recurringEndEnabled
          ? { endDate: recurringEndDate }
          : {}),
      });
      if (recurrence) {
        // Recurring: one doc per (client × matching date). result.ids.length is
        // the total doc count; surface the CLIENT count in the success toast.
        toast.success(
          t("successRecurring", { count: finalClientIds.length }),
        );
      } else {
        toast.success(
          result.ids.length === 1
            ? t("successSingular", { count: result.ids.length })
            : t("successPlural", { count: result.ids.length }),
        );
      }
      setConfirmOpen(false);
      // Navigate to the first client's schedule view to give the trainer
      // an immediate "here's what you just wrote" surface.
      const firstClientId = finalClientIds[0];
      router.push(`/gc-fitness/schedule?clientId=${firstClientId}`);
    } catch (err) {
      const message = err instanceof Error
        ? localizeBulkAssignError(err.message)
        : t("errorBulkFailed");
      // Localized + normalized user-facing error (no UID lists / internals).
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("templateAndDate")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("templateLabel")}</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    templatesLoading ? t("templateLoading") : t("templatePlaceholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name.en} · {tpl.tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("dayLabel")}</label>
            <Calendar
              mode="single"
              selected={parseCivilToLocalDate(civilDate)}
              onSelect={(d) => {
                if (d) setCivilDate(formatLocalDateToCivil(d));
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t("scheduledFor", { date: civilDate })}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("timeLabel")}</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(event) => setScheduledTime(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("meetingNotesLabel")}</label>
              <textarea
                value={meetingNotes}
                onChange={(event) => setMeetingNotes(event.target.value)}
                placeholder={t("meetingNotesPlaceholder")}
                className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* 260612-e9t (#175): recurrence picker (mirrors AssignTemplateModal). */}
          <div className="flex flex-col gap-3 md:col-span-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("modeLabel")}</label>
              <Select
                value={mode}
                onValueChange={(value) => setMode(value as RecurrenceMode)}
              >
                <SelectTrigger className="w-full md:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">{t("modeOnce")}</SelectItem>
                  <SelectItem value="weekly">{t("modeWeekly")}</SelectItem>
                  <SelectItem value="daily">{t("modeDaily")}</SelectItem>
                  <SelectItem value="everyN">{t("modeEveryN")}</SelectItem>
                  <SelectItem value="monthly">{t("modeMonthly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "weekly" ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t("repeatOnLabel")}</label>
                <div className="flex flex-wrap gap-2">
                  {BULK_WEEKDAY_KEYS.map((key, idx) => {
                    const active = recurringWeekdays.has(idx);
                    return (
                      <Button
                        key={key}
                        type="button"
                        variant={active ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleWeekday(idx)}
                        aria-pressed={active}
                      >
                        {t(`weekdays.${key}`).slice(0, 3)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {mode === "everyN" ? (
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="bulk-every-n-input"
                >
                  {t("repeatEveryNLabel")}
                </label>
                <input
                  id="bulk-every-n-input"
                  type="number"
                  min={2}
                  max={30}
                  value={recurringEveryNDraft}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setRecurringEveryNDraft(raw);
                    if (raw.trim() === "") return;
                    const next = Number(raw);
                    if (!Number.isFinite(next)) return;
                    setRecurringEveryN(Math.max(2, Math.min(30, next)));
                  }}
                  onBlur={() => {
                    const next = Number(recurringEveryNDraft);
                    const normalized = Number.isFinite(next)
                      ? Math.max(2, Math.min(30, next))
                      : recurringEveryN;
                    setRecurringEveryN(normalized);
                    setRecurringEveryNDraft(String(normalized));
                  }}
                  className="h-10 w-24 rounded-md border bg-background px-3 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t("repeatEveryNHint", { n: recurringEveryN })}
                </p>
              </div>
            ) : null}

            {mode === "monthly" ? (
              <p className="text-xs text-muted-foreground">
                {t("repeatMonthlyHint", {
                  day: parseCivilToLocalDate(civilDate).getDate(),
                })}
              </p>
            ) : null}

            {mode !== "once" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <input
                    id="bulk-recurring-end-enabled"
                    type="checkbox"
                    checked={recurringEndEnabled}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setRecurringEndEnabled(next);
                      if (next) {
                        const preset = recurringEndPresetMonths ?? 3;
                        setRecurringEndPresetMonths(preset);
                        setRecurringEndDate(addCivilMonths(civilDate, preset));
                      }
                    }}
                    className="h-4 w-4 rounded border"
                  />
                  <label
                    htmlFor="bulk-recurring-end-enabled"
                    className="text-sm"
                  >
                    {t("setEndDate")}
                  </label>
                </div>
                {recurringEndEnabled ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">
                      {t("endDateLabel")}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {END_DATE_PRESET_MONTHS.map((months) => {
                        const active =
                          recurringEndPresetMonths === months &&
                          recurringEndDate === addCivilMonths(civilDate, months);
                        return (
                          <Button
                            key={months}
                            type="button"
                            variant={active ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setRecurringEndPresetMonths(months);
                              setRecurringEndDate(
                                addCivilMonths(civilDate, months),
                              );
                            }}
                          >
                            {t("endDatePresetMonths", { months })}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("endDateValue", { date: recurringEndDate })}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("clientsHeading", { count: selectedUids.size })}</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              {t("selectAll")}
            </Button>
            <Button variant="ghost" size="sm" onClick={selectNone}>
              {t("clear")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noClients")}</p>
          ) : (
            <div className="max-h-96 overflow-auto rounded border">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs">
                  <tr>
                    <th className="w-10 p-2"></th>
                    <th className="p-2">{t("tableName")}</th>
                    <th className="p-2">{t("tableEmail")}</th>
                    <th className="p-2">{t("tableTimezone")}</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const checked = selectedUids.has(c.uid);
                    return (
                      <tr
                        key={c.uid}
                        className="border-b last:border-b-0 hover:bg-muted/30"
                      >
                        <td className="p-2">
                          <Checkbox
                            id={`select-${c.uid}`}
                            checked={checked}
                            onCheckedChange={() => toggleUid(c.uid)}
                            aria-label={t("selectClientAria", { name: c.displayName })}
                          />
                        </td>
                        <td className="p-2">
                          <label
                            htmlFor={`select-${c.uid}`}
                            className="cursor-pointer font-medium"
                          >
                            {c.displayName}
                          </label>
                        </td>
                        <td className="p-2 text-muted-foreground">{c.email}</td>
                        <td className="p-2 text-muted-foreground">
                          {c.timezone ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {selectedUids.size > MAX_CLIENTS_PER_BATCH ? (
            <p className="mt-2 text-xs text-destructive">
              {t("overCapMessage", {
                count: selectedUids.size,
                cap: MAX_CLIENTS_PER_BATCH,
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!templateId || !isWithinCap}
        >
          {selectedUids.size === 1
            ? t("reviewSingular", { count: selectedUids.size })
            : t("reviewPlural", { count: selectedUids.size })}
        </Button>
      </div>

      <BulkConfirmModal
        open={confirmOpen}
        onOpenChange={(open) => !submitting && setConfirmOpen(open)}
        templateName={
          selectedTemplate ? selectedTemplate.name.en : t("unknownTemplate")
        }
        scheduledFor={civilDate}
        candidates={selectedClients}
        recurrenceSummary={recurrenceSummary}
        submitting={submitting}
        onConfirm={onConfirm}
      />
    </div>
  );
}
