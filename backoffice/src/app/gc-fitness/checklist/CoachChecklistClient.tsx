"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Repeat,
  Trash2,
  User,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ChecklistEditDialog } from "@/components/gc-fitness/ChecklistEditDialog";
import { civilDateFormat, civilDateToday } from "@/lib/gc-fitness/civil-date";
import { ChecklistClientPicker } from "@/components/gc-fitness/ChecklistClientPicker";
import { ChecklistRecurrenceFields } from "@/components/gc-fitness/ChecklistRecurrenceFields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CoachChecklistItem } from "@/lib/gc-fitness/coach-checklist-actions";
import {
  createCoachChecklistItem,
  deleteCoachChecklistItem,
  setCoachChecklistItemCompleted,
} from "@/lib/gc-fitness/coach-checklist-actions";
import { cn } from "@/lib/utils";

export interface ChecklistClientOption {
  uid: string;
  displayName: string;
  photoURL?: string | null;
}

interface Props {
  items: CoachChecklistItem[];
  clients: ChecklistClientOption[];
  /**
   * The coach's IANA zone, resolved server-side (#747). Every civil day and
   * every displayed hour below is keyed off it — the host getters this replaced
   * were UTC on the server render, so an item due at 21:00 in Buenos Aires
   * headed the WRONG day until hydration corrected it.
   */
  timezone: string;
}

const RECURRENCE_LABEL: Record<string, string> = {
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
};

// 1=Mon … 7=Sun → short labels for the list pill.
const WEEKDAY_LETTER = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function recurrenceSummary(item: CoachChecklistItem): string {
  const base = RECURRENCE_LABEL[item.recurrence] ?? item.recurrence;
  if (item.recurrence === "weekly" && item.recurrenceWeekdays.length > 0) {
    const days = [...item.recurrenceWeekdays]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LETTER[d] ?? d)
      .join(", ");
    return `${base} · ${days}`;
  }
  if (item.recurrence === "monthly" && item.recurrenceMonthDays.length > 0) {
    const days = [...item.recurrenceMonthDays].sort((a, b) => a - b).join(", ");
    return `${base} · día ${days}`;
  }
  return base;
}

