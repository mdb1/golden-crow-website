"use client";

// MultiSelectCombobox.tsx
//
// Reusable shadcn-Combobox + Command primitive wrapping a static array of
// strings. Used for the filter bar (muscle / equipment / source) AND the
// CRUD form (muscle / equipment). Selected values appear as removable Badge
// pills inside the trigger; the popover is searchable via shadcn `Command`.
//
// `max` enforces the UI-SPEC cap (8 for muscle/equipment, 2 for source).
// When the cap is reached the popover shows a "Maximum reached." empty state
// so the trainer knows why further options stop responding.

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface MultiSelectComboboxProps {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** Optional cap on selections. When reached, popover shows empty state. */
  max?: number;
  /** Optional label transformer (e.g. "pull_up_bar" → "Pull up bar"). */
  formatLabel?: (option: string) => string;
  /** Optional aria-label for the trigger button (improves a11y in filter bars). */
  ariaLabel?: string;
  /** Optional className applied to the trigger. */
  className?: string;
  disabled?: boolean;
}

function defaultFormat(option: string): string {
  return option
    .replace(/_/g, " ")
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

export function MultiSelectCombobox({
  options,
  value,
  onChange,
  placeholder,
  max,
  formatLabel = defaultFormat,
  ariaLabel,
  className,
  disabled,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);

  const atMax = useMemo(
    () => typeof max === "number" && value.length >= max,
    [max, value.length],
  );

  function toggle(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
      return;
    }
    if (atMax) return; // Defensive — items beyond cap are non-selectable.
    onChange([...value, option]);
  }

  function remove(option: string) {
    onChange(value.filter((v) => v !== option));
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
          {value.length === 0 ? (
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {value.map((v) => (
                <Badge
                  key={v}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  <span>{formatLabel(v)}</span>
                  <span
                    role="button"
                    aria-label={`Remove ${formatLabel(v)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      remove(v);
                    }}
                    className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))}
            </div>
          )}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            {atMax ? (
              <CommandEmpty>Maximum reached.</CommandEmpty>
            ) : (
              <CommandEmpty>No matches. Type to search.</CommandEmpty>
            )}
            <CommandGroup>
              {options.map((opt) => {
                const selected = value.includes(opt);
                const disabledOption = !selected && atMax;
                return (
                  <CommandItem
                    key={opt}
                    value={opt}
                    disabled={disabledOption}
                    onSelect={() => toggle(opt)}
                    className={cn(
                      "flex items-center gap-2",
                      disabledOption && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span>{formatLabel(opt)}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
