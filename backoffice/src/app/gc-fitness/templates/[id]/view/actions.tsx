"use client";

// templates/[id]/view/actions.tsx
//
// Client action bar for the read-only template VIEW page. A Standard
// (library) template opens here instead of auto-forking on /edit, so the
// trainer forks *only* when they explicitly hit Duplicate.
//
// - Duplicate → existing `duplicateWorkoutTemplate` server action (which
//   already behaves like a fork for standard templates and suffixes the
//   name with " (copia)"/" (copy)"), then navigates into the new copy's
//   editor. Matches the iOS "duplicate then refine" UX.
// - Back → returns to the templates list.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { duplicateWorkoutTemplate } from "@/lib/gc-fitness/workout-template-actions";

interface ViewTemplateActionsProps {
  templateId: string;
}

export function ViewTemplateActions({ templateId }: ViewTemplateActionsProps) {
  const router = useRouter();
  const t = useTranslations("templates.viewPage");
  const [pending, startTransition] = useTransition();

  function handleDuplicate() {
    startTransition(async () => {
      try {
        const result = await duplicateWorkoutTemplate(templateId);
        toast.success(t("duplicatedToast"));
        router.push(`/gc-fitness/templates/${result.id}/edit`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("duplicateFailedToast");
        toast.error(message);
      }
    });
  }

  function handleBack() {
    router.push("/gc-fitness/templates");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        onClick={handleDuplicate}
        disabled={pending}
        className="gap-2 rounded-full"
      >
        <Copy className="h-4 w-4" />
        {t("duplicateCta")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={handleBack}
        disabled={pending}
        className="gap-2 rounded-full"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backCta")}
      </Button>
    </div>
  );
}
