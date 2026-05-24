"use client";

// template-form.tsx
//
// RHF + Zod + useFieldArray form for the two template routes:
//   - `mode="create"`: empty form → `createWorkoutTemplate` → redirect to list
//   - `mode="edit"`:   defaults from Firestore → `updateWorkoutTemplate` patch
//
// Pitfall 3 (locked here): `useFieldArray` overwrites the field's `id` with
// an RHF-internal CUID for stable React key tracking across reorders. Our
// DOMAIN field is `exerciseId` — they DO NOT collide. The React key is
// `field.id` (RHF-internal), NEVER `index` (breaks across reorders) and
// NEVER `field.exerciseId` (collides when two rows reference the same
// underlying exercise — e.g., a superset of dips paired with dips).
//
// Reorder semantics (Pattern 5): use `move(index, index ± 1)` for up/down.
// `swap(i, j)` is symmetric and awkward at list ends — `move` expresses
// "move up by 1" directly. Disable each button at its edge index.
//
// Tag default: "custom" — keeps the form forgiving per CONTEXT.md §Specifics.
//
// SUBMIT: this form does NOT directly call the Server Action; the parent
// route page passes an `onSubmit` callback that wires in
// `createWorkoutTemplate` or `(input) => updateWorkoutTemplate(id, input)`.
// This keeps the form pure and lets the route handle the post-success
// redirect / refresh.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
  workoutTemplateSchema,
  type WorkoutTemplateInput,
} from "@/lib/gc-fitness/workout-template-schema";

import { ExercisePickerPopover } from "./exercise-picker-popover";

export type TemplateFormMode = "create" | "edit";

export interface TemplateFormProps {
  mode: TemplateFormMode;
  defaultValues?: Partial<WorkoutTemplateInput>;
  /**
   * Server-side handler. Resolves with `{ id }` on create (form redirects
   * to the list), or `{ ok: true }` on edit (form toasts + stays). Throws
   * on validation/auth/Firestore failure — the form surfaces a toast.
   */
  onSubmit: (
    input: WorkoutTemplateInput,
  ) => Promise<{ id?: string; ok?: true }>;
}

// Default suggestions. Trainers can still type any custom tag.
const TAG_OPTION_KEYS = [
  { value: "push", labelKey: "push" },
  { value: "pull", labelKey: "pull" },
  { value: "legs", labelKey: "legs" },
  { value: "upper", labelKey: "upper" },
  { value: "lower", labelKey: "lower" },
  { value: "full-body", labelKey: "fullBody" },
  { value: "custom", labelKey: "custom" },
] as const;

function buildDefaults(
  passed?: Partial<WorkoutTemplateInput>,
): WorkoutTemplateInput {
  return {
    name: {
      en: passed?.name?.en ?? "",
      es: passed?.name?.es ?? "",
    },
    description: passed?.description ?? { en: "", es: "" },
    tag: passed?.tag ?? "custom",
    exercises: passed?.exercises ?? [],
  };
}

