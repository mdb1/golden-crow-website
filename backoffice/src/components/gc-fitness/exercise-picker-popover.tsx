"use client";

// exercise-picker-popover.tsx
//
// Single-add exercise picker for the workout-template authoring form.
//
// Why a SEPARATE component instead of widening MultiSelectCombobox (P03-06):
//   - MultiSelectCombobox renders the selected values inside its own
//     trigger as Badge pills — the appropriate UI for "pick multiple muscle
//     groups". The template form's exercise rows ALREADY own the rendered
//     selection (one row per exercise, with sets/reps/rest_seconds inputs).
//     The popover here is purely a PICKER — clicking an exercise appends a
//     new row to the parent useFieldArray and closes the popover.
//   - The list shows a thumbnail + EN/ES name + muscle-group hint per row
//     (mirrors the iOS exercise-picker affordance trainers know from P03).
//   - The thumbnail intentionally uses a Dumbbell icon fallback. P03-06's
//     `columns.tsx` documents the same rationale: resolving `gs://` to a
//     download URL on every row would cost a Cloud Storage round-trip per
//     render. The dropzone polish (PNG first-frame) lands in a future plan.
//
// Reuses shadcn primitives (Popover + Command + CommandInput + CommandList).
//
// Reads exercises via `useExercisesQuery()` — the same Firestore listener
// the /exercises route already mounts. When the picker is used inside the
// /templates route group it will need its OWN `ExerciseQueryProvider`
// because TanStack-Query caches are scoped per `QueryClient`; the
// templates page wraps the form in such a provider (see
// `/templates/new/page.tsx`).
//
// 260522-mo2 Task D: preview source resolution now prefers gifUrl >
// imageUrl > thumbnailURL, with `unoptimized` set for animated GIFs so
// Next's image optimizer doesn't strip frames. BOTH the inner src= prop
// AND the outer conditional in the popover row + trigger-selected blocks
// reference `previewSrc(row)` — do not bisect them or one branch
// (gif-only: gifUrl set, thumbnailURL null) will silently hide the
// preview.
//
// SOFT-DELETE FILTER: exercises with `deleted: true` are excluded — a
// trainer should not be able to attach a deleted exercise to a new
// template. The existing template list (where a deleted exercise is
// already referenced) preserves the snapshot via Pattern 3. Curation-pass
// soft-deletes (`deletedAt != null`, written by 260522-hi5 Task B) are
// already filtered server-side by `exercises-listener.ts`; the
// `deleted !== true` filter below adds the legacy trainer-authored
// sentinel guard.
//
// BILINGUAL SEARCH (260522-hi5 Task C): the Command fuzzy-search `value`
// now concatenates the canonical names, muscle groups, keywords, tags, and
// variations, then runs them through `normalizeSearchText` (lowercases +
// strips Latin diacritics) so typing "sentadilla" or "shoulder press"
// surfaces the standard-library rows even if the stored name is
// "Military Standing Press". Each row visibly displays the EN name as the
// primary label and the ES name as a secondary muted line below — only when
// the ES name is non-empty AND different from the EN name (so
// legitimately-same-in-both-languages survivors like "Plank" don't render
// a redundant duplicate line).

import { useMemo, useState } from "react";
import { ChevronsUpDown, Copy, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useQueryClient } from "@tanstack/react-query";
import {
  useExercisesQuery,
  EXERCISES_QUERY_KEY,
  type ExerciseRow,
} from "@/lib/gc-fitness/exercises-listener";
import {
  searchExercises,
  normalizeSearchText,
} from "@/lib/gc-fitness/exercise-search";
// Re-export the legacy helper names so existing consumers that import them
// from THIS component keep working (exercise-multi-add-dialog.tsx and the
// legacy src/lib/gc-fitness/__tests__/exercise-picker-popover.test.tsx).
// The implementations now live in exercise-search.ts (issue #291).
export {
  normalizeSearchText,
  fuzzyTokenScore,
  fuzzyTokenMatch,
} from "@/lib/gc-fitness/exercise-search";
import {
  useExerciseFilters,
  applyFilters,
  type ExerciseFilters,
} from "@/lib/gc-fitness/exercise-filter-state";
import { MUSCLE_GROUPS, EQUIPMENT } from "@/lib/gc-fitness/exercise-vocabulary";
import {
  QuickCreateExercise,
  type QuickCreateSeed,
} from "./exercise-quick-create";
import { ExercisePreviewThumb } from "./exercise-preview-thumb";

