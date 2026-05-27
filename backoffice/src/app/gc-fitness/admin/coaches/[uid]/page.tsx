import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import {
  deleteClientCascade,
  deactivateClientForCoach,
  getDeletionTargetInfo,
  getCoachAdminDetail,
  previewClientCascade,
  removePendingClientForCoach,
} from "@/lib/gc-fitness/admin-actions";
import { AdminSubmitButton } from "../../_components/admin-submit-button";

export const dynamic = "force-dynamic";

export default async function CoachAdminDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ uid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const sp = await searchParams;
  const previewClientUid = typeof sp.clientUid === "string" ? sp.clientUid.trim() : "";
  const op = typeof sp.op === "string" ? sp.op : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const detail = await getCoachAdminDetail(uid);
  if (!detail) notFound();
  const actionMessage = op && ok === "1" ? `Action completed: ${op}.` : null;

  let clientPreview: Awaited<ReturnType<typeof previewClientCascade>> | null = null;
  let targetInfo: Awaited<ReturnType<typeof getDeletionTargetInfo>> | null = null;
  if (previewClientUid.length > 0) {
    try {
      targetInfo = await getDeletionTargetInfo(previewClientUid);
      clientPreview = await previewClientCascade(previewClientUid);
    } catch {
      clientPreview = null;
    }
  }
  const canExecuteClientDelete =
    previewClientUid.length > 0 &&
    clientPreview !== null;

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

  async function deleteClientAction(formData: FormData) {
    "use server";
    const coachUid = String(formData.get("coachUid") ?? "");
    const clientUid = String(formData.get("clientUid") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    await deleteClientCascade({ clientUid, confirmation, mode: "execute" });
    revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
    redirect(`/gc-fitness/admin/coaches/${coachUid}?op=delete_client&ok=1`);
  }

  return (
    <div className="gc-page flex flex-col gap-6">
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
      {actionMessage ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {actionMessage}
        </div>
      ) : null}

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
                      <div className="flex items-center gap-2">
                        {!client.deleted ? (
                          <form action={deactivateClientAction}>
                            <input type="hidden" name="coachUid" value={detail.coach.uid} />
                            <input type="hidden" name="clientUid" value={client.uid} />
                            <AdminSubmitButton
                              idleLabel="Deactivate"
                              pendingLabel="Deactivating..."
                              className="inline-flex h-8 items-center rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 hover:bg-red-50"
                            />
                          </form>
                        ) : (
                          "—"
                        )}
                        <Link
                          href={`/gc-fitness/admin/coaches/${detail.coach.uid}?clientUid=${encodeURIComponent(client.uid)}`}
                          className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                        >
                          Use in delete
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold text-red-700">Delete client (cascade)</p>
        <p className="text-xs text-muted-foreground">
          Do this from coach detail so you can copy UID from the linked clients table.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Direct: client auth account + <code>users/{`{clientUid}`}</code>.</li>
          <li>Cascade: chat thread, workout logs, assignments, habits, habit logs, goals, notes, progress photos metadata.</li>
          <li>Client loses relationship with coach because the client document is deleted.</li>
        </ul>
        <form method="get" action={`/gc-fitness/admin/coaches/${detail.coach.uid}`} className="space-y-2">
          <input
            name="clientUid"
            required
            defaultValue={previewClientUid}
            placeholder="client uid"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <AdminSubmitButton
            idleLabel="Preview deletion (dry run)"
            pendingLabel="Previewing..."
            className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted"
          />
        </form>
        {clientPreview ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">Preview result</p>
            {targetInfo?.exists ? (
              <p>
                Target detected: {targetInfo.role ?? "unknown"} · {targetInfo.displayName || targetInfo.email || "—"}
              </p>
            ) : (
              <p>Target not found in users collection.</p>
            )}
            <p>Total docs approx: {clientPreview.totalApprox}</p>
            <p>chat: {clientPreview.chatDocExists ? "yes" : "no"}</p>
            <p>workout_logs: {clientPreview.workoutLogs}</p>
            <p>workout_assignments: {clientPreview.workoutAssignments}</p>
            <p>habits: {clientPreview.habits}</p>
            <p>habit_logs: {clientPreview.habitLogs}</p>
            <p>client_goals: {clientPreview.clientGoals}</p>
            <p>client_notes: {clientPreview.clientNotes}</p>
            <p>progress_photos: {clientPreview.progressPhotos}</p>
          </div>
        ) : null}
        <form action={deleteClientAction} className="space-y-2">
          <input type="hidden" name="coachUid" value={detail.coach.uid} />
          <input
            name="clientUid"
            required
            defaultValue={previewClientUid}
            placeholder="client uid (same as preview)"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <input
            name="confirmation"
            required
            placeholder='Type exactly: DELETE CLIENT'
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <AdminSubmitButton
            idleLabel="Confirm and delete client"
            pendingLabel="Deleting client..."
            disabled={!canExecuteClientDelete}
            className="h-10 rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800"
          />
          {!canExecuteClientDelete ? (
            <p className="text-xs text-muted-foreground">
              Run dry run first to enable delete.
            </p>
          ) : null}
        </form>
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
