// notifications-feed.ts
//
// Pure model of the /gc-fitness/notifications feed (#507 — moved out of the
// page, which used to be 800+ lines mixing data loading, feed assembly and
// JSX). Everything here is deterministic given its inputs so it can be unit
// tested without Firestore; the reads live in `notifications-data.ts` and the
// rendering in `components/gc-fitness/notifications/`.
//
// Behaviour is byte-for-byte what the page did before the split: same renewal
// windows (workouts −7…+14 days, habits 0…+3 days), same sort order, same
// hard-coded es/en copy for the renewal rows (they predate next-intl here).

import type { BirthdayNotification } from "./birthday-notifications";
import type { HabitRow } from "./habit-actions";
import { isHabitScheduledOn } from "./habit-schedule";
import type { ActiveWorkoutSummary } from "./live-workout-types";
import type { PrNotification } from "./pr-notifications";

export type NotificationLocale = "en" | "es";
export type NotificationFilter = "all" | "prs" | "renewals" | "activations" | "birthdays";
export type NotificationKind = Exclude<NotificationFilter, "all">;
export type NotificationTone = "warning" | "brand" | "success" | "violet";

export type RenewalNotification = {
  id: string;
  kind: "workout" | "habit";
  occurredAtISO: string | null;
  clientId: string | null;
  clientName: string;
  title: string;
  detail: string;
  dueDate: string;
  dueLabel: string;
  actionHref: string;
  actionLabel: string;
};

export type ActivationNotification = {
  id: string;
  occurredAtISO: string | null;
  clientId: string;
  clientName: string;
  detail: string;
  actionHref: string;
  actionLabel: string;
};

/** One row of the unified feed. Icons are picked by `kind` at render time so
 * this module stays JSX-free. */
export type NotificationFeedItem = {
  id: string;
  kind: NotificationKind;
  sortAtISO: string | null;
  tone: NotificationTone;
  title: string;
  /** When set, the notification headline links to this href (e.g. the PR
   * notification's client name → client profile). */
  titleHref?: string;
  detail: string;
  detailItems?: string[];
  meta: string;
  actionHref: string;
  actionLabel: string;
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
  unread?: boolean;
  featured?: boolean;
};

export type ActiveWorkoutCardData = ActiveWorkoutSummary & {
  clientName: string;
};

export type NotificationFilterItem = {
  key: NotificationFilter;
  label: string;
  count: number;
  href: string;
};

/** The subset of a coach-activity row the workout-renewal builder reads. */
export type WorkoutActivityRow = {
  id: string;
  kind: string;
  occurredAt: string | null;
  clientId: string | null;
  clientName: string | null;
  title: string;
  detail: string | null;
};

/** The subset of a recent-log row the activation builder reads. */
export type ActivationLogRow = {
  id: string;
  category: string;
  eventAt: string | null;
  clientId: string;
  clientName: string;
  detail: string;
};

export type NotificationTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export const RENEWAL_WINDOW_DAYS = 14;

export function resolveNotificationFilter(raw: string | undefined): NotificationFilter {
  if (raw === "prs" || raw === "renewals" || raw === "activations" || raw === "birthdays") return raw;
  return "all";
}

