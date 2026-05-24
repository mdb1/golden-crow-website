// page.tsx — /gc-fitness/schedule per-client weekly grid (WTPL-05)
//
// Server Component shell:
//   1. Auth gate via getCurrentTrainer() — redirects to /login on Forbidden.
//   2. If ?clientId= query param is present → render <WeekGrid clientId=... />.
//      Otherwise → render <ClientPicker /> so the trainer can pick a client.
//   3. The bulk-assign link sits in the page header (link to /schedule/bulk).
//
// Why a query-param-driven client picker (vs a separate /schedule/[clientId]
// nested route): the schedule view is the trainer's daily entrypoint and
// must keep a clear URL trail for sharing ("look at Anna's schedule this
// week"). A query param keeps the URL flat and bookmarkable while still
// letting the page render the picker when no client is selected.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";

import { ScheduleQueryProvider } from "./providers";
import { ClientPicker } from "./client-picker";
import { WeekGrid } from "@/components/gc-fitness/schedule/week-grid";

export const dynamic = "force-dynamic";

interface SchedulePageProps {
  searchParams: Promise<{ clientId?: string; date?: string }>;
}

export default async function SchedulePage({
  searchParams,
}: SchedulePageProps) {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const { clientId, date } = await searchParams;
  const clients = await listClients();
  const t = await getTranslations("schedule");
  const tCommon = await getTranslations("common");
  const selectedClient = clientId
    ? clients.find((client) => client.uid === clientId) ?? null
    : null;
  const isPendingClient = selectedClient?.pendingProvisioning === true;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/gc-fitness/schedule/bulk">{t("bulkAssign")}</Link>
        </Button>
      </header>

      <ScheduleQueryProvider>
        {clientId ? (
          isPendingClient ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>{selectedClient.displayName}</span>
                  <Badge variant="secondary">{tCommon("pendingSignIn")}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Este usuario todavía no confirmó su primera sesión de Google.
                  La agenda semanal se habilita cuando pase a estado activo.
                </p>
                <Button asChild>
                  <Link
                    href={`/gc-fitness/clients/pending/${encodeURIComponent(selectedClient.email)}`}
                  >
                    Abrir pre-carga del cliente
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <WeekGrid clientId={clientId} focusDate={date} />
          )
        ) : (
          <ClientPicker clients={clients} />
        )}
      </ScheduleQueryProvider>
    </div>
  );
}
