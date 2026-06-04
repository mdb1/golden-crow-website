"use client";

// HabitTemplateDetailDialog.tsx
//
// Detail view for a single habit LIBRARY template, opened by tapping a row in
// the Biblioteca view. Read-only by default; trainer-owned (scope === "trainer")
// templates can be EDITED inline (name / description / numeric goal / reminder)
// or soft-deleted. Global templates are read-only. Recurrence is intentionally
// absent — it's a per-assignment concern, not a template one.

import { useState } from "react";
import { EyeOff, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  hideGlobalHabitTemplate,
  listHabitTemplateAssignments,
  softDeleteHabitTemplate,
  updateHabitTemplate,
  type HabitTemplateRow,
} from "@/lib/gc-fitness/habit-actions";
import { recurrenceLabel, ReminderCell, ScopePill } from "./habit-pills";
import { HabitPhotoDropzone } from "./HabitPhotoDropzone";

export function HabitTemplateDetailDialog({
  open,
  onOpenChange,
  template,
  onChanged,
  clientNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: HabitTemplateRow | null;
  /** Fires after a successful edit or delete so the parent can invalidate caches. */
  onChanged: () => void;
  /** clientId → displayName, used to name the assignments in the delete-impact list (B6). */
  clientNames?: Map<string, string>;
}) {
  const t = useTranslations("habits.list");
  const tc = useTranslations("habits.columns");
  const tf = useTranslations("habits.form");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // B6 — READ-ONLY impact lookup for the delete confirm dialog: which clients
  // still have this library habit assigned (linked via sourceTemplateId).
  // Lazily fetched only when the confirm dialog is open. Informational only —
  // deleting the template does NOT cascade to these assignments.
  const templateId = template?.id ?? null;
  const { data: impact = [], isLoading: impactLoading } = useQuery({
    queryKey: ["gc-fitness", "habits", "template-impact", templateId],
    queryFn: () => listHabitTemplateAssignments(templateId as string),
    enabled: confirmOpen && templateId !== null,
    staleTime: 30_000,
  });
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  // B5 — hide-from-library confirm (global templates only).
  const [confirmHideOpen, setConfirmHideOpen] = useState(false);

  // Edit-form drafts (seeded from the template when entering edit mode).
  const [nameEn, setNameEn] = useState("");
  const [nameEs, setNameEs] = useState("");
  const [descEn, setDescEn] = useState("");
  const [descEs, setDescEs] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("");

  if (!template) return null;

  const isCustom = template.scope === "trainer";
  const esName =
    template.name.es && template.name.es !== template.name.en
      ? template.name.es
      : null;
  const descEnText = template.description?.en?.trim();
  const descEsText = template.description?.es?.trim();

  function startEdit() {
    if (!template) return;
    setNameEn(template.name.en ?? "");
    setNameEs(template.name.es ?? "");
    setDescEn(template.description?.en ?? "");
    setDescEs(template.description?.es ?? "");
    setYoutubeUrl(template.youtubeUrl ?? "");
    setPhotoUrl(template.photoUrl ?? "");
    setReminderEnabled(template.reminderEnabled);
    setReminderTime(template.reminderTime ?? "");
    setEditing(true);
  }

  function closeDialog() {
    setEditing(false);
    onOpenChange(false);
  }

  async function handleSave() {
    if (!template) return;
    setPending(true);
    try {
      const hasDesc = descEn.trim().length > 0 || descEs.trim().length > 0;
      await updateHabitTemplate(template.id, {
        name: { en: nameEn.trim(), es: nameEs.trim() },
        description: hasDesc
          ? { en: descEn.trim(), es: descEs.trim() }
          : undefined,
        youtubeUrl: youtubeUrl.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
        reminderEnabled,
        reminderTime: reminderEnabled ? reminderTime || undefined : undefined,
      });
      toast.success(tf("savedToast"));
      onChanged();
      closeDialog();
    } catch (err) {
      console.error("[habits] update template failed", err);
      toast.error(err instanceof Error ? err.message : tf("saveFailed"));
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!template) return;
    setPending(true);
    try {
      await softDeleteHabitTemplate(template.id);
      toast.success(t("deletedToast"));
      setConfirmOpen(false);
      onChanged();
      closeDialog();
    } catch (err) {
      console.error("[habits] delete template failed", err);
      toast.error(err instanceof Error ? err.message : t("deleteFailedToast"));
    } finally {
      setPending(false);
    }
  }

  async function handleHide() {
    if (!template) return;
    setPending(true);
    try {
      await hideGlobalHabitTemplate(template.id);
      toast.success(t("hiddenGlobalToast"));
      setConfirmHideOpen(false);
      onChanged();
      closeDialog();
    } catch (err) {
      console.error("[habits] hide global template failed", err);
      toast.error(err instanceof Error ? err.message : t("hideGlobalFailedToast"));
    } finally {
      setPending(false);
    }
  }

  const canSave = nameEn.trim().length > 0 && nameEs.trim().length > 0;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setEditing(false);
          onOpenChange(o);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{template.name.en || template.name.es}</DialogTitle>
            <DialogDescription>
              {editing ? t("editTitle") : esName ?? t("detailTitle")}
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-name-en">{tf("nameEn")}</Label>
                <Input
                  id="tpl-name-en"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder={tf("namePlaceholderEn")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-name-es">{tf("nameEs")}</Label>
                <Input
                  id="tpl-name-es"
                  value={nameEs}
                  onChange={(e) => setNameEs(e.target.value)}
                  placeholder={tf("namePlaceholderEs")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-desc-en">{tf("descriptionEn")}</Label>
                <Textarea
                  id="tpl-desc-en"
                  value={descEn}
                  onChange={(e) => setDescEn(e.target.value)}
                  placeholder={tf("descriptionPlaceholderEn")}
                  rows={2}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-desc-es">{tf("descriptionEs")}</Label>
                <Textarea
                  id="tpl-desc-es"
                  value={descEs}
                  onChange={(e) => setDescEs(e.target.value)}
                  placeholder={tf("descriptionPlaceholderEs")}
                  rows={2}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-youtube">{tf("youtubeUrlLabel")}</Label>
                <Input
                  id="tpl-youtube"
                  type="url"
                  inputMode="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtu.be/…"
                />
                <p className="text-xs text-muted-foreground">
                  {tf("youtubeUrlHint")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{tf("photoLabel")}</Label>
                <HabitPhotoDropzone
                  habitId={template.id}
                  value={photoUrl}
                  onUploaded={(gsPath) => setPhotoUrl(gsPath)}
                  onRemoved={() => setPhotoUrl("")}
                />
                <p className="text-xs text-muted-foreground">
                  {tf("photoHint")}
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={reminderEnabled}
                    onCheckedChange={(c) => setReminderEnabled(c === true)}
                  />
                  {tf("reminderToggleLabel")}
                </Label>
                {reminderEnabled ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tpl-reminder">
                      {tf("reminderTimeLabel")}
                    </Label>
                    <Input
                      id="tpl-reminder"
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="w-40"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <ScopePill isGlobal={!isCustom} t={tc} />
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

              {descEnText || descEsText ? (
                <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                  {descEnText ? (
                    <p className="whitespace-pre-wrap">{descEnText}</p>
                  ) : null}
                  {descEsText && descEsText !== descEnText ? (
                    <p className="whitespace-pre-wrap italic text-muted-foreground">
                      {descEsText}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("noDescription")}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                  className="sm:mr-auto"
                >
                  {tf("cancel")}
                </Button>
                <Button onClick={() => void handleSave()} disabled={pending || !canSave}>
                  {pending ? tf("saving") : tf("saveCta")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  className="sm:mr-auto"
                >
                  {t("closeCta")}
                </Button>
                {isCustom ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={startEdit}
                      className="gap-1"
                    >
                      <Pencil className="size-4" />
                      {tc("edit")}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmOpen(true)}
                      className="gap-1"
                    >
                      <Trash2 className="size-4" />
                      {tc("delete")}
                    </Button>
                  </>
                ) : (
                  // B5 — global templates are shared + read-only, so they can't
                  // be deleted. Instead the trainer hides them from their own
                  // library (reversible via "Mostrar ocultos" in the list view).
                  <Button
                    variant="outline"
                    onClick={() => setConfirmHideOpen(true)}
                    className="gap-1"
                  >
                    <EyeOff className="size-4" />
                    {t("hideGlobalCta")}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTemplateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteTemplateBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* B6 — assignment impact. READ-ONLY: lists who still has this habit
              and states truthfully that deleting the library template does NOT
              cascade to those assignments. */}
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            {impactLoading ? (
              <p className="text-muted-foreground">{t("deleteImpactLoading")}</p>
            ) : impact.length === 0 ? (
              <p className="text-muted-foreground">{t("deleteImpactNone")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="font-medium text-foreground">
                  {t("deleteImpactHeading", { count: impact.length })}
                </p>
                <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                  {impact.map((a) => {
                    const name = a.pendingEmail
                      ? a.pendingEmail
                      : a.clientId
                        ? (clientNames?.get(a.clientId) ?? a.clientId)
                        : t("deleteImpactPending");
                    const { label } = recurrenceLabel(a, tc);
                    return (
                      <li
                        key={a.habitId}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5"
                      >
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {t("deleteImpactNote")}
                </p>
              </div>
            )}
          </div>

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

      {/* B5 — confirm hiding a GLOBAL template from this trainer's library. */}
      <AlertDialog open={confirmHideOpen} onOpenChange={setConfirmHideOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hideGlobalConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("hideGlobalConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("deleteDialogCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleHide();
              }}
              disabled={pending}
            >
              {pending ? t("deleting") : t("hideGlobalConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
