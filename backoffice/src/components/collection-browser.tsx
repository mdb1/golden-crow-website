"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCcw, Search } from "lucide-react";
import { AdminBadge } from "@/components/admin-badge";
import { VerifiedUserBadge } from "@/components/verified-user-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { COLLECTIONS } from "@/lib/moderation-config";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  CollectionKey,
  ModerationDocumentRecord,
} from "@/lib/moderation-types";
import { flattenSearchValue, formatDateTime } from "@/lib/moderation-utils";
import {
  fetchUserVerificationSummaries,
  isIdentityCollectionKey,
} from "@/lib/user-verification";

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function augmentReportOwnerDocument(
  document: ModerationDocumentRecord,
  communityUser: ModerationDocumentRecord | undefined
): ModerationDocumentRecord {
  if (!communityUser) {
    return document;
  }

  return {
    ...document,
    data: {
      ...document.data,
      __community_username: getString(communityUser.data.username),
      __community_email: getString(communityUser.data.email),
      __community_icon_name:
        getString(communityUser.data.iconName) ??
        getString(communityUser.data.icon_name),
      __community_icon_color_hex:
        getString(communityUser.data.iconColorHex) ??
        getString(communityUser.data.icon_color_hex),
      __community_is_clinician:
        typeof communityUser.data.is_clinician === "boolean"
          ? communityUser.data.is_clinician
          : undefined,
      __community_is_activity_public:
        typeof communityUser.data.is_activity_public === "boolean"
          ? communityUser.data.is_activity_public
          : undefined,
      __community_posts_created:
        communityUser.data["stats.posts_created"] ??
        (typeof communityUser.data.stats === "object" &&
        communityUser.data.stats &&
        !Array.isArray(communityUser.data.stats)
          ? (communityUser.data.stats as Record<string, unknown>).posts_created
          : undefined),
      __community_updated_at: communityUser.data.updatedAt,
    },
  };
}

export function CollectionBrowser({
  collectionKey,
}: {
  collectionKey: CollectionKey;
}) {
  const collection = COLLECTIONS[collectionKey];
  const [query, setQuery] = useState("");

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["moderation", collectionKey],
    queryFn: () =>
      sdkFetch<{ documents: ModerationDocumentRecord[] }>(
        `/moderation/${collectionKey}`
      ),
  });
  const { data: communityUsersData } = useQuery({
    queryKey: ["moderation", "community_users"],
    queryFn: () =>
      sdkFetch<{ documents: ModerationDocumentRecord[] }>("/moderation/community_users"),
    enabled: collectionKey === "report_owners",
  });

  const communityUsersById = useMemo(
    () =>
      new Map(
        (communityUsersData?.documents ?? []).map((document) => [document.id, document])
      ),
    [communityUsersData?.documents]
  );
  const documentsForBrowse = useMemo(() => {
    const documents = data?.documents ?? [];

    if (collectionKey !== "report_owners") {
      return documents;
    }

    return documents.map((document) =>
      augmentReportOwnerDocument(document, communityUsersById.get(document.id))
    );
  }, [collectionKey, communityUsersById, data?.documents]);
  const identityDocumentIds = useMemo(
    () =>
      isIdentityCollectionKey(collectionKey)
        ? documentsForBrowse.map((document) => document.id)
        : [],
    [collectionKey, documentsForBrowse]
  );
  const { data: verificationSummaries, isLoading: isVerificationLoading } = useQuery({
    queryKey: ["user-verification-summaries", collectionKey, identityDocumentIds],
    queryFn: () => fetchUserVerificationSummaries(identityDocumentIds),
    enabled: identityDocumentIds.length > 0,
    staleTime: 30_000,
  });
  const verificationById = useMemo(
    () => new Map((verificationSummaries ?? []).map((summary) => [summary.uid, summary])),
    [verificationSummaries]
  );

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const documents = documentsForBrowse;

    if (!normalizedQuery) {
      return documents;
    }

    return documents.filter((document) =>
      `${document.id} ${flattenSearchValue(document.data)}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [documentsForBrowse, query]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full max-w-lg" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel flex flex-col gap-3 px-4 py-4">
        <p className="text-sm text-destructive">
          Failed to load {collection.title.toLowerCase()}. Confirm the SDK is
          running and the admin session is valid.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full max-w-lg">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${collection.title.toLowerCase()}...`}
            className="pl-9"
          />
        </label>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing {filteredDocuments.length} of {data?.documents.length ?? 0}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            {isFetching ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2.1fr)_minmax(0,1.25fr)_160px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>Document</span>
          <span>Metadata</span>
          <span>Updated</span>
          <span className="text-right">Action</span>
        </div>

        {filteredDocuments.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No records match the current filter.
          </div>
        ) : (
          filteredDocuments.map((document) => {
            const record = collection.getBrowseRecord(document);
            return (
              <div
                key={document.id}
                className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.25fr)_160px_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{record.title}</h3>
                    {isIdentityCollectionKey(collectionKey) ? (
                      <VerifiedUserBadge
                        summary={verificationById.get(document.id)}
                        loading={isVerificationLoading}
                      />
                    ) : null}
                    {record.code ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {record.code}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {record.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {record.badges.length > 0 ? (
                    record.badges.map((badge) => (
                      <AdminBadge
                        key={`${document.id}-${badge.label}`}
                        badge={badge}
                      />
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No flags</span>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  {formatDateTime(record.timestamp) ?? "No timestamp"}
                </div>

                <div className="flex lg:justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/collections/${collectionKey}/${document.id}`}>
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
