// Admin god-mode (READ-ONLY) workout-log detail for a coach's client.
// Reuses the shared WorkoutLogDetailView. Admin-gated at the page AND inside
// getWorkoutLogDetailAsAdmin, which verifies the log belongs to {uid}.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { getWorkoutLogDetailAsAdmin } from "@/lib/gc-fitness/recent-logs-actions";
import { WorkoutLogDetailView } from "@/components/gc-fitness/workout-log-detail-view";

export const dynamic = "force-dynamic";

export default async function AdminWorkoutLogDetailPage({
  params,
}: {
  params: Promise<{ uid: string; clientId: string; logId: string }>;
}) {
  const { uid, clientId, logId } = await params;

  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    throw err;
  }

  try {
    const detail = await getWorkoutLogDetailAsAdmin(uid, logId);
    return (
      <div className="gc-page flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm" className="gap-1 rounded-full">
            <Link href={`/gc-fitness/admin/coaches/${uid}/clients/${clientId}`}>
              <ChevronLeft className="h-4 w-4" />
              Back to client
            </Link>
          </Button>
          <Badge variant="secondary">Read-only</Badge>
        </div>

        <WorkoutLogDetailView detail={detail} />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown";
    if (message === "Workout log not found." || message === "Forbidden") {
      notFound();
    }
    throw error;
  }
}
