"use client";

// The template/routine combobox of the assign modal (#507 — split out of
// assign-template-modal.tsx). Fully controlled: the open flag and the search
// text stay in the modal so they survive the dialog closing exactly as before.
//
// 260529 scroll fix — the template/routine picker renders INLINE in the dialog
// body instead of a portaled Popover. Radix Popover portals its content to
// document.body, which sits OUTSIDE the Dialog's react-remove-scroll shard, so
// the wheel/touch scroll on the cmdk list was swallowed and long routine lists
// couldn't be scrolled. An in-flow disclosure panel lives inside
// DialogContent's allowed scroll region, so CommandList's own overflow scrolls
// normally.

import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { useWorkoutTemplates } from "@/lib/gc-fitness/workout-templates-listener";

type TemplateListItem = NonNullable<ReturnType<typeof useWorkoutTemplates>["data"]>[number];

export function AssignTemplatePicker({
  templates,
  templatesLoading,
  templateId,
  templatePickerOpen,
  templateSearch,
  onToggle,
  onTemplateSearchChange,
  onSelect,
}: {
  templates: TemplateListItem[] | undefined;
  templatesLoading: boolean;
  templateId: string;
  templatePickerOpen: boolean;
  templateSearch: string;
  onToggle: () => void;
  onTemplateSearchChange: (value: string) => void;
  onSelect: (templateId: string) => void;
}) {
  const t = useTranslations("schedule.assignModal");
  return (
    <>
      <button
        type="button"
        role="combobox"
        aria-expanded={templatePickerOpen}
        onClick={onToggle}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm"
      >
        <span
          className={cn(
            "truncate",
            !templateId && "text-muted-foreground",
          )}
        >
          {(() => {
            const sel = (templates ?? []).find(
              (x) => x.id === templateId,
            );
            if (sel)
              return `${sel.name.en}${sel.tag ? ` · ${sel.tag}` : ""}`;
            return templatesLoading
              ? t("templateLoading")
              : t("templatePlaceholder");
          })()}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </button>
      {templatePickerOpen ? (
        <div className="rounded-md border bg-popover text-popover-foreground shadow-sm">
          <Command shouldFilter={false}>
            <CommandInput
              value={templateSearch}
              onValueChange={onTemplateSearchChange}
              placeholder="Buscar por nombre o tag…"
            />
            <CommandList className="max-h-[min(45vh,320px)]">
              {(() => {
                const list = templates ?? [];
                const needle = templateSearch.trim().toLowerCase();
                const filtered = needle
                  ? list.filter((tpl) => {
                      const tags = Array.isArray(tpl.tags)
                        ? tpl.tags
                        : tpl.tag
                          ? [tpl.tag]
                          : [];
                      return `${tpl.name.en} ${tpl.name.es} ${tags.join(" ")}`
                        .toLowerCase()
                        .includes(needle);
                    })
                  : list;
                if (filtered.length === 0) {
                  return (
                    <CommandEmpty>
                      {templatesLoading ? t("templateLoading") : "Sin resultados."}
                    </CommandEmpty>
                  );
                }
                return filtered.map((tpl) => {
                  const tags =
                    Array.isArray(tpl.tags) && tpl.tags.length
                      ? tpl.tags
                      : tpl.tag
                        ? [tpl.tag]
                        : [];
                  const selected = tpl.id === templateId;
                  return (
                    <CommandItem
                      key={tpl.id}
                      value={tpl.id}
                      onSelect={() => onSelect(tpl.id)}
                      className="flex items-center gap-2"
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {tpl.name.en}
                      </span>
                      {tags.length ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {tags.join(" · ")}
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                });
              })()}
            </CommandList>
          </Command>
        </div>
      ) : null}
    </>
  );
}
