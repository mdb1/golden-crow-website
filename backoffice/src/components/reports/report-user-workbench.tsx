import Link from "next/link";
import { ArrowLeft, FileBadge2, FileSearch, ShieldUser } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportPill } from "@/components/reports/report-pill";
import type {
  AdminReportRecord,
  AdminUserRecord,
  ModerationDocumentRecord,
} from "@/lib/moderation-types";
import {
  compactList,
  formatReportFormat,
  formatReportStatus,
  formatDateTime,
  getReportSourceMeta,
  getReportStatusColor,
  getString,
  pickFirstString,
} from "@/lib/moderation-utils";

export function ReportUserWorkbench({
  user,
  reports,
  reportOwner,
}: {
  user: AdminUserRecord;
  reports: AdminReportRecord[];
  reportOwner: ModerationDocumentRecord | null;
}) {
  const ownerTitle = reportOwner
    ? pickFirstString(reportOwner.data, [
        "ownerName",
        "owner_name",
        "ownerContactEmail",
        "owner_contact_email",
      ]) ?? reportOwner.id
    : "No report owner record";

  const ownerSubtitle = reportOwner
    ? compactList([
        pickFirstString(reportOwner.data, ["ownerCompany", "owner_company"]),
        pickFirstString(reportOwner.data, ["ownerProfession", "owner_profession"]),
      ]) || "Report owner profile"
    : "Create or review report_owners/{uid} before granting report administration state.";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reports">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to report users
          </Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{user.uid}</span>
      </div>

      <section className="flex flex-col gap-4">
        <div className="grid gap-3 xl:grid-cols-3">
          <MetricCard
            icon={ShieldUser}
            title="Account state"
            description="Open the Firebase Auth and private profile workbench for this user."
            href={`/users/${user.uid}`}
            value={user.lastReportDate || "No report date"}
            tone="blue"
          />
          <MetricCard
            icon={FileBadge2}
            title={ownerTitle}
            description={ownerSubtitle}
            href={reportOwner ? `/collections/report_owners/${user.uid}` : "/collections/report_owners"}
            ctaLabel={reportOwner ? "Open owner" : "Browse owners"}
            tone="green"
          />
          <MetricCard
            icon={FileSearch}
            title="Report admin surfaces"
            description="Browse report codes and uploaded reports through the typed report-management screens."
            href="/collections/report_codes"
            ctaLabel="Open reports"
            value={`${reports.length} codes`}
            tone="green"
          />
        </div>

        <div className="glass-panel overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="section-eyebrow">Reports</p>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Selected user report state
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review the owner record, then inspect or delete individual report
                codes from this user&apos;s report history.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={reportOwner ? "success" : "warning"}>
                {reportOwner ? "Owner record present" : "No owner record"}
              </Badge>
              <Badge variant={reports.length > 0 ? "brand" : "outline"}>
                {reports.length} report code{reports.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>

          <div className="hidden grid-cols-[minmax(0,2fr)_140px_170px_auto] gap-4 border-b border-border/70 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
            <span>Report</span>
            <span>Source</span>
            <span>Created</span>
            <span className="text-right">Action</span>
          </div>

          {reports.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {reportOwner
                ? "No linked report_codes records were found for this report owner."
                : "No linked report_codes records were found for this user. This account also has no report_owner record yet."}
            </div>
          ) : (
            reports.map((report) => {
              const sourceMeta = getReportSourceMeta(report.source);
              const statusLabel = formatReportStatus(report.trackingStatus);
              const formatLabel = formatReportFormat(report.providerFormat);

              return (
                <div
                  key={report.id}
                  className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.35fr)_170px_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground">
                        {report.fileName ?? report.code}
                      </h3>
                      <span className="font-mono text-xs text-muted-foreground">{report.id}</span>
                      {report.fileName && report.fileName !== report.code ? (
                        <ReportPill label={report.code} color="#7A59A8" />
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {compactList([
                        report.providerName ?? undefined,
                        report.ownerName ?? report.ownerEmail ?? undefined,
                        getString(report.downloadUrl) ? "Download ready" : "No download URL",
                      ]) || "Linked uploaded report metadata unavailable"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ReportPill label={sourceMeta.label} color={sourceMeta.color} />
                    {formatLabel ? <ReportPill label={formatLabel} color="#4E8FBB" /> : null}
                    {statusLabel ? (
                      <ReportPill
                        label={statusLabel}
                        color={getReportStatusColor(report.trackingStatus)}
                      />
                    ) : null}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {formatDateTime(report.createdAt) ?? "No timestamp"}
                  </div>

                  <div className="flex lg:justify-end">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/reports/${report.id}?userId=${user.uid}`}>
                        Open report
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
