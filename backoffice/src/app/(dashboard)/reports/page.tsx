import { FileBadge2, FileCode2, FileSearch } from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { MetricCard } from "@/components/metric-card";
import { PageHero } from "@/components/page-hero";
import { UserScopePicker } from "@/components/user-scope-picker";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Reports"
        title="Pick a user for report operations"
        description="Start with the person you need to moderate, then drill into that user’s report owner state and linked report codes."
      />
      <HelperBanner title="Keep report operations explicit." tone="green">
        Reports are user-scoped operational records. Choose the target user
        first, then use raw workbenches only when you need to edit the Firebase
        documents directly.
      </HelperBanner>
      <UserScopePicker scope="reports" />
      <div className="grid gap-3">
        <MetricCard
          icon={FileCode2}
          title="Report codes"
          description="Operational index of report codes and linked uploads."
          href="/collections/report_codes"
          tone="green"
        />
        <MetricCard
          icon={FileSearch}
          title="Uploaded reports"
          description="File-level records, provider format, tracking status, and ownership metadata."
          href="/collections/uploaded_reports"
          tone="green"
        />
        <MetricCard
          icon={FileBadge2}
          title="Report owners"
          description="Owner/admin profiles used by the mobile report administration flow."
          href="/collections/report_owners"
          tone="green"
        />
      </div>
    </div>
  );
}
