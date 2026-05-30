"use client";

// HabitTemplateDetailDialog.tsx
//
// Read-only detail view for a single habit LIBRARY template, opened by tapping
// a row in the Biblioteca view. Shows the template's intrinsic fields (type,
// goal, reminder, scope, bilingual name + description) — NOT recurrence, which
// is a per-assignment property. Trainer-owned (scope === "trainer") templates
// can be soft-deleted from here; global templates cannot.

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import {
  softDeleteHabitTemplate,
  type HabitTemplateRow,
} from "@/lib/gc-fitness/habit-actions";
import {
  GoalPill,
  HabitTypePill,
  PILL_BASE,
  ReminderCell,
  TONE,
} from "./habit-pills";

export function HabitTemplateDetailDialog({
  open,
  onOpenChange,
  template,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: HabitTemplateRow | null;
  /** Fires after a successful soft-delete so the parent can invalidate caches. */
  onDeleted: () => void;
}) {
  const t = useTranslations("habits.list");
  const tc = useTranslations("habits.columns");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!template) return null;

  const isCustom = template.scope === "trainer";
  const esName =
    template.name.es && template.name.es !== template.name.en
      ? template.name.es
      : null;
  const descEn = template.description?.en?.trim();
  const descEs = template.description?.es?.trim();

  async function handleDelete() {
    if (!template) return;
    setPending(true);
    try {
      await softDeleteHabitTemplate(template.id);
      toast.success(t("deletedToast"));
      setConfirmOpen(false);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      console.error("[habits] delete template failed", err);
      toast.error(err instanceof Error ? err.message : t("deleteFailedToast"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{template.name.en || template.name.es}</DialogTitle>
            <DialogDescription>
              {esName ?? t("detailTitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <HabitTypePill type={template.type} t={tc} />
              <GoalPill
                type={template.type}
                targetValue={template.targetValue}
                unit={template.unit}
                t={tc}
              />
              <span
                className={cn(
                  PILL_BASE,
                  isCustom ? TONE.violet : TONE.sky,
                )}
              >
                {isCustom ? tc("scopeMine") : tc("scopeGlobal")}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {tc("reminder")}
              </span>
              <ReminderCell
                reminderEnabled={template.reminderEnabled}
                reminderTime={template.reminderTime}
              />
            </div>

            {descEn || descEs ? (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                {descEn ? (
                  <p className="whitespace-pre-wrap">{descEn}</p>
                ) : null}
                {descEs && descEs !== descEn ? (
                  <p className="whitespace-pre-wrap italic text-muted-foreground">
                    {descEs}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("noDescription")}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="sm:mr-auto"
            >
              {t("closeCta")}
            </Button>
            {isCustom ? (
              <Button
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                className="gap-1"
              >
                <Trash2 className="size-4" />
                {tc("delete")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialogBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("deleteDialogCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? t("deleting") : t("deleteDialogConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
