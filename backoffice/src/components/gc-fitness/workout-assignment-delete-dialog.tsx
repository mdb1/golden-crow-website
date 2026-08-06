"use client";

// workout-assignment-delete-dialog.tsx
//
// 260522-ki7 Task D — SHARED delete dialog. Originally used by the Schedule
// grid (week-grid.tsx) and the Daily client view (ClientDailyTimeline.tsx);
// the latter was deleted in #309.
//
// Recurring-aware: when the assignment carries a `seriesId`, the dialog
// shows a radio choice between "Only this occurrence" (single-doc delete)
// and "This and all future occurrences" (cascade — server filters past
// occurrences out via status === 'scheduled'). When seriesId is null/
// undefined the dialog falls back to the simple confirm path used since
// 260521-tjl.
//
// The dialog owns the deletion lifecycle: it calls the deleteAssignment
// Server Action, handles toast notifications on success/error, and only
// invokes onDeleted on success. The parent receives the deletedCount so
// it can choose between an optimistic row drop (deletedCount === 1) or a
// fuller refresh (deletedCount > 1 → cascade).

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { deleteAssignment } from "@/lib/gc-fitness/workout-assignment-actions";

export interface WorkoutAssignmentDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Identification
  assignmentId: string;
  scheduledFor: string; // "YYYY-MM-DD"
  templateName: string;
  // Recurrence info — seriesId null/undefined ⇒ simple confirm path; non-null ⇒ radio path.
  seriesId?: string | null;
  // Callbacks
  onDeleted: (result: { ok: true; deletedCount: number }) => void;
}

type DeleteMode = "this-only" | "cascade";

export function WorkoutAssignmentDeleteDialog({
  open,
  onOpenChange,
  assignmentId,
  scheduledFor,
  templateName,
  seriesId,
  onDeleted,
}: WorkoutAssignmentDeleteDialogProps) {
  const t = useTranslations("dialogs.deleteAssignment");
  const isRecurring = Boolean(seriesId);
  const [selectedMode, setSelectedMode] = useState<DeleteMode>("this-only");
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    try {
      const options =
        isRecurring && selectedMode === "cascade"
          ? { cascadeFromDate: scheduledFor }
          : undefined;
      const result = await deleteAssignment(assignmentId, options);
      // Success — close + announce + invoke parent callback.
      const n = result.deletedCount;
      toast.success(
        n === 1 ? t("successSingle") : t("successPlural", { count: n }),
      );
      onDeleted(result);
      onOpenChange(false);
    } catch (err) {
      // Surface the verbatim message; dialog stays open so the trainer can
      // either cancel or retry once the underlying issue is resolved.
      const message =
        err instanceof Error ? err.message : t("errorFallback");
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  const title = isRecurring
    ? t("titleRecurring", { name: templateName })
    : t("titleSingle");

  const description = isRecurring
    ? t("descriptionRecurring")
    : t("descriptionSingle");

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return; // block close while in flight
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {isRecurring ? (
          <RadioGroup
            value={selectedMode}
            onValueChange={(v) => setSelectedMode(v as DeleteMode)}
            className="space-y-2 px-1"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem
                id="wadd-this-only"
                value="this-only"
                disabled={pending}
              />
              <Label htmlFor="wadd-this-only" className="cursor-pointer">
                {t("thisOnly")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                id="wadd-cascade"
                value="cascade"
                disabled={pending}
              />
              <Label htmlFor="wadd-cascade" className="cursor-pointer">
                {t("cascade")}
              </Label>
            </div>
          </RadioGroup>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Prevent AlertDialog's default auto-close — we close manually
              // only on success so error path can re-show the dialog.
              e.preventDefault();
              void handleDelete();
            }}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? t("removing") : t("deleteCta")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