export function formatWorkoutElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function isoMs(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function addCivilDays(civilDate: string, days: number): string {
  const [year, month, day] = civilDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetweenCivilDates(fromCivil: string, toCivil: string): number {
  const [fy, fm, fd] = fromCivil.split("-").map(Number);
  const [ty, tm, td] = toCivil.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

export function parseWorkoutSeriesDetail(detail: string | null): { endDate: string } | null {
  if (!detail) return null;
  const parts = detail.split(" · ").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const countPart = parts.find((part) => /^\d+\s+fechas$/.test(part));
  const rangePart = parts[parts.length - 1];
  const rangeMatch = rangePart.match(/^(\d{4}-\d{2}-\d{2})(?: a (\d{4}-\d{2}-\d{2}))?$/);
  if (!countPart || !rangeMatch) return null;
  const endDate = rangeMatch[2] ?? rangeMatch[1];
  return { endDate };
}

export function withinRenewalWindow(civilDate: string, todayCivil: string, windowEnd: string): boolean {
  return civilDate >= addCivilDays(todayCivil, -7) && civilDate <= windowEnd;
}

export function withinHabitRenewalWindow(civilDate: string, todayCivil: string): boolean {
  const diff = daysBetweenCivilDates(todayCivil, civilDate);
  return diff >= 0 && diff <= 3;
}

export function formatDueLabel(civilDate: string, todayCivil: string, locale: NotificationLocale): string {
  const diff = daysBetweenCivilDates(todayCivil, civilDate);
  if (diff === 0) return locale === "es" ? "Vence hoy" : "Due today";
  if (diff > 0) {
    return locale === "es"
      ? `Vence en ${diff} ${diff === 1 ? "día" : "días"}`
      : `Due in ${diff} ${diff === 1 ? "day" : "days"}`;
  }
  const daysAgo = Math.abs(diff);
  return locale === "es"
    ? `Venció hace ${daysAgo} ${daysAgo === 1 ? "día" : "días"}`
    : `Expired ${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago`;
}

export function duePriorityScore(civilDate: string, todayCivil: string): number {
  const diff = daysBetweenCivilDates(todayCivil, civilDate);
  if (diff < 0) return 0;
  if (diff === 0) return 1;
  return 2 + diff;
}

export function formatClock(iso: string | null, locale: NotificationLocale, timezone: string): string {
  if (!iso) return locale === "es" ? "Sin hora" : "No time";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return locale === "es" ? "Sin hora" : "No time";
  return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(dt);
}

export function formatMeta(
  occurredAtISO: string | null,
  clientName: string,
  secondary: string | null,
  locale: NotificationLocale,
  timezone: string,
): string {
  const bits = [
    occurredAtISO ? formatClock(occurredAtISO, locale, timezone) : null,
    clientName,
  ];
  if (secondary) bits.push(secondary);
  return bits.filter(Boolean).join(" · ");
}

function localizedHabitName(name: { en: string; es: string }, locale: NotificationLocale): string {
  return locale === "es" ? name.es || name.en : name.en || name.es;
}

export function countHabitOccurrences(
  startsOn: string,
  endsOn: string,
  habit: HabitRow,
): number {
  let count = 0;
  for (let civil = startsOn; civil <= endsOn; civil = addCivilDays(civil, 1)) {
    if (isHabitScheduledOn(habit as unknown as Parameters<typeof isHabitScheduledOn>[0], civil)) count += 1;
    if (count > 400) break;
  }
  return count;
}

export function buildWorkoutRenewalNotifications(
  rows: WorkoutActivityRow[],
  todayCivil: string,
  renewalWindowEnd: string,
  locale: NotificationLocale,
): RenewalNotification[] {
  const items: RenewalNotification[] = [];
  for (const row of rows) {
    const parsed = parseWorkoutSeriesDetail(row.detail);
    if (!parsed) continue;
    if (!withinRenewalWindow(parsed.endDate, todayCivil, renewalWindowEnd)) {
      continue;
    }
    const dueLabel = formatDueLabel(parsed.endDate, todayCivil, locale);
    items.push({
      id: row.id,
      kind: "workout",
      occurredAtISO: row.occurredAt,
      clientId: row.clientId,
      clientName: row.clientName ?? "—",
      title: row.title,
      detail: row.detail ?? "",
      dueDate: parsed.endDate,
      dueLabel,
      actionHref: row.clientId
        ? `/gc-fitness/schedule?month=${parsed.endDate.slice(0, 7)}&clientIds=${encodeURIComponent(row.clientId)}`
        : "/gc-fitness/schedule",
      actionLabel: locale === "es" ? "Abrir calendario" : "Open calendar",
    });
  }
  return items;
}

export function buildHabitRenewalNotifications(
  habits: HabitRow[],
  todayCivil: string,
  _renewalWindowEnd: string,
  locale: NotificationLocale,
  clientNameById: Map<string, string>,
): RenewalNotification[] {
  const items: RenewalNotification[] = [];
  for (const habit of habits) {
    if (!habit.endsOn) continue;
    if (!withinHabitRenewalWindow(habit.endsOn, todayCivil)) {
      continue;
    }
    const clientName = clientNameById.get(habit.clientId) ?? habit.clientId;
    const recurrenceLabel = habit.scheduleCadence ?? "recurrencia";
    const occurrences = countHabitOccurrences(habit.startsOn, habit.endsOn, habit);
    const detail = `Recurrencia: ${recurrenceLabel} · ${occurrences} fechas · ${habit.startsOn} a ${habit.endsOn}`;
    items.push({
      id: `habit:${habit.id}`,
      kind: "habit",
      occurredAtISO: null,
      clientId: habit.clientId,
      clientName,
      title: localizedHabitName(habit.name, locale),
      detail,
      dueDate: habit.endsOn,
      dueLabel: formatDueLabel(habit.endsOn, todayCivil, locale),
      actionHref: `/gc-fitness/habits/${habit.id}/edit`,
      actionLabel: locale === "es" ? "Renovar hábito" : "Renew habit",
    });
  }
  return items;
}

/** Workout + habit renewals, most urgent first (overdue → today → soonest). */
export function buildRenewalNotifications(input: {
  workoutActivityRows: WorkoutActivityRow[];
  habits: HabitRow[];
  todayCivil: string;
  locale: NotificationLocale;
  clientNameById: Map<string, string>;
}): RenewalNotification[] {
  const { workoutActivityRows, habits, todayCivil, locale, clientNameById } = input;
  const renewalWindowEnd = addCivilDays(todayCivil, RENEWAL_WINDOW_DAYS);
  return [
    ...buildWorkoutRenewalNotifications(workoutActivityRows, todayCivil, renewalWindowEnd, locale),
    ...buildHabitRenewalNotifications(habits, todayCivil, renewalWindowEnd, locale, clientNameById),
  ].sort((a, b) => {
    const aScore = duePriorityScore(a.dueDate, todayCivil);
    const bScore = duePriorityScore(b.dueDate, todayCivil);
    if (aScore !== bScore) return aScore - bScore;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

export function buildActivationNotifications(
  logs: ActivationLogRow[],
  openClientLabel: string,
): ActivationNotification[] {
  return logs
    .filter((row) => row.category === "signup")
    .map<ActivationNotification>((row) => ({
      id: row.id,
      occurredAtISO: row.eventAt,
      clientId: row.clientId,
      clientName: row.clientName,
      detail: row.detail,
      actionHref: `/gc-fitness/clients/${row.clientId}`,
      actionLabel: openClientLabel,
    }));
}

/** Every source merged into one list, newest first. */
export function buildNotificationFeed(input: {
  prNotifications: PrNotification[];
  renewalNotifications: RenewalNotification[];
  activationNotifications: ActivationNotification[];
  birthdayNotifications: BirthdayNotification[];
  locale: NotificationLocale;
  timezone: string;
  t: NotificationTranslator;
}): NotificationFeedItem[] {
  const {
    prNotifications,
    renewalNotifications,
    activationNotifications,
    birthdayNotifications,
    locale,
    timezone,
    t,
  } = input;
  return [
    ...prNotifications.map((item): NotificationFeedItem => ({
      id: item.id,
      kind: "prs",
      sortAtISO: item.occurredAtISO,
      tone: "success",
      title: t("prsCardTitle", {
        client: item.clientName,
        count: item.prCount,
      }),
      titleHref: `/gc-fitness/clients/${item.clientId}`,
      detail: item.detail,
      detailItems: item.detailItems,
      meta: formatMeta(item.occurredAtISO, item.clientName, null, locale, timezone),
      actionHref: item.workoutHref,
      actionLabel: t("openWorkout"),
      secondaryActionHref: item.chatHref,
      secondaryActionLabel: t("openChat"),
      unread: true,
    })),
    ...renewalNotifications.map((item): NotificationFeedItem => ({
      id: item.id,
      kind: "renewals",
      sortAtISO: item.occurredAtISO ?? `${item.dueDate}T12:00:00.000Z`,
      tone: "warning",
      title: item.title,
      detail: item.detail,
      meta: formatMeta(item.occurredAtISO, item.clientName, item.dueLabel, locale, timezone),
      actionHref: item.actionHref,
      actionLabel: item.actionLabel,
    })),
    ...activationNotifications.map((item): NotificationFeedItem => ({
      id: item.id,
      kind: "activations",
      sortAtISO: item.occurredAtISO,
      tone: "brand",
      title: t("clientActivated"),
      detail: item.detail,
      meta: formatMeta(item.occurredAtISO, item.clientName, null, locale, timezone),
      actionHref: item.actionHref,
      actionLabel: item.actionLabel,
      featured: true,
    })),
    ...birthdayNotifications.map((item): NotificationFeedItem => ({
      id: item.id,
      kind: "birthdays",
      sortAtISO: item.sortAtISO,
      tone: "violet",
      title: t("birthdayCardTitle", { client: item.clientName }),
      detail: t("birthdayCardDetail", { birthDate: item.birthDate }),
      meta: formatMeta(item.sortAtISO, item.clientName, null, locale, timezone),
      actionHref: item.actionHref,
      actionLabel: item.actionLabel,
      featured: true,
    })),
  ].sort((a, b) => isoMs(b.sortAtISO) - isoMs(a.sortAtISO));
}

export function filterNotificationFeed(
  feed: NotificationFeedItem[],
  filter: NotificationFilter,
): NotificationFeedItem[] {
  return filter === "all" ? feed : feed.filter((item) => item.kind === filter);
}

export function buildNotificationFilterItems(
  counts: Record<NotificationFilter, number>,
  t: NotificationTranslator,
): NotificationFilterItem[] {
  return [
    {
      key: "all",
      label: t("filterAll"),
      count: counts.all,
      href: "/gc-fitness/notifications",
    },
    {
      key: "prs",
      label: t("filterPrs"),
      count: counts.prs,
      href: "/gc-fitness/notifications?type=prs",
    },
    {
      key: "renewals",
      label: t("filterRenewals"),
      count: counts.renewals,
      href: "/gc-fitness/notifications?type=renewals",
    },
    {
      key: "activations",
      label: t("filterActivations"),
      count: counts.activations,
      href: "/gc-fitness/notifications?type=activations",
    },
    {
      key: "birthdays",
      label: t("filterBirthdays"),
      count: counts.birthdays,
      href: "/gc-fitness/notifications?type=birthdays",
    },
  ];
}
