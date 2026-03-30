"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sdkFetch } from "@/lib/sdk-client";
import { Plus, Trash2, ChevronDown } from "lucide-react";

interface StrengthAssessment {
  exerciseName: string;
  weightKg: number;
  reps: number;
  notes?: string;
}

interface MobilityAssessment {
  jointName: string;
  rangeOfMotionDegrees: number;
  side?: string;
  notes?: string;
}

interface AnthropometryAssessment {
  weightKg?: number;
  heightCm?: number;
  bodyFatPercent?: number;
  bmi?: number;
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
}

interface PainAssessment {
  bodyArea: string;
  painScale: number;
  notes?: string;
}

interface EvaluationFormValues {
  evaluatorName: string;
  date: string;
  anthropometry: AnthropometryAssessment;
  strength: StrengthAssessment[];
  mobility: MobilityAssessment[];
  pain: PainAssessment[];
}

function defaultValues(): EvaluationFormValues {
  return {
    evaluatorName: "",
    date: new Date().toISOString().split("T")[0],
    anthropometry: {},
    strength: [],
    mobility: [],
    pain: [],
  };
}

// Collapsible section wrapper (uses native details/summary for reliability)
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details open className="rounded-xl border border-border/60">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-medium text-foreground list-none">
        <span>{title}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </summary>
      <div className="border-t border-border/40 px-4 pb-4 pt-3">
        {children}
      </div>
    </details>
  );
}

export function EvaluationForm({
  uid,
  evalId,
  initialEvaluation,
}: {
  uid: string;
  evalId?: string;
  initialEvaluation?: Partial<EvaluationFormValues>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(evalId && initialEvaluation);

  const { register, control, handleSubmit } = useForm<EvaluationFormValues>({
    defaultValues: initialEvaluation
      ? { ...defaultValues(), ...initialEvaluation }
      : defaultValues(),
  });

  const strength = useFieldArray({ control, name: "strength" });
  const mobility = useFieldArray({ control, name: "mobility" });
  const pain = useFieldArray({ control, name: "pain" });

  async function onSubmit(values: EvaluationFormValues) {
    setPending("save");
    setError(null);
    try {
      if (isEdit) {
        await sdkFetch(`/gym/evaluations/${uid}/${evalId}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
      } else {
        await sdkFetch(`/gym/evaluations/${uid}`, {
          method: "POST",
          body: JSON.stringify(values),
        });
      }
      router.push(`/gym/members/${uid}`);
      router.refresh();
    } catch {
      setError("Failed to save evaluation. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleDelete() {
    if (!evalId) return;
    setPending("delete");
    try {
      await sdkFetch(`/gym/evaluations/${uid}/${evalId}`, {
        method: "DELETE",
      });
      router.push(`/gym/members/${uid}`);
      router.refresh();
    } catch {
      setError("Failed to delete evaluation.");
    } finally {
      setPending(null);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {/* Header fields */}
      <div className="glass-panel grid gap-4 p-5 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Evaluator name</Label>
          <Input
            {...register("evaluatorName")}
            placeholder="Trainer's name"
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Evaluation date</Label>
          <Input type="date" {...register("date")} required />
        </div>
      </div>

      {/* Anthropometry */}
      <Section title="Anthropometry">
        <div className="grid gap-3 md:grid-cols-3">
          {(
            [
              ["weightKg", "Weight (kg)"],
              ["heightCm", "Height (cm)"],
              ["bodyFatPercent", "Body fat (%)"],
              ["bmi", "BMI"],
              ["waistCm", "Waist (cm)"],
              ["hipCm", "Hip (cm)"],
              ["chestCm", "Chest (cm)"],
              ["armCm", "Arm (cm)"],
              ["thighCm", "Thigh (cm)"],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="space-y-1">
              <Label>{label}</Label>
              <Input
                type="number"
                step="0.1"
                {...register(`anthropometry.${field}`, {
                  valueAsNumber: true,
                })}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Strength */}
      <Section title="Strength Assessments">
        <div className="flex flex-col gap-3">
          {strength.fields.map((field, i) => (
            <div
              key={field.id}
              className="grid gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 md:grid-cols-2"
            >
              <div className="space-y-1">
                <Label>Exercise</Label>
                <Input
                  {...register(`strength.${i}.exerciseName`)}
                  placeholder="e.g. Bench press"
                />
              </div>
              <div className="space-y-1">
                <Label>Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.5"
                  {...register(`strength.${i}.weightKg`, {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div className="space-y-1">
                <Label>Reps</Label>
                <Input
                  type="number"
                  {...register(`strength.${i}.reps`, { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Input {...register(`strength.${i}.notes`)} />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => strength.remove(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              strength.append({ exerciseName: "", weightKg: 0, reps: 0 })
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add exercise
          </Button>
        </div>
      </Section>

      {/* Mobility */}
      <Section title="Mobility Assessments">
        <div className="flex flex-col gap-3">
          {mobility.fields.map((field, i) => (
            <div
              key={field.id}
              className="grid gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 md:grid-cols-2"
            >
              <div className="space-y-1">
                <Label>Joint</Label>
                <Input
                  {...register(`mobility.${i}.jointName`)}
                  placeholder="e.g. Hip flexor"
                />
              </div>
              <div className="space-y-1">
                <Label>Range of motion (°)</Label>
                <Input
                  type="number"
                  {...register(`mobility.${i}.rangeOfMotionDegrees`, {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div className="space-y-1">
                <Label>Side (optional)</Label>
                <Input
                  {...register(`mobility.${i}.side`)}
                  placeholder="Left / Right"
                />
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Input {...register(`mobility.${i}.notes`)} />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => mobility.remove(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              mobility.append({ jointName: "", rangeOfMotionDegrees: 0 })
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add assessment
          </Button>
        </div>
      </Section>

      {/* Pain */}
      <Section title="Pain Assessments">
        <div className="flex flex-col gap-3">
          {pain.fields.map((field, i) => (
            <div
              key={field.id}
              className="grid gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 md:grid-cols-3"
            >
              <div className="space-y-1">
                <Label>Body area</Label>
                <Input
                  {...register(`pain.${i}.bodyArea`)}
                  placeholder="e.g. Lower back"
                />
              </div>
              <div className="space-y-1">
                <Label>Pain scale (0-10)</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  {...register(`pain.${i}.painScale`, { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Input {...register(`pain.${i}.notes`)} />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => pain.remove(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => pain.append({ bodyArea: "", painScale: 0 })}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add pain record
          </Button>
        </div>
      </Section>

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
              : "Create evaluation"}
        </Button>
        {isEdit && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={pending !== null}
          >
            {pending === "delete" ? "Deleting..." : "Delete evaluation"}
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
