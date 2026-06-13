"use client";

// workout-generator-wizard.tsx
//
// The multi-step Workout Generator (issue #296). Four authoring steps
// (equipment → muscles → volume → type) collect the inputs; the PURE engine
// (`@/lib/gc-fitness/workout-generator`) produces a workout; then the SAME
// `TemplateForm` used by the normal "create workout" flow takes over for
// editing (in-line exercise picker swap, supersets, per-set reps like
// 12/10/8/6, transition rest, coach notes, metric + "Sin peso"). On save we
// transition to a success step with a direct multi-client assign action.
//
// POOL = the new curated standard library ONLY (STANDARD_LIBRARY_TAG). Legacy
// fexd/wger catalog docs AND coach-authored customs are excluded from
// generation so the output is always new-naming + new-gif exercises. (The coach
// can still manually add anything via TemplateForm's picker.)
//
// Equipment rule (engine): an exercise needs every piece of equipment it
// requires — including a bench inferred from the movement name — to be in the
// selected set, or it appears neither in the workout nor any pill.

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Dumbbell, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { EQUIPMENT, MUSCLE_GROUPS } from "@/lib/gc-fitness/exercise-vocabulary";
import { useExercisesQuery } from "@/lib/gc-fitness/exercises-listener";
import { STANDARD_LIBRARY_TAG } from "@/lib/gc-fitness/exercise-visibility";
import { createWorkoutTemplate } from "@/lib/gc-fitness/workout-template-actions";
import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";
import type { ClientRosterEntry } from "@/lib/gc-fitness/client-roster";
import { TemplateForm } from "@/components/gc-fitness/template-form";

import {
  EQUIPMENT_GROUPS,
  MUSCLE_PRESETS,
  WORKOUT_TYPE_PRESETS,
  computeReplacements,
  generateWorkout,
  getEligibleExercises,
  isGroupFullySelected,
  primaryCoveredMuscle,
  type GeneratorExercise,
  type GeneratorInput,
} from "@/lib/gc-fitness/workout-generator";

import { useGeneratorStrings, useLocalized } from "./strings";
import { AssignGeneratedModal } from "./assign-generated-modal";

interface Props {
  clients: ClientRosterEntry[];
  trainerTimezone?: string;
}

