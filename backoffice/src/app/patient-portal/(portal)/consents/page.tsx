import { InformedConsentsWorkbench } from "@/components/informed-consents-workbench";
import { PatientConsentStudyRequests } from "@/components/patient-consent-study-requests";
import type {
  InformedConsentPage,
  InformedConsentStudyRequestPage,
} from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PatientPortalConsentsPage() {
  const [initialPage, requestsPage] = await Promise.all([
    sdkFetchServer<InformedConsentPage>("/2pq/informed-consents"),
    sdkFetchServer<InformedConsentStudyRequestPage>(
      "/2pq/informed-consents/study-requests?limit=20",
    ).catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      {requestsPage ? (
        <PatientConsentStudyRequests initialPage={requestsPage} />
      ) : (
        <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">
          No se pudieron cargar las solicitudes de estudio.
        </p>
      )}
      <InformedConsentsWorkbench surface="patient-portal" initialPage={initialPage} />
    </div>
  );
}
