// exercise-row.ts
//
// THE WIRE SHAPE OF AN EXERCISE, and the two pure functions that produce it.
// Firebase-free ON PURPOSE: this module is imported from BOTH sides of the
// Server Action boundary — the `"use server"` reader (`exercise-list-actions.ts`,
// Admin SDK) and the `"use client"` React-Query hook (`exercises-listener.ts`).
// Importing `firebase/firestore` or `firebase-admin` here would drag one of
// those SDKs into the wrong bundle.
//
// HISTORY / WHY IT EXISTS (#1104): until 2026-09-15 this lived inside
// `exercises-listener.ts`, which read the `exercises` collection with the
// BROWSER Firestore SDK. That made the exercise library the ONE surface in the
// whole backoffice that needed a live Firebase-Auth session INSIDE the browser
// (every other read goes through a Server Action authenticated by the
// `GcFitnessAuthToken` cookie). Privacy browsers — Brave on mobile above all —
// partition or evict the IndexedDB where the Auth SDK persists that session, so
// `auth.currentUser` came back `null` and:
//
//   1. `firestore.rules` denies the read outright (`allow read: if isSignedIn()`),
//      which is the "No se pudieron cargar los ejercicios" the coach saw; and
//   2. even had it succeeded, `canTrainerAccessExercise(row, null)` hides EVERY
//      trainer-authored exercise, so the coach's own library would be empty.
//
// Both halves disappear when the uid comes from the cookie session server-side.
// The normalization + scoping rules did not change; only where they run did.

/** `QueryDocumentSnapshot`-shaped input — satisfied by both Firestore SDKs. */
export interface ExerciseDocLike {
  id: string;
  data(): Record<string, unknown> | undefined;
}

export interface ExerciseRow {
  id: string;
  name: { en: string; es: string };
  description: { en: string; es: string };
  muscleGroups: string[];
  equipment: string[];
  mediaURL?: string | null;
  thumbnailURL?: string | null;
  youtubeURL?: string | null;
  /** Search aliases and alternate names, used for fuzzy discovery. */
  keywords?: string[];
  /** Semantic tags such as `standard-library`. */
  tags?: string[];
  /** Alternate movement names / variations surfaced in the preview page. */
  variations?: string[];
  /**
   * 260522-mo2 Revision fix #1 (Blocker): 3-way union — `"free-exercise-db"`
   * is the on-the-wire source value seeded by Task C. PRIOR to 260522-mo2
   * this was a 2-way union `"wger" | "trainer"` and the snapToRow ternary
   * silently coerced any non-"wger" wire value to "trainer" — including
   * the new fexd value. Both surfaces were fixed together; do not collapse
   * either back to the 2-way shape.
   */
  source: "wger" | "trainer" | "free-exercise-db";
  ownerId: string | null;
  version: number;
  /** ISO string — converted from Firestore Timestamp at read time so React
   *  state stays serializable across the Server Action boundary. */
  updatedAt: string | null;
  createdAt: string | null;
  deleted?: boolean;
  /** ISO string — curation-pass soft-delete marker (260522-hi5 Task B). Null
   *  when the doc is alive. */
  deletedAt?: string | null;
  /** For dedupe-loser wger-* docs — the surviving canonical exercise id. */
  mergedInto?: string | null;
  /** 260522-mo2 — soft-delete cause (e.g. "superseded-by-fexd"). */
  deletedReason?: string | null;
  /** 260522-mo2 — Firebase Storage URL for the start frame. */
  imageUrl?: string | null;
  /** 260522-mo2 — Firebase Storage URL for the end frame. */
  endImageUrl?: string | null;
  /** 260522-mo2 — Firebase Storage URL for the 2-frame ping-pong preview.gif. */
  gifUrl?: string | null;
  /** 260522-mo2 — bilingual exercise step list. */
  instructions?: { en?: string[] | null; es?: string[] | null } | null;
  /**
   * Phase 24-06 — FEXD raw primary muscle tags (vocabulary distinct from
   * GC canonical `muscleGroups`). Empty array on legacy wger docs that
   * predate the FEXD enrichment, on trainer-authored docs, and on any
   * wire shape where the field is absent or malformed. Mirrors
   * `Exercise.primaryMuscles` on iOS (Phase 24-05).
   */
  primaryMuscles?: string[];
  /** Phase 24-06 — FEXD raw secondary muscle tags (e.g. "triceps"). */
  secondaryMuscles?: string[];
  /**
   * #1072 — el grupo PRINCIPAL del vocabulario canónico (twin de iOS
   * `Exercise.primaryMuscleGroup`). Lo escribe el editor de ejercicios desde
   * `exercise-schema.ts`, pero el listener no lo decodificaba: sin él el
   * heatmap del editor de rutinas no puede distinguir principal de secundario
   * y cae al nivel único (`D-05`) en TODA la biblioteca, no sólo en el 94 % que
   * de verdad no lo tiene.
   */
  primaryMuscleGroup?: string | null;
  /** Phase 24-06 — Exercise mechanic ("compound" | "isolation" | null). */
  mechanic?: string | null;
  /** Phase 24-06 — Difficulty level ("beginner" | "intermediate" | "expert" | null). */
  level?: string | null;
  /** Phase 24-06 — FEXD category ("strength" | "powerlifting" | "stretching" | ...). */
  category?: string | null;
  /** Phase 24-06 — Force vector ("push" | "pull" | "static" | null). */
  force?: string | null;
  /**
   * Phase 26-02 — Per-exercise prescription kind. Mirrors the iOS
   * `ExerciseMetric` enum (`Exercise.swift`) and the Zod `metricSchema`
   * (`exercise-schema.ts`). Forgiving fallback to `"reps"` on absent /
   * unknown wire values keeps every legacy doc rendering as reps-based.
   */
  metric: "reps" | "time";
  /**
   * Phase 26-09 — bodyweight authoring default. `false` means the exercise is
   * prescribed "reps without weight" (push-ups, pull-ups…). The template
   * builder reads this on ADD to seed the per-set "Sin peso" sentinel
   * (`weightBySetKg: []`). Absent / non-false → `true` (tracks external
   * weight) so every legacy exercise keeps the weight column.
   */
  tracksWeight?: boolean;
}

