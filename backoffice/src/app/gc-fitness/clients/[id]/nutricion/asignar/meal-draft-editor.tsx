"use client";

// One meal of AssignNutritionForm's meal list (#507 — split out of the
// 1,400-line component): name / moment / translation, the four macro boxes
// with their kcal hint, and the A/B/C options. Every edit is a patch the form
// applies to its `meals` state.

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
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
  NUTRITION_MEAL_MOMENTS,
  type NutritionMealMoment,
} from "@/lib/gc-fitness/nutrition-schema";

import { momentKey, nextKey, type DraftMeal } from "./nutrition-form-model";
import { MacroInput, MacroKcalHint } from "./nutrition-form-parts";

export function MealDraftEditor({
  meal,
  mealIndex,
  deviated,
  canRemove,
  showTranslation,
  onPatch,
  onRemove,
}: {
  meal: DraftMeal;
  mealIndex: number;
  /** #918 — this meal differs from the template it came from. */
  deviated: boolean;
  /** The last meal can't be removed. */
  canRemove: boolean;
  showTranslation: boolean;
  onPatch: (patch: Partial<DraftMeal>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("clients.detail.nutrition");
  return (
  <div className="flex flex-col gap-3 rounded-lg border p-3">
    {deviated ? (
      <span
        className="self-start rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning"
        data-testid={`nutrition-deviation-meal-${mealIndex}`}
      >
        {t("retouched")}
      </span>
    ) : null}
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
        <Label htmlFor={`meal-name-${meal.key}`}>{t("mealName")}</Label>
        <Input
          id={`meal-name-${meal.key}`}
          value={meal.name}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`meal-moment-${meal.key}`}>{t("mealMoment")}</Label>
        <Select
          value={meal.moment}
          onValueChange={(value) =>
            onPatch({ moment: value as NutritionMealMoment })
          }
        >
          <SelectTrigger id={`meal-moment-${meal.key}`} className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NUTRITION_MEAL_MOMENTS.map((moment) => (
              <SelectItem key={moment} value={moment}>
                {t(momentKey(moment))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("removeMeal")}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : null}
    </div>

    {showTranslation ? (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`meal-name-en-${meal.key}`}>
          {t("mealName")} {t("englishSuffix")}
        </Label>
        <Input
          id={`meal-name-en-${meal.key}`}
          value={meal.nameEn}
          onChange={(event) => onPatch({ nameEn: event.target.value })}
        />
      </div>
    ) : null}

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MacroInput
        label={t("kcal")}
        value={meal.kcal}
        onChange={(value) => onPatch({ kcal: value })}
        id={`meal-kcal-${meal.key}`}
      />
      <MacroInput
        label={t("protein")}
        unit={t("gramsSuffix")}
        value={meal.proteinG}
        onChange={(value) => onPatch({ proteinG: value })}
        id={`meal-protein-${meal.key}`}
      />
      <MacroInput
        label={t("carbs")}
        unit={t("gramsSuffix")}
        value={meal.carbsG}
        onChange={(value) => onPatch({ carbsG: value })}
        id={`meal-carbs-${meal.key}`}
      />
      <MacroInput
        label={t("fat")}
        unit={t("gramsSuffix")}
        value={meal.fatG}
        onChange={(value) => onPatch({ fatG: value })}
        id={`meal-fat-${meal.key}`}
      />
    </div>
    <MacroKcalHint
      kcal={meal.kcal}
      proteinG={meal.proteinG}
      carbsG={meal.carbsG}
      fatG={meal.fatG}
      testId={`meal-kcal-hint-${meal.key}`}
    />

    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{t("mealOptions")}</Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid={`add-option-${meal.key}`}
          onClick={() =>
            onPatch({
              options: [
                ...meal.options,
                { key: nextKey("opt"), text: "", textEn: "", kcal: "" },
              ],
            })
          }
        >
          {t("addOption")}
        </Button>
      </div>
      {meal.options.map((option, index) => (
        <div key={option.key} className="flex flex-wrap items-end gap-2">
          <span className="text-muted-foreground w-5 pb-2 text-xs font-semibold">
            {/* A / B / C is DERIVED from order, never stored — reordering must
                not mean rewriting every label. */}
            {String.fromCharCode(65 + index)}
          </span>
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <Label htmlFor={`option-${option.key}`} className="sr-only">
              {t("optionText")}
            </Label>
            <Input
              id={`option-${option.key}`}
              placeholder={t("optionText")}
              value={option.text}
              onChange={(event) =>
                onPatch({
                  options: meal.options.map((item) =>
                    item.key === option.key
                      ? { ...item, text: event.target.value }
                      : item,
                  ),
                })
              }
            />
          </div>
          <Input
            className="w-24"
            inputMode="numeric"
            placeholder="kcal"
            value={option.kcal}
            onChange={(event) =>
              onPatch({
                options: meal.options.map((item) =>
                  item.key === option.key
                    ? { ...item, kcal: event.target.value }
                    : item,
                ),
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("removeOption")}
            onClick={() =>
              onPatch({
                options: meal.options.filter((item) => item.key !== option.key),
              })
            }
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  </div>
  );
}
