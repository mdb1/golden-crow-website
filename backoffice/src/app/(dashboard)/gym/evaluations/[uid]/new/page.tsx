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
        eyebrow="Pocket Gyms"
        title="New evaluation"
        description="Record a coach-side physical assessment for this athlete."
      />
      <EvaluationForm uid={uid} />
    </div>
  );
}
