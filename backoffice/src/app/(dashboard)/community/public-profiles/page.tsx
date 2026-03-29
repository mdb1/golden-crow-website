import { Users } from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { MetricCard } from "@/components/metric-card";
import { PageHero } from "@/components/page-hero";
import { UserScopePicker } from "@/components/user-scope-picker";

export default function CommunityPublicProfilesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Community"
        title="Pick a public profile"
        description="Review community-facing profiles by user, and clearly flag accounts that still do not have a public profile document."
      />
      <HelperBanner title="Only open real public profile records." tone="rose">
        This list is keyed by community users. Accounts without a public profile
        document stay visible with a warning tag, but their detail action
        remains disabled until the profile exists.
      </HelperBanner>
      <UserScopePicker scope="public-profiles" />
      <div className="grid gap-3">
        <MetricCard
          icon={Users}
          title="Raw public profile collection"
          description="Open the collection index when you need the full document list or raw collection browsing."
          href="/collections/public_profiles"
          tone="rose"
        />
      </div>
    </div>
  );
}
