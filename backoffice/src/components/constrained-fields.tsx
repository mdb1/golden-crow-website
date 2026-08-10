"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { CommunityTagPill } from "@/components/community-tag-pill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColorOption, PickerOption } from "@/lib/admin-option-catalog";
import { cn } from "@/lib/utils";

const EMPTY_OPTION_VALUE = "__empty__";

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function ensureCurrentOption(options: PickerOption[], currentValue: string) {
  if (!currentValue.trim()) {
    return options;
  }

  if (options.some((option) => option.value === currentValue)) {
    return options;
  }

  return [
    {
      value: currentValue,
      label: `${currentValue} (current value)`,
    },
    ...options,
  ];
}

function GenericPill({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded-full border border-border/80 bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground">
      {label}
    </span>
  );
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function OptionSelectField({
  options,
  value,
  onChange,
  placeholder,
  emptyLabel = "Not set",
  disabled = false,
}: {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const resolvedOptions = useMemo(
    () => ensureCurrentOption(options, value),
    [options, value]
  );
  const selectedLabel = value.trim()
    ? resolvedOptions.find((option) => option.value === value)?.label
    : emptyLabel;

  return (
    <Select
      value={value.trim() ? value : EMPTY_OPTION_VALUE}
      onValueChange={(nextValue) =>
        onChange(nextValue === EMPTY_OPTION_VALUE ? "" : nextValue)
      }
      disabled={disabled}
    >
      <SelectTrigger className="w-full" disabled={disabled}>
        <SelectValue placeholder={placeholder}>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_OPTION_VALUE}>{emptyLabel}</SelectItem>
        {resolvedOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ColorPaletteField({
  colors,
  value,
  onChange,
}: {
  colors: ColorOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const resolvedColors = useMemo(() => {
    if (!value.trim() || colors.some((option) => option.hex === value)) {
      return colors;
    }

    return [{ hex: value, name: `${value} (current)` }, ...colors];
  }, [colors, value]);

  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {resolvedColors.map((option) => {
        const selected = option.hex === value;

        return (
          <button
            key={option.hex}
            type="button"
            onClick={() => onChange(option.hex)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border px-2 py-2 text-center text-[11px] transition-colors",
              selected
                ? "border-foreground/25 bg-card shadow-[0_10px_24px_rgba(9,12,18,0.08)]"
                : "border-border/70 bg-card/50 hover:border-foreground/15"
            )}
            aria-pressed={selected}
            title={option.name}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full border"
              style={{
                backgroundColor: option.hex,
                borderColor: selected ? hexToRgba(option.hex, 0.7) : hexToRgba(option.hex, 0.3),
                boxShadow: selected ? `0 0 0 3px ${hexToRgba(option.hex, 0.18)}` : undefined,
              }}
            >
              {selected ? <Check className="h-3.5 w-3.5 text-white" /> : null}
            </span>
            <span className="line-clamp-2 text-[11px] leading-tight text-foreground">
              {option.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MultiValuePickerField({
  title,
  description,
  value,
  onChange,
  options,
  triggerLabel,
  searchPlaceholder,
  customStorageKey,
  customPlaceholder,
  allowCustom = false,
  pillTone = "neutral",
}: {
  title: string;
  description: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: string[];
  triggerLabel: string;
  searchPlaceholder: string;
  customStorageKey?: string;
  customPlaceholder?: string;
  allowCustom?: boolean;
  pillTone?: "neutral" | "community";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customOptions, setCustomOptions] = useState<string[]>([]);

  useEffect(() => {
    if (!customStorageKey) {
      return;
    }

    const raw = window.localStorage.getItem(customStorageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setCustomOptions(
          parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        );
      }
    } catch {
      window.localStorage.removeItem(customStorageKey);
    }
  }, [customStorageKey]);

  const mergedOptions = useMemo(() => {
    const pool = [...options, ...customOptions, ...value];
    const seen = new Set<string>();
    return pool.filter((entry) => {
      const token = normalizeToken(entry);
      if (!token || seen.has(token)) {
        return false;
      }
      seen.add(token);
      return true;
    });
  }, [customOptions, options, value]);

  const filteredOptions = useMemo(() => {
    const token = normalizeToken(query);
    if (!token) {
      return mergedOptions;
    }

    return mergedOptions.filter((entry) => normalizeToken(entry).includes(token));
  }, [mergedOptions, query]);

  function toggleEntry(entry: string) {
    const exists = value.some((selected) => normalizeToken(selected) === normalizeToken(entry));
    if (exists) {
      onChange(value.filter((selected) => normalizeToken(selected) !== normalizeToken(entry)));
      return;
    }

    onChange([...value, entry]);
  }

  function addCustomEntry() {
    const trimmed = customValue.trim();
    if (!trimmed) {
      return;
    }

    const normalized = normalizeToken(trimmed);
    const alreadyExists = mergedOptions.some(
      (entry) => normalizeToken(entry) === normalized
    );

    if (!alreadyExists) {
      const nextCustomOptions = [...customOptions, trimmed];
      setCustomOptions(nextCustomOptions);
      if (customStorageKey) {
        window.localStorage.setItem(customStorageKey, JSON.stringify(nextCustomOptions));
      }
    }

    if (!value.some((selected) => normalizeToken(selected) === normalized)) {
      onChange([...value, trimmed]);
    }

    setCustomValue("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {value.length > 0 ? (
          value.map((entry) =>
            pillTone === "community" ? (
              <CommunityTagPill key={entry} label={entry} />
            ) : (
              <GenericPill key={entry} label={entry} />
            )
          )
        ) : (
          <p className="text-sm text-muted-foreground">No selections yet.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <ChevronsUpDown className="h-3.5 w-3.5" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />

            <div className="grid max-h-[360px] gap-2 overflow-y-auto rounded-xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-2">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((entry) => {
                  const selected = value.some(
                    (selectedEntry) =>
                      normalizeToken(selectedEntry) === normalizeToken(entry)
                  );

                  return (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => toggleEntry(entry)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                        selected
                          ? "border-foreground/20 bg-card shadow-[0_10px_24px_rgba(9,12,18,0.08)]"
                          : "border-border/70 bg-card/40 hover:border-foreground/12"
                      )}
                      aria-pressed={selected}
                    >
                      {pillTone === "community" ? (
                        <CommunityTagPill label={entry} />
                      ) : (
                        <GenericPill label={entry} />
                      )}
                      <span
                        className={cn(
                          "text-xs font-medium",
                          selected ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {selected ? "Selected" : "Add"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">No options match this search.</p>
              )}
            </div>

            {allowCustom ? (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="text-sm font-medium text-foreground">Add a custom value</p>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={customValue}
                    onChange={(event) => setCustomValue(event.target.value)}
                    placeholder={customPlaceholder}
                  />
                  <Button type="button" onClick={addCustomEntry}>
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter showCloseButton>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
