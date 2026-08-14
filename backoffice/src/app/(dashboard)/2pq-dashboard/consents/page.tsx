import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { InformedConsentsWorkbench } from "@/components/informed-consents-workbench";
import { PageHero } from "@/components/page-hero";
import type {
  InformedConsentPage,
  InformedConsentPatientPage,
} from "@/lib/informed-consents";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function InformedConsentsPage() {
  const [adminContext, initialPage, initialPatientPage] = await Promise.all([
    getAdminContextServer(),
    sdkFetchServer<InformedConsentPage>("/2pq/informed-consents"),
    sdkFetchServer<InformedConsentPatientPage>(
      "/2pq/informed-consents/patients",
    ),
  ]);

  return (
    <HeaderUnclutterScope
      header={
        <PageHero
          eyebrow="2PQ"
          title="Consentimientos 2PQ"
          description="Patient-linked informed consent files."
        />
      }
    >
      <InformedConsentsWorkbench
        surface="backoffice"
        initialPage={initialPage}
        initialPatientPage={initialPatientPage}
        currentUserEmail={adminContext.email}
      />
    </HeaderUnclutterScope>
  );
}
