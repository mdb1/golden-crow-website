"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";

type AreaEntityKind = "institution" | "doctor" | "patient";

const ENTITY_LABELS: Record<AreaEntityKind, string> = {
  institution: "institution",
  doctor: "doctor",
  patient: "patient",
};

const DELETE_DESCRIPTIONS: Record<AreaEntityKind, string> = {
  institution:
    "This removes the institution, all attached doctors and patients, and any linked local role assignments.",
  doctor:
    "This removes the doctor, all patients tied to this doctor, and any linked doctor or patient role assignments.",
  patient:
    "This removes the patient record and any linked patient role assignment.",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Delete failed. Please try again.";
}

export function AreaDeleteDialog({
  kind,
  id,
  name,
  endpoint,
  disabled = false,
  disabledReason,
  onDeleted,
}: {
  kind: AreaEntityKind;
  id: string;
  name: string;
  endpoint: string;
  disabled?: boolean;
  disabledReason?: string;
  onDeleted?: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const label = ENTITY_LABELS[kind];

  const mutation = useMutation({
    mutationFn: () => sdkFetch(endpoint, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["areas"] });
      setOpen(false);
      onDeleted?.();
      router.refresh();
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!mutation.isPending) {
          setOpen(nextOpen);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size="icon-sm"
          disabled={disabled || mutation.isPending}
          title={
            disabled
              ? (disabledReason ?? `${t("Current role cannot delete this")} ${t(label)}.`)
              : `${t("Delete")} ${t(label)} ${name || id}`
          }
          aria-label={`${t("Delete")} ${t(label)} ${name || id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/12 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("Delete")} {t(label)} {name || id}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(DELETE_DESCRIPTIONS[kind])} {t("This action cannot be undone.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {getErrorMessage(mutation.error)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? t("Deleting...") : `${t("Delete")} ${t(label)}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
