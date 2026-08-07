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
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

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
  listCoachOptionsForAdmin,
  transferClientToCoach,
} from "@/lib/gc-fitness/admin-actions";
import {
  deleteCoachlessUser,
  getCoachlessUserProfile,
  setUserEntitlementTier,
  type CoachlessUserProfile,
} from "@/lib/gc-fitness/admin-coachless-actions";
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
import { ExerciseProgressClient } from "@/app/gc-fitness/clients/[id]/progress/ExerciseProgressClient";
import { MuscleGroupProgressClient } from "@/app/gc-fitness/clients/[id]/progress/MuscleGroupProgressClient";
import { addCivilDays } from "@/app/gc-fitness/clients/[id]/_components/trend-range";
import { AdminReadOnlyCalendar } from "./_components/AdminReadOnlyCalendar";
import { ClientRecentLogsFeed } from "@/app/gc-fitness/clients/[id]/_components/ClientRecentLogsFeed";
import { ProgressPhotosGridClient } from "@/app/gc-fitness/clients/[id]/_components/ProgressPhotosGridClient";

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
): string {
  if (!iso) return "—";
  const days = daysSince(iso, nowMs);
  if (days === null) return formatDate(iso, timezone);
  const age = days === 0 ? "hoy" : days === 1 ? "hace 1 d" : `hace ${days} d`;
  return `${formatDate(iso, timezone)} (${age})`;
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
}: {
  label: string;
  window: ActivityWindow;
  nowMs: number;
  timezone: string;
}) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDateWithAge(w.lastISO, nowMs, timezone)}
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
  const actionMessage = op && sp.ok === "1" ? `Action completed: ${op}.` : null;

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

  // Assigning a coach IS a transfer — from no coach to one. Reuses the tested
  // `transferClientToCoach` (doc re-point + chat move + coachId claim resync)
  // rather than adding a second write path. Afterwards this profile 404s (the
  // user is no longer coach-less), so land on their coached drill-down instead.
  async function assignCoachAction(formData: FormData) {
    "use server";
    const clientUid = String(formData.get("uid") ?? "");
    const newCoachUid = String(formData.get("newCoachUid") ?? "");
    await transferClientToCoach({ clientUid, newCoachUid });
    revalidatePath(LIST_ROUTE);
    revalidatePath(`/gc-fitness/admin/coaches/${newCoachUid}`);
    redirect(`/gc-fitness/admin/coaches/${newCoachUid}/clients/${clientUid}`);
  }

  async function setTierAction(formData: FormData) {
    "use server";
    const targetUid = String(formData.get("uid") ?? "");
    const nextTier = String(formData.get("tier") ?? "");
    await setUserEntitlementTier({ uid: targetUid, tier: nextTier });
    revalidatePath(`${LIST_ROUTE}/${targetUid}`);
    redirect(`${LIST_ROUTE}/${targetUid}?op=set_${nextTier}&ok=1`);
  }

  async function deleteUserAction(formData: FormData) {
    "use server";
    const targetUid = String(formData.get("uid") ?? "");
    const emailConfirmation = String(formData.get("emailConfirmation") ?? "");
    await deleteCoachlessUser({ uid: targetUid, emailConfirmation });
    revalidatePath(LIST_ROUTE);
    // The user no longer exists — land back on the list, not on a 404.
    redirect(`${LIST_ROUTE}?op=delete_user&ok=1`);
  }

  return (
    <div className="gc-page flex flex-col gap-6">
      <Button asChild variant="outline" size="sm" className="self-start rounded-full">
        <Link href={LIST_ROUTE}>
          <ArrowLeft className="h-4 w-4" />
          Back to coach-less users
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {displayName}
            <Badge variant={isPremium ? "success" : "secondary"}>
              {isPremium ? "Premium" : "Free"}
            </Badge>
            <Badge variant="secondary">Coach-less</Badge>
          </span>
        }
        subtitle={`${profile.email || "no email"} · ${uid}`}
      />

      {actionMessage ? (
        <div className="rounded-2xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-4 py-3 text-sm text-[color:var(--badge-success-fg)]">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Last active"
          value={
            profile.activity.lastActiveISO
              ? (() => {
                  const d = daysSince(profile.activity.lastActiveISO, nowMs);
                  return d === null ? "—" : d === 0 ? "hoy" : `${d} d`;
                })()
              : "never"
          }
          hint={formatDate(profile.activity.lastActiveISO, timezone)}
        />
        <StatTile
          label="Workouts"
          value={String(profile.activity.workouts.last30Days)}
          hint={`last 30 d · ${profile.stats.workoutLogs} total`}
        />
        <StatTile
          label="Habit check-ins"
          value={String(profile.activity.habitCheckIns.last30Days)}
          hint="last 30 d"
        />
        <StatTile label="Routines" value={String(profile.stats.routines)} hint="self-created" />
        <StatTile label="Habits" value={String(profile.stats.habits)} hint="self-created" />
        <StatTile
          label="Photos"
          value={String(profile.stats.progressPhotos)}
          hint={`weight logs: ${profile.activity.weightEntries.total}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Email">{profile.email || "—"}</Field>
              <Field label="UID">
                <span className="font-mono text-xs">{uid}</span>
              </Field>
              <Field label="Signed up">{formatDateWithAge(profile.createdAtISO, nowMs, timezone)}</Field>
              <Field label="Last sign-in">
                {formatDateWithAge(profile.auth?.lastSignInISO ?? null, nowMs, timezone)}
              </Field>
              <Field label="Sign-in providers">
                {profile.auth && profile.auth.providers.length > 0
                  ? profile.auth.providers.join(", ")
                  : "—"}
              </Field>
              <Field label="Email verified">
                {profile.auth ? (profile.auth.emailVerified ? "yes" : "no") : "—"}
              </Field>
              <Field label="Timezone">{profile.timezone || "—"}</Field>
              {/* #785 — "nos falta en cada perfil, qué versión de la app están
                  usando, y si es iOS o Android". One line per DEVICE: someone
                  with a phone and a tablet is on two versions at once. */}
              <Field label="App">
                {profile.devices.length > 0 ? (
                  <span className="flex flex-col gap-0.5">
                    {profile.devices.map((device, index) => (
                      <span key={`${device.platform}-${device.appVersion ?? "?"}-${index}`}>
                        {formatAppDevice(device)}
                        {device.registeredAtISO ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {formatDateWithAge(device.registeredAtISO, nowMs, timezone)}
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </span>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Birth date">{profile.birthDate || "—"}</Field>
              {profile.auth?.disabled ? (
                <Field label="Auth status">
                  <Badge variant="destructive">disabled</Badge>
                </Field>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Coach</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              This user is self-serve — nobody is coaching them. Assigning a coach
              links them to that coach&apos;s roster, moves their chat thread, and
              makes them premium for as long as the link lasts. All their existing
              routines, habits and logs are kept.
            </p>
            {coaches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No coaches available.</p>
            ) : (
              <form action={assignCoachAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="uid" value={uid} />
                <select
                  name="newCoachUid"
                  required
                  defaultValue=""
                  aria-label="Assign a coach to this user"
                  className="h-8 max-w-[16rem] rounded-md border bg-background px-2 text-xs"
                >
                  <option value="" disabled>
                    Choose a coach…
                  </option>
                  {coaches.map((coach) => (
                    <option key={coach.uid} value={coach.uid}>
                      {coach.displayName || coach.email}
                    </option>
                  ))}
                </select>
                <AdminSubmitButton
                  idleLabel="Assign coach"
                  pendingLabel="Assigning…"
                  className="h-8 rounded-full border px-3 text-xs hover:bg-muted"
                />
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Subscription</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Tier">
                <Badge variant={isPremium ? "success" : "secondary"}>
                  {isPremium ? "Premium" : "Free"}
                </Badge>
              </Field>
              <Field label="Source">{profile.entitlement?.source || "—"}</Field>
              <Field label="Product">{profile.entitlement?.productId || "—"}</Field>
              <Field label="Expires">{formatDate(profile.entitlement?.expiresAtISO ?? null, timezone)}</Field>
              <Field label="Updated">
                {formatDateWithAge(profile.entitlement?.updatedAtISO ?? null, nowMs, timezone)}
              </Field>
            </dl>

            <div className="flex flex-col items-start gap-3 border-t pt-4">
              <form action={setTierAction}>
                <input type="hidden" name="uid" value={uid} />
                <input type="hidden" name="tier" value={isPremium ? "free" : "premium"} />
                <AdminSubmitButton
                  idleLabel={isPremium ? "Revoke premium" : "Grant premium"}
                  pendingLabel="Saving…"
                  className="h-8 rounded-full border px-3 text-xs hover:bg-muted"
                />
              </form>

              <details>
                <summary className="cursor-pointer text-xs text-destructive underline underline-offset-2">
                  Delete user
                </summary>
                <form action={deleteUserAction} className="mt-2 flex flex-col items-start gap-2">
                  <input type="hidden" name="uid" value={uid} />
                  <p className="max-w-md text-[10px] text-muted-foreground">
                    Irreversible: deletes Auth, all Firestore data, and Storage photos.
                    Type <span className="font-mono">{profile.email}</span> to confirm.
                  </p>
                  <Input
                    name="emailConfirmation"
                    placeholder="type email to confirm"
                    className="h-8 w-64 text-xs"
                    autoComplete="off"
                  />
                  <AdminSubmitButton
                    idleLabel="Delete forever"
                    pendingLabel="Deleting…"
                    className="h-8 rounded-full bg-destructive px-3 text-xs text-destructive-foreground hover:bg-destructive/90"
                  />
                </form>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stream</TableHead>
                  <TableHead>Last</TableHead>
                  <TableHead className="text-right">7 d</TableHead>
                  <TableHead className="text-right">30 d</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <ActivityRow label="Workouts logged" window={profile.activity.workouts} nowMs={nowMs} timezone={timezone} />
                <ActivityRow
                  label="Habit check-ins"
                  window={profile.activity.habitCheckIns}
                  nowMs={nowMs} timezone={timezone}
                />
                <ActivityRow label="Progress photos" window={profile.activity.photos} nowMs={nowMs} timezone={timezone} />
                <ActivityRow
                  label="Body-weight entries"
                  window={profile.activity.weightEntries}
                  nowMs={nowMs} timezone={timezone}
                />
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Routines ({profile.routines.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {profile.routines.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No self-created routines yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Routine</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-right">Exercises</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Status</TableHead>
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
                          <Badge variant="secondary">deleted</Badge>
                        ) : (
                          <Badge variant="success">active</Badge>
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
          <CardTitle className="text-xl">Habits ({habits.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {habits.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No habits yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Habit</TableHead>
                    <TableHead>Cadence</TableHead>
                    <TableHead>Reminder</TableHead>
                    <TableHead>Status</TableHead>
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
                        {h.reminderEnabled ? "On" : "Off"}
                      </TableCell>
                      <TableCell>
                        {h.deleted ? (
                          <Badge variant="secondary">deleted</Badge>
                        ) : (
                          <Badge variant="success">active</Badge>
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
          <CardTitle className="text-xl">Scheduled workouts ({assignments.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nothing scheduled — this user has never planned a workout.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Workout</TableHead>
                    <TableHead>Status</TableHead>
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
                            {a.completedCount}/{a.occurrences} completados
                          </span>
                        ) : (
                          <Badge variant={assignmentStatusVariant(a.status)}>{a.status}</Badge>
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
          <CardTitle className="text-xl">Calendar</CardTitle>
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
            <p className="text-sm text-muted-foreground">Calendar unavailable.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Recent activity</CardTitle>
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
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Training analytics — the surfaces a coach gets on their own client
          detail, which a coach-less user had nobody to look at them for. All of
          these are the coach components verbatim; only the data gate differs. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Workout trends</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutTrendsWidget clientId={uid} timezone={timezone} />
        </CardContent>
      </Card>

      {exerciseProgress && exerciseProgress.availableMuscleGroups.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Weekly volume &amp; sets by muscle group</CardTitle>
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
            <CardTitle className="text-xl">Progress by exercise</CardTitle>
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
              Personal records ({personalRecords.records.length})
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
          <CardTitle className="text-xl">Habit adherence</CardTitle>
        </CardHeader>
        <CardContent>
          <HabitTrendsWidget clientId={uid} timezone={timezone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Body weight</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.activity.weightEntries.total > 0 ? (
            <BodyWeightTrendChart clientId={uid} timezone={timezone} />
          ) : (
            <p className="text-sm text-muted-foreground">No body-weight entries yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Progress photos</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length > 0 ? (
            <ProgressPhotosGridClient photos={photos} timezone={timezone} />
          ) : (
            <p className="text-sm text-muted-foreground">No progress photos yet.</p>
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
