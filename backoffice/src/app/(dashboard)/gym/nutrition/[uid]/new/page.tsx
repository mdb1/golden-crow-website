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
        eyebrow="Pocket Gyms"
        title="New nutrition plan"
        description="Create daily nutrition guidance for this athlete."
      />
      <NutritionPlanForm uid={uid} />
    </div>
  );
}
