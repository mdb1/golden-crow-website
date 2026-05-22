"use client";

// NudgeButton.tsx
//
// Trainer-facing "Send nudge" button in the chat conversation header.
// Opens a shadcn Dialog with a single-Textarea form (react-hook-form +
// zodResolver against `nudgeInputSchema`) that invokes the
// `sendTrainerNudge` Server Action on submit. The Server Action wraps
// the 10-07 HTTPS callable; the callable proxies through the P10-01
// enqueuePush orchestrator (frequency cap / quiet hours / preferences).
//
// ─────────────────────────────────────────────────────────────────────────
//  Pitfall 7 (17th reuse) — same-source-of-truth contract.
// ─────────────────────────────────────────────────────────────────────────
//  The form's Zod schema (`nudgeInputSchema`) is imported verbatim from
//  `nudge-schema.ts`; same caps as the 10-07 server-side guards. The
//  200-char counter is rendered inline (red when over-cap) so the
//  trainer never types past the cap — avoids the "I typed 300 chars and
//  got a confusing invalid-argument toast" failure mode.
//
// ─────────────────────────────────────────────────────────────────────────
//  TOAST CONTRACT — surfaces the callable's verbatim decision string.
// ─────────────────────────────────────────────────────────────────────────
//   - `ok: true`  → green toast: "Nudge sent to {clientName}"
//                   description: decision verbatim (`send_now` / `queued` /
//                                                   `dropped:no_tokens`)
//   - `ok: false` → yellow warning toast: "Nudge not delivered"
//                   description: "{clientName}: {decision}" so the trainer
//                   knows whether the client opted out (`preferences_off`),
//                   the daily cap was hit (`daily_cap` / `total_cap`), etc.
//   - thrown err  → red error toast with err.message — covers callable
//                   HTTP failures, Server-Action auth/parse failures.
//
// ─────────────────────────────────────────────────────────────────────────
//  PLACEMENT (per PLAN 10-08).
// ─────────────────────────────────────────────────────────────────────────
//  Rendered inside ChatConversation's header bar (flex justify-between)
//  to the right of the partner display name. The chatId IS the clientId
//  per the P08-04 deterministic doc-id contract — the caller passes
//  `clientId={chatId}` directly.

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Send } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  getNudgeCapStatus,
  sendTrainerNudge,
  type NudgeCapStatus,
} from "@/lib/gc-fitness/nudge-server-actions";
import {
  nudgeInputSchema,
  NUDGE_MESSAGE_MAX_LENGTH,
  type NudgeInput,
} from "@/lib/gc-fitness/nudge-schema";
import { NUDGE_CATEGORY_CAP } from "@/lib/gc-fitness/push-cap-schema";

export interface NudgeButtonProps {
  /** Recipient client's Firebase Auth uid — equals the chatId per the
   *  P08-04 deterministic doc-id contract. */
  clientId: string;
  /** Display name shown in the dialog title + toast body. */
  clientName: string;
}

