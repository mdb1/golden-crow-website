"use client";

// RosterBulkActions.tsx — golden-crow-website #500.
//
// The bar that appears over the roster when ≥1 client is selected:
//   «N seleccionados» · «Mandar mensaje» · «Asignar rutina» · «Limpiar»
// and the «Mandar mensaje» dialog.
//
// The dialog forwards to `sendCoachBroadcast` → gc-fitness callable
// `broadcastCoachMessage`, which owns every rule (ownership, 200 cap, 10/24h).
// The checks here (1..200 recipients, 1..1000 chars) are UX only.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarPlus, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { sendCoachBroadcast } from "@/lib/gc-fitness/coach-broadcast-actions";
import {
  BROADCAST_MAX_RECIPIENTS,
  BROADCAST_TEXT_MAX,
  broadcastDraftProblem,
  bulkScheduleHref,
  type BroadcastErrorKind,
} from "@/lib/gc-fitness/coach-broadcast-model";

export interface BulkRecipient {
  uid: string;
  displayName: string;
}

/** How many names the dialog spells out before «y N más». */
const RECIPIENT_PREVIEW = 6;

export function RosterBulkActions({
  recipients,
  onClear,
}: {
  recipients: BulkRecipient[];
  onClear: () => void;
}) {
  const t = useTranslations("clients.bulk");
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (recipients.length === 0) return null;

  return (
    <>
      <div
        role="toolbar"
        aria-label={t("toolbarLabel")}
        data-testid="roster-bulk-bar"
        className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background/95 px-4 py-2 shadow-sm backdrop-blur"
      >
        <span className="mr-auto text-sm font-medium tabular-nums">
          {t("selectedCount", { count: recipients.length })}
        </span>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 rounded-full"
          onClick={() => setDialogOpen(true)}
        >
          <MessageSquare className="size-4" aria-hidden />
          {t("sendMessage")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-full"
          onClick={() =>
            router.push(bulkScheduleHref(recipients.map((r) => r.uid)))
          }
        >
          <CalendarPlus className="size-4" aria-hidden />
          {t("assignWorkout")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5 rounded-full"
          onClick={onClear}
        >
          <X className="size-4" aria-hidden />
          {t("clear")}
        </Button>
      </div>
      <BroadcastMessageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        recipients={recipients}
        onSent={() => {
          setDialogOpen(false);
          onClear();
        }}
      />
    </>
  );
}

export function BroadcastMessageDialog({
  open,
  onOpenChange,
  recipients,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: BulkRecipient[];
  onSent: () => void;
}) {
  const t = useTranslations("clients.bulk");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Literal keys (not `errors.${kind}`) so i18n-literal-keys can check them.
  function errorCopy(kind: BroadcastErrorKind): string {
    switch (kind) {
      case "daily_cap":
        return t("errors.daily_cap");
      case "forbidden":
        return t("errors.forbidden");
      case "text":
        return t("errors.text");
      case "recipients":
        return t("errors.recipients");
      case "generic":
        return t("errors.generic");
    }
  }

  const problem = broadcastDraftProblem(text, recipients.length);
  const shown = recipients.slice(0, RECIPIENT_PREVIEW);
  const more = recipients.length - shown.length;

  async function onSend() {
    if (problem || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await sendCoachBroadcast(
        recipients.map((r) => r.uid),
        text.trim(),
      );
      if (!result.ok) {
        setError(errorCopy(result.error));
        return;
      }
      toast.success(t("toast.sent", { count: result.sent }), {
        description:
          result.skipped > 0
            ? t("toast.skipped", { count: result.skipped })
            : undefined,
      });
      setText("");
      onSent();
    } catch {
      // The action returns its failures; this only catches transport errors.
      setError(t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialog.title", { count: recipients.length })}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        <p className="text-sm" data-testid="broadcast-recipients">
          <span className="font-medium">{t("dialog.recipientsLabel")}: </span>
          <span className="text-muted-foreground">
            {shown.map((r) => r.displayName).join(", ")}
            {more > 0 ? ` ${t("dialog.recipientsMore", { count: more })}` : null}
          </span>
        </p>

        {problem === "too_many" ? (
          <p role="alert" className="text-sm text-destructive">
            {t("dialog.tooMany", {
              max: BROADCAST_MAX_RECIPIENTS,
              count: recipients.length,
            })}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="broadcast-text" className="text-sm font-medium">
            {t("dialog.messageLabel")}
          </label>
          <Textarea
            id="broadcast-text"
            value={text}
            maxLength={BROADCAST_TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("dialog.placeholder")}
            disabled={pending}
            className="min-h-32"
            aria-invalid={problem === "too_long" ? true : undefined}
          />
          <p
            className={
              problem === "too_long"
                ? "self-end text-xs tabular-nums text-destructive"
                : "self-end text-xs tabular-nums text-muted-foreground"
            }
            aria-live="polite"
            data-testid="broadcast-counter"
          >
            {t("dialog.counter", {
              used: text.length,
              max: BROADCAST_TEXT_MAX,
            })}
          </p>
          {problem === "too_long" ? (
            <p className="text-xs text-destructive">
              {t("dialog.tooLong", { max: BROADCAST_TEXT_MAX })}
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("dialog.cancel")}
          </Button>
          <Button
            type="button"
            disabled={problem !== null || pending}
            onClick={onSend}
          >
            {pending ? t("dialog.sending") : t("dialog.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
