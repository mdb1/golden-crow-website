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
// concatenates the EN name, ES name (committed to Firestore by Task B),
// and muscle group tokens, then runs them through `normalizeSearchText`
// (lowercases + strips Latin diacritics) so typing "sentadilla" matches
// "Sentadílla" / "SENTADILLA" / "Sentadilla". Each row visibly displays
// the EN name as the primary label and the ES name as a secondary muted
// line below — only when the ES name is non-empty AND different from the
// EN name (so legitimately-same-in-both-languages survivors like "Plank"
// don't render a redundant duplicate line).

import { useMemo, useState } from "react";
import Image from "next/image";
import { Dumbbell, ChevronsUpDown, Search } from "lucide-react";

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

import {
  useExercisesQuery,
  type ExerciseRow,
} from "@/lib/gc-fitness/exercises-listener";

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

/**
 * Lowercases + strips Latin diacritics + collapses whitespace. Used both
 * inside the Command `value` prop (so the fuzzy-matcher sees normalized
 * input AND normalized haystack) and in `displayEs` to decide whether the
 * ES line is meaningfully different from EN.
 *
 * Examples:
 *   "Sentadílla"        -> "sentadilla"
 *   "Press de banca"    -> "press de banca"
 *   "  Squat  "         -> "squat"
 */
export function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function previewUrl(url?: string | null): string | null {
  if (typeof url === "string" && /^https?:\/\//.test(url)) {
    return url;
  }
  return null;
}

export function ExercisePickerPopover({
  value,
  onChange,
  placeholder = "Pick an exercise…",
  disabled,
  className,
  ariaLabel,
}: ExercisePickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, hasSnapshot } = useExercisesQuery();

  // Filter soft-deleted out — the picker only shows currently-active
  // exercises. The trainer's previously-selected exercise (if it has since
  // been deleted) still resolves via `selected` below so the row keeps
  // showing the name instead of "(untitled)".
  const exercises = useMemo(() => {
    return (data ?? []).filter((r) => r.deleted !== true);
  }, [data]);

  const selected = useMemo(
    () => (data ?? []).find((r) => r.id === value) ?? null,
    [data, value],
  );

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          className={cn(
            "h-auto min-h-9 w-full justify-between gap-2 px-3 py-1.5 text-left",
            className,
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-6 w-10 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted/40 text-muted-foreground"
              >
                {previewUrl(selected.thumbnailURL) ? (
                  <Image
                    src={previewUrl(selected.thumbnailURL)!}
                    alt=""
                    width={40}
                    height={24}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Dumbbell className="h-3 w-3" />
                )}
              </span>
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
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Search exercises…"
              className="h-10 border-0 focus:ring-0"
            />
          </div>
          <CommandList>
            {isLoading || !hasSnapshot ? (
              <CommandEmpty>Loading exercises…</CommandEmpty>
            ) : error ? (
              <CommandEmpty>Couldn&apos;t load exercises.</CommandEmpty>
            ) : exercises.length === 0 ? (
              <CommandEmpty>
                No exercises yet. Add one in the library first.
              </CommandEmpty>
            ) : (
              <>
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup>
                  {exercises.map((ex) => {
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
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted/40 text-muted-foreground"
                        >
                          {previewUrl(ex.thumbnailURL) ? (
                            <Image
                              src={previewUrl(ex.thumbnailURL)!}
                              alt=""
                              width={48}
                              height={28}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Dumbbell className="h-3 w-3" />
                          )}
                        </span>
                        <span className="flex flex-col">
                          <span className="font-medium">
                            {exerciseDisplayName(ex)}
                          </span>
                          {esLine && (
                            <span
                              className="text-xs italic text-muted-foreground"
                              data-testid={`exercise-picker-es-${ex.id}`}
                            >
                              {esLine}
                            </span>
                          )}
                          {ex.muscleGroups.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {ex.muscleGroups.map(formatLabel).join(", ")}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
