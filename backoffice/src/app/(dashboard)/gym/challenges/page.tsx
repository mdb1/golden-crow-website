import { PageHero } from "@/components/page-hero";
import { ChallengesTable } from "@/components/gym/challenges-table";

export default function GymChallengesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title="Challenges"
        description="Define gym-wide challenges that members can complete for rewards."
      />
      <ChallengesTable />
    </div>
  );
}
