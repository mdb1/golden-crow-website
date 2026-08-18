"use client";

// NutritionLibraryClient.tsx
//
// The Biblioteca's **Nutrición** tab (#918): the coach's reusable meals and their reusable
// whole plans. What turns a coach with 3 clients into one with 30 — without it, "Pollo 200 g
// + arroz + ensalada" gets typed once per client and corrected once per client.
//
// ── THE PILL IS A WARNING, NOT DECORATION ────────────────────────────────────────────
//
// Editing a library entry does NOT rewrite what is already assigned — a plan carries frozen
// copies. So "en 9 planes" is not trivia: it is the number of clients whose plan this edit
// will NOT reach. That is exactly when a coach wants to know, which is why the count sits on
// the row rather than inside the editor.
//
// ── STANDARD ENTRIES ARE DUPLICATED, NEVER EDITED ────────────────────────────────────
//
// A standard row (`ownerId: null`) offers **Duplicar** and no edit affordance at all. #163
// is the receipt: an /edit link on a standard workout template let a coach believe they had
// customized something global, and nothing failed.

import { useCallback, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus, Trash2, Users, Utensils } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PillTabs } from "@/components/gc-fitness/pill-tabs";

import {
  countNutritionLibraryUsage,
  createNutritionMeal,
  createNutritionTemplate,
  duplicateNutritionMeal,
  duplicateNutritionTemplate,
  listNutritionMeals,
  listNutritionTemplates,
  softDeleteNutritionMeal,
  softDeleteNutritionTemplate,
  updateNutritionMeal,
  updateNutritionTemplate,
  type NutritionLibraryUsage,
} from "@/lib/gc-fitness/nutrition-library-actions";
import { libraryUsageFor } from "@/lib/gc-fitness/nutrition-library-model";
import type {
  NutritionMealRow,
  NutritionTemplateRow,
} from "@/lib/gc-fitness/nutrition-library-model";
import { isStandardNutritionEntry } from "@/lib/gc-fitness/nutrition-schema";

import { NutritionBulkAssignDialog } from "./NutritionBulkAssignDialog";
import { NutritionMealDialog } from "./NutritionMealDialog";
import { NutritionTemplateDialog } from "./NutritionTemplateDialog";

const MEALS_KEY = ["gc-fitness", "nutrition-library", "meals"] as const;
const TEMPLATES_KEY = ["gc-fitness", "nutrition-library", "templates"] as const;
const USAGE_KEY = ["gc-fitness", "nutrition-library", "usage"] as const;

type View = "meals" | "templates";

