import { PageHero } from "@/components/page-hero";
import { ChallengesTable } from "@/components/gym/challenges-table";

export default function GymChallengesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Pocket Gyms"
        title="Challenges"
        description="Define coach-managed challenges athletes can complete for rewards."
      />
      <ChallengesTable />
    </div>
  );
}
