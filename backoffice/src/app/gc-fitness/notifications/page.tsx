import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Bell,
  CalendarClock,
  UserCheck,
  ArrowUpRight,
  Trophy,
  MessageCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { ActiveWorkoutCard } from "@/components/gc-fitness/notifications/active-workout-card";
import { EmptyState, NotificationRow } from "@/components/gc-fitness/notifications/notification-row";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { loadNotificationSources } from "@/lib/gc-fitness/notifications-data";
import {
  buildActivationNotifications,
  buildNotificationFeed,
  buildNotificationFilterItems,
  buildRenewalNotifications,
  filterNotificationFeed,
  resolveNotificationFilter,
  type NotificationKind,
  type NotificationLocale,
} from "@/lib/gc-fitness/notifications-feed";
import { UpcomingWorkoutAlerts } from "@/components/gc-fitness/upcoming-workout-alerts";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "Corvo - <notifications>" (issue #170).
export const generateMetadata = () => sectionMetadata("notifications");

export const dynamic = "force-dynamic";

// #507 — the page only wires things together: reads live in
// `lib/gc-fitness/notifications-data.ts`, the feed model (renewal windows,
// sort, filters) in `lib/gc-fitness/notifications-feed.ts`, and the cards in
// `components/gc-fitness/notifications/`.

const NOTIFICATION_ICON: Record<NotificationKind, () => ReactNode> = {
  prs: () => <Trophy />,
  renewals: () => <CalendarClock />,
  activations: () => <UserCheck />,
  birthdays: () => <Trophy />,
};

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

  const locale = (await getLocale()) as NotificationLocale;
  const t = await getTranslations("notifications");
  const { type: rawType } = await searchParams;
  const activeFilter = resolveNotificationFilter(rawType);
  const trainerTimezone = await getTrainerTimezone();
  const todayCivil = civilDateToday(trainerTimezone);

  const {
    clientNameById,
    activeWorkouts,
    prNotifications,
    workoutActivityRows,
    habits,
    activationLogs,
    birthdayNotifications,
  } = await loadNotificationSources({
    trainerUid: trainer.uid,
    todayCivil,
    formatPreviousPr: (value) => t("prsPreviousInline", { value }),
  });

  const renewalNotifications = buildRenewalNotifications({
    workoutActivityRows,
    habits,
    todayCivil,
    locale,
    clientNameById,
  });
  const activationNotifications = buildActivationNotifications(activationLogs, t("openClient"));

  const allNotifications = buildNotificationFeed({
    prNotifications,
    renewalNotifications,
    activationNotifications,
    birthdayNotifications,
    locale,
    timezone: trainerTimezone,
    t,
  });
  const visibleNotifications = filterNotificationFeed(allNotifications, activeFilter);
  const filterItems = buildNotificationFilterItems(
    {
      all: allNotifications.length,
      prs: prNotifications.length,
      renewals: renewalNotifications.length,
      activations: activationNotifications.length,
      birthdays: birthdayNotifications.length,
    },
    t,
  );

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

      <UpcomingWorkoutAlerts timezone={trainerTimezone} />

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
                titleHref={item.titleHref}
                detail={item.detail}
                detailItems={item.detailItems}
                meta={item.meta}
                actionHref={item.actionHref}
                actionLabel={item.actionLabel}
                secondaryActionHref={item.secondaryActionHref}
                secondaryActionLabel={item.secondaryActionLabel}
                secondaryActionIcon={item.kind === "prs" ? <MessageCircle /> : undefined}
                icon={NOTIFICATION_ICON[item.kind]()}
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
