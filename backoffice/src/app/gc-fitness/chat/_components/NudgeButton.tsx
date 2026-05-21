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

import { useState } from "react";
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

import { sendTrainerNudge } from "@/lib/gc-fitness/nudge-server-actions";
import {
  nudgeInputSchema,
  NUDGE_MESSAGE_MAX_LENGTH,
  type NudgeInput,
} from "@/lib/gc-fitness/nudge-schema";

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

  // Disable Submit when:
  //   - currently submitting (avoid double-tap → double-counter), OR
  //   - form has any validation errors, OR
  //   - message is empty (form.formState.isValid only flips after the
  //     first interaction in mode: 'onChange', so we double-check the
  //     trimmed length).
  const trimmedLen = (watchedMessage ?? "").trim().length;
  const canSubmit =
    !submitting &&
    trimmedLen > 0 &&
    !overCap &&
    Object.keys(form.formState.errors).length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Send className="size-4" />
          Send nudge
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a nudge to {clientName}</DialogTitle>
          <DialogDescription>
            Send a one-off push notification. Subject to your client&apos;s
            notification preferences and the daily cap (3 nudges / day per
            client).
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
