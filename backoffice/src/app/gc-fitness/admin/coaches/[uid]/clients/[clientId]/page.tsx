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
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { listRecentLogsForClientAsAdmin } from "@/lib/gc-fitness/recent-logs-actions";
import { listProgressPhotosForClientAsAdmin } from "@/lib/gc-fitness/progress-photo-actions";
import {
  listClientAssignmentsForAdmin,
  listClientHabitsForAdmin,
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
import { PageHeader } from "@/components/gc-fitness/page-header";

import { ClientRecentLogsFeed } from "@/app/gc-fitness/clients/[id]/_components/ClientRecentLogsFeed";
import { ProgressPhotosGridClient } from "@/app/gc-fitness/clients/[id]/_components/ProgressPhotosGridClient";

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
  try {
    [logs, photos, assignments, habits] = await Promise.all([
      listRecentLogsForClientAsAdmin(uid, clientId),
      listProgressPhotosForClientAsAdmin(uid, clientId),
      listClientAssignmentsForAdmin(uid, clientId),
      listClientHabitsForAdmin(uid, clientId),
    ]);
  } catch {
    // Client doesn't exist or doesn't belong to this coach.
    notFound();
  }

  const clientName = logs.clients[0]?.name ?? clientId;
  const clientSnap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  const storedTimezone = clientSnap.get("timezone");
  const timezone =
    typeof storedTimezone === "string" && storedTimezone ? storedTimezone : "UTC";

  return (
    <div className="gc-page flex flex-col gap-6">
      <div>
        <Link
          href={`/gc-fitness/admin/coaches/${uid}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to coach
        </Link>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {clientName}
            <Badge variant="secondary">Read-only</Badge>
          </span>
        }
        subtitle={`Client UID: ${clientId}`}
      />

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
