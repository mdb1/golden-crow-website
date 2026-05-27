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

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

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

import { MultiSelectCombobox } from "./MultiSelectCombobox";
import { MediaUploadDropzone } from "./MediaUploadDropzone";
import { ThumbnailUploadDropzone } from "./ThumbnailUploadDropzone";

export type ExerciseFormMode = "create" | "edit" | "view";

export interface ExerciseFormProps {
  mode: ExerciseFormMode;
  exerciseId?: string;
  defaultValues?: Partial<ExerciseInput>;
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
    name: {
      en: passed?.name?.en ?? "",
      es: passed?.name?.es ?? "",
    },
    description: {
      en: passed?.description?.en ?? "",
      es: passed?.description?.es ?? "",
    },
    muscleGroups: passed?.muscleGroups ?? [],
    equipment: passed?.equipment ?? [],
    mediaURL: passed?.mediaURL ?? null,
    thumbnailURL: passed?.thumbnailURL ?? null,
    youtubeURL: passed?.youtubeURL ?? null,
    // 14-02 — optional demo video + bilingual tips. Defaulting `tips` to
    // a populated `{ en: '', es: '' }` (rather than null) keeps RHF's
    // controlled inputs happy from the first render onward.
    videoUrl: passed?.videoUrl ?? null,
    tips: passed?.tips ?? { en: "", es: "" },
    // In create mode the server force-sets source/ownerId regardless of what
    // we send, but Zod requires the fields to be present in the shape — seed
    // a sentinel that satisfies the enum.
    source: passed?.source ?? (mode === "view" ? "wger" : "trainer"),
    ownerId: passed?.ownerId ?? null,
    version: passed?.version ?? 1,
  };
}

export function ExerciseForm({
  mode,
  exerciseId,
  defaultValues,
}: ExerciseFormProps) {
  const router = useRouter();
  const t = useTranslations("exercises.form");
  const [pending, startTransition] = useTransition();
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isView = mode === "view";

  // `zodResolver` returns a generic resolver that RHF infers from the
  // Zod schema's output type. We cast through `unknown` so the form's
  // explicit `ExerciseInput` type parameter doesn't fight RHF's resolver
  // generic — see https://github.com/react-hook-form/resolvers/issues/271.
  const form = useForm<ExerciseInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(exerciseSchema as any) as unknown as any,
    defaultValues: buildDefaults(mode, defaultValues),
    mode: "onSubmit",
  });

  const onSubmit = form.handleSubmit((values) => {
    if (isView) return;
    startTransition(async () => {
      try {
        if (mode === "create") {
          await createExercise(values);
          toast.success(t("savedToast"));
          // Push to the library so the trainer lands on the list they
          // were curating — router.back() used to bounce them to whatever
          // screen referred them in (sometimes the workout-template
          // editor), which made it feel like the save didn't take.
          router.push("/gc-fitness/exercises");
          return;
        }
        if (mode === "edit" && exerciseId) {
          await updateExercise(exerciseId, values);
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
        {/* Name EN + ES */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name.en"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nameEn")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("namePlaceholderEn")}
                    disabled={isView}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name.es"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nameEs")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("namePlaceholderEs")}
                    disabled={isView}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>{t("nameEsHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Description EN + ES */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="description.en"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("descriptionEn")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    disabled={isView}
                    {...field}
                  />
                </FormControl>
                <FormDescription>{t("descriptionMarkdownHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description.es"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("descriptionEs")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    disabled={isView}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>{t("descriptionMarkdownHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* 14-02 — Coaching tips EN + ES. Bilingual free-text cues
            separate from the numbered instructions list. Both fields
            optional; both textareas render with value coerced to ""
            because the schema accepts nullable + optional. */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t("tipsHeading")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="tips.en"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("tipsEn")}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      disabled={isView}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>{t("tipsEnHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tips.es"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("tipsEs")}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      disabled={isView}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>{t("tipsEsHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

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

        {/* Media dropzone */}
        <FormField
          control={form.control}
          name="mediaURL"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="media-dropzone-region">
                {t("mediaLabel")}
              </FormLabel>
              <FormControl>
                <div id="media-dropzone-region">
                  <MediaUploadDropzone
                    exerciseId={exerciseId}
                    value={field.value ?? null}
                    onUploaded={(gsPath) => field.onChange(gsPath)}
                    onRemoved={() => field.onChange(null)}
                    disabled={isView || (mode === "create" && !exerciseId)}
                    disabledHint={
                      mode === "create" && !exerciseId
                        ? t("mediaCreateDeferHint")
                        : undefined
                    }
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                      exerciseId={exerciseId}
                      value={field.value ?? null}
                      onUploaded={(gs) => field.onChange(gs)}
                      onRemoved={() => field.onChange(null)}
                      disabled={isView || (mode === "create" && !exerciseId)}
                      disabledHint={
                        mode === "create" && !exerciseId
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

        {/* 14-02 — Standalone demonstration video URL. Distinct from the
            hero clip uploaded via the dropzone and from the YouTube
            reference link above. Renders on the iOS detail view as a
            dedicated 'Watch demo' card. */}
        <FormField
          control={form.control}
          name="videoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("videoUrlLabel")}</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  placeholder={t("videoUrlPlaceholder")}
                  disabled={isView}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormDescription>{t("videoUrlHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

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
                onClick={() => router.back()}
                disabled={pending}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Form>
  );
}
