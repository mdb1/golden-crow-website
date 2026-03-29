"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { VerifiedUserBadge } from "@/components/verified-user-badge";
import { Button } from "@/components/ui/button";
import { sdkFetch } from "@/lib/sdk-client";
import type { AdminUserVerificationSummary } from "@/lib/moderation-types";
import { fetchUserVerificationSummaries } from "@/lib/user-verification";

function getButtonLabel(
  summary: AdminUserVerificationSummary | null | undefined,
  pending: boolean
) {
  if (pending) {
    return "Sending...";
  }

  if (!summary || !summary.exists) {
    return "No auth account";
  }

  if (summary.disabled) {
    return "Account disabled";
  }

  if (!summary.email) {
    return "No auth email";
  }

  if (summary.emailVerified) {
    return "Email verified";
  }

  return "Send verification email";
}

export function UserVerificationCard({
  uid,
  title,
  fallbackEmail,
  leading,
  initialSummary,
}: {
  uid: string;
  title: string;
  fallbackEmail?: string;
  leading?: ReactNode;
  initialSummary?: AdminUserVerificationSummary;
}) {
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ["user-verification-summary", uid],
    queryFn: async () => {
      const [resolvedSummary] = await fetchUserVerificationSummaries([uid]);

      return (
        resolvedSummary ?? {
          uid,
          exists: false,
          email: "",
          emailVerified: false,
          disabled: false,
        }
      );
    },
    initialData: initialSummary,
    staleTime: 30_000,
  });

  const authEmail = summary?.email || fallbackEmail || "";
  const secondaryLine = useMemo(() => {
    if (!summary || !summary.exists) {
      return fallbackEmail || "No Firebase Auth account for this uid.";
    }

    if (fallbackEmail && summary.email && fallbackEmail !== summary.email) {
      return `Auth email: ${summary.email} • Record email: ${fallbackEmail}`;
    }

    if (summary.email) {
      return summary.email;
    }

    return fallbackEmail || "No Firebase Auth email.";
  }, [fallbackEmail, summary]);

  async function handleSendVerificationEmail() {
    setPending(true);

    try {
      const response = await sdkFetch<{
        uid: string;
        email: string;
        alreadyVerified: boolean;
      }>(`/users/${uid}/send-email-verification`, {
        method: "POST",
      });

      setToast({
        id: Date.now(),
        tone: "success",
        message: response.alreadyVerified
          ? `${response.email} is already verified.`
          : `Verification email sent to ${response.email}.`,
      });
      await refetch();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Unable to trigger the Firebase verification email.",
      });
    } finally {
      setPending(false);
    }
  }

  const sendDisabled =
    pending ||
    !summary?.exists ||
    summary.disabled ||
    !authEmail ||
    summary.emailVerified;

  return (
    <>
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />
      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{title || uid}</p>
              <VerifiedUserBadge summary={summary} loading={isLoading} />
            </div>
            <p className="truncate text-sm text-muted-foreground">{secondaryLine}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleSendVerificationEmail()}
          disabled={sendDisabled}
        >
          <MailCheck className="h-3.5 w-3.5" />
          {getButtonLabel(summary, pending)}
        </Button>
      </div>
    </>
  );
}
