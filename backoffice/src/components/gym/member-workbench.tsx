"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { sdkFetch } from "@/lib/sdk-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkoutSessionsTab } from "./workout-sessions-tab";
import { MealComplianceTab } from "./meal-compliance-tab";
import { DocumentsTab } from "./documents-tab";
import { AchievementProgressTab } from "./achievement-progress-tab";

// Inline type definitions matching gym.types.ts
interface GymMemberRecord {
  id: string;
  displayName: string;
  photoURL?: string;
  age?: string;
  gender?: string;
  goals: string[];
  memberSince: string;
  gymId: string;
}

interface TrainingPlanRecord {
  id: string;
  name: string;
  startDate: string;
  endDate?: string;
  trainerName: string;
}

interface PhysicalEvaluationRecord {
  id: string;
  date: string;
  evaluatorName: string;
}

interface NutritionPlanRecord {
  id: string;
  name: string;
  startDate: string;
  nutritionistName: string;
}

interface ClinicalHistoryRecord {
  id: string;
  createdAt: string;
  isSigned: boolean;
}

export function MemberWorkbench({ member }: { member: GymMemberRecord }) {
  const uid = member.id;

  const plans = useQuery({
    queryKey: ["gym-training-plans", uid],
    queryFn: () =>
      sdkFetch<{ plans: TrainingPlanRecord[] }>(`/gym/training-plans/${uid}`),
  });

  const evaluations = useQuery({
    queryKey: ["gym-evaluations", uid],
    queryFn: () =>
      sdkFetch<{ evaluations: PhysicalEvaluationRecord[] }>(
        `/gym/evaluations/${uid}`
      ),
  });

  const nutrition = useQuery({
    queryKey: ["gym-nutrition", uid],
    queryFn: () =>
      sdkFetch<{ plans: NutritionPlanRecord[] }>(`/gym/nutrition/${uid}`),
  });

  const clinical = useQuery({
    queryKey: ["gym-clinical-histories", uid],
    queryFn: () =>
      sdkFetch<{ histories: ClinicalHistoryRecord[] }>(
        `/gym/clinical-histories/${uid}`
      ),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/gym/members">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to athletes
          </Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{uid}</span>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="plans">Coaching plans</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
          <TabsTrigger value="clinical">Clinical History</TabsTrigger>
          <TabsTrigger value="workouts">Workouts</TabsTrigger>
          <TabsTrigger value="meals">Meals</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="mt-4 grid gap-4 p-5 md:grid-cols-2 rounded-lg border">
            <ProfileField label="Display Name" value={member.displayName} />
            <ProfileField label="Age" value={member.age} />
            <ProfileField label="Gender" value={member.gender} />
            <ProfileField
              label="Athlete since"
              value={new Date(member.memberSince).toLocaleDateString()}
            />
            <ProfileField label="Gym" value={member.gymId} />
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Goals
              </p>
              <div className="flex flex-wrap gap-1">
                {member.goals.length > 0 ? (
                  member.goals.map((g) => (
                    <Badge key={g} variant="secondary">
                      {g}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="plans">
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex justify-end">
              <Button size="sm" asChild>
                <Link href={`/gym/training-plans/${uid}/new`}>Add coaching plan</Link>
              </Button>
            </div>
            {plans.isLoading && <Skeleton className="h-32 w-full" />}
            {plans.error && (
              <p className="text-sm text-destructive">
                Failed to load training plans.
              </p>
            )}
            {plans.data && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Trainer</th>
                    <th className="pb-2 pr-4 font-medium">Start</th>
                    <th className="pb-2 pr-4 font-medium">End</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {plans.data.plans.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-4 text-muted-foreground"
                      >
                        No coaching plans yet.
                      </td>
                    </tr>
                  )}
                  {plans.data.plans.map((plan) => (
                    <tr key={plan.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{plan.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {plan.trainerName}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(plan.startDate).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {plan.endDate
                          ? new Date(plan.endDate).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={`/gym/training-plans/${uid}/${plan.id}`}
                          >
                            Edit
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="evaluations">
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex justify-end">
              <Button size="sm" asChild>
                <Link href={`/gym/evaluations/${uid}/new`}>
                  Add Evaluation
                </Link>
              </Button>
            </div>
            {evaluations.isLoading && <Skeleton className="h-32 w-full" />}
            {evaluations.error && (
              <p className="text-sm text-destructive">
                Failed to load evaluations.
              </p>
            )}
            {evaluations.data && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Evaluator</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {evaluations.data.evaluations.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-4 text-muted-foreground"
                      >
                        No coach evaluations yet.
                      </td>
                    </tr>
                  )}
                  {evaluations.data.evaluations.map((ev) => (
                    <tr key={ev.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {new Date(ev.date).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {ev.evaluatorName}
                      </td>
                      <td className="py-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/gym/evaluations/${uid}/${ev.id}`}>
                            Edit
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="nutrition">
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex justify-end">
              <Button size="sm" asChild>
                <Link href={`/gym/nutrition/${uid}/new`}>
                  Add nutrition guidance
                </Link>
              </Button>
            </div>
            {nutrition.isLoading && <Skeleton className="h-32 w-full" />}
            {nutrition.error && (
              <p className="text-sm text-destructive">
                Failed to load nutrition plans.
              </p>
            )}
            {nutrition.data && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Nutritionist</th>
                    <th className="pb-2 pr-4 font-medium">Start</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {nutrition.data.plans.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-4 text-muted-foreground"
                      >
                        No nutrition guidance yet.
                      </td>
                    </tr>
                  )}
                  {nutrition.data.plans.map((plan) => (
                    <tr key={plan.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{plan.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {plan.nutritionistName}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(plan.startDate).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/gym/nutrition/${uid}/${plan.id}`}>
                            Edit
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="clinical">
          <div className="mt-4 flex flex-col gap-3">
            {clinical.isLoading && <Skeleton className="h-32 w-full" />}
            {clinical.error && (
              <p className="text-sm text-destructive">
                Failed to load clinical history.
              </p>
            )}
            {clinical.data && clinical.data.histories.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No clinical history on file.
              </p>
            )}
            {clinical.data && clinical.data.histories.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 font-medium">Signed</th>
                  </tr>
                </thead>
                <tbody>
                  {clinical.data.histories.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {new Date(h.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <Badge
                          variant={h.isSigned ? "default" : "secondary"}
                        >
                          {h.isSigned ? "Signed" : "Unsigned"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="workouts">
          <WorkoutSessionsTab uid={uid} />
        </TabsContent>

        <TabsContent value="meals">
          <MealComplianceTab uid={uid} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab uid={uid} />
        </TabsContent>

        <TabsContent value="achievements">
          <AchievementProgressTab uid={uid} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">
        {value ?? <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}