// Phase 24-06 Task 3 — render-window cap (Codex MEDIUM). Even with
// lazy GIFs, rendering 250+ rows + 250 inline images strains the popover.
// Hard-cap visible rows at 100; when applyFilters returns more, render
// the first 100 + a "+ N more — refine filter" indicator row so the
// trainer knows to add filters. The full filtered set is still available
// via the hook — the cap is presentation-only.
const RENDER_CAP = 100;

// Phase 24-06 Task 3 — single-select level + mechanic options. Values
// are FEXD vocabulary (level: "beginner" | "intermediate" | "expert",
// mechanic: "compound" | "isolation"). i18n labels come from the picker
// namespace.
const LEVEL_OPTIONS = ["beginner", "intermediate", "expert"] as const;
const MECHANIC_OPTIONS = ["compound", "isolation"] as const;

export interface ExercisePickerPopoverProps {
  /** Currently selected exerciseId (or empty string for "none picked yet"). */
  value: string;
  /**
   * Called with the picked exerciseId. Parent is responsible for closing
   * the popover; this component closes it automatically on select to give
   * the trainer single-action affordance.
   */
  onChange: (exerciseId: string) => void;
  /** Trigger button label when no exercise is selected yet. */
  placeholder?: string;
  disabled?: boolean;
  /** Optional className on the trigger button. */
  className?: string;
  /** Optional aria-label for the trigger (a11y in dense rows). */
  ariaLabel?: string;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

function exerciseDisplayName(row: ExerciseRow): string {
  return row.name.en || row.name.es || "(untitled)";
}

/**
 * Returns the row's Spanish name when it should be rendered as a separate
 * secondary line — non-empty AND meaningfully different from the EN primary.
 * Returns "" otherwise (caller skips rendering the secondary span).
 *
 * "Different" is measured against the lowercased+diacritic-stripped form so a
 * survivor whose ES === EN modulo accents (e.g., "Plank" / "Plank") doesn't
 * render a duplicate line.
 */
export function displayEs(row: ExerciseRow): string {
  const en = (row.name.en ?? "").trim();
  const es = (row.name.es ?? "").trim();
  if (!es) return "";
  if (normalizeSearchText(en) === normalizeSearchText(es)) return "";
  return es;
}

// 260522-mo2 Task D: preview source resolution now prefers gifUrl >
// imageUrl > thumbnailURL. BOTH the inner `src=` prop AND the OUTER
// conditional in the popover row + trigger-selected blocks reference
// `previewSrc(row)` — do not bisect them or gif-only rows (gifUrl set,
// thumbnailURL null) will silently hide the preview (Revision fix #3).
function previewSrc(
  row: Pick<ExerciseRow, "gifUrl" | "imageUrl" | "thumbnailURL">,
): string | null {
  return row.gifUrl ?? row.imageUrl ?? row.thumbnailURL ?? null;
}

// Retained for API parity with `columns.tsx` and possible future
// callsites; NOT used as the `unoptimized` gate in this file anymore
// (see the Image elements below — `unoptimized` is unconditional to keep
// Firebase Storage v2 signed-URL query params intact).
function isGifUrl(url: string | null): boolean {
  return typeof url === "string" && /\.gif(\?|$)/i.test(url);
}
void isGifUrl;

export function ExercisePickerPopover({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: ExercisePickerPopoverProps) {
  const t = useTranslations("picker");
  const effectivePlaceholder = placeholder ?? t("triggerPlaceholder");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [seed, setSeed] = useState<QuickCreateSeed | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading, error, hasSnapshot } = useExercisesQuery();

  // Phase 24-06 Task 3 — filter chip state (muscle/equipment/level/mechanic).
  // Hook owns the immutable Set update contract (Codex MEDIUM); every
  // chip click below goes through setFilters() with `new Set(...)`.
  const { filters, setFilters, isEmpty: filtersEmpty, clear: clearFilters } =
    useExerciseFilters();

  // Filter soft-deleted out + apply the chip filters. The trainer's
  // previously-selected exercise (if it has since been deleted) still
  // resolves via `selected` below so the row keeps showing the name
  // instead of "(untitled)".
  //
  // Codex MEDIUM render-window cap: when the filtered set exceeds 100
  // rows, render only the first 100 and surface a "+ N more — refine
  // filter" indicator so the user knows to narrow.
  // 260612-r8l (issue #291): search now runs BEFORE the render cap. The old
  // code sliced to RENDER_CAP first and let cmdk's internal filter match only
  // the rendered rows, so a row past position 100 in updatedAt-desc order was
  // never surfaced. We apply the chip filters, THEN searchExercises (filter +
  // name-aware rank), THEN cap. The `<Command shouldFilter={false}>` below
  // disables cmdk's internal matcher so it renders exactly the rows we pass.
  const { visible, overflow } = useMemo(() => {
    const live = (data ?? []).filter((r) => r.deleted !== true);
    const ranked = searchExercises(applyFilters(live, filters), search);
    return {
      visible: ranked.slice(0, RENDER_CAP),
      overflow: Math.max(0, ranked.length - RENDER_CAP),
    };
  }, [data, filters, search]);

  // Kept for the empty-state branch: distinguishes "no rows in cache" from
  // "filters narrowed to zero".
  const liveCount = useMemo(
    () => (data ?? []).filter((r) => r.deleted !== true).length,
    [data],
  );

  // Whether the trainer's search yields ZERO matches — drives the inline
  // "Exercise not found. Quick create" panel below. Search is now applied to
  // `visible` upstream (via searchExercises), so an empty `visible` with a
  // non-blank needle IS the no-match signal — no per-row re-check needed.
  const noMatches = useMemo(() => {
    const needle = search.trim();
    if (!needle) return false;
    return visible.length === 0;
  }, [search, visible]);

  const selected = useMemo(
    () => (data ?? []).find((r) => r.id === value) ?? null,
    [data, value],
  );

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
    setSeed(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSearch("");
      setSeed(null);
    }
  }

