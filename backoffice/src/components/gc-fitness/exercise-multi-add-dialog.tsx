"use client";

// exercise-multi-add-dialog.tsx — Plan 21-01a.
//
// Multi-select companion to ExercisePickerPopover. The popover handles the
// per-row swap affordance ("change this row's exercise"); the dialog handles
// the batch-add flow ("add 10 exercises at once when building a template").
//
// Why a separate component instead of widening the popover:
//   - The popover's value/onChange contract is single-pick. Widening it to
//     multi-select would break every existing row binding.
//   - Multi-add UX needs more vertical space (longer scrollable list +
//     selection-count footer + confirm button) than a Popover comfortably
//     provides.
//
// Out of scope (deferred):
//   - Muscle-group filter (21-01b)
//   - Recently-used row (21-01c)
//
// Reuses the same display + search normalization helpers as the popover
// (bilingual names, diacritic-stripped fuzzy search, gs:// → unoptimized
// Image, soft-delete filter).

import { useMemo, useState } from "react";
import Image from "next/image";
import { Dumbbell, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  useExercisesQuery,
  type ExerciseRow,
} from "@/lib/gc-fitness/exercises-listener";

import {
  displayEs,
  fuzzyTokenMatch,
} from "./exercise-picker-popover";
import { createExercise } from "@/lib/gc-fitness/exercise-server-actions";

function exerciseDisplayName(row: ExerciseRow): string {
  return row.name.en || row.name.es || "(untitled)";
}

function previewUrl(url?: string | null): string | null {
  if (typeof url === "string" && /^https?:\/\//.test(url)) {
    return url;
  }
  return null;
}

function previewSrc(
  row: Pick<ExerciseRow, "gifUrl" | "imageUrl" | "thumbnailURL">,
): string | null {
  return (
    previewUrl(row.gifUrl) ??
    previewUrl(row.imageUrl) ??
    previewUrl(row.thumbnailURL)
  );
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

export interface ExerciseMultiAddDialogProps {
  /** Called with the array of picked exerciseIds when the trainer confirms. */
  onConfirm: (exerciseIds: string[]) => void;
  /** Optional className on the trigger button. */
  triggerClassName?: string;
  /** Disable while the parent form is submitting. */
  disabled?: boolean;
}

export function ExerciseMultiAddDialog({
  onConfirm,
  triggerClassName,
  disabled,
}: ExerciseMultiAddDialogProps) {
  const t = useTranslations("picker");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickDescription, setQuickDescription] = useState("");
  const [quickMuscleGroup, setQuickMuscleGroup] = useState("upper_chest");
  const [quickEquipment, setQuickEquipment] = useState("bodyweight");
  const [quickCreating, setQuickCreating] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data, isLoading, error, hasSnapshot } = useExercisesQuery();

  const exercises = useMemo(
    () => (data ?? []).filter((r) => r.deleted !== true),
    [data],
  );

  const filtered = useMemo(() => {
    const needle = search.trim();
    if (!needle) return exercises;
    return exercises.filter((ex) => {
      const haystack = [ex.name.en, ex.name.es, ex.muscleGroups.join(" ")].join(" ");
      return fuzzyTokenMatch(needle, haystack);
    });
  }, [exercises, search]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function onCancel(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch("");
      setPicked(new Set());
    }
  }

  function onSubmit() {
    if (picked.size === 0) return;
    onConfirm(Array.from(picked));
    onCancel(false);
  }

  async function onQuickCreate() {
    const name = quickName.trim();
    const description = quickDescription.trim();
    if (!name || !description) return;
    setQuickCreating(true);
    try {
      const localizedName =
        locale.startsWith("es")
          ? { en: name, es: name }
          : { en: name, es: name };
      const localizedDescription =
        locale.startsWith("es")
          ? { en: description, es: description }
          : { en: description, es: description };
      const result = await createExercise({
        name: localizedName,
        description: localizedDescription,
        muscleGroups: [quickMuscleGroup],
        equipment: [quickEquipment],
        source: "trainer",
        ownerId: null,
      });
      setPicked((prev) => {
        const next = new Set(prev);
        next.add(result.id);
        return next;
      });
      setQuickName("");
      setQuickDescription("");
      setSearch(name);
      onConfirm([result.id]);
      onCancel(false);
    } catch (error) {
      console.error(error);
    } finally {
      setQuickCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={triggerClassName}
          disabled={disabled}
        >
          {t("multiAddTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("multiAddTitle")}</DialogTitle>
          <DialogDescription>{t("multiAddDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border px-3">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto rounded-md border p-2">
          {isLoading || !hasSnapshot ? (
            <li className="py-4 text-center text-sm text-muted-foreground">
              {t("loadingExercises")}
            </li>
          ) : error ? (
            <li className="py-4 text-center text-sm text-muted-foreground">
              {t("loadError")}
            </li>
          ) : filtered.length === 0 ? (
            <li className="py-4 text-center text-sm text-muted-foreground">
              {t("noMatches")}
            </li>
          ) : (
            filtered.map((ex) => {
              const checked = picked.has(ex.id);
              const esLine = displayEs(ex);
              const src = previewSrc(ex);
              return (
                <li key={ex.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(ex.id)}
                      className="h-4 w-4 rounded border"
                    />
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted/40 text-muted-foreground"
                    >
                      {src ? (
                        <Image
                          src={src}
                          alt=""
                          width={48}
                          height={28}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <Dumbbell className="h-3 w-3" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {exerciseDisplayName(ex)}
                      </span>
                      {esLine ? (
                        <span className="truncate text-xs italic text-muted-foreground">
                          {esLine}
                        </span>
                      ) : null}
                      {ex.muscleGroups.length > 0 ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {ex.muscleGroups.map(formatLabel).join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
        {filtered.length === 0 ? (
          <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3">
            <p className="text-sm font-medium">Exercise not found. Quick create</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={quickName}
                onChange={(event) => setQuickName(event.target.value)}
                placeholder="Name"
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
              <input
                value={quickDescription}
                onChange={(event) => setQuickDescription(event.target.value)}
                placeholder="Description"
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
              <select
                value={quickMuscleGroup}
                onChange={(event) => setQuickMuscleGroup(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="chest">Chest</option>
                <option value="back">Back</option>
                <option value="glutes">Glutes</option>
                <option value="quadriceps">Quadriceps</option>
                <option value="hamstrings">Hamstrings</option>
                <option value="shoulders">Shoulders</option>
                <option value="biceps">Biceps</option>
                <option value="triceps">Triceps</option>
                <option value="abs">Abs</option>
              </select>
              <select
                value={quickEquipment}
                onChange={(event) => setQuickEquipment(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="bodyweight">Bodyweight</option>
                <option value="dumbbell">Dumbbell</option>
                <option value="barbell">Barbell</option>
                <option value="cable">Cable</option>
                <option value="machine">Machine</option>
                <option value="resistance_band">Resistance band</option>
              </select>
            </div>
            <Button type="button" className="mt-3" onClick={onQuickCreate} disabled={quickCreating || !quickName.trim() || !quickDescription.trim()}>
              {quickCreating ? "Creating..." : "Create quick exercise"}
            </Button>
          </div>
        ) : null}
        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {t("multiAddSelectedCount", { count: picked.size })}
          </span>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={picked.size === 0}
          >
            {t("multiAddConfirm", { count: picked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
