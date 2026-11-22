"use client";

// template-form.tsx
//
// RHF + Zod + useFieldArray form for the two template routes:
//   - `mode="create"`: empty form → `createWorkoutTemplate` → redirect to list
//   - `mode="edit"`:   defaults from Firestore → `updateWorkoutTemplate` patch
//
// Pitfall 3 (locked here): `useFieldArray` overwrites the field's `id` with
// an RHF-internal CUID for stable React key tracking across reorders. Our
// DOMAIN field is `exerciseId` — they DO NOT collide. The React key is
// `field.id` (RHF-internal), NEVER `index` (breaks across reorders) and
// NEVER `field.exerciseId` (collides when two rows reference the same
// underlying exercise — e.g., a superset of dips paired with dips).
//
// Reorder semantics (Pattern 5): use `move(index, index ± 1)` for up/down.
// `swap(i, j)` is symmetric and awkward at list ends — `move` expresses
// "move up by 1" directly. Disable each button at its edge index.
//
// Tag default: "custom" — keeps the form forgiving per CONTEXT.md §Specifics.
//
// #507 — split by responsibility (the component was 3,000 lines):
//   template-form/use-template-form-controller.ts  state, drafts, handlers, submit
//   template-form/template-form-model.ts           pure defaults / normalization
//   template-form/exercise-card.tsx                one exercise of the details step
//   template-form/{info-tooltip,sortable-exercise-row,superset-accents,types}
// This file keeps the markup of the form shell.
//
// SUBMIT: this form does NOT directly call the Server Action; the parent
// route page passes an `onSubmit` callback that wires in
// `createWorkoutTemplate` or `(input) => updateWorkoutTemplate(id, input)`.
// This keeps the form pure and lets the route handle the post-success
// redirect / refresh.

import { ArrowUp, ArrowDown, Trash2, Plus, X, ExternalLink } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { LocalizedTextField } from "@/components/gc-fitness/localized-field";
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
import { ExercisePickerPopover } from "./exercise-picker-popover";
import { WorkoutMuscleHeatmapSection } from "./workout-muscle-heatmap-section";
import { ExerciseMultiAddDialog } from "./exercise-multi-add-dialog";
import { TemplateTagsPicker } from "./template-tags-picker";

import type { TemplateFormProps } from "./template-form/types";
import { SortableExerciseRow } from "./template-form/sortable-exercise-row";
import { useTemplateFormController } from "./template-form/use-template-form-controller";
import { TemplateExerciseCard } from "./template-form/exercise-card";

export type { TemplateFormMode, TemplateFormProps } from "./template-form/types";
export { weightArrayAfterClear } from "./template-form/template-form-model";

