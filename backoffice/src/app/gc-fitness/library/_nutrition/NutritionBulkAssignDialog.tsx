"use client";

// NutritionBulkAssignDialog.tsx
//
// "Asignar esta plantilla a varios clientes" (#927) — the last step the library (#918)
// promised to save and, until now, gave back: a coach running the same block for fifteen
// people had to open fifteen assign screens and retype the same window fifteen times.
//
// ── The preview is the feature ──────────────────────────────────────────────────────
//
// Assigning to one client shows one sentence about what gets trimmed, and the coach reads
// it. Assigning to fifteen would show fifteen, and nobody reads fifteen — so the table
// below leads with the clients whose current phase is about to be CUT, and says untouched
// ones are untouched with a single row each. The numbers come from
// `previewNutritionBulkAssign`, which runs the same overlap planner the write runs: a
// separately-worded warning drifts the first time the trimming rules change, and then the
// screen promises one thing while the write does another.
//
// The plan body is NOT editable here, on purpose. Bulk sets the base; the per-person
// retouch stays in each client's own assign screen, which is where the coach can see that
// person's history. A body editor here would invite exactly the edit nobody meant to make
// to fifteen people at once.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import {
  assignNutritionTemplateToClients,
  listNutritionBulkClients,
  previewNutritionBulkAssign,
  type NutritionBulkClientOption,
  type NutritionBulkPreview,
} from "@/lib/gc-fitness/nutrition-bulk-actions";
import { nutritionPlanBodyFromTemplate } from "@/lib/gc-fitness/nutrition-bulk-assign";
import type { NutritionBulkPreviewRow } from "@/lib/gc-fitness/nutrition-bulk-assign";
import { MAX_BULK_ASSIGN_CLIENTS } from "@/lib/gc-fitness/nutrition-plan-form";
import type { NutritionTemplateRow } from "@/lib/gc-fitness/nutrition-library-model";

/**
 * The preview is a Firestore read, and the selection changes on every checkbox. Without a
 * debounce, ticking ten clients is ten fan-out reads for nine tables nobody saw.
 */
const PREVIEW_DEBOUNCE_MS = 400;

