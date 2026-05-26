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
        eyebrow="Pocket Gyms"
        title="New training plan"
        description="Create a weekly coaching plan for this athlete."
      />
      <TrainingPlanForm uid={uid} />
    </div>
  );
}
