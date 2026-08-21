// ClientInviteCard.tsx — issue #970.
//
// Shows whether the client email went out, and lets the coach send it again.
//
// The status is not decoration. The invitation is a SINGLE shot by decision
// (#970: no N-day reminder), so if it silently failed — bad address, SMTP down
// at the moment of the add, mailbox full — the client simply never hears about
// the app, and the coach has no way to know. That is the state this card
// exists to make visible; the button is the only repair path, because
// re-adding a client who is already yours resolves to `alreadyYours` and
// writes nothing.
//
// `sent` is deliberately quiet (muted text, secondary button). It is the
// expected state and should not compete for attention with the row above it.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailCheck, MailWarning, MailX, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resendClientInvite } from "@/lib/gc-fitness/invite-actions";

export type ClientInviteStatus = "sent" | "failed" | "skipped" | "unknown";

export function ClientInviteCard({
  target,
  status,
  sentAtLabel,
}: {
  /** Exactly one of the two — pending clients have no uid yet. */
  target: { email: string; clientId?: undefined } | { clientId: string; email?: undefined };
  status: ClientInviteStatus;
  /** Pre-formatted in the reader's timezone by the server. */
  sentAtLabel: string | null;
}) {
  const t = useTranslations("clients.invite");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [justSent, setJustSent] = useState(false);

  const send = () => {
    startTransition(async () => {
      try {
        const result = await resendClientInvite(
          target.clientId ? { clientId: target.clientId } : { email: target.email },
        );
        if (!result.ok) {
          toast.error(
            result.reason === "cooldown" ? t("toastCooldown") : t("toastNoTarget"),
          );
          return;
        }
        // `skipped` is NOT a success to report as one: no mail server is
        // configured, so nothing was sent and nothing will be. Saying "enviado"
        // there would be the single most misleading thing this card could do.
        if (result.status === "skipped") {
          toast.error(t("toastNotConfigured"));
          return;
        }
        if (result.status === "failed") {
          toast.error(t("toastFailed"));
          return;
        }
        setJustSent(true);
        toast.success(t("toastSent"));
        router.refresh();
      } catch {
        // Server-Action error messages are prod-masked by Next.js, so there is
        // no user-renderable copy on the error — show the localized fallback.
        toast.error(t("toastFailed"));
      }
    });
  };

  const effective: ClientInviteStatus = justSent ? "sent" : status;
  const { Icon, tone, headline } =
    effective === "sent"
      ? { Icon: MailCheck, tone: "text-muted-foreground", headline: t("statusSent") }
      : effective === "failed"
        ? { Icon: MailX, tone: "text-destructive", headline: t("statusFailed") }
        : effective === "skipped"
          ? { Icon: MailWarning, tone: "text-chart-4", headline: t("statusSkipped") }
          : { Icon: MailWarning, tone: "text-muted-foreground", headline: t("statusUnknown") };

  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={`mt-0.5 size-5 shrink-0 ${tone}`} aria-hidden />
          <div className="min-w-0">
            <h2 className="font-medium">{headline}</h2>
            <p className="text-sm text-muted-foreground">
              {effective === "sent" && sentAtLabel
                ? t("sentAt", { when: sentAtLabel })
                : t(`hint.${effective}`)}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={send}
          disabled={pending}
        >
          <Send className="size-4" />
          {pending ? t("sending") : t("resendCta")}
        </Button>
      </div>
    </section>
  );
}
