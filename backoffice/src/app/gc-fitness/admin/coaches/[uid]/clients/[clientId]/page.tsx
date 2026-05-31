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
import { listRecentLogsForClientAsAdmin } from "@/lib/gc-fitness/recent-logs-actions";
import { listProgressPhotosForClientAsAdmin } from "@/lib/gc-fitness/progress-photo-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  try {
    [logs, photos] = await Promise.all([
      listRecentLogsForClientAsAdmin(uid, clientId),
      listProgressPhotosForClientAsAdmin(uid, clientId),
    ]);
  } catch {
    // Client doesn't exist or doesn't belong to this coach.
    notFound();
  }

  const clientName = logs.clients[0]?.name ?? clientId;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div>
        <Link
          href={`/gc-fitness/admin/coaches/${uid}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to coach
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{clientName}</h1>
          <Badge variant="secondary">Read-only</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Client UID: {clientId}</p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {/* showActions=false — admin is read-only and the chat / workout-detail
              targets are trainer-scoped (would 403 for an admin). */}
          <ClientRecentLogsFeed logs={logs.logs} showActions={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Progress photos</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length > 0 ? (
            <ProgressPhotosGridClient photos={photos} />
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
