"use client";

// NutritionTemplateDialog.tsx
//
// Create / edit a reusable PLAN (#918): daily targets plus the meals of the day, each one
// either picked from the meal library or typed inline.
//
// ── PICKING FROM THE LIBRARY COPIES, IT DOES NOT LINK ────────────────────────────────
//
// Choosing "Pollo 200 g + arroz" fills the row with a COPY of that meal — name, moment,
// macros and options — and keeps its `mealId` for provenance. Later edits to the library
// meal do NOT flow into this template, exactly as template edits do not flow into assigned
// plans. The copy is the point: it is what lets the coach retouch a meal for one plan
// without touching the library entry every other plan uses.
//
// The retained `mealId` is what the usage pill counts, so a template built from the library
// is visibly "in N templates" on that meal's row — the warning a coach reads before editing.

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  nutritionTemplateFormSchema,
  type NutritionMealRow,
  type NutritionTemplateRow,
} from "@/lib/gc-fitness/nutrition-library-model";
import {
  NUTRITION_MEAL_MOMENTS,
  type NutritionMealMoment,
  type NutritionMealOption,
} from "@/lib/gc-fitness/nutrition-schema";

import {
  EMPTY_MACROS,
  MacroFields,
  numberOrNull,
  toMacroDraft,
  type MacroDraft,
} from "./macro-fields";

interface MealDraft {
  key: string;
  /** Provenance + the key the daily log will use. Kept across edits. */
  mealId?: string;
  name: string;
  nameEn: string;
  moment: NutritionMealMoment;
  macros: MacroDraft;
  options: Array<{ id?: string; text: string; textEn: string; kcal: string }>;
}

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `tplmeal-${seq}`;
}

function blankMeal(): MealDraft {
  return {
    key: nextKey(),
    name: "",
    nameEn: "",
    moment: "breakfast",
    macros: { ...EMPTY_MACROS },
    options: [],
  };
}