function humanize(id: string): string {
  return id
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function WorkoutGeneratorWizard({ clients, trainerTimezone }: Props) {
  const s = useGeneratorStrings();
  const localized = useLocalized();
  const { data: library, isLoading } = useExercisesQuery();

  // Generator pool = the NEW curated standard library only.
  const pool: GeneratorExercise[] = useMemo(
    () =>
      (library ?? [])
        .filter(
          (r) => r.deleted !== true && Array.isArray(r.tags) && r.tags.includes(STANDARD_LIBRARY_TAG),
        )
        .map((r) => ({
          id: r.id,
          name: r.name,
          muscleGroups: r.muscleGroups,
          equipment: r.equipment,
          metric: r.metric,
          gifUrl: r.gifUrl,
          thumbnailURL: r.thumbnailURL,
          imageUrl: r.imageUrl,
          mediaURL: r.mediaURL,
        })),
    [library],
  );

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [equipment, setEquipment] = useState<Set<string>>(new Set());
  const [muscles, setMuscles] = useState<Set<string>>(new Set());
  const [volumeMode, setVolumeMode] = useState<"count" | "time">("count");
  const [count, setCount] = useState(6);
  const [minutes, setMinutes] = useState(40);
  const [workoutType, setWorkoutType] = useState<string>("hypertrophy");
  const [seed, setSeed] = useState(1);
  const [genVersion, setGenVersion] = useState(0);

  const [generated, setGenerated] = useState<Partial<WorkoutTemplateInput> | null>(null);
  const [generatedName, setGeneratedName] = useState("");
  const [poolWarning, setPoolWarning] = useState<string | null>(null);

  const [savedId, setSavedId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const TOTAL_STEPS = 5;

  // Equipment-eligible standard-library pool for the current selection — the
  // source for the generator-only replacement pills rendered under each row.
  const poolById = useMemo(() => new Map(pool.map((e) => [e.id, e])), [pool]);
  const eligible = useMemo(
    () => getEligibleExercises(pool, { equipment: [...equipment], muscleGroups: [...muscles] }),
    [pool, equipment, muscles],
  );

  // Replacement pills under an exercise row (TemplateForm `renderExerciseExtras`).
  // Same-muscle, equipment-eligible alternatives from the new library, excluding
  // exercises already in the workout. Tapping one swaps the row's exercise.
  function renderExerciseExtras(ctx: {
    index: number;
    exerciseId: string;
    allExerciseIds: string[];
    onReplace: (id: string) => void;
  }): React.ReactNode {
    const ex = poolById.get(ctx.exerciseId);
    if (!ex) return null;
    const primaryMuscle = primaryCoveredMuscle(ex, muscles) ?? ex.muscleGroups[0];
    if (!primaryMuscle) return null;
    const used = new Set(ctx.allExerciseIds);
    const reps = computeReplacements(
      eligible,
      primaryMuscle,
      used,
      (seed ^ ((ctx.index + 1) * 0x9e3779b1)) >>> 0,
      5,
    );
    if (reps.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">{s.swapTo}</span>
        {reps.map((r) => (
          <button
            key={r.exerciseId}
            type="button"
            onClick={() => ctx.onReplace(r.exerciseId)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary hover:bg-primary/5"
          >
            <RefreshCw className="h-3 w-3 opacity-60" />
            {localized(r.name)}
          </button>
        ))}
      </div>
    );
  }

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleGroup(items: string[], fullySelected: boolean) {
    setEquipment((prev) => {
      const next = new Set(prev);
      if (fullySelected) items.forEach((i) => next.delete(i));
      else items.forEach((i) => next.add(i));
      return next;
    });
  }
  function togglePreset(presetMuscles: string[], fullySelected: boolean) {
    setMuscles((prev) => {
      const next = new Set(prev);
      if (fullySelected) presetMuscles.forEach((m) => next.delete(m));
      else presetMuscles.forEach((m) => next.add(m));
      return next;
    });
  }

  const focusLabel = useMemo(() => {
    const sameSet = (a: string[], b: Set<string>) => a.length === b.size && a.every((x) => b.has(x));
    const match = MUSCLE_PRESETS.find((p) => sameSet(p.muscles, muscles));
    if (match) return match.label;
    if (muscles.size === 1) {
      const only = [...muscles][0];
      return { en: humanize(only), es: humanize(only) };
    }
    return undefined;
  }, [muscles]);

  function buildInput(nextSeed: number): GeneratorInput {
    return {
      equipment: [...equipment],
      muscleGroups: [...muscles],
      volumeMode,
      exerciseCount: count,
      timeMinutes: minutes,
      workoutType,
      seed: nextSeed,
      focusLabel,
    };
  }

  // Convert the engine output into TemplateForm `defaultValues`. Per-set rows
  // are derived by TemplateForm from `sets`/`reps`, so the coach can split a
  // 4×12 into 12/10/8/6 right in the standard editor.
  function runGeneration(nextSeed: number) {
    const input = buildInput(nextSeed);
    const workout = generateWorkout(input, pool);
    const typeLabel = localized(WORKOUT_TYPE_PRESETS.find((p) => p.id === workoutType)!.label);
    // Equipment that carries no external load — these default to "Sin peso"
    // (reps-only). Everything else (dumbbell, barbell, cable, machine, …)
    // defaults to "weight × reps" so the coach fills in load.
    const NON_LOAD = new Set(["bodyweight", "none", "pull_up_bar"]);
    const isNoLoad = (id: string) => {
      const src = poolById.get(id);
      const eq = src && src.equipment.length > 0 ? src.equipment : ["bodyweight"];
      return eq.every((e) => NON_LOAD.has(e));
    };
    const defaults: Partial<WorkoutTemplateInput> = {
      name: { en: workout.name.en, es: workout.name.es },
      tag: typeLabel,
      tags: [typeLabel],
      exercises: workout.exercises.map((g, i) => ({
        exerciseId: g.exerciseId,
        sets: g.sets,
        reps: g.metric === "time" ? 0 : g.reps,
        rest_seconds: g.rest_seconds,
        transition_rest_seconds: g.transition_rest_seconds,
        order: i + 1,
        ...(g.metric === "time"
          ? { metric: "time" as const, durationSeconds: g.durationSeconds ?? 60 }
          : // Reps-based: seed the Sin-peso sentinel only for no-load exercises.
            isNoLoad(g.exerciseId)
            ? { weightBySetKg: [] as number[] }
            : {}),
      })) as WorkoutTemplateInput["exercises"],
    };
    setGenerated(defaults);
    setGeneratedName(workout.name.en);
    setPoolWarning(
      workout.exercises.length < workout.requestedCount
        ? s.poolWarning.replace("{n}", String(workout.exercises.length))
        : null,
    );
    setSeed(nextSeed);
    setGenVersion((v) => v + 1);
    setStep(5);
  }

  function handleGenerate() {
    runGeneration(seed);
  }
  function handleRegenerate() {
    runGeneration((seed + 0x6d2b79f5) >>> 0);
  }

  function resetAll() {
    setStep(1);
    setEquipment(new Set());
    setMuscles(new Set());
    setVolumeMode("count");
    setCount(6);
    setMinutes(40);
    setWorkoutType("hypertrophy");
    setGenerated(null);
    setSavedId(null);
  }

  const canNext =
    (step === 1 && equipment.size > 0) ||
    (step === 2 && muscles.size > 0) ||
    step === 3 ||
    step === 4;

  function goNext() {
    if (step === 1 && equipment.size === 0) return toast.error(s.pickEquipment);
    if (step === 2 && muscles.size === 0) return toast.error(s.pickMuscles);
    if (step === 4) return handleGenerate();
    setStep((step + 1) as typeof step);
  }

  // ---------------------------------------------------------------------------
  // Success screen
  // ---------------------------------------------------------------------------
  if (step === 6 && savedId) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
            <Check className="h-6 w-6" />
          </div>
          <h2 className="font-heading text-xl font-semibold">{s.successTitle}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{s.successSubtitle}</p>
          {generatedName ? <p className="mt-1 text-lg font-semibold">{generatedName}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAssignOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {s.assign}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/gc-fitness/templates/${savedId}/view`}>{s.viewInLibrary}</Link>
          </Button>
          <Button variant="ghost" onClick={resetAll}>
            {s.generateAnother}
          </Button>
        </div>

        <AssignGeneratedModal
          open={assignOpen}
          onOpenChange={setAssignOpen}
          templateId={savedId}
          clients={clients}
          trainerTimezone={trainerTimezone}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Result step — hand off to the real TemplateForm (full editor parity)
  // ---------------------------------------------------------------------------
  if (step === 5 && generated) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-tight">{s.resultTitle}</h2>
            <p className="text-sm text-muted-foreground">{s.resultSubtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(4)} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              {s.back}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleRegenerate} className="gap-1">
              <RefreshCw className="h-4 w-4" />
              {s.regenerate}
            </Button>
          </div>
        </div>

        {poolWarning ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {poolWarning}
          </p>
        ) : null}

        {/* The SAME editor as the normal create flow: in-line picker swap,
            supersets, per-set reps/weight, transition rest, coach notes,
            metric + "Sin peso". `key` forces a remount on regenerate so the
            new defaults apply. */}
        <TemplateForm
          key={`gen-${genVersion}`}
          mode="create"
          defaultValues={generated}
          onSubmit={(input) => createWorkoutTemplate(input)}
          onCreated={(id) => {
            setSavedId(id);
            setStep(6);
          }}
          renderExerciseExtras={renderExerciseExtras}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Wizard steps 1–4
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              n <= step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {s.step} {Math.min(step, TOTAL_STEPS)} {s.of} {TOTAL_STEPS}
      </p>

      {step === 1 && (
        <StepShell title={s.equipmentTitle} subtitle={s.equipmentSubtitle}>
          <SectionLabel>{s.equipmentGroups}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_GROUPS.map((g) => {
              const full = isGroupFullySelected(g, equipment);
              return (
                <Chip key={g.id} active={full} onClick={() => toggleGroup(g.items, full)}>
                  {localized(g.label)}
                </Chip>
              );
            })}
          </div>
          <SectionLabel className="mt-4">
            {s.equipmentAll} · {equipment.size} {s.selectedCount}
          </SectionLabel>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((id) => (
              <Chip key={id} active={equipment.has(id)} onClick={() => toggle(setEquipment, id)}>
                {humanize(id)}
              </Chip>
            ))}
          </div>
        </StepShell>
      )}

      {step === 2 && (
        <StepShell title={s.musclesTitle} subtitle={s.musclesSubtitle}>
          <SectionLabel>{s.musclePresets}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_PRESETS.map((p) => {
              const full = p.muscles.every((m) => muscles.has(m));
              return (
                <Chip key={p.id} active={full} onClick={() => togglePreset(p.muscles, full)}>
                  {localized(p.label)}
                </Chip>
              );
            })}
          </div>
          <SectionLabel className="mt-4">
            {s.musclesAll} · {muscles.size} {s.selectedCount}
          </SectionLabel>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map((id) => (
              <Chip key={id} active={muscles.has(id)} onClick={() => toggle(setMuscles, id)}>
                {humanize(id)}
              </Chip>
            ))}
          </div>
        </StepShell>
      )}

      {step === 3 && (
        <StepShell title={s.volumeTitle} subtitle={s.volumeSubtitle}>
          <div className="flex gap-2">
            <Chip active={volumeMode === "count"} onClick={() => setVolumeMode("count")}>
              {s.byCount}
            </Chip>
            <Chip active={volumeMode === "time"} onClick={() => setVolumeMode("time")}>
              {s.byTime}
            </Chip>
          </div>
          {volumeMode === "count" ? (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tabular-nums">{count}</span>
                <span className="text-sm text-muted-foreground">{s.exercises}</span>
              </div>
              <input
                type="range"
                min={3}
                max={15}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tabular-nums">{minutes}</span>
                <span className="text-sm text-muted-foreground">{s.minutes}</span>
              </div>
              <input
                type="range"
                min={15}
                max={90}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>
          )}
        </StepShell>
      )}

      {step === 4 && (
        <StepShell title={s.typeTitle} subtitle={s.typeSubtitle}>
          <div className="grid gap-2 sm:grid-cols-2">
            {WORKOUT_TYPE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setWorkoutType(p.id)}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                  workoutType === p.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card hover:border-foreground/30",
                )}
              >
                <span className="text-sm font-semibold">{localized(p.label)}</span>
                <span className="text-xs text-muted-foreground">{localized(p.description)}</span>
                <span className="mt-1 text-[11px] text-muted-foreground">
                  {p.sets}×{p.reps} · {p.rest_seconds}s
                </span>
              </button>
            ))}
          </div>
        </StepShell>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((Math.max(1, step - 1)) as typeof step)}
          disabled={step === 1}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          {s.back}
        </Button>

        <Button type="button" onClick={goNext} disabled={!canNext || isLoading} className="gap-1">
          {step === 4 ? (
            <>
              <Dumbbell className="h-4 w-4" />
              {s.generate}
            </>
          ) : (
            <>
              {s.next}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}>
      {children}
    </p>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:border-foreground/30",
      )}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}
