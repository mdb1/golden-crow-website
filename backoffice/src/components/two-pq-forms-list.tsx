"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArrowRight, FileText, Trash2 } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAdminContext } from "@/components/admin-context-provider";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sdkFetch } from "@/lib/sdk-client";
import {
  TWO_PQ_FORM_LABELS,
  type TwoPQFormRecord,
} from "@/lib/two-pq-forms";
import { compactList } from "@/lib/moderation-utils";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function TwoPQFormsList({
  forms,
  limit,
  tone = "default",
  allowMutations = false,
}: {
  forms: TwoPQFormRecord[];
  limit?: number;
  tone?: "default" | "indigo";
  allowMutations?: boolean;
}) {
  const router = useRouter();
  const adminContext = useAdminContext();
  const [pendingAction, setPendingAction] = useState<{
    type: "archive" | "delete";
    form: TwoPQFormRecord;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const visibleForms = typeof limit === "number" ? forms.slice(0, limit) : forms;
  const emptyClass =
    tone === "indigo"
      ? "rounded-2xl border border-dashed border-indigo-200/80 bg-white/58 px-4 py-5 text-sm text-indigo-950/58 dark:border-indigo-300/20 dark:bg-indigo-950/24 dark:text-indigo-50/62"
      : "rounded-2xl border border-dashed border-border/80 bg-background/50 px-4 py-5 text-sm text-muted-foreground";
  const articleClass =
    tone === "indigo"
      ? "flex flex-col gap-3 rounded-2xl border border-indigo-100/90 bg-white/68 px-4 py-3 shadow-[0_12px_32px_rgba(99,102,241,0.12)] md:flex-row md:items-center md:justify-between dark:border-indigo-300/18 dark:bg-indigo-950/28"
      : "flex flex-col gap-3 rounded-2xl border border-border/75 bg-background/64 px-4 py-3 md:flex-row md:items-center md:justify-between";
  const iconClass =
    tone === "indigo"
      ? "flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-400/14 dark:text-indigo-100"
      : "flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-700 dark:text-indigo-200";
  const canDeleteForms = adminContext.role === "full_admin";
  const canArchiveForms =
    adminContext.role === "full_admin" ||
    adminContext.role === "institution_admin" ||
    adminContext.role === "institution_doctor";

  async function handleConfirmAction() {
    if (!pendingAction) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (pendingAction.type === "delete") {
        await sdkFetch(`/2pq/forms/${encodeURIComponent(pendingAction.form.id)}`, {
          method: "DELETE",
        });
        setToast({
          id: Date.now(),
          tone: "success",
          message: `Form ${pendingAction.form.id} was deleted.`,
        });
      } else {
        await sdkFetch(
          `/2pq/forms/${encodeURIComponent(pendingAction.form.id)}/archive`,
          { method: "PATCH" }
        );
        setToast({
          id: Date.now(),
          tone: "success",
          message: `Form ${pendingAction.form.id} was archived.`,
        });
      }
      setPendingAction(null);
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update this form.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="grid gap-3">
        {visibleForms.length === 0 ? (
          <div className={emptyClass}>
            No stored forms yet.
          </div>
        ) : (
          visibleForms.map((form) => {
            const authorEmail = form.authorEmail ?? form.createdByEmail;
            const isArchived = Boolean(form.archivedAt);

            return (
              <article
                key={form.id}
                className={articleClass}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={iconClass}>
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {form.patientName ?? "Unnamed patient"}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{form.id}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {compactList([
                      TWO_PQ_FORM_LABELS[form.formType],
                      form.requestedTestName,
                      form.institutionName,
                      form.patientEmail,
                      authorEmail ? `Author: ${authorEmail}` : undefined,
                    ])}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Badge variant="brand">{TWO_PQ_FORM_LABELS[form.formType]}</Badge>
                  {isArchived ? (
                    <Badge variant="warning">Archived</Badge>
                  ) : null}
                  <Badge variant="outline">{formatDate(form.createdAt)}</Badge>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/2pq-dashboard/forms/${encodeURIComponent(form.id)}`}>
                      Open
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                  {allowMutations && canDeleteForms ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setPendingAction({ type: "delete", form })}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  ) : null}
                  {allowMutations && !canDeleteForms && canArchiveForms && !isArchived ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingAction({ type: "archive", form })}
                      className="border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-300/20 dark:bg-indigo-400/12 dark:text-indigo-100"
                    >
                      <Archive className="size-3.5" />
                      Archive
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>

      <AlertDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setPendingAction(null);
          }
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogMedia
              className={
                pendingAction?.type === "delete"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-indigo-500/10 text-indigo-700"
              }
            >
              {pendingAction?.type === "delete" ? (
                <Trash2 className="size-5" />
              ) : (
                <Archive className="size-5" />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {pendingAction?.type === "delete" ? "Delete form" : "Archive form"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "delete"
                ? `This permanently deletes ${pendingAction.form.id} from 2pq_forms. Linked 2PQ case or sampling records are kept. This is only available to full admins.`
                : `This archives ${pendingAction?.form.id} so it leaves the default forms list. It can still be reviewed when archived forms are shown.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant={pendingAction?.type === "delete" ? "destructive" : "default"}
              onClick={() => void handleConfirmAction()}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Working..."
                : pendingAction?.type === "delete"
                  ? "Delete form"
                  : "Archive form"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
