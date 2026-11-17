"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { PartnerEmailMessageDialog } from "./partner-email-history-dialog";
import { PARTNERS_API_ROUTE } from "@/lib/connected-partners";
import {
  PARTNER_EMAIL_HISTORY_QUERY_KEY,
  PARTNER_EMAIL_TEMPLATE_OPTIONS,
  type PartnerEmailHistoryPage,
  type PartnerEmailHistoryRecord,
} from "@/lib/partner-email";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";

export function PartnerContactHistory({ partnerId }: { partnerId: string }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [selected, setSelected] = useState<PartnerEmailHistoryRecord | null>(
    null,
  );
  const query = useInfiniteQuery({
    queryKey: [...PARTNER_EMAIL_HISTORY_QUERY_KEY, "contact", partnerId],
    initialPageParam: undefined as string | undefined,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: "20", partnerId });
      if (pageParam) params.set("cursor", pageParam);
      return sdkFetch<PartnerEmailHistoryPage>(
        `${PARTNERS_API_ROUTE}/sent-email-log?${params}`,
        { signal },
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const emails = query.data?.pages.flatMap((page) => page.emails) ?? [];
  const format = new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <section aria-label={t("Contact history")} className="space-y-2 pt-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t("Contact history")}</h4>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("Refresh contact history")}
          title={t("Refresh contact history")}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
      {query.isPending && (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3.5 animate-spin" />
          {t("Loading sent emails...")}
        </p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 text-xs text-destructive"
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
        <p className="text-xs text-muted-foreground">
          {t("No emails have been sent to this contact yet.")}
        </p>
      )}
      {emails.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {emails.map((email) => {
            const template = PARTNER_EMAIL_TEMPLATE_OPTIONS.find(
              (option) => option.key === email.templateVariant,
            );
            const date = email.sentAt ?? email.updatedAt;
            return (
              <li key={email.requestId}>
                <button
                  type="button"
                  onClick={() => setSelected(email)}
                  aria-label={`${t("View message")}: ${email.subject ?? t("No subject recorded")}`}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-xs font-medium"
                      title={email.subject ?? undefined}
                    >
                      {email.subject ?? t("No subject recorded")}
                    </span>
                    <span className="flex items-center gap-x-2 text-[11px] leading-4 text-muted-foreground">
                      <span className="min-w-0 truncate">
                        {template
                          ? t(template.label)
                          : t("Template not recorded")}
                      </span>
                      <time dateTime={date} className="shrink-0 whitespace-nowrap">
                        {format.format(new Date(date))}
                      </time>
                    </span>
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {query.hasNextPage && !query.isError && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full text-xs"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          {t("Load more")}
        </Button>
      )}
      {selected && (
        <PartnerEmailMessageDialog
          email={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
