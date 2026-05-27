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

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUp, ArrowDown, GripVertical, Trash2, Plus, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SortableListeners = ReturnType<typeof useSortable>["listeners"];

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
import { ExerciseMultiAddDialog } from "./exercise-multi-add-dialog";
import { TemplateTagsPicker } from "./template-tags-picker";
import { useWorkoutTemplates } from "@/lib/gc-fitness/workout-templates-listener";

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
  ) => Promise<{ id?: string; ok?: true; deferNavigation?: boolean }>;
  /**
   * Unique key used to autosave/restore unfinished work in localStorage.
   * Typically "new" for the create surface and `edit:${templateId}` for
   * the edit surface. If omitted, draft autosave is disabled.
   */
  draftKey?: string;
}

const DRAFT_STORAGE_PREFIX = "gc-fitness:template-draft:";
const DRAFT_DEBOUNCE_MS = 500;

function readDraft(key: string): Partial<WorkoutTemplateInput> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Partial<WorkoutTemplateInput>;
    }
    return null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, value: WorkoutTemplateInput) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${key}`,
      JSON.stringify(value),
    );
  } catch {
    /* quota / private mode — silent */
  }
}

function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${key}`);
  } catch {
    /* ignore */
  }
}

// Legacy datalist source — superseded by TemplateTagsPicker's
// DEFAULT_TAG_SUGGESTIONS list (which lives alongside the new picker).
// Kept as a no-op export anchor so removed-imports don't break old
// references in tests; remove on next cleanup pass.

// Plan 21-02 — Thin sortable wrapper. Owns the dnd-kit ref / transform /
// transition / aria attributes for the row, but delegates the drag listeners
// to the grip handle via a render-prop so the rest of the row (form inputs,
// buttons) stays click-only.
function SortableExerciseRow({
  id,
  children,
}: {
  id: string;
  children: (handleProps: SortableListeners) => React.ReactNode;
}) {
  const {
    setNodeRef,
    transform,
    transition,
    listeners,
    attributes,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} {...attributes}>
      {children(listeners)}
    </li>
  );
}

function buildDefaults(
  passed?: Partial<WorkoutTemplateInput>,
): WorkoutTemplateInput {
  // Migrate from legacy single `tag` to `tags[]` when restoring server data
  // or a draft authored before multi-tag landed. tags[0] is mirrored back to
  // the legacy `tag` field on submit so iOS reads keep working.
  const restoredTags =
    Array.isArray(passed?.tags) && passed.tags.length > 0
      ? passed.tags
      : passed?.tag
        ? [passed.tag]
        : [];
  return {
    name: {
      en: passed?.name?.en ?? "",
      es: passed?.name?.es ?? "",
    },
    description: passed?.description ?? { en: "", es: "" },
    tag: passed?.tag ?? restoredTags[0] ?? "custom",
    tags: restoredTags,
    exercises: passed?.exercises ?? [],
  };
}

