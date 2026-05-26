import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { listRecentCoachActivity } from "@/lib/gc-fitness/admin-actions";

export const dynamic = "force-dynamic";

export default async function CoachActivityPage() {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  const rows = await listRecentCoachActivity(160);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Recent coach activity</h1>
          <p className="text-sm text-muted-foreground">
            High-level usage events with recurring workout assignments collapsed into single rows.
          </p>
        </div>
        <Link href="/gc-fitness/admin" className="text-sm underline">
          Back to admin
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">When (UTC)</th>
                <th className="px-4 py-2 font-medium">Coach</th>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Recurrence</th>
                <th className="px-4 py-2 font-medium">Occurrences</th>
                <th className="px-4 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-3 text-xs text-muted-foreground" colSpan={7}>
                    No recent coach activity found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2">{row.occurredAtISO ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/gc-fitness/admin/coaches/${row.coachUid}`}
                        className="font-medium underline underline-offset-2"
                      >
                        {row.coachName}
                      </Link>
                      <div className="text-xs text-muted-foreground">{row.coachEmail}</div>
                    </td>
                    <td className="px-4 py-2">{row.summary}</td>
                    <td className="px-4 py-2">
                      {row.clientUid || row.clientEmail ? (
                        <div className="space-y-0.5">
                          <div className="font-mono text-xs">{row.clientUid ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{row.clientEmail ?? "—"}</div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.recurrenceLabel ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.occurrences ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.kind}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
