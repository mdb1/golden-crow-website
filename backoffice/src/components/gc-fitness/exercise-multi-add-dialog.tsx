"use client";

// exercise-multi-add-dialog.tsx — Plan 21-01a.
//
// Multi-select companion to ExercisePickerPopover. The popover handles the
// per-row swap affordance ("change this row's exercise"); the dialog handles
// the batch-add flow ("add 10 exercises at once when building a template").
//
// Quick-create panel is delegated to <QuickCreateExercise/> so the single
// picker and the multi-select dialog stay symmetrical. The same panel also
// serves "Create similar" — clicking the wand on any row seeds the form
// with that exercise's values for one-tweak duplication.

import { useMemo, useState } from "react";
import { Copy, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

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

import { useQueryClient } from "@tanstack/react-query";
import {
  useExercisesQuery,
  EXERCISES_QUERY_KEY,
  type ExerciseRow,
} from "@/lib/gc-fitness/exercises-listener";
import { searchExercises } from "@/lib/gc-fitness/exercise-search";

import {
  ChipRow,
  FilterChip,
  displayEs,
} from "./exercise-picker-popover";
import {
  QuickCreateExercise,
  type QuickCreateSeed,
} from "./exercise-quick-create";
import { ExercisePreviewThumb } from "./exercise-preview-thumb";
import {
  applyFilters,
  useExerciseFilters,
} from "@/lib/gc-fitness/exercise-filter-state";
import { EQUIPMENT, MUSCLE_GROUPS } from "@/lib/gc-fitness/exercise-vocabulary";

function exerciseDisplayName(row: ExerciseRow): string {
  return row.name.en || row.name.es || "(untitled)";
}

function previewSrc(
  row: Pick<ExerciseRow, "gifUrl" | "imageUrl" | "thumbnailURL">,
): string | null {
  return row.gifUrl ?? row.imageUrl ?? row.thumbnailURL ?? null;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

function seedFromExerciseRow(row: ExerciseRow): QuickCreateSeed {
  return {
    name: row.name.en || row.name.es || "",
    description: row.description.en || row.description.es || "",
    muscleGroup: row.muscleGroups[0] ?? "chest",
    equipment: row.equipment[0] ?? "bodyweight",
    gifUrl: previewSrc(row) ?? "",
  };
}

export interface ExerciseMultiAddDialogProps {
  /** Called with the array of picked exerciseIds when the trainer confirms. */
  onConfirm: (exerciseIds: string[]) => void;
  onQuickCreated?: (exercise: { id: string; name: string }) => void;
  /** Optional className on the trigger button. */
  triggerClassName?: string;
  /** Disable while the parent form is submitting. */
  disabled?: boolean;
}

export function ExerciseMultiAddDialog({
  onConfirm,
  onQuickCreated,
  triggerClassName,
  disabled,
}: ExerciseMultiAddDialogProps) {
  const t = useTranslations("picker");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [seed, setSeed] = useState<QuickCreateSeed | null>(null);
  const [forceQuickCreate, setForceQuickCreate] = useState(false);
  const { data, isLoading, error, hasSnapshot } = useExercisesQuery();
  const queryClient = useQueryClient();
  // Muscle-group + equipment filters — reuse the same state + matching logic
  // as the single-add picker so both surfaces behave identically.
  const { filters, setFilters, isEmpty: filtersEmpty, clear: clearFilters } =
    useExerciseFilters();

  function toggleMuscle(value: string) {
    setFilters((prev) => {
      const next = new Set(prev.muscles);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, muscles: next };
    });
  }
  function toggleEquipment(value: string) {
    setFilters((prev) => {
      const next = new Set(prev.equipment);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, equipment: next };
    });
  }

  const exercises = useMemo(
    () => (data ?? []).filter((r) => r.deleted !== true),
    [data],
  );

  // 260612-r8l (issue #291): apply the chip filters first, THEN searchExercises
  // (filter by relevance AND name-aware rank). Replaces the old coarse
  // fuzzyTokenMatch pass so the multi-add list is ranked best-first and shares
  // the exact normalization/ranking the picker + library use.
  const filtered = useMemo(() => {
    return searchExercises(applyFilters(exercises, filters), search);
  }, [exercises, search, filters]);

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
      setSeed(null);
      setForceQuickCreate(false);
      clearFilters();
    }
  }

  function onSubmit() {
    if (picked.size === 0) return;
    onConfirm(Array.from(picked));
    onCancel(false);
  }

  const showQuickCreate =
    filtered.length === 0 || seed !== null || forceQuickCreate;

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
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
        {/* Muscle-group + equipment filters — mirror the single-add picker. */}
        <div className="rounded-md border p-2">
          <ChipRow
            testId="exercise-multi-add-chip-group-muscles"
            label={t("filterMuscles")}
          >
            {MUSCLE_GROUPS.map((m) => (
              <FilterChip
                key={m}
                active={filters.muscles.has(m)}
                onClick={() => toggleMuscle(m)}
                testId={`exercise-multi-add-chip-muscles-${m}`}
                label={formatLabel(m)}
              />
            ))}
          </ChipRow>
          <ChipRow
            testId="exercise-multi-add-chip-group-equipment"
            label={t("filterEquipment")}
          >
            {EQUIPMENT.map((e) => (
              <FilterChip
                key={e}
                active={filters.equipment.has(e)}
                onClick={() => toggleEquipment(e)}
                testId={`exercise-multi-add-chip-equipment-${e}`}
                label={formatLabel(e)}
              />
            ))}
          </ChipRow>
          {!filtersEmpty ? (
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 gap-1 px-2 text-xs"
                data-testid="exercise-multi-add-clear-filters"
              >
                <X className="h-3 w-3" />
                {t("filterClearAll")}
              </Button>
            </div>
          ) : null}
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
                <li
                  key={ex.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(ex.id)}
                      className="h-4 w-4 rounded border"
                    />
                    <ExercisePreviewThumb src={src} />
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                    onClick={(event) => {
                      event.preventDefault();
                      setSeed(seedFromExerciseRow(ex));
                    }}
                    title="Create a similar exercise from this one"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Create similar
                  </Button>
                </li>
              );
            })
          )}
        </ul>
        {search.trim() !== "" && filtered.length > 0 && !showQuickCreate ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 justify-start gap-1 self-start px-2 text-xs"
            onClick={() => setForceQuickCreate(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("multiAddCreateNew", { term: search.trim() })}
          </Button>
        ) : null}
        {showQuickCreate ? (
          <QuickCreateExercise
            searchTerm={search}
            seed={seed}
            onSeedCleared={() => setSeed(null)}
            onCreated={(created) => {
              // Auto-select the freshly created exercise so the trainer can
              // keep adding more. Crucially: do NOT close the dialog or call
              // onConfirm() — the multi-add flow is supposed to let the
              // trainer batch-pick. Onboarding feedback (May 2026) called
              // out the old behaviour where one quick-create closed the
              // entire dialog with only the new exercise selected, losing
              // every other tick.
              setPicked((prev) => {
                const next = new Set(prev);
                next.add(created.id);
                return next;
              });
              // 260529 — one-shot feed: invalidate so the new exercise is
              // refetched into the list (the live listener used to surface it
              // automatically). Without this the row would stay hidden until
              // the cache went stale.
              void queryClient.invalidateQueries({
                queryKey: EXERCISES_QUERY_KEY,
              });
              // Clear the search so the new exercise is visible in the list
              // (the list filters on the now-stale needle and would hide it).
              setSearch("");
              setSeed(null);
              setForceQuickCreate(false);
              onQuickCreated?.(created);
            }}
          />
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
