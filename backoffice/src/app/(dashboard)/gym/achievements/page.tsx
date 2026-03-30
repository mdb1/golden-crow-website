import { PageHero } from "@/components/page-hero";
import { AchievementsTable } from "@/components/gym/achievements-table";

export default function GymAchievementsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title="Achievements"
        description="Define achievements awarded to members when they hit activity milestones."
      />
      <AchievementsTable />
    </div>
  );
}
