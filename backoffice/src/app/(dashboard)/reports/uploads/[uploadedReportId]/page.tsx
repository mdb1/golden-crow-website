import Link from "next/link";
import { notFound } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { UploadedReportWorkbench } from "@/components/reports/uploaded-report-workbench";
import { Button } from "@/components/ui/button";
import { sdkFetchServer } from "@/lib/sdk-server";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import {
  parseUploadedReportRecord,
  resolveEditableReportOwnerId,
} from "@/lib/report-admin";

async function getUploadedReport(uploadedReportId: string) {
  try {
    const result = await sdkFetchServer<{ document: ModerationDocumentRecord }>(
      `/moderation/uploaded_reports/${uploadedReportId}`
    );
    return result.document;
  } catch {
    return null;
  }
}

export default async function UploadedReportDetailPage({
  params,
}: {
  params: Promise<{ uploadedReportId: string }>;
}) {
  const { uploadedReportId } = await params;
  const document = await getUploadedReport(uploadedReportId);

  if (!document) {
    notFound();
  }

  const report = parseUploadedReportRecord(document);
  const ownerId = resolveEditableReportOwnerId(report);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <PageHero
        eyebrow="Reports"
        title={report.fileName}
        description="Uploaded-report management screen modeled on the iOS report admin flow, with typed fields before any raw JSON fallback."
      />

      <HelperBanner title="Manage the uploaded report directly from this screen." tone="green">
        Edit the patient-facing metadata, publish the download URL, update owner
        links, and follow the connected report/account surfaces without using the
        developer raw editor.
      </HelperBanner>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ownerId ? `/reports/users/${ownerId}` : "/collections/report_codes"}>
            Back
          </Link>
        </Button>
        {report.reportCode ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              href={
                ownerId
                  ? `/reports/${report.reportCode}?userId=${ownerId}`
                  : `/reports/${report.reportCode}`
              }
            >
              Open report code
            </Link>
          </Button>
        ) : null}
        {ownerId ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/users/${ownerId}`}>Open owner account</Link>
          </Button>
        ) : null}
      </div>

      <UploadedReportWorkbench document={document} />
    </div>
  );
}
