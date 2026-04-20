"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, RefreshCcw, Search, X } from "lucide-react";
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
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import {
  compactList,
  formatDateTime,
} from "@/lib/moderation-utils";
import {
  formatStoredFileType,
  getStoredFileLinkedReportKey,
  isStoredFileOrphan,
  parseStoredFileRecord,
  validateStoredFileJson,
} from "@/lib/file-storage";

type SortOption = "date" | "name" | "creator";

function getTimestamp(document: ModerationDocumentRecord) {
  const file = parseStoredFileRecord(document);
  const candidate = file.lastModifiedDate ?? file.creationDate;
  return candidate ? new Date(candidate).getTime() : 0;
}

function sortDocuments(
  documents: ModerationDocumentRecord[],
  sortOption: SortOption
) {
  switch (sortOption) {
    case "name":
      return [...documents].sort((left, right) =>
        parseStoredFileRecord(left).fileName.localeCompare(
          parseStoredFileRecord(right).fileName
        )
      );
    case "creator":
      return [...documents].sort((left, right) => {
        const leftFile = parseStoredFileRecord(left);
        const rightFile = parseStoredFileRecord(right);
        const creatorOrder = leftFile.creatorEmail.localeCompare(rightFile.creatorEmail);
        if (creatorOrder !== 0) {
          return creatorOrder;
        }

        return leftFile.fileName.localeCompare(rightFile.fileName);
      });
    default:
      return [...documents].sort((left, right) => getTimestamp(right) - getTimestamp(left));
  }
}

export function FileStorageBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [deletedFileNotice, setDeletedFileNotice] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("deleted") !== "1") {
      return;
    }

    setDeletedFileNotice(searchParams.get("fileId") ?? "");
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("deleted");
    nextParams.delete("fileId");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["file-storage-browser"],
    queryFn: () => sdkFetch<{ documents: ModerationDocumentRecord[] }>("/file-storage"),
  });

  const displayedDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const documents = sortDocuments(data?.documents ?? [], sortOption);

    if (!normalizedQuery) {
      return documents;
    }

    return documents.filter((document) => {
      const file = parseStoredFileRecord(document);
      return [
        file.id,
        file.fileName,
        file.creatorEmail,
        file.fileType,
        getStoredFileLinkedReportKey(file),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [data?.documents, query, sortOption]);

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
          Failed to load stored files. Confirm the SDK is running and retry.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {deletedFileNotice !== null ? (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-300/70 bg-red-50/92 px-4 py-3 text-red-950 shadow-[0_14px_34px_rgba(239,68,68,0.12)] dark:border-red-400/28 dark:bg-red-950/28 dark:text-red-50">
          <div>
            <p className="text-sm font-semibold">File deleted</p>
            <p className="mt-1 text-sm text-red-950/82 dark:text-red-50/82">
              {deletedFileNotice
                ? `Stored file ${deletedFileNotice} was deleted successfully.`
                : "The stored file was deleted successfully."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setDeletedFileNotice(null)}
            className="h-8 w-8 shrink-0 rounded-full text-red-800 hover:bg-red-100/85 dark:text-red-100 dark:hover:bg-red-900/32"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss delete notice</span>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative block w-full max-w-2xl">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search stored files by name, id, creator email, type, or linked report..."
              className="pl-9"
            />
          </label>
          <Select
            value={sortOption}
            onValueChange={(value) => setSortOption(value as SortOption)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort files" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Sort by date</SelectItem>
              <SelectItem value="name">Sort by name</SelectItem>
              <SelectItem value="creator">Sort by creator</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing {displayedDocuments.length} of {data?.documents.length ?? 0} files
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className="h-3.5 w-3.5" />
            {isFetching ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2.1fr)_minmax(0,1.55fr)_160px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>Stored file</span>
          <span>Metadata</span>
          <span>Updated</span>
          <span className="text-right">Action</span>
        </div>

        {displayedDocuments.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No stored files match the current filter.
          </div>
        ) : (
          displayedDocuments.map((document) => {
            const file = parseStoredFileRecord(document);
            const linkedReportKey = getStoredFileLinkedReportKey(file);
            const isJsonValid = validateStoredFileJson(file.fileContent);

            return (
              <div
                key={file.id}
                className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.55fr)_160px_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{file.fileName}</h3>
                    <span className="font-mono text-xs text-muted-foreground">{file.id}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {compactList([
                      file.creatorEmail || undefined,
                      linkedReportKey ? `Report ${linkedReportKey}` : "Orphan",
                    ]) || "Stored file record"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ReportPill label={formatStoredFileType(file.fileType)} color="#4E8FBB" />
                    <ReportPill
                      label={isStoredFileOrphan(file) ? "Orphan" : "Linked"}
                      color={isStoredFileOrphan(file) ? "#FF9E2C" : "#5FAE6A"}
                    />
                    <ReportPill
                      label={isJsonValid ? "JSON valid" : "JSON invalid"}
                      color={isJsonValid ? "#5FAE6A" : "#E0403D"}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {linkedReportKey ? (
                    <Link
                      href={`/reports/${linkedReportKey}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Open report
                    </Link>
                  ) : null}
                  {file.creatorEmail ? (
                    <span className="text-sm text-muted-foreground">{file.creatorEmail}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">No creator email</span>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  {formatDateTime(file.lastModifiedDate ?? file.creationDate) ?? "No timestamp"}
                </div>

                <div className="flex lg:justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/collections/file_storage/${file.id}`}>
                      Open
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
