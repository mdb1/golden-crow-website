import Link from "next/link";
import { ArrowLeft, BookOpen, ShieldUser, Sparkles } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AdminUserProgressRecord,
  AdminUserRecord,
} from "@/lib/moderation-types";
import { formatDateTime } from "@/lib/moderation-utils";

export function LearningUserWorkbench({
  user,
  progress,
  completedLessonDetails,
}: {
  user: AdminUserRecord;
  progress: AdminUserProgressRecord | null;
  completedLessonDetails: Array<{ id: string; title: string }>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/learning">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to learning users
          </Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{user.uid}</span>
      </div>

      <section className="flex flex-col gap-4">
        <div className="grid gap-3 xl:grid-cols-3">
          <MetricCard
            icon={ShieldUser}
            title="Account state"
            description="Open the account workbench for identity, onboarding, and visibility fields."
            href={`/users/${user.uid}`}
            value={formatDateTime(user.lastSignInAt) ?? "No sign-in"}
            tone="blue"
          />
          <MetricCard
            icon={Sparkles}
            title={progress ? "Progress workbench" : "No progress record"}
            description={
              progress
                ? "Open user_progress/{uid} for raw XP, level, streak, and completion editing."
                : "This user does not have a user_progress document yet."
            }
            href={progress ? `/collections/user_progress/${user.uid}` : "/collections/user_progress"}
            ctaLabel={progress ? "Open progress" : "Browse progress"}
            value={progress ? `${progress.completedLessons.length} lessons` : undefined}
            tone="green"
          />
          <MetricCard
            icon={BookOpen}
            title="Lesson library"
            description="Cross-check completed lesson ids against the structured lesson content editor."
            href="/learning/library"
            ctaLabel="Open lessons"
            tone="green"
          />
        </div>

        <div className="glass-panel flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="section-eyebrow">Learning</p>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Selected user learning state
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review raw progression before changing XP, streaks, or lesson
                completion for this user.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={progress ? "success" : "warning"}>
                {progress ? "Progress record present" : "No progress record"}
              </Badge>
              <Badge variant={user.onboardingCompleted ? "brand" : "warning"}>
                {user.onboardingCompleted ? "Onboarded" : "Needs onboarding"}
              </Badge>
            </div>
          </div>

          {progress ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Level", value: progress.level.toString() },
                  { label: "XP", value: progress.xp.toString() },
                  {
                    label: "Current streak",
                    value: progress.streak.current.toString(),
                  },
                  {
                    label: "Completed lessons",
                    value: progress.completedLessons.length.toString(),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-border/80 bg-muted/30 px-4 py-3"
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-2 font-heading text-2xl font-semibold text-foreground">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_320px]">
                <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Completed lessons
                  </p>
                  {completedLessonDetails.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-3">
                      {completedLessonDetails.map((lesson) => (
                        <Link
                          key={lesson.id}
                          href={`/learning/${lesson.id}`}
                          className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                        >
                          <p className="text-sm font-medium text-foreground">
                            {lesson.title}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {lesson.id}
                          </p>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No completed lesson ids were recorded for this user.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Streak and collection state
                  </p>
                  <div className="mt-3 flex flex-col gap-3 text-sm">
                    <div className="rounded-xl border border-border/70 bg-card/50 px-3 py-3">
                      <p className="font-medium text-foreground">Longest streak</p>
                      <p className="mt-1 text-muted-foreground">
                        {progress.streak.longest} days
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/50 px-3 py-3">
                      <p className="font-medium text-foreground">Last activity</p>
                      <p className="mt-1 text-muted-foreground">
                        {formatDateTime(progress.streak.lastActivityDate) ??
                          progress.streak.lastActivityDate}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/50 px-3 py-3">
                      <p className="font-medium text-foreground">
                        Collected amino acids
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {progress.collectedAminoAcids.length} collected
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-border/80 bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
              This user does not yet have a user_progress record. Use the raw
              collection browser if you need to inspect neighboring records or
              create the state manually.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
