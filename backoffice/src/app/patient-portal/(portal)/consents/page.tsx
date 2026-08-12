import { InformedConsentsWorkbench } from "@/components/informed-consents-workbench";
import type { InformedConsentPage } from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PatientPortalConsentsPage() {
  const initialPage = await sdkFetchServer<InformedConsentPage>(
    "/2pq/informed-consents",
  );

  return (
    <InformedConsentsWorkbench
      surface="patient-portal"
      initialPage={initialPage}
    />
  );
}
