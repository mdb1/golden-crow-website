"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCcw, Search } from "lucide-react";
import { ReportPill } from "@/components/reports/report-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { sdkFetch } from "@/lib/sdk-client";
import type { AdminReportRecord } from "@/lib/moderation-types";
import {
  compactList,
  formatDateTime,
  formatReportFormat,
  formatReportStatus,
  getReportSourceMeta,
  getReportStatusColor,
} from "@/lib/moderation-utils";

type SortOption = "date" | "name" | "provider";

function getTimestamp(report: AdminReportRecord) {
  return report.createdAt ? new Date(report.createdAt).getTime() : 0;
}

function sortReports(reports: AdminReportRecord[], sortOption: SortOption) {
  switch (sortOption) {
    case "name":
      return [...reports].sort((left, right) =>
        (left.fileName ?? left.code).localeCompare(right.fileName ?? right.code)
      );
    case "provider":
      return [...reports].sort((left, right) => {
        const providerOrder = (left.providerName ?? "").localeCompare(right.providerName ?? "");
        if (providerOrder !== 0) {
          return providerOrder;
        }

        return (left.fileName ?? left.code).localeCompare(right.fileName ?? right.code);
      });
    default:
      return [...reports].sort((left, right) => getTimestamp(right) - getTimestamp(left));
  }
}

export function ReportCodesBrowser() {
  const [query, setQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("date");

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["report-codes-browser"],
    queryFn: () => sdkFetch<{ reports: AdminReportRecord[] }>("/reports"),
  });

  const displayedReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const reports = sortReports(data?.reports ?? [], sortOption);

    if (!normalizedQuery) {
      return reports;
    }

    return reports.filter((report) =>
      [
        report.code,
        report.fileName,
        report.providerName,
        report.providerFormat,
        report.trackingStatus,
        report.ownerName,
        report.ownerEmail,
        report.userId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [data?.reports, query, sortOption]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full max-w-2xl" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel flex flex-col gap-3 px-4 py-4">
        <p className="text-sm text-destructive">
          Failed to load report codes. Confirm the SDK is running and retry.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative block w-full max-w-2xl">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search report codes, patient names, providers, or owners..."
              className="pl-9"
            />
          </label>
          <Select
            value={sortOption}
            onValueChange={(value) => setSortOption(value as SortOption)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort reports" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Sort by date</SelectItem>
              <SelectItem value="name">Sort by name</SelectItem>
              <SelectItem value="provider">Sort by provider</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing {displayedReports.length} of {data?.reports.length ?? 0}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className="h-3.5 w-3.5" />
            {isFetching ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2.1fr)_minmax(0,1.5fr)_160px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>Report</span>
          <span>Metadata</span>
          <span>Updated</span>
          <span className="text-right">Action</span>
        </div>

        {displayedReports.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No reports match the current filter.
          </div>
        ) : (
          displayedReports.map((report) => {
            const sourceMeta = getReportSourceMeta(report.source);
            const formatLabel = formatReportFormat(report.providerFormat);
            const statusLabel = formatReportStatus(report.trackingStatus);
            const ownerHref = report.userId ? `/reports/users/${report.userId}` : null;
            const uploadHref = report.uploadedReportId
              ? `/reports/uploads/${report.uploadedReportId}`
              : null;

            return (
              <div
                key={report.id}
                className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.5fr)_160px_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">
                      {report.fileName ?? report.code}
                    </h3>
                    <span className="font-mono text-xs text-muted-foreground">
                      {report.id}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {compactList([
                      report.providerName ?? undefined,
                      formatLabel ?? undefined,
                      report.ownerName ?? report.ownerEmail ?? undefined,
                    ]) || "Linked uploaded report"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ReportPill label={report.code} color="#7A59A8" />
                    <ReportPill label={sourceMeta.label} color={sourceMeta.color} />
                    {statusLabel ? (
                      <ReportPill
                        label={statusLabel}
                        color={getReportStatusColor(report.trackingStatus)}
                      />
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {ownerHref ? (
                      <Link href={ownerHref} className="text-primary hover:underline">
                        Open owner
                      </Link>
                    ) : null}
                    {uploadHref ? (
                      <Link href={uploadHref} className="text-primary hover:underline">
                        Open uploaded report
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {formatLabel ? <ReportPill label={formatLabel} color="#4E8FBB" /> : null}
                  {report.uploadVersionCount ? (
                    <ReportPill
                      label={`v${report.uploadVersionCount}`}
                      color="#8E80B8"
                    />
                  ) : null}
                  {report.downloadUrl ? (
                    <ReportPill label="Download ready" color="#5FAE6A" />
                  ) : (
                    <ReportPill label="Awaiting upload" color="#FF9E2C" />
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  {formatDateTime(report.createdAt) ?? "No timestamp"}
                </div>

                <div className="flex lg:justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/reports/${report.id}?from=report-codes`}>
                      Open report
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
