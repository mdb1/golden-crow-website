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
// already referenced) preserves the snapshot via Pattern 3.

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
              <span className="font-medium">{exerciseDisplayName(selected)}</span>
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
                  {exercises.map((ex) => (
                    <CommandItem
                      key={ex.id}
                      // `value` is what Command's fuzzy search filters on —
                      // include both EN + ES names + muscle groups so the
                      // trainer can search by Spanish name too.
                      value={`${ex.name.en} ${ex.name.es} ${ex.muscleGroups.join(" ")}`}
                      onSelect={() => handleSelect(ex.id)}
                      className="flex items-center gap-3"
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
                        {ex.muscleGroups.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {ex.muscleGroups.map(formatLabel).join(", ")}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
