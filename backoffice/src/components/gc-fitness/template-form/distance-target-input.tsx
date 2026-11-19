"use client";

// gc-fitness #1649 — per-set TARGET distance for a cardio (time + distance) row of the
// template form. The coach types km (the authoring unit, like kg); the form stores whole
// METERS in `distanceBySetMeters[setIdx]` (0 = no target). Blank = no target.

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { parseDecimalInput } from "@/lib/gc-fitness/decimal-input";
import { distanceNumber, metersFromInput } from "@/lib/gc-fitness/distance-format";

export function DistanceTargetInput({
  meters,
  onCommit,
  ariaLabel,
  placeholder,
  locale,
  setKey,
}: {
  meters: number | undefined;
  onCommit: (meters: number) => void;
  ariaLabel: string;
  placeholder: string;
  locale: string;
  setKey: string;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const committed =
    typeof meters === "number" && Number.isFinite(meters) && meters > 0
      ? distanceNumber(meters, "kg", locale)
      : "";
  return (
    <Input
      type="text"
      inputMode="decimal"
      className="h-10"
      placeholder={placeholder}
      data-set-input="distance"
      data-set-key={setKey}
      value={draft ?? committed}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw !== "" && !Number.isFinite(parseDecimalInput(raw))) return;
        setDraft(e.target.value);
      }}
      onBlur={() => {
        if (draft !== undefined) {
          const raw = draft.trim();
          const parsed = raw === "" ? 0 : parseDecimalInput(raw);
          onCommit(Number.isFinite(parsed) ? metersFromInput(parsed, "kg") : 0);
        }
        setDraft(undefined);
      }}
      aria-label={ariaLabel}
    />
  );
}
