import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { InformedConsentDetailWorkbench } from "@/components/informed-consent-detail-workbench";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import type { InformedConsentDetailPayload } from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function InformedConsentDetailPage({
  params,
}: {
  params: Promise<{ consentId: string }>;
}) {
  const { consentId } = await params;
  let payload: InformedConsentDetailPayload;
  try {
    payload = await sdkFetchServer<InformedConsentDetailPayload>(
      `/2pq/informed-consents/${encodeURIComponent(consentId)}`,
    );
  } catch {
    notFound();
  }

  return (
    <HeaderUnclutterScope
      header={
        <PageHero
          eyebrow="2PQ"
          title={payload.record.file.name}
          description="Detalle y trazabilidad del consentimiento informado."
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/2pq-dashboard/consents">
                <ArrowLeft className="size-4" />
                Volver a consentimientos
              </Link>
            </Button>
          }
        />
      }
    >
      <InformedConsentDetailWorkbench initialPayload={payload} />
    </HeaderUnclutterScope>
  );
}
