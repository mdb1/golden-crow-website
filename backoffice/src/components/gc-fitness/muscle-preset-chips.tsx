"use client";

// muscle-preset-chips.tsx
//
// One-tap muscle "focus" presets for filter surfaces (#299). The flat list of 17
// muscle groups is confusing, so we let a trainer tap Push / Pull / Legs / Arms /
// etc. and have it expand to that group's muscles. Reuses the SAME
// `MUSCLE_PRESETS` source the workout generator's Step 2 uses — no new vocab — so
// the grouping stays consistent everywhere.
//
// Stateless: it operates on the caller's `muscleGroups` selection. A preset chip
// reads as ACTIVE when ALL its muscles are currently selected; tapping it toggles
// the union in/out. The caller still renders the individual-muscle multi-select
// underneath (two-tier UX, mirroring the generator), so hand-picking single
// muscles keeps working.

import { useLocale } from "next-intl";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { MUSCLE_PRESETS } from "@/lib/gc-fitness/workout-generator/muscle-presets";

export interface MusclePresetChipsProps {
  /** Currently-selected muscle groups (the same array the muscle filter drives). */
  value: readonly string[];
  /** Receives the next selection after a preset is toggled. */
  onChange: (next: string[]) => void;
  className?: string;
}

export function MusclePresetChips({
  value,
  onChange,
  className,
}: MusclePresetChipsProps) {
  const locale = useLocale();
  const selected = new Set(value);

  function togglePreset(muscles: string[], full: boolean) {
    const next = new Set(selected);
    if (full) muscles.forEach((m) => next.delete(m));
    else muscles.forEach((m) => next.add(m));
    onChange(Array.from(next));
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {MUSCLE_PRESETS.map((preset) => {
        const full = preset.muscles.every((m) => selected.has(m));
        const label = locale === "es" ? preset.label.es : preset.label.en;
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={full}
            onClick={() => togglePreset(preset.muscles, full)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              full
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-foreground/30",
            )}
          >
            {full ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
