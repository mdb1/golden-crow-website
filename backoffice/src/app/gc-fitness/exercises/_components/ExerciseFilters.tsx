"use client";

// ExerciseFilters.tsx
//
// Filter bar above the TanStack Table: search + 3 multi-select comboboxes
// (muscle / equipment / source) + Clear button. State is mirrored into
// localStorage under the key `gc-fitness:exercise-filters` so the trainer's
// filter selection survives reloads / new tabs (UI-SPEC + 03-CONTEXT.md).
//
// Hydration safety: localStorage is unavailable during SSR. We hydrate the
// initial state from localStorage inside a `useEffect` (post-mount), with
// try/catch around `JSON.parse` so a corrupted/upgraded payload doesn't
// trip the entire route. The empty-default render hits the server fine;
// the post-hydration update lands one render later.

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

const STORAGE_KEY = "gc-fitness:exercise-filters";
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

function readFromStorage(): ExerciseFiltersState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExerciseFiltersState>;
    const normalizedSource = Array.isArray(parsed.source)
      ? parsed.source
          .filter((v): v is string => typeof v === "string")
          .map((v) => (v === "wger" ? "Standard" : v))
      : [];
    // Shallow-validate the shape — drop unknown fields, default missing.
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      muscleGroups: Array.isArray(parsed.muscleGroups)
        ? parsed.muscleGroups.filter((v): v is string => typeof v === "string")
        : [],
      equipment: Array.isArray(parsed.equipment)
        ? parsed.equipment.filter((v): v is string => typeof v === "string")
        : [],
      source: normalizedSource,
      mineOnly: parsed.mineOnly === true,
      favoritesOnly: parsed.favoritesOnly === true,
    };
  } catch {
    // Corrupted entry — wipe + start clean.
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore — quota / disabled */
    }
    return null;
  }
}

function writeToStorage(state: ExerciseFiltersState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — accept silently */
  }
}

export interface ExerciseFiltersProps {
  onChange: (next: ExerciseFiltersState) => void;
}

export function ExerciseFilters({ onChange }: ExerciseFiltersProps) {
  const t = useTranslations("exercises.filters");
  const searchParams = useSearchParams();
  const ownerParam = searchParams?.get("owner") ?? null;
  const [state, setState] = useState<ExerciseFiltersState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // 1. Hydrate from localStorage post-mount (SSR safety). `?owner=mine` in
  //    the URL always wins over a stale stored preference so the dashboard
  //    "Custom exercises" tile reliably lands on the filtered view.
  useEffect(() => {
    const stored = readFromStorage();
    const base = stored ?? EMPTY;
    if (ownerParam === "mine") {
      setState({ ...base, mineOnly: true });
    } else {
      setState(base);
    }
    setHydrated(true);
  }, [ownerParam]);

  // 2. Persist + notify parent on every change. Debounce search-text writes
  //    only — array selects fire on user click, so flush immediately.
  useEffect(() => {
    if (!hydrated) return;
    writeToStorage(state);
  }, [state, hydrated]);

  // 3. Debounce the search input → onChange so the table doesn't re-filter
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
