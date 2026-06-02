import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listMyCoachActivityPage } from "@/lib/gc-fitness/coach-activity-actions";
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

  const firstPage = await listMyCoachActivityPage(null, 20);

  return (
    <div className="gc-page flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Mi actividad
        </h1>
        <p className="text-sm text-muted-foreground">
          Acciones recientes del coach: workouts, ejercicios, asignaciones, hábitos, notas y chats.
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
