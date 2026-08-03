"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCcw, Search } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ADMIN_ROLE_LABELS,
  type RoleManagementRecord,
} from "@/lib/admin-areas";
import { getRoleBadgeVariant } from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";
import { compactList, formatDateTime } from "@/lib/moderation-utils";

export function RolesBrowser({
  initialRoles,
}: {
  initialRoles: RoleManagementRecord[];
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [query, setQuery] = useState("");
  const { data, isFetching, isLoading, refetch, error } = useQuery({
    queryKey: ["areas", "roles"],
    queryFn: () => sdkFetch<{ roles: RoleManagementRecord[] }>("/roles"),
    initialData: { roles: initialRoles },
  });

  const roles = data?.roles ?? [];
  const filteredRoles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return roles;
    }

    return roles.filter((record) =>
      [
        record.email,
        record.displayName,
        record.organizationName,
        record.organizationId,
        record.institutionName,
        record.doctorName,
        record.patientName,
        ADMIN_ROLE_LABELS[record.role],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, roles]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full max-w-lg" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel flex flex-col gap-3 px-4 py-4">
        <p className="text-sm text-destructive">
          {t("Failed to load role assignments. Confirm the SDK is running and retry.")}
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
            placeholder={t("Search roles by email, name, institution, doctor, or patient...")}
            className="pl-9"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t("Showing")} {filteredRoles.length} {t("role records")}</span>
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
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_180px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>{t("User email")}</span>
          <span>{t("Scope")}</span>
          <span>{t("Updated")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredRoles.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No role records match the current filter.")}
          </div>
        ) : (
          filteredRoles.map((record) => (
            <div
              key={record.email}
              className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_180px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-foreground">{record.email}</h3>
                  <Badge variant={getRoleBadgeVariant(record.role)}>
                    {t(ADMIN_ROLE_LABELS[record.role])}
                  </Badge>
                  {record.bootstrap ? <Badge variant="outline">Bootstrap</Badge> : null}
                  {record.isActive ? null : <Badge variant="warning">{t("Inactive")}</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([
                    record.displayName,
                    record.organizationName,
                    record.institutionName,
                    record.doctorName,
                    record.patientName,
                  ]) || t("Email-based role assignment")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {record.organizationId ? (
                  <Badge variant="secondary">{record.organizationId}</Badge>
                ) : record.institutionId ? (
                  <Badge variant="brand">{record.institutionId}</Badge>
                ) : (
                  <Badge variant="outline">{t("Global")}</Badge>
                )}
                {record.doctorId ? (
                  <Badge variant="success">{record.doctorId}</Badge>
                ) : null}
                {record.patientId ? (
                  <Badge variant="outline">{record.patientId}</Badge>
                ) : null}
              </div>

              <div className="text-sm text-muted-foreground">
                {formatDateTime(record.updatedAt) ?? t("No timestamp")}
              </div>

              <div className="flex lg:justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/roles/${encodeURIComponent(record.email)}`}>
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
