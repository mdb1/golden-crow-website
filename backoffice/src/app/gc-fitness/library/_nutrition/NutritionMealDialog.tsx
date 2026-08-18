"use client";

// NutritionMealDialog.tsx
//
// Create / edit ONE reusable meal of the coach's library (#918): its name, its moment, its
// reference macros, and the options the client sees behind the ⓘ.
//
// ── WHY A SINGLE TYPED NAME WITH AN OPT-IN TRANSLATION ───────────────────────────────
//
// The wire type is a `{en, es}` pair, but a coach types one name. While the translation
// pane is collapsed BOTH slots carry the same text — "no translation" must not mean "blank
// in English", which is how a client with an English phone ends up staring at an empty row.
// Same shape the assign form (#914) already uses; the bilingual-forms convention is
// locale-first with one opt-in toggle.
//
// ── VALIDATION RUNS THROUGH THE SHARED SCHEMA ────────────────────────────────────────
//
// `nutritionMealFormSchema` is the same object the Server Action parses. Validating with a
// second, hand-written set of rules here is how a form comes to accept something the action
// rejects — and the failure surfaces as a generic error at save time.

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  nutritionMealFormSchema,
  type NutritionMealRow,
} from "@/lib/gc-fitness/nutrition-library-model";
import {
  NUTRITION_MEAL_MOMENTS,
  type NutritionMealMoment,
  type NutritionMealOption,
} from "@/lib/gc-fitness/nutrition-schema";

import { MacroFields, numberOrNull, type MacroDraft, toMacroDraft } from "./macro-fields";

interface OptionDraft {
  key: string;
  id?: string;
  text: string;
  textEn: string;
  kcal: string;
}

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `opt-${seq}`;
}

export function NutritionMealDialog({
  meal,
  onClose,
  onSubmit,
}: {
  /** `null` ⇒ create. */
  meal: NutritionMealRow | null;
  onClose: () => void;
  onSubmit: (payload: unknown) => Promise<void>;
}) {
  const t = useTranslations("nutritionLibrary");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(meal?.name.es ?? "");
  const [nameEn, setNameEn] = useState(meal?.name.en ?? "");
  const [showTranslation, setShowTranslation] = useState(
    // Opened for a meal whose two slots already differ ⇒ somebody DID translate it, and
    // hiding that pane would silently overwrite the English one on the next save.
    Boolean(meal && meal.name.en && meal.name.en !== meal.name.es),
  );
  const [moment, setMoment] = useState<NutritionMealMoment>(meal?.moment ?? "breakfast");
  const [macros, setMacros] = useState<MacroDraft>(toMacroDraft(meal?.targets));
  const [options, setOptions] = useState<OptionDraft[]>(
    (meal?.options ?? []).map((option: NutritionMealOption) => ({
      key: nextKey(),
      id: option.id,
      text: option.text.es,
      textEn: option.text.en,
      kcal: option.targets?.kcal == null ? "" : String(option.targets.kcal),
    })),
  );

  function buildPayload() {
    return {
      name: { es: name.trim(), en: (showTranslation ? nameEn : name).trim() },
      moment,
      targets: {
        kcal: numberOrNull(macros.kcal),
        proteinG: numberOrNull(macros.proteinG),
        carbsG: numberOrNull(macros.carbsG),
        fatG: numberOrNull(macros.fatG),
      },
      options: options
        .filter((option) => option.text.trim() !== "")
        .map((option) => ({
          // The id SURVIVES an edit: an option is what the ⓘ sheet lists, and regenerating
          // ids on every save would make any future per-option reference dangling.
          ...(option.id ? { id: option.id } : {}),
          text: {
            es: option.text.trim(),
            en: (showTranslation ? option.textEn : option.text).trim(),
          },
          targets: { kcal: numberOrNull(option.kcal) },
        })),
    };
  }

  async function save() {
    setError(null);
    const payload = buildPayload();
    const parsed = nutritionMealFormSchema.safeParse(payload);
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
      // The dialog STAYS OPEN. Closing on failure throws away everything typed for a write
      // that never happened.
      setError(t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{meal ? t("editMeal") : t("newMeal")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4" data-testid="nutrition-meal-dialog">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nutrition-meal-name">{t("mealName")}</Label>
            <Input
              id="nutrition-meal-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("mealNamePlaceholder")}
              data-testid="nutrition-meal-name"
            />
            {showTranslation ? (
              <Input
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder={t("englishSuffix")}
                data-testid="nutrition-meal-name-en"
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

          <div className="flex flex-col gap-1.5">
            <Label>{t("mealMoment")}</Label>
            <Select
              value={moment}
              onValueChange={(value) => setMoment(value as NutritionMealMoment)}
            >
              <SelectTrigger data-testid="nutrition-meal-moment">
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

          <MacroFields
            legend={t("macros")}
            help={t("macrosHelp")}
            value={macros}
            onChange={setMacros}
            testIdPrefix="nutrition-meal-macro"
          />

          <div className="flex flex-col gap-2">
            <Label>{t("options")}</Label>
            <p className="text-xs text-muted-foreground">{t("optionsHelp")}</p>
            {options.map((option) => (
              <div key={option.key} className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <Input
                    value={option.text}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((item) =>
                          item.key === option.key
                            ? { ...item, text: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder={t("optionPlaceholder")}
                    data-testid={`nutrition-meal-option-${option.key}`}
                  />
                  {showTranslation ? (
                    <Input
                      value={option.textEn}
                      onChange={(event) =>
                        setOptions((current) =>
                          current.map((item) =>
                            item.key === option.key
                              ? { ...item, textEn: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder={t("englishSuffix")}
                    />
                  ) : null}
                </div>
                <Input
                  className="w-24"
                  inputMode="decimal"
                  value={option.kcal}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((item) =>
                        item.key === option.key
                          ? { ...item, kcal: event.target.value }
                          : item,
                      ),
                    )
                  }
                  placeholder="kcal"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("removeOption")}
                  onClick={() =>
                    setOptions((current) =>
                      current.filter((item) => item.key !== option.key),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                setOptions((current) => [
                  ...current,
                  { key: nextKey(), text: "", textEn: "", kcal: "" },
                ])
              }
              data-testid="nutrition-meal-add-option"
            >
              {t("addOption")}
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={saving} data-testid="nutrition-meal-save">
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
