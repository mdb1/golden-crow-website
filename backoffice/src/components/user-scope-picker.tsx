"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCcw, Search, Users } from "lucide-react";
import { VerifiedUserBadge } from "@/components/verified-user-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { sdkFetch } from "@/lib/sdk-client";
import type { AdminUserRecord } from "@/lib/moderation-types";
import { compactList, formatDateTime } from "@/lib/moderation-utils";
import { toVerificationSummary } from "@/lib/user-verification";

type ScopeMode = "reports" | "learning" | "public-profiles";

interface UsersPage {
  users: AdminUserRecord[];
  nextPageToken?: string;
}

const SCOPE_LABELS: Record<ScopeMode, string> = {
  reports: "reports",
  learning: "learning",
  "public-profiles": "public profiles",
};

function getUserScopeRow(user: AdminUserRecord, scope: ScopeMode) {
  if (scope === "reports") {
    return {
      href: `/reports/users/${user.uid}`,
      actionLabel: "Open reports",
      subtitle:
        compactList([
          user.email,
          user.country,
          user.patientID ? `Patient ${user.patientID}` : undefined,
        ]) || user.uid,
      timestamp:
        formatDateTime(user.lastReportDate) ??
        formatDateTime(user.lastSignInAt) ??
        "No report activity",
      badges: [
        {
          label: user.linkedRecords?.reportOwner ? "Owner record" : "No owner record",
          variant: user.linkedRecords?.reportOwner ? "success" : "warning",
        },
        {
          label: user.lastReportDate ? "Report date set" : "No report date",
          variant: user.lastReportDate ? "brand" : "outline",
        },
      ] as const,
    };
  }

  if (scope === "public-profiles") {
    const hasPublicProfile = Boolean(user.linkedRecords?.publicProfile);
    return {
      href: hasPublicProfile ? `/collections/public_profiles/${user.uid}` : undefined,
      actionLabel: hasPublicProfile ? "Open profile" : "No profile",
      subtitle:
        compactList([
          user.email,
          user.country,
          user.conditions[0],
        ]) || user.uid,
      timestamp: formatDateTime(user.lastSignInAt) ?? "No sign-in yet",
      badges: [
        {
          label: hasPublicProfile ? "Public profile present" : "No public profile",
          variant: hasPublicProfile ? "success" : "warning",
        },
        {
          label: user.linkedRecords?.communityUser ? "Community user" : "No community user",
          variant: user.linkedRecords?.communityUser ? "brand" : "outline",
        },
      ] as const,
    };
  }

  return {
    href: `/learning/users/${user.uid}`,
    actionLabel: "Open learning",
    subtitle:
      compactList([user.email, user.country, user.conditions[0]]) || user.uid,
    timestamp: formatDateTime(user.lastSignInAt) ?? "No sign-in yet",
    badges: [
      {
        label: user.linkedRecords?.userProgress ? "Progress record" : "No progress",
        variant: user.linkedRecords?.userProgress ? "success" : "warning",
      },
      {
        label: user.onboardingCompleted ? "Onboarded" : "Needs onboarding",
        variant: user.onboardingCompleted ? "brand" : "warning",
      },
    ] as const,
  };
}

export function UserScopePicker({ scope }: { scope: ScopeMode }) {
  const [query, setQuery] = useState("");

  const {
    data,
    error,
    hasNextPage,
    fetchNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["user-scope-picker", scope],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      sdkFetch<UsersPage>(
        pageParam ? `/users?pageToken=${encodeURIComponent(pageParam)}` : "/users"
      ),
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
  });

  const users = useMemo(
    () => data?.pages.flatMap((page) => page.users) ?? [],
    [data?.pages]
  );

  const scopedUsers = useMemo(() => {
    if (scope === "public-profiles") {
      return users.filter(
        (user) => user.linkedRecords?.communityUser || user.linkedRecords?.publicProfile
      );
    }

    if (scope === "reports" && !query.trim()) {
      return users.filter((user) => user.linkedRecords?.reportOwner || user.lastReportDate);
    }

    return users;
  }, [query, scope, users]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return scopedUsers;
    }

    return scopedUsers.filter((user) =>
      [
        user.uid,
        user.email,
        user.displayName,
        user.country,
        user.patientID,
        ...user.conditions,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, scopedUsers]);

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
          Failed to load user records for {SCOPE_LABELS[scope]}. Confirm the SDK is running and
          retry.
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
            placeholder={`Search users for ${SCOPE_LABELS[scope]} by uid, email, name, condition, or country...`}
            className="pl-9"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing {filteredUsers.length} of {scopedUsers.length} scoped users
            {scope === "reports" && !query.trim() ? " with report state first" : ""}
            {scope === "public-profiles" ? " with community presence" : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            {isFetching && !isFetchingNextPage ? "Refreshing" : "Refresh"}
          </Button>
          {hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              <Users className="h-3.5 w-3.5" />
              {isFetchingNextPage ? "Loading more" : "Load more"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_180px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>User</span>
          <span>Status</span>
          <span>Activity</span>
          <span className="text-right">Action</span>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No loaded users match the current filter.
            {hasNextPage ? " Load more users to continue searching." : ""}
          </div>
        ) : (
          filteredUsers.map((user) => {
            const row = getUserScopeRow(user, scope);
            return (
              <div
                key={user.uid}
                className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_180px_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">
                      {user.displayName || user.email || user.uid}
                    </h3>
                    <VerifiedUserBadge summary={toVerificationSummary(user)} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {user.uid}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {row.badges.map((badge) => (
                    <Badge
                      key={`${user.uid}-${badge.label}`}
                      variant={badge.variant}
                    >
                      {badge.label}
                    </Badge>
                  ))}
                </div>

                <div className="text-sm text-muted-foreground">{row.timestamp}</div>

                <div className="flex lg:justify-end">
                  {row.href ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={row.href}>
                        {row.actionLabel}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      {row.actionLabel}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
