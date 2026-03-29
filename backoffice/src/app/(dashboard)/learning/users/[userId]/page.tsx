import { notFound } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { LearningUserWorkbench } from "@/components/learning/learning-user-workbench";
import { PageHero } from "@/components/page-hero";
import { getSubjects } from "@/lib/lesson-loader";
import { sdkFetchServer } from "@/lib/sdk-server";
import type { AdminUserProgressRecord, AdminUserRecord } from "@/lib/moderation-types";

function buildLessonLookup(subjects: Awaited<ReturnType<typeof getSubjects>>) {
  return new Map(
    subjects.flatMap((subject) =>
      subject.chapters.flatMap((chapter) =>
        chapter.lessons.map((lesson) => [lesson.lessonIdentifier, lesson.lessonTitle] as const)
      )
    )
  );
}

async function getOptionalProgress(userId: string): Promise<AdminUserProgressRecord | null> {
  try {
    const result = await sdkFetchServer<{ progress: AdminUserProgressRecord }>(
      `/users/${userId}/progress`
    );
    return result.progress;
  } catch {
    return null;
  }
}

export default async function LearningUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  let user: AdminUserRecord;
  try {
    const result = await sdkFetchServer<{ user: AdminUserRecord }>(`/users/${userId}`);
    user = result.user;
  } catch {
    notFound();
  }

  const [progress, subjects] = await Promise.all([
    getOptionalProgress(userId),
    getSubjects(),
  ]);

  const lessonLookup = buildLessonLookup(subjects);
  const completedLessonDetails =
    progress?.completedLessons.map((lessonId) => ({
      id: lessonId,
      title: lessonLookup.get(lessonId) ?? lessonId,
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Learning"
        title={user.displayName || user.email || user.uid}
        description="Pick a user first, then inspect or manipulate that user’s progression state without dropping back into raw collections."
      />
      <HelperBanner title="Keep content editing separate from user state." tone="green">
        The selected-user learning view is for progression records. Use the
        lesson library when you need to change the lesson content itself.
      </HelperBanner>
      <LearningUserWorkbench
        user={user}
        progress={progress}
        completedLessonDetails={completedLessonDetails}
      />
    </div>
  );
}
