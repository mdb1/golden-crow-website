// page.tsx — /gc-fitness/schedule/bulk (Bulk Assign multi-client + template + date)
//
// Server Component shell: enforces trainer auth, loads the client roster
// via listClients(), and renders the client form inside the schedule route
// group's QueryClientProvider so useWorkoutTemplates can subscribe.
//
// Auth gate mirrors /gc-fitness/exercises and /gc-fitness/schedule — same
// redirect-on-Forbidden + throw-on-misconfig pattern.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";

import { ScheduleQueryProvider } from "../providers";
import { BulkAssignForm } from "@/components/gc-fitness/schedule/bulk-assign-form";

export const dynamic = "force-dynamic";

export default async function BulkAssignPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  // Plan 20-07: wrap listClients in try/catch. On Firestore hiccup we still
  // render the page chrome + a fallback Card instead of 500-ing onto the
  // schedule/error.tsx boundary (which is too coarse for "list query
  // failed" — the form itself is unaffected).
  let clients: Awaited<ReturnType<typeof listClients>> = [];
  let rosterFailed = false;
  try {
    clients = await listClients();
  } catch {
    rosterFailed = true;
  }
  const t = await getTranslations("schedule.bulk");
  const tCommon = await getTranslations("common");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/gc-fitness/schedule">{t("backToSchedule")}</Link>
        </Button>
      </header>

      {rosterFailed ? (
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
      ) : clients.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tCommon("noResults")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {t("emptyHint")}
            </p>
            <Button asChild className="w-fit">
              <Link href="/gc-fitness/clients">{t("emptyCta")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ScheduleQueryProvider>
          <BulkAssignForm clients={clients} />
        </ScheduleQueryProvider>
      )}
    </div>
  );
}
