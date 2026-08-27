"use client";

import { useMemo, useState } from "react";
import { Check, ListFilter, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DiscoverPublisherCategoryOption } from "@/lib/discover-publisher-categories";

type CategorySelectProvider = {
  optionCount: number;
  options: readonly DiscoverPublisherCategoryOption[];
  parse: (value: string | null | undefined) => string[];
  serialize: (keys: readonly string[]) => string;
};

type PublisherCategoryMultiSelectProps = {
  id?: string;
  provider: CategorySelectProvider;
  value: string;
  onChange: (value: string) => void;
  optionLabel?: (option: DiscoverPublisherCategoryOption) => string;
  label: string;
  dialogTitle: string;
  dialogDescription: string;
  emptyLabel: string;
  searchPlaceholder: string;
  clearLabel: string;
  removeLabel: string;
  doneLabel: string;
  selectedCountLabel: (count: number) => string;
  className?: string;
};

export function PublisherCategoryMultiSelect({
  id,
  provider,
  value,
  onChange,
  optionLabel = (option) => option.label,
  label,
  dialogTitle,
  dialogDescription,
  emptyLabel,
  searchPlaceholder,
  clearLabel,
  removeLabel,
  doneLabel,
  selectedCountLabel,
  className,
}: PublisherCategoryMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedKeys = useMemo(() => provider.parse(value), [provider, value]);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedOptions = useMemo(
    () =>
      selectedKeys
        .map((key) => provider.options.find((option) => option.value === key))
        .filter((option): option is DiscoverPublisherCategoryOption =>
          Boolean(option),
        ),
    [provider, selectedKeys],
  );
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return provider.options;
    }

    return provider.options.filter((option) =>
      `${option.label} ${optionLabel(option)}`
        .toLowerCase()
        .includes(normalizedQuery),
      );
  }, [optionLabel, provider.options, query]);
  const selectionSummary = selectedOptions.length
    ? selectedCountLabel(selectedOptions.length)
    : emptyLabel;

  function updateSelected(nextKeys: readonly string[]) {
    onChange(provider.serialize(nextKeys));
  }

  function toggleOption(key: string) {
    if (selectedSet.has(key)) {
      updateSelected(selectedKeys.filter((selectedKey) => selectedKey !== key));
      return;
    }

    updateSelected([...selectedKeys, key]);
  }

  function removeOption(key: string) {
    updateSelected(selectedKeys.filter((selectedKey) => selectedKey !== key));
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        id={id}
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${selectionSummary}`}
        className="h-auto min-h-10 justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">
              {label}
            </span>
            <span className="block truncate text-sm font-medium">
              {selectionSummary}
            </span>
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {selectedOptions.length}/{provider.optionCount}
        </span>
      </Button>

      {selectedOptions.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <Badge
              key={option.value}
              variant="secondary"
              className="h-auto max-w-full gap-1 rounded-md py-1 pr-1"
            >
              <span className="truncate">{optionLabel(option)}</span>
              <button
                type="button"
                onClick={() => removeOption(option.value)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`${removeLabel} ${optionLabel(option)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 px-5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </label>

            <div className="max-h-[min(30rem,56vh)] overflow-y-auto rounded-md border border-border p-1">
              {filteredOptions.length ? (
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredOptions.map((option) => {
                    const selected = selectedSet.has(option.value);
                    return (
                      <div
                        key={option.value}
                        onClick={() => toggleOption(option.value)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleOption(option.value);
                          }
                        }}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted/55"
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleOption(option.value)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={optionLabel(option)}
                        />
                        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                          {optionLabel(option)}
                        </span>
                        {selected ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {emptyLabel}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => updateSelected([])}
              disabled={!selectedOptions.length}
            >
              {clearLabel}
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              {doneLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
