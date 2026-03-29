import { BookOpen, Sparkles } from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { LearningTree } from "@/components/learning/LearningTree";
import { MetricCard } from "@/components/metric-card";
import { PageHero } from "@/components/page-hero";
import { getSubjects, getTotalLessonCount } from "@/lib/lesson-loader";

export default async function LearningLibraryPage() {
  const subjects = await getSubjects();
  const totalCount = await getTotalLessonCount();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Learning"
        title="Lesson library"
        description={`${totalCount} lessons across ${subjects.length} subjects, kept separate from per-user learning state.`}
      />
      <HelperBanner title="Edit lessons here, not in user progress." tone="green">
        Structured lesson content belongs in the library. Use the learning user
        picker for XP, streaks, and completion state.
      </HelperBanner>
      <div className="grid gap-3">
        <MetricCard
          icon={Sparkles}
          title="Learning user picker"
          description="Choose a user first when you need to inspect or change progress state."
          href="/learning"
          ctaLabel="Open picker"
          tone="green"
        />
        <MetricCard
          icon={BookOpen}
          title="Raw progress collection"
          description="Open user_progress records directly when a JSON workbench is the right tool."
          href="/collections/user_progress"
          ctaLabel="Open raw data"
          tone="green"
        />
      </div>
      <LearningTree subjects={subjects} />
    </div>
  );
}