export function NutritionTemplateDialog({
  template,
  libraryMeals,
  onClose,
  onSubmit,
}: {
  /** `null` ⇒ create. */
  template: NutritionTemplateRow | null;
  libraryMeals: NutritionMealRow[];
  onClose: () => void;
  onSubmit: (payload: unknown) => Promise<void>;
}) {
  const t = useTranslations("nutritionLibrary");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(template?.name.es ?? "");
  const [nameEn, setNameEn] = useState(template?.name.en ?? "");
  const [showTranslation, setShowTranslation] = useState(
    Boolean(template && template.name.en && template.name.en !== template.name.es),
  );
  const [macros, setMacros] = useState<MacroDraft>(toMacroDraft(template?.targets));
  const [meals, setMeals] = useState<MealDraft[]>(
    template && template.meals.length > 0
      ? [...template.meals]
          .sort((a, b) => a.order - b.order)
          .map((meal) => ({
            key: nextKey(),
            mealId: meal.mealId,
            name: meal.name.es,
            nameEn: meal.name.en,
            moment: meal.moment,
            macros: toMacroDraft(meal.targets),
            options: (meal.options ?? []).map((option: NutritionMealOption) => ({
              id: option.id,
              text: option.text.es,
              textEn: option.text.en,
              kcal: option.targets?.kcal == null ? "" : String(option.targets.kcal),
            })),
          }))
      : [blankMeal()],
  );

  function patchMeal(key: string, patch: Partial<MealDraft>) {
    setMeals((current) =>
      current.map((meal) => (meal.key === key ? { ...meal, ...patch } : meal)),
    );
  }

  /** Fill a row from a library meal — a COPY, never a link. See the file header. */
  function fillFromLibrary(key: string, mealId: string) {
    const source = libraryMeals.find((meal) => meal.id === mealId);
    if (!source) return;
    patchMeal(key, {
      mealId: source.id,
      name: source.name.es || source.name.en,
      nameEn: source.name.en || source.name.es,
      moment: source.moment,
      macros: toMacroDraft(source.targets),
      options: (source.options ?? []).map((option: NutritionMealOption) => ({
        text: option.text.es || option.text.en,
        textEn: option.text.en || option.text.es,
        kcal: option.targets?.kcal == null ? "" : String(option.targets.kcal),
      })),
    });
  }

  function buildPayload() {
    return {
      name: { es: name.trim(), en: (showTranslation ? nameEn : name).trim() },
      targets: {
        kcal: numberOrNull(macros.kcal),
        proteinG: numberOrNull(macros.proteinG),
        carbsG: numberOrNull(macros.carbsG),
        fatG: numberOrNull(macros.fatG),
      },
      meals: meals
        .filter((meal) => meal.name.trim() !== "")
        .map((meal) => ({
          ...(meal.mealId ? { mealId: meal.mealId } : {}),
          name: {
            es: meal.name.trim(),
            en: (showTranslation ? meal.nameEn : meal.name).trim(),
          },
          moment: meal.moment,
          targets: {
            kcal: numberOrNull(meal.macros.kcal),
            proteinG: numberOrNull(meal.macros.proteinG),
            carbsG: numberOrNull(meal.macros.carbsG),
            fatG: numberOrNull(meal.macros.fatG),
          },
          options: meal.options
            .filter((option) => option.text.trim() !== "")
            .map((option) => ({
              ...(option.id ? { id: option.id } : {}),
              text: {
                es: option.text.trim(),
                en: (showTranslation ? option.textEn : option.text).trim(),
              },
              targets: { kcal: numberOrNull(option.kcal) },
            })),
        })),
    };
  }

  async function save() {
    setError(null);
    const payload = buildPayload();
    const parsed = nutritionTemplateFormSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("errorGeneric"));
      return;
    }
    setSaving(true);
    try {
      await onSubmit(payload);
      toast.success(t("saved"));
      onClose();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? t("editTemplate") : t("newTemplate")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4" data-testid="nutrition-template-dialog">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nutrition-template-name">{t("templateName")}</Label>
            <Input
              id="nutrition-template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("templateNamePlaceholder")}
              data-testid="nutrition-template-name"
            />
            {showTranslation ? (
              <Input
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder={t("englishSuffix")}
                data-testid="nutrition-template-name-en"
              />
            ) : (
              <button
                type="button"
                className="self-start text-xs text-muted-foreground underline"
                onClick={() => {
                  setNameEn(name);
                  setShowTranslation(true);
                }}
              >
                {t("translationToggle")}
              </button>
            )}
          </div>

          <MacroFields
            legend={t("dailyTargets")}
            help={t("macrosHelp")}
            value={macros}
            onChange={setMacros}
            testIdPrefix="nutrition-template-macro"
          />

          <div className="flex flex-col gap-2">
            <Label>{t("meals")}</Label>
            {meals.map((meal, index) => (
              <Card key={meal.key} data-testid={`nutrition-template-meal-${index}`}>
                <CardContent className="flex flex-col gap-3 py-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">
                        {t("fromLibrary")}
                      </Label>
                      <Select
                        value={meal.mealId ?? ""}
                        onValueChange={(value) => fillFromLibrary(meal.key, value)}
                      >
                        <SelectTrigger
                          data-testid={`nutrition-template-meal-${index}-library`}
                        >
                          <SelectValue placeholder={t("fromLibraryPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {libraryMeals.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name.es || option.name.en}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("removeMeal")}
                      onClick={() =>
                        setMeals((current) =>
                          current.filter((item) => item.key !== meal.key),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">
                        {t("mealName")}
                      </Label>
                      <Input
                        value={meal.name}
                        onChange={(event) =>
                          patchMeal(meal.key, { name: event.target.value })
                        }
                        data-testid={`nutrition-template-meal-${index}-name`}
                      />
                      {showTranslation ? (
                        <Input
                          value={meal.nameEn}
                          onChange={(event) =>
                            patchMeal(meal.key, { nameEn: event.target.value })
                          }
                          placeholder={t("englishSuffix")}
                        />
                      ) : null}
                    </div>
                    <div className="flex w-40 flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">
                        {t("mealMoment")}
                      </Label>
                      <Select
                        value={meal.moment}
                        onValueChange={(value) =>
                          patchMeal(meal.key, { moment: value as NutritionMealMoment })
                        }
                      >
                        <SelectTrigger
                          data-testid={`nutrition-template-meal-${index}-moment`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NUTRITION_MEAL_MOMENTS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {t(`moment_${value}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <MacroFields
                    legend={t("macros")}
                    value={meal.macros}
                    onChange={(next) => patchMeal(meal.key, { macros: next })}
                    testIdPrefix={`nutrition-template-meal-${index}-macro`}
                  />
                </CardContent>
              </Card>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setMeals((current) => [...current, blankMeal()])}
              data-testid="nutrition-template-add-meal"
            >
              {t("addMeal")}
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={saving} data-testid="nutrition-template-save">
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
