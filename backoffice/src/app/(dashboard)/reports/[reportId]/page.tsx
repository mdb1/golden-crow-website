import { notFound } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { sdkFetchServer } from "@/lib/sdk-server";
import type { AdminReportRecord } from "@/lib/moderation-types";
import { ReportDeleteDialog } from "@/components/reports/report-delete-dialog";
import { ReportDetailWorkbench } from "@/components/reports/report-detail-workbench";
import { Button } from "@/components/ui/button";
import { getString } from "@/lib/moderation-utils";
import Link from "next/link";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ userId?: string; from?: string }>;
}) {
  const [{ reportId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const selectedUserId = resolvedSearchParams.userId;
  const sourceScreen = resolvedSearchParams.from;

  let report: AdminReportRecord;
  let reportCodeDocument: ModerationDocumentRecord;
  try {
    const [reportResult, reportCodeResult] = await Promise.all([
      sdkFetchServer<{ report: AdminReportRecord }>(`/reports/${reportId}`),
      sdkFetchServer<{ document: ModerationDocumentRecord }>(
        `/moderation/report_codes/${reportId}`
      ),
    ]);
    report = reportResult.report;
    reportCodeDocument = reportCodeResult.document;
  } catch {
    notFound();
  }

  const uploadHref = report.uploadedReportId
    ? `/reports/uploads/${report.uploadedReportId}`
    : null;
  const backHref =
    sourceScreen === "report-codes"
      ? "/collections/report_codes"
      : report.userId
        ? `/reports/users/${selectedUserId ?? report.userId}`
        : "/collections/report_codes";
  const uploadedReportId =
    getString(reportCodeDocument.data.uploaded_report_id) ?? report.uploadedReportId ?? "";

  let uploadedReportDocument: ModerationDocumentRecord | null = null;
  if (uploadedReportId) {
    try {
      const result = await sdkFetchServer<{ document: ModerationDocumentRecord }>(
        `/moderation/uploaded_reports/${uploadedReportId}`
      );
      uploadedReportDocument = result.document;
    } catch {
      uploadedReportDocument = null;
    }
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <PageHero
        eyebrow="Reports"
        title={report.code}
        description="Edit the report-code link record and, when available, the linked uploaded-report metadata from one screen."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href={backHref}>Back to reports</Link>
            </Button>
            {uploadHref ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={uploadHref}>Open focused uploaded-report screen</Link>
              </Button>
            ) : null}
            <ReportDeleteDialog report={report} redirectTo={backHref} />
          </>
        }
      />
      <HelperBanner title="Start with the typed report screen, not raw JSON." tone="green">
        Update the report-code links here, then review the uploaded-report
        metadata below. The raw workbench is still available as a secondary
        developer tool.
      </HelperBanner>
      <ReportDetailWorkbench
        report={report}
        reportCodeDocument={reportCodeDocument}
        uploadedReportDocument={uploadedReportDocument}
        backHref={backHref}
      />
    </div>
  );
}
