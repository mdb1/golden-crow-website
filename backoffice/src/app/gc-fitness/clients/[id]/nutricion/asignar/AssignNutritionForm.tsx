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
//
// #507 — split by responsibility: the pure draft model + payload live in
// `nutrition-form-model.ts`, one meal's editor in `meal-draft-editor.tsx`, and the
// small presentational pieces in `nutrition-form-parts.tsx`. This file keeps the state,
// the draft autosave, the overlap preview and the save fork.
//
// ── THE SAME FORM ALSO EDITS AN EXISTING PHASE (#949) ────────────────────────────────
//
// A coach who wants to change what a client eats from Wednesday on has two different
// intents, and they are NOT the same write:
//
//   · "de un día en adelante" — Wednesday's targets differ from Monday's. That is a NEW
//     phase starting Wednesday, and the phase in force gets trimmed to Tuesday. Which is
//     exactly what a plain assign already does: `nutritionPlanOverlapEdits` trims the
//     neighbour, and the overlap notice above the save button already spells it out. So
//     this branch is an ASSIGN prefilled from the phase being edited — no new write path,
//     no second set of overlap rules to keep in step.
//
//   · "toda la fase" — the coach typed 190 g of protein and meant 90, or the phase ends a
//     week later than they thought. There is no new phase; the document is corrected.
//     That is `updateNutritionPlan`.
//
// Rewriting the phase in place for the first case would be wrong in a way nothing would
// report: every day the client ALREADY marked froze its own `targetsSnapshot`, so the past
// keeps reading correctly, but the phase would then claim it always asked for the new
// numbers — and the weight-vs-plan table would compare a month of weigh-ins against
// targets that only existed for its last week.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  updateNutritionPlan,
} from "@/lib/gc-fitness/nutrition-actions";
import type { NutritionTemplateRow } from "@/lib/gc-fitness/nutrition-library-model";
import { nutritionPlanFormSchema } from "@/lib/gc-fitness/nutrition-plan-form";
import {
  clearNutritionPlanDraft,
  nutritionPlanDraftKey,
  readNutritionPlanDraft,
  writeNutritionPlanDraft,
} from "@/lib/gc-fitness/nutrition-plan-draft";
import {
  isStaleDeploymentError,
  reloadOntoCurrentDeployment,
  reportStaleDeployment,
} from "@/lib/gc-fitness/stale-deployment";
import type { NutritionOverlapNotice } from "@/lib/gc-fitness/nutrition-plan-form";

import { MealDraftEditor } from "./meal-draft-editor";
import {
  buildNutritionPayload,
  canSplitPhase,
  draftMealsFromPlan,
  draftMealsFromTemplate,
  emptyMeal,
  initialName,
  macroText,
  nutritionFormDeviations,
  rekeyDraftMeals,
  type DraftMeal,
  type EditScope,
  type FormSnapshot,
  type NutritionEditContext,
} from "./nutrition-form-model";
import {
  MacroInput,
  MacroKcalHint,
  MealRollupPanel,
  OverlapNotice,
  ScopeOption,
} from "./nutrition-form-parts";

export type { NutritionEditContext } from "./nutrition-form-model";

const DRAFT_DEBOUNCE_MS = 500;

