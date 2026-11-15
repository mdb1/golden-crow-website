// use-template-form-controller.ts
//
// Everything <TemplateForm> does that is not markup (#507 — split out of the
// 3,000-line component): the RHF form + field array, the input draft buffers,
// the localStorage draft autosave/restore, cancel / exit-keeping-draft, the
// per-set + superset write helpers and the submit. The hooks run in exactly
// the order they did inline, so behaviour is unchanged.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import {
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { hasDistinctTranslation } from "@/components/gc-fitness/localized-field";
import { type SetType, plannedSetType } from "@/lib/gc-fitness/set-type";
import { workoutTemplateSchema, type WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";
import {
  compactSupersetGroupLabelsAfterRemoval,
  getSupersetGroupMemberIndexes,
  getSupersetMembership,
  listSupersetGroupPillLabels,
  normalizeSupersetGroup,
} from "@/lib/gc-fitness/superset-groups";
import type { MuscleHeatmapExercise } from "@/lib/gc-fitness/muscle-heatmap-resolver";
import { useWorkoutTemplates } from "@/lib/gc-fitness/workout-templates-listener";
import { useExercisesQuery } from "@/lib/gc-fitness/exercises-listener";
import { estimateTemplateDurationMinutesFromRaw } from "@/lib/gc-fitness/workout-duration-estimate";
import {
  isStaleDeploymentError,
  reloadOntoCurrentDeployment,
  reportStaleDeployment,
} from "@/lib/gc-fitness/stale-deployment";

import type { TemplateFormProps } from "./types";
import {
  buildDefaults,
  clearDraft,
  collectTemplateTagSuggestions,
  DRAFT_DEBOUNCE_MS,
  normalizeTemplateSubmission,
  readDraft,
  writeDraft,
} from "./template-form-model";

export function useTemplateFormController({
  mode,
  defaultValues,
  onSubmit,
  draftKey,
  onCreated,
  renderExerciseExtras,
  initialShowTranslation,
  pickerInitialFilters,
}: TemplateFormProps) {
  const t = useTranslations("templates.form");
  const tHeatmap = useTranslations("muscleHeatmap");
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
  // Group-level rest drafts for superset blocks, keyed by group LABEL (not
  // field.id) — one editor per block, write-through to every member on commit.
  const [supersetRoundRestDraft, setSupersetRoundRestDraft] = useState<
    Record<string, string>
  >({});
  const [supersetAfterRestDraft, setSupersetAfterRestDraft] = useState<
    Record<string, string>
  >({});
  const [step, setStep] = useState<1 | 2>(1);
  // Coach-language-first: open the translation fields only when the record is
  // already bilingual (edit of a translated template).
  const [showSpanishFields, setShowSpanishFields] = useState(
    initialShowTranslation ??
      (hasDistinctTranslation(defaultValues?.name) ||
        hasDistinctTranslation(defaultValues?.description)),
  );
  const [quickCreated, setQuickCreated] = useState<Array<{ id: string; name: string }>>([]);
  const initialDefaults = buildDefaults(defaultValues, mode);
  const locale = useLocale();
  const esPrimary = locale.startsWith("es");
  const primaryLang = esPrimary ? "es" : "en";
  const otherLang = esPrimary ? "en" : "es";

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
  // #494 — names for the icon buttons' aria-labels and the remove confirm.
  const exerciseNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const ex of exerciseLibrary ?? []) {
      const primary = locale === "es" ? ex.name?.es : ex.name?.en;
      const name = (primary || ex.name?.en || ex.name?.es || "").trim();
      if (name) m.set(ex.id, name);
    }
    return m;
  }, [exerciseLibrary, locale]);
  // 26-09 — exercises authored as "reps without weight" (tracksWeight:false)
  // seed the per-set "Sin peso" sentinel (`weightBySetKg: []`) when dropped
  // into a template, so the trainer doesn't have to toggle it by hand.
  const exerciseNoWeightById = useMemo(() => {
    const s = new Set<string>();
    for (const ex of exerciseLibrary ?? []) {
      if (ex.tracksWeight === false) s.add(ex.id);
    }
    return s;
  }, [exerciseLibrary]);
  const watchedExercises =
    useWatch({ control: form.control, name: "exercises" }) ?? [];
  // Fixed A/B/C pills + any existing labels, and once the highest visible
  // sequence is in use, one extra letter so trainers can keep adding groups.
  const supersetPillLabels = useMemo(
    () => listSupersetGroupPillLabels(watchedExercises),
    [watchedExercises],
  );
  // Live estimated duration (work + rest + per-set setup overhead + transitions),
  // matching the iOS-twin estimator. 0 while no exercises are configured.
  const estimatedDurationMinutes = useMemo(
    () => estimateTemplateDurationMinutesFromRaw(watchedExercises),
    [watchedExercises],
  );
  // #1072 — las dos entradas del heatmap de la rutina, memoizadas: el editor
  // recompone en cada tecla y sin esto cada tecla re-agregaría el entreno.
  //
  // Una fila sin `exerciseId` (la que agrega el botón "Agregar ejercicio",
  // todavía sin elegir) se descarta: no es un ejercicio, es un hueco.
  const heatmapExercises = useMemo(
    () =>
      watchedExercises
        .filter(
          (exercise): exercise is typeof exercise & { exerciseId: string } =>
            typeof exercise?.exerciseId === "string" && exercise.exerciseId.length > 0,
        )
        .map((exercise) => ({
          exerciseId: exercise.exerciseId,
          sets: exercise.sets,
          repsBySet: exercise.repsBySet,
          weightBySetKg: exercise.weightBySetKg,
          durationBySetSeconds: exercise.durationBySetSeconds,
          setTypesBySet: exercise.setTypesBySet,
        })),
    [watchedExercises],
  );
  // La biblioteca entera y no sólo lo elegido: rearmar el mapa en cada tecla
  // sería el trabajo que el `useMemo` de arriba evita, y el agregador ignora
  // las claves que no usa.
  const heatmapExercisesById = useMemo(() => {
    const map: Record<string, MuscleHeatmapExercise> = {};
    for (const exercise of exerciseLibrary ?? []) {
      map[exercise.id] = {
        muscleGroups: exercise.muscleGroups,
        primaryMuscleGroup: exercise.primaryMuscleGroup ?? null,
        secondaryMuscles: exercise.secondaryMuscles ?? [],
      };
    }
    return map;
  }, [exerciseLibrary]);

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
  // Set when the trainer explicitly Cancels (Discard). It short-circuits the
  // unmount + pagehide draft flushes below so an explicit discard isn't
  // immediately re-persisted by the navigation that follows it — that
  // re-write was the bug where Cancel left the changes for the next edit.
  const cancellingRef = useRef(false);
  useEffect(() => {
    if (!draftKey) return;
    const subscription = form.watch((value) => {
      if (cancellingRef.current) return;
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
    // /templates list can surface the draft on the next visit — UNLESS the
    // trainer explicitly Cancelled (then the draft was just cleared and must
    // stay cleared).
    return () => {
      subscription.unsubscribe();
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
        if (!cancellingRef.current) {
          writeDraft(draftKey, form.getValues());
        }
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
      if (cancellingRef.current) return;
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

  // Cancel flow. Explicit Cancel DISCARDS — clears any autosaved draft and
  // navigates away. When there are unsaved changes (dirty this session OR a
  // draft was restored from a prior session) we confirm first so the trainer
  // doesn't lose work by accident.
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // #494 — index of the exercise waiting for "remove?" confirmation.
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const exerciseNameAt = (index: number): string | null => {
    const id = watchedExercises[index]?.exerciseId ?? "";
    return id ? exerciseNameById.get(id) ?? null : null;
  };
  // Icon-button labels carry the exercise name when the library knows it.
  const moveUpLabel = (index: number) => {
    const name = exerciseNameAt(index);
    return name ? t("moveUpNamed", { name }) : t("moveUp");
  };
  const moveDownLabel = (index: number) => {
    const name = exerciseNameAt(index);
    return name ? t("moveDownNamed", { name }) : t("moveDown");
  };
  const removeLabel = (index: number) => {
    const name = exerciseNameAt(index);
    return name ? t("removeExerciseNamed", { name }) : t("removeExercise");
  };
  // An unpicked row has nothing to lose — remove it straight away; anything
  // else asks first (a mis-tap used to drop the exercise and all its sets).
  const requestRemove = (index: number) => {
    if (!watchedExercises[index]?.exerciseId) {
      remove(index);
      return;
    }
    setPendingRemoveIndex(index);
  };

  function performCancel() {
    cancellingRef.current = true;
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (draftKey) clearDraft(draftKey);
    setShowCancelConfirm(false);
    router.back();
  }

  // #1089 — the NON-destructive way out, and the reason the ticket exists.
  // Until now the confirm dialog answered "Cancel" with exactly two options:
  // keep editing, or destroy the work. A trainer who duplicated a routine,
  // swapped a few exercises on the phone and then had to get out had no third
  // answer, so "puse cancelar" meant every change was gone. This one flushes
  // the pending autosave and just navigates: the draft stays on disk and the
  // next visit to this editor restores it.
  //
  // It deliberately does NOT set `cancellingRef` — the unmount flush below is
  // welcome to write the same state again.
  function exitKeepingDraft() {
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (draftKey) writeDraft(draftKey, form.getValues());
    setShowCancelConfirm(false);
    router.back();
  }

  function handleCancelClick() {
    if (form.formState.isDirty || draftRestored) {
      setShowCancelConfirm(true);
      return;
    }
    performCancel();
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
    const rawWeight = form.getValues(weightPath);
    // Distinguish the EXPLICIT "Sin peso" sentinel (`[]`, set by the toggle)
    // from "no weights typed yet" (undefined). Resizing the set count must
    // NEVER fabricate a `[]` from the latter — doing so silently flips the
    // exercise to Sin peso (the "changing Series + Tab switched Arnold Press to
    // Sin peso" bug). `toFiniteNumberArray` collapses both to `[]`, so we read
    // the raw value here to keep the distinction.
    const hasExplicitNoWeight = Array.isArray(rawWeight) && rawWeight.length === 0;
    const currentWeight = toFiniteNumberArray(rawWeight);
    const currentDurations = toFiniteNumberArray(form.getValues(durationPath));

    const nextReps = Array.from({ length: safeSets }, (_, i) => {
      const v = currentReps[i];
      return Number.isFinite(v) ? v : repsFallback;
    });
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
    if (hasExplicitNoWeight) {
      // Preserve the explicit Sin-peso prescription across a set-count change.
      form.setValue(weightPath, [], { shouldDirty: true });
    } else if (currentWeight.length === 0) {
      // No weights entered yet — keep the field undefined (NOT `[]`) so the
      // exercise stays "weight × reps" with an empty weight column.
      form.setValue(weightPath, undefined as unknown as number[], { shouldDirty: true });
    } else {
      form.setValue(weightPath, currentWeight.slice(0, safeSets), { shouldDirty: true });
    }
    if (nextDurations !== undefined) {
      form.setValue(durationPath, nextDurations, { shouldDirty: true });
    }
    // quick-260714-m57 (#403) — keep setTypesBySet aligned with the set
    // count: pad new sets with "normal", truncate removed ones. Only when
    // the trainer already picked a type (never fabricate the field).
    const typesPath = `exercises.${index}.setTypesBySet` as const;
    const currentTypes = form.getValues(typesPath);
    if (Array.isArray(currentTypes) && currentTypes.length > 0) {
      const nextTypes = Array.from({ length: safeSets }, (_, i) =>
        plannedSetType(i, currentTypes),
      );
      form.setValue(typesPath, nextTypes, { shouldDirty: true });
    }
  }

  // quick-260714-m57 (#403) — per-set type picker write. Reads the current
  // array (padded to the set count with "normal"), swaps one entry, writes
  // back. Emission is normalized on submit (field omitted when all-normal).
  function setSetType(index: number, setIdx: number, type: SetType) {
    const typesPath = `exercises.${index}.setTypesBySet` as const;
    const totalSets = Math.max(
      1,
      Math.min(
        10,
        Number(form.getValues(`exercises.${index}.sets` as const) ?? 1),
      ),
    );
    const current = form.getValues(typesPath);
    const next = Array.from(
      { length: Math.max(totalSets, setIdx + 1) },
      (_, i) => plannedSetType(i, current),
    );
    next[setIdx] = type;
    form.setValue(typesPath, next, { shouldDirty: true });
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
    const previousGroup = normalizeSupersetGroup(
      form.getValues(`exercises.${index}.supersetGroup` as const),
    );
    form.setValue(
      `exercises.${index}.supersetGroup` as const,
      nextGroup,
      { shouldDirty: true },
    );
    if (!nextGroup) {
      if (!previousGroup) return;
      const snapshot = watchedExercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, supersetGroup: "" } : exercise,
      );
      if (getSupersetGroupMemberIndexes(snapshot, previousGroup).length >= 2) {
        return;
      }
      const compacted = compactSupersetGroupLabelsAfterRemoval(
        snapshot,
        previousGroup,
      );
      compacted.forEach((exercise, exerciseIndex) => {
        const compactedGroup = normalizeSupersetGroup(exercise.supersetGroup);
        const currentGroup = normalizeSupersetGroup(
          form.getValues(`exercises.${exerciseIndex}.supersetGroup` as const),
        );
        if (compactedGroup !== currentGroup) {
          form.setValue(
            `exercises.${exerciseIndex}.supersetGroup` as const,
            compactedGroup,
            { shouldDirty: true },
          );
        }
      });
      return;
    }

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

  // D9 — tap a pill: assign the exercise to that group, or remove it when the
  // active pill is tapped again.
  function toggleSupersetGroup(index: number, label: string) {
    const current = normalizeSupersetGroup(
      form.getValues(`exercises.${index}.supersetGroup` as const),
    );
    applySupersetGroup(index, current === label ? "" : label);
  }

  // D1/D2 write-through — the single group rest field writes to EVERY member's
  // rest_seconds (round rest) or transition_rest_seconds (after-superset rest).
  function writeSupersetGroupRoundRest(group: string, value: number | undefined) {
    const normalized = normalizeSupersetGroup(group);
    if (!normalized) return;
    for (const memberIndex of getSupersetGroupMemberIndexes(
      watchedExercises,
      normalized,
    )) {
      // Mirrors the per-member rest input, which clears via onChange(undefined);
      // form.setValue types the path as number, so cast to preserve that.
      form.setValue(
        `exercises.${memberIndex}.rest_seconds` as const,
        value as number,
        { shouldDirty: true },
      );
    }
  }

  function writeSupersetGroupAfterRest(group: string, value: number | undefined) {
    const normalized = normalizeSupersetGroup(group);
    if (!normalized) return;
    for (const memberIndex of getSupersetGroupMemberIndexes(
      watchedExercises,
      normalized,
    )) {
      form.setValue(
        `exercises.${memberIndex}.transition_rest_seconds` as const,
        value as number,
        { shouldDirty: true },
      );
    }
  }

  const submit = form.handleSubmit(
    (values) => {
      console.log("[template-form] submit: Zod passed, calling onSubmit prop", values);
      startTransition(async () => {
        try {
          const normalized = normalizeTemplateSubmission(values);
        const result = await onSubmit(normalized);
        // Save succeeded — the in-progress draft is no longer needed.
        if (draftKey) clearDraft(draftKey);
        if (mode === "create" && result?.id) {
          toast.success(t("createdToast"));
          // An embedding flow (e.g. the workout generator) can take over the
          // post-create navigation to show its own success/assign step.
          if (onCreated) {
            onCreated(result.id);
            return;
          }
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
        // The tab is running last deployment's JS: every retry from here
        // fails the same way. Write the draft NOW (the debounced autosave may
        // still be pending) and reload — the mount effect above restores it
        // with the "draft restored" banner, and the coach saves again on the
        // current deployment.
        if (isStaleDeploymentError(err)) {
          if (draftKey) {
            writeDraft(draftKey, form.getValues());
            toast.info(t("staleReloading"));
            if (reloadOntoCurrentDeployment()) return;
          }
          reportStaleDeployment();
          return;
        }
        // Never the raw `err.message`: in production Next redacts a thrown
        // Server Action error to a generic English sentence (#1104), which is
        // what reached the coach as an unexplained "Error".
        toast.error(t("saveFailed"));
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
  // NOTE: the submit button is deliberately NOT gated on a derived "can I
  // submit" flag — gating silently swallowed clicks and left the trainer
  // wondering what was wrong. The click goes through, Zod runs, and errors
  // surface in the inline summary below. #307 deleted the leftover `canSubmit`
  // that computed such a flag and was read by nothing: "Continue" gates on
  // `canContinueToDetails`, submit gates on `pending` alone.

  // Aggregate every distinct tag across the trainer's existing templates so
  // the picker below can surface them as one-click suggestions. The hook
  // is the same one the /templates list uses, so the call is shared cache.
  const { data: tagSourceTemplates } = useWorkoutTemplates();
  const existingTagSuggestions = useMemo(
    () => collectTemplateTagSuggestions(tagSourceTemplates),
    [tagSourceTemplates],
  );
  // Flatten RHF errors into a human-readable list shown near the submit
  // button after a failed submit attempt.
  const submitErrorMessages = useMemo(() => {
    const out: string[] = [];
    const errs = form.formState.errors;
    // Collapse the per-language name errors into ONE localized line — the
    // schema-required language may be the hidden mirror, so showing the raw
    // "Name in English is required." is confusing for a Spanish coach.
    if (errs.name?.en?.message || errs.name?.es?.message) {
      out.push(t("nameRequired"));
    }
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
        // 26-09 — seed the "Sin peso" sentinel for bodyweight exercises so the
        // weight column starts hidden (the trainer can still flip it per row).
        ...(exerciseNoWeightById.has(exerciseId)
          ? { weightBySetKg: [] as number[] }
          : {}),
      })),
    );
  }

  return {
    mode,
    defaultValues,
    onSubmit,
    draftKey,
    onCreated,
    renderExerciseExtras,
    initialShowTranslation,
    pickerInitialFilters,
    pending,
    startTransition,
    draftRestored,
    setDraftRestored,
    setsDraft,
    setSetsDraft,
    setRepsDraft,
    setSetRepsDraft,
    setWeightDraft,
    setSetWeightDraft,
    setDurationDraft,
    setSetDurationDraft,
    durationSecondsDraft,
    setDurationSecondsDraft,
    restSecondsDraft,
    setRestSecondsDraft,
    transitionRestSecondsDraft,
    setTransitionRestSecondsDraft,
    supersetRoundRestDraft,
    setSupersetRoundRestDraft,
    supersetAfterRestDraft,
    setSupersetAfterRestDraft,
    step,
    setStep,
    showSpanishFields,
    setShowSpanishFields,
    quickCreated,
    setQuickCreated,
    showCancelConfirm,
    setShowCancelConfirm,
    pendingRemoveIndex,
    setPendingRemoveIndex,
    fields,
    append,
    remove,
    move,
    exerciseLibrary,
    tagSourceTemplates,
    t,
    tHeatmap,
    router,
    initialDefaults,
    locale,
    esPrimary,
    primaryLang,
    otherLang,
    form,
    exerciseMetricById,
    exerciseNameById,
    exerciseNoWeightById,
    watchedExercises,
    supersetPillLabels,
    estimatedDurationMinutes,
    heatmapExercises,
    heatmapExercisesById,
    draftTimerRef,
    cancellingRef,
    exerciseNameAt,
    moveUpLabel,
    moveDownLabel,
    removeLabel,
    requestRemove,
    sensors,
    handleDragEnd,
    submit,
    hasUnselectedExercises,
    canContinueToDetails,
    existingTagSuggestions,
    submitErrorMessages,
    discardDraft,
    performCancel,
    exitKeepingDraft,
    handleCancelClick,
    toFiniteNumberArray,
    syncSetArrays,
    setSetType,
    syncSupersetGroupSets,
    applySupersetGroup,
    toggleSupersetGroup,
    writeSupersetGroupRoundRest,
    writeSupersetGroupAfterRest,
    appendExercise,
    appendExercises,
  } as const;
}

export type TemplateFormController = ReturnType<typeof useTemplateFormController>;
