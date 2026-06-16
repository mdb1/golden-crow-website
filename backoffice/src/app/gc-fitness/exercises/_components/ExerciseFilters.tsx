"use client";

// ExerciseFilters.tsx
//
// Filter bar above the TanStack Table: search + 3 multi-select comboboxes
// (muscle / equipment / source) + Clear button.
//
// Filters do NOT persist across visits (user request): every time the
// Biblioteca is entered the bar starts EMPTY — a stale "squat" search from a
// previous visit was confusing. State lives in component state only. The
// `?owner=mine` URL param still seeds the "Created by me" filter on first
// mount so the dashboard "Custom exercises" tile lands on the filtered view.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  MUSCLE_GROUPS,
  EQUIPMENT,
} from "@/lib/gc-fitness/exercise-vocabulary";
import { MusclePresetChips } from "@/components/gc-fitness/muscle-preset-chips";
import { MultiSelectCombobox } from "./MultiSelectCombobox";

const SEARCH_DEBOUNCE_MS = 200;

export interface ExerciseFiltersState {
  search: string;
  muscleGroups: string[];
  equipment: string[];
  source: string[]; // subset of ['Standard', 'Custom']
  mineOnly: boolean;
  favoritesOnly: boolean;
}

const EMPTY: ExerciseFiltersState = {
  search: "",
  muscleGroups: [],
  equipment: [],
  source: [],
  mineOnly: false,
  favoritesOnly: false,
};

export interface ExerciseFiltersProps {
  onChange: (next: ExerciseFiltersState) => void;
}

export function ExerciseFilters({ onChange }: ExerciseFiltersProps) {
  const t = useTranslations("exercises.filters");
  const searchParams = useSearchParams();
  const ownerParam = searchParams?.get("owner") ?? null;
  const [state, setState] = useState<ExerciseFiltersState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // Start EMPTY on every mount (no persistence). `?owner=mine` seeds the
  // "Created by me" filter so the dashboard "Custom exercises" tile lands
  // on the filtered view.
  useEffect(() => {
    setState(ownerParam === "mine" ? { ...EMPTY, mineOnly: true } : EMPTY);
    setHydrated(true);
  }, [ownerParam]);

  // Debounce the search input → onChange so the table doesn't re-filter
  //    on every keystroke. Other filters fire immediately.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => onChange(state), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, hydrated, onChange]);

  const clear = () => {
    setState(EMPTY);
  };

  const activeCount =
    state.muscleGroups.length +
    state.equipment.length +
    state.source.length +
    (state.mineOnly ? 1 : 0) +
    (state.favoritesOnly ? 1 : 0);
  const showClear = activeCount > 0 || state.search.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-[1.25rem] border border-border bg-card p-3 shadow-sm">
      {/* Search row — filter icon + rounded-full search + Todos / Creados por
          mí pill toggle, matching the redesign reference. */}
      <div className="flex flex-wrap items-center gap-3">
        <SlidersHorizontal
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <div className="relative min-w-[180px] flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            value={state.search}
            onChange={(e) =>
              setState((s) => ({ ...s, search: e.target.value }))
            }
            aria-label={t("searchAria")}
            className="h-10 rounded-full pl-9"
          />
        </div>
        <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/70 p-1">
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, mineOnly: false }))}
            data-active={!state.mineOnly}
            className={cn(
              "min-h-9 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              !state.mineOnly
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("allLabel")}
          </button>
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, mineOnly: true }))}
            data-active={state.mineOnly}
            className={cn(
              "min-h-9 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              state.mineOnly
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("mineOnlyLabel")}
          </button>
        </div>
        {/* #297 — favorites-only toggle. Independent of the All/Mine pill. */}
        <button
          type="button"
          onClick={() =>
            setState((s) => ({ ...s, favoritesOnly: !s.favoritesOnly }))
          }
          aria-pressed={state.favoritesOnly}
          aria-label={t("favoritesOnlyAria")}
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            state.favoritesOnly
              ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300 dark:bg-amber-400/15 dark:text-amber-300"
              : "bg-muted/70 text-muted-foreground hover:text-foreground",
          )}
        >
          <Star
            className={cn(
              "h-4 w-4",
              state.favoritesOnly ? "fill-amber-400 text-amber-500" : "",
            )}
            aria-hidden="true"
          />
          {t("favoritesOnlyLabel")}
        </button>
      </div>

      {/* Muscle "focus" presets (#299): one tap selects a group's muscles, e.g.
          Push → chest + shoulders + triceps. Drives the same `muscleGroups`
          selection as the combobox below (two-tier, like the generator). */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("focusLabel")}
        </span>
        <MusclePresetChips
          value={state.muscleGroups}
          onChange={(next) =>
            setState((s) => ({ ...s, muscleGroups: next }))
          }
        />
      </div>

      {/* Advanced filters: muscle / equipment / source comboboxes + clear */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[180px]">
          <MultiSelectCombobox
            options={MUSCLE_GROUPS}
            value={state.muscleGroups}
            onChange={(next) =>
              setState((s) => ({ ...s, muscleGroups: next }))
            }
            placeholder={
              state.muscleGroups.length === 0
                ? t("muscleGroupsPlaceholder")
                : t("muscleGroupsPlaceholderCount", {
                    count: state.muscleGroups.length,
                  })
            }
            ariaLabel={t("muscleGroupsAria")}
            max={8}
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <MultiSelectCombobox
            options={EQUIPMENT}
            value={state.equipment}
            onChange={(next) =>
              setState((s) => ({ ...s, equipment: next }))
            }
            placeholder={
              state.equipment.length === 0
                ? t("equipmentPlaceholder")
                : t("equipmentPlaceholderCount", {
                    count: state.equipment.length,
                  })
            }
            ariaLabel={t("equipmentAria")}
            max={8}
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <MultiSelectCombobox
            options={["Standard", "Custom"] as const}
            value={state.source}
            onChange={(next) => setState((s) => ({ ...s, source: next }))}
            placeholder={
              state.source.length === 0
                ? t("sourcePlaceholder")
                : t("sourcePlaceholderCount", { count: state.source.length })
            }
            ariaLabel={t("sourceAria")}
            max={2}
            formatLabel={(s) => s}
          />
        </div>
        {showClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            aria-label={t("clearAria")}
            className="gap-1"
          >
            <X className="h-4 w-4" />
            {t("clearCta")}
          </Button>
        )}
      </div>
    </div>
  );
}
