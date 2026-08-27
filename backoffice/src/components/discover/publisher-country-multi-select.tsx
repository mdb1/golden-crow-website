"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Globe2, Search, X } from "lucide-react";
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
import type { AppLanguage } from "@/lib/language";
import {
  formatDiscoverOrganizationCountries,
  getDiscoverOrganizationCountryGroups,
  parseDiscoverOrganizationCountryCodes,
  serializeDiscoverOrganizationCountryCodes,
} from "@/lib/discover-organization-fields";

type PublisherCountryMultiSelectProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  language: AppLanguage;
  t: (text: string) => string;
  includeGlobal?: boolean;
};

export function PublisherCountryMultiSelect({
  id,
  value,
  onChange,
  language,
  t,
  includeGlobal = true,
}: PublisherCountryMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const countryGroups = useMemo(
    () =>
      getDiscoverOrganizationCountryGroups(language).map((group) => ({
        ...group,
        options: includeGlobal
          ? group.options
          : group.options.filter((option) => option.code !== "GLOBAL"),
      })),
    [includeGlobal, language],
  );
  const selectedCodes = useMemo(
    () =>
      parseDiscoverOrganizationCountryCodes(value).filter(
        (code) => includeGlobal || code !== "GLOBAL",
      ),
    [includeGlobal, value],
  );
  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = countryGroups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) =>
          !normalizedQuery ||
          option.label.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.options.length > 0);
  const selectedValue = serializeDiscoverOrganizationCountryCodes(selectedCodes);
  const displayValue = formatDiscoverOrganizationCountries(
    selectedValue,
    language,
  );
  const selectedOptions = countryGroups.flatMap((group) =>
    group.options.filter((option) => selectedSet.has(option.code)),
  );

  function updateSelected(nextCodes: readonly string[]) {
    onChange(serializeDiscoverOrganizationCountryCodes(nextCodes));
  }

  function toggleCountry(countryCode: string) {
    if (!includeGlobal && countryCode === "GLOBAL") {
      return;
    }

    if (selectedSet.has(countryCode)) {
      updateSelected(selectedCodes.filter((code) => code !== countryCode));
      return;
    }

    updateSelected(
      countryCode === "GLOBAL"
        ? ["GLOBAL"]
        : [...selectedCodes.filter((code) => code !== "GLOBAL"), countryCode],
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Globe2
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={id}
            value={displayValue}
            readOnly
            placeholder={t("Select countries")}
            className="h-10 pl-9 font-medium"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls={`${id}-country-picker`}
          className="h-10 justify-between sm:w-44"
        >
          {t("Choose countries")}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {selectedOptions.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <Badge
              key={option.code}
              variant="secondary"
              className="h-auto max-w-full gap-1 rounded-md py-1 pr-1"
            >
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                onClick={() => toggleCountry(option.code)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Remove ${option.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          id={`${id}-country-picker`}
          className="overflow-hidden p-0 sm:max-w-5xl"
        >
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="font-heading text-xl font-semibold">
              {t("Select countries")}
            </DialogTitle>
            <DialogDescription>
              {selectedCodes.length > 0
                ? `${selectedCodes.length} ${t(
                    selectedCodes.length === 1
                      ? "country selected"
                      : "countries selected",
                  )}: ${displayValue}`
                : t("No countries selected")}
            </DialogDescription>
          </DialogHeader>

          <div className="px-5">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search countries")}
                aria-label={t("Search countries")}
                className="h-10 pl-9"
              />
            </div>

            <div className="mt-4 max-h-[52vh] overflow-y-auto pr-1">
              {visibleGroups.length === 0 ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  {t("No countries match")}
                </div>
              ) : (
                visibleGroups.map((group) => (
                  <div key={group.key} className="mb-4 last:mb-0">
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t(group.label)}
                    </p>
                    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                      {group.options.map((option) => {
                        const checkboxId = `${id}-${option.code}`;

                        return (
                          <label
                            key={option.code}
                            htmlFor={checkboxId}
                            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted"
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={selectedSet.has(option.code)}
                              onCheckedChange={() => toggleCountry(option.code)}
                              aria-label={option.label}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {option.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="px-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => updateSelected([])}
              disabled={!selectedCodes.length}
            >
              <X className="h-3.5 w-3.5" />
              {t("Clear all")}
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              {t("Done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
