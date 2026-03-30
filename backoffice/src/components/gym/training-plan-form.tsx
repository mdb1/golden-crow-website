"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sdkFetch } from "@/lib/sdk-client";
import { Trash2, Plus } from "lucide-react";

const WEEK_DAYS = [
  { id: "monday", label: "Monday" },
  { id: "tuesday", label: "Tuesday" },
  { id: "wednesday", label: "Wednesday" },
  { id: "thursday", label: "Thursday" },
  { id: "friday", label: "Friday" },
  { id: "saturday", label: "Saturday" },
  { id: "sunday", label: "Sunday" },
];

interface ExerciseFormValues {
  id: string;
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeightKg?: number;
  restSeconds: number;
  instructions?: string;
  orderIndex: number;
}

interface DayFormValues {
  id: string;
  label: string;
  exercises: ExerciseFormValues[];
}

interface TrainingPlanFormValues {
  name: string;
  trainerName: string;
  startDate: string;
  endDate?: string;
  days: DayFormValues[];
}

function defaultExercise(orderIndex: number): ExerciseFormValues {
  return {
    id: crypto.randomUUID(),
    name: "",
    targetSets: 3,
    targetReps: 10,
    restSeconds: 60,
    orderIndex,
  };
}

function defaultFormValues(): TrainingPlanFormValues {
  return {
    name: "",
    trainerName: "",
    startDate: "",
    endDate: "",
    days: WEEK_DAYS.map((d) => ({ id: d.id, label: d.label, exercises: [] })),
  };
}

// Sub-component to manage exercises for one day
function DayExercises({
  dayIndex,
  dayLabel,
  control,
  register,
}: {
  dayIndex: number;
  dayLabel: string;
  control: ReturnType<typeof useForm<TrainingPlanFormValues>>["control"];
  register: ReturnType<typeof useForm<TrainingPlanFormValues>>["register"];
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `days.${dayIndex}.exercises`,
  });

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-foreground">{dayLabel}</h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(defaultExercise(fields.length))}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Exercise
        </Button>
      </div>
      {fields.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Rest day — no exercises.
        </p>
      )}
      <div className="mt-3 flex flex-col gap-3">
        {fields.map((field, exIndex) => (
          <div
            key={field.id}
            className="grid gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 md:grid-cols-3"
          >
            <div className="space-y-1 md:col-span-3">
              <Label>Exercise name</Label>
              <Input
                {...register(
                  `days.${dayIndex}.exercises.${exIndex}.name` as const
                )}
                placeholder="e.g. Barbell squat"
              />
            </div>
            <div className="space-y-1">
              <Label>Sets</Label>
              <Input
                type="number"
                {...register(
                  `days.${dayIndex}.exercises.${exIndex}.targetSets` as const,
                  { valueAsNumber: true }
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>Reps</Label>
              <Input
                type="number"
                {...register(
                  `days.${dayIndex}.exercises.${exIndex}.targetReps` as const,
                  { valueAsNumber: true }
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>Weight (kg, optional)</Label>
              <Input
                type="number"
                {...register(
                  `days.${dayIndex}.exercises.${exIndex}.targetWeightKg` as const,
                  { valueAsNumber: true }
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>Rest (seconds)</Label>
              <Input
                type="number"
                {...register(
                  `days.${dayIndex}.exercises.${exIndex}.restSeconds` as const,
                  { valueAsNumber: true }
                )}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Instructions (optional)</Label>
              <Input
                {...register(
                  `days.${dayIndex}.exercises.${exIndex}.instructions` as const
                )}
                placeholder="Technique notes..."
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(exIndex)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrainingPlanForm({
  uid,
  planId,
  initialPlan,
}: {
  uid: string;
  planId?: string;
  initialPlan?: TrainingPlanFormValues & { id?: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(planId && initialPlan);

  const { register, control, handleSubmit } = useForm<TrainingPlanFormValues>({
    defaultValues: initialPlan ?? defaultFormValues(),
  });

  const { fields: dayFields } = useFieldArray({ control, name: "days" });

  async function onSubmit(values: TrainingPlanFormValues) {
    setPending("save");
    setError(null);
    try {
      if (isEdit) {
        await sdkFetch(`/gym/training-plans/${uid}/${planId}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
      } else {
        await sdkFetch(`/gym/training-plans/${uid}`, {
          method: "POST",
          body: JSON.stringify(values),
        });
      }
      router.push(`/gym/members/${uid}`);
      router.refresh();
    } catch {
      setError("Failed to save training plan. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleDelete() {
    if (!planId) return;
    setPending("delete");
    setError(null);
    try {
      await sdkFetch(`/gym/training-plans/${uid}/${planId}`, {
        method: "DELETE",
      });
      router.push(`/gym/members/${uid}`);
      router.refresh();
    } catch {
      setError("Failed to delete training plan.");
    } finally {
      setPending(null);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="glass-panel flex flex-col gap-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Plan name</Label>
            <Input
              {...register("name")}
              placeholder="e.g. Strength Phase 1"
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Trainer name</Label>
            <Input
              {...register("trainerName")}
              placeholder="Trainer's name"
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Start date</Label>
            <Input type="date" {...register("startDate")} required />
          </div>
          <div className="space-y-1">
            <Label>End date (optional)</Label>
            <Input type="date" {...register("endDate")} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-heading text-base font-semibold text-foreground">
          Weekly Schedule
        </h3>
        {dayFields.map((field, index) => (
          <DayExercises
            key={field.id}
            dayIndex={index}
            dayLabel={field.label}
            control={control}
            register={register}
          />
        ))}
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending !== null}>
          {pending === "save"
            ? "Saving..."
            : isEdit
              ? "Save changes"
              : "Create plan"}
        </Button>
        {isEdit && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={pending !== null}
          >
            {pending === "delete" ? "Deleting..." : "Delete plan"}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/gym/members/${uid}`)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
