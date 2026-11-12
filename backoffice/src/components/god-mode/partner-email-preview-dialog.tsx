"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PARTNERS_API_ROUTE,
  PARTNER_SECTIONS,
  PARTNER_INDIVIDUAL_SECTIONS,
} from "@/lib/connected-partners";
import {
  partnerEmailPreviewDocument,
  type PartnerEmailLanguage,
  type PartnerEmailPreview,
  type PartnerEmailSendInput,
  type PartnerEmailSendResult,
  type PartnerEmailTemplateVariant,
} from "@/lib/partner-email";
import { appText } from "@/lib/language";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";
import { renderPartnerEmailBanner } from "./partner-email-banner";

type SendOperation = PartnerEmailSendInput & { partnerId: string };

export function PartnerEmailPreviewDialog({
  partnerId,
  onClose,
}: {
  partnerId: string;
  onClose: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [emailLanguage, setEmailLanguage] =
    useState<PartnerEmailLanguage>("es");
  const [templateVariant, setTemplateVariant] =
    useState<PartnerEmailTemplateVariant>(1);
  const [revision, setRevision] = useState(0);
  const [preparedPreview, setPreview] = useState<PartnerEmailPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [operation, setOperation] = useState<SendOperation | null>(null);
  const [outcome, setOutcome] = useState<PartnerEmailSendResult | null>(null);
  const generation = useRef(0);
  const sendLock = useRef(false);
  const operationRef = useRef<SendOperation | null>(null);

  useEffect(() => {
    const token = ++generation.current;
    const controller = new AbortController();
    setLoading(true);
    setPreview(null);
    setPreviewError(null);
    setSendError(null);
    setNeedsReview(false);
    setUnconfirmed(false);
    setOperation(null);
    setOutcome(null);
    operationRef.current = null;
    void sdkFetch<PartnerEmailPreview>(
      `${PARTNERS_API_ROUTE}/${encodeURIComponent(partnerId)}/email-preview?language=${emailLanguage}&templateVariant=${templateVariant}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (controller.signal.aborted || token !== generation.current) return;
        if (response.bannerBrand) {
          const banner = await renderPartnerEmailBanner(
            response.bannerBrand,
            response.language,
            response.category,
            controller.signal,
          );
          if (controller.signal.aborted || token !== generation.current) return;
          response = await sdkFetch<PartnerEmailPreview>(
            `${PARTNERS_API_ROUTE}/${encodeURIComponent(partnerId)}/email-preview`,
            {
              method: "POST",
              body: JSON.stringify({ language: emailLanguage, templateVariant, banner }),
              signal: controller.signal,
            },
          );
        }
        if (token === generation.current) setPreview(response);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || token !== generation.current) return;
        setPreviewError(
          failure instanceof Error
            ? failure.message
            : "Could not prepare the email preview.",
        );
      })
      .finally(() => {
        if (token === generation.current) setLoading(false);
      });
    return () => {
      controller.abort();
      generation.current += 1;
    };
  }, [partnerId, emailLanguage, templateVariant, revision]);

  const preview =
    preparedPreview?.partnerId === partnerId &&
    preparedPreview.language === emailLanguage &&
    preparedPreview.templateVariant === templateVariant
      ? preparedPreview
      : null;

  const sent = outcome?.status === "sent";
  const checking =
    unconfirmed ||
    outcome?.status === "sending" ||
    outcome?.status === "unknown";
  const knownFailure = outcome?.status === "failed";
  const selectionLocked =
    sending || checking || Boolean(operation && !knownFailure && !needsReview);
  const categoryLabel =
    [...PARTNER_SECTIONS, ...PARTNER_INDIVIDUAL_SECTIONS].find(
      (section) => section.key === preview?.category,
    )?.label ?? "Other app statuses or missing links";

  function close() {
    if (!sendLock.current) onClose();
  }

  async function sendEmail() {
    if (
      !preview ||
      loading ||
      previewError ||
      needsReview ||
      sent ||
      sendLock.current
    )
      return;
    const currentOperation = operationRef.current ?? {
      partnerId,
      language: preview.language,
      templateVariant: preview.templateVariant,
      previewHash: preview.previewHash,
      requestId: crypto.randomUUID(),
      ...(preview.banner ? { banner: preview.banner } : {}),
    };
    operationRef.current = currentOperation;
    sendLock.current = true;
    setOperation(currentOperation);
    setSending(true);
    setSendError(null);
    const token = generation.current;
    try {
      const { partnerId: operationPartnerId, ...input } = currentOperation;
      const response = await sdkFetch<PartnerEmailSendResult>(
        `${PARTNERS_API_ROUTE}/${encodeURIComponent(operationPartnerId)}/email`,
        { method: "POST", body: JSON.stringify(input) },
      );
      if (token !== generation.current) return;
      setOutcome(response);
      setUnconfirmed(
        response.status === "sending" || response.status === "unknown",
      );
      if (response.error) setSendError(response.error);
    } catch (failure) {
      if (token !== generation.current) return;
      setSendError(
        failure instanceof Error
          ? failure.message
          : "Could not send this email.",
      );
      if (failure instanceof SdkRequestError && failure.status === 412) {
        setNeedsReview(true);
        setUnconfirmed(false);
        setOutcome(null);
      } else if (
        failure instanceof SdkRequestError &&
        failure.status >= 400 &&
        failure.status < 500 &&
        failure.status !== 409
      ) {
        setOutcome({
          status: "failed",
          to: preview.to,
          sentAt: null,
          requestId: currentOperation.requestId,
        });
        setUnconfirmed(false);
      } else {
        setUnconfirmed(true);
      }
    } finally {
      sendLock.current = false;
      if (token === generation.current) setSending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-4xl"
        showCloseButton={!sending}
      >
        <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-violet-50 via-fuchsia-50/50 to-sky-50 p-5 pr-12 dark:from-violet-950/40 dark:via-fuchsia-950/20 dark:to-sky-950/30 sm:px-6">
          <DialogTitle className="flex items-center gap-3 font-heading text-xl font-semibold">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-500/15">
              <Mail className="size-5" />
            </span>
            {t("Email preview")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("Review the recipient and message before sending.")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6">
          {sent ? (
            <section
              aria-label={t("Email sent")}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 dark:border-emerald-400/25 dark:bg-emerald-500/10"
            >
              <CheckCircle2 className="mb-3 size-9 text-emerald-600 dark:text-emerald-300" />
              <h3 className="font-heading text-xl font-semibold">
                {t("Email sent")}
              </h3>
              <p className="mt-2 break-words text-sm">{outcome.to}</p>
            </section>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="group"
                  aria-label={t("Email language")}
                  className="inline-flex gap-1 rounded-xl border bg-muted/40 p-1"
                >
                  {(
                    [
                      { key: "es", label: "Español" },
                      { key: "en", label: "English" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={emailLanguage === option.key}
                      disabled={selectionLocked}
                      onClick={() => setEmailLanguage(option.key)}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium outline-none transition focus-visible:ring-3 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-60",
                        emailLanguage === option.key
                          ? "bg-violet-600 text-white shadow-sm"
                          : "text-muted-foreground hover:bg-background",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {preview && (
                  <span className="max-w-full rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">
                    {t(categoryLabel)}
                  </span>
                )}
              </div>
              <div
                role="group"
                aria-label={t("Email template")}
                className="grid grid-cols-2 gap-3"
              >
                {([
                  { key: 1, label: "Template 1", detail: "More detail" },
                  { key: 2, label: "Template 2", detail: "Short and direct" },
                ] as const).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-label={t(option.label)}
                    aria-describedby={`partner-email-template-${option.key}`}
                    aria-pressed={templateVariant === option.key}
                    disabled={selectionLocked}
                    onClick={() => setTemplateVariant(option.key)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left outline-none transition focus-visible:ring-3 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-60",
                      templateVariant === option.key
                        ? "border-violet-400 bg-gradient-to-br from-violet-50 to-fuchsia-50 shadow-sm dark:from-violet-500/15 dark:to-fuchsia-500/10"
                        : "border-border bg-background hover:border-violet-300 hover:bg-violet-50/40 dark:hover:bg-violet-500/5",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {t(option.label)}
                      </span>
                      <span
                        id={`partner-email-template-${option.key}`}
                        className="mt-1 block text-xs text-muted-foreground"
                      >
                        {t(option.detail)}
                      </span>
                    </span>
                    <span aria-hidden className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border",
                      templateVariant === option.key ? "border-violet-600 bg-violet-600 text-white" : "border-muted-foreground/25",
                    )}>
                      {templateVariant === option.key && <Check className="size-3.5" />}
                    </span>
                  </button>
                ))}
              </div>
              {loading && (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" />
                  {t("Preparing email preview...")}
                </p>
              )}
              {previewError && (
                <div
                  role="alert"
                  className="space-y-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm"
                >
                  <p className="break-words text-destructive">
                    {t(previewError)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    <RefreshCw className="size-4" />
                    {t("Retry preview")}
                  </Button>
                </div>
              )}
              {preview && (
                <>
                  <dl className="grid gap-3 rounded-2xl border bg-background/80 p-4 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
                    <dt className="text-muted-foreground">{t("From")}</dt>
                    <dd className="break-all font-medium">{preview.from}</dd>
                    <dt className="text-muted-foreground">{t("Recipient")}</dt>
                    <dd className="break-all font-medium">{preview.to}</dd>
                    <dt className="text-muted-foreground">{t("Subject")}</dt>
                    <dd className="break-words font-medium">
                      {preview.subject}
                    </dd>
                  </dl>
                  <section className="space-y-3 rounded-xl border bg-muted/20 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-medium">
                          {t("Purple button destination")}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {preview.ctaLabel}
                        </p>
                      </div>
                      <Button
                        asChild
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-xl"
                      >
                        <a
                          href={preview.ctaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                        >
                          <ExternalLink className="size-4" />
                          {t("Open link")}
                        </a>
                      </Button>
                    </div>
                    <p className="break-all rounded-lg bg-background/80 p-3 font-mono text-xs text-muted-foreground">
                      {preview.ctaUrl}
                    </p>
                    {preview.accessCodeUnavailableReason ? (
                      <p
                        role="note"
                        className="text-xs text-amber-700 dark:text-amber-300"
                      >
                        {t(preview.accessCodeUnavailableReason)}
                      </p>
                    ) : null}
                    {preview.accessCodeExpiresAt ? (
                      <p className="text-xs text-muted-foreground">
                        {t("Access code valid until")}:{" "}
                        {new Intl.DateTimeFormat(
                          language === "es" ? "es-AR" : "en",
                          { dateStyle: "medium", timeStyle: "short" },
                        ).format(new Date(preview.accessCodeExpiresAt))}
                      </p>
                    ) : null}
                  </section>
                  <iframe
                    title={t("Email message preview")}
                    sandbox=""
                    referrerPolicy="no-referrer"
                    tabIndex={0}
                    srcDoc={partnerEmailPreviewDocument(
                      preview.html,
                      preview.banner,
                    )}
                    className="h-[52vh] min-h-80 w-full rounded-2xl border bg-white"
                  />
                </>
              )}
              {sendError && (
                <p
                  role="alert"
                  className="break-words rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {t(sendError)}
                </p>
              )}
              {needsReview && (
                <div
                  role="alert"
                  className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200"
                >
                  <p>
                    {t(
                      "The partner or message changed. Refresh the preview and review it before sending.",
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    <RefreshCw className="size-4" />
                    {t("Refresh preview")}
                  </Button>
                </div>
              )}
              {checking && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {t(
                      "Delivery is not confirmed. Keep this preview open to check delivery, and check your sent mail before starting another email.",
                    )}
                  </span>
                </p>
              )}
              {sending && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" />
                  {t(checking ? "Checking delivery..." : "Sending email...")}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-background p-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={sending}
            onClick={close}
          >
            {t(sent ? "Finish" : "Cancel")}
          </Button>
          {!sent && (
            <Button
              type="button"
              disabled={
                !preview ||
                loading ||
                Boolean(previewError) ||
                needsReview ||
                sending
              }
              onClick={() => void sendEmail()}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/15"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : checking ? (
                <RefreshCw className="size-4" />
              ) : (
                <Send className="size-4" />
              )}
              {t(
                checking
                  ? "Check delivery"
                  : knownFailure
                    ? "Retry sending"
                    : "Send email",
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
