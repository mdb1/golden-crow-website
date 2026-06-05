"use client";

// /gc-fitness/templates/[id]/edit/client.tsx
//
// Edit-mode wrapper around <TemplateForm>. After the form saves, we look up
// the future, still-scheduled assignments for this template and — if any
// exist — offer the trainer a choice: keep them frozen on the old snapshot,
// or push the freshly-saved template to every scheduled session.
//
// Existing snapshots are deliberately preserved by default (Plan 04-05's
// WTPL-07 immutability decision). The propagation path is opt-in.
//
// Weight handling within the propagation: notes + structure (sets/reps/rest)
// ALWAYS flow through, but each client's own per-exercise WEIGHTS are preserved
// unless the trainer opts in via the "Also update clients' weights" toggle
// (default OFF). Off keeps each client's remembered weights and avoids a
// spurious "coach updated" alert; on replaces them with the plan weights once.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { Checkbox } from "@/components/ui/checkbox";
import { TemplateForm } from "@/components/gc-fitness/template-form";
import { updateWorkoutTemplate } from "@/lib/gc-fitness/workout-template-actions";
import {
  listFutureAssignmentsForTemplate,
  propagateTemplateToFutureAssignments,
  type TemplatePropagationPreview,
} from "@/lib/gc-fitness/workout-assignment-actions";
import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";

export interface EditTemplateClientProps {
  id: string;
  defaults: Partial<WorkoutTemplateInput>;
}

export function EditTemplateClient({ id, defaults }: EditTemplateClientProps) {
  const router = useRouter();
  const t = useTranslations("templates.editPage.propagateDialog");
  const [preview, setPreview] = useState<TemplatePropagationPreview | null>(null);
  const [propagating, setPropagating] = useState(false);
  // Default OFF: preserve each client's own weights. Reset whenever a new
  // preview opens so the choice never leaks across template saves.
  const [pushWeights, setPushWeights] = useState(false);

  const handleSubmit = useCallback(
    async (input: WorkoutTemplateInput) => {
      await updateWorkoutTemplate(id, input);
      let nextPreview: TemplatePropagationPreview | null = null;
      try {
        nextPreview = await listFutureAssignmentsForTemplate(id);
      } catch (err) {
        // Don't block the save on a propagation-preview failure — log it and
        // fall back to the prior "snapshot is frozen" behaviour.
        console.error("[template-edit] preview failed", err);
      }
      if (nextPreview && nextPreview.assignmentCount > 0) {
        setPushWeights(false);
        setPreview(nextPreview);
        return { ok: true as const, deferNavigation: true };
      }
      return { ok: true as const };
    },
    [id],
  );

  const handleKeep = useCallback(() => {
    setPreview(null);
    router.back();
  }, [router]);

  const handlePropagate = useCallback(async () => {
    setPropagating(true);
    try {
      const result = await propagateTemplateToFutureAssignments(id, {
        pushWeights,
      });
      toast.success(t("updatedToast", { count: result.updatedCount }));
      setPreview(null);
      router.back();
    } catch (err) {
      console.error("[template-edit] propagate failed", err);
      const message =
        err instanceof Error ? err.message : t("updateFailedToast");
      toast.error(message);
    } finally {
      setPropagating(false);
    }
  }, [id, pushWeights, router, t]);

  return (
    <>
      <TemplateForm
        mode="edit"
        draftKey={`edit:${id}`}
        defaultValues={defaults}
        onSubmit={handleSubmit}
      />
      <AlertDialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && !propagating) {
            // Dismissing via Esc / outside-tap is equivalent to "keep
            // existing schedules" — closing without a choice would leave
            // the trainer stranded on the editor.
            handleKeep();
          }
        }}
      >
        <AlertDialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-left leading-snug">
              {t("title")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild className="text-left">
              <div className="min-w-0 space-y-3 text-left text-sm text-muted-foreground">
                <p>
                  {t.rich("summary", {
                    sessions: preview?.assignmentCount ?? 0,
                    clients: preview?.clients.length ?? 0,
                    strong: (chunks) => (
                      <strong className="text-foreground">{chunks}</strong>
                    ),
                  })}
                </p>
                {preview && preview.clients.length > 0 ? (
                  <ul className="max-h-48 list-disc space-y-1 overflow-y-auto rounded-md border border-border/70 bg-background/40 px-4 py-2 text-xs text-foreground">
                    {preview.clients.map((client) => (
                      <li key={client.uid} className="break-words">
                        {t("clientLine", {
                          name: client.name,
                          sessions: client.sessions,
                          next: client.nextScheduledFor,
                        })}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs">{t("explainer")}</p>
                <label className="flex items-start gap-3 rounded-md border border-border/70 bg-background/40 px-4 py-3 text-foreground">
                  <Checkbox
                    checked={pushWeights}
                    onCheckedChange={(checked) =>
                      setPushWeights(checked === true)
                    }
                    disabled={propagating}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="block break-words text-sm font-medium">
                      {t("pushWeightsLabel")}
                    </span>
                    <span className="block break-words text-xs text-muted-foreground">
                      {t("pushWeightsHelp")}
                    </span>
                  </span>
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
            <AlertDialogCancel
              onClick={handleKeep}
              disabled={propagating}
              className="h-auto min-h-9 whitespace-normal text-center"
            >
              {t("keepCta")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePropagate}
              disabled={propagating}
              className="h-auto min-h-9 whitespace-normal text-center"
            >
              {propagating
                ? t("updating")
                : t("updateCta", { count: preview?.assignmentCount ?? 0 })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
