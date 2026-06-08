import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Activity,
  Bell,
  CalendarClock,
  Clock3,
  Pause,
  UserCheck,
  ArrowUpRight,
  Trophy,
  MessageCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { isHabitScheduledOn } from "@/lib/gc-fitness/habit-schedule";
import { listHabitsForTrainer, type HabitRow } from "@/lib/gc-fitness/habit-actions";
import { listMyCoachActivityPage } from "@/lib/gc-fitness/coach-activity-actions";
import {
  listActiveWorkoutSessionsForTrainer,
} from "@/lib/gc-fitness/live-workout-actions";
import type { ActiveWorkoutSummary } from "@/lib/gc-fitness/live-workout-types";
import { listRecentLogsForTrainerPage } from "@/lib/gc-fitness/recent-logs-actions";
import { UpcomingWorkoutAlerts } from "@/components/gc-fitness/upcoming-workout-alerts";

export const dynamic = "force-dynamic";

type Locale = "en" | "es";
type NotificationFilter = "all" | "prs" | "renewals" | "activations";

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

type PrNotification = {
  id: string;
  occurredAtISO: string | null;
  clientId: string;
  clientName: string;
  workoutName: string;
  prCount: number;
  detail: string;
  detailItems?: string[];
  workoutHref: string;
  chatHref: string;
};

type UnifiedNotification = {
  id: string;
  kind: Exclude<NotificationFilter, "all">;
  sortAtISO: string | null;
  tone: keyof typeof NOTIFICATION_CHIP;
  icon: ReactNode;
  title: string;
  detail: string;
  detailItems?: string[];
  meta: string;
  actionHref: string;
  actionLabel: string;
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
  secondaryActionIcon?: ReactNode;
  unread?: boolean;
  featured?: boolean;
};

type ActiveWorkoutCardData = ActiveWorkoutSummary & {
  clientName: string;
};

