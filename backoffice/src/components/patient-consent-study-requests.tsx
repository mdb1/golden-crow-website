"use client";

import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  INFORMED_CONSENT_REQUEST_STATUS_LABELS,
  patientConsentUploadHref,
  type InformedConsentStudyRequestPage,
} from "@/lib/informed-consents";
import { sdkFetch } from "@/lib/sdk-client";

export function PatientConsentStudyRequests({
  initialPage,
}: {
  initialPage: InformedConsentStudyRequestPage;
}) {
  const [requests, setRequests] = useState(initialPage.requests);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ cursor, limit: "20" });
      const page = await sdkFetch<InformedConsentStudyRequestPage>(
        `/2pq/informed-consents/study-requests?${params}`,
      );
      setRequests((current) => {
        const byId = new Map(current.map((request) => [request.id, request]));
        for (const request of page.requests) byId.set(request.id, request);
        return [...byId.values()];
      });
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="consent-requests-heading" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      <h2 id="consent-requests-heading" className="font-heading text-xl font-semibold">
        Solicitudes de estudio
      </h2>
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay solicitudes de estudio para firmar.
        </p>
      ) : (
        <ul className="divide-y">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{request.id}</p>
                  <Badge variant={request.consent.status === "ready" ? "secondary" : "outline"}>
                    {INFORMED_CONSENT_REQUEST_STATUS_LABELS[request.consent.status]}
                  </Badge>
                </div>
                {request.institutionName || request.doctorName ? (
                  <p className="text-sm text-muted-foreground">
                    {[request.institutionName, request.doctorName].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
              {request.canUpload ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={patientConsentUploadHref(request.id)}>
                    {request.consent.status === "needs_review"
                      ? "Reemplazar consentimiento"
                      : "Completar consentimiento"}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar más solicitudes.
        </p>
      ) : null}
      {cursor ? (
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void loadMore()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Cargar más solicitudes
        </Button>
      ) : null}
    </section>
  );
}
