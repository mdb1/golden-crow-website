"use client";

// AssignNutritionForm.tsx
//
// The coach's assign screen (#914): validity window, daily targets, inline meals with
// options, and — above the save button — what this assign is about to do to the phases
// that already exist.
//
// The overlap notice is not a hand-written sentence: it comes from `previewNutritionAssign`,
// which runs the SAME `nutritionPlanOverlapEdits` the save runs. A separately-written
// warning drifts the first time the trimming rules change, and then the screen promises
// one thing while the write does another.
//
// Validation goes through `nutritionPlanFormSchema` directly rather than react-hook-form:
// the meals/options tree is two levels of dynamic arrays, and a plain controlled tree plus
// one `safeParse` on submit is far easier to keep honest than nested field arrays.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  assignNutritionPlan,
  previewNutritionAssign,
} from "@/lib/gc-fitness/nutrition-actions";
import { templateDeviations } from "@/lib/gc-fitness/nutrition-library-model";
import type { NutritionTemplateRow } from "@/lib/gc-fitness/nutrition-library-model";
import { nutritionPlanFormSchema } from "@/lib/gc-fitness/nutrition-plan-form";
import type { NutritionOverlapNotice } from "@/lib/gc-fitness/nutrition-plan-form";
import {
  NUTRITION_MEAL_MOMENTS,
  type NutritionMealMoment,
} from "@/lib/gc-fitness/nutrition-schema";

interface DraftOption {
  key: string;
  text: string;
  textEn: string;
  kcal: string;
}

interface DraftMeal {
  key: string;
  /** Set only when the row came from a library meal — provenance, and the daily-log key. */
  mealId?: string;
  name: string;
  nameEn: string;
  moment: NutritionMealMoment;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  options: DraftOption[];
}

