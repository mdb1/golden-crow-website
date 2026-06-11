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
import type { PatientListItem } from "@/lib/admin-areas";
import {
  canDeletePatientUi,
  canEditPatientUi,
  getStatusBadgeVariant,
} from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { compactList, formatDateTime } from "@/lib/moderation-utils";

export function PatientBrowser({
  initialPatients,
}: {
  initialPatients: PatientListItem[];
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [query, setQuery] = useState("");
  const { data, isFetching, isLoading, refetch, error } = useQuery({
    queryKey: ["areas", "patients"],
    queryFn: () => sdkFetch<{ patients: PatientListItem[] }>("/areas/patients"),
    initialData: { patients: initialPatients },
  });

  const patients = data?.patients ?? [];
  const filteredPatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return patients;
    }

    return patients.filter((patient) =>
      [
        patient.id,
        patient.fullName,
        patient.email,
        patient.medicalRecordNumber,
        patient.institutionName,
        patient.doctorName,
        patient.doctorEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [patients, query]);

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
          {t("Failed to load patients. Confirm the SDK is running and retry.")}
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
            placeholder={t("Search patients by id, name, email, MRN, doctor, or institution...")}
            className="pl-9"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t("Showing")} {filteredPatients.length} {t("patients")}</span>
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
          <span>{t("Patient")}</span>
          <span>{t("Status")}</span>
          <span>{t("Updated")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredPatients.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No patients match the current filter.")}
          </div>
        ) : (
          filteredPatients.map((patient) => (
            <div
              key={patient.id}
              className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_180px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-foreground">{patient.fullName}</h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {patient.id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([
                    patient.email,
                    patient.medicalRecordNumber,
                    patient.doctorName,
                    patient.institutionName,
                  ]) || t("Patient record")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={getStatusBadgeVariant(patient.status)}>
                  {t(patient.status)}
                </Badge>
                <Badge variant="outline">{patient.doctorName ?? t("No doctor")}</Badge>
                {canEditPatientUi(adminContext, patient) ? (
                  <Badge variant="brand">{t("Editable")}</Badge>
                ) : (
                  <Badge variant="warning">{t("Read only")}</Badge>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                {formatDateTime(patient.updatedAt) ?? t("No timestamp")}
              </div>

              <div className="flex gap-2 lg:justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/areas/patients/${patient.id}`}>
                    {canEditPatientUi(adminContext, patient) ? t("Open") : t("Inspect")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <AreaDeleteDialog
                  kind="patient"
                  id={patient.id}
                  name={patient.fullName}
                  endpoint={`/areas/patients/${patient.id}`}
                  disabled={!canDeletePatientUi(adminContext, patient)}
                  disabledReason={t("Current role cannot delete this patient.")}
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
