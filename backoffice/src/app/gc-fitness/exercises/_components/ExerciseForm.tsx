"use client";

// ExerciseForm.tsx
//
// Shared RHF + Zod form for the three exercise routes:
//   - `mode="create"`: empty form → `createExercise` → redirect to /[id]/edit
//   - `mode="edit"`:   defaults from Firestore → `updateExercise` patch
//   - `mode="view"`:   all inputs disabled + read-only wger banner + Duplicate
//
// Field layout follows 03-UI-SPEC Surface B §"Form field" copywriting block
// VERBATIM (drift fails the form-validation test suite at T2/T8).
//
// The dropzone is reachable in EDIT mode (where the doc id exists). In
// CREATE mode we defer it: the trainer saves the text fields first, then
// the route redirects to `/[id]/edit` where the dropzone is unlocked. This
// avoids the chicken/egg problem with 03-05's signed-URL path-traversal
// guard (it requires an `exerciseId` starting with `custom-${trainer.uid}-`
// which is generated server-side).

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  LocalizedTextField,
  mirrorLocalizedBlank,
  hasDistinctTranslation,
} from "@/components/gc-fitness/localized-field";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  exerciseSchema,
  type ExerciseInput,
} from "@/lib/gc-fitness/exercise-schema";
import {
  MUSCLE_GROUPS,
  EQUIPMENT,
} from "@/lib/gc-fitness/exercise-vocabulary";
import {
  createExercise,
  updateExercise,
  softDeleteExercise,
  duplicateExercise,
} from "@/lib/gc-fitness/exercise-server-actions";
import { useQueryClient } from "@tanstack/react-query";
// Import the key from its firebase-FREE module (not exercises-listener) so
// this form doesn't pull the firebase client SDK into its bundle/test graph.
import { EXERCISES_QUERY_KEY } from "@/lib/gc-fitness/exercises-query-key";

import { MultiSelectCombobox } from "./MultiSelectCombobox";
import { ThumbnailUploadDropzone } from "./ThumbnailUploadDropzone";

export type ExerciseFormMode = "create" | "edit" | "view";

export interface ExerciseFormProps {
  mode: ExerciseFormMode;
  exerciseId?: string;
  defaultValues?: Partial<ExerciseInput>;
  trainerUid?: string;
  /**
   * Modal hook (B4). When the form is rendered inside the "+ Nuevo" Dialog
   * over the library, the parent passes `onCreated` so a successful CREATE
   * does NOT route away (which would unmount the modal mid-flow). Instead the
   * form invalidates + fires this callback with the new id and the parent
   * closes the dialog. When absent (the `/exercises/new` route), the form
   * keeps its original `router.push("/gc-fitness/exercises")` behavior.
   *
   * The demonstration-media step is preserved WITHOUT a route round-trip:
   * the thumbnail/GIF dropzone is already unlocked in create mode via the
   * deterministic `draftExerciseId`, so trainers add media before the first
   * save, inside the modal — no data is lost.
   */
  onCreated?: (id: string) => void;
  /** Modal hook (B4): cancel closes the dialog instead of `router.back()`. */
  onCancel?: () => void;
}

// Build a fully-typed default-values object covering every Zod field. The
// schema's defaults (e.g. `version: 1`) flow through this seed so the form
// state is never partial — react-hook-form's controlled inputs need a real
// string/array value on every render.
function buildDefaults(
  mode: ExerciseFormMode,
  passed?: Partial<ExerciseInput>,
): ExerciseInput {
  return {
    // Mirror a single-language record into both languages on LOAD so the coach
    // always sees existing content in their own language (an English-only
    // exercise must not render an empty Spanish field). Save-time
    // mirrorLocalizedBlank does the same on write. Both-blank stays both-blank.
    name: mirrorLocalizedBlank({
      en: passed?.name?.en ?? "",
      es: passed?.name?.es ?? "",
    }),
    description: mirrorLocalizedBlank({
      en: passed?.description?.en ?? "",
      es: passed?.description?.es ?? "",
    }),
    muscleGroups: passed?.muscleGroups ?? [],
    equipment: passed?.equipment ?? [],
    mediaURL: passed?.mediaURL ?? null,
    thumbnailURL: passed?.thumbnailURL ?? null,
    youtubeURL: passed?.youtubeURL ?? null,
    // 14-02 — optional demo video + bilingual tips. Defaulting `tips` to
    // a populated `{ en: '', es: '' }` (rather than null) keeps RHF's
    // controlled inputs happy from the first render onward.
    tips: mirrorLocalizedBlank(passed?.tips ?? { en: "", es: "" }),
    // In create mode the server force-sets source/ownerId regardless of what
    // we send, but Zod requires the fields to be present in the shape — seed
    // a sentinel that satisfies the enum.
    source: passed?.source ?? (mode === "view" ? "wger" : "trainer"),
    ownerId: passed?.ownerId ?? null,
    version: passed?.version ?? 1,
    // 26-01 — Per-exercise prescription kind. Defaults to "reps" so every
    // existing exercise (and every new exercise created before the 26-02
    // metric-chooser UI lands) round-trips through the form unchanged.
    // The metric chooser radio chips ship in Plan 26-02.
    metric: passed?.metric ?? "reps",
    // 26-09 — bodyweight default. `true` (tracks external weight) keeps the
    // legacy "reps × weight" behavior; `false` authors the exercise as
    // "reps without weight" (seeds the template "Sin peso" sentinel on add).
    tracksWeight: passed?.tracksWeight ?? true,
  };
}

