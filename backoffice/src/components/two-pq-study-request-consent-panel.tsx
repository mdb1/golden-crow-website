"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, FileUp, Mail } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { ConsentRequestStatusBadge } from "@/components/consent-request-status-badge";
import { TwoPQConsentApproval } from "@/components/two-pq-consent-approval";
import { Button } from "@/components/ui/button";
import type {
  InformedConsentRequestSummary,
  InformedConsentStudyRequest,
} from "@/lib/informed-consents";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";

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
  const [resending, setResending] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const currentRequest = updatedRequest ?? request;
  const summary: InformedConsentRequestSummary = currentRequest?.consent ?? consent ?? { id: null, status: "pending" };
  const path = `/2pq/informed-consents/study-requests/${encodeURIComponent(formId)}`;

  async function resend() {
    if (resending || approvalPending || !currentRequest?.canResend) return;
    setResending(true);
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
      setResending(false);
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
      <div className="flex flex-wrap items-center gap-2">
        <TwoPQConsentApproval
          request={currentRequest}
          language={language}
          disabled={resending}
          onApproved={setUpdatedRequest}
          onPendingChange={(pending) => {
            setApprovalPending(pending);
            if (pending) setFeedback(null);
          }}
        />
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
        {currentRequest?.canResend ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void resend()} disabled={resending || approvalPending}>
            <Mail className="size-4" />
            {t(resending ? "Sending invitation…" : "Resend consent invitation")}
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
