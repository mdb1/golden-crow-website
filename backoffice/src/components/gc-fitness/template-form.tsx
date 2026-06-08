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
import {
  ArrowUp,
  ArrowDown,
  GripVertical,
  Trash2,
  Plus,
  X,
  ExternalLink,
  Info,
} from "lucide-react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  workoutTemplateSchema,
  type WorkoutTemplateInput,
} from "@/lib/gc-fitness/workout-template-schema";
import {
  getSupersetGroupMemberIndexes,
  getSupersetMembership,
  listSupersetGroupOptions,
  normalizeSupersetGroup,
} from "@/lib/gc-fitness/superset-groups";

import { ExercisePickerPopover } from "./exercise-picker-popover";
import { ExerciseMultiAddDialog } from "./exercise-multi-add-dialog";
import { TemplateTagsPicker } from "./template-tags-picker";
import { useWorkoutTemplates } from "@/lib/gc-fitness/workout-templates-listener";
// 26-03 — needed to resolve effectiveMetric for each per-exercise row.
// The cascade is templateExercise.metric ?? exercise.metric ?? "reps"
// (PATTERNS.md §16 Shared 1). The exercises listener already powers the
// ExercisePickerPopover above, so this is a shared-cache hook call (no
// extra Firestore reads).
import { useExercisesQuery } from "@/lib/gc-fitness/exercises-listener";
import { estimateTemplateDurationMinutesFromRaw } from "@/lib/gc-fitness/workout-duration-estimate";

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

function withTransitionRestDefault(
  exercises:
    | Array<Partial<WorkoutTemplateInput["exercises"][number]>>
    | undefined,
): WorkoutTemplateInput["exercises"] {
  return (exercises ?? []).map((exercise) => ({
    ...exercise,
    transition_rest_seconds:
      typeof exercise.transition_rest_seconds === "number"
        ? exercise.transition_rest_seconds
        : 60,
  })) as WorkoutTemplateInput["exercises"];
}

