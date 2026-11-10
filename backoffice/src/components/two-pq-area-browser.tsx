"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCcw, Search } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { TwoPQCaseDeleteDialog } from "@/components/two-pq-case-delete-dialog";
import { TwoPQRecordDeleteDialog } from "@/components/two-pq-record-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { sdkFetch } from "@/lib/sdk-client";
import {
  type TwoPQAreaKey,
  type TwoPQListItem,
  getTwoPQAreaConfig,
  getTwoPQRecordSubtitle,
  getTwoPQRecordTitle,
  getTwoPQStatusPills,
  translateTwoPQAreaConfig,
} from "@/lib/two-pq-areas";
import { appText } from "@/lib/language";
import { formatDateTime } from "@/lib/moderation-utils";
import { cn } from "@/lib/utils";
import { isGlobalAdminRole } from "@/lib/admin-areas";
import { getTwoPQStudySummary } from "@/lib/two-pq-study-summary";

type RecordsPage = { records: TwoPQListItem[]; nextCursor: string | null; hasMore: boolean };

function caseBoxCode(record: TwoPQListItem) {
  const code = record.three_letter_code?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{3}$/.test(code)) return code;
  const label = record.caseLabel?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}(?:XXX)?$/.test(label) ? label.slice(0, 3) : "—";
}