  function seedFromRow(row: ExerciseRow): QuickCreateSeed {
    return {
      name: row.name.en || row.name.es || "",
      description: row.description.en || row.description.es || "",
      muscleGroup: row.muscleGroups[0] ?? "chest",
      equipment: row.equipment[0] ?? "bodyweight",
      gifUrl: previewSrc(row) ?? "",
    };
  }

  // Phase 24-06 Task 3 — chip toggle helpers (Codex MEDIUM Set mutation
  // safety). EVERY Set update returns a NEW Set instance. Mutating the
  // state Set in place (calling Set#add or Set#delete on the field
  // currently held in React state) does NOT trigger a re-render because
  // the reference is unchanged. The grep gate in the plan acceptance
  // forbids any executable line that calls these methods on the literal
  // state field paths.
  function toggleMuscle(value: string) {
    setFilters((prev) => {
      const next = new Set(prev.muscles);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      // The `next` local is a fresh copy — mutating it before the
      // setFilters return is safe; React still sees a NEW reference.
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
  function toggleLevel(value: string) {
    setFilters((prev) => ({
      ...prev,
      level: prev.level === value ? null : value,
    }));
  }
  function toggleMechanic(value: string) {
    setFilters((prev) => ({
      ...prev,
      mechanic: prev.mechanic === value ? null : value,
    }));
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? effectivePlaceholder}
          disabled={disabled}
          className={cn(
            "h-auto min-h-9 w-full justify-between gap-2 px-3 py-1.5 text-left",
            className,
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2">
              {/* 260527-fot — replaced the inline Image with the shared
                  ExercisePreviewThumb so the trainer gets the same 1s
                  hover preview affordance as everywhere else in the
                  backoffice. The preview popover uses PopoverAnchor
                  (not Trigger) so the parent picker trigger's click
                  still opens the picker. */}
              <ExercisePreviewThumb
                src={previewSrc(selected)}
                alt={exerciseDisplayName(selected)}
                width={40}
                height={24}
              />
              <span className="flex flex-col">
                <span className="font-medium">
                  {exerciseDisplayName(selected)}
                </span>
                {displayEs(selected) && (
                  <span
                    className="text-xs italic text-muted-foreground"
                    data-testid="exercise-picker-trigger-es"
                  >
                    {displayEs(selected)}
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{effectivePlaceholder}</span>
          )}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="flex max-h-[min(80vh,720px)] w-[--radix-popover-trigger-width] flex-col overflow-y-auto p-0"
        align="start"
      >
        {/* Phase 24-06 Task 3 — filter chip row. Renders ABOVE the
            search input so the trainer narrows by FEXD enrichment
            metadata (muscle / equipment / level / mechanic) before
            scanning a long list. */}
        <ExercisePickerFilters
          filters={filters}
          toggleMuscle={toggleMuscle}
          toggleEquipment={toggleEquipment}
          toggleLevel={toggleLevel}
          toggleMechanic={toggleMechanic}
          isEmpty={filtersEmpty}
          onClear={clearFilters}
        />
        <Command
          // 260612-r8l (issue #291) — filtering + ranking now happen
          // EXTERNALLY (searchExercises, applied before the render cap in the
          // `visible` memo). cmdk must NOT re-filter the rows we pass, or it
          // would (a) re-apply its own character-subsequence matcher and (b)
          // only ever see the capped 100 rows. `shouldFilter={false}` makes
          // cmdk render exactly `visible`.
          shouldFilter={false}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={t("searchPlaceholder")}
              className="h-10 border-0 focus:ring-0"
            />
          </div>
          <CommandList>
            {isLoading || !hasSnapshot ? (
              <CommandEmpty>{t("loadingExercises")}</CommandEmpty>
            ) : error ? (
              <CommandEmpty>{t("loadError")}</CommandEmpty>
            ) : liveCount === 0 ? (
              <CommandEmpty>{t("noExercises")}</CommandEmpty>
            ) : (
              <>
                <CommandEmpty>{t("noMatches")}</CommandEmpty>
                <CommandGroup>
                  {visible.map((ex) => {
                    const esLine = displayEs(ex);
                    return (
                      <CommandItem
                        key={ex.id}
                        // `value` is what Command's fuzzy search filters on
                        // — include both EN + ES names + muscle groups so
                        // the trainer can search by Spanish name too. We
                        // normalize (lowercase + strip diacritics) so
                        // "sentadilla" matches "Sentadílla" / "Sentadilla".
                        value={normalizeSearchText(
                          [
                            ex.name.en,
                            ex.name.es,
                            ex.muscleGroups.join(" "),
                          ].join(" "),
                        )}
                        onSelect={() => handleSelect(ex.id)}
                        className="flex items-center gap-3"
                        data-testid={`exercise-picker-row-${ex.id}`}
                      >
                        <ExercisePreviewThumb src={previewSrc(ex)} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">
                            {exerciseDisplayName(ex)}
                          </span>
                          {esLine && (
                            <span
                              className="truncate text-xs italic text-muted-foreground"
                              data-testid={`exercise-picker-es-${ex.id}`}
                            >
                              {esLine}
                            </span>
                          )}
                          {ex.muscleGroups.length > 0 && (
                            <span className="truncate text-xs text-muted-foreground">
                              {ex.muscleGroups.map(formatLabel).join(", ")}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setSeed(seedFromRow(ex));
                          }}
                          title="Create a similar exercise from this one"
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                        >
                          <Copy className="h-3 w-3" />
                          Create similar
                        </button>
                      </CommandItem>
                    );
                  })}
                  {overflow > 0 && (
                    // Phase 24-06 Codex MEDIUM render-window cap — when
                    // applyFilters returns more than RENDER_CAP rows we
                    // render the first 100 + this disabled indicator so
                    // the trainer knows to add filters. The full
                    // filtered set is still available via the hook;
                    // the cap is presentation-only.
                    <CommandItem
                      disabled
                      value="__overflow__"
                      className="justify-center text-xs italic text-muted-foreground"
                      data-testid="exercise-picker-overflow-indicator"
                    >
                      {t("overflowMore", { count: overflow })}
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
        {noMatches || seed !== null ? (
          <div className="border-t p-2">
            <QuickCreateExercise
              searchTerm={search}
              seed={seed}
              onSeedCleared={() => setSeed(null)}
              onCreated={(created) => {
                // 260529 — one-shot feed: invalidate so the new exercise is
                // refetched into the picker list (the live listener used to
                // surface it automatically). Auto-pick + close right away —
                // the trigger label resolves once the refetch lands.
                void queryClient.invalidateQueries({
                  queryKey: EXERCISES_QUERY_KEY,
                });
                handleSelect(created.id);
              }}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Phase 24-06 Task 3 — ExercisePickerFilters (inline sibling component).
//
// Renders 4 chip categories above the picker search input. Inline because
// the component is small (~80 LOC), only used by ExercisePickerPopover,
// and shares the `picker` translation namespace with its parent (lifting
// to its own file would require duplicating the i18n wiring).
//
// Uses shadcn <Button variant=outline> sized via `size=sm` for the chips
// (NOT shadcn ToggleGroup — minimal-add per 24-RESEARCH.md). Multi-select
// chips render as "selected" via `variant=default`; single-select chips
// flip between `variant=outline` and `variant=default` on selection.
// ---------------------------------------------------------------------------

interface ExercisePickerFiltersProps {
  filters: ExerciseFilters;
  toggleMuscle: (value: string) => void;
  toggleEquipment: (value: string) => void;
  toggleLevel: (value: string) => void;
  toggleMechanic: (value: string) => void;
  isEmpty: boolean;
  onClear: () => void;
}

function ExercisePickerFilters({
  filters,
  toggleMuscle,
  toggleEquipment,
  toggleLevel,
  toggleMechanic,
  isEmpty,
  onClear,
}: ExercisePickerFiltersProps) {
  const t = useTranslations("picker");

  return (
    <div className="border-b p-2">
      {/* Muscles (multi-select) */}
      <ChipRow
        testId="exercise-picker-chip-group-muscles"
        label={t("filterMuscles")}
      >
        {MUSCLE_GROUPS.map((m) => (
          <FilterChip
            key={m}
            active={filters.muscles.has(m)}
            onClick={() => toggleMuscle(m)}
            testId={`exercise-picker-chip-muscles-${m}`}
            label={formatLabel(m)}
          />
        ))}
      </ChipRow>

      {/* Equipment (multi-select) */}
      <ChipRow
        testId="exercise-picker-chip-group-equipment"
        label={t("filterEquipment")}
      >
        {EQUIPMENT.map((e) => (
          <FilterChip
            key={e}
            active={filters.equipment.has(e)}
            onClick={() => toggleEquipment(e)}
            testId={`exercise-picker-chip-equipment-${e}`}
            label={formatLabel(e)}
          />
        ))}
      </ChipRow>

      {/* Level (single-select) */}
      <ChipRow
        testId="exercise-picker-chip-group-level"
        label={t("filterLevel")}
      >
        {LEVEL_OPTIONS.map((lvl) => (
          <FilterChip
            key={lvl}
            active={filters.level === lvl}
            onClick={() => toggleLevel(lvl)}
            testId={`exercise-picker-chip-level-${lvl}`}
            label={t(
              lvl === "beginner"
                ? "levelBeginner"
                : lvl === "intermediate"
                  ? "levelIntermediate"
                  : "levelExpert",
            )}
          />
        ))}
      </ChipRow>

      {/* Mechanic (single-select) */}
      <ChipRow
        testId="exercise-picker-chip-group-mechanic"
        label={t("filterMechanic")}
      >
        {MECHANIC_OPTIONS.map((mech) => (
          <FilterChip
            key={mech}
            active={filters.mechanic === mech}
            onClick={() => toggleMechanic(mech)}
            testId={`exercise-picker-chip-mechanic-${mech}`}
            label={t(
              mech === "compound" ? "mechanicCompound" : "mechanicIsolation",
            )}
          />
        ))}
      </ChipRow>

      {/* Clear-all affordance only when any filter is active. */}
      {!isEmpty && (
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 gap-1 px-2 text-xs"
            data-testid="exercise-picker-clear-filters"
          >
            <X className="h-3 w-3" />
            {t("filterClearAll")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ChipRow({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1 last:mb-0" data-testid={testId}>
      <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  testId,
  label,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="h-6 px-2 text-[11px]"
      data-testid={testId}
      aria-pressed={active}
    >
      {label}
    </Button>
  );
}
