// /gc-fitness/admin/coach-less-users/[uid]/page.tsx
//
// Admin god-mode profile for ONE coach-less (self-serve) user — the drill-down
// the list page was missing. Coached clients already have
// `/admin/coaches/{coachId}/clients/{clientId}`; a coach-less user has no coach
// to nest under, so this route stands in for it and reuses the very same
// loaders and widgets.
//
// It can do that because a coach-less user is their own trainer-of-record
// (`adminCanViewClientUnderCoach` — mirrors the #392 selfAssigned
// `trainerId === clientId` wire shape). Passing `uid` as BOTH the coach uid and
// the client uid therefore lights up the shared recent-activity feed, the
// workout-log detail route and the photo comparator with no new plumbing.
//
// Authorization: admin-gated at the page AND inside every action; the profile
// action additionally refuses any target that isn't an active coach-less
// client, so this URL can't be used to read a coached client's data.

import { formatAppDevice } from "@/lib/gc-fitness/client-app-devices";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AdminNutritionCard } from "../../_components/admin-nutrition-card";
import { AdminActionForm } from "../../_components/admin-action-form";
import { AdminSubmitButton } from "../../_components/admin-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/gc-fitness/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import {
  listClientAssignmentsForAdmin,
  listClientHabitsForAdmin,
  listClientNutritionForAdmin,
  listCoachOptionsForAdmin,
} from "@/lib/gc-fitness/admin-actions";
import { getCoachlessUserProfile, type CoachlessUserProfile } from "@/lib/gc-fitness/admin-coachless-actions";
import {
  daysSince,
  resolveDisplayTier,
  type ActivityWindow,
} from "@/lib/gc-fitness/coachless-user-model";
import { civilDateFormat, civilDateToday } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { getClientExerciseProgressAsAdmin } from "@/lib/gc-fitness/exercise-progress-actions";
import { listClientPersonalRecordsAsAdmin } from "@/lib/gc-fitness/personal-records-actions";
import { listProgressPhotosForClientAsAdmin } from "@/lib/gc-fitness/progress-photo-actions";
import { listRecentLogsForClientAsAdmin } from "@/lib/gc-fitness/recent-logs-actions";
import { listMonthForClientAsAdmin } from "@/lib/gc-fitness/schedule-month-actions";

import { BodyWeightTrendChart } from "@/app/gc-fitness/clients/[id]/_components/BodyWeightTrendChart";
import { HabitTrendsWidget } from "@/app/gc-fitness/clients/[id]/_components/HabitTrendsWidget";
import { WorkoutTrendsWidget } from "@/app/gc-fitness/clients/[id]/_components/WorkoutTrendsWidget";
import { PersonalRecordsClient } from "@/app/gc-fitness/clients/[id]/_components/PersonalRecordsClient";
import { ExerciseProgressClient } from "@/app/gc-fitness/clients/[id]/_components/ExerciseProgressClient";
import { MuscleGroupProgressClient } from "@/app/gc-fitness/clients/[id]/_components/MuscleGroupProgressClient";
import { addCivilDays } from "@/app/gc-fitness/clients/[id]/_components/trend-range";
import { AdminReadOnlyCalendar } from "./_components/AdminReadOnlyCalendar";
import { ClientRecentLogsFeed } from "@/app/gc-fitness/clients/[id]/_components/ClientRecentLogsFeed";
import { ProgressPhotosGridClient } from "@/app/gc-fitness/clients/[id]/_components/ProgressPhotosGridClient";
import { assignCoachAction, deleteUserAction, setTierAction } from "./actions";

export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

const LIST_ROUTE = "/gc-fitness/admin/coach-less-users";

/**
 * Stable YYYY-MM-DD — locale-independent by construction (no server-locale
 * flake), and #747: in the ADMIN's zone. `iso.slice(0, 10)` was stable and
 * wrong; the first 10 chars of an ISO instant are its UTC day.
 */
function formatDate(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return civilDateFormat(d, timezone);
}

