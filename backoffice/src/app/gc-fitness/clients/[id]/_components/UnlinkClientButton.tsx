// UnlinkClientButton.tsx — issue #753, "des-linkear" an active client.
//
// A destructive-but-recoverable action, so it gets the full confirm treatment:
// the button never fires the mutation directly, the dialog spells out what
// SURVIVES (the account, the history, the program) and what does not (the
// roster link, the chat thread's place in this coach's inbox, the coached
// premium entitlement), and the confirm stays disabled while the action runs.
//
// On success we leave the page — the client is no longer this coach's, so
// /gc-fitness/clients/{id} would 404 on the very next render (its ownership
// gate is `coachId === trainer.uid`). `router.replace` + `refresh` rather than
// `push`, so Back doesn't land on that 404.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Unlink } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { unlinkClient } from "@/lib/gc-fitness/user-actions";

export function UnlinkClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const t = useTranslations("clients.detail.unlink");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      try {
        await unlinkClient({ clientId });
        toast.success(t("doneToast", { name: clientName }));
        setOpen(false);
        router.replace("/gc-fitness/clients");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorToast"));
      }
    });
  };

  return (
    <section className="rounded-[1.25rem] border border-destructive/30 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
        </div>
        <Button
          variant="outline"
          className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Unlink className="size-4" />
          {t("cta")}
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle", { name: clientName })}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? t("pending") : t("confirmCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
