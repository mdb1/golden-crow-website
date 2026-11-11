import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { PatientConsentUploadWizard } from "@/components/patient-consent-upload-wizard";
import { Button } from "@/components/ui/button";
import type { MyAccountRecord } from "@/lib/admin-areas";
import {
  INFORMED_CONSENT_REQUEST_STATUS_LABELS,
  canPatientUploadConsent,
  informedConsentDraftPath,
  informedConsentFileHref,
  patientConsentUploadHref,
  type InformedConsentDraftRecord,
  type InformedConsentStudyRequest,
} from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

function BackToConsents() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href="/patient-portal/consents">
        <ArrowLeft className="size-4" />
        Volver a consentimientos
      </Link>
    </Button>
  );
}

export default async function PatientPortalNewConsentPage({
  searchParams,
}: {
  searchParams?: Promise<{ studyRequestFormId?: string | string[] }>;
}) {
  const formId = (await searchParams)?.studyRequestFormId;
  const studyRequestFormId = typeof formId === "string" ? formId.trim() : "";
  if (!studyRequestFormId) {
    return (
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-heading text-lg font-semibold">Seleccione la solicitud de estudio</h2>
        <BackToConsents />
      </section>
    );
  }

  const requestPayload = await sdkFetchServer<{ request: InformedConsentStudyRequest }>(
    `/2pq/informed-consents/study-requests/${encodeURIComponent(studyRequestFormId)}`,
  ).catch(() => null);
  if (!requestPayload || requestPayload.request.id !== studyRequestFormId) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border p-4">
        <p>No se pudo abrir esta solicitud de estudio.</p>
        <BackToConsents />
      </div>
    );
  }

  const { request } = requestPayload;
  if (!canPatientUploadConsent(request)) {
    return (
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="font-heading text-lg font-semibold">Solicitud {request.id}</h2>
        <p>Consentimiento informado · {INFORMED_CONSENT_REQUEST_STATUS_LABELS[request.consent.status]}</p>
        <div className="flex flex-wrap gap-2">
          <BackToConsents />
          {request.consent.id ? (
            <Button asChild size="sm">
              <a href={informedConsentFileHref(request.consent.id)} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Ver consentimiento
              </a>
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  const [accountPayload, draftResult] = await Promise.all([
    sdkFetchServer<{ account: MyAccountRecord }>("/auth/my-account"),
    sdkFetchServer<{ draft: InformedConsentDraftRecord | null }>(
      informedConsentDraftPath(request.id),
    )
      .then(({ draft }) => {
        if (draft && (draft.studyRequestFormId !== request.id || draft.patientId !== request.patientId)) {
          return { failed: true as const };
        }
        return { draft, failed: false as const };
      })
      .catch(() => ({ failed: true as const })),
  ]);

  if (draftResult.failed) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
        <p className="font-semibold">No se pudo recuperar el borrador de esta solicitud.</p>
        <p>Reintente la carga para conservar su avance.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={patientConsentUploadHref(request.id)}>
              <RefreshCw className="size-4" />
              Reintentar
            </Link>
          </Button>
          <BackToConsents />
        </div>
      </div>
    );
  }

  return (
    <PatientConsentUploadWizard
      key={request.id}
      initialStudyRequest={request}
      initialPatientName={request.patientName}
      initialPatientDocument={accountPayload.account.role?.patientMedicalRecordNumber?.trim() || ""}
      initialDraft={draftResult.draft}
    />
  );
}
