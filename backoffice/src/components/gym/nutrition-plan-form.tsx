"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sdkFetch } from "@/lib/sdk-client";
import { Plus, Trash2 } from "lucide-react";

const WEEK_DAYS = [
  { id: "monday", label: "Monday" },
  { id: "tuesday", label: "Tuesday" },
  { id: "wednesday", label: "Wednesday" },
  { id: "thursday", label: "Thursday" },
  { id: "friday", label: "Friday" },
  { id: "saturday", label: "Saturday" },
  { id: "sunday", label: "Sunday" },
];

interface NutritionFood {
  id: string;
  name: string;
  portionDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface NutritionMeal {
  id: string;
  name: string;
  orderIndex: number;
  foods: NutritionFood[];
}

interface NutritionDay {
  id: string;
  label: string;
  meals: NutritionMeal[];
}

interface NutritionPlanFormValues {
  name: string;
  nutritionistName: string;
  startDate: string;
  endDate?: string;
  days: NutritionDay[];
}

function defaultFood(): NutritionFood {
  return {
    id: crypto.randomUUID(),
    name: "",
    portionDescription: "",
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
  };
}

function defaultMeal(orderIndex: number): NutritionMeal {
  return { id: crypto.randomUUID(), name: "", orderIndex, foods: [] };
}

function defaultFormValues(): NutritionPlanFormValues {
  return {
    name: "",
    nutritionistName: "",
    startDate: "",
    endDate: "",
    days: WEEK_DAYS.map((d) => ({ id: d.id, label: d.label, meals: [] })),
  };
}

type FormType = ReturnType<typeof useForm<NutritionPlanFormValues>>;

function MealFoods({
  dayIndex,
  mealIndex,
  control,
  register,
  removeMeal,
}: {
  dayIndex: number;
  mealIndex: number;
  control: FormType["control"];
  register: FormType["register"];
  removeMeal: () => void;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `days.${dayIndex}.meals.${mealIndex}.foods`,
  });

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-1">
          <Label>Meal name</Label>
          <Input
            {...register(`days.${dayIndex}.meals.${mealIndex}.name`)}
            placeholder="e.g. Breakfast"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-end"
          onClick={removeMeal}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {fields.map((food, fi) => (
          <div
            key={food.id}
            className="grid gap-2 rounded-md border border-border/30 bg-card/30 p-2 md:grid-cols-3"
          >
            <div className="space-y-1 md:col-span-2">
              <Label>Food name</Label>
              <Input
                {...register(
                  `days.${dayIndex}.meals.${mealIndex}.foods.${fi}.name`
                )}
                placeholder="e.g. Chicken breast"
              />
            </div>
            <div className="space-y-1">
              <Label>Portion</Label>
              <Input
                {...register(
                  `days.${dayIndex}.meals.${mealIndex}.foods.${fi}.portionDescription`
                )}
                placeholder="150g"
              />
            </div>
            <div className="space-y-1">
              <Label>Calories</Label>
              <Input
                type="number"
                {...register(
                  `days.${dayIndex}.meals.${mealIndex}.foods.${fi}.calories`,
                  { valueAsNumber: true }
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>Protein (g)</Label>
              <Input
                type="number"
                step="0.1"
                {...register(
                  `days.${dayIndex}.meals.${mealIndex}.foods.${fi}.proteinG`,
                  { valueAsNumber: true }
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>Carbs (g)</Label>
              <Input
                type="number"
                step="0.1"
                {...register(
                  `days.${dayIndex}.meals.${mealIndex}.foods.${fi}.carbsG`,
                  { valueAsNumber: true }
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>Fat (g)</Label>
              <Input
                type="number"
                step="0.1"
                {...register(
                  `days.${dayIndex}.meals.${mealIndex}.foods.${fi}.fatG`,
                  { valueAsNumber: true }
                )}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(fi)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => append(defaultFood())}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add food
        </Button>
      </div>
    </div>
  );
}

function DayMeals({
  dayIndex,
  dayLabel,
  control,
  register,
}: {
  dayIndex: number;
  dayLabel: string;
  control: FormType["control"];
  register: FormType["register"];
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `days.${dayIndex}.meals`,
  });

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-foreground">{dayLabel}</h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(defaultMeal(fields.length))}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Meal
        </Button>
      </div>
      {fields.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          No meals for this day.
        </p>
      )}
      <div className="mt-3 flex flex-col gap-3">
        {fields.map((field, mi) => (
          <MealFoods
            key={field.id}
            dayIndex={dayIndex}
            mealIndex={mi}
            control={control}
            register={register}
            removeMeal={() => remove(mi)}
          />
        ))}
      </div>
    </div>
  );
}

export function NutritionPlanForm({
  uid,
  planId,
  initialPlan,
}: {
  uid: string;
  planId?: string;
  initialPlan?: Partial<NutritionPlanFormValues>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(planId && initialPlan);

  const { register, control, handleSubmit } = useForm<NutritionPlanFormValues>({
    defaultValues: initialPlan
      ? { ...defaultFormValues(), ...initialPlan }
      : defaultFormValues(),
  });

  const { fields: dayFields } = useFieldArray({ control, name: "days" });

  async function onSubmit(values: NutritionPlanFormValues) {
    setPending("save");
    setError(null);
    try {
      if (isEdit) {
        await sdkFetch(`/gym/nutrition/${uid}/${planId}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
      } else {
        await sdkFetch(`/gym/nutrition/${uid}`, {
          method: "POST",
          body: JSON.stringify(values),
        });
      }
      router.push(`/gym/members/${uid}`);
      router.refresh();
    } catch {
      setError("Failed to save nutrition plan. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleDelete() {
    if (!planId) return;
    setPending("delete");
    try {
      await sdkFetch(`/gym/nutrition/${uid}/${planId}`, { method: "DELETE" });
      router.push(`/gym/members/${uid}`);
      router.refresh();
    } catch {
      setError("Failed to delete nutrition plan.");
    } finally {
      setPending(null);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="glass-panel grid gap-4 p-5 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Plan name</Label>
          <Input
            {...register("name")}
            placeholder="e.g. Cutting Phase"
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Nutritionist name</Label>
          <Input
            {...register("nutritionistName")}
            placeholder="Nutritionist's name"
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

      <div className="flex flex-col gap-3">
        <h3 className="font-heading text-base font-semibold text-foreground">
          Daily Meals
        </h3>
        {dayFields.map((field, index) => (
          <DayMeals
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
