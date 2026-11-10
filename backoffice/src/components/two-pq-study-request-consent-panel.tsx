"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Check, FileUp, Mail } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { ConsentRequestStatusBadge } from "@/components/consent-request-status-badge";
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
import type {
  InformedConsentRequestSummary,
  InformedConsentStudyRequest,
} from "@/lib/informed-consents";
import { appText } from "@/lib/language";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

export function TwoPQStudyRequestConsentPanel({
  formId,
  consent,
  request,
  biopsyPending,
}: {
  formId: string;
  consent?: InformedConsentRequestSummary;
  request: InformedConsentStudyRequest | null;
  biopsyPending: boolean;
}) {
  const router = useRouter();
  const { language } = useAppLanguage();
  const t = (label: string) => appText(language, label);
  const [updatedRequest, setUpdatedRequest] = useState<InformedConsentStudyRequest | null>(null);
  const [action, setAction] = useState<"approve" | "resend" | null>(null);
  const [approving, setApproving] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const currentRequest = updatedRequest ?? request;
  const summary: InformedConsentRequestSummary = currentRequest?.consent ?? consent ?? { id: null, status: "pending" };
  const path = `/2pq/informed-consents/study-requests/${encodeURIComponent(formId)}`;

  async function approve() {
    if (action || !currentRequest?.canApprove || !summary.uploadedAt) return;
    setAction("approve");
    setFeedback(null);
    try {
      const result = await sdkFetch<{ request: InformedConsentStudyRequest }>(`${path}/approve`, {
        method: "POST",
        body: JSON.stringify({ expectedUploadedAt: summary.uploadedAt }),
      });
      setUpdatedRequest(result.request);
      setApproving(false);
      setFeedback({ error: false, message: t("Consent approved.") });
      router.refresh();
    } catch (error) {
      setApproving(false);
      setFeedback({
        error: true,
        message: t(error instanceof Error ? error.message : "Unable to approve consent."),
      });
      if (error instanceof SdkRequestError && error.status === 409) router.refresh();
    } finally {
      setAction(null);
    }
  }

  async function resend() {
    if (action || !currentRequest?.canResend) return;
    setAction("resend");
    setFeedback(null);
    try {
      const result = await sdkFetch<{ ok: true; patientEmail: string }>(`${path}/resend`, {
        method: "POST",
      });
      setFeedback({ error: false, message: `${t("Invitation sent to")} ${result.patientEmail}` });
      router.refresh();
    } catch (error) {
      setFeedback({
        error: true,
        message: t(error instanceof Error ? error.message : "Unable to resend consent invitation."),
      });
    } finally {
      setAction(null);
    }
  }

  return (
    <section id="informed-consent" className="glass-panel scroll-mt-24 space-y-3 px-5 py-4" aria-labelledby="informed-consent-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="informed-consent-title" className="font-heading text-lg font-semibold">
          {t("Informed consent")}
        </h2>
        <ConsentRequestStatusBadge language={language} status={summary.status} />
      </div>
      {currentRequest?.patientEmail ? (
        <p className="break-all text-sm text-muted-foreground">
          {t("Patient email")} · {currentRequest.patientEmail}
        </p>
      ) : null}
      {biopsyPending && summary.status !== "ready" ? (
        <p className="text-sm text-muted-foreground">
          {t("Consent must be approved before completing the biopsy form.")}
        </p>
      ) : null}
      {!request ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {t("Consent actions are unavailable. Reload the request to try again.")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {summary.id ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/2pq-dashboard/consents/${encodeURIComponent(summary.id)}`} target="_blank" rel="noreferrer">
              {t("Open signed consent")}
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        ) : null}
        {currentRequest?.canUpload ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/2pq-dashboard/consents/new?${new URLSearchParams({ studyRequestFormId: formId })}`}>
              <FileUp className="size-4" />
              {t(summary.id ? "Replace signed consent" : "Upload signed consent")}
            </Link>
          </Button>
        ) : null}
        {currentRequest?.canApprove && summary.uploadedAt ? (
          <AlertDialog open={approving} onOpenChange={setApproving}>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={Boolean(action)}>
                <Check className="size-4" />
                {t("Approve consent")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("Approve consent")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("Confirm that you reviewed the uploaded document and verified the required signatures for this study request.")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={action === "approve"}>{t("Cancel")}</AlertDialogCancel>
                <Button onClick={() => void approve()} disabled={Boolean(action)}>
                  {t("Confirm approval")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {currentRequest?.canResend ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void resend()} disabled={Boolean(action)}>
            <Mail className="size-4" />
            {t(action === "resend" ? "Sending invitation…" : "Resend consent invitation")}
          </Button>
        ) : null}
      </div>
      {feedback ? (
        <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-destructive" : "text-sm text-foreground"}>
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
