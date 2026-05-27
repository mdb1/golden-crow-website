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

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [preview, setPreview] = useState<TemplatePropagationPreview | null>(null);
  const [propagating, setPropagating] = useState(false);

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
      const result = await propagateTemplateToFutureAssignments(id);
      toast.success(
        result.updatedCount === 1
          ? "Updated 1 scheduled session."
          : `Updated ${result.updatedCount} scheduled sessions.`,
      );
      setPreview(null);
      router.back();
    } catch (err) {
      console.error("[template-edit] propagate failed", err);
      const message =
        err instanceof Error
          ? err.message
          : "Could not update scheduled sessions.";
      toast.error(message);
    } finally {
      setPropagating(false);
    }
  }, [id, router]);

  return (
    <>
      <TemplateForm mode="edit" defaultValues={defaults} onSubmit={handleSubmit} />
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply changes to existing schedules?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  The template was saved. It’s currently scheduled for{" "}
                  <strong className="text-foreground">
                    {preview?.assignmentCount ?? 0} upcoming session
                    {preview?.assignmentCount === 1 ? "" : "s"}
                  </strong>{" "}
                  across{" "}
                  <strong className="text-foreground">
                    {preview?.clients.length ?? 0} client
                    {preview?.clients.length === 1 ? "" : "s"}
                  </strong>
                  . By default those sessions keep the version your clients
                  were originally given.
                </p>
                {preview && preview.clients.length > 0 ? (
                  <ul className="max-h-48 list-disc space-y-1 overflow-y-auto rounded-md border border-border/70 bg-background/40 px-4 py-2 text-xs text-foreground">
                    {preview.clients.map((client) => (
                      <li key={client.uid}>
                        <span className="font-medium">{client.name}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {client.sessions} session
                          {client.sessions === 1 ? "" : "s"} (next{" "}
                          {client.nextScheduledFor})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs">
                  Updating will replace the workout the client sees on those
                  days with the new version. Completed and in-progress sessions
                  are never modified.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleKeep} disabled={propagating}>
              Keep existing schedules
            </AlertDialogCancel>
            <AlertDialogAction onClick={handlePropagate} disabled={propagating}>
              {propagating
                ? "Updating…"
                : `Update ${preview?.assignmentCount ?? 0} scheduled session${
                    preview?.assignmentCount === 1 ? "" : "s"
                  }`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
