import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MessageCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { ShareWorkoutCard } from "@/components/gc-fitness/share-workout-card";
import { WorkoutLogDetailView } from "@/components/gc-fitness/workout-log-detail-view";
import { getWorkoutLogDetail } from "@/lib/gc-fitness/recent-logs-actions";

interface PageProps {
  params: Promise<{ logId: string }>;
}

export const dynamic = "force-dynamic";

export default async function WorkoutLogDetailPage({ params }: PageProps) {
  const { logId } = await params;
  const t = await getTranslations("recentLogs.workoutDetail");

  try {
    const detail = await getWorkoutLogDetail(logId);

    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        {/* Context-aware action chrome: Recent Logs gets back + share + chat
            (no edit/delete — those are assignment ops that live on the
            calendar). The detail BODY is the shared WorkoutLogDetailView. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href="/gc-fitness/recent-logs">
              <ChevronLeft className="h-4 w-4" />
              {t("backToLogs")}
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <ShareWorkoutCard detail={detail} />
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href={`/gc-fitness/chat?chatId=${detail.clientId}`}>
                <MessageCircle className="h-4 w-4" />
                {t("openChat")}
              </Link>
            </Button>
          </div>
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