export function TemplateForm({
  mode,
  defaultValues,
  onSubmit,
  draftKey,
}: TemplateFormProps) {
  const t = useTranslations("templates.form");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draftRestored, setDraftRestored] = useState(false);
  const [setsDraft, setSetsDraft] = useState<Record<string, string>>({});
  const [setRepsDraft, setSetRepsDraft] = useState<Record<string, string>>({});
  const [setWeightDraft, setSetWeightDraft] = useState<Record<string, string>>({});
  const [restSecondsDraft, setRestSecondsDraft] = useState<Record<string, string>>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [showSpanishFields, setShowSpanishFields] = useState(false);
  const [quickCreated, setQuickCreated] = useState<Array<{ id: string; name: string }>>([]);

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

  // ---- Draft autosave + restore ------------------------------------------
  //
  // When draftKey is provided, hydrate the form from localStorage on mount
  // (silently, but flag draftRestored so we can show a "draft restored"
  // banner with a Discard button). On every subsequent change we persist
  // the current form values back to localStorage, debounced so a fast
  // typer doesn't write on every keystroke.
  //
  // The draft is cleared on successful submit. Navigating away without
  // saving — back button, Esc, accidental close — leaves the draft on
  // disk so a future mount restores it.
  useEffect(() => {
    if (!draftKey) return;
    const stored = readDraft(draftKey);
    if (!stored) return;
    form.reset({
      ...buildDefaults(defaultValues),
      ...stored,
    });
    setDraftRestored(true);
    // Intentionally only runs on mount + when the key changes. Editing the
    // defaultValues prop later (e.g. server-side data refetch) should not
    // wipe an in-progress draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const draftTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!draftKey) return;
    const subscription = form.watch((value) => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
      }
      draftTimerRef.current = window.setTimeout(() => {
        writeDraft(draftKey, value as WorkoutTemplateInput);
        draftTimerRef.current = null;
      }, DRAFT_DEBOUNCE_MS);
    });
    // If the trainer navigates away within DRAFT_DEBOUNCE_MS of the last
    // keystroke, the pending timer is cancelled by cleanup and the draft is
    // lost. FLUSH the latest snapshot synchronously on unmount so the
    // /templates list can surface the draft on the next visit.
    return () => {
      subscription.unsubscribe();
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
        writeDraft(draftKey, form.getValues());
      }
    };
  }, [draftKey, form]);

  // Also flush on tab close / route change so SPA back-button doesn't lose
  // the trailing edit either. `pagehide` covers both navigation and tab
  // close (more reliable than `beforeunload` on iOS Safari).
  useEffect(() => {
    if (!draftKey) return;
    const key = draftKey; // capture for closure (TS narrowing lost in nested fn)
    function flush() {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      writeDraft(key, form.getValues());
    }
    window.addEventListener("pagehide", flush);
    window.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("visibilitychange", flush);
    };
  }, [draftKey, form]);

  function discardDraft() {
    if (!draftKey) return;
    clearDraft(draftKey);
    form.reset(buildDefaults(defaultValues));
    setDraftRestored(false);
  }
  // ------------------------------------------------------------------------

  // Plan 21-02 — dnd-kit sensors. PointerSensor with a 5px activation distance
  // so an accidental click doesn't trigger a drag on touch / fine-pointer
  // devices. KeyboardSensor with the sortable coordinate getter so Tab → Space
  // → arrows → Space works for keyboard a11y.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    if (from === -1 || to === -1) return;
    // Same code path as the up/down buttons — order is renumbered to idx+1
    // on submit (see lines below), so dragging doesn't write until save.
    move(from, to);
  };

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

  const submit = form.handleSubmit(
    (values) => {
      console.log("[template-form] submit: Zod passed, calling onSubmit prop", values);
      startTransition(async () => {
        try {
          // Recompute `order` to be 1-based contiguous before submit — the
          // Firestore rule layer (P04-02) asserts `order == arrayIndex + 1`.
          // Mirror tags[0] back onto the legacy `tag` field so the iOS
          // clients reading the old field stay working until they migrate.
          const tagsClean = values.tags.length > 0
            ? values.tags
            : [values.tag || "custom"];
          const normalized: WorkoutTemplateInput = {
          ...values,
          tag: tagsClean[0] ?? "custom",
          tags: tagsClean,
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
        // Save succeeded — the in-progress draft is no longer needed.
        if (draftKey) clearDraft(draftKey);
        if (mode === "create" && result?.id) {
          toast.success(t("createdToast"));
          // 260524 — go back in nav after create (same UX as exercise + habit forms).
          router.back();
          return;
        }
        toast.success(t("savedToast"));
        // Edit wrappers can defer the back-nav so they can render a follow-up
        // dialog (e.g. the template-propagation confirmation). The wrapper is
        // responsible for navigating away once the dialog resolves.
        if (result?.deferNavigation) return;
        router.back();
      } catch (err) {
        console.error("[template-form] save failed", err);
        const message =
          err instanceof Error ? err.message : t("saveFailed");
        toast.error(message);
      }
    });
  },
  (errors) => {
    // Explicit onInvalid so Zod rejections surface in the console — the
    // default behaviour silently focuses the first error field. With this
    // log + the inline error summary above the action bar, the trainer
    // always has a visible signal that the submit was attempted but failed.
    console.warn("[template-form] submit: Zod rejected", errors);
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

  const hasUnselectedExercises = useMemo(
    () =>
      fields.some((_, index) => {
        const id = form.getValues(`exercises.${index}.exerciseId` as const);
        return !id;
      }),
    [fields, form],
  );
  const canContinueToDetails = fields.length > 0 && !hasUnselectedExercises;
  // canSubmit retained as a derived hint (used by Continue button etc.), but
  // the SUBMIT BUTTON itself is no longer gated by this — gating silently
  // swallowed clicks and left the trainer wondering what was wrong. We let
  // the click through, run Zod, and surface errors via the inline summary
  // below.
  const watchedNameEn = form.watch("name.en");

  // Aggregate every distinct tag across the trainer's existing templates so
  // the picker below can surface them as one-click suggestions. The hook
  // is the same one the /templates list uses, so the call is shared cache.
  const { data: tagSourceTemplates } = useWorkoutTemplates();
  const existingTagSuggestions = useMemo(() => {
    if (!tagSourceTemplates) return [];
    const out = new Set<string>();
    for (const tpl of tagSourceTemplates) {
      if (Array.isArray(tpl.tags)) {
        for (const t of tpl.tags) {
          const trimmed = (t ?? "").trim();
          if (trimmed) out.add(trimmed);
        }
      }
      if (tpl.tag && typeof tpl.tag === "string" && tpl.tag.trim()) {
        out.add(tpl.tag.trim());
      }
    }
    return Array.from(out);
  }, [tagSourceTemplates]);
  const canSubmit =
    !pending &&
    step === 2 &&
    canContinueToDetails &&
    (watchedNameEn ?? "").trim().length > 0;

  // Flatten RHF errors into a human-readable list shown near the submit
  // button after a failed submit attempt.
  const submitErrorMessages = useMemo(() => {
    const out: string[] = [];
    const errs = form.formState.errors;
    if (errs.name?.en?.message) out.push(String(errs.name.en.message));
    if (errs.name?.es?.message) out.push(String(errs.name.es.message));
    if (errs.description?.en?.message)
      out.push(String(errs.description.en.message));
    if (errs.description?.es?.message)
      out.push(String(errs.description.es.message));
    if (errs.tag?.message) out.push(String(errs.tag.message));
    if (errs.exercises && !Array.isArray(errs.exercises)) {
      const m = (errs.exercises as { message?: string }).message;
      if (m) out.push(String(m));
    }
    if (Array.isArray(errs.exercises)) {
      errs.exercises.forEach((exErr, exIdx) => {
        if (!exErr) return;
        const prefix = t("submitErrorExercisePrefix", { index: exIdx + 1 });
        Object.entries(exErr).forEach(([field, err]) => {
          const m = (err as { message?: string } | undefined)?.message;
          if (m) out.push(`${prefix}: ${field} — ${m}`);
        });
      });
    }
    return out;
  }, [form.formState.errors, t]);

  // Plan 21-01a: batch-add N exercises from the multi-select dialog. Each
  // new row inherits the default sets/reps/rest_seconds; the trainer can
  // tweak per-row inputs after the rows land. We respect the 30-row cap
  // (workoutTemplateSchema.exercises.max(30)) by clipping silently —
  // anything beyond the cap is dropped. The form-level cap message
  // surfaces if the user somehow exceeds 30 (e.g., paste-bomb).
  function appendExercises(exerciseIds: string[]) {
    const remaining = Math.max(0, 30 - fields.length);
    const accepted = exerciseIds.slice(0, remaining);
    if (accepted.length === 0) return;
    append(
      accepted.map((exerciseId, idx) => ({
        exerciseId,
        sets: 3,
        reps: 10,
        rest_seconds: 60,
        notes: "",
        order: fields.length + idx + 1,
      })),
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          console.log("[template-form] form onSubmit event fired");
          return submit(e);
        }}
        className="flex flex-col gap-6"
        noValidate
      >
        {draftRestored ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground dark:border-amber-400/40 dark:bg-amber-400/10">
            <span>
              Restored your unsaved draft. Pick up where you left off.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={discardDraft}
            >
              Discard draft
            </Button>
          </div>
        ) : null}
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
          {showSpanishFields ? (
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
          ) : (
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={() => setShowSpanishFields(true)}>
                Add Spanish translation fields
              </Button>
            </div>
          )}
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
          {showSpanishFields ? (
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
          ) : (
            <div className="hidden sm:block" />
          )}
        </div>

        {/* Tags (multi). Existing templates power the suggestion strip
            below the input so the trainer's vocabulary stays consistent
            across the library. */}
        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem className="max-w-2xl">
              <FormLabel>{t("tagsLabel")}</FormLabel>
              <FormControl>
                <TemplateTagsPicker
                  value={(field.value as string[] | undefined) ?? []}
                  onChange={field.onChange}
                  existingTags={existingTagSuggestions}
                  placeholder={t("tagsPlaceholder")}
                  removeAriaLabel={(tag) => t("tagsRemoveAria", { tag })}
                  suggestionsLabel={t("tagsSuggestionsLabel")}
                />
              </FormControl>
              <FormDescription>{t("tagsHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-xl border bg-card/90 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Workout builder
              </p>
              <h2 className="font-heading text-base font-semibold">
                {step === 1 ? "Step 1 · Select exercises" : "Step 2 · Configure sets, reps, kg and notes"}
              </h2>
              {step === 1 && fields.length > 0 && hasUnselectedExercises ? (
                <p className="mt-1 text-xs text-amber-700">Select one exercise in each row before continuing.</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant={step === 1 ? "default" : "outline"} size="sm" onClick={() => setStep(1)}>
                1. Exercises
              </Button>
              <Button type="button" variant={step === 2 ? "default" : "outline"} size="sm" onClick={() => setStep(2)} disabled={!canContinueToDetails}>
                2. Details
              </Button>
            </div>
          </div>
        </div>

        {/* Exercises — wrapped in a section card to match the HabitForm
            schedule/reminder visual hierarchy. */}
        <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              {t("exercises")}
            </h2>
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

          {step === 1 ? (
            <ul className="flex flex-col gap-2">
              {fields.map((field, index) => (
                <li key={field.id} className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Exercise #{index + 1}</p>
                    <div className="mt-1">
                      <ExercisePickerPopover
                        value={form.getValues(`exercises.${index}.exerciseId` as const) ?? ""}
                        onChange={(value) =>
                          form.setValue(`exercises.${index}.exerciseId` as const, value, { shouldDirty: true })
                        }
                        ariaLabel={t("pickExerciseAria", { index: index + 1 })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => move(index, index - 1)} disabled={index === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => move(index, index + 1)} disabled={index === fields.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-3">
                  {fields.map((field, index) => (
                  // Pitfall 3: React key is `field.id` (RHF-internal CUID), NOT
                  // `index` (would break across reorders) and NOT
                  // `field.exerciseId` (collisions on supersets referencing the
                  // same exercise).
                  <SortableExerciseRow key={field.id} id={field.id}>
                    {(dragListeners) => (
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("dragHandle")}
                          className="cursor-grab touch-none active:cursor-grabbing"
                          {...dragListeners}
                        >
                          <GripVertical className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-medium text-muted-foreground">
                          #{index + 1}
                        </span>
                      </div>
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

                    {/* Sets / Rest. Reps is defined per-set below to avoid double source of truth. */}
                    <div className="grid gap-3 sm:grid-cols-2">
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
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={setsDraft[field.id] ?? (numField.value ?? "")}
                                onChange={(e) =>
                                  {
                                    // Buffer ONLY — do not commit to RHF or
                                    // resize the per-set arrays per keystroke.
                                    // Typing "12" would otherwise transiently
                                    // resize the Set rows from 1 → 10 and
                                    // thrash focus + scroll. Commit on blur.
                                    if (e.target.value === "") {
                                      setSetsDraft((prev) => ({ ...prev, [field.id]: "" }));
                                      return;
                                    }
                                    const parsed = Number(e.target.value);
                                    if (!Number.isFinite(parsed)) return;
                                    setSetsDraft((prev) => ({ ...prev, [field.id]: e.target.value }));
                                  }
                                }
                                onBlur={(e) => {
                                  const raw = setsDraft[field.id];
                                  if (raw === "") {
                                  setSetsDraft((prev) => {
                                    const next = { ...prev };
                                    delete next[field.id];
                                    return next;
                                  });
                                  numField.onBlur();
                                  return;
                                }
                                  if (raw !== undefined) {
                                    const parsed = Number(raw);
                                    if (Number.isFinite(parsed)) {
                                      numField.onChange(parsed);
                                      syncSetArrays(index, parsed);
                                    }
                                  }
                                  setSetsDraft((prev) => {
                                    const next = { ...prev };
                                    delete next[field.id];
                                    return next;
                                  });
                                  numField.onBlur();
                                  e.currentTarget.value = String(form.getValues(`exercises.${index}.sets` as const) ?? "");
                                }}
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
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={restSecondsDraft[field.id] ?? (numField.value ?? "")}
                                onChange={(e) => {
                                  // Buffer only — RHF commit happens on blur,
                                  // matching the Sets + per-set patterns and
                                  // keeping form.watch (autosave) silent
                                  // until the trainer commits the value.
                                  if (e.target.value === "") {
                                    setRestSecondsDraft((prev) => ({ ...prev, [field.id]: "" }));
                                    return;
                                  }
                                  const parsed = Number(e.target.value);
                                  if (!Number.isFinite(parsed)) return;
                                  setRestSecondsDraft((prev) => ({ ...prev, [field.id]: e.target.value }));
                                }}
                                onBlur={() => {
                                  const raw = restSecondsDraft[field.id];
                                  if (raw === "") {
                                    setRestSecondsDraft((prev) => {
                                      const next = { ...prev };
                                      delete next[field.id];
                                      return next;
                                    });
                                    numField.onChange(undefined);
                                    numField.onBlur();
                                    return;
                                  }
                                  if (raw !== undefined) {
                                    const parsed = Number(raw);
                                    if (Number.isFinite(parsed)) {
                                      numField.onChange(parsed);
                                    }
                                  }
                                  setRestSecondsDraft((prev) => {
                                    const next = { ...prev };
                                    delete next[field.id];
                                    return next;
                                  });
                                  numField.onBlur();
                                }}
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
                          <div className="grid grid-cols-[84px_minmax(140px,1fr)_minmax(140px,1fr)] items-center gap-2 px-1">
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
                              Math.min(10, Number(form.getValues(`exercises.${index}.sets` as const) ?? 1)),
                            ),
                          }).map((_, setIdx) => {
                            const repsPath = `exercises.${index}.repsBySet` as const;
                            const weightPath = `exercises.${index}.weightBySetKg` as const;
                            const repsArray = toFiniteNumberArray(form.getValues(repsPath));
                            const weightArray = toFiniteNumberArray(form.getValues(weightPath));
                            const repsFallback = Number(
                              form.getValues(`exercises.${index}.reps` as const) ?? 10,
                            );
                            const setKey = `${field.id}-${setIdx}`;
                            const repsValue = setRepsDraft[setKey] ?? (repsArray[setIdx] ?? repsFallback);
                            const weightValue = weightArray[setIdx];

                            return (
                              <div
                                key={`${field.id}-set-${setIdx + 1}`}
                                data-set-row={setKey}
                                className="grid grid-cols-[84px_minmax(140px,1fr)_minmax(140px,1fr)] items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2"
                              >
                                <span className="text-xs text-muted-foreground">
                                  {t("setNumber", { count: setIdx + 1 })}
                                </span>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  className="h-10"
                                  value={repsValue}
                                  data-set-input="reps"
                                  data-set-key={setKey}
                                  onKeyDown={(e) => {
                                    if (e.key === "Tab" && !e.shiftKey) {
                                      const next = e.currentTarget
                                        .closest("[data-set-row]")
                                        ?.querySelector<HTMLInputElement>('[data-set-input="weight"]');
                                      if (next) {
                                        e.preventDefault();
                                        next.focus();
                                        next.select();
                                      }
                                    }
                                  }}
                                  onChange={(e) => {
                                    if (e.target.value.trim() === "") {
                                      setSetRepsDraft((prev) => ({ ...prev, [setKey]: "" }));
                                      return;
                                    }
                                    const next = Number(e.target.value);
                                    if (!Number.isFinite(next)) return;
                                    setSetRepsDraft((prev) => ({ ...prev, [setKey]: e.target.value }));
                                  }}
                                  onBlur={() => {
                                    const raw = setRepsDraft[setKey];
                                    if (raw === "") {
                                      setSetRepsDraft((prev) => {
                                        const next = { ...prev };
                                        delete next[setKey];
                                        return next;
                                      });
                                      return;
                                    }
                                    if (raw !== undefined) {
                                      const next = Number(raw);
                                      if (Number.isFinite(next)) {
                                        const current = toFiniteNumberArray(form.getValues(repsPath));
                                        const safeLen = Math.max(setIdx + 1, current.length);
                                        const filled = Array.from({ length: safeLen }, (_, i) => {
                                          const v = current[i];
                                          return Number.isFinite(v) ? v : repsFallback;
                                        });
                                        filled[setIdx] = next;
                                        form.setValue(repsPath, filled, { shouldDirty: true });
                                        if (setIdx === 0) {
                                          form.setValue(
                                            `exercises.${index}.reps` as const,
                                            next,
                                            { shouldDirty: true },
                                          );
                                        }
                                      }
                                    }
                                    setSetRepsDraft((prev) => {
                                      const next = { ...prev };
                                      delete next[setKey];
                                      return next;
                                    });
                                  }}
                                  aria-label={t("setRepsAria", { count: setIdx + 1 })}
                                />
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  className="h-10"
                                  placeholder={t("setWeightPlaceholder")}
                                  data-set-input="weight"
                                  data-set-key={setKey}
                                  value={setWeightDraft[setKey] ?? (weightValue?.toString() ?? "")}
                                  onChange={(e) => {
                                    const nextRaw = e.target.value.trim();
                                    if (nextRaw === "") {
                                      setSetWeightDraft((prev) => ({ ...prev, [setKey]: "" }));
                                      return;
                                    }
                                    const next = Number(nextRaw);
                                    if (!Number.isFinite(next)) return;
                                    setSetWeightDraft((prev) => ({ ...prev, [setKey]: e.target.value }));
                                  }}
                                  onBlur={() => {
                                    const raw = setWeightDraft[setKey];
                                    const current = toFiniteNumberArray(form.getValues(weightPath));
                                    if (raw === "") {
                                      const trimmed = current.slice(0, Math.max(setIdx, 0));
                                      form.setValue(weightPath, trimmed, { shouldDirty: true });
                                      setSetWeightDraft((prev) => {
                                        const next = { ...prev };
                                        delete next[setKey];
                                        return next;
                                      });
                                      return;
                                    }
                                    if (raw !== undefined) {
                                      const next = Number(raw);
                                      if (Number.isFinite(next)) {
                                        const safeLen = Math.max(setIdx + 1, current.length);
                                        const filled = Array.from({ length: safeLen }, (_, i) => {
                                          const v = current[i];
                                          return Number.isFinite(v) ? v : 0;
                                        });
                                        filled[setIdx] = next;
                                        form.setValue(weightPath, filled, { shouldDirty: true });
                                      }
                                    }
                                    setSetWeightDraft((prev) => {
                                      const next = { ...prev };
                                      delete next[setKey];
                                      return next;
                                    });
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
                    )}
                  </SortableExerciseRow>
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={appendExercise}
              disabled={fields.length >= 30}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {t("addExercise")}
            </Button>
            <ExerciseMultiAddDialog
              onConfirm={appendExercises}
              onQuickCreated={(exercise) =>
                setQuickCreated((prev) => [{ id: exercise.id, name: exercise.name }, ...prev])
              }
              disabled={fields.length >= 30}
              triggerClassName="bg-primary text-primary-foreground hover:bg-primary/90"
            />
            {step === 1 ? (
              <Button type="button" onClick={() => setStep(2)} disabled={!canContinueToDetails} className="ml-auto">
                Continue to details
              </Button>
            ) : null}
          </div>
          {quickCreated.length > 0 ? (
            <div className="mt-2 flex flex-col gap-2">
              {quickCreated.map((exercise) => (
                <div key={exercise.id} className="flex items-center justify-between rounded-md border border-emerald-400/50 bg-emerald-50/60 px-3 py-2 text-sm">
                  <span className="truncate">
                    Created: <strong>{exercise.name}</strong>
                  </span>
                  <div className="ml-2 flex items-center gap-2">
                    <a
                      href={`/gc-fitness/exercises/${exercise.id}/edit`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-900 underline"
                    >
                      Edit in new tab
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setQuickCreated((prev) => prev.filter((row) => row.id !== exercise.id))
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Form-level error from RHF root */}
        {form.formState.errors.exercises &&
          !Array.isArray(form.formState.errors.exercises) && (
            <p className="text-sm text-destructive">
              {form.formState.errors.exercises.message}
            </p>
          )}

        {/* Submit-attempt error summary — shows what needs to be fixed, near
            the submit button so the trainer doesn't have to scroll up hunting
            for FormMessage hints. Renders only after a submit attempt failed
            validation. */}
        {form.formState.isSubmitted && submitErrorMessages.length > 0 ? (
          <div
            className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <p className="font-medium">{t("submitErrorsHeadline")}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {submitErrorMessages.map((msg, idx) => (
                <li key={`${msg}-${idx}`}>{msg}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Action row */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          {pending ? (
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {t("saving")}
            </span>
          ) : null}
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
