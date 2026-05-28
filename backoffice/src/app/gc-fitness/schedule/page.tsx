// /gc-fitness/schedule/page.tsx — unified month calendar across all clients.
//
// Server Component shell:
//   1. Auth gate via getCurrentTrainer() — redirects to /login on Forbidden.
//   2. Reads ?month=YYYY-MM and ?clientIds=a,b,c from the URL so the
//      calendar surface is bookmarkable / shareable / linkable from the
//      client profile ("Abrir en calendario").
//   3. Hydrates the calendar with the first batch of month data computed
//      server-side; further navigation is React-Query–driven on the client.

import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { listMonthForClients } from "@/lib/gc-fitness/schedule-month-actions";

import { ScheduleQueryProvider } from "./providers";
import { MonthCalendar } from "@/components/gc-fitness/schedule/month-calendar";

export const dynamic = "force-dynamic";

interface SchedulePageProps {
  searchParams: Promise<{
    month?: string;
    clientIds?: string;
  }>;
}

function monthFirstFromQuery(monthQuery: string | undefined, todayCivil: string): string {
  if (monthQuery && /^\d{4}-\d{2}$/.test(monthQuery)) {
    return `${monthQuery}-01`;
  }
  return `${todayCivil.slice(0, 7)}-01`;
}

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const { month, clientIds } = await searchParams;
  const clients = (await listClients()).filter((c) => !c.pendingProvisioning);
  const todayCivil = civilDateToday("UTC");
  const monthFirstCivil = monthFirstFromQuery(month, todayCivil);

  // Default: every active client checked. Trainer can toggle off; the URL
  // preserves the selection. Empty string → no clients selected.
  let selectedClientIds: string[];
  if (typeof clientIds === "string") {
    selectedClientIds =
      clientIds === ""
        ? []
        : clientIds
            .split(",")
            .map((s) => s.trim())
            .filter((id) => clients.some((c) => c.uid === id));
  } else {
    selectedClientIds = clients.map((c) => c.uid);
  }

  const initialPayload = await listMonthForClients({
    monthFirstCivil,
    clientIds: selectedClientIds,
    todayCivil,
  });

  return (
    <div className="gc-page flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/gc-fitness/schedule/bulk">Asignación masiva</Link>
        </Button>
      </div>

      <ScheduleQueryProvider>
        <MonthCalendar
          clients={clients.map((c) => ({
            uid: c.uid,
            displayName: c.displayName,
            email: c.email,
          }))}
          initialMonthFirst={monthFirstCivil}
          initialClientIds={selectedClientIds}
          initialPayload={initialPayload}
          todayCivil={todayCivil}
        />
      </ScheduleQueryProvider>
    </div>
  );
}
