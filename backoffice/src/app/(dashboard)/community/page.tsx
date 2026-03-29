import { MessagesSquare, UserRoundCog, Users } from "lucide-react";
import { HelperBanner } from "@/components/helper-banner";
import { MetricCard } from "@/components/metric-card";
import { PageHero } from "@/components/page-hero";

export default function CommunityPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Community"
        title="Community hub"
        description="Grouped entry points for public profiles, community users, posts, replies, and activity events."
      />
      <HelperBanner title="Moderate public state carefully." tone="rose">
        Public profile and community user edits ripple into avatars, handles,
        authored content, and activity visibility across the mobile app.
      </HelperBanner>
      <div className="grid gap-3">
        <MetricCard
          icon={MessagesSquare}
          title="Community posts"
          description="Browse community_posts with nested comments and direct author links."
          href="/collections/community_posts"
          tone="rose"
        />
        <MetricCard
          icon={Users}
          title="Public profiles"
          description="Pick a community user, review public-profile coverage, and only open real profile records."
          href="/community/public-profiles"
          tone="rose"
        />
        <MetricCard
          icon={UserRoundCog}
          title="Community users"
          description="Inspect community identity, stats, activity visibility, and nested events."
          href="/collections/community_users"
          tone="rose"
        />
      </div>
    </div>
  );
}