export function TwoPQAreaBrowser({
  areaKey,
  initialRecords,
  createdId,
  initialCursor = null,
  initialHasMore = false,
}: {
  areaKey: TwoPQAreaKey;
  initialRecords: TwoPQListItem[];
  createdId?: string;
  initialCursor?: string | null;
  initialHasMore?: boolean;
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const area = translateTwoPQAreaConfig(getTwoPQAreaConfig(areaKey)!, language);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [animatedRecordId, setAnimatedRecordId] = useState<string | null>(null);
  const previousRecordIdsRef = useRef<Set<string>>(new Set(initialRecords.map((record) => record.id)));
  const recordRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { data, isFetching, isLoading, refetch, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["2pq", area.key, appliedQuery],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ paginated: "1", limit: "20" });
      if (appliedQuery) params.set("query", appliedQuery);
      if (pageParam) params.set("cursor", pageParam);
      return sdkFetch<RecordsPage>(`/2pq/${area.key}?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor : undefined,
    initialData: appliedQuery ? undefined : { pages: [{ records: initialRecords, nextCursor: initialCursor, hasMore: initialHasMore }], pageParams: [null] },
  });
  const records = useMemo(() => data?.pages.flatMap((page) => page.records) ?? [], [data?.pages]);
  const createdRecordPresent = Boolean(
    createdId && records.some((record) => record.id === createdId)
  );

  useEffect(() => {
    if (!createdId || createdRecordPresent) {
      return;
    }

    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      void refetch();
      if (attempts >= 5) {
        window.clearInterval(intervalId);
      }
    }, 1100);

    return () => window.clearInterval(intervalId);
  }, [createdId, createdRecordPresent, refetch]);

  useEffect(() => {
    const nextIds = new Set(records.map((record) => record.id));
    const previousIds = previousRecordIdsRef.current;

    if (createdId && nextIds.has(createdId) && !previousIds.has(createdId)) {
      setAnimatedRecordId(createdId);
      const scrollTimeout = window.setTimeout(() => {
        recordRefs.current[createdId]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 140);
      const clearHighlightTimeout = window.setTimeout(() => {
        setAnimatedRecordId((current) => (current === createdId ? null : current));
      }, 2400);
      previousRecordIdsRef.current = nextIds;

      return () => {
        window.clearTimeout(scrollTimeout);
        window.clearTimeout(clearHighlightTimeout);
      };
    }

    previousRecordIdsRef.current = nextIds;
  }, [createdId, records]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={area.searchPlaceholder}
            className="pl-9"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t("Showing")} {records.length} {t("records")}</span>
          {createdId && !createdRecordPresent ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/28 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-100">
              <RefreshCcw className="h-3 w-3 animate-spin" />
              {t("Syncing new record")}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            {isFetching ? t("Refreshing") : t("Refresh")}
          </Button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        {area.key === "cases" ? (
          <div className="hidden grid-cols-[90px_140px_80px_minmax(110px,1fr)_minmax(150px,1.5fr)_minmax(150px,1.5fr)_auto] gap-3 border-b border-border/80 px-4 py-3 text-xs font-medium text-muted-foreground xl:grid">
            <span>{t("Code")}</span><span>{t("Study type")}</span><span>{t("Biopsy count")}</span><span>{t("State")}</span><span>{t("Patient")}</span><span>{t("Referring institution")}</span><span>{t("Action")}</span>
          </div>
        ) : <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_180px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>{area.label}</span>
          <span>{t("State")}</span>
          <span>{t("Updated")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>}

        {error ? (
          <div className="flex flex-col items-start gap-3 px-4 py-4">
            <p className="text-sm text-destructive">
              {t("Failed to load records. Confirm the SDK is running and retry.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("Retry")}</Button>
          </div>
        ) : isLoading ? (
          <div className="grid gap-3 p-4" aria-label={t("Loading...")}>
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}
          </div>
        ) : records.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {hasNextPage ? t("No matches on this page. Load more to continue.") : t("No records match the current filter.")}
          </div>
        ) : (
          records.map((record) => {
            const study = area.key === "cases" ? getTwoPQStudySummary(record) : null;
            return (
            <div
              key={record.id}
              ref={(node) => {
                recordRefs.current[record.id] = node;
              }}
              className={cn(
                "grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:items-center",
                area.key === "cases" ? "xl:grid-cols-[90px_140px_80px_minmax(110px,1fr)_minmax(150px,1.5fr)_minmax(150px,1.5fr)_auto]" : "lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_180px_auto]",
                animatedRecordId === record.id
                  ? "animate-in fade-in-0 slide-in-from-bottom-4 zoom-in-95 duration-700 bg-emerald-500/8 ring-1 ring-inset ring-emerald-400/35"
                  : ""
              )}
            >
              {area.key === "cases" ? <>
                <h3 className="font-mono text-lg font-semibold">{caseBoxCode(record)}</h3>
                <div>{study ? <Badge className={study.className}>{study.label}</Badge> : record.requestedTestName || record.caseType || "—"}</div>
                <div className="text-sm"><span className="mr-1 text-muted-foreground xl:hidden">{t("Biopsy count")}:</span>{record.biopsyCount ?? "—"}</div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">{t(record.caseStatus || "Unknown")}</Badge>
                  {!record.canUpdate ? <Badge variant="warning">{t("Read only")}</Badge> : null}
                </div>
                <div className="text-base font-semibold">{record.patientName || record.patientId || "—"}</div>
                <div className="text-sm">{record.institutionName || record.institutionId}</div>
              </> : <>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-foreground">
                    {getTwoPQRecordTitle(area, record)}
                  </h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {record.id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {getTwoPQRecordSubtitle(area, record) || t("2PQ record")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {getTwoPQStatusPills(record).map((pill) => (
                  <Badge key={pill} variant="outline">
                    {t(pill)}
                  </Badge>
                ))}
                {record.canReplace ? (
                  <Badge variant="brand">{t("Replace")}</Badge>
                ) : null}
                {record.canUpdate ? (
                  <Badge variant="success">{t("Update")}</Badge>
                ) : null}
                {record.canDelete ? (
                  <Badge variant="destructive">{t("Delete")}</Badge>
                ) : (
                  <Badge variant="warning">{t("Read only")}</Badge>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                {formatDateTime(record.updatedAt) ?? t("No timestamp")}
              </div>

              </>}
              <div className="flex items-center gap-2 lg:justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${area.route}/${record.id}`}>
                    {t("Open")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                {area.key === "cases" &&
                record.canDelete &&
                isGlobalAdminRole(adminContext.role) ? (
                  <TwoPQCaseDeleteDialog
                    caseId={record.id}
                    caseLabel={record.caseLabel}
                    onFinished={() => void refetch()}
                  />
                ) : null}
                {(area.key === "sampling" || area.key === "sequencing") &&
                record.canDelete &&
                isGlobalAdminRole(adminContext.role) ? (
                  <TwoPQRecordDeleteDialog
                    areaKey={area.key}
                    recordId={record.id}
                    recordLabel={getTwoPQRecordTitle(area, record)}
                    onFinished={() => void refetch()}
                  />
                ) : null}
              </div>
            </div>
            );
          })
        )}
      </div>
      {hasNextPage ? <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage ? t("Loading...") : t("Load more")}</Button> : null}
    </section>
  );
}
