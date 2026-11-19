// template-form-model.ts
//
// The pure half of <TemplateForm> (#507 — split out of the 3,000-line
// component): defaults / draft restore, the localStorage draft, the "clear a
// weight" rule and the submit normalization. No React — unit tested in
// __tests__/template-form-model.test.ts. Moved verbatim.

import { mirrorLocalizedBlank } from "@/components/gc-fitness/localized-field";
import { type SetType, isSetType } from "@/lib/gc-fitness/set-type";
import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";

import type { TemplateFormMode } from "./types";

export const DRAFT_STORAGE_PREFIX = "gc-fitness:template-draft:";

export const DRAFT_DEBOUNCE_MS = 500;

export function readDraft(key: string): Partial<WorkoutTemplateInput> | null {
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

export function writeDraft(key: string, value: WorkoutTemplateInput) {
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

export function withTransitionRestDefault(
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

export function clearDraft(key: string) {
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

export function buildDefaults(
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

/**
 * Zod-parsed form values → the payload the Server Action receives.
 *
 * Recomputes `order` (1-based, contiguous — the rules assert it), mirrors
 * tags[0] onto the legacy `tag`, mirrors a blank translation, and aligns every
 * exercise's sets / repsBySet / weightBySetKg / durationBySetSeconds /
 * setTypesBySet around ONE canonical length (the "sets=1 but
 * weightBySetKg=[24,24,23]" desync). The explicit "Sin peso" sentinel
 * (`weightBySetKg: []`) survives verbatim.
 */
export function normalizeTemplateSubmission(
  values: WorkoutTemplateInput,
): WorkoutTemplateInput {
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
        // #307 — `supersetGroup` rides along in `...ex` and STAYS as
        // whatever the form holds, `""` included. There used to be a
        // conditional spread here that read like an omission and was
        // not one: a spread can only ADD a key, and `...ex` had already
        // put it there (contrast `setTypesBySet` below, which omits for
        // real with `delete`). Its `.trim()` was equally inert — `values`
        // is post-Zod and the schema trims this field.
        //
        // The blank stays a blank ON PURPOSE, not by accident: `""` is a
        // legal Firestore value (only `undefined` throws) and all three
        // readers go through `normalizeSupersetGroup` + truthiness, so an
        // empty label is "no group" on every surface. Pinned by
        // template-form-save.test.tsx → "emits '' for a blank group".
        order: idx + 1,
      };
      // gc-fitness #1649 — cardio distance targets (meters). Kept only when
      // the row tracks distance (array present) AND is not explicitly reps;
      // trailing "no target" zeros are trimmed so `[]` = tracked, no targets.
      const distance = normalizeDistanceBySetMeters(
        ex.distanceBySetMeters,
        canonicalLen,
      );
      if (distance && ex.metric !== "reps") {
        normalizedExercise.distanceBySetMeters = distance;
      } else {
        delete normalizedExercise.distanceBySetMeters;
      }
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
  return normalized;
}

/**
 * gc-fitness #1649 — `distanceBySetMeters` as saved: null when distance is not
 * tracked (field absent); otherwise whole meters 0…1 000 000 truncated to the set
 * count with trailing zeros (= "no target") trimmed, so `[]` means "tracked, no
 * targets". Non-finite entries become 0 (positional, like set types).
 */
export function normalizeDistanceBySetMeters(
  raw: unknown,
  setCount: number,
): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.slice(0, Math.max(0, setCount)).map((v) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(1_000_000, Math.max(0, Math.round(v)))
      : 0,
  );
  while (out.length > 0 && out[out.length - 1] === 0) out.pop();
  return out;
}

/** Every distinct tag across the trainer's templates (legacy `tag` included). */
export function collectTemplateTagSuggestions(
  tagSourceTemplates: ReadonlyArray<{ tags?: unknown; tag?: unknown }> | undefined,
): string[] {
  if (!tagSourceTemplates) return [];
  const out = new Set<string>();
  for (const tpl of tagSourceTemplates) {
    if (Array.isArray(tpl.tags)) {
      for (const t of tpl.tags as Array<string | null | undefined>) {
        const trimmed = (t ?? "").trim();
        if (trimmed) out.add(trimmed);
      }
    }
    if (tpl.tag && typeof tpl.tag === "string" && tpl.tag.trim()) {
      out.add(tpl.tag.trim());
    }
  }
  return Array.from(out);
}