export function ExerciseForm({
  mode,
  exerciseId,
  defaultValues,
  trainerUid,
  onCreated,
  onCancel,
}: ExerciseFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("exercises.form");
  // 26-09 — translated labels for the muscle-group / equipment option lists
  // (the canonical vocabulary values are lowercase English identifiers).
  const tVocab = useTranslations("exercises.vocabulary");
  const formatMuscleLabel = (key: string) => tVocab(`muscle.${key}`);
  const formatEquipmentLabel = (key: string) => tVocab(`equipment.${key}`);
  const [pending, startTransition] = useTransition();

  // 260529 — useExercisesQuery is now a one-shot read (no live listener), so
  // every exercise mutation must invalidate the feed for own-edits to show.
  // Invalidating the BASE key matches every per-trainer scoped sub-key.
  const invalidateExercises = () =>
    queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isView = mode === "view";
  const reactId = useId();
  const draftSuffix = useMemo(
    () => reactId.replace(/[^a-zA-Z0-9_-]/g, "") || "draft",
    [reactId],
  );
  const draftExerciseId = useMemo(
    () =>
      mode === "create" && trainerUid
        ? `custom-${trainerUid}-${draftSuffix}`
        : undefined,
    [draftSuffix, mode, trainerUid],
  );

  // `zodResolver` returns a generic resolver that RHF infers from the
  // Zod schema's output type. We cast through `unknown` so the form's
  // explicit `ExerciseInput` type parameter doesn't fight RHF's resolver
  // generic — see https://github.com/react-hook-form/resolvers/issues/271.
  const formDefaults = useMemo(
    () => buildDefaults(mode, defaultValues),
    [mode, defaultValues],
  );
  const form = useForm<ExerciseInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(exerciseSchema as any) as unknown as any,
    defaultValues: formDefaults,
    mode: "onSubmit",
  });
  const locale = useLocale();
  const esPrimary = locale.startsWith("es");
  const primaryLang = esPrimary ? "es" : "en";
  const otherLang = esPrimary ? "en" : "es";
  // Open the translation fields by default only when the record already has a
  // real translation (edit of an already-bilingual exercise).
  const [showTranslations, setShowTranslations] = useState(
    hasDistinctTranslation(formDefaults.name) ||
      hasDistinctTranslation(formDefaults.description) ||
      hasDistinctTranslation(formDefaults.tips),
  );

  const onSubmit = form.handleSubmit((raw) => {
    if (isView) return;
    // "No translation" ⇒ store the coach's text in every language.
    const values = {
      ...raw,
      name: mirrorLocalizedBlank(raw.name),
      description: mirrorLocalizedBlank(raw.description),
      tips: mirrorLocalizedBlank(raw.tips),
    };
    startTransition(async () => {
      try {
        if (mode === "create") {
          const { id } = await createExercise(
            draftExerciseId ? { ...values, id: draftExerciseId } : values,
          );
          await invalidateExercises();
          toast.success(t("savedToast"));
          // B4 — modal mode: hand control back to the Dialog parent (which
          // closes the popup) instead of routing. Routing here would unmount
          // the modal and bounce the trainer off the library tab. The media
          // step is unaffected: the dropzone was already unlocked pre-save
          // via draftExerciseId, so any demo thumbnail is part of this save.
          if (onCreated) {
            onCreated(id);
            return;
          }
          // Route mode (`/exercises/new`): push to the library so the trainer
          // lands on the list they were curating — router.back() used to
          // bounce them to whatever screen referred them in (sometimes the
          // workout-template editor), which made it feel like the save
          // didn't take.
          router.push("/gc-fitness/exercises");
          return;
        }
        if (mode === "edit" && exerciseId) {
          await updateExercise(exerciseId, values);
          await invalidateExercises();
          toast.success(t("savedToast"));
          router.push("/gc-fitness/exercises");
        }
      } catch (err) {
        console.error("[exercise-form] save failed", err);
        toast.error(t("saveFailedToast"));
      }
    });
  });

  const onDuplicate = async () => {
    if (!exerciseId) return;
    setDuplicating(true);
    try {
      const { id } = await duplicateExercise(exerciseId);
      await invalidateExercises();
      toast.success(t("duplicateToast"));
      router.push(`/gc-fitness/exercises/${id}/edit`);
    } catch (err) {
      console.error("[exercise-form] duplicate failed", err);
      toast.error(t("duplicateFailedToast"));
    } finally {
      setDuplicating(false);
    }
  };

  const onDelete = async () => {
    if (!exerciseId) return;
    setDeleting(true);
    try {
      await softDeleteExercise(exerciseId);
      await invalidateExercises();
      toast.success(t("deletedToast"));
      router.push("/gc-fitness/exercises");
    } catch (err) {
      console.error("[exercise-form] delete failed", err);
      toast.error(t("deleteFailedToast"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Form {...form}>
      {isView && (
        <Alert className="mb-6">
          <AlertTitle>{t("viewBannerTitle")}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("viewBannerBody")}</span>
            <Button
              type="button"
              onClick={onDuplicate}
              disabled={duplicating || !exerciseId}
            >
              {duplicating ? t("duplicating") : t("duplicateCta")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        {/* 26-09 — single top-right translation toggle for the whole form.
            While hidden, every localized field shows just its coach-language
            input (the language is implied by the UI locale); revealing it
            adds the "(English)/(Spanish)" qualifiers + the secondary inputs. */}
        {!isView ? (
          <div className="flex items-center justify-end">
            {!showTranslations ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setShowTranslations(true)}
              >
                {t("addTranslation")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Name — coach language first; optional translation. */}
        <LocalizedTextField
          form={form}
          base="name"
          primaryLang={primaryLang}
          otherLang={otherLang}
          showTranslation={showTranslations}
          plainLabel={t("nameLabel")}
          primaryLabel={esPrimary ? t("nameEs") : t("nameEn")}
          otherLabel={esPrimary ? t("nameEn") : t("nameEs")}
          placeholder={esPrimary ? t("namePlaceholderEs") : t("namePlaceholderEn")}
          requiredMessage={t("nameRequired")}
          disabled={isView}
        />

        {/* Description — coach language first; optional translation. */}
        <LocalizedTextField
          form={form}
          base="description"
          primaryLang={primaryLang}
          otherLang={otherLang}
          showTranslation={showTranslations}
          plainLabel={t("descriptionLabel")}
          primaryLabel={esPrimary ? t("descriptionEs") : t("descriptionEn")}
          otherLabel={esPrimary ? t("descriptionEn") : t("descriptionEs")}
          hint={t("descriptionMarkdownHint")}
          multiline
          rows={6}
          disabled={isView}
        />

        {/* 14-02 — Coaching tips. Coach language first; optional translation. */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t("tipsHeading")}</h3>
          <LocalizedTextField
            form={form}
            base="tips"
            primaryLang={primaryLang}
            otherLang={otherLang}
            showTranslation={showTranslations}
            plainLabel={t("tipsLabel")}
            primaryLabel={esPrimary ? t("tipsEs") : t("tipsEn")}
            otherLabel={esPrimary ? t("tipsEn") : t("tipsEs")}
            hint={t("tipsHint")}
            multiline
            rows={4}
            disabled={isView}
          />
        </div>

        {/* 26-02 / 26-09 — Prescription-type chooser. Three chips spanning two
            orthogonal fields:
              - "Reps × Weight"  → metric:"reps", tracksWeight:true
              - "Reps (no weight)" → metric:"reps", tracksWeight:false  (#14)
              - "Time (sec)"     → metric:"time", tracksWeight:true
            `tracksWeight:false` is the bodyweight authoring default that seeds
            the template "Sin peso" sentinel (weightBySetKg:[]) on add — the
            wire contract iOS/Android already honor. Renders in create + edit;
            disabled in view. Defaults to reps×weight via buildDefaults. */}
        <FormField
          control={form.control}
          name="metric"
          render={({ field }) => {
            const tracksWeight = form.watch("tracksWeight") !== false;
            const isRepsWeighted = field.value === "reps" && tracksWeight;
            const isRepsNoWeight = field.value === "reps" && !tracksWeight;
            const isTime = field.value === "time";
            const chipClass = (active: boolean) =>
              `inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-background text-foreground hover:border-foreground/30"
              }`;
            return (
              <FormItem>
                <FormLabel>{t("metricLabel")}</FormLabel>
                <FormControl>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isView}
                      onClick={() => {
                        field.onChange("reps");
                        form.setValue("tracksWeight", true, {
                          shouldDirty: true,
                        });
                      }}
                      className={chipClass(isRepsWeighted)}
                      aria-pressed={isRepsWeighted}
                    >
                      {t("metricRepsCta")}
                    </button>
                    <button
                      type="button"
                      disabled={isView}
                      onClick={() => {
                        field.onChange("reps");
                        form.setValue("tracksWeight", false, {
                          shouldDirty: true,
                        });
                      }}
                      className={chipClass(isRepsNoWeight)}
                      aria-pressed={isRepsNoWeight}
                    >
                      {t("metricRepsNoWeightCta")}
                    </button>
                    <button
                      type="button"
                      disabled={isView}
                      onClick={() => {
                        field.onChange("time");
                        form.setValue("tracksWeight", true, {
                          shouldDirty: true,
                        });
                      }}
                      className={chipClass(isTime)}
                      aria-pressed={isTime}
                    >
                      {t("metricTimeCta")}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Muscle Groups + Equipment */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="muscleGroups"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("muscleGroupsLabel")}</FormLabel>
                <FormControl>
                  <MultiSelectCombobox
                    options={MUSCLE_GROUPS}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    formatLabel={formatMuscleLabel}
                    placeholder={t("muscleGroupsPlaceholder")}
                    ariaLabel={t("muscleGroupsAria")}
                    max={8}
                    disabled={isView}
                  />
                </FormControl>
                <FormDescription>{t("muscleGroupsHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="equipment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("equipmentLabel")}</FormLabel>
                <FormControl>
                  <MultiSelectCombobox
                    options={EQUIPMENT}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    formatLabel={formatEquipmentLabel}
                    placeholder={t("equipmentPlaceholder")}
                    ariaLabel={t("equipmentAria")}
                    max={8}
                    disabled={isView}
                  />
                </FormControl>
                <FormDescription>{t("equipmentHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="thumbnailURL"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("thumbnailLabel")}</FormLabel>
                <FormControl>
                  <div className="flex flex-col gap-2">
                    <Input
                      placeholder={t("thumbnailPlaceholder")}
                      disabled={isView}
                      {...field}
                      value={field.value ?? ""}
                    />
                    <ThumbnailUploadDropzone
                      exerciseId={exerciseId ?? draftExerciseId}
                      value={field.value ?? null}
                      onUploaded={(gs) => field.onChange(gs)}
                      onRemoved={() => field.onChange(null)}
                      disabled={isView || (mode === "create" && !exerciseId && !draftExerciseId)}
                      disabledHint={
                        mode === "create" && !exerciseId && !draftExerciseId
                          ? t("thumbnailCreateDeferHint")
                          : undefined
                      }
                    />
                  </div>
                </FormControl>
                <FormDescription>{t("thumbnailHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="youtubeURL"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("youtubeLabel")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("youtubePlaceholder")}
                    disabled={isView}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>{t("youtubeHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Action row */}
        {!isView && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div>
              {mode === "edit" && exerciseId && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleting}
                    >
                      {deleting ? t("deleting") : t("deleteCta")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("deleteDialogBody")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleting}>
                        {t("deleteDialogCancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("deleteDialogConfirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => (onCancel ? onCancel() : router.back())}
                disabled={pending}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending} className="rounded-full">
                {pending ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Form>
  );
}