function resolveNotificationFilter(raw: string | undefined): NotificationFilter {
  if (raw === "prs" || raw === "renewals" || raw === "activations") return raw;
  return "all";
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  let trainer: Awaited<ReturnType<typeof getCurrentTrainer>>;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("notifications");
  const { type: rawType } = await searchParams;
  const activeFilter = resolveNotificationFilter(rawType);
  const trainerTimezone = await getTrainerTimezone();
  const todayCivil = civilDateToday(trainerTimezone);
  const renewalWindowEnd = addCivilDays(todayCivil, 14);

  const [activeWorkoutSummaries, workoutActivity, habits, activations, clients, prNotificationsRaw] =
    await Promise.all([
    listActiveWorkoutSessionsForTrainer(),
    listMyCoachActivityPage(null, 100, null, "workout_assignment"),
    listHabitsForTrainer(),
    listRecentLogsForTrainerPage(null, 20, null, "signup"),
    listClients(),
    listRecentPrWorkoutNotifications(trainer.uid),
  ]);

  const clientNameById = new Map(
    clients.map((client) => [client.uid, client.displayName]),
  );
  const activeWorkouts: ActiveWorkoutCardData[] = activeWorkoutSummaries.map((item) => ({
    ...item,
    clientName: clientNameById.get(item.clientId) ?? item.clientId,
  }));
  const prNotifications = prNotificationsRaw.map((item) => ({
    ...item,
    clientName: clientNameById.get(item.clientId) ?? item.clientName,
  }));

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

  const allNotifications: UnifiedNotification[] = [
    ...prNotifications.map((item): UnifiedNotification => ({
      id: item.id,
      kind: "prs",
      sortAtISO: item.occurredAtISO,
      tone: "success",
      icon: <Trophy />,
      title: t("prsCardTitle", {
        client: item.clientName,
        count: item.prCount,
      }),
      detail: item.detail,
      detailItems: item.detailItems,
      meta: formatMeta(item.occurredAtISO, item.clientName, null, locale, trainerTimezone),
      actionHref: item.workoutHref,
      actionLabel: t("openWorkout"),
      secondaryActionHref: item.chatHref,
      secondaryActionLabel: t("openChat"),
      secondaryActionIcon: <MessageCircle />,
      unread: true,
    })),
    ...renewalNotifications.map((item): UnifiedNotification => ({
      id: item.id,
      kind: "renewals",
      sortAtISO: item.occurredAtISO ?? `${item.dueDate}T12:00:00.000Z`,
      tone: "warning",
      icon: <CalendarClock />,
      title: item.title,
      detail: item.detail,
      meta: formatMeta(item.occurredAtISO, item.clientName, item.dueLabel, locale, trainerTimezone),
      actionHref: item.actionHref,
      actionLabel: item.actionLabel,
    })),
    ...activationNotifications.map((item): UnifiedNotification => ({
      id: item.id,
      kind: "activations",
      sortAtISO: item.occurredAtISO,
      tone: "brand",
      icon: <UserCheck />,
      title: t("clientActivated"),
      detail: item.detail,
      meta: formatMeta(item.occurredAtISO, item.clientName, null, locale, trainerTimezone),
      actionHref: item.actionHref,
      actionLabel: item.actionLabel,
      featured: true,
    })),
  ].sort((a, b) => isoMs(b.sortAtISO) - isoMs(a.sortAtISO));
  const visibleNotifications =
    activeFilter === "all"
      ? allNotifications
      : allNotifications.filter((item) => item.kind === activeFilter);
  const filterItems: Array<{
    key: NotificationFilter;
    label: string;
    count: number;
    href: string;
  }> = [
    {
      key: "all",
      label: t("filterAll"),
      count: allNotifications.length,
      href: "/gc-fitness/notifications",
    },
    {
      key: "prs",
      label: t("filterPrs"),
      count: prNotifications.length,
      href: "/gc-fitness/notifications?type=prs",
    },
    {
      key: "renewals",
      label: t("filterRenewals"),
      count: renewalNotifications.length,
      href: "/gc-fitness/notifications?type=renewals",
    },
    {
      key: "activations",
      label: t("filterActivations"),
      count: activationNotifications.length,
      href: "/gc-fitness/notifications?type=activations",
    },
  ];

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("headerSubtitle")}
        actions={
          <>
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
          </>
        }
      />

      {activeWorkouts.length > 0 ? (
        <div className="space-y-4">
          {activeWorkouts.map((item) => (
            <ActiveWorkoutCard key={item.logId} item={item} t={t} />
          ))}
        </div>
      ) : null}

      <UpcomingWorkoutAlerts />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t("allTitle")}
          </CardTitle>
          <CardDescription>{t("allDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {filterItems.map((item) => {
              const isActive = item.key === activeFilter;
              return (
                <Button
                  key={item.key}
                  asChild
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  className="rounded-full"
                >
                  <Link href={item.href}>
                    {item.label}
                    <span className="ml-1 text-xs opacity-75">{item.count}</span>
                  </Link>
                </Button>
              );
            })}
          </div>
          {visibleNotifications.length === 0 ? (
            <EmptyState label={t("noNotifications")} />
          ) : (
            visibleNotifications.map((item) => (
              <NotificationRow
                key={item.id}
                tone={item.tone}
                title={item.title}
                detail={item.detail}
                detailItems={item.detailItems}
                meta={item.meta}
                actionHref={item.actionHref}
                actionLabel={item.actionLabel}
                secondaryActionHref={item.secondaryActionHref}
                secondaryActionLabel={item.secondaryActionLabel}
                secondaryActionIcon={item.secondaryActionIcon}
                icon={item.icon}
                unread={item.unread}
                featured={item.featured}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActiveWorkoutCard({
  item,
  t,
}: {
  item: ActiveWorkoutCardData;
  t: (key: string) => string;
}) {
  const elapsedLabel = formatWorkoutElapsed(item.elapsedSeconds);

  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            <Activity className="h-3.5 w-3.5" />
            {t("activeWorkoutBadge")}
          </div>
          <div className="space-y-1">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground break-words sm:text-3xl">
              {item.clientName}
            </h2>
            <p className="text-lg font-medium text-muted-foreground break-words">
              {item.workoutName}
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-border bg-background px-4 py-2 shadow-sm">
          <span className="inline-flex items-center gap-2 font-mono text-xl font-semibold tabular-nums text-foreground">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            {elapsedLabel}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-background/75 p-4">
          <p className="text-sm font-medium text-muted-foreground">
            {t("currentExercise")}
          </p>
          <p className="mt-1 break-words text-xl font-semibold text-foreground">
            {item.currentExerciseName}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background/75 p-4">
          <p className="text-sm font-medium text-muted-foreground">
            {t("currentSet")}
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {item.currentSet} / {item.totalSets}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background/75 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">
              {t("progress")}
            </p>
            <p className="text-sm font-semibold text-foreground">
              {Math.round(item.progress * 100)}%
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.max(4, item.progress * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button asChild className="h-11 flex-1 gap-2 rounded-full">
          <Link href={`/gc-fitness/clients/${item.clientId}/sessions/${item.assignmentId}/run`}>
            <Pause className="h-4 w-4" />
            {t("pauseWorkout")}
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 flex-1 gap-2 rounded-full">
          <Link href={`/gc-fitness/clients/${item.clientId}`}>
            <ArrowUpRight className="h-4 w-4" />
            {t("viewDetails")}
          </Link>
        </Button>
      </div>
    </section>
  );
}

function formatWorkoutElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Token-based colored chip for the leading notification icon. Both themes work
// via the shared badge color tokens.
const NOTIFICATION_CHIP = {
  warning:
    "border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] text-[color:var(--badge-warning-fg)]",
  brand:
    "border-[color:var(--badge-brand-border)] bg-[color:var(--badge-brand-bg)] text-[color:var(--badge-brand-fg)]",
  success:
    "border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] text-[color:var(--badge-success-fg)]",
  violet:
    "border-[color:var(--badge-violet-border)] bg-[color:var(--badge-violet-bg)] text-[color:var(--badge-violet-fg)]",
} as const;

function NotificationRow({
  icon,
  tone,
  title,
  detail,
  detailItems,
  meta,
  actionHref,
  actionLabel,
  secondaryActionHref,
  secondaryActionLabel,
  secondaryActionIcon,
  unread = false,
  featured = false,
}: {
  icon: ReactNode;
  tone: keyof typeof NOTIFICATION_CHIP;
  title: string;
  detail: string;
  detailItems?: string[];
  meta: string;
  actionHref: string;
  actionLabel: string;
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
  secondaryActionIcon?: ReactNode;
  unread?: boolean;
  featured?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-[1.25rem] border bg-card p-4 transition-colors hover:bg-accent/40 sm:flex-row sm:items-start sm:justify-between ${
        featured
          ? "border-primary/70 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
          : "border-border"
      }`}
    >
      <div className="flex min-w-0 gap-3">
        <div
          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border [&>svg]:size-4 ${NOTIFICATION_CHIP[tone]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold leading-tight text-foreground">
              {title}
            </p>
            {unread ? (
              <span
                className="size-2 shrink-0 rounded-full bg-primary"
                aria-hidden
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{meta}</p>
          {detailItems && detailItems.length > 0 ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{detail}</p>
              <ul className="list-disc space-y-1 pl-5">
                {detailItems.map((item, index) => (
                  <li key={`${index}-${item}`} className="break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{detail}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {secondaryActionHref && secondaryActionLabel ? (
          <Button asChild size="sm" variant="outline" className="gap-1">
            <Link href={secondaryActionHref}>
              {secondaryActionIcon}
              {secondaryActionLabel}
            </Link>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

async function listRecentPrWorkoutNotifications(
  trainerUid: string,
): Promise<PrNotification[]> {
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(FirestoreCollections.workoutLogs)
    .where("trainerId", "==", trainerUid)
    .limit(150)
    .get();

  return snap.docs
    .map((doc): PrNotification | null => {
      const data = doc.data() as Record<string, unknown>;
      if (data.deleted === true) return null;
      const completedAt = toIso(data.completedAt);
      if (data.status !== "completed" && !completedAt) return null;
      const prs = Array.isArray(data.prs)
        ? (data.prs as Array<Record<string, unknown>>)
        : [];
      if (prs.length === 0) return null;
      const clientId = typeof data.clientId === "string" ? data.clientId : "";
      if (!clientId) return null;
      const workoutName = localizedValue(
        (data.templateSnapshot as { name?: unknown } | undefined)?.name,
        "Workout",
      );
      const prDetails = formatPrDetails(data, prs);
      const clientName =
        typeof data.clientName === "string" && data.clientName.trim()
          ? data.clientName.trim()
          : clientId;
      return {
        id: `pr:${doc.id}`,
        occurredAtISO: completedAt ?? toIso(data.updatedAt) ?? toIso(data.startedAt),
        clientId,
        clientName,
        workoutName,
        prCount: prs.length,
        detail: workoutName,
        detailItems: prDetails,
        workoutHref: `/gc-fitness/recent-logs/workouts/${doc.id}`,
        chatHref: `/gc-fitness/chat?chatId=${clientId}`,
      };
    })
    .filter((item): item is PrNotification => item !== null)
    .sort((a, b) => isoMs(b.occurredAtISO) - isoMs(a.occurredAtISO))
    .slice(0, 10);
}

function formatPrDetails(
  data: Record<string, unknown>,
  prs: Array<Record<string, unknown>>,
): string[] {
  const templateExercises =
    (data.templateSnapshot as { exercises?: Array<Record<string, unknown>> } | undefined)
      ?.exercises ?? [];
  const exerciseNameById = new Map<string, string>();
  for (const exercise of templateExercises) {
    const exerciseId = typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
    if (!exerciseId) continue;
    exerciseNameById.set(exerciseId, localizedValue(exercise.name, exerciseId));
  }
  const sets = Array.isArray(data.sets)
    ? (data.sets as Array<Record<string, unknown>>)
    : [];
  const setById = new Map<string, Record<string, unknown>>();
  for (const set of sets) {
    const id = typeof set.id === "string" ? set.id : "";
    if (id) setById.set(id, set);
  }

  const details = prs.slice(0, 4).map((pr) => {
    const exerciseId = typeof pr.exerciseId === "string" ? pr.exerciseId : "";
    const setLogId =
      typeof pr.set_log_id === "string"
        ? pr.set_log_id
        : typeof pr.setLogId === "string"
          ? pr.setLogId
          : "";
    const set = setLogId ? setById.get(setLogId) : undefined;
    const name =
      exerciseNameById.get(exerciseId) ??
      (set && typeof set.exerciseId === "string"
        ? exerciseNameById.get(set.exerciseId)
        : undefined) ??
      (exerciseId || "PR");
    const durationSeconds = numeric(pr.duration_seconds ?? pr.durationSeconds);
    if (durationSeconds !== null && durationSeconds > 0) {
      return `${name}: ${formatDuration(durationSeconds)}`;
    }
    const weight = numeric(pr.weight_kg ?? pr.weightKg ?? set?.weight_kg ?? set?.weight);
    const reps = numeric(pr.reps ?? set?.reps);
    const estimatedOneRM = numeric(pr.estimated_one_rm ?? pr.estimatedOneRM);
    const performance =
      weight !== null && reps !== null
        ? `${formatKg(weight)} x ${Math.round(reps)}`
        : weight !== null
          ? formatKg(weight)
          : reps !== null
            ? `${Math.round(reps)} reps`
            : "";
    const oneRm = estimatedOneRM !== null && estimatedOneRM > 0
      ? ` (${formatKg(estimatedOneRM)} 1RM)`
      : "";
    return `${name}${performance ? `: ${performance}` : ""}${oneRm}`;
  });
  const remaining = prs.length - details.length;
  if (remaining > 0) {
    details.push(`+${remaining} PRs`);
  }
  return details;
}

function formatKg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} kg`;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  if (rest === 0) return `${minutes}m`;
  return `${minutes}m ${rest}s`;
}

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "number") {
    const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function localizedValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const localized = value as { en?: unknown; es?: unknown };
    if (typeof localized.es === "string" && localized.es.trim()) {
      return localized.es.trim();
    }
    if (typeof localized.en === "string" && localized.en.trim()) {
      return localized.en.trim();
    }
  }
  return fallback;
}

function isoMs(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
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
  timezone: string,
): string {
  const bits = [
    occurredAtISO ? formatClock(occurredAtISO, locale, timezone) : null,
    clientName,
  ];
  if (secondary) bits.push(secondary);
  return bits.filter(Boolean).join(" · ");
}

function formatClock(iso: string | null, locale: Locale, timezone: string): string {
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
