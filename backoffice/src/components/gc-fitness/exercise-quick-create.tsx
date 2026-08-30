"use client";

// exercise-quick-create.tsx
//
// Inline "Quick create" panel shared by the single-add popover and the
// multi-add dialog. Surfaces under both pickers in two situations:
//   1. Zero search matches — "Exercise not found. Quick create"
//   2. The trainer clicked "Create similar" on an existing row — the panel
//      opens populated with that exercise's fields so they can tweak the
//      name / equipment / etc. and save the variation.
//
// Duplicate guard: when a seed is active, the Create button stays disabled
// until at least one field diverges from the source so trainers don't
// accidentally create an identical clone.
//
// #1032 — the panel also writes `youtubeURL`. Before that it only had ONE
// media field ("GIF / preview URL"), so a coach who wanted to attach a demo
// video either pasted the YouTube link into the THUMBNAIL field (which the
// media resolvers then try to render as an image) or had to leave the
// workout builder, open the library, edit the exercise, and come back.

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// NOTE: `createExercise` is imported dynamically inside the click handler so
// the static module graph doesn't pull the firebase-admin chain at evaluation
// time. Without this, every place that renders <QuickCreateExercise/> (the
// single popover, the multi-add dialog, and their respective Jest test
// suites) would transitively try to load firebase-admin/auth — which is ESM
// and breaks the existing ts-jest transformer.
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
} from "@/lib/gc-fitness/exercise-vocabulary";

export interface QuickCreateSeed {
  name: string;
  description: string;
  muscleGroup: string;
  equipment: string;
  gifUrl: string;
  /** #1032 — carried through "Create similar" so the variation keeps the demo. */
  youtubeUrl: string;
}

interface QuickCreateExerciseProps {
  /** Current search input — used to pre-fill the Name field. */
  searchTerm: string;
  /**
   * Pre-fills the form with an existing exercise's values ("Create
   * similar"). Identity is the comparison key — pass a new object whenever
   * the trainer selects a different source row. Pass `null` (or omit) for
   * the empty / first-time form state.
   */
  seed?: QuickCreateSeed | null;
  /** Fired once createExercise resolves with the new doc id + display name. */
  onCreated: (created: { id: string; name: string }) => void;
  /** Optional — called when the trainer clicks Clear seed on a seeded form. */
  onSeedCleared?: () => void;
  /** Optional className on the outer card. */
  className?: string;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

const DEFAULT_MUSCLE = "chest";
const DEFAULT_EQUIPMENT = "bodyweight";

/**
 * #1032 — the YouTube link the coach pastes, coerced into something
 * `exerciseSchema.youtubeURL` (a `z.string().url()`) will accept.
 *
 * Copying a link out of the YouTube app or the browser's address bar very
 * often drops the scheme (`youtu.be/_R389Jk0tI`), and `z.string().url()`
 * rejects that. The rejection would surface in the panel's red line as the
 * JSON blob of a ZodError — unreadable, and un-actionable, since nothing on
 * screen says a scheme is what's missing. So prepend `https://` here and
 * validate BEFORE the Server Action ever runs.
 *
 * Returns "" for blank input (the caller turns that into a `null` on the
 * wire — an empty string is a real value on Firestore).
 */
export function normalizeYoutubeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Any scheme at all (http, https, or a typo like `htttp`) is left alone so
  // isValidYoutubeUrl below can reject it instead of us silently building
  // `https://htttp://…`.
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

/** Mirrors what `z.string().url()` accepts, narrowed to http(s). */
export function isValidYoutubeUrl(normalized: string): boolean {
  try {
    const url = new URL(normalized);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

function seedEquals(a: QuickCreateSeed, b: QuickCreateSeed): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.description.trim() === b.description.trim() &&
    a.muscleGroup === b.muscleGroup &&
    a.equipment === b.equipment &&
    a.gifUrl.trim() === b.gifUrl.trim() &&
    // #1032 — without this, swapping ONLY the demo video on a "Create
    // similar" reads as an identical clone and the CTA stays disabled.
    a.youtubeUrl.trim() === b.youtubeUrl.trim()
  );
}

export function QuickCreateExercise({
  searchTerm,
  seed,
  onCreated,
  onSeedCleared,
  className,
}: QuickCreateExerciseProps) {
  const locale = useLocale();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<string>(DEFAULT_MUSCLE);
  const [equipment, setEquipment] = useState<string>(DEFAULT_EQUIPMENT);
  const [gifUrl, setGifUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameDirty, setNameDirty] = useState(false);

  // Whenever a new seed arrives, copy it into the form fields. We use the
  // seed object identity (referential) so a parent that wants to re-seed
  // the same row again can do so by passing a fresh object.
  useEffect(() => {
    if (!seed) return;
    setName(seed.name);
    setDescription(seed.description);
    setMuscleGroup(seed.muscleGroup);
    setEquipment(seed.equipment);
    setGifUrl(seed.gifUrl);
    setYoutubeUrl(seed.youtubeUrl);
    setError(null);
    // The name was set deliberately from a seed — don't let the
    // search-prefill effect overwrite it on the next keystroke.
    setNameDirty(true);
  }, [seed]);

  // Pre-fill the Name field with whatever the trainer typed in the search
  // input — only until they edit the field themselves (or a seed lands),
  // then we leave their input alone.
  useEffect(() => {
    if (nameDirty || seed) return;
    const trimmed = searchTerm.trim();
    if (trimmed) setName(trimmed);
  }, [searchTerm, nameDirty, seed]);

  // Declared ABOVE onCreate on purpose: onCreate reads it, and keeping the
  // derivation in one place stops the wire value and the validity check from
  // drifting apart.
  const normalizedYoutube = normalizeYoutubeUrl(youtubeUrl);
  const youtubeInvalid =
    normalizedYoutube.length > 0 && !isValidYoutubeUrl(normalizedYoutube);

  function reset() {
    setName("");
    setDescription("");
    setMuscleGroup(DEFAULT_MUSCLE);
    setEquipment(DEFAULT_EQUIPMENT);
    setGifUrl("");
    setYoutubeUrl("");
    setError(null);
    setNameDirty(false);
  }

  function handleClearSeed() {
    reset();
    onSeedCleared?.();
  }

  async function onCreate() {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    // #307 — unreachable while the CTA is disabled: the create button is
    // `disabled={creating || requiredMissing || isDuplicate}` with
    // `requiredMissing = name.trim().length === 0`, so nobody ever sees this
    // message. The visible guard is the disabled CTA.
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // Bilingual fields are duplicated to satisfy the Zod schema — the
      // trainer can refine the ES translation later from the exercises
      // editor.
      const localizedName = { en: trimmedName, es: trimmedName };
      const localizedDescription = {
        en: trimmedDescription,
        es: trimmedDescription,
      };
      const { createExercise } = await import(
        "@/lib/gc-fitness/exercise-server-actions"
      );
      const result = await createExercise({
        name: localizedName,
        description: localizedDescription,
        muscleGroups: [muscleGroup],
        // #480 — the single picked muscle is this exercise's PRIMARY mover, so
        // it weights as a full set in the coach's muscle-group progress charts.
        primaryMuscleGroup: muscleGroup,
        equipment: [equipment],
        thumbnailURL: gifUrl.trim() || null,
        // #1032 — null, never "", for the same reason as thumbnailURL: an
        // empty string is a present value on Firestore and the clients treat
        // "has a video" as "the field is non-null".
        youtubeURL: normalizedYoutube || null,
        source: "trainer",
        ownerId: null,
      });
      onCreated({ id: result.id, name: trimmedName });
      reset();
      onSeedCleared?.();
    } catch (err) {
      console.error("[exercise-quick-create] failed", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the exercise.",
      );
    } finally {
      setCreating(false);
    }
  }

