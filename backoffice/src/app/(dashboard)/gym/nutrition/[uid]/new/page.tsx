import { PageHero } from "@/components/page-hero";
import { NutritionPlanForm } from "@/components/gym/nutrition-plan-form";

export default async function NewNutritionPlanPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Gym"
        title="New Nutrition Plan"
        description="Create a daily meal plan for this member."
      />
      <NutritionPlanForm uid={uid} />
    </div>
  );
}
