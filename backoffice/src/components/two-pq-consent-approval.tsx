"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { InformedConsentStudyRequest } from "@/lib/informed-consents";
import { appText, type AppLanguage } from "@/lib/language";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

const approvalButtonClass =
  "h-auto min-h-12 w-full gap-2 whitespace-normal bg-emerald-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-emerald-800 sm:w-auto";

export function TwoPQConsentApproval({
  request,
  language,
  disabled,
  onApproved,
  onPendingChange,
}: {
  request: InformedConsentStudyRequest | null;
  language: AppLanguage;
  disabled?: boolean;
  onApproved: (request: InformedConsentStudyRequest) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const t = (label: string) => appText(language, label);
  const [expectedUploadedAt, setExpectedUploadedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const consent = request?.consent;
  const uploadedAt = request?.canApprove && consent?.status === "needs_review" && consent.id
    ? consent.uploadedAt
    : null;
  const label = t("Approve informed consent");

  async function approve() {
    if (pending || disabled || !request || !uploadedAt || !expectedUploadedAt) return;
    setPending(true);
    onPendingChange?.(true);
    setFeedback(null);
    try {
      const path = `/2pq/informed-consents/study-requests/${encodeURIComponent(request.id)}/approve`;
      const result = await sdkFetch<{ request: InformedConsentStudyRequest }>(path, {
        method: "POST",
        body: JSON.stringify({ expectedUploadedAt }),
      });
      onApproved(result.request);
      setFeedback({ error: false, message: t("Consent approved.") });
      router.refresh();
    } catch (error) {
      setFeedback({
        error: true,
        message: t(error instanceof Error ? error.message : "Unable to approve consent."),
      });
      if (error instanceof SdkRequestError && error.status === 409) router.refresh();
    } finally {
      setExpectedUploadedAt(null);
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return (
    <>
      {uploadedAt ? (
        <AlertDialog
          open={expectedUploadedAt !== null}
          onOpenChange={(open) => {
            if (!pending) setExpectedUploadedAt(open ? uploadedAt : null);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button type="button" size="lg" className={approvalButtonClass} disabled={disabled || pending}>
              <Check className="size-5" />
              {label}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{label}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("Confirm that you reviewed the uploaded document and verified the required signatures for this study request.")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="sm:items-center">
              <AlertDialogCancel disabled={pending}>{t("Cancel")}</AlertDialogCancel>
              <Button type="button" size="lg" className={approvalButtonClass} onClick={() => void approve()} disabled={disabled || pending}>
                {t("Confirm approval")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {feedback ? (
        <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "basis-full text-sm text-destructive" : "basis-full text-sm text-emerald-700 dark:text-emerald-300"}>
          {feedback.message}
        </p>
      ) : null}
    </>
  );
}