export function NutritionBulkAssignDialog({
  template,
  defaultStartsOn,
  onClose,
  onAssigned,
}: {
  template: NutritionTemplateRow;
  /** Today in the TRAINER's zone — the library has no single client to ask. */
  defaultStartsOn: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const t = useTranslations("nutritionLibrary");
  const [pending, startTransition] = useTransition();

  const [clients, setClients] = useState<NutritionBulkClientOption[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [startsOn, setStartsOn] = useState(defaultStartsOn);
  const [openEnded, setOpenEnded] = useState(true);
  const [endsOn, setEndsOn] = useState("");
  const [preview, setPreview] = useState<NutritionBulkPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const effectiveEndsOn = openEnded ? null : endsOn.trim() === "" ? null : endsOn;

  useEffect(() => {
    let cancelled = false;
    listNutritionBulkClients()
      .then((rows) => {
        if (!cancelled) setClients(rows);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-preview whenever the selection or the window moves. Debounced, and every in-flight
  // result is dropped if a newer one is on its way — a stale table that arrives late would
  // describe trims the coach is no longer asking for.
  useEffect(() => {
    if (selected.length === 0 || !startsOn) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      previewNutritionBulkAssign({
        clientIds: selected,
        startsOn,
        endsOn: effectiveEndsOn,
      })
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selected, startsOn, effectiveEndsOn]);

  const visibleClients = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = clients ?? [];
    if (!needle) return rows;
    return rows.filter(
      (client) =>
        client.name.toLowerCase().includes(needle) ||
        client.email.toLowerCase().includes(needle),
    );
  }, [clients, search]);

  const toggle = useCallback((uid: string) => {
    setSelected((current) =>
      current.includes(uid)
        ? current.filter((id) => id !== uid)
        : current.length >= MAX_BULK_ASSIGN_CLIENTS
          ? current
          : [...current, uid],
    );
  }, []);

  const allVisibleSelected =
    visibleClients.length > 0 && visibleClients.every((c) => selected.includes(c.uid));

  const toggleAllVisible = useCallback(() => {
    setSelected((current) => {
      if (visibleClients.every((c) => current.includes(c.uid))) {
        const visible = new Set(visibleClients.map((c) => c.uid));
        return current.filter((uid) => !visible.has(uid));
      }
      const merged = new Set(current);
      for (const client of visibleClients) {
        if (merged.size >= MAX_BULK_ASSIGN_CLIENTS) break;
        merged.add(client.uid);
      }
      return [...merged];
    });
  }, [visibleClients]);

  const summary = preview?.summary ?? null;
  // Affected first: a coach scanning this table is looking for who is about to lose a
  // phase, and burying those rows under fifteen "sin cambios" is how they get missed.
  const previewRows = useMemo(() => {
    const rows = preview?.rows ?? [];
    return [...rows].sort((a, b) => {
      const weight = (row: NutritionBulkPreviewRow) =>
        row.blockedReason !== null ? 0 : row.notices.length > 0 ? 1 : 2;
      const diff = weight(a) - weight(b);
      return diff !== 0 ? diff : a.clientName.localeCompare(b.clientName, "es");
    });
  }, [preview]);

  function submit() {
    if (selected.length === 0) return;
    startTransition(async () => {
      try {
        const result = await assignNutritionTemplateToClients({
          ...nutritionPlanBodyFromTemplate(template, {
            startsOn,
            endsOn: effectiveEndsOn,
          }),
          clientIds: selected,
        });
        if (result.assigned.length > 0) {
          toast.success(t("bulkAssigned", { count: result.assigned.length }));
        }
        if (result.failed.length > 0) {
          // Never silent. A bulk that half-succeeded and says nothing is a coach clicking
          // again and double-assigning everyone who already worked.
          toast.error(t("bulkFailedSome", { count: result.failed.length }));
        }
        onAssigned();
        onClose();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("bulkTitle", { name: template.name.es || template.name.en })}
          </DialogTitle>
          {/* Not decoration: Radix wires this as the dialog's `aria-describedby`, and
              without it a screen reader announces the title and nothing about what the
              confirm button is going to do to fifteen people. */}
          <DialogDescription>{t("bulkSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-starts-on">{t("bulkStartsOn")}</Label>
              <Input
                id="bulk-starts-on"
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
                data-testid="nutrition-bulk-starts-on"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-ends-on">{t("bulkEndsOn")}</Label>
              <Input
                id="bulk-ends-on"
                type="date"
                value={endsOn}
                disabled={openEnded}
                min={startsOn}
                onChange={(event) => setEndsOn(event.target.value)}
                data-testid="nutrition-bulk-ends-on"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={openEnded}
                  onCheckedChange={(value) => setOpenEnded(value === true)}
                  data-testid="nutrition-bulk-open-ended"
                />
                {t("bulkOpenEnded")}
              </label>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{t("bulkClients")}</Label>
              <span className="text-xs text-muted-foreground" data-testid="nutrition-bulk-count">
                {t("bulkSelected", { count: selected.length })}
              </span>
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("bulkSearchPlaceholder")}
              data-testid="nutrition-bulk-search"
            />
            {clients === null ? (
              <p className="text-sm text-muted-foreground">{t("bulkLoadingClients")}</p>
            ) : visibleClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("bulkNoClients")}</p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAllVisible}
                    data-testid="nutrition-bulk-select-all"
                  />
                  {t("bulkSelectAll")}
                </label>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {visibleClients.map((client) => (
                    <label
                      key={client.uid}
                      className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.includes(client.uid)}
                        onCheckedChange={() => toggle(client.uid)}
                        data-testid={`nutrition-bulk-client-${client.uid}`}
                      />
                      <span className="truncate">{client.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </section>

          {selected.length > 0 ? (
            <section className="space-y-2">
              <Label>{t("bulkPreview")}</Label>
              {previewing && !preview ? (
                <p className="text-sm text-muted-foreground">{t("bulkPreviewLoading")}</p>
              ) : summary ? (
                <>
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="nutrition-bulk-summary"
                  >
                    {t("bulkSummary", {
                      clients: summary.assignable,
                      affected: summary.affected,
                    })}
                  </p>
                  <ul className="divide-y rounded-md border" data-testid="nutrition-bulk-preview">
                    {previewRows.map((row) => (
                      <li
                        key={row.clientId}
                        className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                        data-testid={`nutrition-bulk-preview-${row.clientId}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{row.clientName}</span>
                        {row.blockedReason !== null ? (
                          <Badge variant="destructive">
                            {row.blockedReason === "pendingProvisioning"
                              ? t("bulkBlockedPending")
                              : t("bulkBlockedRoster")}
                          </Badge>
                        ) : row.notices.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {t("bulkNoChange")}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 dark:text-amber-500">
                            {row.notices.map((notice) => noticeLabel(notice, t)).join(" · ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={pending || selected.length === 0}
            data-testid="nutrition-bulk-submit"
          >
            {pending ? t("saving") : t("bulkSubmit", { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One affected phase, in words — the same three kinds the single assign warns about. */
function noticeLabel(
  notice: NutritionBulkPreviewRow["notices"][number],
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (notice.kind === "trim") {
    return t("bulkNoticeTrim", { name: notice.planName, date: notice.date ?? "" });
  }
  if (notice.kind === "deferStart") {
    return t("bulkNoticeDefer", { name: notice.planName, date: notice.date ?? "" });
  }
  return t("bulkNoticeSupersede", { name: notice.planName });
}
