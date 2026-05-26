import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  addCoachEmailToAllowlist,
  deleteClientCascade,
  deleteCoachCascade,
  listCoachesForAdmin,
  promoteUserToAdmin,
} from "@/lib/gc-fitness/admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  const coaches = await listCoachesForAdmin();

  async function addAllowlistEmailAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    await addCoachEmailToAllowlist(email);
    revalidatePath("/gc-fitness/admin");
  }

  async function promoteToAdminAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    await promoteUserToAdmin({ email, keepTrainer: true });
    revalidatePath("/gc-fitness/admin");
  }

  async function deleteClientAction(formData: FormData) {
    "use server";
    const clientUid = String(formData.get("clientUid") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    const mode = String(formData.get("mode") ?? "dry_run");
    await deleteClientCascade({ clientUid, confirmation, mode });
    revalidatePath("/gc-fitness/admin");
  }

  async function deleteCoachAction(formData: FormData) {
    "use server";
    const coachUid = String(formData.get("coachUid") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    const mode = String(formData.get("mode") ?? "dry_run");
    await deleteCoachCascade({ coachUid, confirmation, mode });
    revalidatePath("/gc-fitness/admin");
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
          <button
            type="submit"
            className="h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add email
          </button>
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
          <button
            type="submit"
            className="h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
          >
            Promote user
          </button>
        </form>
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

      <section className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2">
        <form action={deleteClientAction} className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-semibold text-red-700">Delete client (cascade)</p>
          <p className="text-xs text-muted-foreground">
            Deletes client user, auth account, logs, habits, chat, goals, notes and progress photos
            metadata.
          </p>
          <input
            name="clientUid"
            required
            placeholder="client uid"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <input
            name="confirmation"
            required
            placeholder="Type: DELETE CLIENT"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            name="mode"
            value="dry_run"
            className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted"
          >
            Dry run
          </button>
          <button
            type="submit"
            name="mode"
            value="execute"
            className="h-10 rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800"
          >
            Delete client
          </button>
        </form>

        <form action={deleteCoachAction} className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-semibold text-red-700">Delete coach (cascade)</p>
          <p className="text-xs text-muted-foreground">
            Deletes coach auth/profile and cascades through linked clients plus coach-owned templates,
            exercises, chats, and mirrors.
          </p>
          <input
            name="coachUid"
            required
            placeholder="coach uid"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <input
            name="confirmation"
            required
            placeholder="Type: DELETE COACH"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            name="mode"
            value="dry_run"
            className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted"
          >
            Dry run
          </button>
          <button
            type="submit"
            name="mode"
            value="execute"
            className="h-10 rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800"
          >
            Delete coach
          </button>
        </form>
      </section>
    </div>
  );
}
