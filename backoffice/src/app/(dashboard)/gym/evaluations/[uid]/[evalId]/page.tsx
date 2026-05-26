import { notFound } from "next/navigation";
import { sdkFetchServer } from "@/lib/sdk-server";
import { PageHero } from "@/components/page-hero";
import { EvaluationForm } from "@/components/gym/evaluation-form";

export default async function EditEvaluationPage({
  params,
}: {
  params: Promise<{ uid: string; evalId: string }>;
}) {
  const { uid, evalId } = await params;

  let evaluation: Record<string, unknown>;
  try {
    const result = await sdkFetchServer<{
      evaluation: Record<string, unknown>;
    }>(`/gym/evaluations/${uid}/${evalId}`);
    evaluation = result.evaluation;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Pocket Gyms"
        title="Edit evaluation"
        description="Update this athlete's coach-side physical assessment."
      />
      <EvaluationForm
        uid={uid}
        evalId={evalId}
        initialEvaluation={
          evaluation as Parameters<typeof EvaluationForm>[0]["initialEvaluation"]
        }
      />
    </div>
  );
}
