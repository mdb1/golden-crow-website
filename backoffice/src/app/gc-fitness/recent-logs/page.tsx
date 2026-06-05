import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { listClients } from "@/lib/gc-fitness/client-roster";
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
  const tRecent = await getTranslations("recentLogs.feed");
  const trainerTimezone = await getTrainerTimezone();

  let clients: Array<{ id: string; name: string; photoURL: string | null }> = [];
  let loadFailed = false;
  try {
    const roster = await listClients();
    clients = roster
      .filter((client) => !client.pendingProvisioning)
      .map((client) => ({
        id: client.uid,
        name: client.displayName,
        photoURL: client.photoURL,
      }));
  } catch (err) {
    console.error(
      `[gc-fitness/recent-logs] listClients failed for trainer ${trainer.uid}`,
      err,
    );
    loadFailed = true;
  }

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader title={tRecent("title")} subtitle={tRecent("headerSubtitle")} />
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
        <div className="flex flex-col gap-4">
          <Card className="border-primary/15 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="h-4 w-4" />
                {tRecent("timezoneInfoTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                {tRecent("timezoneInfoBody", { timezone: trainerTimezone })}
              </p>
            </CardContent>
          </Card>
          <RecentLogsFeed
            logs={[]}
            clients={clients}
            trainerTimezone={trainerTimezone}
            initialCursor={null}
            initialHasMore={false}
          />
        </div>
      )}
    </div>
  );
}
