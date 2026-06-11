import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import {
  listMyActivityClients,
  listMyCoachActivityPage,
} from "@/lib/gc-fitness/coach-activity-actions";
import { MyActivityFeed } from "./MyActivityFeed";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <myActivity>" (issue #170).
export const generateMetadata = () => sectionMetadata("myActivity");

export const dynamic = "force-dynamic";

export default async function MyActivityPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  // Load a full page (50) so the whole of today's activity is present on first
  // paint — a coach must see everything they did, not a truncated slice.
  const timezone = await getTrainerTimezone();
  const t = await getTranslations("myActivity");
  const [firstPage, clients] = await Promise.all([
    listMyCoachActivityPage(null, 50),
    listMyActivityClients(),
  ]);

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("headerSubtitle")}
      />

      <Card>
        <CardContent className="p-0">
          <MyActivityFeed
            initialRows={firstPage.rows}
            initialCursor={firstPage.nextCursor}
            initialHasMore={firstPage.hasMore}
            clients={clients}
            timezone={timezone}
          />
        </CardContent>
      </Card>
    </div>
  );
}
