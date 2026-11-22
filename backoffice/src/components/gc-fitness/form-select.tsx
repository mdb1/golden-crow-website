"use client";

// #505 — the coach portal's ONE select. A thin options-array wrapper over
// `components/ui/select` (Radix) that keeps what the native `<select>`s it
// replaced gave for free:
//
//   - `name` / `required` still post through a plain `<form>` (server actions
//     and GET filter forms read `formData.get(name)` exactly as before);
//   - an option whose value is `""` ("All clients", "No plan", "Create new…")
//     still works — Radix forbids `""` on an item, so it is mapped to an
//     internal sentinel that never leaves this file, and the form gets `""`
//     back through a hidden input;
//   - `value` / `defaultValue` (controlled or not), `id` (for `<Label htmlFor>`),
//     `aria-label` and `data-testid` land on the trigger (role="combobox");
//   - every item — and the trigger, for the current value — carries
//     `data-value`, so tests can read and pick options by value.
//
// When nothing matches `value` (or it is `""` with no `""` option) the
// `placeholder` shows, like a native select's disabled first option.

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FormSelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

const EMPTY = "__gc_form_select_empty__";

export interface FormSelectProps {
  options: readonly FormSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: React.ReactNode;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "data-testid"?: string;
  /** Classes for the trigger (width, height, radius…). */
  className?: string;
  contentClassName?: string;
  size?: "sm" | "default";
}

export function FormSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  name,
  required,
  disabled,
  id,
  "aria-label": ariaLabel,
  "data-testid": testId,
  className,
  contentClassName,
  size = "default",
}: FormSelectProps) {
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value ?? inner;
  const hasEmptyOption = options.some((o) => o.value === "");
  const toRadix = (v: string) => (v === "" ? (hasEmptyOption ? EMPTY : "") : v);
  const fromRadix = (v: string) => (v === EMPTY ? "" : v);
  // With a `""` option the sentinel must not reach the form, so the real value
  // posts through a hidden input instead of Radix's own hidden <select>.
  const radixName = hasEmptyOption ? undefined : name;

  return (
    <>
      <Select
        value={toRadix(current)}
        onValueChange={(v) => {
          const next = fromRadix(v);
          if (value === undefined) setInner(next);
          onValueChange?.(next);
        }}
        name={radixName}
        required={radixName ? required : undefined}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={ariaLabel}
          data-testid={testId}
          data-value={current}
          size={size}
          className={cn("w-full", className)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          {options.map((o) => (
            <SelectItem
              key={o.value === "" ? EMPTY : o.value}
              value={o.value === "" ? EMPTY : o.value}
              disabled={o.disabled}
              data-value={o.value}
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name && hasEmptyOption ? <input type="hidden" name={name} value={current} /> : null}
    </>
  );
}