export function AssignNutritionForm({
  clientId,
  defaultStartsOn,
  templates = [],
  editing = null,
}: {
  clientId: string;
  defaultStartsOn: string;
  /**
   * The coach's reusable plans (#918). Empty is a legitimate state — a coach who has not
   * built a library yet types the plan inline, exactly as before.
   */
  templates?: NutritionTemplateRow[];
  /** Non-null turns the screen into the phase editor (#949). */
  editing?: NutritionEditContext | null;
}) {
  const t = useTranslations("clients.detail.nutrition");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // "De un día en adelante" only for a running phase that started before today.
  const canSplit = canSplitPhase(editing);

  const [scope, setScope] = useState<EditScope>(canSplit ? "fromDate" : "whole");

  const [name, setName] = useState(() => initialName(editing, "es"));
  const [nameEn, setNameEn] = useState(() => initialName(editing, "en"));
  const [showTranslation, setShowTranslation] = useState(false);
  const [startsOn, setStartsOn] = useState(() =>
    editing === null
      ? defaultStartsOn
      : canSplit
        ? editing.todayCivil
        : editing.plan.startsOn,
  );
  const [openEnded, setOpenEnded] = useState(
    () => editing !== null && !editing.plan.endsOn,
  );
  const [endsOn, setEndsOn] = useState(() => editing?.plan.endsOn ?? "");
  const [kcal, setKcal] = useState(() => macroText(editing?.plan.targets.kcal));
  const [proteinG, setProteinG] = useState(() => macroText(editing?.plan.targets.proteinG));
  const [carbsG, setCarbsG] = useState(() => macroText(editing?.plan.targets.carbsG));
  const [fatG, setFatG] = useState(() => macroText(editing?.plan.targets.fatG));
  const [meals, setMeals] = useState<DraftMeal[]>(() =>
    editing === null ? [emptyMeal("breakfast")] : draftMealsFromPlan(editing.plan),
  );
  const [overlap, setOverlap] = useState<NutritionOverlapNotice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The template this draft came from, kept so the form can diff against it. */
  const [sourceTemplate, setSourceTemplate] = useState<NutritionTemplateRow | null>(null);

  // ── Draft (see nutrition-plan-draft.ts) ────────────────────────────────────────────
  // Autosaved on every change, restored on mount, cleared on a successful save or an
  // explicit Cancel/Discard. A failed save that needs a reload (a deploy rotated the
  // Server Action IDs) is therefore safe to reload: the plan comes back.
  const draftKey = nutritionPlanDraftKey(clientId, editing?.planId ?? null);
  const [draftRestored, setDraftRestored] = useState(false);
  const snapshot = useMemo<FormSnapshot>(
    () => ({
      scope,
      name,
      nameEn,
      startsOn,
      openEnded,
      endsOn,
      kcal,
      proteinG,
      carbsG,
      fatG,
      meals,
      sourceTemplate,
    }),
    [scope, name, nameEn, startsOn, openEnded, endsOn, kcal, proteinG, carbsG, fatG, meals, sourceTemplate],
  );
  /** What the screen opened with — a draft identical to it is no draft. */
  const initialSnapshotRef = useRef<FormSnapshot>(snapshot);
  const latestSnapshotRef = useRef<FormSnapshot>(snapshot);
  latestSnapshotRef.current = snapshot;
  /** Set once the plan is saved or discarded: nothing may re-persist it after that. */
  const draftClosedRef = useRef(false);

  const applySnapshot = useCallback((next: FormSnapshot) => {
    setScope(next.scope);
    setName(next.name);
    setNameEn(next.nameEn);
    setStartsOn(next.startsOn);
    setOpenEnded(next.openEnded);
    setEndsOn(next.endsOn);
    setKcal(next.kcal);
    setProteinG(next.proteinG);
    setCarbsG(next.carbsG);
    setFatG(next.fatG);
    setMeals(next.meals);
    setSourceTemplate(next.sourceTemplate);
  }, []);

  useEffect(() => {
    const stored = readNutritionPlanDraft<FormSnapshot>(draftKey);
    if (!stored || !Array.isArray(stored.meals)) return;
    // Fresh React keys: the stored ones came from the PREVIOUS page load's counter and
    // would collide with the keys this load hands out to the next added meal/option.
    applySnapshot({
      ...stored,
      // A split is only offered for a running phase that started before today; a draft
      // from yesterday must not resurrect an option the screen no longer shows.
      scope: canSplit ? stored.scope : "whole",
      meals: rekeyDraftMeals(stored.meals),
    });
    setDraftRestored(true);
    // Mount-only: a later prop refresh must not overwrite what the coach is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const draftTimerRef = useRef<number | null>(null);
  const firstAutosaveRunRef = useRef(true);
  useEffect(() => {
    // The first run is the mount itself — nothing has been typed yet.
    if (firstAutosaveRunRef.current) {
      firstAutosaveRunRef.current = false;
      return;
    }
    if (draftClosedRef.current) return;
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null;
      if (draftClosedRef.current) return;
      if (JSON.stringify(snapshot) === JSON.stringify(initialSnapshotRef.current)) {
        clearNutritionPlanDraft(draftKey);
      } else {
        writeNutritionPlanDraft(draftKey, snapshot);
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [snapshot, draftKey]);

  // Leaving within the debounce window (tab close, back button) must not drop the last
  // keystrokes: flush synchronously on pagehide and on unmount.
  useEffect(() => {
    function flush() {
      if (draftClosedRef.current) return;
      const latest = latestSnapshotRef.current;
      if (JSON.stringify(latest) === JSON.stringify(initialSnapshotRef.current)) return;
      writeNutritionPlanDraft(draftKey, latest);
    }
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [draftKey]);

  function closeDraft() {
    draftClosedRef.current = true;
    clearNutritionPlanDraft(draftKey);
  }

  function discardDraft() {
    clearNutritionPlanDraft(draftKey);
    applySnapshot(initialSnapshotRef.current);
    setDraftRestored(false);
  }

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
    setMeals(draftMealsFromTemplate(template));
  }, []);

  /**
   * What the coach retouched FOR THIS CLIENT, relative to the template.
   *
   * A diff, not a dirty flag: typing a value and then typing the original back is not a
   * modification, and a flag would keep claiming it was. Empty while no template is in play.
   */
  const deviations = useMemo(
    () => nutritionFormDeviations(sourceTemplate, { kcal, proteinG, carbsG, fatG, meals }),
    [sourceTemplate, kcal, proteinG, carbsG, fatG, meals],
  );

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
    previewNutritionAssign({
      clientId,
      startsOn,
      endsOn: effectiveEndsOn,
      // Editing the whole phase must not warn that the phase collides with ITSELF. The
      // split branch deliberately does NOT exclude it: the trim it causes is the whole
      // point of that branch, and the coach should read it before saving.
      ...(editing && scope === "whole" ? { excludePlanId: editing.planId } : {}),
    })
      .then((notices) => {
        if (!cancelled) setOverlap(notices);
      })
      .catch(() => {
        if (!cancelled) setOverlap(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, startsOn, effectiveEndsOn, editing, scope]);

  const buildPayload = useCallback(() => {
    return buildNutritionPayload({
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
    });
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

    // A split that starts on or before the phase's own first day is not a split: it would
    // trim the original to nothing. Say so instead of silently soft-deleting a phase the
    // coach still believes exists.
    if (editing && scope === "fromDate" && payload.startsOn <= editing.plan.startsOn) {
      setError(t("editSplitTooEarly"));
      return;
    }

    startTransition(async () => {
      try {
        if (editing && scope === "whole") {
          await updateNutritionPlan(editing.planId, payload);
          toast.success(t("editSaved"));
        } else {
          await assignNutritionPlan(payload);
          toast.success(editing ? t("editSplitSaved") : t("saved"));
        }
        closeDraft();
        router.push(`/gc-fitness/clients/${clientId}/nutricion`);
        router.refresh();
      } catch (err) {
        console.error("[nutrition-form] save failed", err);
        // This tab runs last deployment's JS, so every retry would fail the same way.
        // The plan is already in the draft — write the latest state anyway (the debounce
        // may be pending) and reload onto the current deployment; the mount effect puts
        // it back on screen.
        if (isStaleDeploymentError(err)) {
          writeNutritionPlanDraft(draftKey, latestSnapshotRef.current);
          toast.info(t("staleReloading"));
          if (!reloadOntoCurrentDeployment()) reportStaleDeployment();
          return;
        }
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
      {draftRestored ? (
        <div
          role="status"
          data-testid="nutrition-draft-restored"
          className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{t("draftRestored")}</span>
          <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
            {t("draftDiscard")}
          </Button>
        </div>
      ) : null}
      {/* ── From a template (#918) ──────────────────────────────────────────────────
          Hidden while editing: `applyTemplate` replaces every `mealId` with the
          template's, and the daily logs of the phase being edited are keyed by the ids it
          already has. Re-applying a template would orphan every mark the client made. */}
      {templates.length > 0 && !editing ? (
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

      {/* ── What an edit means (#949) ───────────────────────────────────────────── */}
      {editing ? (
        <Card data-testid="nutrition-edit-scope">
          <CardHeader>
            <CardTitle className="text-base">{t("editScopeTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {canSplit ? (
              <ScopeOption
                checked={scope === "fromDate"}
                onSelect={() => {
                  setScope("fromDate");
                  // The cutoff is the new phase's first day. Re-seed it every time the
                  // coach comes back to this branch: leaving the whole-phase `startsOn`
                  // behind would silently rewrite history from the phase's own start.
                  setStartsOn(editing.todayCivil);
                }}
                testId="nutrition-edit-scope-from-date"
                label={t("editScopeFromDate")}
                help={t("editScopeFromDateHelp")}
              />
            ) : null}
            <ScopeOption
              checked={scope === "whole"}
              onSelect={() => {
                setScope("whole");
                setStartsOn(editing.plan.startsOn);
              }}
              testId="nutrition-edit-scope-whole"
              label={t("editScopeWhole")}
              help={t("editScopeWholeHelp")}
            />
            {!canSplit ? (
              <p className="text-muted-foreground text-xs">
                {editing.state === "scheduled"
                  ? t("editScopeOnlyWholeScheduled")
                  : t("editScopeOnlyWholePast")}
              </p>
            ) : null}
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
              <Label htmlFor="nutrition-starts-on">
                {editing && scope === "fromDate" ? t("editCutoff") : t("startsOn")}
              </Label>
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
                className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning"
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
              unit={t("gramsSuffix")}
              value={proteinG}
              onChange={setProteinG}
              id="target-protein"
            />
            <MacroInput
              label={t("carbs")}
              unit={t("gramsSuffix")}
              value={carbsG}
              onChange={setCarbsG}
              id="target-carbs"
            />
            <MacroInput
              label={t("fat")}
              unit={t("gramsSuffix")}
              value={fatG}
              onChange={setFatG}
              id="target-fat"
            />
          </div>
          <MacroKcalHint
            kcal={kcal}
            proteinG={proteinG}
            carbsG={carbsG}
            fatG={fatG}
            testId="nutrition-daily-kcal-hint"
          />
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
            <MealDraftEditor
              key={meal.key}
              meal={meal}
              mealIndex={mealIndex}
              deviated={deviatedMealIndexes.has(mealIndex)}
              canRemove={meals.length > 1}
              showTranslation={showTranslation}
              onPatch={(patch) => patchMeal(meal.key, patch)}
              onRemove={() =>
                setMeals((current) => current.filter((item) => item.key !== meal.key))
              }
            />
          ))}
          <MealRollupPanel
            meals={meals}
            targets={{ kcal, proteinG, carbsG, fatG }}
          />
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
          onClick={() => {
            closeDraft();
            router.push(`/gc-fitness/clients/${clientId}/nutricion`);
          }}
        >
          {t("cancel")}
        </Button>
        <Button type="button" onClick={onSubmit} disabled={pending} data-testid="nutrition-save">
          {pending ? t("saving") : editing ? t("editSave") : t("save")}
        </Button>
      </div>
    </div>
  );
}
