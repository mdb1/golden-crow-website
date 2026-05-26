import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { getCoachAdminDetail } from "@/lib/gc-fitness/admin-actions";

export const dynamic = "force-dynamic";

export default async function CoachAdminDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  const { uid } = await params;
  const detail = await getCoachAdminDetail(uid);
  if (!detail) notFound();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Coach detail
          </h1>
          <p className="text-sm text-muted-foreground">
            {detail.coach.displayName || "—"} · {detail.coach.email}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{detail.coach.uid}</p>
        </div>
        <Link href="/gc-fitness/admin" className="text-sm underline">
          Back to admin
        </Link>
      </div>

      <section className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-3">
        <Metric label="Clients" value={detail.coach.clientsCount} />
        <Metric label="Custom workouts" value={detail.coach.customWorkoutsCount} />
        <Metric label="Custom exercises" value={detail.coach.customExercisesCount} />
        <Metric label="Assignments" value={detail.workoutAssignmentsCount} />
        <Metric label="Habits" value={detail.habitsCount} />
        <Metric label="Chats" value={detail.chatsCount} />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Linked clients</h2>
          <p className="text-xs text-muted-foreground">Current coachId relationship.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">UID</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.linkedClients.map((client) => (
                <tr key={client.uid} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">{client.displayName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{client.email}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{client.uid}</td>
                  <td className="px-4 py-2">{client.deleted ? "deleted" : "active"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Recent admin operations (target coach)</h2>
          <p className="text-xs text-muted-foreground">From `admin_operations`.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">When (UTC)</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Mode</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {detail.recentOperations.map((op) => (
                <tr key={op.id} className="border-t">
                  <td className="px-4 py-2">{op.createdAtISO ?? "—"}</td>
                  <td className="px-4 py-2">{op.kind}</td>
                  <td className="px-4 py-2">{op.mode}</td>
                  <td className="px-4 py-2">{op.status}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {op.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
