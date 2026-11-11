"use client";

import { ExternalLink, FileCheck2 } from "lucide-react";
import { useState } from "react";
import { ConsentRequestStatusBadge } from "@/components/consent-request-status-badge";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { TwoPQConsentApproval } from "@/components/two-pq-consent-approval";
import { Button } from "@/components/ui/button";
import {
  informedConsentFileHref,
  type InformedConsentRecord,
  type InformedConsentStudyRequest,
} from "@/lib/informed-consents";

export function InformedConsentDetailHeader({
  consentId,
  fileName,
  reviewStatus,
  reviewRequest,
}: {
  consentId: string;
  fileName: string;
  reviewStatus: InformedConsentRecord["reviewStatus"];
  reviewRequest: InformedConsentStudyRequest | null;
}) {
  const [approved, setApproved] = useState(false);
  const status = approved ? "ready" : (reviewRequest?.consent.status ?? reviewStatus);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <FileCheck2 className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="break-words font-heading text-xl font-semibold">
            {fileName}
          </h1>
          {status ? (
            <div className="mt-2">
              <ConsentRequestStatusBadge status={status} language="es" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        <div className="flex items-center gap-2">
          <HeaderUnclutterButton />
          <Button variant="outline" size="sm" asChild>
            <a href={informedConsentFileHref(consentId)} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Abrir archivo
            </a>
          </Button>
        </div>
        <TwoPQConsentApproval
          request={approved ? null : reviewRequest}
          language="es"
          onApproved={() => setApproved(true)}
        />
      </div>
    </div>
  );
}
