import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import {
  listMyActivityClients,
  listMyCoachActivityPage,
} from "@/lib/gc-fitness/coach-activity-actions";
import { MyActivityFeed } from "./MyActivityFeed";

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
  const [firstPage, clients] = await Promise.all([
    listMyCoachActivityPage(null, 50),
    listMyActivityClients(),
  ]);

  return (
    <div className="gc-page flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Mi actividad
        </h1>
        <p className="text-sm text-muted-foreground">
          Acciones recientes del coach: workouts, ejercicios, asignaciones, hábitos, notas, chats y pedidos de fotos/peso.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent logs míos</CardTitle>
        </CardHeader>
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
