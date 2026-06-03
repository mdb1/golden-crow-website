import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Bell,
  CalendarClock,
  RefreshCw,
  UserCheck,
  ArrowUpRight,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { isHabitScheduledOn } from "@/lib/gc-fitness/habit-schedule";
import { listHabitsForTrainer, type HabitRow } from "@/lib/gc-fitness/habit-actions";
import { listMyCoachActivityPage } from "@/lib/gc-fitness/coach-activity-actions";
import { listRecentLogsForTrainerPage } from "@/lib/gc-fitness/recent-logs-actions";
import { UpcomingWorkoutAlerts } from "@/components/gc-fitness/upcoming-workout-alerts";

export const dynamic = "force-dynamic";

type Locale = "en" | "es";

type RenewalNotification = {
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

type ActivationNotification = {
  id: string;
  occurredAtISO: string | null;
  clientId: string;
  clientName: string;
  detail: string;
  actionHref: string;
  actionLabel: string;
};

export default async function NotificationsPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("notifications");
  const todayCivil = civilDateToday(await getTrainerTimezone());
  const renewalWindowEnd = addCivilDays(todayCivil, 14);

  const [workoutActivity, habits, activations, clients] = await Promise.all([
    listMyCoachActivityPage(null, 100, null, "workout_assignment"),
    listHabitsForTrainer(),
    listRecentLogsForTrainerPage(null, 20, null, "signup"),
    listClients(),
  ]);

  const clientNameById = new Map(
    clients.map((client) => [client.uid, client.displayName]),
  );

  const renewalNotifications = [
    ...buildWorkoutRenewalNotifications(
      workoutActivity.rows,
      todayCivil,
      renewalWindowEnd,
      locale,
    ),
    ...buildHabitRenewalNotifications(
      habits,
      todayCivil,
      renewalWindowEnd,
      locale,
      clientNameById,
    ),
  ].sort((a, b) => {
    const aScore = duePriorityScore(a.dueDate, todayCivil);
    const bScore = duePriorityScore(b.dueDate, todayCivil);
    if (aScore !== bScore) return aScore - bScore;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const activationNotifications = activations.logs
    .filter((row) => row.category === "signup")
    .map<ActivationNotification>((row) => ({
      id: row.id,
      occurredAtISO: row.eventAt,
      clientId: row.clientId,
      clientName: row.clientName,
      detail: row.detail,
      actionHref: `/gc-fitness/clients/${row.clientId}`,
      actionLabel: t("openClient"),
    }));

  return (
    <div className="gc-page flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/gc-fitness/recent-logs">
              <ArrowUpRight className="h-4 w-4" />
              {t("openRecentLogs")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/gc-fitness/my-activity">
              <ArrowUpRight className="h-4 w-4" />
              {t("openMyActivity")}
            </Link>
          </Button>
        </div>
      </div>

      <UpcomingWorkoutAlerts />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            {t("renewalsTitle")}
          </CardTitle>
          <CardDescription>{t("renewalsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renewalNotifications.length === 0 ? (
            <EmptyState label={t("noRenewals")} />
          ) : (
            renewalNotifications.map((item) => (
              <NotificationRow key={item.id} title={item.title} detail={item.detail} meta={formatMeta(item.occurredAtISO, item.clientName, item.dueLabel, locale)} actionHref={item.actionHref} actionLabel={item.actionLabel} icon={<CalendarClock className="h-4 w-4" />} />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            {t("activationsTitle")}
          </CardTitle>
          <CardDescription>{t("activationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activationNotifications.length === 0 ? (
            <EmptyState label={t("noActivations")} />
          ) : (
            activationNotifications.map((item) => (
              <NotificationRow
                key={item.id}
                title={t("clientActivated")}
                detail={item.detail}
                meta={formatMeta(item.occurredAtISO, item.clientName, null, locale)}
                actionHref={item.actionHref}
                actionLabel={item.actionLabel}
                icon={<Bell className="h-4 w-4" />}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationRow({
  icon,
  title,
  detail,
  meta,
  actionHref,
  actionLabel,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  meta: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground">{meta}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function buildWorkoutRenewalNotifications(
  rows: Array<{ id: string; kind: string; occurredAt: string | null; clientId: string | null; clientName: string | null; title: string; detail: string | null }>,
  todayCivil: string,
  renewalWindowEnd: string,
  locale: Locale,
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

function buildHabitRenewalNotifications(
  habits: HabitRow[],
  todayCivil: string,
  renewalWindowEnd: string,
  locale: Locale,
  clientNameById: Map<string, string>,
): RenewalNotification[] {
  const items: RenewalNotification[] = [];
  for (const habit of habits) {
    if (!habit.endsOn) continue;
    if (!withinRenewalWindow(habit.endsOn, todayCivil, renewalWindowEnd)) {
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

function parseWorkoutSeriesDetail(detail: string | null): { endDate: string } | null {
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

function withinRenewalWindow(civilDate: string, todayCivil: string, windowEnd: string): boolean {
  return civilDate >= addCivilDays(todayCivil, -7) && civilDate <= windowEnd;
}

function formatDueLabel(civilDate: string, todayCivil: string, locale: Locale): string {
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

function duePriorityScore(civilDate: string, todayCivil: string): number {
  const diff = daysBetweenCivilDates(todayCivil, civilDate);
  if (diff < 0) return 0;
  if (diff === 0) return 1;
  return 2 + diff;
}

function formatMeta(
  occurredAtISO: string | null,
  clientName: string,
  secondary: string | null,
  locale: Locale,
): string {
  const bits = [
    occurredAtISO ? formatClock(occurredAtISO, locale) : null,
    clientName,
  ];
  if (secondary) bits.push(secondary);
  return bits.filter(Boolean).join(" · ");
}

function formatClock(iso: string | null, locale: Locale): string {
  if (!iso) return locale === "es" ? "Sin hora" : "No time";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return locale === "es" ? "Sin hora" : "No time";
  return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

function localizedHabitName(name: { en: string; es: string }, locale: Locale): string {
  return locale === "es" ? name.es || name.en : name.en || name.es;
}

function countHabitOccurrences(
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

function addCivilDays(civilDate: string, days: number): string {
  const [year, month, day] = civilDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenCivilDates(fromCivil: string, toCivil: string): number {
  const [fy, fm, fd] = fromCivil.split("-").map(Number);
  const [ty, tm, td] = toCivil.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}
