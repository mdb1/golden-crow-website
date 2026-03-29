"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { columns, DnaReport } from "@/app/(dashboard)/reports/columns";
import { ReportSourceFilter, SourceFilter } from "./report-source-filter";

export function ReportTable() {
  const [source, setSource] = useState<SourceFilter>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", source],
    queryFn: () =>
      sdkFetch<{ reports: DnaReport[]; hasMore: boolean }>(
        source !== "all" ? `/reports?source=${source}` : "/reports"
      ),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-[180px]" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load reports. Make sure the SDK is running.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ReportSourceFilter value={source} onSourceChange={setSource} />
      <DataTable columns={columns} data={data?.reports ?? []} />
    </div>
  );
}
