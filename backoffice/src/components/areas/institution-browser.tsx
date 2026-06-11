"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCcw, Search } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { AreaDeleteDialog } from "@/components/areas/area-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { sdkFetch } from "@/lib/sdk-client";
import type { InstitutionListItem } from "@/lib/admin-areas";
import { canDeleteInstitutionUi, canEditInstitutionUi } from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { compactList, formatDateTime } from "@/lib/moderation-utils";

export function InstitutionBrowser({
  initialInstitutions,
}: {
  initialInstitutions: InstitutionListItem[];
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [query, setQuery] = useState("");
  const { data, isFetching, isLoading, refetch, error } = useQuery({
    queryKey: ["areas", "institutions"],
    queryFn: () =>
      sdkFetch<{ institutions: InstitutionListItem[] }>("/areas/institutions"),
    initialData: { institutions: initialInstitutions },
  });

  const institutions = data?.institutions ?? [];
  const filteredInstitutions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return institutions;
    }

    return institutions.filter((institution) =>
      [
        institution.id,
        institution.code,
        institution.name,
        institution.legalName,
        institution.contactEmail,
        institution.city,
        institution.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [institutions, query]);

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
          {t("Failed to load institutions. Confirm the SDK is running and retry.")}
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
            placeholder={t("Search institutions by id, code, name, email, or city...")}
            className="pl-9"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t("Showing")} {filteredInstitutions.length} {t("institutions")}</span>
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
          <span>{t("Institution")}</span>
          <span>{t("Scope")}</span>
          <span>{t("Updated")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredInstitutions.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No institutions match the current filter.")}
          </div>
        ) : (
          filteredInstitutions.map((institution) => (
            <div
              key={institution.id}
              className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_180px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-foreground">{institution.name}</h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {institution.id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([
                    institution.code,
                    institution.legalName,
                    institution.contactEmail,
                    institution.city,
                    institution.country,
                  ]) || t("Institution record")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="brand">{institution.doctorCount} {t("doctors")}</Badge>
                <Badge variant="success">{institution.patientCount} {t("patients")}</Badge>
                <Badge variant="outline">
                  {institution.institutionAdminCount} {t("admins")}
                </Badge>
              </div>

              <div className="text-sm text-muted-foreground">
                {formatDateTime(institution.updatedAt) ?? t("No timestamp")}
              </div>

              <div className="flex gap-2 lg:justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/areas/institutions/${institution.id}`}>
                    {canEditInstitutionUi(adminContext, institution.id)
                      ? t("Open")
                      : t("Read only")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <AreaDeleteDialog
                  kind="institution"
                  id={institution.id}
                  name={institution.name}
                  endpoint={`/areas/institutions/${institution.id}`}
                  disabled={!canDeleteInstitutionUi(adminContext, institution.id)}
                  disabledReason={t("Only full admins can delete institution roots.")}
                  onDeleted={() => void refetch()}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
