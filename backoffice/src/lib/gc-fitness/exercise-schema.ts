// exercise-schema.ts
// Zod schema mirroring `GCFitnessCore/Sources/GCFitnessCore/Schema/Exercise.swift`.
//
// SAME-SOURCE-OF-TRUTH CONTRACT:
//  - Vocabulary enums (`muscleGroupSchema`, `equipmentSchema`) wrap the
//    canonical `MUSCLE_GROUPS` / `EQUIPMENT` lists from `exercise-vocabulary.ts`
//    (the TS twin of `Vocabulary.swift` committed in 03-02). Adding or removing
//    a value in the vocab file automatically widens / narrows this schema —
//    do not duplicate the list here.
//  - Copy strings (`message: '...'`) are LOCKED to the UI-SPEC "Zod validation
//    copy" table (`03-UI-SPEC.md` §"Validation copy"). Drift fails the
//    exercise-schema.test.ts suite. If product wants to change the copy, the
//    test, the UI-SPEC, and this file must all change in the same commit.
//
// Used by:
//  - `exercise-server-actions.ts` for parse-on-write enforcement.
//  - `_components/ExerciseForm.tsx` (03-06) for `@hookform/resolvers/zod`
//    field-level validation feedback.

import { z } from "zod";
import { MUSCLE_GROUPS, EQUIPMENT } from "./exercise-vocabulary";

// Zod 4 `z.enum` consumes a TUPLE — `as unknown as [string, ...string[]]`
// preserves the union type while satisfying the runtime tuple shape.
export const muscleGroupSchema = z.enum(
  MUSCLE_GROUPS as unknown as [string, ...string[]],
  {
    message: "Unknown muscle group. Refresh and try again.",
  },
);

export const equipmentSchema = z.enum(
  EQUIPMENT as unknown as [string, ...string[]],
  {
    message: "Unknown equipment. Refresh and try again.",
  },
);

// `gs://` URL — Cloud Storage path Firestore stores; iOS/web resolve to a
// download URL at fetch time via the Firebase SDK. Plain https URLs are
// REJECTED to keep the no-hotlinking invariant from 03-CONTEXT.md (all media
// served from our own bucket so we control availability + cost).
const gsUrlSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .regex(/^gs:\/\//, "Media couldn't be uploaded. Try again.")
    .nullable()
    .optional(),
);

// Thumbnail URL — accepts EITHER an in-bucket `gs://` path (uploaded via
// the new ThumbnailUploadDropzone) OR an external `https://` URL pasted by
// the trainer (e.g., a giphy preview). The no-hotlinking invariant from
// 03-CONTEXT.md is intentionally RELAXED for thumbnails to give trainers a
// frictionless preview-image path; the video field (`mediaURL`) stays
// `gs://`-only because hosting + transcode cost matters more for full
// clips than for small static previews.
const thumbnailUrlSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .trim()
    .regex(
      /^(gs:\/\/|https?:\/\/)/i,
      "Enter a gs:// or https:// URL.",
    )
    .nullable()
    .optional(),
);

const youtubeUrlSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .trim()
    .url("Enter a valid YouTube URL.")
    .nullable()
    .optional(),
);

// 14-02 — Generic demonstration video URL. Distinct from `mediaURL`
// (the 16:9 hero clip, stored as `gs://`) AND from `youtubeURL` (the
// existing YouTube reference link). Accepts ANY https URL — v1 trainers
// may paste an MP4/Vimeo link from a host they already control, so we
// do NOT restrict to `gs://` here.
const videoUrlSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .trim()
    .url("Enter a valid video URL.")
    .nullable()
    .optional(),
);

// 14-02 — Bilingual coaching tips. Free-text coaching cues separate from
// the numbered `instructions` step list. 2,000-char ceiling per language
// (half the description ceiling — tips should be tight cues, not full
// instructions). Nullable + optional so legacy exercise documents that
// lack the field parse cleanly.
const tipsSchema = z
  .object({
    en: z.string().max(2000, "Keep tips under 2,000 characters.").default(""),
    es: z.string().max(2000, "Keep tips under 2,000 characters.").default(""),
  })
  .nullable()
  .optional();