function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${key}`);
  } catch {
    /* ignore */
  }
}
function InfoTooltip({ text, label }: { text: string; label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title={text}
            className="inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
  mode: TemplateFormMode = "create",
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
    exercises: withTransitionRestDefault(passed?.exercises),
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
  // 26-03 — Per-set duration draft buffer mirroring setRepsDraft. Keyed by
  // `${field.id}-${setIdx}` so the controlled Input doesn't thrash RHF state
  // on every keystroke. Commit happens on blur (matches Reps + Weight UX).
  const [setDurationDraft, setSetDurationDraft] = useState<Record<string, string>>({});
  // 26-03 — Exercise-level fallback duration (seconds) draft. Buffered the
  // same way as Sets / Rest above; commit-on-blur into
  // `exercises.${index}.durationSeconds`.
  const [durationSecondsDraft, setDurationSecondsDraft] = useState<Record<string, string>>({});
  const [restSecondsDraft, setRestSecondsDraft] = useState<Record<string, string>>({});
  const [transitionRestSecondsDraft, setTransitionRestSecondsDraft] = useState<
    Record<string, string>
  >({});
  const [step, setStep] = useState<1 | 2>(1);
  const [showSpanishFields, setShowSpanishFields] = useState(false);
  const [quickCreated, setQuickCreated] = useState<Array<{ id: string; name: string }>>([]);
  const initialDefaults = buildDefaults(defaultValues, mode);

  const form = useForm<WorkoutTemplateInput>({
    // Same `as any` resolver cast as `ExerciseForm` — `zodResolver` widens
    // its generic in a way that doesn't compose with our explicit form
    // type parameter. The runtime parse behavior is unchanged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(workoutTemplateSchema as any) as unknown as any,
    defaultValues: initialDefaults,
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

  // 26-03 — Source-exercise lookup map for the effective-metric cascade.
  // The per-exercise card resolves
  //   effectiveMetric = templateExercise.metric ?? exercise.metric ?? "reps"
  // (PATTERNS.md §16 Shared 1). `useExercisesQuery` is the same Firestore
  // listener that powers ExercisePickerPopover above so this is a shared-
  // cache call (no extra reads). Map is rebuilt on every snapshot delivery
  // — cheap; the listener already debounces.
  const { data: exerciseLibrary } = useExercisesQuery();
  const exerciseMetricById = useMemo(() => {
    const m = new Map<string, "reps" | "time">();
    for (const ex of exerciseLibrary ?? []) {
      m.set(ex.id, ex.metric);
    }
    return m;
  }, [exerciseLibrary]);
  const watchedExercises = form.watch("exercises") ?? [];
  const supersetGroupOptions = useMemo(
    () => listSupersetGroupOptions(watchedExercises),
    [watchedExercises],
  );
  // Live estimated duration (work + rest + per-set setup overhead + transitions),
  // matching the iOS-twin estimator. 0 while no exercises are configured.
  const estimatedDurationMinutes = useMemo(
    () => estimateTemplateDurationMinutesFromRaw(watchedExercises),
    [watchedExercises],
  );

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
    const { endsOn: _endsOn, ...restored } = stored as { endsOn?: unknown };
    form.reset({
      ...buildDefaults(defaultValues, mode),
      ...restored,
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
    form.reset(buildDefaults(defaultValues, mode));
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
    // 26-03 — PATTERNS.md §16 Pattern C parallel branch for time-based
    // sets. We always pad/truncate the duration array alongside reps +
    // weight so a metric flip later doesn't leave a desynced array
    // behind.
    const durationPath = `exercises.${index}.durationBySetSeconds` as const;
    const repsFallback = Number(form.getValues(`exercises.${index}.reps` as const) ?? 10);
    const durationFallback = Number(
      form.getValues(`exercises.${index}.durationSeconds` as const) ?? 60,
    );
    const currentReps = toFiniteNumberArray(form.getValues(repsPath));
    const currentWeight = toFiniteNumberArray(form.getValues(weightPath));
    const currentDurations = toFiniteNumberArray(form.getValues(durationPath));

    const nextReps = Array.from({ length: safeSets }, (_, i) => {
      const v = currentReps[i];
      return Number.isFinite(v) ? v : repsFallback;
    });
    const nextWeight = currentWeight.slice(0, safeSets);
    // Only persist the duration array when at least one entry is present
    // — keeps reps-based exercises clean (no stray `durationBySetSeconds:
    // []` on Firestore docs).
    const nextDurations =
      currentDurations.length > 0
        ? Array.from({ length: safeSets }, (_, i) => {
            const v = currentDurations[i];
            return Number.isFinite(v) ? v : durationFallback;
          })
        : undefined;

    form.setValue(repsPath, nextReps, { shouldDirty: true });
    form.setValue(weightPath, nextWeight, { shouldDirty: true });
    if (nextDurations !== undefined) {
      form.setValue(durationPath, nextDurations, { shouldDirty: true });
    }
  }

  function syncSupersetGroupSets(group: string, nextSets: number) {
    const normalized = normalizeSupersetGroup(group);
    if (!normalized) return;
    const memberIndexes = getSupersetGroupMemberIndexes(watchedExercises, normalized);
    for (const memberIndex of memberIndexes) {
      form.setValue(
        `exercises.${memberIndex}.sets` as const,
        nextSets,
        { shouldDirty: true },
      );
      syncSetArrays(memberIndex, nextSets);
    }
  }

  function applySupersetGroup(index: number, nextGroupRaw: string) {
    const nextGroup = normalizeSupersetGroup(nextGroupRaw);
    form.setValue(
      `exercises.${index}.supersetGroup` as const,
      nextGroup,
      { shouldDirty: true },
    );
    if (!nextGroup) return;

    const snapshot = watchedExercises.map((exercise, exerciseIndex) =>
      exerciseIndex === index
        ? { ...exercise, supersetGroup: nextGroup }
        : exercise,
    );
    const membership = getSupersetMembership(snapshot, index);
    if (!membership.group || membership.leaderIndex === null) return;

    const leaderIndex = membership.leaderIndex;
    const leaderSets = Number(
      form.getValues(`exercises.${leaderIndex}.sets` as const) ?? 1,
    );
    if (leaderIndex !== index) {
      form.setValue(`exercises.${index}.sets` as const, leaderSets, {
        shouldDirty: true,
      });
      syncSetArrays(index, leaderSets);
    }

    for (const memberIndex of membership.memberIndexes) {
      if (memberIndex === leaderIndex || memberIndex === index) continue;
      form.setValue(`exercises.${memberIndex}.sets` as const, leaderSets, {
        shouldDirty: true,
      });
      syncSetArrays(memberIndex, leaderSets);
    }
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
          exercises: values.exercises.map((ex, idx) => {
            // Align sets, repsBySet, weightBySetKg around a single
            // canonical length so the saved doc never has the desync that
            // surfaced as "sets=1 but weightBySetKg=[24,24,23]" in the
            // operator's PULL template. Prior code derived `sets` from
            // `repsBySet.length` only, so a stale weightBySetKg with more
            // entries got silently persisted, which then re-rendered the
            // assign-template-modal in a confusing way.
            const cleanedReps = Array.isArray(ex.repsBySet)
              ? ex.repsBySet.filter((n): n is number => Number.isFinite(n))
              : [];
            const cleanedWeights = Array.isArray(ex.weightBySetKg)
              ? ex.weightBySetKg.filter((n): n is number => Number.isFinite(n))
              : [];
            // 26-03 — Parallel `cleanedDurations` branch per PATTERNS.md
            // §16 Pattern D. Pad/truncate to canonicalLen the same way
            // reps + weight are handled so the duration array can never
            // be out-of-sync with the declared `sets` count.
            const cleanedDurations = Array.isArray(ex.durationBySetSeconds)
              ? ex.durationBySetSeconds.filter(
                  (n): n is number => Number.isFinite(n),
                )
              : [];
            const declaredSets =
              typeof ex.sets === "number" && Number.isFinite(ex.sets)
                ? Math.max(1, Math.min(10, Math.round(ex.sets)))
                : 0;
            const canonicalLen = Math.min(
              10,
              Math.max(
                declaredSets,
                cleanedReps.length,
                cleanedWeights.length,
                cleanedDurations.length,
                1,
              ),
            );
            const repsFallback = Number.isFinite(ex.reps) && ex.reps > 0
              ? ex.reps
              : cleanedReps.find((n) => n > 0) ?? 0;
            const alignedReps = Array.from({ length: canonicalLen }, (_, i) =>
              Number.isFinite(cleanedReps[i]) ? cleanedReps[i] : repsFallback,
            );
            const alignedWeights = cleanedWeights.length > 0
              ? Array.from({ length: canonicalLen }, (_, i) =>
                  Number.isFinite(cleanedWeights[i]) ? cleanedWeights[i] : 0,
                )
              : undefined;
            // 26-03 — Align durations to canonicalLen ONLY when the
            // trainer authored at least one duration value (or set an
            // exercise-level fallback). Otherwise we omit the field
            // entirely so reps-based exercises stay clean on Firestore.
            const durationFallbackForAlign = Number.isFinite(ex.durationSeconds)
              ? (ex.durationSeconds as number)
              : cleanedDurations.find((n) => n > 0);
            const alignedDurations =
              cleanedDurations.length > 0
                ? Array.from({ length: canonicalLen }, (_, i) =>
                    Number.isFinite(cleanedDurations[i])
                      ? cleanedDurations[i]
                      : durationFallbackForAlign ?? 60,
                  )
                : undefined;
            return {
              ...ex,
              sets: canonicalLen,
              reps: alignedReps[0] ?? repsFallback,
              transition_rest_seconds:
                typeof ex.transition_rest_seconds === "number"
                  ? ex.transition_rest_seconds
                  : 60,
              ...(alignedReps.length > 0 ? { repsBySet: alignedReps } : {}),
              ...(alignedWeights ? { weightBySetKg: alignedWeights } : {}),
              ...(alignedDurations
                ? { durationBySetSeconds: alignedDurations }
                : {}),
              ...(ex.supersetGroup?.trim()
                ? { supersetGroup: ex.supersetGroup.trim() }
                : {}),
              order: idx + 1,
            };
          }),
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
      transition_rest_seconds: 60,
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
        transition_rest_seconds: 60,
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
        className="flex min-w-0 flex-col gap-6"
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
                {t("builderEyebrow")}
              </p>
              <h2 className="font-heading text-base font-semibold">
                {step === 1 ? t("builderStepExercises") : t("builderStepDetails")}
              </h2>
              {step === 1 && fields.length > 0 && hasUnselectedExercises ? (
                <p className="mt-1 text-xs text-amber-700">{t("builderSelectAllHint")}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant={step === 1 ? "default" : "outline"} size="sm" onClick={() => setStep(1)}>
                {t("builderStepExercisesShort")}
              </Button>
              <Button type="button" variant={step === 2 ? "default" : "outline"} size="sm" onClick={() => setStep(2)} disabled={!canContinueToDetails}>
                {t("builderStepDetailsShort")}
              </Button>
            </div>
          </div>
        </div>

        {/* Exercises — wrapped in a section card to match the HabitForm
            schedule/reminder visual hierarchy. */}
        <div className="flex flex-col gap-3 rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              {t("exercises")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("exercisesCount", { count: fields.length })}
              {estimatedDurationMinutes > 0
                ? ` · ${t("estimatedDuration", { minutes: estimatedDurationMinutes })}`
                : ""}
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
                <li key={field.id} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{t("exerciseNumber", { index: index + 1 })}</p>
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
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
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
                  {fields.map((field, index) => {
                  // 26-03 — effective-metric cascade per PATTERNS.md §16
                  // Shared 1: templateExercise.metric ?? exercise.metric
                  // ?? "reps". `form.watch` here makes the card re-render
                  // when the trainer flips the chip toggle (or picks a
                  // different exercise above).
                  const templateMetric = form.watch(
                    `exercises.${index}.metric` as const,
                  );
                  const selectedExerciseId = form.watch(
                    `exercises.${index}.exerciseId` as const,
                  );
                  const sourceMetric = selectedExerciseId
                    ? exerciseMetricById.get(selectedExerciseId)
                    : undefined;
                  const effectiveMetric: "reps" | "time" =
                    templateMetric ?? sourceMetric ?? "reps";
                  const supersetMembership = getSupersetMembership(
                    watchedExercises,
                    index,
                  );
                  const supersetGroup = supersetMembership.group;
                  const isSupersetLeader = supersetMembership.isLeader;
                  const isSupersetFollower = supersetMembership.isFollower;
                  // True when the trainer hasn't explicitly chosen a
                  // per-template override — we show a small "Heredado"
                  // hint next to the chips so they know the value is
                  // coming from the source exercise.
                  const metricInherited = templateMetric === undefined;
                  return (
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
                          tabIndex={-1}
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
                          tabIndex={-1}
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
                          tabIndex={-1}
                          aria-label={t("moveDown")}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          tabIndex={-1}
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

                    {/* 26-03 — Per-template metric override chips. Two
                        buttons that read/write `exercises.${index}.metric`:
                          - "Por reps"   → metric: "reps"
                          - "Por tiempo" → metric: "time"
                        When neither is explicitly set the form value is
                        undefined and the effective metric falls through to
                        the source exercise's `metric` (PATTERNS.md §16
                        Shared 1). The "Heredado" hint surfaces that the
                        current state is inherited (no per-template override).
                        i18n migrated in 26-07. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("metricLabel")}
                      </span>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() =>
                          form.setValue(
                            `exercises.${index}.metric` as const,
                            "reps",
                            { shouldDirty: true },
                          )
                        }
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium",
                          effectiveMetric === "reps"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border/70 bg-background text-foreground hover:border-foreground/30",
                        )}
                      >
                        {t("templateMetricToggleReps")}
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() =>
                          form.setValue(
                            `exercises.${index}.metric` as const,
                            "time",
                            { shouldDirty: true },
                          )
                        }
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium",
                          effectiveMetric === "time"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border/70 bg-background text-foreground hover:border-foreground/30",
                        )}
                      >
                        {t("templateMetricToggleTime")}
                      </button>
                      {metricInherited ? (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {t("templateMetricToggleInherited")}
                        </span>
                      ) : null}
                    </div>

                    {/* Sets / Rest. Reps is defined per-set
                        below to avoid double source of truth. */}
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
                                data-field-sets={index}
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
                                      if (isSupersetLeader && supersetGroup) {
                                        syncSupersetGroupSets(supersetGroup, parsed);
                                      } else {
                                        syncSetArrays(index, parsed);
                                      }
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
                                disabled={isSupersetFollower}
                                aria-describedby={
                                  isSupersetFollower
                                    ? `superset-sets-hint-${field.id}`
                                    : undefined
                                }
                              />
                            </FormControl>
                            {fieldState.error && (
                              <FormMessage>
                                {fieldState.error.message}
                              </FormMessage>
                            )}
                            {isSupersetFollower && supersetGroup ? (
                              <FormDescription id={`superset-sets-hint-${field.id}`}>
                                {t("supersetSetsLockedHint", {
                                  group: supersetGroup,
                                })}
                              </FormDescription>
                            ) : null}
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

                    {/* 26-03 — Exercise-level duration fallback. Visible only
                        when the effective metric is "time"; serves as the
                        baseline propagated to every set that doesn't have
                        an explicit durationBySetSeconds[i] entry. Mirrors
                        the structural role of the per-exercise `reps` field
                        in reps-based mode (which we hide via this branch).
                        Buffered on `durationSecondsDraft` and committed on
                        blur, same pattern as Sets / Rest above. */}
                    {effectiveMetric === "time" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Controller
                          control={form.control}
                          name={`exercises.${index}.durationSeconds` as const}
                          render={({ field: numField, fieldState }) => (
                            <FormItem>
                              <FormLabel>
                                {t("durationSecondsLabel")}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  placeholder={t("durationSecondsPlaceholder")}
                                  value={durationSecondsDraft[field.id] ?? (numField.value ?? "")}
                                  onChange={(e) => {
                                    if (e.target.value === "") {
                                      setDurationSecondsDraft((prev) => ({
                                        ...prev,
                                        [field.id]: "",
                                      }));
                                      return;
                                    }
                                    const parsed = Number(e.target.value);
                                    if (!Number.isFinite(parsed)) return;
                                    setDurationSecondsDraft((prev) => ({
                                      ...prev,
                                      [field.id]: e.target.value,
                                    }));
                                  }}
                                  onBlur={() => {
                                    const raw = durationSecondsDraft[field.id];
                                    if (raw === "") {
                                      setDurationSecondsDraft((prev) => {
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
                                        const clamped = Math.max(
                                          5,
                                          Math.min(1800, Math.round(parsed)),
                                        );
                                        numField.onChange(clamped);
                                      }
                                    }
                                    setDurationSecondsDraft((prev) => {
                                      const next = { ...prev };
                                      delete next[field.id];
                                      return next;
                                    });
                                    numField.onBlur();
                                  }}
                                />
                              </FormControl>
                              {fieldState.error && (
                                <FormMessage>{fieldState.error.message}</FormMessage>
                              )}
                            </FormItem>
                          )}
                        />
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3">
                      <div>
                        <FormLabel>{t("setRowsTitle")}</FormLabel>
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="grid grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 px-1 sm:grid-cols-[84px_minmax(140px,1fr)_minmax(140px,1fr)]">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {t("setHeader")}
                            </span>
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {effectiveMetric === "time" ? t("secondsHeader") : t("reps")}
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
                            // 26-03 — Parallel duration path for time-based sets.
                            const durationPath = `exercises.${index}.durationBySetSeconds` as const;
                            const repsArray = toFiniteNumberArray(form.getValues(repsPath));
                            const weightArray = toFiniteNumberArray(form.getValues(weightPath));
                            const durationArray = toFiniteNumberArray(form.getValues(durationPath));
                            const repsFallback = Number(
                              form.getValues(`exercises.${index}.reps` as const) ?? 10,
                            );
                            // 26-03 — fallback for time-based sets: prefer
                            // the exercise-level durationSeconds; if absent,
                            // default to 60 (matches plank prescription
                            // baseline used elsewhere in the engine).
                            const durationFallback = Number(
                              form.getValues(`exercises.${index}.durationSeconds` as const) ?? 60,
                            );
                            const setKey = `${field.id}-${setIdx}`;
                            const repsValue = setRepsDraft[setKey] ?? (repsArray[setIdx] ?? repsFallback);
                            const weightValue = weightArray[setIdx];
                            const durationValue =
                              setDurationDraft[setKey] ?? (durationArray[setIdx] ?? durationFallback);

                            return (
                              <div
                                key={`${field.id}-set-${setIdx + 1}`}
                                data-set-row={setKey}
                                data-set-idx={setIdx}
                                className="grid grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)_28px] items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2 sm:grid-cols-[84px_minmax(140px,1fr)_minmax(140px,1fr)_28px]"
                              >
                                <span className="text-xs text-muted-foreground">
                                  {t("setNumber", { count: setIdx + 1 })}
                                </span>
                                {/* 26-03 — Per-set primary input. When the
                                    effective metric is "time", the field
                                    binds to durationBySetSeconds with bounds
                                    5..1800; otherwise it binds to repsBySet
                                    with the existing 0..50 bounds. Tab order
                                    stays row-local: duration/reps → weight
                                    → next-row's duration/reps (the
                                    `data-set-input` value swaps to "duration"
                                    in the time branch; the same
                                    `[data-set-input="weight"]` query below
                                    advances regardless of metric). */}
                                {effectiveMetric === "time" ? (
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    className="h-10"
                                    value={durationValue}
                                    data-set-input="duration"
                                    data-set-key={setKey}
                                    placeholder="60"
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
                                        setSetDurationDraft((prev) => ({ ...prev, [setKey]: "" }));
                                        return;
                                      }
                                      const next = Number(e.target.value);
                                      if (!Number.isFinite(next)) return;
                                      setSetDurationDraft((prev) => ({ ...prev, [setKey]: e.target.value }));
                                    }}
                                    onBlur={() => {
                                      const raw = setDurationDraft[setKey];
                                      if (raw === "") {
                                        setSetDurationDraft((prev) => {
                                          const next = { ...prev };
                                          delete next[setKey];
                                          return next;
                                        });
                                        return;
                                      }
                                      if (raw !== undefined) {
                                        const parsed = Number(raw);
                                        if (Number.isFinite(parsed)) {
                                          // Clamp to schema bounds (5..1800).
                                          const clamped = Math.max(
                                            5,
                                            Math.min(1800, Math.round(parsed)),
                                          );
                                          const current = toFiniteNumberArray(
                                            form.getValues(durationPath),
                                          );
                                          const safeLen = Math.max(
                                            setIdx + 1,
                                            current.length,
                                          );
                                          const filled = Array.from(
                                            { length: safeLen },
                                            (_, i) => {
                                              const v = current[i];
                                              return Number.isFinite(v) ? v : durationFallback;
                                            },
                                          );
                                          filled[setIdx] = clamped;
                                          form.setValue(durationPath, filled, {
                                            shouldDirty: true,
                                          });
                                          // Mirror the exercise-level
                                          // durationSeconds fallback to the
                                          // FIRST row (parallels the reps
                                          // branch above writing
                                          // `exercises.${index}.reps`).
                                          if (setIdx === 0) {
                                            form.setValue(
                                              `exercises.${index}.durationSeconds` as const,
                                              clamped,
                                              { shouldDirty: true },
                                            );
                                          }
                                        }
                                      }
                                      setSetDurationDraft((prev) => {
                                        const next = { ...prev };
                                        delete next[setKey];
                                        return next;
                                      });
                                    }}
                                    aria-label={`Duración serie ${setIdx + 1} en segundos`}
                                  />
                                ) : (
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
                                )}
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  className="h-10"
                                  placeholder={t("setWeightPlaceholder")}
                                  data-set-input="weight"
                                  data-set-key={setKey}
                                  onKeyDown={(e) => {
                                    if (e.key === "Tab" && !e.shiftKey) {
                                      // Same-card next-row reps OR fall
                                      // through to the card's Notes textarea
                                      // when this is the last set row. We
                                      // never let Tab land on the Copy
                                      // button or on the row container
                                      // itself.
                                      const currentRow = e.currentTarget.closest("[data-set-row]");
                                      if (!currentRow) return;
                                      let sibling = currentRow.nextElementSibling;
                                      while (sibling && !sibling.matches("[data-set-row]")) {
                                        sibling = sibling.nextElementSibling;
                                      }
                                      if (sibling) {
                                        // 26-03 — Land on whichever primary
                                        // input the next row exposes: reps
                                        // (reps-based exercises) OR duration
                                        // (time-based). The two selectors
                                        // are mutually exclusive per row.
                                        const nextReps =
                                          sibling.querySelector<HTMLInputElement>(
                                            '[data-set-input="reps"], [data-set-input="duration"]',
                                          );
                                        if (nextReps) {
                                          e.preventDefault();
                                          nextReps.focus();
                                          nextReps.select();
                                          return;
                                        }
                                      }
                                      // Last row → jump to this exercise's
                                      // Notes textarea (data-field-notes is
                                      // unique per card).
                                      const card = currentRow.closest("li") ??
                                        currentRow.closest("[data-exercise-card]")?.parentElement;
                                      const notes = card?.querySelector<HTMLTextAreaElement>(
                                        "[data-field-notes]",
                                      );
                                      if (notes) {
                                        e.preventDefault();
                                        notes.focus();
                                      }
                                    }
                                  }}
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
                                {/* Copy-to-all affordance on Serie 1 — propagates
                                    its current primary value (reps OR duration)
                                    + kg drafts to every subsequent set, then
                                    commits via setValue. 26-03 branches on
                                    effectiveMetric so a plank prescription
                                    propagates `durationSeconds` instead of
                                    `reps`. */}
                                {setIdx === 0 ? (
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    aria-label={
                                      effectiveMetric === "time"
                                        ? t("setCopyToAllDurationAria")
                                        : (t("setCopyToAllAria") ?? "Copiar a todas las series")
                                    }
                                    title={
                                      effectiveMetric === "time"
                                        ? t("setCopyToAllDurationTitle")
                                        : (t("setCopyToAllTitle") ?? "Copiar reps y peso a todas las series")
                                    }
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                                    onClick={() => {
                                      const totalSets = Math.max(
                                        1,
                                        Math.min(
                                          10,
                                          Number(
                                            form.getValues(`exercises.${index}.sets` as const) ?? 1,
                                          ),
                                        ),
                                      );
                                      // Source kg = the just-typed draft if
                                      // present, else the committed value.
                                      const draftKg = setWeightDraft[setKey];
                                      const kgFromForm = toFiniteNumberArray(
                                        form.getValues(weightPath),
                                      );
                                      const kgSource =
                                        draftKg !== undefined && draftKg !== ""
                                          ? Number(draftKg)
                                          : Number.isFinite(kgFromForm[0])
                                            ? kgFromForm[0]
                                            : NaN;

                                      if (effectiveMetric === "time") {
                                        // 26-03 — Time branch: propagate
                                        // durationSeconds (5..1800 clamp) to
                                        // every set; kg stays optional for
                                        // loaded planks.
                                        const draftDuration = setDurationDraft[setKey];
                                        const durationsFromForm = toFiniteNumberArray(
                                          form.getValues(durationPath),
                                        );
                                        const durationSourceRaw =
                                          draftDuration !== undefined && draftDuration !== ""
                                            ? Number(draftDuration)
                                            : Number.isFinite(durationsFromForm[0])
                                              ? durationsFromForm[0]
                                              : Number(
                                                  form.getValues(
                                                    `exercises.${index}.durationSeconds` as const,
                                                  ) ?? 60,
                                                );
                                        const durationSource = Number.isFinite(durationSourceRaw)
                                          ? Math.max(
                                              5,
                                              Math.min(1800, Math.round(durationSourceRaw)),
                                            )
                                          : 60;
                                        const nextDurations = Array.from(
                                          { length: totalSets },
                                          () => durationSource,
                                        );
                                        form.setValue(durationPath, nextDurations, {
                                          shouldDirty: true,
                                        });
                                        form.setValue(
                                          `exercises.${index}.durationSeconds` as const,
                                          durationSource,
                                          { shouldDirty: true },
                                        );
                                      } else {
                                        // Reps branch — unchanged behavior.
                                        const draftReps = setRepsDraft[setKey];
                                        const repsFromForm = toFiniteNumberArray(
                                          form.getValues(repsPath),
                                        );
                                        const repsSource =
                                          draftReps !== undefined && draftReps !== ""
                                            ? Number(draftReps)
                                            : Number.isFinite(repsFromForm[0])
                                              ? repsFromForm[0]
                                              : Number(
                                                  form.getValues(
                                                    `exercises.${index}.reps` as const,
                                                  ) ?? 0,
                                                );
                                        const nextReps = Array.from(
                                          { length: totalSets },
                                          () => (Number.isFinite(repsSource) ? repsSource : 0),
                                        );
                                        form.setValue(repsPath, nextReps, { shouldDirty: true });
                                      }

                                      if (Number.isFinite(kgSource)) {
                                        const nextKg = Array.from(
                                          { length: totalSets },
                                          () => kgSource,
                                        );
                                        form.setValue(weightPath, nextKg, { shouldDirty: true });
                                      }
                                      // Clear any per-row drafts so the
                                      // controlled inputs re-read from form
                                      // state immediately.
                                      setSetRepsDraft({});
                                      setSetWeightDraft({});
                                      setSetDurationDraft({});
                                    }}
                                  >
                                    ⇊
                                  </button>
                                ) : (
                                  <span aria-hidden="true" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <FormDescription>{t("setRowsHint")}</FormDescription>
                      </div>
                      {/* Notes — 260528 reordered before Superset so the Tab
                          flow ends "last Kg → Notas → Grupo superserie →
                          siguiente ejercicio". */}
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
                                data-field-notes
                                {...noteField}
                                value={noteField.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Superset group — shared across all matching exercises.
                        Chips let the trainer reuse existing group letters
                        without retyping them. */}
                    <FormField
                      control={form.control}
                      name={`exercises.${index}.supersetGroup` as const}
                      render={({ field: supersetField }) => (
                        <FormItem>
                          <FormLabel>{t("supersetGroup")}</FormLabel>
                          {supersetGroupOptions.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {supersetGroupOptions.map((group) => {
                                const active = supersetField.value?.trim() === group;
                                return (
                                  <button
                                    key={group}
                                    type="button"
                                    onClick={() => applySupersetGroup(index, group)}
                                    className={cn(
                                      "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                                      active
                                        ? "border-amber-400 bg-amber-400/15 text-amber-700 dark:text-amber-100"
                                        : "border-border/70 bg-background text-foreground hover:border-amber-400/60 hover:text-amber-700 dark:text-amber-100",
                                    )}
                                  >
                                    {group}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                          <FormControl>
                            <Input
                              placeholder={t("supersetGroupPlaceholder")}
                              data-field-superset
                              data-exercise-card={index}
                              onKeyDown={(e) => {
                                if (e.key === "Tab" && !e.shiftKey) {
                                  // Skip exercise-name inputs / drag handles /
                                  // helper buttons and land directly on the
                                  // NEXT exercise card's Sets field.
                                  const root = (e.currentTarget.closest(
                                    "form",
                                  ) ?? document) as ParentNode;
                                  const target = root.querySelector<HTMLInputElement>(
                                    `[data-field-sets="${index + 1}"]`,
                                  );
                                  if (target) {
                                    e.preventDefault();
                                    target.focus();
                                    target.select();
                                  }
                                }
                              }}
                              value={supersetField.value ?? ""}
                              onChange={(e) => {
                                const nextGroup = e.target.value;
                                supersetField.onChange(nextGroup);
                              }}
                              onBlur={() => {
                                supersetField.onBlur();
                                applySupersetGroup(index, supersetField.value ?? "");
                              }}
                            />
                          </FormControl>
                          <FormDescription>{t("supersetGroupHint")}</FormDescription>
                        </FormItem>
                      )}
                    />
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                      <div className="flex items-center gap-2">
                        <FormLabel className="text-amber-700 dark:text-amber-100">
                          {t("transitionRestSeconds")}
                        </FormLabel>
                        <InfoTooltip
                          text={t("transitionRestTooltip")}
                          label={t("transitionRestTooltipLabel")}
                        />
                      </div>
                      <Controller
                        control={form.control}
                        name={`exercises.${index}.transition_rest_seconds` as const}
                        render={({
                          field: numField,
                          fieldState,
                        }) => (
                          <FormItem className="mt-2">
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={transitionRestSecondsDraft[field.id] ?? (numField.value ?? "")}
                                onChange={(e) => {
                                  if (e.target.value === "") {
                                    setTransitionRestSecondsDraft((prev) => ({ ...prev, [field.id]: "" }));
                                    return;
                                  }
                                  const parsed = Number(e.target.value);
                                  if (!Number.isFinite(parsed)) return;
                                  setTransitionRestSecondsDraft((prev) => ({ ...prev, [field.id]: e.target.value }));
                                }}
                                onBlur={() => {
                                  const raw = transitionRestSecondsDraft[field.id];
                                  if (raw === "") {
                                    setTransitionRestSecondsDraft((prev) => {
                                      const next = { ...prev };
                                      delete next[field.id];
                                      return next;
                                    });
                                    numField.onChange(60);
                                    numField.onBlur();
                                    return;
                                  }
                                  if (raw !== undefined) {
                                    const parsed = Number(raw);
                                    if (Number.isFinite(parsed)) {
                                      numField.onChange(parsed);
                                    }
                                  }
                                  setTransitionRestSecondsDraft((prev) => {
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
                  </CardContent>
                </Card>
                    )}
                  </SortableExerciseRow>
                  );
                  })}
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
              triggerClassName="shadow-sm"
            />
            {step === 1 ? (
              <Button type="button" onClick={() => setStep(2)} disabled={!canContinueToDetails} className="ml-auto">
                {t("continueToDetails")}
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
          <Button type="submit" disabled={pending} className="rounded-full">
            {pending ? t("saving") : mode === "create" ? t("createCta") : t("saveCta")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
