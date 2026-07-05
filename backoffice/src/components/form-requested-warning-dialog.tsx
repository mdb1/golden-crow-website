"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { appText } from "@/lib/language";

export function FormRequestedWarningDialog({
  trigger,
  open,
  onOpenChange,
  title = "Action unavailable",
  description = "These entities cannot be created directly. They must be requested through the corresponding form.",
  dashboardHref,
  dashboardLabel = "Go to 2PQ dashboard",
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  dashboardHref?: string;
  dashboardLabel?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-[1.35rem] border border-amber-300/25 bg-background/96 p-0 shadow-[0_24px_80px_rgba(15,23,42,0.28)] sm:max-w-md">
        <div className="flex flex-col gap-5 px-5 pb-5 pt-6">
          <DialogHeader className="gap-3 pr-8">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-amber-300/35 bg-amber-300/12 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="font-heading text-xl font-semibold text-foreground">
                {t(title)}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-muted-foreground">
                {t(description)}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter className="-mx-5 -mb-5 flex-col-reverse gap-2 rounded-b-[1.35rem] border-t bg-muted/35 px-5 py-4 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline">{t("OK")}</Button>
            </DialogClose>
            {dashboardHref ? (
              <Button asChild>
                <Link href={dashboardHref}>{t(dashboardLabel)}</Link>
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
