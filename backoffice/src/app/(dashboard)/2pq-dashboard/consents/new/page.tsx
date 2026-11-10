import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { PageHero } from "@/components/page-hero";
import { PatientConsentUploadWizard } from "@/components/patient-consent-upload-wizard";
import { Button } from "@/components/ui/button";
import type {
  InformedConsentPatientPage,
  InformedConsentStudyRequest,
} from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function NewInformedConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ studyRequestFormId?: string | string[] }>;
}) {
  const requestParam = (await searchParams).studyRequestFormId;
  const studyRequestFormId = typeof requestParam === "string" ? requestParam.trim() : null;
  let initialStudyRequest: InformedConsentStudyRequest | undefined;
  if (studyRequestFormId) {
    try {
      const result = await sdkFetchServer<{ request: InformedConsentStudyRequest }>(
        `/2pq/informed-consents/study-requests/${encodeURIComponent(studyRequestFormId)}`,
      );
      initialStudyRequest = result.request;
    } catch {
      notFound();
    }
    if (!initialStudyRequest.canUpload) {
      redirect(`/2pq-dashboard/forms/${encodeURIComponent(studyRequestFormId)}#informed-consent`);
    }
  }
  const initialPatientPage = initialStudyRequest
    ? undefined
    : await sdkFetchServer<InformedConsentPatientPage>("/2pq/informed-consents/patients");

  return (
    <HeaderUnclutterScope
      header={
        <PageHero
          eyebrow="2PQ"
          title="Subir consentimiento"
          description="Prepará o subí el consentimiento informado de la solicitud de estudio."
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
        initialStudyRequest={initialStudyRequest}
      />
    </HeaderUnclutterScope>
  );
}
