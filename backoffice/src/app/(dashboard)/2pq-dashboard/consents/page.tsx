import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { InformedConsentsWorkbench } from "@/components/informed-consents-workbench";
import { PageHero } from "@/components/page-hero";
import type { InformedConsentPage } from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function InformedConsentsPage() {
  const initialPage = await sdkFetchServer<InformedConsentPage>(
    "/2pq/informed-consents",
  );

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
      />
    </HeaderUnclutterScope>
  );
}