export function NudgeButton({ clientId, clientName }: NudgeButtonProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Daily push cap snapshot (P10-08 follow-up — 260522). Server Action
  // returns BOTH cap dimensions (total of 4 across non-chat categories,
  // nudge-category of 3) plus the effective `remaining` (min of the two)
  // so the trainer sees a single number and the button disables when
  // EITHER cap is hit. `gatingCap` drives the tooltip copy on the
  // disabled state — distinguishes "you hit the total push cap" from
  // "you hit the nudge-specific cap".
  const [capStatus, setCapStatus] = useState<NudgeCapStatus | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const [capLoading, setCapLoading] = useState(false);

  const refreshCapStatus = useCallback(async () => {
    setCapLoading(true);
    try {
      const status = await getNudgeCapStatus(clientId);
      setCapStatus(status);
      setCapError(null);
    } catch (err) {
      // Soft-fail: if the cap read errors (e.g., transient Firestore
      // outage), we leave the button enabled and surface a small "—"
      // pill. The callable will still reject if the cap is really hit.
      setCapStatus(null);
      setCapError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCapLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refreshCapStatus();
  }, [refreshCapStatus]);

  // The Zod transform strips control chars + trims on parse. The form's
  // `mode: "onChange"` runs the validator on every keystroke so the
  // Submit button enables/disables in real time AND the FormMessage
  // surfaces the cap violation immediately when the user is over 200.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<NudgeInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(nudgeInputSchema as any) as unknown as any,
    defaultValues: { clientId, message: "" },
    mode: "onChange",
  });

  // Watch the live textarea value for the inline character counter. We
  // intentionally render the RAW input length (pre-transform) so the
  // trainer sees "120 / 200" as they type — what they typed, not what
  // the server will see post-strip. The post-strip length is checked at
  // submit by the Zod pipe.
  const watchedMessage = form.watch("message");
  const charCount = watchedMessage?.length ?? 0;
  const overCap = charCount > NUDGE_MESSAGE_MAX_LENGTH;

  async function onSubmit(data: NudgeInput) {
    setSubmitting(true);
    try {
      const result = await sendTrainerNudge(data);
      if (result.ok) {
        toast.success(`Nudge sent to ${clientName}`, {
          description: `Decision: ${result.decision}`,
        });
      } else {
        // ok=false means the callable's orchestrator dropped the push for
        // a reason the trainer should know (preferences_off / daily_cap /
        // total_cap / missing_user). Use a warning toast — the action
        // itself didn't error, but the side effect didn't deliver.
        toast.warning("Nudge not delivered", {
          description: `${clientName}: ${result.decision}`,
        });
      }
      form.reset({ clientId, message: "" });
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't send.";
      toast.error("Couldn't send the nudge", { description: message });
    } finally {
      setSubmitting(false);
      // Refresh the cap counter regardless of outcome — a server-side
      // increment landed if the orchestrator decided send_now/queued
      // (Pitfall: increment happens before the FCM call even when
      // delivery fails). Pulling fresh state keeps the UI honest.
      void refreshCapStatus();
    }
  }

  // Reset the form when the dialog is closed (regardless of whether the
  // close came from Cancel, ESC, click-outside, or a successful submit).
  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset({ clientId, message: "" });
    }
    setOpen(next);
  }

  // Daily cap gate: disable the Send button when the orchestrator would
  // drop this nudge. `remaining === 0` covers both the per-category and
  // total cap (the Server Action takes min(...)). `capStatus == null`
  // happens during the initial load AND on a soft-failed cap read — we
  // leave the button enabled in that case because the callable still
  // enforces server-side; falsely blocking the trainer is worse than
  // letting them try and see the rejection toast.
  const capReached = capStatus !== null && capStatus.remaining === 0;

  // Disable Submit when:
  //   - currently submitting (avoid double-tap → double-counter), OR
  //   - form has any validation errors, OR
  //   - message is empty (form.formState.isValid only flips after the
  //     first interaction in mode: 'onChange', so we double-check the
  //     trimmed length), OR
  //   - daily cap is reached (260522 follow-up).
  const trimmedLen = (watchedMessage ?? "").trim().length;
  const canSubmit =
    !submitting &&
    trimmedLen > 0 &&
    !overCap &&
    !capReached &&
    Object.keys(form.formState.errors).length === 0;

  // Inline counter label. We display the TOTAL cap because that's the
  // umbrella budget the trainer reasons about ("4 pushes / day"). The
  // nudge-specific cap (3) is a secondary constraint that's only tighter
  // when the client has already received 3 nudges and no other pushes —
  // rare; when it does gate, the disabled-state tooltip explains.
  const capLabel = capStatus
    ? `${capStatus.totalUsed} / ${capStatus.totalCap} today`
    : capLoading
      ? "—"
      : "—";

  // Tooltip body — explains why the button is disabled, or surfaces the
  // soft-error from a failed cap read.
  let capTooltip: string;
  if (capError) {
    capTooltip = `Couldn't read today's push count (${capError}). The send will still be checked server-side.`;
  } else if (capReached && capStatus) {
    capTooltip =
      capStatus.gatingCap === "nudge"
        ? `Daily nudge cap reached (${capStatus.nudgeUsed} / ${capStatus.nudgeCap}). Resets at midnight in ${clientName}'s timezone (${capStatus.timezone}).`
        : `Daily push cap reached (${capStatus.totalUsed} / ${capStatus.totalCap} across nudges, assignments, PRs). Resets at midnight in ${clientName}'s timezone (${capStatus.timezone}).`;
  } else if (capStatus) {
    capTooltip = `${capStatus.remaining} push${
      capStatus.remaining === 1 ? "" : "es"
    } remaining today (resets midnight ${capStatus.timezone}).`;
  } else {
    capTooltip = "Loading today's push count…";
  }

  const triggerButton = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      disabled={capReached}
    >
      <Send className="size-4" />
      Send nudge
      <span
        aria-live="polite"
        className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
          capReached
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-muted-foreground/30 text-muted-foreground"
        }`}
      >
        {capLabel}
      </span>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            {capReached ? (
              // shadcn's DialogTrigger requires its child to be a Button.
              // When the trigger is disabled we render the Button OUTSIDE
              // the DialogTrigger so clicking it does NOT open the dialog
              // — only the tooltip shows. (DialogTrigger asChild +
              // disabled child swallows the click but still announces
              // the open state to AT — undesirable here.)
              triggerButton
            ) : (
              <DialogTrigger asChild>{triggerButton}</DialogTrigger>
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {capTooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a nudge to {clientName}</DialogTitle>
          <DialogDescription>
            Send a one-off push notification.{" "}
            {capStatus ? (
              <>
                Subject to your client&apos;s notification preferences.{" "}
                <span className="font-medium">
                  {capStatus.remaining}
                </span>{" "}
                of {capStatus.totalCap} push
                {capStatus.totalCap === 1 ? "" : "es"} remaining today (resets
                at midnight in {capStatus.timezone}).
              </>
            ) : (
              <>
                Subject to your client&apos;s notification preferences and a
                daily cap of {NUDGE_CATEGORY_CAP} nudges per client.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-3"
          >
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center justify-between">
                    <span>Message</span>
                    <span
                      className={`text-xs ${
                        overCap
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                      aria-live="polite"
                    >
                      {charCount} / {NUDGE_MESSAGE_MAX_LENGTH}
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      autoFocus
                      rows={3}
                      placeholder="Don't skip leg day!"
                      // Allow a small overshoot so the red counter is
                      // visible to the trainer (final validation is on
                      // submit via the Zod pipe).
                      maxLength={NUDGE_MESSAGE_MAX_LENGTH + 20}
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {submitting ? "Sending…" : "Send nudge"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
