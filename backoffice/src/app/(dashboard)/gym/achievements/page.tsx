import { PageHero } from "@/components/page-hero";
import { AchievementsTable } from "@/components/gym/achievements-table";

export default function GymAchievementsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Pocket Gyms"
        title="Achievements"
        description="Define achievements coaches use to reinforce athlete activity milestones."
      />
      <AchievementsTable />
    </div>
  );
}