export function NutritionLibraryClient({
  defaultStartsOn,
}: {
  /** Today in the trainer's zone — seeds the bulk-assign window (#927). */
  defaultStartsOn: string;
}) {
  const t = useTranslations("nutritionLibrary");
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("meals");
  const [editingMeal, setEditingMeal] = useState<NutritionMealRow | null>(null);
  const [creatingMeal, setCreatingMeal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NutritionTemplateRow | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: View; id: string; name: string } | null
  >(null);
  const [bulkAssigning, setBulkAssigning] = useState<NutritionTemplateRow | null>(null);
  const [pending, startTransition] = useTransition();

  const meals = useQuery({ queryKey: MEALS_KEY, queryFn: () => listNutritionMeals() });
  const templates = useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => listNutritionTemplates(),
  });
  const usage = useQuery<NutritionLibraryUsage>({
    queryKey: USAGE_KEY,
    queryFn: () => countNutritionLibraryUsage(),
  });

  const refresh = useCallback(() => {
    // Invalidate the usage counts too: a new template changes the "in N templates" number
    // of every meal it embeds, and a pill that lags reads as a wrong warning rather than a
    // stale one.
    void queryClient.invalidateQueries({ queryKey: MEALS_KEY });
    void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    void queryClient.invalidateQueries({ queryKey: USAGE_KEY });
  }, [queryClient]);

  const mealsInTemplates = usage.data?.mealsInTemplates ?? {};
  const mealsInPlans = usage.data?.mealsInPlans ?? {};
  const templatesInPlans = usage.data?.templatesInPlans ?? {};

  const libraryMeals = useMemo(() => meals.data ?? [], [meals.data]);

  function onDuplicate(kind: View, id: string) {
    startTransition(async () => {
      try {
        if (kind === "meals") await duplicateNutritionMeal(id);
        else await duplicateNutritionTemplate(id);
        toast.success(t("duplicated"));
        refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  function onConfirmDelete() {
    const target = confirmDelete;
    if (!target) return;
    startTransition(async () => {
      try {
        if (target.kind === "meals") await softDeleteNutritionMeal(target.id);
        else await softDeleteNutritionTemplate(target.id);
        toast.success(t("deleted"));
        setConfirmDelete(null);
        refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="nutrition-library">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs
          size="sm"
          activeKey={view}
          items={[
            {
              key: "meals",
              label: t("tabMeals"),
              count: libraryMeals.length || undefined,
              onSelect: () => setView("meals"),
            },
            {
              key: "templates",
              label: t("tabTemplates"),
              count: (templates.data ?? []).length || undefined,
              onSelect: () => setView("templates"),
            },
          ]}
        />
        <Button
          size="sm"
          onClick={() =>
            view === "meals" ? setCreatingMeal(true) : setCreatingTemplate(true)
          }
          data-testid="nutrition-library-create"
        >
          <Plus className="mr-1 size-4" />
          {view === "meals" ? t("newMeal") : t("newTemplate")}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {view === "meals" ? t("mealsHelp") : t("templatesHelp")}
      </p>

      {view === "meals" ? (
        <div className="flex flex-col gap-2">
          {libraryMeals.length === 0 && !meals.isLoading ? (
            <EmptyState title={t("emptyMeals")} body={t("emptyMealsHelp")} />
          ) : null}
          {libraryMeals.map((meal) => {
            const counts = libraryUsageFor(meal.id, mealsInTemplates, mealsInPlans);
            const standard = isStandardNutritionEntry(meal);
            return (
              <Card key={meal.id} data-testid={`nutrition-meal-row-${meal.id}`}>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <Utensils className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">
                        {meal.name.es || meal.name.en}
                      </span>
                      <Badge variant="outline">{t(`moment_${meal.moment}`)}</Badge>
                      {standard ? (
                        <Badge variant="secondary">{t("standard")}</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {macroLine(meal.targets, t("noMacro"))}
                      {meal.options.length > 0
                        ? ` · ${t("optionsCount", { count: meal.options.length })}`
                        : ""}
                    </p>
                  </div>
                  <UsagePills
                    templates={counts.templates}
                    plans={counts.plans}
                    labelTemplates={t("usageTemplates", { count: counts.templates })}
                    labelPlans={t("usagePlans", { count: counts.plans })}
                  />
                  <RowActions
                    standard={standard}
                    disabled={pending}
                    onEdit={() => setEditingMeal(meal)}
                    onDuplicate={() => onDuplicate("meals", meal.id)}
                    onDelete={() =>
                      setConfirmDelete({
                        kind: "meals",
                        id: meal.id,
                        name: meal.name.es || meal.name.en,
                      })
                    }
                    editLabel={t("edit")}
                    duplicateLabel={t("duplicate")}
                    deleteLabel={t("delete")}
                    testIdPrefix={`nutrition-meal-${meal.id}`}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(templates.data ?? []).length === 0 && !templates.isLoading ? (
            <EmptyState title={t("emptyTemplates")} body={t("emptyTemplatesHelp")} />
          ) : null}
          {(templates.data ?? []).map((template) => {
            const standard = isStandardNutritionEntry(template);
            const plans = templatesInPlans[template.id] ?? 0;
            return (
              <Card key={template.id} data-testid={`nutrition-template-row-${template.id}`}>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">
                        {template.name.es || template.name.en}
                      </span>
                      {standard ? (
                        <Badge variant="secondary">{t("standard")}</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {macroLine(template.targets, t("noMacro"))} ·{" "}
                      {t("mealsCount", { count: template.meals.length })}
                    </p>
                  </div>
                  <UsagePills
                    plans={plans}
                    labelPlans={t("usagePlans", { count: plans })}
                  />
                  <RowActions
                    standard={standard}
                    disabled={pending}
                    onEdit={() => setEditingTemplate(template)}
                    onBulkAssign={() => setBulkAssigning(template)}
                    bulkAssignLabel={t("bulkAssign")}
                    onDuplicate={() => onDuplicate("templates", template.id)}
                    onDelete={() =>
                      setConfirmDelete({
                        kind: "templates",
                        id: template.id,
                        name: template.name.es || template.name.en,
                      })
                    }
                    editLabel={t("edit")}
                    duplicateLabel={t("duplicate")}
                    deleteLabel={t("delete")}
                    testIdPrefix={`nutrition-template-${template.id}`}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {bulkAssigning ? (
        <NutritionBulkAssignDialog
          template={bulkAssigning}
          defaultStartsOn={defaultStartsOn}
          onClose={() => setBulkAssigning(null)}
          // The usage pills count `templateId` on assigned plans, so a bulk changes the
          // "asignada N veces" number of the row that launched it. Refreshing keeps the
          // pill from reading as a wrong warning rather than a stale one.
          onAssigned={refresh}
        />
      ) : null}

      {creatingMeal || editingMeal ? (
        <NutritionMealDialog
          meal={editingMeal}
          onClose={() => {
            setCreatingMeal(false);
            setEditingMeal(null);
          }}
          onSubmit={async (payload) => {
            if (editingMeal) await updateNutritionMeal(editingMeal.id, payload);
            else await createNutritionMeal(payload);
            refresh();
          }}
        />
      ) : null}

      {creatingTemplate || editingTemplate ? (
        <NutritionTemplateDialog
          template={editingTemplate}
          libraryMeals={libraryMeals}
          onClose={() => {
            setCreatingTemplate(false);
            setEditingTemplate(null);
          }}
          onSubmit={async (payload) => {
            if (editingTemplate) await updateNutritionTemplate(editingTemplate.id, payload);
            else await createNutritionTemplate(payload);
            refresh();
          }}
        />
      ) : null}

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteBody", { name: confirmDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDelete}
              data-testid="nutrition-library-delete-confirm"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-6">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

/**
 * The two counts, each hidden at zero.
 *
 * Zero is not a warning, and a row full of "0 planes" badges is how a coach learns to stop
 * reading the badges that DO matter.
 */
function UsagePills({
  templates,
  plans,
  labelTemplates,
  labelPlans,
}: {
  templates?: number;
  plans: number;
  labelTemplates?: string;
  labelPlans: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {templates && templates > 0 && labelTemplates ? (
        <Badge variant="outline">{labelTemplates}</Badge>
      ) : null}
      {plans > 0 ? <Badge variant="outline">{labelPlans}</Badge> : null}
    </div>
  );
}

function RowActions({
  standard,
  disabled,
  onEdit,
  onBulkAssign,
  onDuplicate,
  onDelete,
  editLabel,
  bulkAssignLabel,
  duplicateLabel,
  deleteLabel,
  testIdPrefix,
}: {
  standard: boolean;
  disabled: boolean;
  onEdit: () => void;
  /** Templates only — a single MEAL is not something you assign to anyone. */
  onBulkAssign?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  editLabel: string;
  bulkAssignLabel?: string;
  duplicateLabel: string;
  deleteLabel: string;
  testIdPrefix: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* Offered on STANDARD templates too, unlike edit and delete: assigning a standard
          plan copies it into the client's own document and changes nothing global, so
          none of the #163 reasoning against an edit affordance applies. */}
      {onBulkAssign ? (
        <Button
          size="icon"
          variant="ghost"
          onClick={onBulkAssign}
          disabled={disabled}
          aria-label={bulkAssignLabel}
          data-testid={`${testIdPrefix}-bulk-assign`}
        >
          <Users className="size-4" />
        </Button>
      ) : null}
      {/* A standard row gets NO edit and NO delete — not disabled ones. #163: an /edit link
          on a standard doc let a coach believe they had customized something global. */}
      {standard ? null : (
        <Button
          size="icon"
          variant="ghost"
          onClick={onEdit}
          disabled={disabled}
          aria-label={editLabel}
          data-testid={`${testIdPrefix}-edit`}
        >
          <Pencil className="size-4" />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        onClick={onDuplicate}
        disabled={disabled}
        aria-label={duplicateLabel}
        data-testid={`${testIdPrefix}-duplicate`}
      >
        <Copy className="size-4" />
      </Button>
      {standard ? null : (
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          disabled={disabled}
          aria-label={deleteLabel}
          data-testid={`${testIdPrefix}-delete`}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

/** "2400 kcal · P 180 · C 240 · G 80", with an em dash for whatever is unset. */
function macroLine(
  targets: { kcal?: number | null; proteinG?: number | null; carbsG?: number | null; fatG?: number | null } | null | undefined,
  dash: string,
): string {
  const value = (raw: number | null | undefined) => (raw == null ? dash : String(raw));
  const t = targets ?? {};
  return `${value(t.kcal)} kcal · P ${value(t.proteinG)} · C ${value(t.carbsG)} · G ${value(t.fatG)}`;
}
