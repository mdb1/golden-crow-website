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

import { ClientRecentLogsFeed } from "@/app/gc-fitness/clients/[id]/_components/ClientRecentLogsFeed";
import { ProgressPhotosGridClient } from "@/app/gc-fitness/clients/[id]/_components/ProgressPhotosGridClient";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <adminPanel>" (issue #170).
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

  return (
    <div className="gc-page flex flex-col gap-6">
      <div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href={`/gc-fitness/admin/coaches/${uid}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to coach
          </Link>
        </Button>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {clientName}
            <Badge variant="secondary">Read-only</Badge>
          </span>
        }
        subtitle={`Client UID: ${clientId}`}
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href={`/gc-fitness/admin/coaches/${uid}`}>
              <UserRound className="h-4 w-4" />
              Ver coach
            </Link>
          </Button>
        }
      />

      <p className="-mt-2 text-sm text-muted-foreground">
        Coach:{" "}
        <Link
          href={`/gc-fitness/admin/coaches/${uid}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {coachName}
        </Link>
        {coachEmail && coachEmail !== coachName ? ` · ${coachEmail}` : null}
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Recent activity</CardTitle>
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
          <CardTitle className="text-xl">Workout assignments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No workout assignments yet.
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
                          <Badge variant={assignmentStatusVariant(a.status)}>
                            {a.status}
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
          <CardTitle className="text-xl">Habits</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {habits.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No habits assigned yet.
            </p>
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
                        {[h.scheduleType, h.cadence].filter(Boolean).join(" · ") ||
                          "—"}
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

      {/*
        Nutrition (#949-adjacent). This page fetched and rendered exactly four things —
        recent activity, workout assignments, habits and progress photos — and never
        nutrition. Not for one client: for EVERY client, because there was no code path.
        So the one surface an operator opens to answer "what is going on with this person"
        was silent about the half of the product that fails QUIETLY: a phase that expired
        and was never replaced shows up nowhere else, it just makes adherence stop moving.

        The numbers come from the same loader the coach's roster column and the coach's
        client profile use, so the three surfaces cannot print three different adherence
        figures for the same week.
      */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Nutrition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {nutrition.hasActivePlan ? (
              <Badge variant="success">active phase</Badge>
            ) : nutrition.neverHadPlan ? (
              <Badge variant="secondary">never assigned</Badge>
            ) : (
              /* The state this card exists for: they HAD a phase and nobody loaded the
                 next one. Invisible on every other column. */
              <Badge variant="destructive">no active phase</Badge>
            )}
            {nutrition.activePlanName ? (
              <span className="text-sm">{nutrition.activePlanName}</span>
            ) : null}
            {nutrition.activePlanEndsOn ? (
              <span className="text-xs text-muted-foreground">
                ends {nutrition.activePlanEndsOn}
              </span>
            ) : null}
            <span className="text-sm text-muted-foreground">
              {/* `null` is NOT 0. Null means nobody asked anything of this client in the
                  window; zero means they were asked and did not comply. Printing the first
                  as "0%" sends an operator to have the wrong conversation. */}
              7-day adherence:{" "}
              {nutrition.percent7d === null ? (
                <span title="Nothing was asked in the last 7 days">n/a</span>
              ) : (
                `${nutrition.percent7d}%`
              )}
            </span>
          </div>

          {nutrition.phases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No nutrition phases assigned yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phase</TableHead>
                    <TableHead>Starts</TableHead>
                    <TableHead>Ends</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nutrition.phases.map((phase) => (
                    <TableRow key={phase.id}>
                      <TableCell>{phase.name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {phase.startsOn}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {/* Open-ended is a real, intentional shape — not missing data. */}
                        {phase.endsOn ?? "open-ended"}
                      </TableCell>
                      <TableCell>
                        {phase.deleted ? (
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
          <CardTitle className="text-xl">Progress photos</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length > 0 ? (
            <ProgressPhotosGridClient photos={photos} timezone={timezone} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No progress photos yet.
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
