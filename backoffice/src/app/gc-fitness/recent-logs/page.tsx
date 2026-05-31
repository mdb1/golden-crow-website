import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { listRecentLogsForTrainerPage } from "@/lib/gc-fitness/recent-logs-actions";
import { RecentLogsFeed } from "./_components/RecentLogsFeed";

export const dynamic = "force-dynamic";

export default async function RecentLogsPage() {
  // Plan 20-06: mirror the qa-tools auth pattern. Without this, an
  // unauthenticated visit rendered a 500 from the unguarded Server Action call.
  let trainer: CurrentTrainer;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const tCommon = await getTranslations("common");

  // Plan 20-06: catch Server-Action failures (Firestore unavailable, index
  // missing, transient network) so the trainer sees a tasteful recovery card
  // instead of Next.js's default 500 page.
  type PageResult = Awaited<ReturnType<typeof listRecentLogsForTrainerPage>>;
  let logs: PageResult["logs"] = [];
  let clients: PageResult["clients"] = [];
  let nextCursor: PageResult["nextCursor"] = null;
  let hasMore = false;
  let loadFailed = false;
  try {
    const result = await listRecentLogsForTrainerPage();
    logs = result.logs;
    clients = result.clients;
    nextCursor = result.nextCursor;
    hasMore = result.hasMore;
  } catch (err) {
    console.error(
      `[gc-fitness/recent-logs] listRecentLogsForTrainerPage failed for trainer ${trainer.uid}`,
      err,
    );
    loadFailed = true;
  }

  return (
    <div className="gc-page flex flex-col gap-6">
      {loadFailed ? (
        <Card>
          <CardHeader>
            <CardTitle>{tCommon("errorGeneric")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {tCommon("retry")}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <RecentLogsFeed
          logs={logs}
          clients={clients}
          initialCursor={nextCursor}
          initialHasMore={hasMore}
        />
      )}
    </div>
  );
}
