import { PatientConsentUploadWizard } from "@/components/patient-consent-upload-wizard";
import type { MyAccountRecord } from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PatientPortalNewConsentPage() {
  const { account } = await sdkFetchServer<{ account: MyAccountRecord }>(
    "/auth/my-account",
  );
  const initialPatientName =
    account.role?.patientName?.trim() ||
    account.profile?.fullName?.trim() ||
    account.role?.displayName?.trim() ||
    account.auth.displayName?.trim() ||
    "";

  return (
    <PatientConsentUploadWizard initialPatientName={initialPatientName} />
  );
}
