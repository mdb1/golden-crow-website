import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  addCoachEmailToAllowlist,
  deleteCoachCascade,
  listCoachesForAdmin,
  listCoachAllowlist,
  listRecentCoachActivity,
  removeCoachEmailFromAllowlist,
  previewCoachCascade,
  promoteUserToAdmin,
} from "@/lib/gc-fitness/admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { AdminSubmitButton } from "./_components/admin-submit-button";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
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

  const sp = await searchParams;
  const op = typeof sp.op === "string" ? sp.op : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const actionMessage = op && ok === "1" ? `Action completed: ${op}.` : null;
  const deleteTarget = typeof sp.deleteTarget === "string" ? sp.deleteTarget : null;
  const targetUid = typeof sp.targetUid === "string" ? sp.targetUid.trim() : "";
  let coachPreview: Awaited<ReturnType<typeof previewCoachCascade>> | null = null;
  if (deleteTarget === "coach" && targetUid.length > 0) {
    try {
      coachPreview = await previewCoachCascade(targetUid);
    } catch {
      coachPreview = null;
    }
  }

  const coaches = await listCoachesForAdmin();
  const allowlistRows = await listCoachAllowlist();
  const recentCoachActivity = await listRecentCoachActivity(80);

  async function addAllowlistEmailAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    await addCoachEmailToAllowlist(email);
    revalidatePath("/gc-fitness/admin");
    redirect("/gc-fitness/admin?op=allowlist_add&ok=1");
  }

  async function promoteToAdminAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    await promoteUserToAdmin({ email, keepTrainer: true });
    revalidatePath("/gc-fitness/admin");
    redirect("/gc-fitness/admin?op=promote_admin&ok=1");
  }

  async function removeAllowlistEmailAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    await removeCoachEmailFromAllowlist({ email });
    revalidatePath("/gc-fitness/admin");
    redirect("/gc-fitness/admin?op=allowlist_remove&ok=1");
  }

  async function deleteCoachAction(formData: FormData) {
    "use server";
    const coachUid = String(formData.get("coachUid") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    const mode = String(formData.get("mode") ?? "dry_run");
    await deleteCoachCascade({ coachUid, confirmation, mode });
    revalidatePath("/gc-fitness/admin");
    redirect("/gc-fitness/admin?op=delete_coach&ok=1");
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Admin Console
        </h1>
        <p className="text-sm text-muted-foreground">
          GC Fitness operator tools. Multi-role is enabled: a user can be trainer and admin at the
          same time.
        </p>
      </div>
      {actionMessage ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {actionMessage}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2">
        <form action={addAllowlistEmailAction} className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-semibold">Add coach email to allowlist</p>
          <p className="text-xs text-muted-foreground">
            Stores the email in Firestore allowlist for admin-controlled access.
          </p>
          <input
            name="email"
            type="email"
            required
            placeholder="coach@email.com"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <AdminSubmitButton
            idleLabel="Add email"
            pendingLabel="Adding..."
            className="h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
          />
        </form>

        <form action={promoteToAdminAction} className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-semibold">Promote existing user to admin</p>
          <p className="text-xs text-muted-foreground">
            Keeps trainer role and adds admin role (`trainer` + `admin`) on custom claims.
          </p>
          <input
            name="email"
            type="email"
            required
            placeholder="user@email.com"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <AdminSubmitButton
            idleLabel="Promote user"
            pendingLabel="Promoting..."
            className="h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
          />
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Coach allowlist</h2>
          <p className="text-xs text-muted-foreground">
            Pending allowlist emails (already-trainer emails are hidden).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Enabled</th>
                <th className="px-4 py-2 font-medium">Updated at (UTC)</th>
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {allowlistRows.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-3 text-xs text-muted-foreground" colSpan={4}>
                    No allowlist entries yet.
                  </td>
                </tr>
              ) : (
                allowlistRows.map((row) => (
                  <tr key={row.email} className="border-t">
                    <td className="px-4 py-2">{row.email}</td>
                    <td className="px-4 py-2">{row.enabled ? "yes" : "no"}</td>
                    <td className="px-4 py-2">{row.updatedAtISO ?? "—"}</td>
                    <td className="px-4 py-2">
                      <form action={removeAllowlistEmailAction}>
                        <input type="hidden" name="email" value={row.email} />
                        <AdminSubmitButton
                          idleLabel="Remove"
                          pendingLabel="Removing..."
                          className="inline-flex h-8 items-center rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 hover:bg-red-50"
                        />
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
          <h2 className="text-sm font-semibold">Coaches</h2>
          <p className="text-xs text-muted-foreground">
            Email, roles, clients, custom workouts, custom exercises.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Coach</th>
                <th className="px-4 py-2 font-medium">UID</th>
                <th className="px-4 py-2 font-medium">Roles</th>
                <th className="px-4 py-2 font-medium">Clients</th>
                <th className="px-4 py-2 font-medium">Custom workouts</th>
                <th className="px-4 py-2 font-medium">Custom exercises</th>
                <th className="px-4 py-2 font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {coaches.map((coach) => (
                <tr key={coach.uid} className="border-t">
                  <td className="px-4 py-2">
                    <Link
                      href={`/gc-fitness/admin/coaches/${coach.uid}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {coach.displayName || "—"}
                    </Link>
                    <div className="text-xs text-muted-foreground">{coach.email}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{coach.uid}</td>
                  <td className="px-4 py-2">{coach.roles.join(", ") || "trainer"}</td>
                  <td className="px-4 py-2">{coach.clientsCount}</td>
                  <td className="px-4 py-2">{coach.customWorkoutsCount}</td>
                  <td className="px-4 py-2">{coach.customExercisesCount}</td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/gc-fitness/admin/coaches/${coach.uid}`}
                      className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Recent coach activity</h2>
          <p className="text-xs text-muted-foreground">
            High-level usage events: habits, workout templates/assignments, pre-provisioning and first client logins.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">When (UTC)</th>
                <th className="px-4 py-2 font-medium">Coach</th>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {recentCoachActivity.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-3 text-xs text-muted-foreground" colSpan={5}>
                    No recent coach activity found.
                  </td>
                </tr>
              ) : (
                recentCoachActivity.map((row) => (
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
                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.kind}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-1">
        <div className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-semibold text-red-700">Delete coach (cascade)</p>
          <p className="text-xs text-muted-foreground">Step 1: preview impact. Step 2: execute.</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Direct: coach auth account + <code>users/{`{coachUid}`}</code>.</li>
            <li>Cascade: linked clients (and their own cascade), templates, custom exercises, chats, mirrors.</li>
          </ul>
          <form action="/gc-fitness/admin" method="get" className="space-y-2">
            <input type="hidden" name="deleteTarget" value="coach" />
            <input
              name="targetUid"
              required
              placeholder="coach uid"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
            <AdminSubmitButton
              idleLabel="Preview deletion (dry run)"
              pendingLabel="Previewing..."
              className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted"
            />
          </form>
          {coachPreview ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Preview result</p>
              <p>Total docs approx: {coachPreview.totalApprox}</p>
              <p>linked clients: {coachPreview.clients}</p>
              <p>workout_templates: {coachPreview.workoutTemplates}</p>
              <p>exercises: {coachPreview.exercises}</p>
              <p>user_mirror: {coachPreview.userMirror}</p>
              <p>chats: {coachPreview.chats}</p>
            </div>
          ) : null}
          <form action={deleteCoachAction} className="space-y-2">
            <input
              name="coachUid"
              required
              defaultValue={deleteTarget === "coach" ? targetUid : ""}
              placeholder="coach uid (same as preview)"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
            <input
              name="confirmation"
              required
              placeholder='Type exactly: DELETE COACH'
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
            <AdminSubmitButton
              idleLabel="Confirm and delete coach"
              pendingLabel="Deleting coach..."
              name="mode"
              value="execute"
              className="h-10 rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800"
            />
          </form>
        </div>
      </section>
    </div>
  );
}