// Phase 24-06 — widened to 3-way to match the ExerciseRow union
// (exercises-listener.ts:80) + the iOS Source enum (Exercise.swift).
// Trainer-form ingress for a fexd-* doc with `source: "free-exercise-db"`
// now round-trips through Zod validation. The enum is STILL closed —
// unknown values reject. The 6 FEXD enrichment fields (primaryMuscles,
// secondaryMuscles, mechanic, level, category, force) are NOT added to
// the trainer-input schema — they are admin-script-written only via
// scripts/gc-fitness/seed-from-fexd.ts (Plan 24-03).
const sourceSchema = z.enum(["wger", "trainer", "free-exercise-db"]);

// Exercise Codable shape mirrored from Swift. Field-by-field rationale:
//
//  - `name.en` is REQUIRED with a UI-SPEC error. `name.es` is optional from
//    the trainer's perspective (wger seed has both, but a custom exercise
//    may start English-only — trainer fills ES later). Both share the
//    120-char ceiling.
//  - `description.en` is REQUIRED (UI-SPEC). `description.es` is optional.
//    Both share a 4,000-char ceiling (matches the 4000 cap in the iOS
//    `ExerciseModel.swift` Codable validation from 03-01).
//  - `muscleGroups` requires at least one entry (UI-SPEC), with a defensive
//    max of 8 — far below the Pitfall-5 ceiling of 24 vocab values. The
//    plan threshold is "Pick at least one + can list any subset of the 16
//    canonical groups"; 8 is the realistic upper bound for any single
//    exercise (a deadlift hits ~6).
//  - `equipment` requires at least one entry — the "bodyweight" sentinel
//    in the vocab covers the no-equipment case. UI-SPEC copy with curly
//    quotes.
//  - `mediaURL` / `thumbnailURL` accept `null | undefined | gs://...`. The
//    backoffice form starts both as null and writes them after the
//    `mintExerciseMediaUploadUrl` round-trip succeeds.
//  - `youtubeURL` stores an explainer/demo URL for the exercise.
//  - `source` and `ownerId` are accepted in the input but RE-ASSERTED in
//    the Server Action layer. A trainer attempting to send `source: "wger"`
//    or `ownerId: "someone-else"` is caught in `exercise-server-actions.ts`
//    BEFORE any Firestore write — Zod accepts the shape; the policy layer
//    enforces ownership.
//  - `version` defaults to 1; updates use `FieldValue.increment(1)` in the
//    Server Action layer (NOT a Zod-level increment).

export const exerciseSchema = z.object({
  name: z.object({
    en: z
      .string()
      .min(1, "Name in English is required.")
      .max(120, "Keep the name under 120 characters."),
    es: z.string().max(120, "Keep the name under 120 characters.").default(""),
  }),
  description: z.object({
    en: z
      .string()
      .min(1, "Add a short description so clients know what to do.")
      .max(4000, "Description must be under 4,000 characters."),
    es: z
      .string()
      .max(4000, "Description must be under 4,000 characters.")
      .default(""),
  }),
  muscleGroups: z
    .array(muscleGroupSchema)
    .min(1, "Pick at least one muscle group.")
    .max(8),
  equipment: z
    .array(equipmentSchema)
    .min(1, "Pick at least one equipment item, or “bodyweight.”"),
  mediaURL: gsUrlSchema,
  thumbnailURL: thumbnailUrlSchema,
  youtubeURL: youtubeUrlSchema,
  videoUrl: videoUrlSchema,
  tips: tipsSchema,
  source: sourceSchema,
  ownerId: z.string().nullable(),
  version: z.number().int().min(1).default(1),
});

// Partial — used by `updateExercise` which patches subsets of the shape.
// Note: `source` / `ownerId` immutability is enforced in the Server Action
// (not Zod) because the rule is "existing.source must equal incoming
// source" — a stateful check Zod can't express on its own.
export const exerciseUpdateSchema = exerciseSchema.partial();

export type ExerciseInput = z.infer<typeof exerciseSchema>;
export type ExerciseUpdateInput = z.infer<typeof exerciseUpdateSchema>;
