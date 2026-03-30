import { notFound } from "next/navigation";
import { sdkFetchServer } from "@/lib/sdk-server";
import { PageHero } from "@/components/page-hero";
import { NutritionPlanForm } from "@/components/gym/nutrition-plan-form";

export default async function EditNutritionPlanPage({
  params,
}: {
  params: Promise<{ uid: string; planId: string }>;
}) {
  const { uid, planId } = await params;

  let plan: Record<string, unknown>;
  try {
    const result = await sdkFetchServer<{ plan: Record<string, unknown> }>(
      `/gym/nutrition/${uid}/${planId}`
    );
    plan = result.plan;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title={String(plan.name ?? "Nutrition Plan")}
        description="Edit this member's nutrition plan."
      />
      <NutritionPlanForm
        uid={uid}
        planId={planId}
        initialPlan={
          plan as Parameters<typeof NutritionPlanForm>[0]["initialPlan"]
        }
      />
    </div>
  );
}
