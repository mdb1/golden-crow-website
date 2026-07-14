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
import { useTranslations, useLocale } from "next-intl";
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
import {
  LocalizedTextField,
  mirrorLocalizedBlank,
  hasDistinctTranslation,
} from "@/components/gc-fitness/localized-field";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// quick-260714-m57 (#403) — Hevy-style per-set types (normal / warm-up /
// failure / drop set). TS twin helpers of iOS SetType.swift; the picker
// writes `setTypesBySet` next to repsBySet / weightBySetKg.
import {
  SET_TYPES,
  type SetType,
  isSetType,
  plannedSetType,
  setDisplayLabels,
  SET_TYPE_LETTERS,
  SET_TYPE_LABELS_ES,
  SET_TYPE_TEXT_CLASS,
} from "@/lib/gc-fitness/set-type";

import {
  workoutTemplateSchema,
  type WorkoutTemplateInput,
} from "@/lib/gc-fitness/workout-template-schema";
import {
  getSupersetGroupMemberIndexes,
  getSupersetGroupRest,
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

/**
 * Per-label accent classes for superset group borders/pills (D9). Reuses the
 * live-run violet pattern family and rotates through a small palette so adjacent
 * blocks (A/B/C) read as distinct groups. Falls back to violet for any label
 * outside the palette.
 */
const SUPERSET_ACCENTS: {
  card: string;
  badge: string;
  pillActive: string;
}[] = [
  {
    card: "border-violet-500/40 bg-violet-500/5",
    badge: "bg-violet-500/20 text-violet-700 dark:text-violet-100",
    pillActive: "border-violet-400 bg-violet-400/15 text-violet-700 dark:text-violet-100",
  },
  {
    card: "border-sky-500/40 bg-sky-500/5",
    badge: "bg-sky-500/20 text-sky-700 dark:text-sky-100",
    pillActive: "border-sky-400 bg-sky-400/15 text-sky-700 dark:text-sky-100",
  },
  {
    card: "border-emerald-500/40 bg-emerald-500/5",
    badge: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-100",
    pillActive: "border-emerald-400 bg-emerald-400/15 text-emerald-700 dark:text-emerald-100",
  },
];

function supersetAccentFor(label: string): (typeof SUPERSET_ACCENTS)[number] {
  const trimmed = label.trim().toUpperCase();
  // A→0, B→1, C→2; any other label hashes into the palette.
  const code = trimmed.charCodeAt(0);
  const idx = Number.isFinite(code)
    ? (code - 65 + SUPERSET_ACCENTS.length * 100) % SUPERSET_ACCENTS.length
    : 0;
  return SUPERSET_ACCENTS[idx] ?? SUPERSET_ACCENTS[0];
}

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
  /**
   * Optional create-mode hook. When provided, a successful CREATE calls this
   * with the new template id INSTEAD of the default `router.back()` navigation
   * — letting an embedding flow (e.g. the workout generator) keep the form on
   * screen and transition to its own success/assign step. No effect in edit
   * mode. Backwards-compatible: when omitted, create navigates back as before.
   */
  onCreated?: (id: string) => void;
  /**
   * Optional per-exercise extras rendered UNDER each exercise row in the
   * "pick exercises" step. The workout generator uses this to render
   * replacement pills (the normal create/edit flow passes nothing, so the
   * layout is unchanged). `onReplace` swaps the row's exercise id.
   */
  renderExerciseExtras?: (ctx: {
    index: number;
    exerciseId: string;
    allExerciseIds: string[];
    onReplace: (exerciseId: string) => void;
  }) => React.ReactNode;
  /**
   * Force the initial collapsed/expanded state of the translation fields,
   * overriding the default "expand when the record is already bilingual" rule.
   * The workout generator pre-fills BOTH languages of the name, which would
   * otherwise auto-expand both panes; passing `false` keeps the coach-language-
   * first single field (with the "add translation" toggle) like every other
   * create flow. The pre-filled other-language value is preserved until edited.
   */
  initialShowTranslation?: boolean;
  /**
   * Optional initial muscle/equipment filters for the per-exercise picker
   * popover. The workout generator passes the routine's selected equipment +
   * muscle groups so swapping an exercise opens the picker already scoped to
   * the same filters (issue #361). Omitted in the normal create/edit flow →
   * the picker opens unfiltered as before.
   */
  pickerInitialFilters?: { muscles?: string[]; equipment?: string[] };
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
  return (exercises ?? []).map((exercise) => {
    const next: Record<string, unknown> = {
      ...exercise,
      transition_rest_seconds:
        typeof exercise.transition_rest_seconds === "number"
          ? exercise.transition_rest_seconds
          : 60,
    };
    // quick-260714-m57 (#403) — sanitize per-set types on LOAD: keep only
    // known wire strings ("normal"/"warmup"/"failure"/"dropset") so the
    // submit-time Zod enum can't reject a stale/foreign doc. All-normal (or
    // fully-invalid) arrays are dropped entirely — the wire contract omits
    // the field when nothing is non-normal.
    const rawTypes = (exercise as { setTypesBySet?: unknown }).setTypesBySet;
    if (Array.isArray(rawTypes)) {
      // POSITIONAL coercion (never filter — dropping an entry would shift
      // every later set's type to the wrong row).
      const clean = rawTypes.map((t): SetType => (isSetType(t) ? t : "normal"));
      if (clean.some((t) => t !== "normal")) {
        next.setTypesBySet = clean;
      } else {
        delete next.setTypesBySet;
      }
    }
    return next;
  }) as WorkoutTemplateInput["exercises"];
}

