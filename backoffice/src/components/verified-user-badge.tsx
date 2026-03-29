import { BadgeCheck, MailWarning, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AdminUserVerificationSummary } from "@/lib/moderation-types";

export function VerifiedUserBadge({
  summary,
  loading = false,
}: {
  summary: AdminUserVerificationSummary | null | undefined;
  loading?: boolean;
}) {
  if (loading) {
    return <Badge variant="outline">Checking auth</Badge>;
  }

  if (!summary || !summary.exists) {
    return (
      <Badge variant="outline">
        <ShieldOff className="h-3 w-3" />
        No auth
      </Badge>
    );
  }

  if (summary.emailVerified) {
    return (
      <Badge variant="success">
        <BadgeCheck className="h-3 w-3" />
        Verified
      </Badge>
    );
  }

  return (
    <Badge variant="warning">
      <MailWarning className="h-3 w-3" />
      Unverified
    </Badge>
  );
}