export function TemplateForm({
  mode,
  defaultValues,
  onSubmit,
}: TemplateFormProps) {
  const t = useTranslations("templates.form");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<WorkoutTemplateInput>({
    // Same `as any` resolver cast as `ExerciseForm` — `zodResolver` widens
    // its generic in a way that doesn't compose with our explicit form
    // type parameter. The runtime parse behavior is unchanged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(workoutTemplateSchema as any) as unknown as any,
    defaultValues: buildDefaults(defaultValues),
    mode: "onSubmit",
  });

  // Pitfall 3 — RHF's `useFieldArray` uses an internal `id` field as its
  // stable React-key. Our domain field is `exerciseId` (a separate name),
  // so the two never collide. NEVER add a top-level `id` to the exercise
  // shape or it WILL collide and break across reorders.
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "exercises",
  });

  function toFiniteNumberArray(input: unknown): number[] {
    if (!Array.isArray(input)) return [];
    return input.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
  }

  function syncSetArrays(index: number, nextSets: number) {
    const safeSets = Math.max(1, Math.min(10, nextSets));
    const repsPath = `exercises.${index}.repsBySet` as const;
    const weightPath = `exercises.${index}.weightBySetKg` as const;
    const repsFallback = Number(form.getValues(`exercises.${index}.reps` as const) ?? 10);
    const currentReps = toFiniteNumberArray(form.getValues(repsPath));
    const currentWeight = toFiniteNumberArray(form.getValues(weightPath));

    const nextReps = Array.from({ length: safeSets }, (_, i) => {
      const v = currentReps[i];
      return Number.isFinite(v) ? v : repsFallback;
    });
    const nextWeight = currentWeight.slice(0, safeSets);

    form.setValue(repsPath, nextReps, { shouldDirty: true });
    form.setValue(weightPath, nextWeight, { shouldDirty: true });
  }

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      try {
        // Recompute `order` to be 1-based contiguous before submit — the
        // Firestore rule layer (P04-02) asserts `order == arrayIndex + 1`.
        const normalized: WorkoutTemplateInput = {
          ...values,
          exercises: values.exercises.map((ex, idx) => ({
            ...ex,
            ...(Array.isArray(ex.repsBySet) && ex.repsBySet.length > 0
              ? {
                  repsBySet: ex.repsBySet.filter(
                    (n): n is number => Number.isFinite(n),
                  ),
                  sets: ex.repsBySet.filter((n) => Number.isFinite(n)).length,
                  reps: ex.repsBySet.find((n) => Number.isFinite(n)) ?? ex.reps,
                }
              : {}),
            ...(Array.isArray(ex.weightBySetKg) && ex.weightBySetKg.length > 0
              ? {
                  weightBySetKg: ex.weightBySetKg.filter(
                    (n): n is number => Number.isFinite(n),
                  ),
                }
              : {}),
            ...(ex.supersetGroup?.trim()
              ? { supersetGroup: ex.supersetGroup.trim() }
              : {}),
            order: idx + 1,
          })),
        };
        const result = await onSubmit(normalized);
        if (mode === "create" && result?.id) {
          toast.success(t("createdToast"));
          // 260524 — go back in nav after create (same UX as exercise + habit forms).
          router.back();
          return;
        }
        toast.success(t("savedToast"));
        router.back();
      } catch (err) {
        console.error("[template-form] save failed", err);
        const message =
          err instanceof Error ? err.message : t("saveFailed");
        toast.error(message);
      }
    });
  });

  function appendExercise() {
    append({
      exerciseId: "",
      sets: 3,
      reps: 10,
      rest_seconds: 60,
      notes: "",
      order: fields.length + 1,
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        {/* Name EN + ES */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name.en"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nameEn")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("namePlaceholderEn")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name.es"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nameEs")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("namePlaceholderEs")}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>{t("nameEsHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Description EN + ES */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="description.en"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("descriptionEn")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder={t("descriptionPlaceholderEn")}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description.es"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("descriptionEs")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder={t("descriptionPlaceholderEs")}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Tag */}
        <FormField
          control={form.control}
          name="tag"
          render={({ field }) => (
            <FormItem className="max-w-xs">
              <FormLabel>{t("tag")}</FormLabel>
              <FormControl>
                <div className="space-y-2">
                  <Input
                    list="gc-fitness-template-tags"
                    placeholder={t("tagPlaceholder")}
                    {...field}
                  />
                  <datalist id="gc-fitness-template-tags">
                    {TAG_OPTION_KEYS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(`tagOptions.${opt.labelKey}`)}
                      </option>
                    ))}
                  </datalist>
                </div>
              </FormControl>
              <FormDescription>{t("tagHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Exercises */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">{t("exercises")}</h2>
            <span className="text-xs text-muted-foreground">
              {t("exercisesCount", { count: fields.length })}
            </span>
          </div>

          {fields.length === 0 && (
            <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              {t.rich("exercisesEmpty", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {fields.map((field, index) => (
              // Pitfall 3: React key is `field.id` (RHF-internal CUID), NOT
              // `index` (would break across reorders) and NOT
              // `field.exerciseId` (collisions on supersets referencing the
              // same exercise).
              <li key={field.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        #{index + 1}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => move(index, index - 1)}
                          disabled={index === 0}
                          aria-label={t("moveUp")}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => move(index, index + 1)}
                          disabled={index === fields.length - 1}
                          aria-label={t("moveDown")}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          aria-label={t("removeExercise")}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Exercise picker — Controller because the popover is a
                        custom component, not a native input. */}
                    <FormField
                      control={form.control}
                      name={`exercises.${index}.exerciseId` as const}
                      render={({ field: pickerField }) => (
                        <FormItem>
                          <FormLabel>{t("exerciseLabel")}</FormLabel>
                          <FormControl>
                            <ExercisePickerPopover
                              value={pickerField.value ?? ""}
                              onChange={pickerField.onChange}
                              ariaLabel={t("pickExerciseAria", { index: index + 1 })}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Sets / Reps / Rest */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Controller
                        control={form.control}
                        name={`exercises.${index}.sets` as const}
                        render={({
                          field: numField,
                          fieldState,
                        }) => (
                          <FormItem>
                            <FormLabel>{t("sets")}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                value={numField.value ?? ""}
                                onChange={(e) =>
                                  {
                                    const parsed =
                                      e.target.value === ""
                                        ? 1
                                        : Number(e.target.value);
                                    numField.onChange(parsed);
                                    syncSetArrays(index, parsed);
                                  }
                                }
                                onBlur={numField.onBlur}
                              />
                            </FormControl>
                            {fieldState.error && (
                              <FormMessage>
                                {fieldState.error.message}
                              </FormMessage>
                            )}
                          </FormItem>
                        )}
                      />
                      <Controller
                        control={form.control}
                        name={`exercises.${index}.reps` as const}
                        render={({
                          field: numField,
                          fieldState,
                        }) => (
                          <FormItem>
                            <FormLabel>{t("reps")}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={50}
                                value={numField.value ?? ""}
                                onChange={(e) =>
                                  numField.onChange(
                                    e.target.value === ""
                                      ? undefined
                                      : Number(e.target.value),
                                  )
                                }
                                onBlur={numField.onBlur}
                              />
                            </FormControl>
                            {fieldState.error && (
                              <FormMessage>
                                {fieldState.error.message}
                              </FormMessage>
                            )}
                          </FormItem>
                        )}
                      />
                      <Controller
                        control={form.control}
                        name={`exercises.${index}.rest_seconds` as const}
                        render={({
                          field: numField,
                          fieldState,
                        }) => (
                          <FormItem>
                            <FormLabel>{t("restSeconds")}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={600}
                                value={numField.value ?? ""}
                                onChange={(e) =>
                                  numField.onChange(
                                    e.target.value === ""
                                      ? undefined
                                      : Number(e.target.value),
                                  )
                                }
                                onBlur={numField.onBlur}
                              />
                            </FormControl>
                            {fieldState.error && (
                              <FormMessage>
                                {fieldState.error.message}
                              </FormMessage>
                            )}
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <FormLabel>{t("setRowsTitle")}</FormLabel>
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="grid grid-cols-[84px,1fr,1fr] items-center gap-2 px-1">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {t("setHeader")}
                            </span>
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {t("reps")}
                            </span>
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {t("weightKgShort")}
                            </span>
                          </div>
                          {Array.from({
                            length: Math.max(
                              1,
                              Math.min(10, Number(form.watch(`exercises.${index}.sets` as const) ?? 1)),
                            ),
                          }).map((_, setIdx) => {
                            const repsPath = `exercises.${index}.repsBySet` as const;
                            const weightPath = `exercises.${index}.weightBySetKg` as const;
                            const repsArray = toFiniteNumberArray(form.getValues(repsPath));
                            const weightArray = toFiniteNumberArray(form.getValues(weightPath));
                            const repsFallback = Number(
                              form.getValues(`exercises.${index}.reps` as const) ?? 10,
                            );
                            const repsValue = repsArray[setIdx] ?? repsFallback;
                            const weightValue = weightArray[setIdx];

                            return (
                              <div
                                key={`${field.id}-set-${setIdx + 1}`}
                                className="grid grid-cols-[84px,1fr,1fr] items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2"
                              >
                                <span className="text-xs text-muted-foreground">
                                  {t("setNumber", { count: setIdx + 1 })}
                                </span>
                                <Input
                                  type="number"
                                  min={1}
                                  max={50}
                                  className="h-10"
                                  value={repsValue}
                                  onChange={(e) => {
                                    const next = Number(e.target.value);
                                    const current = toFiniteNumberArray(form.getValues(repsPath));
                                    const safeLen = Math.max(setIdx + 1, current.length);
                                    const filled = Array.from({ length: safeLen }, (_, i) => {
                                      const v = current[i];
                                      return Number.isFinite(v) ? v : repsFallback;
                                    });
                                    filled[setIdx] = Number.isFinite(next) ? next : repsFallback;
                                    form.setValue(repsPath, filled, { shouldDirty: true });
                                  }}
                                  aria-label={t("setRepsAria", { count: setIdx + 1 })}
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  max={500}
                                  step="0.5"
                                  className="h-10"
                                  placeholder={t("setWeightPlaceholder")}
                                  value={weightValue ?? ""}
                                  onChange={(e) => {
                                    const current = toFiniteNumberArray(form.getValues(weightPath));
                                    const nextRaw = e.target.value.trim();
                                    if (nextRaw === "") {
                                      const trimmed = current.slice(0, Math.max(setIdx, 0));
                                      form.setValue(weightPath, trimmed, { shouldDirty: true });
                                      return;
                                    }
                                    const next = Number(nextRaw);
                                    if (!Number.isFinite(next)) return;
                                    const safeLen = Math.max(setIdx + 1, current.length);
                                    const filled = Array.from({ length: safeLen }, (_, i) => {
                                      const v = current[i];
                                      return Number.isFinite(v) ? v : 0;
                                    });
                                    filled[setIdx] = next;
                                    form.setValue(weightPath, filled, { shouldDirty: true });
                                  }}
                                  aria-label={t("setWeightAria", { count: setIdx + 1 })}
                                />
                              </div>
                            );
                          })}
                        </div>
                        <FormDescription>{t("setRowsHint")}</FormDescription>
                      </div>
                      <FormField
                        control={form.control}
                        name={`exercises.${index}.supersetGroup` as const}
                        render={({ field: supersetField }) => (
                          <FormItem>
                            <FormLabel>{t("supersetGroup")}</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t("supersetGroupPlaceholder")}
                                {...supersetField}
                                value={supersetField.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>{t("supersetGroupHint")}</FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Notes */}
                    <FormField
                      control={form.control}
                      name={`exercises.${index}.notes` as const}
                      render={({ field: noteField }) => (
                        <FormItem>
                          <FormLabel>{t("coachingNotes")}</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={2}
                              maxLength={500}
                              placeholder={t("coachingNotesPlaceholder")}
                              {...noteField}
                              value={noteField.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            onClick={appendExercise}
            disabled={fields.length >= 30}
            className="gap-2 self-start"
          >
            <Plus className="h-4 w-4" />
            {t("addExercise")}
          </Button>
        </div>

        {/* Form-level error from RHF root */}
        {form.formState.errors.exercises &&
          !Array.isArray(form.formState.errors.exercises) && (
            <p className="text-sm text-destructive">
              {form.formState.errors.exercises.message}
            </p>
          )}

        {/* Action row */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : mode === "create" ? t("createCta") : t("saveCta")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
