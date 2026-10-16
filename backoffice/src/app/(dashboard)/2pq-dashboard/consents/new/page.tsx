import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PatientConsentUploadWizard } from "@/components/patient-consent-upload-wizard";
import { Button } from "@/components/ui/button";
import type { InformedConsentPatientPage } from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function NewInformedConsentPage() {
  const initialPatientPage =
    await sdkFetchServer<InformedConsentPatientPage>(
      "/2pq/informed-consents/patients",
    );

  return (
    <HeaderUnclutterScope
      header={
        <PageHero
          eyebrow="2PQ"
          title="Subir consentimiento"
          description="Seleccione el paciente y el caso antes de preparar el consentimiento informado."
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
      <PatientConsentUploadWizard
        surface="backoffice"
        initialPatientPage={initialPatientPage}
      />
    </HeaderUnclutterScope>
  );
}
