import { notFound } from "next/navigation";
import { sdkFetchServer } from "@/lib/sdk-server";
import { PageHero } from "@/components/page-hero";
import { TrainingPlanForm } from "@/components/gym/training-plan-form";

interface PlannedExercise {
  id: string;
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeightKg?: number;
  restSeconds: number;
  instructions?: string;
  orderIndex: number;
}

interface TrainingPlanWeekDay {
  id: string;
  label: string;
  exercises: PlannedExercise[];
}

interface TrainingPlanRecord {
  id: string;
  userId: string;
  gymId: string;
  trainerName: string;
  name: string;
  startDate: string;
  endDate?: string;
  days: TrainingPlanWeekDay[];
  createdAt: string;
  updatedAt: string;
}

export default async function EditTrainingPlanPage({
  params,
}: {
  params: Promise<{ uid: string; planId: string }>;
}) {
  const { uid, planId } = await params;

  let plan: TrainingPlanRecord;
  try {
    const result = await sdkFetchServer<{ plan: TrainingPlanRecord }>(
      `/gym/training-plans/${uid}/${planId}`
    );
    plan = result.plan;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Pocket Gyms"
        title={plan.name}
        description="Edit this athlete's coaching plan."
      />
      <TrainingPlanForm uid={uid} planId={planId} initialPlan={plan} />
    </div>
  );
}