/** "2026-07-26 (hace 2 d)" — absolute date first, recency in parentheses. */
function formatDateWithAge(
  iso: string | null,
  nowMs: number,
  timezone: string,
  ageLabel: (days: number) => string,
): string {
  if (!iso) return "—";
  const days = daysSince(iso, nowMs);
  if (days === null) return formatDate(iso, timezone);
  return `${formatDate(iso, timezone)} (${ageLabel(days)})`;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function ActivityRow({
  label,
  window: w,
  nowMs,
  timezone,
  ageLabel,
}: {
  label: string;
  window: ActivityWindow;
  nowMs: number;
  timezone: string;
  ageLabel: (days: number) => string;
}) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDateWithAge(w.lastISO, nowMs, timezone, ageLabel)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{w.last7Days}</TableCell>
      <TableCell className="text-right tabular-nums">{w.last30Days}</TableCell>
      <TableCell className="text-right tabular-nums">{w.total}</TableCell>
    </TableRow>
  );
}

export default async function CoachlessUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ uid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { uid } = await params;

  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  const sp = await searchParams;
  const op = typeof sp.op === "string" ? sp.op : null;
  const t = await getTranslations("admin.coachlessProfile");
  const tc = await getTranslations("admin.common");
  const tcl = await getTranslations("admin.coachless");
  const tcd = await getTranslations("admin.clientDetail");
  const actionMessage = op && sp.ok === "1" ? tc("actionCompleted", { op }) : null;
  const ageLabel = (days: number): string => t("age", { days });
  const statusLabel = (status: string): string => {
    switch (status) {
      case "completed":
        return tcd("status.completed");
      case "missed":
        return tcd("status.missed");
      case "started":
        return tcd("status.started");
      case "assigned":
        return tcd("status.assigned");
      case "skipped":
        return tcd("status.skipped");
      default:
        return status;
    }
  };

  let profile: CoachlessUserProfile;
  try {
    profile = await getCoachlessUserProfile(uid);
  } catch {
    // Unknown uid, or a target that isn't an active coach-less client (a
    // coached client belongs to their coach's drill-down, not this one).
    notFound();
  }

  // Every widget below is scoped by BOTH ids; for a coach-less user the coach
  // uid IS their own uid (see the header comment).
  // #747 — the admin's own zone when the user has none, never UTC.
  const timezone = profile.timezone ?? (await getTrainerTimezone());
  const todayCivil = civilDateToday(timezone);
  const thisMonthFirst = `${todayCivil.slice(0, 7)}-01`;

  const [
    logs,
    photos,
    assignments,
    habits,
    coaches,
    calendar,
    exerciseProgress,
    personalRecords,
    nutrition,
  ] = await Promise.all([
    listRecentLogsForClientAsAdmin(uid, uid).catch(() => null),
    listProgressPhotosForClientAsAdmin(uid, uid).catch(() => []),
    listClientAssignmentsForAdmin(uid, uid).catch(() => []),
    listClientHabitsForAdmin(uid, uid).catch(() => []),
    listCoachOptionsForAdmin().catch(() => []),
    // Every one of these degrades to "empty section" rather than 500-ing the
    // whole profile — an operator inspecting a broken account needs the parts
    // that DO load, especially then.
    listMonthForClientAsAdmin({
      coachUid: uid,
      clientId: uid,
      monthFirstCivil: thisMonthFirst,
      todayCivil,
    }).catch(() => null),
    getClientExerciseProgressAsAdmin(uid, uid, timezone).catch(() => null),
    listClientPersonalRecordsAsAdmin(uid, uid).catch(() => ({ clientId: uid, records: [] })),
    // #1133 — nutrition was the one section this page never loaded, so a user's own
    // plan (`source: "self"`, trainerId === clientId) was invisible here.
    listClientNutritionForAdmin(uid, uid).catch(() => null),
  ]);

  // The chart components take their copy as props (they are shared client
  // components); pull the SAME i18n namespaces the coach progress page uses so
  // the two surfaces never drift in wording.
  const tProgress = await getTranslations("clients.exerciseProgress");
  const tRecords = await getTranslations("clients.detail.personalRecords");
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

  // Range anchors shared by the per-exercise + muscle-group charts, matching the
  // coach progress page so both surfaces bucket identically.
  const rangeStarts = {
    all: addCivilDays(todayCivil, -364),
    "90": addCivilDays(todayCivil, -89),
    "30": addCivilDays(todayCivil, -29),
    "7": addCivilDays(todayCivil, -6),
  };

  const nowMs = Date.now();
  const tier = resolveDisplayTier(profile.entitlement);
  const isPremium = tier === "premium";
  const displayName = profile.displayName || profile.email || uid;

  return (
    <div className="gc-page flex flex-col gap-6">
      <Button asChild variant="outline" size="sm" className="self-start rounded-full">
        <Link href={LIST_ROUTE}>
          <ArrowLeft className="h-4 w-4" />
          {t("backToList")}
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {displayName}
            <Badge variant={isPremium ? "success" : "secondary"}>
              {isPremium ? tcl("premium") : tcl("free")}
            </Badge>
            <Badge variant="secondary">{t("coachlessBadge")}</Badge>
          </span>
        }
        subtitle={`${profile.email || t("noEmail")} · ${uid}`}
      />

      {actionMessage ? (
        <div className="rounded-2xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-4 py-3 text-sm text-[color:var(--badge-success-fg)]">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label={t("stats.lastActive")}
          value={
            profile.activity.lastActiveISO
              ? (() => {
                  const d = daysSince(profile.activity.lastActiveISO, nowMs);
                  return d === null ? "—" : t("daysShort", { days: d });
                })()
              : t("never")
          }
          hint={formatDate(profile.activity.lastActiveISO, timezone)}
        />
        <StatTile
          label={t("stats.workouts")}
          value={String(profile.activity.workouts.last30Days)}
          hint={t("stats.workoutsHint", { total: profile.stats.workoutLogs })}
        />
        <StatTile
          label={t("stats.habitCheckIns")}
          value={String(profile.activity.habitCheckIns.last30Days)}
          hint={t("stats.last30")}
        />
        <StatTile label={t("stats.routines")} value={String(profile.stats.routines)} hint={t("stats.selfCreated")} />
        <StatTile label={t("stats.habits")} value={String(profile.stats.habits)} hint={t("stats.selfCreated")} />
        <StatTile
          label={t("stats.photos")}
          value={String(profile.stats.progressPhotos)}
          hint={t("stats.weightLogs", { count: profile.activity.weightEntries.total })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">{t("account.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Field label={tc("email")}>{profile.email || "—"}</Field>
              <Field label={tc("uid")}>
                <span className="font-mono text-xs">{uid}</span>
              </Field>
              <Field label={t("account.signedUp")}>{formatDateWithAge(profile.createdAtISO, nowMs, timezone, ageLabel)}</Field>
              <Field label={t("account.lastSignIn")}>
                {formatDateWithAge(profile.auth?.lastSignInISO ?? null, nowMs, timezone, ageLabel)}
              </Field>
              <Field label={t("account.providers")}>
                {profile.auth && profile.auth.providers.length > 0
                  ? profile.auth.providers.join(", ")
                  : "—"}
              </Field>
              <Field label={t("account.emailVerified")}>
                {profile.auth ? (profile.auth.emailVerified ? tc("yes") : tc("no")) : "—"}
              </Field>
              <Field label={t("account.timezone")}>{profile.timezone || "—"}</Field>
              {/* #785 — "nos falta en cada perfil, qué versión de la app están
                  usando, y si es iOS o Android". One line per DEVICE: someone
                  with a phone and a tablet is on two versions at once. */}
              <Field label={t("account.app")}>
                {profile.devices.length > 0 ? (
                  <span className="flex flex-col gap-0.5">
                    {profile.devices.map((device, index) => (
                      <span key={`${device.platform}-${device.appVersion ?? "?"}-${index}`}>
                        {formatAppDevice(device)}
                        {device.registeredAtISO ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {formatDateWithAge(device.registeredAtISO, nowMs, timezone, ageLabel)}
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </span>
                ) : (
                  "—"
                )}
              </Field>
              <Field label={t("account.birthDate")}>{profile.birthDate || "—"}</Field>
              {profile.auth?.disabled ? (
                <Field label={t("account.authStatus")}>
                  <Badge variant="destructive">{t("account.disabled")}</Badge>
                </Field>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">{t("coach.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("coach.description")}</p>
            {coaches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("coach.noCoaches")}</p>
            ) : (
              <AdminActionForm action={assignCoachAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="uid" value={uid} />
                <select
                  name="newCoachUid"
                  required
                  defaultValue=""
                  aria-label={t("coach.assignLabel")}
                  className="h-8 max-w-[16rem] rounded-md border bg-background px-2 text-xs"
                >
                  <option value="" disabled>
                    {t("coach.choose")}
                  </option>
                  {coaches.map((coach) => (
                    <option key={coach.uid} value={coach.uid}>
                      {coach.displayName || coach.email}
                    </option>
                  ))}
                </select>
                <AdminSubmitButton
                  idleLabel={t("coach.assign")}
                  pendingLabel={tcl("assigning")}
                  className="h-8 rounded-full border px-3 text-xs hover:bg-muted"
                />
              </AdminActionForm>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">{t("subscription.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-4">
              <Field label={t("subscription.tier")}>
                <Badge variant={isPremium ? "success" : "secondary"}>
                  {isPremium ? tcl("premium") : tcl("free")}
                </Badge>
              </Field>
              <Field label={t("subscription.source")}>{profile.entitlement?.source || "—"}</Field>
              <Field label={t("subscription.product")}>{profile.entitlement?.productId || "—"}</Field>
              <Field label={t("subscription.expires")}>{formatDate(profile.entitlement?.expiresAtISO ?? null, timezone)}</Field>
              <Field label={t("subscription.updated")}>
                {formatDateWithAge(profile.entitlement?.updatedAtISO ?? null, nowMs, timezone, ageLabel)}
              </Field>
            </dl>

            <div className="flex flex-col items-start gap-3 border-t pt-4">
              <AdminActionForm action={setTierAction}>
                <input type="hidden" name="uid" value={uid} />
                <input type="hidden" name="tier" value={isPremium ? "free" : "premium"} />
                <AdminSubmitButton
                  idleLabel={isPremium ? tcl("revokePremium") : tcl("grantPremium")}
                  pendingLabel={tcl("saving")}
                  className="h-8 rounded-full border px-3 text-xs hover:bg-muted"
                />
              </AdminActionForm>

              <details>
                <summary className="cursor-pointer text-xs text-destructive underline underline-offset-2">
                  {tcl("deleteUser")}
                </summary>
                <AdminActionForm action={deleteUserAction} className="mt-2 flex flex-col items-start gap-2">
                  <input type="hidden" name="uid" value={uid} />
                  <p className="max-w-md text-[10px] text-muted-foreground">
                    {tcl.rich("deleteWarning", {
                      email: () => <span className="font-mono">{profile.email}</span>,
                    })}
                  </p>
                  <Input
                    name="emailConfirmation"
                    placeholder={tcl("deleteEmailPlaceholder")}
                    aria-label={tcl("deleteEmailPlaceholder")}
                    className="h-8 w-64 text-xs"
                    autoComplete="off"
                  />
                  <AdminSubmitButton
                    idleLabel={tcl("deleteForever")}
                    pendingLabel={tc("deleting")}
                    className="h-8 rounded-full bg-destructive px-3 text-xs text-destructive-foreground hover:bg-destructive/90"
                  />
                </AdminActionForm>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t("activity.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("activity.stream")}</TableHead>
                  <TableHead>{t("activity.last")}</TableHead>
                  <TableHead className="text-right">{t("activity.days7")}</TableHead>
                  <TableHead className="text-right">{t("activity.days30")}</TableHead>
                  <TableHead className="text-right">{t("activity.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <ActivityRow label={t("activity.workouts")} window={profile.activity.workouts} nowMs={nowMs} timezone={timezone} ageLabel={ageLabel} />
                <ActivityRow
                  label={t("activity.habitCheckIns")}
                  window={profile.activity.habitCheckIns}
                  nowMs={nowMs} timezone={timezone} ageLabel={ageLabel}
                />
                <ActivityRow label={t("activity.photos")} window={profile.activity.photos} nowMs={nowMs} timezone={timezone} ageLabel={ageLabel} />
                <ActivityRow
                  label={t("activity.weight")}
                  window={profile.activity.weightEntries}
                  nowMs={nowMs} timezone={timezone} ageLabel={ageLabel}
                />
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t("routines.title", { count: profile.routines.length })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {profile.routines.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {t("routines.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("routines.routine")}</TableHead>
                    <TableHead>{t("routines.tags")}</TableHead>
                    <TableHead className="text-right">{t("routines.exercises")}</TableHead>
                    <TableHead>{t("routines.created")}</TableHead>
                    <TableHead>{t("routines.updated")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.routines.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.tags.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.exerciseCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(r.createdAtISO, timezone)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(r.updatedAtISO, timezone)}
                      </TableCell>
                      <TableCell>
                        {r.deleted ? (
                          <Badge variant="secondary">{tcd("habits.deleted")}</Badge>
                        ) : (
                          <Badge variant="success">{tcd("habits.active")}</Badge>
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
          <CardTitle className="text-xl">{t("habitsTitle", { count: habits.length })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {habits.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">{t("habitsEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tcd("habits.habit")}</TableHead>
                    <TableHead>{tcd("habits.cadence")}</TableHead>
                    <TableHead>{tcd("habits.reminder")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {habits.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{h.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[h.scheduleType, h.cadence].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {h.reminderEnabled ? tcd("habits.on") : tcd("habits.off")}
                      </TableCell>
                      <TableCell>
                        {h.deleted ? (
                          <Badge variant="secondary">{tcd("habits.deleted")}</Badge>
                        ) : (
                          <Badge variant="success">{tcd("habits.active")}</Badge>
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
          <CardTitle className="text-xl">{t("scheduledTitle", { count: assignments.length })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {t("scheduledEmpty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tcd("assignments.date")}</TableHead>
                    <TableHead>{tcd("assignments.time")}</TableHead>
                    <TableHead>{tcd("assignments.workout")}</TableHead>
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
                            {tcd("assignments.completedOf", { done: a.completedCount, total: a.occurrences })}
                          </span>
                        ) : (
                          <Badge variant={assignmentStatusVariant(a.status)}>{statusLabel(a.status)}</Badge>
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
          <CardTitle className="text-xl">{t("calendar")}</CardTitle>
        </CardHeader>
        <CardContent>
          {calendar ? (
            // READ-ONLY by construction — the coach's calendar's drag-to-move /
            // assign affordances are deliberately absent from every god-mode
            // drill-down.
            <AdminReadOnlyCalendar
              coachUid={uid}
              clientId={uid}
              todayCivil={todayCivil}
              initialMonthFirst={thisMonthFirst}
              initialPayload={calendar}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("calendarUnavailable")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{tcd("recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {logs && logs.logs.length > 0 ? (
            // showActions=false — admin is read-only and the row action buttons
            // are trainer-scoped. linkMode="admin" with coachUid = the user's own
            // uid routes workout + photo rows to the admin-gated detail routes,
            // which admit them under the same self-as-coach rule.
            <ClientRecentLogsFeed
              logs={logs.logs}
              clientId={uid}
              timezone={timezone}
              initialCursor={logs.nextCursor}
              initialHasMore={logs.hasMore}
              showActions={false}
              linkMode="admin"
              coachUid={uid}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
          )}
        </CardContent>
      </Card>

      {/* Training analytics — the surfaces a coach gets on their own client
          detail, which a coach-less user had nobody to look at them for. All of
          these are the coach components verbatim; only the data gate differs. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t("workoutTrends")}</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutTrendsWidget clientId={uid} timezone={timezone} />
        </CardContent>
      </Card>

      {exerciseProgress && exerciseProgress.availableMuscleGroups.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">{t("muscleGroupVolume")}</CardTitle>
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
            <CardTitle className="text-xl">{t("progressByExercise")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ExerciseProgressClient
              exercises={exerciseProgress.exercises}
              points={exerciseProgress.points}
              setSessions={exerciseProgress.exerciseSetSessions}
              truncatedSetHistoryExerciseIds={
                exerciseProgress.truncatedSetHistoryExerciseIds
              }
              today={todayCivil}
              rangeStarts={rangeStarts}
              labels={exerciseProgressLabels}
            />
          </CardContent>
        </Card>
      ) : null}

      {personalRecords.records.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">
              {t("personalRecords", { count: personalRecords.records.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PersonalRecordsClient
              records={personalRecords.records}
              labels={personalRecordLabels}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t("habitAdherence")}</CardTitle>
        </CardHeader>
        <CardContent>
          <HabitTrendsWidget clientId={uid} coachId={null} timezone={timezone} />
        </CardContent>
      </Card>

      <AdminNutritionCard nutrition={nutrition} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{t("bodyWeight")}</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.activity.weightEntries.total > 0 ? (
            <BodyWeightTrendChart clientId={uid} timezone={timezone} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("noBodyWeight")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{tcd("photos.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length > 0 ? (
            <ProgressPhotosGridClient photos={photos} timezone={timezone} />
          ) : (
            <p className="text-sm text-muted-foreground">{tcd("photos.empty")}</p>
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