/**
 * The #552 VIEWER SCOPE. Library docs (wger / fexd / standard) are shared
 * catalog and visible to everyone; a `source: "trainer"` doc belongs to the
 * coach who authored it and to nobody else.
 *
 * ⚠️ The `ownerId` comparison — not an equality on `source` — is what keeps
 * the 24 `standard_alias` docs out: `snapToRow` coerces any unknown wire
 * `source` to `"trainer"`, so those land here with `ownerId: null`.
 *
 * ⚠️ FAIL CLOSED with no uid. Failing open would show every coach's private
 * library to a session that hasn't identified itself.
 */
export function canTrainerAccessExercise(
  row: Pick<ExerciseRow, "source" | "ownerId">,
  trainerUid: string | null,
): boolean {
  if (row.source !== "trainer") return true;
  if (!trainerUid) return false;
  return row.ownerId === trainerUid;
}

function toIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") return v;
  return null;
}

export function snapToRow(d: ExerciseDocLike): ExerciseRow {
  const data = d.data() ?? {};
  // 260522-mo2 Revision fix #1 — 3-way source discrimination. The prior
  // 2-way ternary (`data.source === "wger" ? "wger" : "trainer"`) silently
  // coerced the new `"free-exercise-db"` wire value to `"trainer"`, which
  // broke license-badge rendering + source filtering downstream. The
  // explicit 3-way ternary below preserves the conservative `"trainer"`
  // fallback for genuinely-unknown rawValues (the Codable forgiving-decoder
  // mirror in Exercise.swift falls back to `.wger`; we pick `"trainer"`
  // here to avoid silently misattributing unknown sources as wger media).
  const rawSource = data.source;
  const source: ExerciseRow["source"] =
    rawSource === "wger"
      ? "wger"
      : rawSource === "free-exercise-db"
        ? "free-exercise-db"
        : "trainer";
  const instructions =
    data.instructions && typeof data.instructions === "object"
      ? {
          en: Array.isArray((data.instructions as { en?: unknown }).en)
            ? (data.instructions as { en: string[] }).en
            : null,
          es: Array.isArray((data.instructions as { es?: unknown }).es)
            ? (data.instructions as { es: string[] }).es
            : null,
        }
      : null;
  return {
    id: d.id,
    name: (data.name as ExerciseRow["name"]) ?? { en: "(untitled)", es: "" },
    description:
      (data.description as ExerciseRow["description"]) ?? { en: "", es: "" },
    muscleGroups: Array.isArray(data.muscleGroups) ? data.muscleGroups : [],
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
    mediaURL: (data.mediaURL as string | null) ?? null,
    thumbnailURL: (data.thumbnailURL as string | null) ?? null,
    youtubeURL: (data.youtubeURL as string | null) ?? null,
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    variations: Array.isArray(data.variations) ? data.variations : [],
    source,
    ownerId: typeof data.ownerId === "string" ? data.ownerId : null,
    version: typeof data.version === "number" ? data.version : 1,
    updatedAt: toIso(data.updatedAt),
    createdAt: toIso(data.createdAt),
    deleted: data.deleted === true,
    deletedAt: toIso(data.deletedAt),
    mergedInto: typeof data.mergedInto === "string" ? data.mergedInto : null,
    deletedReason:
      typeof data.deletedReason === "string" ? data.deletedReason : null,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
    endImageUrl: typeof data.endImageUrl === "string" ? data.endImageUrl : null,
    gifUrl: typeof data.gifUrl === "string" ? data.gifUrl : null,
    instructions,
    // Phase 24-06 — FEXD enrichment fields. Defensive reads mirror the
    // existing pattern above: arrays via Array.isArray (string-instead-of-
    // array regression returns []), strings via typeof === "string"
    // (number/object/bool/array regression returns null). NEVER coerce
    // unknown shapes — Pattern S5 from 24-PATTERNS.md.
    primaryMuscles: Array.isArray(data.primaryMuscles)
      ? data.primaryMuscles
      : [],
    secondaryMuscles: Array.isArray(data.secondaryMuscles)
      ? data.secondaryMuscles
      : [],
    primaryMuscleGroup:
      typeof data.primaryMuscleGroup === "string" &&
      data.primaryMuscleGroup.length > 0
        ? data.primaryMuscleGroup
        : null,
    mechanic: typeof data.mechanic === "string" ? data.mechanic : null,
    level: typeof data.level === "string" ? data.level : null,
    category: typeof data.category === "string" ? data.category : null,
    force: typeof data.force === "string" ? data.force : null,
    // Phase 26-02 — forgiving fallback to "reps" on absent/unknown wire value.
    metric: data.metric === "time" ? "time" : "reps",
    // Phase 26-09 — bodyweight default; only an explicit `false` opts out of
    // the weight column (legacy docs without the field track weight).
    tracksWeight: data.tracksWeight === false ? false : true,
  };
}

/**
 * The full read-side projection: normalize every doc, drop the
 * curation-soft-deleted ones (`deletedAt` non-null), then apply the viewer
 * scope. Shared so the Server Action and any future caller can never
 * disagree about what a coach is allowed to see.
 *
 * `deletedAt` is filtered CLIENT-SIDE (here) rather than with a
 * `where("deletedAt", "==", null)` predicate because Firestore's `==` does
 * NOT match docs where the field is ABSENT — and the 260522-hi5 curation
 * script only writes the field on the docs it drops. A server-side filter
 * matched zero rows and rendered an empty library (debug session
 * picker-empty-deletedat, 2026-05-22).
 */
export function projectExercisesForViewer(
  docs: ExerciseDocLike[],
  viewerUid: string | null,
): ExerciseRow[] {
  return docs
    .map(snapToRow)
    .filter((r) => !r.deletedAt)
    .filter((r) => canTrainerAccessExercise(r, viewerUid));
}
