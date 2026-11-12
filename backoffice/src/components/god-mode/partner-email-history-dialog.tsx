"use client";

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Loader2,
  Mail,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Badge } from "@/components/ui/badge";
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
  PARTNER_EMAIL_HISTORY_QUERY_KEY,
  PARTNER_EMAIL_TEMPLATE_OPTIONS,
  type PartnerEmailHistoryPage,
  type PartnerEmailHistoryRecord,
} from "@/lib/partner-email";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";

const STATUSES = {
  sent: { label: "Sent", variant: "success" },
  sending: { label: "In progress", variant: "warning" },
  unknown: { label: "Delivery not confirmed", variant: "warning" },
  failed: { label: "Not sent", variant: "destructive" },
} as const;

function HistoryEmail({ email }: { email: PartnerEmailHistoryRecord }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [expanded, setExpanded] = useState(false);
  const detail = useQuery({
    queryKey: [...PARTNER_EMAIL_HISTORY_QUERY_KEY, "detail", email.requestId],
    enabled: expanded && email.messageAvailable,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      sdkFetch<{ email: PartnerEmailHistoryRecord }>(
        `${PARTNERS_API_ROUTE}/sent-email-log/${encodeURIComponent(email.requestId)}`,
        { signal },
      ),
  });
  const status = STATUSES[email.status];
  const template = PARTNER_EMAIL_TEMPLATE_OPTIONS.find(
    (option) => option.key === email.templateVariant,
  );
  const category = [...PARTNER_SECTIONS, ...PARTNER_INDIVIDUAL_SECTIONS].find(
    (section) => section.key === email.category,
  )?.label;
  const date = email.sentAt ?? email.updatedAt;
  return (
    <article className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <time dateTime={date} className="text-xs text-muted-foreground">
            {new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(date))}
          </time>
          <h3 className="mt-1 break-words font-heading text-base font-semibold">
            {email.subject ?? t("No subject recorded")}
          </h3>
        </div>
        <Badge variant={status.variant}>{t(status.label)}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {category && <Badge variant="outline">{t(category)}</Badge>}
        {template && (
          <Badge variant="violet">
            {t(template.label)}
          </Badge>
        )}
        <Badge variant="secondary">
          {email.language === "es" ? "Español" : "English"}
        </Badge>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {[
          ["Company name", email.partnerName],
          ["Recipient", email.to],
          ["From", email.from],
          ["Requested by", email.requestedByEmail],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t(label!)}</dt>
            <dd className="mt-1 break-words">{value || t("Not recorded")}</dd>
          </div>
        ))}
      </dl>
      {(email.status === "sending" || email.status === "unknown") && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t(
            "Delivery is not confirmed. Check Sent mail before sending another email.",
          )}
        </p>
      )}
      {email.messageAvailable ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            className={`size-4 transition ${expanded ? "rotate-180" : ""}`}
          />
          {t(expanded ? "Hide message" : "View message")}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("Message content was not recorded for older sends.")}
        </p>
      )}
      {expanded && (
        <section
          aria-label={t("Recorded message")}
          className="space-y-3 rounded-xl border bg-muted/20 p-4"
        >
          {detail.isPending ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              {t("Loading message...")}
            </p>
          ) : detail.isError ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>
                {t(
                  detail.error instanceof Error
                    ? detail.error.message
                    : "Could not load the message.",
                )}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void detail.refetch()}
              >
                {t("Retry")}
              </Button>
            </div>
          ) : (
            <>
              {email.accessKeyOmitted && (
                <p role="note" className="text-xs text-muted-foreground">
                  {t("Access keys are hidden in the email history.")}
                </p>
              )}
              <div className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">
                {detail.data?.email.messageText ?? t("Message unavailable.")}
              </div>
            </>
          )}
        </section>
      )}
    </article>
  );
}

export function PartnerEmailHistoryDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [revision, setRevision] = useState(0);
  const query = useInfiniteQuery({
    queryKey: [...PARTNER_EMAIL_HISTORY_QUERY_KEY, "list", revision],
    initialPageParam: undefined as string | undefined,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      return sdkFetch<PartnerEmailHistoryPage>(
        `${PARTNERS_API_ROUTE}/sent-email-log?${params}`,
        { signal },
      );
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const emails = query.data?.pages.flatMap((page) => page.emails) ?? [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-violet-50 via-fuchsia-50/50 to-sky-50 p-5 pr-12 dark:from-violet-950/40 dark:via-fuchsia-950/20 dark:to-sky-950/30 sm:px-6">
          <DialogTitle className="flex items-center gap-3 font-heading text-xl font-semibold">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
              <Mail className="size-5" />
            </span>
            {t("All emails sent")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("Every email recorded from Partners.")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={query.isFetching}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw
                className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
              {t("Refresh")}
            </Button>
          </div>
          {query.isPending && (
            <p
              role="status"
              className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              {t("Loading sent emails...")}
            </p>
          )}
          {query.isError && (
            <div
              role="alert"
              className="space-y-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <p>{t("Failed to load sent emails.")}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void (query.isFetchNextPageError
                    ? query.fetchNextPage()
                    : query.refetch())
                }
              >
                {t("Retry")}
              </Button>
            </div>
          )}
          {!query.isPending && !query.isError && !emails.length && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("No emails have been sent from Partners yet.")}
            </p>
          )}
          {emails.map((email) => (
            <HistoryEmail key={email.requestId} email={email} />
          ))}
          {query.hasNextPage && !query.isError && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={query.isFetching}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {t("Load more")}
              </Button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end border-t bg-background p-4 sm:px-6">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            {t("Finish")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
