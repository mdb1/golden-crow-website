"use client";

// bulk-assign-habit-dialog.tsx
//
// "One habit → many clients" assignment. Complements NewHabitDialog (which
// assigns ONE habit to ONE client/day). Opened from the habits page header
// (and reusable from the Agenda) so a trainer can roll a single template out
// to a whole roster at once.
//
// Flow:
//   1. Pick a habit TEMPLATE (reuses the ExistingHabitPicker search-list
//      pattern from new-habit-dialog.tsx).
//   2. Multi-select clients via a checkbox list of the ACTIVE roster
//      (pendingProvisioning clients are excluded by the caller).
//   3. Optional start date (defaults to today, editable).
//   4. Submit → assignHabitTemplate({ templateId, clientIds, startsOn }) →
//      toast "{n} assigned" → onAssigned() so the parent invalidates caches.
//
// The server action `assignHabitTemplate` already creates one per-client
// /habits doc per clientId, copying the template (description/photoUrl/
// youtubeUrl/sourceTemplateId/schedule). This dialog is the UI entry point.

import { useMemo, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  assignHabitTemplate,
  listHabitTemplates,
  type HabitTemplateRow,
} from "@/lib/gc-fitness/habit-actions";

export interface BulkAssignClient {
  uid: string;
  displayName: string;
}

interface BulkAssignHabitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ACTIVE roster (caller excludes pendingProvisioning clients). */
  clients: BulkAssignClient[];
  /** Fires after a successful assign so the parent can invalidate caches. */
  onAssigned: () => void;
}

function todayCivilDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function BulkAssignHabitDialog({
  open,
  onOpenChange,
  clients,
  onAssigned,
}: BulkAssignHabitDialogProps) {
  const t = useTranslations("habits.bulkAssign");
  const [selectedTemplate, setSelectedTemplate] =
    useState<HabitTemplateRow | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [startsOn, setStartsOn] = useState<string>(() => todayCivilDate());
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setSelectedTemplate(null);
    setSelectedClientIds(new Set());
    setStartsOn(todayCivilDate());
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function toggleClient(uid: string) {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function selectAll() {
    setSelectedClientIds(new Set(clients.map((c) => c.uid)));
  }

  function clearAll() {
    setSelectedClientIds(new Set());
  }

  const selectedCount = selectedClientIds.size;
  const canSubmit =
    !!selectedTemplate && selectedCount > 0 && startsOn.length > 0;

  async function onSubmit() {
    if (!selectedTemplate || selectedCount === 0) return;
    setSubmitting(true);
    try {
      const result = await assignHabitTemplate({
        templateId: selectedTemplate.id,
        clientIds: Array.from(selectedClientIds),
        startsOn,
      });
      toast.success(t("assignedToast", { count: result.created }));
      onAssigned();
      handleOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("assignFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto -mx-4 px-4">
          {/* Step 1 — habit template */}
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{t("habitLabel")}</p>
            {selectedTemplate ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {selectedTemplate.name.en || selectedTemplate.name.es}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedTemplate(null)}
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t("changeHabit")}
                </button>
              </div>
            ) : (
              <BulkHabitPicker onPick={setSelectedTemplate} />
            )}
          </div>

          {/* Step 2 — clients */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {t("clientsLabel", { count: selectedCount })}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  disabled={clients.length === 0}
                >
                  {t("selectAll")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  disabled={selectedCount === 0}
                >
                  {t("clearAll")}
                </Button>
              </div>
            </div>
            {clients.length === 0 ? (
              <p className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">
                {t("noClients")}
              </p>
            ) : (
              <ul className="flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto rounded-md border p-2">
                {clients.map((c) => {
                  const checked = selectedClientIds.has(c.uid);
                  return (
                    <li key={c.uid}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition hover:bg-accent",
                          checked && "bg-accent/60",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleClient(c.uid)}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {c.displayName}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Step 3 — start date */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bulk-assign-starts-on" className="text-sm font-medium">
              {t("startsOnLabel")}
            </label>
            <input
              id="bulk-assign-starts-on"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className="h-10 w-48 rounded-md border bg-background px-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">{t("startsOnHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!canSubmit || submitting}>
            {submitting
              ? t("assigning")
              : t("submit", { count: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Searchable template picker — mirrors the ExistingHabitPicker list pattern
 * from new-habit-dialog.tsx (search input + scrollable result list), trimmed
 * to the "pick one" use case for the bulk flow.
 */
function BulkHabitPicker({
  onPick,
}: {
  onPick: (tpl: HabitTemplateRow) => void;
}) {
  const t = useTranslations("habits.bulkAssign");
  const [search, setSearch] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["habit-templates", "bulk-assign-picker"],
    queryFn: () => listHabitTemplates(),
  });

  const filtered = useMemo(() => {
    const list = templates as HabitTemplateRow[];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((tpl) =>
      `${tpl.name.en} ${tpl.name.es}`.toLowerCase().includes(needle),
    );
  }, [templates, search]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md border px-3">
        <Search className="h-4 w-4 shrink-0 opacity-50" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <ul className="flex max-h-[35vh] flex-col gap-1 overflow-y-auto rounded-md border p-2">
        {isLoading ? (
          <li className="py-4 text-center text-sm text-muted-foreground">
            {t("loadingHabits")}
          </li>
        ) : filtered.length === 0 ? (
          <li className="py-4 text-center text-sm text-muted-foreground">
            {search.trim() ? t("noMatches") : t("noHabits")}
          </li>
        ) : (
          filtered.map((tpl) => {
            const esName =
              tpl.name.es && tpl.name.es !== tpl.name.en ? tpl.name.es : null;
            return (
              <li key={tpl.id}>
                <button
                  type="button"
                  onClick={() => onPick(tpl)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-accent"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {tpl.name.en || tpl.name.es}
                    </span>
                    {esName ? (
                      <span className="truncate text-xs italic text-muted-foreground">
                        {esName}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
