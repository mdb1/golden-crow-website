"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCcw, Search } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
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

export function TwoPQAreaBrowser({
  areaKey,
  initialRecords,
  createdId,
}: {
  areaKey: TwoPQAreaKey;
  initialRecords: TwoPQListItem[];
  createdId?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const area = translateTwoPQAreaConfig(getTwoPQAreaConfig(areaKey)!, language);
  const [query, setQuery] = useState("");
  const [animatedRecordId, setAnimatedRecordId] = useState<string | null>(null);
  const previousRecordIdsRef = useRef<Set<string>>(new Set(initialRecords.map((record) => record.id)));
  const recordRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { data, isFetching, isLoading, refetch, error } = useQuery({
    queryKey: ["2pq", area.key],
    queryFn: () => sdkFetch<{ records: TwoPQListItem[] }>(`/2pq/${area.key}`),
    initialData: { records: initialRecords },
  });
  const createdRecordPresent = Boolean(
    createdId && data?.records.some((record) => record.id === createdId)
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
    const nextIds = new Set((data?.records ?? []).map((record) => record.id));
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
  }, [createdId, data?.records]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const records = data?.records ?? [];

    if (!normalizedQuery) {
      return records;
    }

    return records.filter((record) => {
      const haystack = [
        record.id,
        getTwoPQRecordTitle(area, record),
        getTwoPQRecordSubtitle(area, record),
        record.institutionName,
        record.doctorName,
        record.patientName,
        ...getTwoPQStatusPills(record),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [area, data?.records, query]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full max-w-lg" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel flex flex-col gap-3 px-4 py-4">
        <p className="text-sm text-destructive">
          {t("Failed to load records. Confirm the SDK is running and retry.")}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          {t("Retry")}
        </Button>
      </div>
    );
  }

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
          <span>{t("Showing")} {filteredRecords.length} {t("records")}</span>
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
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_180px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>{area.label}</span>
          <span>{t("State")}</span>
          <span>{t("Updated")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No records match the current filter.")}
          </div>
        ) : (
          filteredRecords.map((record) => (
            <div
              key={record.id}
              ref={(node) => {
                recordRefs.current[record.id] = node;
              }}
              className={cn(
                "grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_180px_auto] lg:items-center",
                animatedRecordId === record.id
                  ? "animate-in fade-in-0 slide-in-from-bottom-4 zoom-in-95 duration-700 bg-emerald-500/8 ring-1 ring-inset ring-emerald-400/35"
                  : ""
              )}
            >
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

              <div className="flex lg:justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${area.route}/${record.id}`}>
                    {t("Open")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
