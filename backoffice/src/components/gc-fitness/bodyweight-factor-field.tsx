"use client";

// bodyweight-factor-field.tsx — #1307 «% del peso corporal para el volumen».
//
// Shared by the full exercise editor and the quick-create panel. Controlled:
// `percent` is null while the coach hasn't typed anything, in which case the
// field shows (and the caller persists) the suggestion for the primary muscle.

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface BodyweightFactorFieldProps {
  /** Explicit percentage (0–100) or null = follow the suggestion. */
  percent: number | null;
  /** Suggested percentage for the current primary muscle. */
  suggestedPercent: number;
  onChange: (percent: number | null) => void;
  disabled?: boolean;
}

export function BodyweightFactorField({
  percent,
  suggestedPercent,
  onChange,
  disabled,
}: BodyweightFactorFieldProps) {
  const t = useTranslations("exercises.form");
  const id = useId();
  const [showExplainer, setShowExplainer] = useState(false);
  // While typing, the raw text wins (so "" or "7" on the way to "70" don't
  // snap back to the suggestion); on blur it settles onto the 5% grid.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(percent ?? suggestedPercent);

  return (
    <div className="flex flex-col gap-2" data-testid="bodyweight-factor-field">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{t("bodyweightFactorLabel")}</Label>
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          aria-expanded={showExplainer}
          onClick={() => setShowExplainer((v) => !v)}
        >
          {t("bodyweightFactorWhatIsThis")}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={5}
          className="w-24"
          value={shown}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            if (raw.trim() === "") return;
            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            onChange(Math.min(100, Math.max(0, n)));
          }}
          onBlur={() => {
            // Blank ⇒ back to the suggestion; else snap to the 5% grid the
            // wire stores.
            if (draft !== null && draft.trim() === "") onChange(null);
            else if (percent !== null) onChange(Math.round(percent / 5) * 5);
            setDraft(null);
          }}
        />
        <span className="text-sm text-muted-foreground">%</span>
        {percent !== null && percent !== suggestedPercent && !disabled ? (
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => onChange(null)}
          >
            {t("bodyweightFactorUseSuggested", { pct: suggestedPercent })}
          </button>
        ) : null}
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t("bodyweightFactorHint", { pct: suggestedPercent })}
      </p>
      {showExplainer ? (
        <p className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          {t("bodyweightFactorExplainer")}
        </p>
      ) : null}
    </div>
  );
}
