import { PageHero } from "@/components/page-hero";
import { EvaluationForm } from "@/components/gym/evaluation-form";

export default async function NewEvaluationPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title="New Evaluation"
        description="Record a physical assessment for this member."
      />
      <EvaluationForm uid={uid} />
    </div>
  );
}
