import { notFound } from "next/navigation";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { ReportUserWorkbench } from "@/components/reports/report-user-workbench";
import { sdkFetchServer } from "@/lib/sdk-server";
import type {
  AdminReportRecord,
  AdminUserRecord,
  ModerationDocumentRecord,
} from "@/lib/moderation-types";

async function getOptionalDocument(
  path: string
): Promise<ModerationDocumentRecord | null> {
  try {
    const result = await sdkFetchServer<{ document: ModerationDocumentRecord }>(path);
    return result.document;
  } catch {
    return null;
  }
}

async function getOptionalReports(
  userId: string
): Promise<{ reports: AdminReportRecord[]; reportsUnavailable: boolean }> {
  try {
    const result = await sdkFetchServer<{
      reports: AdminReportRecord[];
      hasMore: boolean;
    }>(`/reports?userId=${encodeURIComponent(userId)}`);
    return { reports: result.reports, reportsUnavailable: false };
  } catch (error) {
    console.error(`[ReportsUserDetailPage] Failed to load reports for ${userId}.`, error);
    return { reports: [], reportsUnavailable: true };
  }
}

export default async function ReportsUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  let user: AdminUserRecord;
  try {
    const result = await sdkFetchServer<{ user: AdminUserRecord }>(`/users/${userId}`);
    user = result.user;
  } catch {
    notFound();
  }

  const [{ reports, reportsUnavailable }, reportOwner] = await Promise.all([
    getOptionalReports(userId),
    getOptionalDocument(`/moderation/report_owners/${userId}`),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Reports"
        title={user.displayName || user.email || user.uid}
        description="Pick a user first, then inspect or manipulate that user’s report owner state and linked report codes from one place."
      />
      <HelperBanner title="Stay on the selected user while moderating." tone="green">
        Use the selected-user report view to audit owner state, then open
        individual report code records without losing the surrounding user
        context.
      </HelperBanner>
      {!reportsUnavailable && reports.length === 0 && !reportOwner ? (
        <HelperBanner title="This account is not linked to report ownership." tone="amber">
          No report owner document or linked report codes were found for this
          user. Go back to the reports picker to choose one of the users that
          already has report state.
        </HelperBanner>
      ) : null}
      {reportsUnavailable ? (
        <HelperBanner title="Report codes could not be loaded." tone="amber">
          The user shell is still available, but the report list request failed.
          Check the SDK process or Firestore connectivity, then refresh this page.
        </HelperBanner>
      ) : null}
      <ReportUserWorkbench
        user={user}
        reports={reports}
        reportOwner={reportOwner}
      />
    </div>
  );
}
