import { Badge } from "@/components/ui/badge";
import type { InformedConsentRequestStatus } from "@/lib/informed-consents";
import { appText, type AppLanguage } from "@/lib/language";

const statusLabels = {
  pending: "Consent pending",
  needs_review: "Consent needs review",
  ready: "Consent ready",
} satisfies Record<InformedConsentRequestStatus, string>;

export function ConsentRequestStatusBadge({
  status,
  language,
}: {
  status: InformedConsentRequestStatus;
  language: AppLanguage;
}) {
  return (
    <Badge variant={status === "ready" ? "success" : status === "needs_review" ? "warning" : "outline"}>
      {appText(language, statusLabels[status])}
    </Badge>
  );
}