export function TemplateForm(props: TemplateFormProps) {
  const ctrl = useTemplateFormController(props);
  const {
    mode,
    renderExerciseExtras,
    pending,
    draftRestored,
    step,
    setStep,
    showSpanishFields,
    setShowSpanishFields,
    quickCreated,
    setQuickCreated,
    showCancelConfirm,
    setShowCancelConfirm,
    pendingRemoveIndex,
    setPendingRemoveIndex,
    fields,
    remove,
    move,
    t,
    tHeatmap,
    esPrimary,
    primaryLang,
    otherLang,
    form,
    exerciseNoWeightById,
    watchedExercises,
    estimatedDurationMinutes,
    heatmapExercises,
    heatmapExercisesById,
    exerciseNameAt,
    moveUpLabel,
    moveDownLabel,
    removeLabel,
    requestRemove,
    sensors,
    handleDragEnd,
    submit,
    hasUnselectedExercises,
    canContinueToDetails,
    existingTagSuggestions,
    submitErrorMessages,
    discardDraft,
    performCancel,
    exitKeepingDraft,
    handleCancelClick,
    appendExercise,
    appendExercises,
  } = ctrl;
  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          console.log("[template-form] form onSubmit event fired");
          return submit(e);
        }}
        className="flex min-w-0 flex-col gap-6"
        noValidate
      >
        {draftRestored ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            {/* #1089 — this banner was hardcoded English in a bilingual
                backoffice; the trainer who lost work is the same one reading
                it in Spanish. */}
            <span>{t("draftRestoredBanner")}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={discardDraft}
            >
              {t("draftRestoredDiscard")}
            </Button>
          </div>
        ) : null}
        {/* Single top-right translation toggle for the whole form. While
            hidden, localized fields show just the coach-language input (no
            "(language)" suffix); revealing it adds the qualifiers + secondary
            inputs. */}
        {!showSpanishFields ? (
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setShowSpanishFields(true)}
            >
              {t("addTranslation")}
            </Button>
          </div>
        ) : null}

        {/* Name — coach language first; optional translation. */}
        <LocalizedTextField
          form={form}
          base="name"
          primaryLang={primaryLang}
          otherLang={otherLang}
          showTranslation={showSpanishFields}
          plainLabel={t("nameLabel")}
          primaryLabel={esPrimary ? t("nameEs") : t("nameEn")}
          otherLabel={esPrimary ? t("nameEn") : t("nameEs")}
          placeholder={esPrimary ? t("namePlaceholderEs") : t("namePlaceholderEn")}
          requiredMessage={t("nameRequired")}
        />

        {/* Description — coach language first; optional translation. */}
        <LocalizedTextField
          form={form}
          base="description"
          primaryLang={primaryLang}
          otherLang={otherLang}
          showTranslation={showSpanishFields}
          plainLabel={t("descriptionLabel")}
          primaryLabel={esPrimary ? t("descriptionEs") : t("descriptionEn")}
          otherLabel={esPrimary ? t("descriptionEn") : t("descriptionEs")}
          placeholder={
            esPrimary
              ? t("descriptionPlaceholderEs")
              : t("descriptionPlaceholderEn")
          }
          multiline
          rows={3}
        />

        {/* Tags (multi). Existing templates power the suggestion strip
            below the input so the trainer's vocabulary stays consistent
            across the library. */}
        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem className="max-w-2xl">
              <FormLabel>{t("tagsLabel")}</FormLabel>
              <FormControl>
                <TemplateTagsPicker
                  value={(field.value as string[] | undefined) ?? []}
                  onChange={field.onChange}
                  existingTags={existingTagSuggestions}
                  placeholder={t("tagsPlaceholder")}
                  removeAriaLabel={(tag) => t("tagsRemoveAria", { tag })}
                  suggestionsLabel={t("tagsSuggestionsLabel")}
                />
              </FormControl>
              <FormDescription>{t("tagsHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-xl border bg-card/90 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("builderEyebrow")}
              </p>
              <h2 className="font-heading text-base font-semibold">
                {step === 1 ? t("builderStepExercises") : t("builderStepDetails")}
              </h2>
              {step === 1 && fields.length > 0 && hasUnselectedExercises ? (
                <p className="mt-1 text-xs text-warning">{t("builderSelectAllHint")}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant={step === 1 ? "default" : "outline"} size="sm" onClick={() => setStep(1)}>
                {t("builderStepExercisesShort")}
              </Button>
              <Button type="button" variant={step === 2 ? "default" : "outline"} size="sm" onClick={() => setStep(2)} disabled={!canContinueToDetails}>
                {t("builderStepDetailsShort")}
              </Button>
            </div>
          </div>
        </div>

        {/* Exercises — wrapped in a section card to match the HabitForm
            schedule/reminder visual hierarchy. */}
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              {t("exercises")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("exercisesCount", { count: fields.length })}
              {estimatedDurationMinutes > 0
                ? ` · ${t("estimatedDuration", { minutes: estimatedDurationMinutes })}`
                : ""}
            </span>
          </div>

          {fields.length === 0 && (
            <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              {t.rich("exercisesEmpty", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          )}

          {step === 1 ? (
            <ul className="flex flex-col gap-2">
              {fields.map((field, index) => (
                <li key={field.id} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">{t("exerciseNumber", { index: index + 1 })}</p>
                      <div className="mt-1">
                        <ExercisePickerPopover
                          value={form.getValues(`exercises.${index}.exerciseId` as const) ?? ""}
                          onChange={(value) => {
                            form.setValue(`exercises.${index}.exerciseId` as const, value, { shouldDirty: true });
                            // 26-09 — picking a bodyweight exercise seeds the
                            // "Sin peso" sentinel so the weight column starts
                            // hidden (matching the exercise's authoring default).
                            if (exerciseNoWeightById.has(value)) {
                              form.setValue(
                                `exercises.${index}.weightBySetKg` as const,
                                [],
                                { shouldDirty: true },
                              );
                            }
                          }}
                          ariaLabel={t("pickExerciseAria", { index: index + 1 })}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                      <Button type="button" variant="ghost" size="icon" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={moveUpLabel(index)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => move(index, index + 1)} disabled={index === fields.length - 1} aria-label={moveDownLabel(index)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => requestRemove(index)} aria-label={removeLabel(index)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {/* Generator-only replacement pills (no-op in the normal flow). */}
                  {renderExerciseExtras
                    ? renderExerciseExtras({
                        index,
                        exerciseId: watchedExercises[index]?.exerciseId ?? "",
                        allExerciseIds: watchedExercises
                          .map((e) => e?.exerciseId ?? "")
                          .filter((id): id is string => Boolean(id)),
                        onReplace: (value) =>
                          form.setValue(`exercises.${index}.exerciseId` as const, value, {
                            shouldDirty: true,
                          }),
                      })
                    : null}
                </li>
              ))}
            </ul>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-3">
                  {fields.map((field, index) => {
                  return (
                  // Pitfall 3: React key is `field.id` (RHF-internal CUID), NOT
                  // `index` (would break across reorders) and NOT
                  // `field.exerciseId` (collisions on supersets referencing the
                  // same exercise).
                  <SortableExerciseRow key={field.id} id={field.id}>
                    {(dragListeners) => (
                      <TemplateExerciseCard
                        ctrl={ctrl}
                        field={field}
                        index={index}
                        dragListeners={dragListeners}
                      />
                    )}
                  </SortableExerciseRow>
                  );
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={appendExercise}
              disabled={fields.length >= 30}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {t("addExercise")}
            </Button>
            <ExerciseMultiAddDialog
              onConfirm={appendExercises}
              onQuickCreated={(exercise) =>
                setQuickCreated((prev) => [{ id: exercise.id, name: exercise.name }, ...prev])
              }
              disabled={fields.length >= 30}
              triggerClassName="shadow-sm"
            />
            {step === 1 ? (
              <Button type="button" onClick={() => setStep(2)} disabled={!canContinueToDetails} className="ml-auto">
                {t("continueToDetails")}
              </Button>
            ) : null}
          </div>
          {quickCreated.length > 0 ? (
            <div className="mt-2 flex flex-col gap-2">
              {quickCreated.map((exercise) => (
                <div key={exercise.id} className="flex items-center justify-between rounded-md border border-success/50 bg-success-soft px-3 py-2 text-sm">
                  <span className="truncate">
                    {t.rich("quickCreatedNotice", {
                      name: exercise.name,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </span>
                  <div className="ml-2 flex items-center gap-2">
                    <a
                      href={`/gc-fitness/exercises/${exercise.id}/edit`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-success underline"
                    >
                      {t("quickCreatedEdit")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("quickCreatedDismissAria", { name: exercise.name })}
                      onClick={() =>
                        setQuickCreated((prev) => prev.filter((row) => row.id !== exercise.id))
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* #1072 (S9) — el heatmap del entreno que se está armando. Contesta
            "¿esta rutina está desbalanceada?" MIENTRAS todavía se puede
            cambiar, que es lo único que la hace valer acá: en la ficha
            informa, en el editor decide.

            Lee de `useWatch` (el estado VIVO del formulario), nunca de
            Firestore: se tiene que mover al agregar o sacar un ejercicio,
            antes de guardar. Y va en su propio bloque, fuera de toda fila de
            ejercicio y de todo picker. */}
        <WorkoutMuscleHeatmapSection
          exercises={heatmapExercises}
          exercisesById={heatmapExercisesById}
          emptyMessage={
            heatmapExercises.length === 0
              ? tHeatmap("emptyRoutine")
              : tHeatmap("emptyWorkoutExercises")
          }
        />

        {/* Form-level error from RHF root */}
        {form.formState.errors.exercises &&
          !Array.isArray(form.formState.errors.exercises) && (
            <p className="text-sm text-destructive">
              {form.formState.errors.exercises.message}
            </p>
          )}

        {/* Submit-attempt error summary — shows what needs to be fixed, near
            the submit button so the trainer doesn't have to scroll up hunting
            for FormMessage hints. Renders only after a submit attempt failed
            validation. */}
        {form.formState.isSubmitted && submitErrorMessages.length > 0 ? (
          <div
            className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <p className="font-medium">{t("submitErrorsHeadline")}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {submitErrorMessages.map((msg, idx) => (
                <li key={`${msg}-${idx}`}>{msg}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Action row */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          {pending ? (
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {t("saving")}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancelClick}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={pending} className="rounded-full">
            {pending ? t("saving") : mode === "create" ? t("createCta") : t("saveCta")}
          </Button>
        </div>
      </form>

      {/* Unsaved-changes guard — explicit Cancel discards the autosaved draft,
          so confirm before throwing away in-progress edits. */}
      <AlertDialog
        open={pendingRemoveIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeExerciseConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoveIndex !== null && exerciseNameAt(pendingRemoveIndex)
                ? t("removeExerciseConfirmBody", {
                    name: exerciseNameAt(pendingRemoveIndex) ?? "",
                  })
                : t("removeExerciseConfirmBodyUnnamed")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("removeExerciseConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (pendingRemoveIndex !== null) remove(pendingRemoveIndex);
                setPendingRemoveIndex(null);
              }}
            >
              {t("removeExerciseConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("discardDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("discardDialogBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-wrap">
            <AlertDialogCancel>{t("discardDialogKeepEditing")}</AlertDialogCancel>
            {/* #1089 — the middle, non-destructive exit. Rendered as a plain
                AlertDialogAction (not Cancel) so it reads as a real choice,
                and BEFORE the red one so the destructive button is not the
                one under the thumb on a phone, where the footer stacks
                bottom-up (`flex-col-reverse`). */}
            <AlertDialogAction
              onClick={exitKeepingDraft}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              data-testid="template-cancel-keep-draft"
            >
              {t("discardDialogKeepDraft")}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={performCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="template-cancel-discard"
            >
              {t("discardDialogConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}
