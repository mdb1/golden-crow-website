import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { PatientConsentUploadWizard } from "@/components/patient-consent-upload-wizard";
import { Button } from "@/components/ui/button";
import type { MyAccountRecord } from "@/lib/admin-areas";
import type {
  InformedConsentDraftRecord,
  InformedConsentDraftSummary,
} from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

function one(value: string | string[] | undefined) {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected?.trim().toLowerCase();
}

export default async function PatientPortalNewConsentPage({
  searchParams,
}: {
  searchParams?: Promise<{ draft?: string | string[] }>;
}) {
  const draftParam = one((await searchParams)?.draft);
  const shouldRestoreDraft =
    draftParam === "1" || draftParam === "true" || draftParam === "yes";
  const [{ account }, draftResult] = await Promise.all([
    sdkFetchServer<{ account: MyAccountRecord }>("/auth/my-account"),
    shouldRestoreDraft
      ? sdkFetchServer<{ draft: InformedConsentDraftRecord | null }>(
          "/2pq/informed-consents/draft",
        )
          .then(({ draft }) => ({
            draft,
            revision: draft?.revision ?? null,
            restoreFailed: false as const,
            statusFailed: false as const,
          }))
          .catch(async () => {
            try {
              const { draft } = await sdkFetchServer<{
                draft: InformedConsentDraftSummary | null;
              }>("/2pq/informed-consents/draft/status");
              return {
                draft: null,
                revision: draft?.revision ?? null,
                restoreFailed: true as const,
                statusFailed: false as const,
              };
            } catch {
              return {
                draft: null,
                revision: null,
                restoreFailed: true as const,
                statusFailed: true as const,
              };
            }
          })
      : sdkFetchServer<{ draft: InformedConsentDraftSummary | null }>(
          "/2pq/informed-consents/draft/status",
        )
          .then(({ draft }) => ({
            draft: null,
            revision: draft?.revision ?? null,
            restoreFailed: false as const,
            statusFailed: false as const,
          }))
          .catch(() => ({
            draft: null,
            revision: null,
            restoreFailed: false as const,
            statusFailed: true as const,
          })),
  ]);
  const initialPatientName =
    account.role?.patientName?.trim() ||
    account.profile?.fullName?.trim() ||
    account.role?.displayName?.trim() ||
    account.auth.displayName?.trim() ||
    "";
  const restoreBlocked = shouldRestoreDraft && draftResult.restoreFailed;

  return (
    <div className="space-y-4">
      {restoreBlocked ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <p className="font-semibold">No se pudo recuperar el borrador.</p>
          <p className="mt-1">
            {draftResult.statusFailed
              ? "Tampoco pudimos verificar su última revisión."
              : draftResult.revision !== null
                ? "Pudimos verificar que el borrador sigue existiendo, pero no recuperar su contenido completo."
                : "La consulta de estado respondió, pero no pudimos validar el contenido completo solicitado."}{" "}
            Para evitar sobrescribir un avance más reciente, reintente la carga
            o vuelva a Consentimientos.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/patient-portal/consents/new?draft=1">
                <RefreshCw className="size-4" />
                Reintentar
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/patient-portal/consents">
                <ArrowLeft className="size-4" />
                Volver a consentimientos
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
      {!restoreBlocked && shouldRestoreDraft && !draftResult.draft ? (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"
        >
          El borrador que intentó retomar ya no existe. Puede iniciar un
          consentimiento nuevo.
        </div>
      ) : null}
      {!restoreBlocked ? (
        <PatientConsentUploadWizard
          initialPatientName={initialPatientName}
          initialDraft={draftResult.draft}
          initialDraftRevision={draftResult.revision}
        />
      ) : null}
    </div>
  );
}
