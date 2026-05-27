"use client";

// exercise-quick-create.tsx
//
// Inline "Exercise not found. Quick create" panel shared by the single-add
// popover and the multi-add dialog. Surfaces under both pickers when the
// search yields no matches so the trainer can drop a new exercise in
// without leaving the workout-template flow.

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

interface QuickCreateExerciseProps {
  /** Current search input — used to pre-fill the Name field. */
  searchTerm: string;
  /** Fired once createExercise resolves with the new doc id + display name. */
  onCreated: (created: { id: string; name: string }) => void;
  /** Optional className on the outer card. */
  className?: string;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

const DEFAULT_MUSCLE = "chest";
const DEFAULT_EQUIPMENT = "bodyweight";

export function QuickCreateExercise({
  searchTerm,
  onCreated,
  className,
}: QuickCreateExerciseProps) {
  const locale = useLocale();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<string>(DEFAULT_MUSCLE);
  const [equipment, setEquipment] = useState<string>(DEFAULT_EQUIPMENT);
  const [gifUrl, setGifUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameDirty, setNameDirty] = useState(false);

  // Pre-fill the Name field with whatever the trainer typed in the search
  // input — only until they edit the field themselves, then we leave their
  // input alone (typing in the search shouldn't yank the name from under
  // their cursor mid-edit).
  useEffect(() => {
    if (nameDirty) return;
    const trimmed = searchTerm.trim();
    if (trimmed) setName(trimmed);
  }, [searchTerm, nameDirty]);

  function reset() {
    setName("");
    setDescription("");
    setMuscleGroup(DEFAULT_MUSCLE);
    setEquipment(DEFAULT_EQUIPMENT);
    setGifUrl("");
    setError(null);
    setNameDirty(false);
  }

  async function onCreate() {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName || !trimmedDescription) {
      setError("Name and description are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // Bilingual fields are duplicated to satisfy the Zod schema — the
      // trainer can refine the ES translation later from the exercises
      // editor. Mirrors the prior multi-add dialog behaviour.
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
        equipment: [equipment],
        thumbnailURL: gifUrl.trim() || null,
        source: "trainer",
        ownerId: null,
      });
      onCreated({ id: result.id, name: trimmedName });
      reset();
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

  const disabled =
    creating || name.trim().length === 0 || description.trim().length === 0;
  // Keep the locale read so future copy can branch per-locale without
  // adding another import; not used today but cheap.
  void locale;

  return (
    <div
      className={cn(
        "rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-foreground dark:border-amber-400/40 dark:bg-amber-400/10",
        className,
      )}
    >
      <p className="text-sm font-medium">Exercise not found. Quick create</p>
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
            placeholder="Description"
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
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="mt-3"
        onClick={onCreate}
        disabled={disabled}
      >
        {creating ? "Creating…" : "Create quick exercise"}
      </Button>
    </div>
  );
}
