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
          const { id } = await createExercise(values);
          toast.success("Exercise saved.");
          router.push(`/gc-fitness/exercises/${id}/edit`);
          return;
        }
        if (mode === "edit" && exerciseId) {
          await updateExercise(exerciseId, values);
          toast.success("Exercise saved.");
          router.refresh();
        }
      } catch (err) {
        console.error("[exercise-form] save failed", err);
        toast.error("Couldn't save. Please try again.");
      }
    });
  });

  const onDuplicate = async () => {
    if (!exerciseId) return;
    setDuplicating(true);
    try {
      const { id } = await duplicateExercise(exerciseId);
      toast.success("Exercise duplicated. Edit your copy now.");
      router.push(`/gc-fitness/exercises/${id}/edit`);
    } catch (err) {
      console.error("[exercise-form] duplicate failed", err);
      toast.error("Couldn't duplicate. Please try again.");
    } finally {
      setDuplicating(false);
    }
  };

  const onDelete = async () => {
    if (!exerciseId) return;
    setDeleting(true);
    try {
      await softDeleteExercise(exerciseId);
      toast.success("Exercise deleted.");
      router.push("/gc-fitness/exercises");
    } catch (err) {
      console.error("[exercise-form] delete failed", err);
      toast.error("Couldn't delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Form {...form}>
      {isView && (
        <Alert className="mb-6">
          <AlertTitle>Exercise details</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>This exercise is sourced from wger.de and is read-only.</span>
            <Button
              type="button"
              onClick={onDuplicate}
              disabled={duplicating || !exerciseId}
            >
              {duplicating ? "Duplicating…" : "Duplicate to customize"}
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
                <FormLabel>Name (English)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Barbell back squat"
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
                <FormLabel>Name (Spanish)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Sentadilla con barra"
                    disabled={isView}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Leave blank to mark as &ldquo;needs translation.&rdquo;
                </FormDescription>
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
                <FormLabel>Description (English)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    disabled={isView}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Markdown supported. Use bullets, bold, and links.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description.es"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Spanish)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    disabled={isView}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Markdown supported. Use bullets, bold, and links.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Muscle Groups + Equipment */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="muscleGroups"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Muscle groups</FormLabel>
                <FormControl>
                  <MultiSelectCombobox
                    options={MUSCLE_GROUPS}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="Pick muscle groups…"
                    ariaLabel="Muscle groups"
                    max={8}
                    disabled={isView}
                  />
                </FormControl>
                <FormDescription>
                  Pick the primary muscle first. Secondary muscles follow.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="equipment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Equipment</FormLabel>
                <FormControl>
                  <MultiSelectCombobox
                    options={EQUIPMENT}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="Pick equipment…"
                    ariaLabel="Equipment"
                    max={8}
                    disabled={isView}
                  />
                </FormControl>
                <FormDescription>
                  Pick one or more. Use &ldquo;bodyweight&rdquo; if no
                  equipment is needed.
                </FormDescription>
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
                Demonstration video
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
                        ? "Save the exercise first to enable video upload."
                        : undefined
                    }
                  />
                </div>
              </FormControl>
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
                      {deleting ? "Deleting…" : "Delete exercise"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this exercise?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the exercise from your
                        library. Workouts that reference it will keep the
                        snapshot. This can&apos;t be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleting}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
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
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Form>
  );
}
