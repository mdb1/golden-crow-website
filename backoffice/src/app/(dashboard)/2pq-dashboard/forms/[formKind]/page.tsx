import { notFound } from "next/navigation";
import { TwoPQFormDetail } from "@/components/two-pq-form-detail";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";
import type { InformedConsentStudyRequest } from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";
import { getTwoPQCase, getTwoPQForm } from "@/lib/two-pq-server";

export default async function TwoPQFormDetailPage({
  params,
}: {
  params: Promise<{ formKind: string }>;
}) {
  const { formKind } = await params;

  let form: TwoPQFormRecord;
  try {
    form = await getTwoPQForm(formKind);
  } catch {
    notFound();
  }

  const [linkedCase, consentRequest] = await Promise.all([
    form["2pq_case"] ? getTwoPQCase(form["2pq_case"]).catch(() => null) : Promise.resolve(null),
    form.formType === "study_request"
      ? sdkFetchServer<{ request: InformedConsentStudyRequest }>(
          `/2pq/informed-consents/study-requests/${encodeURIComponent(form.id)}`,
        ).then(({ request }) => request).catch(() => null)
      : Promise.resolve(null),
  ]);

  return <TwoPQFormDetail form={form} linkedCase={linkedCase} consentRequest={consentRequest} />;
}
