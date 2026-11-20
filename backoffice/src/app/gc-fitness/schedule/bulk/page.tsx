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
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import {
  BULK_SCHEDULE_CLIENTS_PARAM,
  parsePreselectedClients,
} from "@/lib/gc-fitness/coach-broadcast-model";

// Tab title: "Corvo - <schedule>" (issue #170).
export const generateMetadata = () => sectionMetadata("schedule");

export const dynamic = "force-dynamic";

export default async function BulkAssignPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  // #500 — `?clients=uid1,uid2` preselects (from the roster's «Asignar
  // rutina»). Filtered to this coach's own roster: a hand-edited URL can't
  // preselect anyone else (the action re-checks ownership anyway).
  const params = (await searchParams) ?? {};
  const initialSelectedUids = parsePreselectedClients(
    params[BULK_SCHEDULE_CLIENTS_PARAM],
    clients.filter((c) => !c.pendingProvisioning).map((c) => c.uid),
  );
  const t = await getTranslations("schedule.bulk");
  const tCommon = await getTranslations("common");

  return (
    <div className="gc-page flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="ghost" asChild className="shrink-0">
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
          <BulkAssignForm
            clients={clients}
            initialSelectedUids={initialSelectedUids}
          />
        </ScheduleQueryProvider>
      )}
    </div>
  );
}