export function CoachChecklistClient({ items, clients, timezone }: Props) {
  const t = useTranslations("coachChecklist");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCompleted, setShowCompleted] = useState(false);
  // Recurrence validity (weekly/monthly need ≥1 day) gates the submit button.
  const [recurrenceValid, setRecurrenceValid] = useState(true);
  // Bumped after a successful create so the recurrence fields remount/reset.
  const [recurrenceKey, setRecurrenceKey] = useState(0);
  const now = useMemo(() => new Date(), []);
  const activeItems = useMemo(
    () => items.filter((item) => !item.completed),
    [items],
  );
  const completedItems = useMemo(
    () => items.filter((item) => item.completed),
    [items],
  );
  const visibleItems = showCompleted ? items : activeItems;
  const groups = useMemo(
    () => groupItemsByDate(visibleItems, now, locale, t, timezone),
    [locale, now, t, timezone, visibleItems],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      await createCoachChecklistItem({
        title: String(formData.get("title") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        dueDate: String(formData.get("dueDate") ?? ""),
        dueTime: String(formData.get("dueTime") ?? ""),
        clientIds: formData.getAll("clientIds").map((v) => String(v)),
        recurrence: String(formData.get("recurrence") ?? "none"),
        recurrenceEndsOn: String(formData.get("recurrenceEndsOn") ?? ""),
        recurrenceWeekdays: formData
          .getAll("recurrenceWeekdays")
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n)),
        recurrenceMonthDays: formData
          .getAll("recurrenceMonthDays")
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n)),
      });
      form.reset();
      setRecurrenceKey((k) => k + 1);
      router.refresh();
    });
  }

  function toggleItem(item: CoachChecklistItem) {
    startTransition(async () => {
      await setCoachChecklistItemCompleted(item.id, !item.completed);
      router.refresh();
    });
  }

  function deleteItem(item: CoachChecklistItem) {
    startTransition(async () => {
      await deleteCoachChecklistItem(item.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="gc-page-title text-xl">{t("newTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="checklist-title">{t("titleLabel")}</Label>
                <Input
                  id="checklist-title"
                  name="title"
                  required
                  maxLength={160}
                  placeholder={t("titlePlaceholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="checklist-notes">{t("notesLabel")}</Label>
                <Textarea
                  id="checklist-notes"
                  name="notes"
                  maxLength={500}
                  placeholder={t("notesPlaceholder")}
                  className="min-h-11"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Clientes</Label>
              <ChecklistClientPicker clients={clients} />
            </div>
            <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="checklist-date">{t("dateLabel")}</Label>
                <Input id="checklist-date" name="dueDate" type="date" className="h-11" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="checklist-time">{t("timeLabel")}</Label>
                <Input id="checklist-time" name="dueTime" type="time" className="h-11" />
              </div>
            </div>
            <ChecklistRecurrenceFields
              key={recurrenceKey}
              idPrefix="checklist-create"
              onValidityChange={setRecurrenceValid}
            />
            <Button
              type="submit"
              disabled={pending || !recurrenceValid}
              className="h-11 justify-self-start rounded-full px-6"
            >
              {pending ? t("saving") : t("addCta")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="gc-page-title text-xl">{t("listTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("activeCount", { count: activeItems.length })}
            </p>
          </div>
          {completedItems.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() => setShowCompleted((value) => !value)}
            >
              {showCompleted ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
              {showCompleted
                ? t("hideCompleted")
                : t("showCompleted", { count: completedItems.length })}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {visibleItems.length === 0 ? (
            <div className="rounded-md border border-dashed bg-background/40 px-3 py-10 text-center text-sm text-muted-foreground">
              {items.length === 0 ? t("empty") : t("emptyActive")}
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {group.overdue ? (
                    <AlertTriangle className="size-4 text-destructive" />
                  ) : group.completed ? (
                    <CheckCircle2 className="size-4 text-chart-3" />
                  ) : (
                    <CalendarClock className="size-4 text-muted-foreground" />
                  )}
                  <h3
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      group.overdue ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {group.label}
                  </h3>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {group.items.length}
                  </span>
                </div>
                <div className="grid gap-2">
                  {group.items.map((item) => {
                    const overdue = isOverdue(item, now);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors",
                          item.completed && "opacity-65",
                          overdue &&
                            "border-destructive/35 bg-destructive/[0.04] shadow-sm",
                        )}
                      >
                        <Checkbox
                          checked={item.completed}
                          onCheckedChange={() => toggleItem(item)}
                          disabled={pending}
                          aria-label={t("toggleAria", { title: item.title })}
                          className={cn(
                            "mt-1",
                            overdue && "border-destructive data-[state=checked]:bg-destructive",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={cn(
                                "font-medium text-foreground",
                                item.completed && "line-through",
                              )}
                            >
                              {item.title}
                            </p>
                            {overdue ? (
                              <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                                {t("overdueBadge")}
                              </span>
                            ) : null}
                            {item.recurrence !== "none" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                <Repeat className="size-3" />
                                {recurrenceSummary(item)}
                                {item.recurrenceEndsOn
                                  ? ` · hasta ${item.recurrenceEndsOn}`
                                  : ""}
                              </span>
                            ) : null}
                          </div>
                          {item.clients.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {item.clients.map((c) => (
                                <Link
                                  key={c.id}
                                  href={`/gc-fitness/clients/${c.id}`}
                                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-primary hover:underline"
                                >
                                  <User className="size-3" />
                                  {c.name}
                                </Link>
                              ))}
                            </div>
                          ) : null}
                          {item.notes ? (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                              {item.notes}
                            </p>
                          ) : null}
                          <p
                            className={cn(
                              "mt-2 inline-flex items-center gap-1.5 text-xs",
                              overdue ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            <CalendarClock className="size-3.5" />
                            {item.dueAt
                              ? formatDateTime(item.dueAt, locale, timezone)
                              : t("noDueAt")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <ChecklistEditDialog
                            item={item}
                            timezone={timezone}
                            clients={clients}
                            trigger={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t("editAria", { title: item.title })}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteItem(item)}
                            disabled={pending}
                            aria-label={t("deleteAria", { title: item.title })}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ChecklistGroup {
  key: string;
  label: string;
  items: CoachChecklistItem[];
  overdue: boolean;
  completed: boolean;
}

function groupItemsByDate(
  items: CoachChecklistItem[],
  now: Date,
  locale: string,
  t: ReturnType<typeof useTranslations>,
  timezone: string,
): ChecklistGroup[] {
  const sorted = [...items].sort(compareItems);
  const groups = new Map<string, ChecklistGroup>();
  for (const item of sorted) {
    const groupMeta = groupForItem(item, now, locale, t, timezone);
    const existing = groups.get(groupMeta.key);
    if (existing) existing.items.push(item);
    else groups.set(groupMeta.key, { ...groupMeta, items: [item] });
  }
  return Array.from(groups.values());
}

function groupForItem(
  item: CoachChecklistItem,
  now: Date,
  locale: string,
  t: ReturnType<typeof useTranslations>,
  timezone: string,
): Omit<ChecklistGroup, "items"> {
  if (item.completed) {
    return {
      key: "completed",
      label: t("completedTitle"),
      overdue: false,
      completed: true,
    };
  }
  if (!item.dueAt) {
    return {
      key: "no-date",
      label: t("noDateTitle"),
      overdue: false,
      completed: false,
    };
  }
  if (isOverdue(item, now)) {
    return {
      key: "overdue",
      label: t("overdueTitle"),
      overdue: true,
      completed: false,
    };
  }

  const dateKey = civilDateKey(item.dueAt, timezone);
  return {
    key: dateKey,
    label: formatDateHeading(item.dueAt, now, locale, t, timezone),
    overdue: false,
    completed: false,
  };
}

function compareItems(a: CoachChecklistItem, b: CoachChecklistItem): number {
  if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
  const aDue = dueSortValue(a);
  const bDue = dueSortValue(b);
  if (aDue !== bDue) return aDue - bDue;
  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
}

function dueSortValue(item: CoachChecklistItem): number {
  if (!item.dueAt) return Number.MAX_SAFE_INTEGER;
  const ms = Date.parse(item.dueAt);
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

function isOverdue(item: CoachChecklistItem, now: Date): boolean {
  if (item.completed || !item.dueAt) return false;
  const dueMs = Date.parse(item.dueAt);
  return Number.isFinite(dueMs) && dueMs < now.getTime();
}

function civilDateKey(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return civilDateFormat(date, timezone);
}

function formatDateHeading(
  iso: string,
  now: Date,
  locale: string,
  t: ReturnType<typeof useTranslations>,
  timezone: string,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const itemKey = civilDateKey(iso, timezone);
  const todayKey = civilDateToday(timezone, now);
  // +24h rather than `setDate(getDate() + 1)`: the latter steps the HOST
  // calendar, which is not the calendar the heading is keyed on.
  const tomorrowKey = civilDateFormat(new Date(now.getTime() + 86_400_000), timezone);
  if (itemKey === todayKey) return t("todayTitle");
  if (itemKey === tomorrowKey) return t("tomorrowTitle");
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(date);
}

function formatDateTime(iso: string, locale: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}
