import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import {
  deactivateClientForCoach,
  getCoachAdminDetail,
  removePendingClientForCoach,
} from "@/lib/gc-fitness/admin-actions";

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

  async function deactivateClientAction(formData: FormData) {
    "use server";
    const coachUid = String(formData.get("coachUid") ?? "");
    const clientUid = String(formData.get("clientUid") ?? "");
    await deactivateClientForCoach({ coachUid, clientUid });
    revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  }

  async function removePendingAction(formData: FormData) {
    "use server";
    const coachUid = String(formData.get("coachUid") ?? "");
    const email = String(formData.get("email") ?? "");
    await removePendingClientForCoach({ coachUid, email });
    revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  }

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
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {detail.linkedClients.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-2 text-muted-foreground" colSpan={4}>
                    No linked clients.
                  </td>
                </tr>
              ) : (
                detail.linkedClients.map((client) => (
                  <tr key={client.uid} className="border-t">
                    <td className="px-4 py-2">
                      <div className="font-medium">{client.displayName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{client.email}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{client.uid}</td>
                    <td className="px-4 py-2">{client.deleted ? "deleted" : "active"}</td>
                    <td className="px-4 py-2">
                      {!client.deleted ? (
                        <form action={deactivateClientAction}>
                          <input type="hidden" name="coachUid" value={detail.coach.uid} />
                          <input type="hidden" name="clientUid" value={client.uid} />
                          <button
                            type="submit"
                            className="inline-flex h-8 items-center rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Deactivate
                          </button>
                        </form>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Pending clients</h2>
          <p className="text-xs text-muted-foreground">
            Pre-provisioned clients in <code>user_mirror</code> for this coach.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {detail.pendingClients.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-2 text-muted-foreground" colSpan={3}>
                    No pending clients.
                  </td>
                </tr>
              ) : (
                detail.pendingClients.map((pending) => (
                  <tr key={pending.email} className="border-t">
                    <td className="px-4 py-2">{pending.email}</td>
                    <td className="px-4 py-2">{pending.displayName || "—"}</td>
                    <td className="px-4 py-2">
                      <form action={removePendingAction}>
                        <input type="hidden" name="coachUid" value={detail.coach.uid} />
                        <input type="hidden" name="email" value={pending.email} />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Remove pending
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
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
