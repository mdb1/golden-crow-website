import { BookOpen, Sparkles } from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { MetricCard } from "@/components/metric-card";
import { PageHero } from "@/components/page-hero";
import { UserScopePicker } from "@/components/user-scope-picker";

export default function LearningPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Learning"
        title="Pick a user for learning operations"
        description="Start with the target user, then inspect or manipulate that person’s progress state without falling back to your own records."
      />
      <HelperBanner title="Separate content operations from user state." tone="green">
        User progress and lesson content are different workflows. Choose a user
        here for progression changes, and open the lesson library when you need
        to edit the curriculum itself.
      </HelperBanner>
      <UserScopePicker scope="learning" />
      <div className="grid gap-3">
        <MetricCard
          icon={Sparkles}
          title="Raw progress collection"
          description="Inspect user_progress records directly with the JSON workbench."
          href="/collections/user_progress"
          tone="green"
        />
        <MetricCard
          icon={BookOpen}
          title="Lesson library"
          description="Open structured lesson editing separately from user-specific progress moderation."
          href="/learning/library"
          tone="green"
        />
      </div>
    </div>
  );
}
