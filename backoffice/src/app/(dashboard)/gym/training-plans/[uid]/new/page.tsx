import { PageHero } from "@/components/page-hero";
import { TrainingPlanForm } from "@/components/gym/training-plan-form";

export default async function NewTrainingPlanPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title="New Training Plan"
        description="Create a weekly training plan for this member."
      />
      <TrainingPlanForm uid={uid} />
    </div>
  );
}
