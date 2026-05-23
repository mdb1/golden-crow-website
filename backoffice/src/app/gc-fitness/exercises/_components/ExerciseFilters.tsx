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
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  MUSCLE_GROUPS,
  EQUIPMENT,
} from "@/lib/gc-fitness/exercise-vocabulary";
import { MultiSelectCombobox } from "./MultiSelectCombobox";

const STORAGE_KEY = "gc-fitness:exercise-filters";
const SEARCH_DEBOUNCE_MS = 200;

export interface ExerciseFiltersState {
  search: string;
  muscleGroups: string[];
  equipment: string[];
  source: string[]; // subset of ['wger', 'Custom']
}

const EMPTY: ExerciseFiltersState = {
  search: "",
  muscleGroups: [],
  equipment: [],
  source: [],
};

function readFromStorage(): ExerciseFiltersState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExerciseFiltersState>;
    // Shallow-validate the shape — drop unknown fields, default missing.
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      muscleGroups: Array.isArray(parsed.muscleGroups)
        ? parsed.muscleGroups.filter((v): v is string => typeof v === "string")
        : [],
      equipment: Array.isArray(parsed.equipment)
        ? parsed.equipment.filter((v): v is string => typeof v === "string")
        : [],
      source: Array.isArray(parsed.source)
        ? parsed.source.filter((v): v is string => typeof v === "string")
        : [],
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
  const [state, setState] = useState<ExerciseFiltersState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // 1. Hydrate from localStorage post-mount (SSR safety).
  useEffect(() => {
    const stored = readFromStorage();
    if (stored) {
      setState(stored);
    }
    setHydrated(true);
  }, []);

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
    state.muscleGroups.length + state.equipment.length + state.source.length;
  const showClear = activeCount > 0 || state.search.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      {/* Search input — leading icon, full width on small screens */}
      <div className="relative">
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
          className="pl-9"
        />
      </div>

      {/* 3 combobox filters + clear button */}
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
            options={["wger", "Custom"] as const}
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