function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${key}`);
  } catch {
    /* ignore */
  }
}

/**
 * The per-set weight array after a trainer CLEARS the weight field of set
 * `setIdx`. Clearing means "0 kg for this set" — it MUST NOT collapse the
 * array to `[]`, because an empty `weightBySetKg: []` is the reserved "Sin
 * peso" (reps-only) sentinel set exclusively by the explicit toggle. The
 * previous `current.slice(0, setIdx)` truncated set 1 (setIdx 0) to `[]`, so
 * a trainer who typed reps×weight then cleared the weight had the exercise
 * silently saved as reps-only (the Front Raise bug). This zero-fills the
 * cleared slot and keeps the array length aligned so the weight column lives.
 */
export function weightArrayAfterClear(
  current: number[],
  setIdx: number,
): number[] {
  const safeLen = Math.max(setIdx + 1, current.length);
  const out = Array.from({ length: safeLen }, (_, i) =>
    Number.isFinite(current[i]) ? current[i] : 0,
  );
  out[setIdx] = 0;
  return out;
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
    // Mirror a single-language record into both languages on LOAD so the
    // coach always sees existing content in their own language (an English-
    // only template must not render an empty Spanish field). Save-time
    // `mirrorLocalizedBlank` already does this on write; doing it on read
    // keeps the form consistent. Both-blank (create) stays both-blank.
    name: mirrorLocalizedBlank({
      en: passed?.name?.en ?? "",
      es: passed?.name?.es ?? "",
    }),
    description: mirrorLocalizedBlank(passed?.description ?? { en: "", es: "" }),
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
  onCreated,
  renderExerciseExtras,
  initialShowTranslation,
  pickerInitialFilters,
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
  const watchedExercises = form.watch("exercises") ?? [];
  const supersetGroupOptions = useMemo(
    () => listSupersetGroupOptions(watchedExercises),
    [watchedExercises],
  );
  // Fixed A/B/C pills + any legacy labels already in use beyond A-C (rendered as
  // their own pills so existing docs stay editable). D9.
  const supersetPillLabels = useMemo(() => {
    const fixed = ["A", "B", "C"];
    const extras = supersetGroupOptions.filter((g) => !fixed.includes(g));
    return [...fixed, ...extras];
  }, [supersetGroupOptions]);
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
          // Recompute `order` to be 1-based contiguous before submit — the
          // Firestore rule layer (P04-02) asserts `order == arrayIndex + 1`.
          // Mirror tags[0] back onto the legacy `tag` field so the iOS
          // clients reading the old field stay working until they migrate.
          const tagsClean = values.tags.length > 0
            ? values.tags
            : [values.tag || "custom"];
          const normalized: WorkoutTemplateInput = {
          ...values,
          // "No translation" ⇒ store the coach's text in every language.
          name: mirrorLocalizedBlank(values.name),
          description: mirrorLocalizedBlank(values.description),
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
            // 260610-j67 (issue #159) — the no-weight sentinel. An EXPLICIT
            // empty array `weightBySetKg: []` is the intentional "Sin peso" /
            // reps-only prescription (twin of iOS
            // ExerciseRef.hasExplicitNoWeightPrescription). It MUST survive
            // serialization as a length-0 array. When the toggle is OFF, an
            // empty UI field means "weight x reps with 0kg", so we emit a
            // zero-filled array instead of dropping the field.
            const hasExplicitNoWeight =
              Array.isArray(ex.weightBySetKg) && ex.weightBySetKg.length === 0;
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
            const alignedWeights = hasExplicitNoWeight
              ? []
              : Array.from({ length: canonicalLen }, (_, i) =>
                  Number.isFinite(cleanedWeights[i]) ? cleanedWeights[i] : 0,
                );
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
            // quick-260714-m57 (#403) — align per-set types to canonicalLen
            // (pad "normal", truncate) like reps/weights above. The field is
            // persisted ONLY when some entry is non-normal (wire contract:
            // writers omit all-normal arrays). On update the whole
            // `exercises` array is replaced, so omission also CLEARS stale
            // types on Firestore.
            const cleanedTypes: SetType[] = Array.isArray(ex.setTypesBySet)
              ? ex.setTypesBySet.map((t): SetType =>
                  isSetType(t) ? t : "normal",
                )
              : [];
            const alignedTypes = Array.from(
              { length: canonicalLen },
              (_, i): SetType => cleanedTypes[i] ?? "normal",
            );
            const hasNonNormalTypes = alignedTypes.some((t) => t !== "normal");
            const normalizedExercise: WorkoutTemplateInput["exercises"][number] = {
              ...ex,
              sets: canonicalLen,
              reps: alignedReps[0] ?? repsFallback,
              transition_rest_seconds:
                typeof ex.transition_rest_seconds === "number"
                  ? ex.transition_rest_seconds
                  : 60,
              ...(alignedReps.length > 0 ? { repsBySet: alignedReps } : {}),
              // 260610-j67 — preserve the no-weight sentinel verbatim: an
              // explicit "Sin peso" exercise emits `weightBySetKg: []`
              // (NEVER coerced to undefined). Otherwise the UI keeps the
              // weight-based structure alive with zero-filled kg values.
              ...(hasExplicitNoWeight
                ? { weightBySetKg: [] }
                : { weightBySetKg: alignedWeights }),
              ...(alignedDurations
                ? { durationBySetSeconds: alignedDurations }
                : {}),
              ...(ex.supersetGroup?.trim()
                ? { supersetGroup: ex.supersetGroup.trim() }
                : {}),
              order: idx + 1,
            };
            if (hasNonNormalTypes) {
              normalizedExercise.setTypesBySet = alignedTypes;
            } else {
              // NEVER leave the key as `undefined` — the Admin SDK rejects
              // undefined values ("Cannot use 'undefined' as a Firestore
              // value"); deleting the key omits it from the payload.
              delete normalizedExercise.setTypesBySet;
            }
            return normalizedExercise;
          }),
        };
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
        {/* Single top-right translation toggle for the whole form. While
            hidden, localized fields show just the coach-language input (no
            "(language)" suffix); revealing it adds the qualifiers + secondary
            inputs. */}
        {!showSpanishFields ? (
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setShowSpanishFields(true)}
            >
              {t("addTranslation")}
            </Button>
          </div>
        ) : null}

        {/* Name — coach language first; optional translation. */}
        <LocalizedTextField
          form={form}
          base="name"
          primaryLang={primaryLang}
          otherLang={otherLang}
          showTranslation={showSpanishFields}
          plainLabel={t("nameLabel")}
          primaryLabel={esPrimary ? t("nameEs") : t("nameEn")}
          otherLabel={esPrimary ? t("nameEn") : t("nameEs")}
          placeholder={esPrimary ? t("namePlaceholderEs") : t("namePlaceholderEn")}
          requiredMessage={t("nameRequired")}
        />

        {/* Description — coach language first; optional translation. */}
        <LocalizedTextField
          form={form}
          base="description"
          primaryLang={primaryLang}
          otherLang={otherLang}
          showTranslation={showSpanishFields}
          plainLabel={t("descriptionLabel")}
          primaryLabel={esPrimary ? t("descriptionEs") : t("descriptionEn")}
          otherLabel={esPrimary ? t("descriptionEn") : t("descriptionEs")}
          placeholder={
            esPrimary
              ? t("descriptionPlaceholderEs")
              : t("descriptionPlaceholderEn")
          }
          multiline
          rows={3}
        />

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
                <li key={field.id} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">{t("exerciseNumber", { index: index + 1 })}</p>
                      <div className="mt-1">
                        <ExercisePickerPopover
                          value={form.getValues(`exercises.${index}.exerciseId` as const) ?? ""}
                          onChange={(value) => {
                            form.setValue(`exercises.${index}.exerciseId` as const, value, { shouldDirty: true });
                            // 26-09 — picking a bodyweight exercise seeds the
                            // "Sin peso" sentinel so the weight column starts
                            // hidden (matching the exercise's authoring default).
                            if (exerciseNoWeightById.has(value)) {
                              form.setValue(
                                `exercises.${index}.weightBySetKg` as const,
                                [],
                                { shouldDirty: true },
                              );
                            }
                          }}
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
                  </div>
                  {/* Generator-only replacement pills (no-op in the normal flow). */}
                  {renderExerciseExtras
                    ? renderExerciseExtras({
                        index,
                        exerciseId: watchedExercises[index]?.exerciseId ?? "",
                        allExerciseIds: watchedExercises
                          .map((e) => e?.exerciseId ?? "")
                          .filter((id): id is string => Boolean(id)),
                        onReplace: (value) =>
                          form.setValue(`exercises.${index}.exerciseId` as const, value, {
                            shouldDirty: true,
                          }),
                      })
                    : null}
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
                  // 260610-j67 (issue #159) — no-weight ("Sin peso") state.
                  // An EXPLICIT empty `weightBySetKg: []` array is the
                  // reps-only sentinel; nil/array-with-values = legacy kg UI.
                  const watchedWeightBySet = form.watch(
                    `exercises.${index}.weightBySetKg` as const,
                  );
                  const isNoWeight =
                    Array.isArray(watchedWeightBySet) &&
                    watchedWeightBySet.length === 0;
                  const supersetMembership = getSupersetMembership(
                    watchedExercises,
                    index,
                  );
                  const supersetGroup = supersetMembership.group;
                  const isSupersetLeader = supersetMembership.isLeader;
                  const isSupersetFollower = supersetMembership.isFollower;
                  // D9 — a REAL superset (2+ members). Only then do we hide the
                  // per-member rest inputs and surface the single group rest
                  // fields (on the leader). A lone labelled exercise keeps its
                  // own per-exercise rest fields.
                  const isSupersetMember = supersetMembership.isGrouped;
                  const supersetAccent = supersetGroup
                    ? supersetAccentFor(supersetGroup)
                    : null;
                  const groupRest = isSupersetMember
                    ? getSupersetGroupRest(watchedExercises, supersetGroup)
                    : null;
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
                <Card
                  className={cn(
                    isSupersetMember && supersetAccent
                      ? cn("border-l-4", supersetAccent.card)
                      : undefined,
                  )}
                >
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
                        {isSupersetMember && supersetGroup && supersetAccent ? (
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                              supersetAccent.badge,
                            )}
                          >
                            {t("supersetBlockLabel", { group: supersetGroup })}
                          </span>
                        ) : null}
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
                              initialFilters={pickerInitialFilters}
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
                      {/* 260610-j67 (issue #159) — "Sin peso" toggle. When
                          ON, writes `weightBySetKg: []` (the reps-only
                          sentinel) and hides the per-set kg column below.
                          Orthogonal to reps/time metric. When OFF, restores
                          the legacy kg column (weightBySetKg cleared to a
                          length-0 slice = undefined on submit). */}
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-pressed={isNoWeight}
                        onClick={() => {
                          const weightPath =
                            `exercises.${index}.weightBySetKg` as const;
                          if (isNoWeight) {
                            // Turn OFF → clear the sentinel to `undefined`
                            // (legacy "no override") so the kg column returns
                            // and submit omits the field unless weights are
                            // typed. setValue(undefined) drops the array.
                            form.setValue(
                              weightPath,
                              undefined as unknown as number[],
                              { shouldDirty: true },
                            );
                          } else {
                            // Turn ON → write the explicit empty-array
                            // sentinel (`weightBySetKg: []`) + hide the kg
                            // column. This is the reps-only prescription.
                            form.setValue(weightPath, [], {
                              shouldDirty: true,
                            });
                          }
                        }}
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium",
                          isNoWeight
                            ? "border-foreground bg-foreground text-background"
                            : "border-border/70 bg-background text-foreground hover:border-foreground/30",
                        )}
                      >
                        {t("noWeightToggle")}
                      </button>
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
                      {/* D9 — superset members hide the per-exercise rest input;
                          the single group rest lives on the leader below. */}
                      {isSupersetMember ? null : (
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
                      )}
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
                          {/* 260610-j67 — when "Sin peso" is on, collapse the
                              weight column out of the header grid entirely so
                              the layout reads as two columns (set + reps). */}
                          <div
                            className={cn(
                              "grid items-center gap-2 px-1",
                              isNoWeight
                                ? "grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[84px_minmax(140px,1fr)]"
                                : "grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[84px_minmax(140px,1fr)_minmax(140px,1fr)]",
                            )}
                          >
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {t("setHeader")}
                            </span>
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {effectiveMetric === "time" ? t("secondsHeader") : t("reps")}
                            </span>
                            {!isNoWeight ? (
                              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {t("weightKgShort")}
                              </span>
                            ) : null}
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
                            // quick-260714-m57 (#403) — Hevy-style per-set
                            // type. Non-normal rows render the colored letter
                            // (W/F/D); normal rows render a number counting
                            // ONLY normal sets (preceding rows decide it, so
                            // slicing to setIdx+1 is sufficient).
                            const typesRaw = form.getValues(
                              `exercises.${index}.setTypesBySet` as const,
                            );
                            const rowType = plannedSetType(setIdx, typesRaw);
                            const rowLabel = setDisplayLabels(
                              Array.from({ length: setIdx + 1 }, (_, i) =>
                                plannedSetType(i, typesRaw),
                              ),
                            )[setIdx];

                            return (
                              <div
                                key={`${field.id}-set-${setIdx + 1}`}
                                data-set-row={setKey}
                                data-set-idx={setIdx}
                                className={cn(
                                  "grid items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2",
                                  // 260610-j67 — drop the weight column from
                                  // the set-row grid when "Sin peso" is on.
                                  isNoWeight
                                    ? "grid-cols-[52px_minmax(0,1fr)_28px] sm:grid-cols-[84px_minmax(140px,1fr)_28px]"
                                    : "grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)_28px] sm:grid-cols-[84px_minmax(140px,1fr)_minmax(140px,1fr)_28px]",
                                )}
                              >
                                {/* quick-260714-m57 (#403) — the set-number
                                    cell is the type picker trigger: Normal /
                                    Calentamiento (W) / Al fallo (F) / Drop
                                    set (D). */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      tabIndex={-1}
                                      aria-label={`Tipo de la serie ${setIdx + 1}: ${SET_TYPE_LABELS_ES[rowType]}`}
                                      title="Cambiar tipo de serie"
                                      className={cn(
                                        "inline-flex h-8 items-center justify-start rounded-md px-1 text-xs hover:bg-muted",
                                        rowType === "normal"
                                          ? "text-muted-foreground"
                                          : cn(
                                              "font-bold",
                                              SET_TYPE_TEXT_CLASS[rowType],
                                            ),
                                      )}
                                    >
                                      {rowType === "normal"
                                        ? t("setNumber", {
                                            count: Number(rowLabel),
                                          })
                                        : rowLabel}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start">
                                    {SET_TYPES.map((type) => (
                                      <DropdownMenuItem
                                        key={type}
                                        onSelect={() =>
                                          setSetType(index, setIdx, type)
                                        }
                                        className={cn(
                                          "gap-2",
                                          type === rowType && "bg-muted",
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "w-4 text-center font-semibold",
                                            SET_TYPE_TEXT_CLASS[type],
                                          )}
                                        >
                                          {SET_TYPE_LETTERS[type] ?? "#"}
                                        </span>
                                        {SET_TYPE_LABELS_ES[type]}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
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
                                {/* 260610-j67 — hide the per-set kg Input
                                    entirely when "Sin peso" is on. */}
                                {!isNoWeight ? (
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
                                      // Clearing a per-set weight = "0 kg for
                                      // this set", NEVER the no-weight sentinel
                                      // (`[]`, reserved for the explicit "Sin
                                      // peso" toggle). See weightArrayAfterClear.
                                      const zeroed = weightArrayAfterClear(current, setIdx);
                                      form.setValue(weightPath, zeroed, { shouldDirty: true });
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
                                ) : null}
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

                    {/* D9 — superset LEADER shows the single group rest editor:
                        one "round rest" + one "after-superset rest" field, both
                        written through to every member (D1/D2). Members hide
                        their per-exercise rest fields entirely. */}
                    {isSupersetMember && isSupersetLeader && supersetAccent ? (
                      <div
                        className={cn(
                          "rounded-lg border p-3",
                          supersetAccent.card,
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                              supersetAccent.badge,
                            )}
                          >
                            {t("supersetBlockLabel", { group: supersetGroup })}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <FormItem>
                            <FormLabel>{t("supersetRoundRest")}</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={
                                  supersetRoundRestDraft[supersetGroup] ??
                                  (groupRest?.roundRestSeconds ?? "")
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v !== "" && !Number.isFinite(Number(v))) return;
                                  setSupersetRoundRestDraft((prev) => ({
                                    ...prev,
                                    [supersetGroup]: v,
                                  }));
                                }}
                                onBlur={() => {
                                  const raw = supersetRoundRestDraft[supersetGroup];
                                  if (raw !== undefined) {
                                    const parsed = raw === "" ? undefined : Number(raw);
                                    if (parsed === undefined || Number.isFinite(parsed)) {
                                      writeSupersetGroupRoundRest(supersetGroup, parsed);
                                    }
                                    setSupersetRoundRestDraft((prev) => {
                                      const next = { ...prev };
                                      delete next[supersetGroup];
                                      return next;
                                    });
                                  }
                                }}
                              />
                            </FormControl>
                            <FormDescription>
                              {t("supersetRoundRestHint")}
                            </FormDescription>
                          </FormItem>
                          <FormItem>
                            <div className="flex items-center gap-2">
                              <FormLabel>{t("supersetAfterRest")}</FormLabel>
                              <InfoTooltip
                                text={t("transitionRestTooltip")}
                                label={t("transitionRestTooltipLabel")}
                              />
                            </div>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={
                                  supersetAfterRestDraft[supersetGroup] ??
                                  (groupRest?.afterRestSeconds ?? "")
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v !== "" && !Number.isFinite(Number(v))) return;
                                  setSupersetAfterRestDraft((prev) => ({
                                    ...prev,
                                    [supersetGroup]: v,
                                  }));
                                }}
                                onBlur={() => {
                                  const raw = supersetAfterRestDraft[supersetGroup];
                                  if (raw !== undefined) {
                                    const parsed = raw === "" ? 60 : Number(raw);
                                    if (Number.isFinite(parsed)) {
                                      writeSupersetGroupAfterRest(supersetGroup, parsed);
                                    }
                                    setSupersetAfterRestDraft((prev) => {
                                      const next = { ...prev };
                                      delete next[supersetGroup];
                                      return next;
                                    });
                                  }
                                }}
                              />
                            </FormControl>
                            <FormDescription>
                              {t("supersetAfterRestHint")}
                            </FormDescription>
                          </FormItem>
                        </div>
                      </div>
                    ) : null}

                    {/* Transition rest sits below the coach notes — the client
                        sees it after finishing this exercise. Standalone (and
                        lone-labelled) exercises only; superset members edit rest
                        at the group level above. */}
                    {isSupersetMember ? null : (
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
                    )}

                    {/* D9 — fixed A/B/C group pills (plus any legacy label
                        already in use). Tap a pill to assign the exercise to
                        that superset; tap the active pill to remove it. Writes
                        through applySupersetGroup (set-count locking preserved). */}
                    <FormField
                      control={form.control}
                      name={`exercises.${index}.supersetGroup` as const}
                      render={({ field: supersetField }) => {
                        const activeGroup = normalizeSupersetGroup(
                          supersetField.value,
                        );
                        return (
                          <FormItem>
                            <FormLabel>{t("supersetGroup")}</FormLabel>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {supersetPillLabels.map((group) => {
                                const active = activeGroup === group;
                                const accent = supersetAccentFor(group);
                                return (
                                  <button
                                    key={group}
                                    type="button"
                                    data-field-superset
                                    data-exercise-card={index}
                                    aria-pressed={active}
                                    onClick={() => toggleSupersetGroup(index, group)}
                                    className={cn(
                                      "inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                                      active
                                        ? accent.pillActive
                                        : "border-border/70 bg-background text-foreground hover:border-foreground/40",
                                    )}
                                  >
                                    {group}
                                  </button>
                                );
                              })}
                            </div>
                            <FormDescription>{t("supersetGroupHint")}</FormDescription>
                          </FormItem>
                        );
                      }}
                    />
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
            onClick={handleCancelClick}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={pending} className="rounded-full">
            {pending ? t("saving") : mode === "create" ? t("createCta") : t("saveCta")}
          </Button>
        </div>
      </form>

      {/* Unsaved-changes guard — explicit Cancel discards the autosaved draft,
          so confirm before throwing away in-progress edits. */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("discardDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("discardDialogBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("discardDialogKeepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={performCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("discardDialogConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}
