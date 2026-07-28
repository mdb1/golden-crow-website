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

import { revalidatePath } from "next/cache";
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
import { listProgressPhotosForClientAsAdmin } from "@/lib/gc-fitness/progress-photo-actions";
import { listRecentLogsForClientAsAdmin } from "@/lib/gc-fitness/recent-logs-actions";

import { BodyWeightTrendChart } from "@/app/gc-fitness/clients/[id]/_components/BodyWeightTrendChart";
import { ClientRecentLogsFeed } from "@/app/gc-fitness/clients/[id]/_components/ClientRecentLogsFeed";
import { ProgressPhotosGridClient } from "@/app/gc-fitness/clients/[id]/_components/ProgressPhotosGridClient";

export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

const LIST_ROUTE = "/gc-fitness/admin/coach-less-users";

/** Stable YYYY-MM-DD (avoids the server-locale flake seen in date tests). */
function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

/** "2026-07-26 (hace 2 d)" — absolute date first, recency in parentheses. */
function formatDateWithAge(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const days = daysSince(iso, nowMs);
  if (days === null) return formatDate(iso);
  const age = days === 0 ? "hoy" : days === 1 ? "hace 1 d" : `hace ${days} d`;
  return `${formatDate(iso)} (${age})`;
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
}: {
  label: string;
  window: ActivityWindow;
  nowMs: number;
}) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDateWithAge(w.lastISO, nowMs)}
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
  const [logs, photos, assignments, habits, coaches] = await Promise.all([
    listRecentLogsForClientAsAdmin(uid, uid).catch(() => null),
    listProgressPhotosForClientAsAdmin(uid, uid).catch(() => []),
    listClientAssignmentsForAdmin(uid, uid).catch(() => []),
    listClientHabitsForAdmin(uid, uid).catch(() => []),
    listCoachOptionsForAdmin().catch(() => []),
  ]);

  const nowMs = Date.now();
  const tier = resolveDisplayTier(profile.entitlement);
  const isPremium = tier === "premium";
  const timezone = profile.timezone ?? "UTC";
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
          hint={formatDate(profile.activity.lastActiveISO)}
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
              <Field label="Signed up">{formatDateWithAge(profile.createdAtISO, nowMs)}</Field>
              <Field label="Last sign-in">
                {formatDateWithAge(profile.auth?.lastSignInISO ?? null, nowMs)}
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
              <Field label="Expires">{formatDate(profile.entitlement?.expiresAtISO ?? null)}</Field>
              <Field label="Updated">
                {formatDateWithAge(profile.entitlement?.updatedAtISO ?? null, nowMs)}
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
                <ActivityRow label="Workouts logged" window={profile.activity.workouts} nowMs={nowMs} />
                <ActivityRow
                  label="Habit check-ins"
                  window={profile.activity.habitCheckIns}
                  nowMs={nowMs}
                />
                <ActivityRow label="Progress photos" window={profile.activity.photos} nowMs={nowMs} />
                <ActivityRow
                  label="Body-weight entries"
                  window={profile.activity.weightEntries}
                  nowMs={nowMs}
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
                        {formatDate(r.createdAtISO)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(r.updatedAtISO)}
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
