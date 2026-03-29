import { Badge } from "@/components/ui/badge";
import type { AdminBadge as AdminBadgeValue } from "@/lib/moderation-types";
import { toneToBadgeVariant } from "@/lib/moderation-utils";
import { CommunityTagPill } from "./community-tag-pill";

export function AdminBadge({ badge }: { badge: AdminBadgeValue }) {
  if (badge.style === "tag") {
    return <CommunityTagPill label={badge.label} />;
  }

  return <Badge variant={toneToBadgeVariant(badge.tone)}>{badge.label}</Badge>;
}