let seq = 0;
function nextKey(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function emptyMeal(moment: NutritionMealMoment): DraftMeal {
  return {
    key: nextKey("meal"),
    name: "",
    nameEn: "",
    moment,
    kcal: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    options: [],
  };
}

/**
 * The English slot: what was typed in English, or the Spanish text when there is none.
 *
 * Reads the English field even while its pane is collapsed, because a draft prefilled from
 * a library template already HAS an English name — discarding it on save would flatten
 * every template's translation the first time it is assigned.
 */
function englishOr(english: string, fallback: string): string {
  const typed = english.trim();
  return typed === "" ? fallback.trim() : typed;
}

/** Blank → `null`, so an unset macro stays unset instead of becoming a zero target. */
function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function AssignNutritionForm({
  clientId,
  defaultStartsOn,
  templates = [],
}: {
  clientId: string;
  defaultStartsOn: string;
  /**
   * The coach's reusable plans (#918). Empty is a legitimate state — a coach who has not
   * built a library yet types the plan inline, exactly as before.
   */
  templates?: NutritionTemplateRow[];
}) {
  const t = useTranslations("clients.detail.nutrition");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [showTranslation, setShowTranslation] = useState(false);
  const [startsOn, setStartsOn] = useState(defaultStartsOn);
  const [openEnded, setOpenEnded] = useState(false);
  const [endsOn, setEndsOn] = useState("");
  const [kcal, setKcal] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [meals, setMeals] = useState<DraftMeal[]>([emptyMeal("breakfast")]);
  const [overlap, setOverlap] = useState<NutritionOverlapNotice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The template this draft came from, kept so the form can diff against it. */
  const [sourceTemplate, setSourceTemplate] = useState<NutritionTemplateRow | null>(null);

  const effectiveEndsOn = openEnded ? null : endsOn.trim() === "" ? null : endsOn;

  /**
   * Fill the whole form from a template — a COPY, not a link. The plan keeps `templateId`
   * for provenance (that is what the library's "asignada N veces" pill counts), and every
   * later edit to the template leaves this plan alone.
   */
  const applyTemplate = useCallback((template: NutritionTemplateRow) => {
    setSourceTemplate(template);
    setName(template.name.es || template.name.en);
    setNameEn(template.name.en || template.name.es);
    setKcal(template.targets?.kcal == null ? "" : String(template.targets.kcal));
    setProteinG(template.targets?.proteinG == null ? "" : String(template.targets.proteinG));
    setCarbsG(template.targets?.carbsG == null ? "" : String(template.targets.carbsG));
    setFatG(template.targets?.fatG == null ? "" : String(template.targets.fatG));
    setMeals(
      [...template.meals]
        .sort((a, b) => a.order - b.order)
        .map((meal) => ({
          key: nextKey("meal"),
          // The `mealId` SURVIVES into the assigned plan: it is the key the daily log's
          // `meals` map uses, and the FK the usage pill counts by.
          mealId: meal.mealId,
          name: meal.name.es || meal.name.en,
          nameEn: meal.name.en || meal.name.es,
          moment: meal.moment,
          kcal: meal.targets?.kcal == null ? "" : String(meal.targets.kcal),
          proteinG: meal.targets?.proteinG == null ? "" : String(meal.targets.proteinG),
          carbsG: meal.targets?.carbsG == null ? "" : String(meal.targets.carbsG),
          fatG: meal.targets?.fatG == null ? "" : String(meal.targets.fatG),
          options: (meal.options ?? []).map((option) => ({
            key: nextKey("option"),
            text: option.text.es || option.text.en,
            textEn: option.text.en || option.text.es,
            kcal: option.targets?.kcal == null ? "" : String(option.targets.kcal),
          })),
        })),
    );
  }, []);

  /**
   * What the coach retouched FOR THIS CLIENT, relative to the template.
   *
   * A diff, not a dirty flag: typing a value and then typing the original back is not a
   * modification, and a flag would keep claiming it was. Empty while no template is in play.
   */
  const deviations = useMemo(() => {
    if (!sourceTemplate) return [];
    return templateDeviations(
      {
        targets: sourceTemplate.targets ?? {},
        meals: [...sourceTemplate.meals]
          .sort((a, b) => a.order - b.order)
          .map((meal) => ({
            name: meal.name,
            moment: meal.moment,
            targets: meal.targets ?? {},
            options: meal.options ?? [],
          })),
      },
      {
        targets: {
          kcal: numberOrNull(kcal),
          proteinG: numberOrNull(proteinG),
          carbsG: numberOrNull(carbsG),
          fatG: numberOrNull(fatG),
        },
        meals: meals.map((meal) => ({
          name: { es: meal.name.trim(), en: englishOr(meal.nameEn, meal.name) },
          moment: meal.moment,
          targets: {
            kcal: numberOrNull(meal.kcal),
            proteinG: numberOrNull(meal.proteinG),
            carbsG: numberOrNull(meal.carbsG),
            fatG: numberOrNull(meal.fatG),
          },
          options: meal.options.map((option) => ({
            text: { es: option.text.trim(), en: englishOr(option.textEn, option.text) },
          })),
        })),
      },
    );
  }, [sourceTemplate, kcal, proteinG, carbsG, fatG, meals]);

  const dailyDeviated = deviations.some((d) => d.scope === "daily");
  const deviatedMealIndexes = new Set(
    deviations
      .map((d) => (typeof d.scope === "object" ? d.scope.mealIndex : null))
      .filter((index): index is number => index !== null),
  );

  // Refresh the overlap notice whenever the window moves. It is a read, so running it on
  // every date change is cheap and keeps the warning honest as the coach fiddles.
  useEffect(() => {
    let cancelled = false;
    if (!startsOn) return;
    previewNutritionAssign({ clientId, startsOn, endsOn: effectiveEndsOn })
      .then((notices) => {
        if (!cancelled) setOverlap(notices);
      })
      .catch(() => {
        if (!cancelled) setOverlap(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, startsOn, effectiveEndsOn]);

  const buildPayload = useCallback(() => {
    return {
      clientId,
      // Provenance. The library's "asignada N veces" pill counts exactly this field, and it
      // is what lets a later audit answer "which template did this plan come from".
      templateId: sourceTemplate?.id ?? null,
      // The schema requires BOTH slots, and "no translation" must not mean "blank in
      // English" — so the Spanish text fills in when there is no English one.
      //
      // ⚠️ It reads `nameEn` regardless of whether the pane is OPEN (#918). A plan
      // prefilled from a template already carries the template's English name, and gating
      // on the toggle would overwrite it with the Spanish text the moment the coach saved
      // without expanding a pane they had no reason to expand.
      name: { es: name.trim(), en: englishOr(nameEn, name) },
      startsOn,
      endsOn: effectiveEndsOn,
      targets: {
        kcal: numberOrNull(kcal),
        proteinG: numberOrNull(proteinG),
        carbsG: numberOrNull(carbsG),
        fatG: numberOrNull(fatG),
      },
      meals: meals.map((meal) => ({
        ...(meal.mealId ? { mealId: meal.mealId } : {}),
        name: { es: meal.name.trim(), en: englishOr(meal.nameEn, meal.name) },
        moment: meal.moment,
        targets: {
          kcal: numberOrNull(meal.kcal),
          proteinG: numberOrNull(meal.proteinG),
          carbsG: numberOrNull(meal.carbsG),
          fatG: numberOrNull(meal.fatG),
        },
        options: meal.options.map((option) => ({
          text: { es: option.text.trim(), en: englishOr(option.textEn, option.text) },
          targets: { kcal: numberOrNull(option.kcal) },
        })),
      })),
    };
  }, [
    clientId,
    sourceTemplate,
    name,
    nameEn,
    startsOn,
    effectiveEndsOn,
    kcal,
    proteinG,
    carbsG,
    fatG,
    meals,
  ]);

  function onSubmit() {
    setError(null);
    const payload = buildPayload();
    const parsed = nutritionPlanFormSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("errorGeneric"));
      return;
    }

    startTransition(async () => {
      try {
        await assignNutritionPlan(payload);
        toast.success(t("saved"));
        router.push(`/gc-fitness/clients/${clientId}/nutricion`);
        router.refresh();
      } catch {
        setError(t("errorGeneric"));
      }
    });
  }

  function patchMeal(key: string, patch: Partial<DraftMeal>) {
    setMeals((current) =>
      current.map((meal) => (meal.key === key ? { ...meal, ...patch } : meal)),
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="assign-nutrition-form">
      {/* ── From a template (#918) ──────────────────────────────────────────────── */}
      {templates.length > 0 ? (
        <Card data-testid="nutrition-template-picker">
          <CardHeader>
            <CardTitle className="text-base">{t("fromTemplate")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Select
              value={sourceTemplate?.id ?? ""}
              onValueChange={(value) => {
                const picked = templates.find((template) => template.id === value);
                if (picked) applyTemplate(picked);
              }}
            >
              <SelectTrigger data-testid="nutrition-template-select">
                <SelectValue placeholder={t("fromTemplatePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name.es || template.name.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {sourceTemplate ? t("fromTemplateApplied") : t("fromTemplateHelp")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Validity ────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("validity")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nutrition-starts-on">{t("startsOn")}</Label>
              <Input
                id="nutrition-starts-on"
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nutrition-ends-on">{t("endsOn")}</Label>
              <Input
                id="nutrition-ends-on"
                type="date"
                value={endsOn}
                disabled={openEnded}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={openEnded}
              onChange={(event) => setOpenEnded(event.target.checked)}
              data-testid="nutrition-open-ended"
            />
            {t("endsOnOpen")}
          </label>
          {openEnded ? (
            // Open-ended is legitimate — the self-serve client's plan is normally
            // open-ended — but the editor nudges toward closing it, because phases are
            // what make the past readable.
            <p className="text-muted-foreground text-xs">{t("endsOnOpenHelp")}</p>
          ) : null}

          <OverlapNotice notices={overlap} />
        </CardContent>
      </Card>

      {/* ── Name + daily targets ────────────────────────────────────────────────── */}
      <Card data-testid="nutrition-daily-targets">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {t("dailyTargets")}
            {/* #918 — "lo modificado marcado". A DIFF against the template, so typing a
                value and typing the original back stops being a modification. */}
            {dailyDeviated ? (
              <span
                className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                data-testid="nutrition-deviation-daily"
              >
                {t("retouched")}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nutrition-name">{t("planName")}</Label>
            <Input
              id="nutrition-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Definición"
            />
            <p className="text-muted-foreground text-xs">{t("planNameHelp")}</p>
          </div>

          <button
            type="button"
            className="text-primary self-start text-xs underline-offset-2 hover:underline"
            onClick={() => setShowTranslation((value) => !value)}
          >
            {t("translationToggle")}
          </button>
          {showTranslation ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nutrition-name-en">
                {t("planName")} {t("englishSuffix")}
              </Label>
              <Input
                id="nutrition-name-en"
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MacroInput label={t("kcal")} value={kcal} onChange={setKcal} id="target-kcal" />
            <MacroInput
              label={t("protein")}
              value={proteinG}
              onChange={setProteinG}
              id="target-protein"
            />
            <MacroInput
              label={t("carbs")}
              value={carbsG}
              onChange={setCarbsG}
              id="target-carbs"
            />
            <MacroInput label={t("fat")} value={fatG} onChange={setFatG} id="target-fat" />
          </div>
        </CardContent>
      </Card>

      {/* ── Meals ───────────────────────────────────────────────────────────────── */}
      <Card data-testid="nutrition-meals">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{t("meals")}</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="add-meal"
            onClick={() => setMeals((current) => [...current, emptyMeal("other")])}
          >
            {t("addMeal")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {meals.map((meal, mealIndex) => (
            <div key={meal.key} className="flex flex-col gap-3 rounded-lg border p-3">
              {deviatedMealIndexes.has(mealIndex) ? (
                <span
                  className="self-start rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
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
                    onChange={(event) => patchMeal(meal.key, { name: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`meal-moment-${meal.key}`}>{t("mealMoment")}</Label>
                  <Select
                    value={meal.moment}
                    onValueChange={(value) =>
                      patchMeal(meal.key, { moment: value as NutritionMealMoment })
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
                {meals.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeMeal")}
                    onClick={() =>
                      setMeals((current) => current.filter((item) => item.key !== meal.key))
                    }
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
                    onChange={(event) => patchMeal(meal.key, { nameEn: event.target.value })}
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MacroInput
                  label={t("kcal")}
                  value={meal.kcal}
                  onChange={(value) => patchMeal(meal.key, { kcal: value })}
                  id={`meal-kcal-${meal.key}`}
                />
                <MacroInput
                  label={t("protein")}
                  value={meal.proteinG}
                  onChange={(value) => patchMeal(meal.key, { proteinG: value })}
                  id={`meal-protein-${meal.key}`}
                />
                <MacroInput
                  label={t("carbs")}
                  value={meal.carbsG}
                  onChange={(value) => patchMeal(meal.key, { carbsG: value })}
                  id={`meal-carbs-${meal.key}`}
                />
                <MacroInput
                  label={t("fat")}
                  value={meal.fatG}
                  onChange={(value) => patchMeal(meal.key, { fatG: value })}
                  id={`meal-fat-${meal.key}`}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>{t("mealOptions")}</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-testid={`add-option-${meal.key}`}
                    onClick={() =>
                      patchMeal(meal.key, {
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
                          patchMeal(meal.key, {
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
                        patchMeal(meal.key, {
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
                        patchMeal(meal.key, {
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
          ))}
        </CardContent>
      </Card>

      {error ? (
        <p className="text-destructive text-sm" role="alert" data-testid="nutrition-form-error">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/gc-fitness/clients/${clientId}/nutricion`)}
        >
          {t("cancel")}
        </Button>
        <Button type="button" onClick={onSubmit} disabled={pending} data-testid="nutrition-save">
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}

function momentKey(moment: NutritionMealMoment) {
  switch (moment) {
    case "breakfast":
      return "momentBreakfast" as const;
    case "lunch":
      return "momentLunch" as const;
    case "snack":
      return "momentSnack" as const;
    case "dinner":
      return "momentDinner" as const;
    default:
      return "momentOther" as const;
  }
}

function MacroInput({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * What this assign will do to the phases that already exist.
 *
 * Rendered even when there is nothing to do ("no se solapa con ninguna fase"), because the
 * absence of a warning is ambiguous: it reads the same as a warning that failed to load.
 */
function OverlapNotice({ notices }: { notices: NutritionOverlapNotice[] | null }) {
  const t = useTranslations("clients.detail.nutrition");
  if (notices === null) return null;

  if (notices.length === 0) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="nutrition-overlap-none">
        {t("overlapNone")}
      </p>
    );
  }

  return (
    <div
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
      data-testid="nutrition-overlap-notice"
    >
      <p className="text-sm font-medium">{t("overlapTitle")}</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-sm">
        {notices.map((notice) => (
          <li key={notice.planId}>
            {notice.kind === "trim"
              ? t("overlapTrim", { name: notice.planName, date: notice.date ?? "" })
              : notice.kind === "deferStart"
                ? t("overlapDefer", { name: notice.planName, date: notice.date ?? "" })
                : t("overlapSupersede", { name: notice.planName })}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1 text-xs">{t("overlapWhy")}</p>
    </div>
  );
}
