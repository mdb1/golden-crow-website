"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCcw, Search } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { AreaDeleteDialog } from "@/components/areas/area-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { sdkFetch } from "@/lib/sdk-client";
import type { DoctorListItem } from "@/lib/admin-areas";
import {
  canDeleteDoctorUi,
  canEditDoctorUi,
  getStatusBadgeVariant,
} from "@/lib/areas-ui";
import { compactList, formatDateTime } from "@/lib/moderation-utils";

export function DoctorBrowser({
  initialDoctors,
}: {
  initialDoctors: DoctorListItem[];
}) {
  const adminContext = useAdminContext();
  const [query, setQuery] = useState("");
  const { data, isFetching, isLoading, refetch, error } = useQuery({
    queryKey: ["areas", "doctors"],
    queryFn: () => sdkFetch<{ doctors: DoctorListItem[] }>("/areas/doctors"),
    initialData: { doctors: initialDoctors },
  });

  const doctors = data?.doctors ?? [];
  const filteredDoctors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return doctors;
    }

    return doctors.filter((doctor) =>
      [
        doctor.id,
        doctor.fullName,
        doctor.authEmail,
        doctor.specialty,
        doctor.licenseNumber,
        doctor.institutionName,
        doctor.roleEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [doctors, query]);

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
          Failed to load doctors. Confirm the SDK is running and retry.
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search doctors by id, name, email, institution, or license..."
            className="pl-9"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Showing {filteredDoctors.length} doctors</span>
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
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_180px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>Doctor</span>
          <span>Status</span>
          <span>Updated</span>
          <span className="text-right">Action</span>
        </div>

        {filteredDoctors.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No doctors match the current filter.
          </div>
        ) : (
          filteredDoctors.map((doctor) => (
            <div
              key={doctor.id}
              className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_180px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-foreground">{doctor.fullName}</h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {doctor.id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([
                    doctor.authEmail,
                    doctor.specialty,
                    doctor.licenseNumber,
                    doctor.institutionName,
                  ]) || "Doctor record"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={getStatusBadgeVariant(doctor.status)}>
                  {doctor.status}
                </Badge>
                <Badge variant="outline">{doctor.patientCount} patients</Badge>
                {doctor.roleEmail ? (
                  <Badge variant={doctor.roleActive ? "brand" : "warning"}>
                    {doctor.roleActive ? "Role active" : "Role inactive"}
                  </Badge>
                ) : (
                  <Badge variant="warning">No role</Badge>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                {formatDateTime(doctor.updatedAt) ?? "No timestamp"}
              </div>

              <div className="flex gap-2 lg:justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/areas/doctors/${doctor.id}`}>
                    {canEditDoctorUi(adminContext, doctor) ? "Open" : "Read only"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <AreaDeleteDialog
                  kind="doctor"
                  id={doctor.id}
                  name={doctor.fullName}
                  endpoint={`/areas/doctors/${doctor.id}`}
                  disabled={!canDeleteDoctorUi(adminContext, doctor)}
                  disabledReason="Only full admins and institution admins can delete doctors in scope."
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
