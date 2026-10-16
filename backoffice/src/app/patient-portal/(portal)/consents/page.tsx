import { InformedConsentsWorkbench } from "@/components/informed-consents-workbench";
import type {
  InformedConsentDraftSummary,
  InformedConsentPage,
} from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PatientPortalConsentsPage() {
  const [initialPage, draftStatus] = await Promise.all([
    sdkFetchServer<InformedConsentPage>("/2pq/informed-consents"),
    sdkFetchServer<{ draft: InformedConsentDraftSummary | null }>(
      "/2pq/informed-consents/draft/status",
    )
      .then(({ draft }) => ({ draft, failed: false as const }))
      .catch(() => ({ draft: null, failed: true as const })),
  ]);

  return (
    <InformedConsentsWorkbench
      surface="patient-portal"
      initialPage={initialPage}
      initialDraftSummary={draftStatus.draft}
      draftLookupFailed={draftStatus.failed}
    />
  );
}
