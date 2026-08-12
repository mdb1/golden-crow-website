import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { InformedConsentsWorkbench } from "@/components/informed-consents-workbench";
import { PageHero } from "@/components/page-hero";
import type {
  InformedConsentPage,
  InformedConsentPatientPage,
} from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function InformedConsentsPage() {
  const [initialPage, initialPatientPage] = await Promise.all([
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
          title="Consentimientos"
          description="Patient-linked informed consent files."
        />
      }
    >
      <InformedConsentsWorkbench
        surface="backoffice"
        initialPage={initialPage}
        initialPatientPage={initialPatientPage}
      />
    </HeaderUnclutterScope>
  );
}
