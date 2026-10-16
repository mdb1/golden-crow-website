import { PatientPortalHome } from "@/components/patient-portal-home";
import type { InformedConsentPatientHomeStatus } from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PatientPortalHomePage() {
  const status = await sdkFetchServer<InformedConsentPatientHomeStatus>(
    "/2pq/informed-consents/home-status",
  ).catch(() => null);

  return <PatientPortalHome status={status} />;
}
