// /gc-fitness/admin/coaches/[uid]/clients/[clientId]/page.tsx
//
// Admin god-mode (READ-ONLY) drill-down into a specific client of a specific
// coach. Surfaces the client's recent activity (paginated, 10/page) and
// progress photos so an admin can see "everything that's happening" without
// owning the client.
//
// Authorization: admin-gated at the page AND inside each action
// (listRecentLogsForClientAsAdmin / listProgressPhotosForClientAsAdmin), which
// also verify the client actually belongs to {uid} so the URL can't be edited
// to read across coaches.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { listRecentLogsForClientAsAdmin } from "@/lib/gc-fitness/recent-logs-actions";
import { listProgressPhotosForClientAsAdmin } from "@/lib/gc-fitness/progress-photo-actions";
import {
  listClientAssignmentsForAdmin,
  listClientHabitsForAdmin,
  listClientNutritionForAdmin,
} from "@/lib/gc-fitness/admin-actions";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { ArrowLeft, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AdminNutritionCard } from "../../../../_components/admin-nutrition-card";
import { loadClientAdminOverview } from "@/lib/gc-fitness/admin-client-overview";
import { listClientPersonalRecordsAsAdmin } from "@/lib/gc-fitness/personal-records-actions";
import { BodyWeightTrendChart } from "@/app/gc-fitness/clients/[id]/_components/BodyWeightTrendChart";
import { HabitTrendsWidget } from "@/app/gc-fitness/clients/[id]/_components/HabitTrendsWidget";
import { PersonalRecordsClient } from "@/app/gc-fitness/clients/[id]/_components/PersonalRecordsClient";
import { WorkoutTrendsWidget } from "@/app/gc-fitness/clients/[id]/_components/WorkoutTrendsWidget";
import { ExerciseProgressClient } from "@/app/gc-fitness/clients/[id]/_components/ExerciseProgressClient";
import { MuscleGroupProgressClient } from "@/app/gc-fitness/clients/[id]/_components/MuscleGroupProgressClient";
import { addCivilDays } from "@/app/gc-fitness/clients/[id]/_components/trend-range";
import { AdminReadOnlyCalendar } from "../../../../coach-less-users/[uid]/_components/AdminReadOnlyCalendar";
import { getClientExerciseProgressAsAdmin } from "@/lib/gc-fitness/exercise-progress-actions";
import { listMonthForClientAsAdmin } from "@/lib/gc-fitness/schedule-month-actions";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import {
  ClientAccountCard,
  ClientBillingCard,
  ClientOverviewTiles,
  ClientRelationshipCards,
  ClientSocialCard,
  ClientSubscriptionHistoryCard,
} from "./_components/ClientOverviewCards";
import { ClientRecentLogsFeed } from "@/app/gc-fitness/clients/[id]/_components/ClientRecentLogsFeed";
import { ProgressPhotosGridClient } from "@/app/gc-fitness/clients/[id]/_components/ProgressPhotosGridClient";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "Corvo - <adminPanel>" (issue #170).
export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

export default async function AdminCoachClientPage({
  params,
}: {
  params: Promise<{ uid: string; clientId: string }>;
}) {
  const { uid, clientId } = await params;

  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  let logs: Awaited<ReturnType<typeof listRecentLogsForClientAsAdmin>>;
  let photos: Awaited<ReturnType<typeof listProgressPhotosForClientAsAdmin>>;
  let assignments: Awaited<ReturnType<typeof listClientAssignmentsForAdmin>>;
  let habits: Awaited<ReturnType<typeof listClientHabitsForAdmin>>;
  let nutrition: Awaited<ReturnType<typeof listClientNutritionForAdmin>>;
  try {
    [logs, photos, assignments, habits, nutrition] = await Promise.all([
      listRecentLogsForClientAsAdmin(uid, clientId),
      listProgressPhotosForClientAsAdmin(uid, clientId),
      listClientAssignmentsForAdmin(uid, clientId),
      listClientHabitsForAdmin(uid, clientId),
      listClientNutritionForAdmin(uid, clientId),
    ]);
  } catch {
    // Client doesn't exist or doesn't belong to this coach.
    notFound();
  }

  const clientName = logs.clients[0]?.name ?? clientId;
  const usersCol = gcFitnessFirestore().collection(FirestoreCollections.users);
  // #754 — "en el perfil de un client con coach falta ver quién es su coach".
  // The route is already nested under the coach, but the page named them
  // nowhere: the only pointer was a generic "Back to coach" button, so an
  // operator landing here from a search or from Monitoring could not tell WHO
  // the coach was without editing the URL. Point read, fail-soft — a missing
  // coach doc degrades to the uid, never to a 404 on the client's profile.
  const [clientSnap, coachSnap] = await Promise.all([
    usersCol.doc(clientId).get(),
    usersCol
      .doc(uid)
      .get()
      .catch(() => null),
  ]);
  const coachName =
    (typeof coachSnap?.get("displayName") === "string" && coachSnap.get("displayName")) ||
    (typeof coachSnap?.get("email") === "string" && coachSnap.get("email")) ||
    uid;
  const coachEmail =
    typeof coachSnap?.get("email") === "string" ? (coachSnap.get("email") as string) : null;
  const storedTimezone = clientSnap.get("timezone");
  // #747 — falls back to the ADMIN's own zone, never UTC. See the note in
  // `clients/[id]/page.tsx`.
  const timezone =
    typeof storedTimezone === "string" && storedTimezone
      ? storedTimezone
      : await getTrainerTimezone();

  // #534 — account / app / billing / goals / chat / Corvo + PRs. Fail-soft: a broken
  // source empties its card, never the page (the ownership gate already ran above).
  // #541 — calendar + per-exercise / muscle-group progress: the coach-less profile's
  // loaders, with this coach's uid (the same `*AsAdmin` ownership gate).
  const todayCivil = civilDateToday(timezone);
  const thisMonthFirst = `${todayCivil.slice(0, 7)}-01`;
  const [overview, personalRecords, calendar, exerciseProgress] = await Promise.all([
    loadClientAdminOverview(uid, clientId, { fallbackTimezone: timezone }).catch(() => null),
    listClientPersonalRecordsAsAdmin(uid, clientId).catch(() => ({ clientId, records: [] })),
    listMonthForClientAsAdmin({ coachUid: uid, clientId, monthFirstCivil: thisMonthFirst, todayCivil }).catch(() => null),
    getClientExerciseProgressAsAdmin(uid, clientId, timezone).catch(() => null),
  ]);
  const tProgress = await getTranslations("clients.exerciseProgress");
  const exerciseProgressLabels = {
    exercisePickerLabel: tProgress("exercisePickerLabel"),
    metricTopSet: tProgress("metricTopSet"),
    metricE1rm: tProgress("metricE1rm"),
    metricVolume: tProgress("metricVolume"),
    weightUnit: tProgress("weightUnit"),
    volumeUnit: tProgress("volumeUnit"),
    latestPrefix: tProgress("latestPrefix"),
    emptyNoExercises: tProgress("emptyNoExercises"),
    emptyNoData: tProgress("emptyNoData"),
    tooltipTopSet: tProgress("tooltipTopSet"),
    tooltipE1rm: tProgress("tooltipE1rm"),
    tooltipVolume: tProgress("tooltipVolume"),
    ranges: {
      all: tProgress("rangeAll"),
      "90": tProgress("range90"),
      "30": tProgress("range30"),
      "7": tProgress("range7"),
    },
  };
  const rangeStarts = {
    all: addCivilDays(todayCivil, -364),
    "90": addCivilDays(todayCivil, -89),
    "30": addCivilDays(todayCivil, -29),
    "7": addCivilDays(todayCivil, -6),
  };
  const tRecords = await getTranslations("clients.detail.personalRecords");
  const tProfile = await getTranslations("admin.coachlessProfile");
  const tOverview = await getTranslations("admin.coachDetail.overview");
  const personalRecordLabels = {
    empty: tRecords("empty"),
    muscleGroupLabel: tRecords("muscleGroupLabel"),
    muscleGroupAll: tRecords("muscleGroupAll"),
    sortLabel: tRecords("sortLabel"),
    sortRecent: tRecords("sortRecent"),
    sortMostCommon: tRecords("sortMostCommon"),
    previousLabel: tRecords.raw("previousLabel") as string,
    estOneRm: tRecords.raw("estOneRm") as string,
    noDate: tRecords("noDate"),
  };
  const clientEmail = overview?.account.email || clientId;
  const auditHref = (extra = "") =>
    `/gc-fitness/admin/audit?tab=timeline&client=${encodeURIComponent(clientEmail)}${extra}`;

  const t = await getTranslations("admin.clientDetail");
  const tc = await getTranslations("admin.common");
  const statusLabel = (status: string): string => {
    switch (status) {
      case "completed":
        return t("status.completed");
      case "missed":
        return t("status.missed");
      case "started":
        return t("status.started");
      case "assigned":
        return t("status.assigned");
      case "skipped":
        return t("status.skipped");
      default:
        return status;
    }
  };

  return (
    <div className="gc-page flex flex-col gap-6">
      <div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href={`/gc-fitness/admin/coaches/${uid}`}>
            <ArrowLeft className="h-4 w-4" />
            {t("backToCoach")}
          </Link>
        </Button>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {clientName}
            <Badge variant="secondary">{t("readOnly")}</Badge>
          </span>
        }
        subtitle={t("clientUid", { uid: clientId })}
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href={`/gc-fitness/admin/coaches/${uid}`}>
              <UserRound className="h-4 w-4" />
              {t("viewCoach")}
            </Link>
          </Button>
        }
      />

      <p className="-mt-2 text-sm text-muted-foreground">
        {t("coachLabel")}{" "}
        <Link
          href={`/gc-fitness/admin/coaches/${uid}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {coachName}
        </Link>
        {coachEmail && coachEmail !== coachName ? ` · ${coachEmail}` : null}
      </p>

      {overview ? (
        <>
          <ClientOverviewTiles overview={overview} />
          <ClientAccountCard overview={overview} />
          <ClientBillingCard overview={overview} auditHref={auditHref("&cat=billing")} />
          <ClientRelationshipCards overview={overview} />
          <div className="grid gap-4 md:grid-cols-2">
            <ClientSubscriptionHistoryCard overview={overview} />
            <ClientSocialCard overview={overview} />
          </div>
        </>
      ) : null}

      <p className="-mt-2 text-sm">
        <Link href={auditHref()} className="text-primary hover:underline">
          {tOverview("auditLink")}
        </Link>
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t("recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* showActions=false — admin is read-only and the chat / workout-detail
              BUTTON targets are trainer-scoped (would 403 for an admin). Rows are
              still clickable via linkMode="admin", which routes workout + photo to
              the admin-gated nested detail routes. */}
          <ClientRecentLogsFeed
            logs={logs.logs}
            clientId={clientId}
            timezone={timezone}
            initialCursor={logs.nextCursor}
            initialHasMore={logs.hasMore}
            showActions={false}
            linkMode="admin"
            coachUid={uid}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t("assignments.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {t("assignments.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("assignments.date")}</TableHead>
                    <TableHead>{t("assignments.time")}</TableHead>
                    <TableHead>{t("assignments.workout")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {a.recurrenceLabel && a.lastDate !== a.firstDate
                          ? `${a.firstDate} → ${a.lastDate}`
                          : a.firstDate || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {a.scheduledTime ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{a.title}</span>
                          {a.recurrenceLabel ? (
                            <Badge variant="secondary" className="font-normal">
                              {a.recurrenceLabel} · ×{a.occurrences}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {a.recurrenceLabel ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {t("assignments.completedOf", { done: a.completedCount, total: a.occurrences })}
                          </span>
                        ) : (
                          <Badge variant={assignmentStatusVariant(a.status)}>
                            {statusLabel(a.status)}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t("habits.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {habits.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {t("habits.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("habits.habit")}</TableHead>
                    <TableHead>{t("habits.cadence")}</TableHead>
                    <TableHead>{t("habits.reminder")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {habits.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{h.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[h.scheduleType, h.cadence].filter(Boolean).join(" · ") ||
                          "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {h.reminderEnabled ? t("habits.on") : t("habits.off")}
                      </TableCell>
                      <TableCell>
                        {h.deleted ? (
                          <Badge variant="secondary">{t("habits.deleted")}</Badge>
                        ) : h.archivedOn ? (
                          <Badge variant="warning">{t("habits.archivedSince", { date: h.archivedOn })}</Badge>
                        ) : (
                          <Badge variant="success">{t("habits.active")}</Badge>
                        )}
                        {h.clientOwned ? (
                          <Badge variant="outline" className="ml-1">{t("habits.clientOwned")}</Badge>
                        ) : null}
                        {h.archivedPeriods > 0 ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {t("habits.archivedPeriods", { count: h.archivedPeriods })}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{tProfile("calendar")}</CardTitle>
        </CardHeader>
        <CardContent>
          {calendar ? (
            // READ-ONLY, like the coach-less profile's: no drag / assign affordances.
            <AdminReadOnlyCalendar
              coachUid={uid}
              clientId={clientId}
              todayCivil={todayCivil}
              initialMonthFirst={thisMonthFirst}
              initialPayload={calendar}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{tProfile("calendarUnavailable")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{tProfile("workoutTrends")}</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutTrendsWidget clientId={clientId} timezone={timezone} />
        </CardContent>
      </Card>

      {exerciseProgress && exerciseProgress.availableMuscleGroups.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">{tProfile("muscleGroupVolume")}</CardTitle>
          </CardHeader>
          <CardContent>
            <MuscleGroupProgressClient
              weeks={exerciseProgress.muscleGroupWeeks}
              availableGroups={exerciseProgress.availableMuscleGroups}
              currentWeekStart={exerciseProgress.currentWeekStart}
              rangeStarts={rangeStarts}
            />
          </CardContent>
        </Card>
      ) : null}

      {exerciseProgress && exerciseProgress.exercises.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">{tProfile("progressByExercise")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ExerciseProgressClient
              exercises={exerciseProgress.exercises}
              points={exerciseProgress.points}
              setSessions={exerciseProgress.exerciseSetSessions}
              truncatedSetHistoryExerciseIds={exerciseProgress.truncatedSetHistoryExerciseIds}
              today={todayCivil}
              rangeStarts={rangeStarts}
              labels={exerciseProgressLabels}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Nutrition (#949-adjacent) — shared with the coach-less profile (#1133). */}
      <AdminNutritionCard nutrition={nutrition} />

      {personalRecords.records.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">
              {tProfile("personalRecords", { count: personalRecords.records.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PersonalRecordsClient records={personalRecords.records} labels={personalRecordLabels} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{tProfile("habitAdherence")}</CardTitle>
        </CardHeader>
        <CardContent>
          <HabitTrendsWidget clientId={clientId} coachId={uid === clientId ? null : uid} timezone={timezone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{tProfile("bodyWeight")}</CardTitle>
        </CardHeader>
        <CardContent>
          <BodyWeightTrendChart clientId={clientId} timezone={timezone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t("photos.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length > 0 ? (
            <ProgressPhotosGridClient photos={photos} timezone={timezone} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("photos.empty")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function assignmentStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "success" {
  switch (status) {
    case "completed":
      return "success";
    case "missed":
      return "destructive";
    case "started":
      return "default";
    default:
      return "secondary";
  }
}
