"use client";

// template-tags-picker.tsx
//
// Multi-tag chips input for the workout-template form. Replaces the
// previous single Input+datalist combo. Behaviours:
//
//   - Trainer types free text and commits a tag with Enter, comma, or blur.
//   - Each committed tag renders as a pill with an X-to-remove button.
//   - Existing tags across the trainer's templates are surfaced as
//     clickable suggestions below the input (deduped + sorted, current
//     selection excluded).
//   - Defaults from `DEFAULT_TAG_SUGGESTIONS` ensure the trainer sees a
//     useful starter set even when they haven't authored anything yet.
//
// Storage:
//   - Source of truth is the parent RHF field `tags: string[]`.
//   - Trim + dedupe at commit time (case-insensitive match against the
//     existing tags list).
//   - Bounded at 8 entries to match the Zod cap; further commits are
//     silently no-op'd.

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_TAGS = 8;

// Surfaced as the always-present baseline suggestion bank, even when the
// trainer's library is empty. Stays in sync with the legacy datalist set.
const DEFAULT_TAG_SUGGESTIONS = [
  "push",
  "pull",
  "legs",
  "upper",
  "lower",
  "full-body",
  "custom",
];

export interface TemplateTagsPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Existing tags discovered across other templates. Deduped + filtered
   *  against the current value to render the suggestion strip. */
  existingTags: string[];
  /** Translated placeholder shown in the text input. */
  placeholder: string;
  /** Translated label for the "X" remove button (a11y). */
  removeAriaLabel: (tag: string) => string;
  /** Translated label for the "suggestions" header. */
  suggestionsLabel: string;
}

export function TemplateTagsPicker({
  value,
  onChange,
  existingTags,
  placeholder,
  removeAriaLabel,
  suggestionsLabel,
}: TemplateTagsPickerProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const lowerValue = useMemo(
    () => new Set(value.map((t) => t.toLowerCase())),
    [value],
  );

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of [...existingTags, ...DEFAULT_TAG_SUGGESTIONS]) {
      const trimmed = tag.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      if (lowerValue.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [existingTags, lowerValue]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (value.length >= MAX_TAGS) return;
    if (lowerValue.has(trimmed.toLowerCase())) {
      // Already present — clear the draft so the trainer can keep typing
      // the next tag without a stale prefix.
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          // Allow committing via comma without explicitly hitting Enter —
          // matches the common chip-input UX (e.g., Gmail recipients).
          if (raw.endsWith(",")) {
            commit(raw.slice(0, -1));
            return;
          }
          setDraft(raw);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Don't submit the parent form; just commit the chip.
            e.preventDefault();
            commit(draft);
            return;
          }
          if (e.key === "Backspace" && draft === "" && value.length > 0) {
            // Power-user: clear the last chip when the input is empty.
            e.preventDefault();
            remove(value[value.length - 1]);
          }
        }}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
      />
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 pl-2.5 pr-1 capitalize"
            >
              <span>{tag}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={removeAriaLabel(tag)}
                className="h-4 w-4 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => remove(tag)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      ) : null}
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {suggestionsLabel}
          </span>
          {suggestions.slice(0, 16).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => commit(tag)}
              disabled={value.length >= MAX_TAGS}
              className="inline-flex items-center rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