  const currentValues: QuickCreateSeed = {
    name,
    description,
    muscleGroup,
    equipment,
    gifUrl,
    youtubeUrl,
  };
  const isDuplicate = !!seed && seedEquals(seed, currentValues);
  // Description is optional — only the name gates Create.
  const requiredMissing = name.trim().length === 0;
  const disabled =
    creating || requiredMissing || isDuplicate || youtubeInvalid;
  // Keep the locale read so future copy can branch per-locale without
  // adding another import; not used today but cheap.
  void locale;

  const headline = seed
    ? "Create similar — tweak the fields below"
    : "Exercise not found. Quick create";

  return (
    <div
      className={cn(
        "rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-foreground dark:border-amber-400/40 dark:bg-amber-400/10",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{headline}</p>
        {seed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearSeed}
            className="h-7 px-2 text-xs"
          >
            Clear
          </Button>
        ) : null}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="quick-create-name" className="sr-only">
            Name
          </Label>
          <Input
            id="quick-create-name"
            value={name}
            placeholder="Name"
            onChange={(event) => {
              setName(event.target.value);
              setNameDirty(true);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="quick-create-description" className="sr-only">
            Description
          </Label>
          <Input
            id="quick-create-description"
            value={description}
            placeholder="Description (optional)"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="sr-only" htmlFor="quick-create-muscle">
            Muscle group
          </Label>
          <Select value={muscleGroup} onValueChange={setMuscleGroup}>
            <SelectTrigger id="quick-create-muscle" className="w-full">
              <SelectValue placeholder="Muscle group" />
            </SelectTrigger>
            <SelectContent>
              {MUSCLE_GROUPS.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="sr-only" htmlFor="quick-create-equipment">
            Equipment
          </Label>
          <Select value={equipment} onValueChange={setEquipment}>
            <SelectTrigger id="quick-create-equipment" className="w-full">
              <SelectValue placeholder="Equipment" />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT.map((e) => (
                <SelectItem key={e} value={e}>
                  {formatLabel(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="quick-create-gif" className="sr-only">
            GIF or preview URL (optional)
          </Label>
          <Input
            id="quick-create-gif"
            value={gifUrl}
            placeholder="GIF / preview URL (optional)"
            onChange={(event) => setGifUrl(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="quick-create-youtube" className="sr-only">
            YouTube video URL (optional)
          </Label>
          <Input
            id="quick-create-youtube"
            value={youtubeUrl}
            placeholder="YouTube video URL (optional)"
            onChange={(event) => setYoutubeUrl(event.target.value)}
            aria-invalid={youtubeInvalid || undefined}
          />
        </div>
      </div>
      {youtubeInvalid ? (
        <p className="mt-2 text-xs text-destructive">
          Paste the full YouTube link — https://youtu.be/… or
          https://www.youtube.com/watch?v=…
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}
      {isDuplicate ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Identical to the source exercise — change at least one field to enable Create.
        </p>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="mt-3"
        onClick={onCreate}
        disabled={disabled}
      >
        {creating ? "Creating…" : "Create exercise"}
      </Button>
    </div>
  );
}
