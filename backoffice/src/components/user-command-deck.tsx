"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { VerifiedUserBadge } from "@/components/verified-user-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { sdkFetch } from "@/lib/sdk-client";
import type { AdminUserRecord } from "@/lib/moderation-types";
import { formatDateTime } from "@/lib/moderation-utils";
import { toVerificationSummary } from "@/lib/user-verification";

export function UserCommandDeck() {
  const [query, setQuery] = useState("");

  const { data, error, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () =>
      sdkFetch<{ users: AdminUserRecord[]; nextPageToken?: string }>("/users"),
  });

  const users = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const records = data?.users ?? [];

    if (!normalizedQuery) {
      return records;
    }

    return records.filter((user) =>
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
  }, [data?.users, query]);

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
      <div className="glass-panel px-4 py-4 text-sm text-destructive">
        Failed to load account moderation records.
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <label className="relative block w-full max-w-lg">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by uid, email, name, condition, or patient id..."
          className="pl-9"
        />
      </label>

      <div className="glass-panel overflow-hidden">
        {users.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No users match the current search.
          </div>
        ) : (
          users.map((user) => {
            const userHref = `/users/${encodeURIComponent(user.uid)}`;

            return (
              <div
                key={user.uid}
                className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_160px_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={userHref}
                      className="font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {user.displayName || user.email || user.uid}
                    </Link>
                    <VerifiedUserBadge summary={toVerificationSummary(user)} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {user.uid}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {user.email}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant={user.disabled ? "destructive" : "success"}>
                    {user.disabled ? "Disabled" : "Active"}
                  </Badge>
                  <Badge variant={user.onboardingCompleted ? "success" : "warning"}>
                    {user.onboardingCompleted ? "Onboarded" : "Needs onboarding"}
                  </Badge>
                </div>

                <div className="text-sm text-muted-foreground">
                  <p>{formatDateTime(user.lastSignInAt) ?? "No sign-in yet"}</p>
                  <p className="mt-1">
                    {[user.country, user.conditions[0]].filter(Boolean).join(" • ") ||
                      "No profile hints"}
                  </p>
                </div>

                <div className="flex lg:justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={userHref}>
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
