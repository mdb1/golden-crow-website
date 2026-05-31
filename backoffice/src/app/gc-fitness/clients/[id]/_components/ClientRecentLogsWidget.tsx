import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listRecentLogsForClient } from "@/lib/gc-fitness/recent-logs-actions";

import { ClientRecentLogsFeed } from "./ClientRecentLogsFeed";

/**
 * Trainer-facing "Recent activity" section on the client profile. Async server
 * component (own Suspense boundary on the page) — fetches the client-scoped feed
 * and hands it to the paginated client component. Trainer ownership is enforced
 * inside `listRecentLogsForClient`.
 */
export async function ClientRecentLogsWidget({
  clientId,
}: {
  clientId: string;
}) {
  const t = await getTranslations("clients.detail.recentLogs");
  const { logs, nextCursor, hasMore } = await listRecentLogsForClient(clientId);
  return (
    <Card className="xl:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ClientRecentLogsFeed
          logs={logs}
          clientId={clientId}
          initialCursor={nextCursor}
          initialHasMore={hasMore}
          showActions
        />
      </CardContent>
    </Card>
  );
}
