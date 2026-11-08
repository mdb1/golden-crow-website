"use client";

// InheritedPlanPanel.tsx — gc-fitness#1504: what a former coach left on this
// client's plan, and the current coach's way out of it.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { endInheritedPlan } from "@/lib/gc-fitness/inherited-plan-actions";

export function InheritedPlanPanel({
  clientId,
  workouts,
  habits,
}: {
  clientId: string;
  workouts: number;
  habits: number;
}) {
  const t = useTranslations("clients.detail.summary.inheritedPlan");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function confirm() {
    setFailed(false);
    startTransition(async () => {
      try {
        await endInheritedPlan({ clientId });
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="inherited-plan-panel"
    >
      <div className="min-w-0 text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <History className="size-4 shrink-0 opacity-70" aria-hidden />
          {t("title")}
        </p>
        <p className="text-xs text-muted-foreground">{t("counts", { workouts, habits })}</p>
        {failed ? (
          <p className="text-xs text-destructive" role="alert">
            {t("failed")}
          </p>
        ) : null}
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending} className="shrink-0">
            {t("end")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("end")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>{t("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
