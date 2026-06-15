import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  addCoachEmailToAllowlist,
  deleteCoachCascade,
  listCoachesForAdmin,
  listCoachAllowlist,
  removeCoachEmailFromAllowlist,
  previewCoachCascade,
  promoteUserToAdmin,
} from "@/lib/gc-fitness/admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { AdminSubmitButton } from "./_components/admin-submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/gc-fitness/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <adminPanel>" (issue #170).
export const generateMetadata = () => sectionMetadata("adminPanel");

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
  const canExecuteCoachDelete =
    deleteTarget === "coach" &&
    targetUid.length > 0 &&
    coachPreview !== null;

  const coaches = await listCoachesForAdmin();
  const allowlistRows = await listCoachAllowlist();

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
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title="Admin Console"
        subtitle="GC Fitness operator tools. Multi-role is enabled: a user can be trainer and admin at the same time."
      />

      {actionMessage ? (
        <div className="rounded-2xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-4 py-3 text-sm text-[color:var(--badge-success-fg)]">
          {actionMessage}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">App version (force update)</CardTitle>
          <CardDescription>
            Set the minimum supported app build per platform. Clients on an
            older build are forced to update before they can use the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/gc-fitness/admin/app-config">Manage app version</Link>
          </Button>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Add coach email to allowlist</CardTitle>
            <CardDescription>Store pending coach access emails in Firestore allowlist.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addAllowlistEmailAction} className="space-y-3">
              <Input name="email" type="email" required placeholder="coach@email.com" />
              <AdminSubmitButton idleLabel="Add email" pendingLabel="Adding..." className="h-10" />
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Promote existing user to admin</CardTitle>
            <CardDescription>Keeps trainer role and adds admin role (`trainer` + `admin`) in custom claims.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={promoteToAdminAction} className="space-y-3">
              <Input name="email" type="email" required placeholder="user@email.com" />
              <AdminSubmitButton idleLabel="Promote user" pendingLabel="Promoting..." className="h-10" />
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Coach allowlist</CardTitle>
          <CardDescription>Pending allowlist emails (already-trainer emails are hidden).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Updated at (UTC)</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allowlistRows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground" colSpan={4}>
                      No allowlist entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  allowlistRows.map((row) => (
                    <TableRow key={row.email}>
                      <TableCell className="font-medium">{row.email}</TableCell>
                      <TableCell>{row.enabled ? "yes" : "no"}</TableCell>
                      <TableCell>{row.updatedAtISO ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <form action={removeAllowlistEmailAction}>
                          <input type="hidden" name="email" value={row.email} />
                          <AdminSubmitButton
                            idleLabel="Remove"
                            pendingLabel="Removing..."
                            className="h-8 border border-destructive/60 bg-transparent px-3 text-xs text-destructive hover:bg-destructive/10"
                          />
                        </form>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">User search</CardTitle>
          <CardDescription>Find any user (client, coach, or admin) by email and open their profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/users">Open user search</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Coaches</CardTitle>
          <CardDescription>Email, roles, clients, custom workouts, custom exercises.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coach</TableHead>
                  <TableHead>UID</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Clients</TableHead>
                  <TableHead>Custom workouts</TableHead>
                  <TableHead>Custom exercises</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coaches.map((coach) => (
                  <TableRow key={coach.uid}>
                    <TableCell>
                      <Link href={`/gc-fitness/admin/coaches/${coach.uid}`} className="font-medium underline underline-offset-2">
                        {coach.displayName || "—"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{coach.email}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{coach.uid}</TableCell>
                    <TableCell>{coach.roles.join(", ") || "trainer"}</TableCell>
                    <TableCell>{coach.clientsCount}</TableCell>
                    <TableCell>{coach.customWorkoutsCount}</TableCell>
                    <TableCell>{coach.customExercisesCount}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm" className="rounded-full">
                        <Link href={`/gc-fitness/admin/coaches/${coach.uid}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Recent coach activity</CardTitle>
          <CardDescription>Open the dedicated activity view with recurrence grouping and event details.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/coach-activity">Open recent coach activity</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Monitoring &amp; observability</CardTitle>
          <CardDescription>
            Unified, time-ordered trail of coach actions and admin operations, plus a
            deletion history (who removed what, and when) for incident traceability.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/audit">Open monitoring dashboard</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Data hygiene</CardTitle>
          <CardDescription>Scan for orphaned users, chats, images, workouts and other suspicious records.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/hygiene">Open hygiene dashboard</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/35">
        <CardHeader>
          <CardTitle className="text-destructive">Delete coach (cascade)</CardTitle>
          <CardDescription>
            Step 1: preview impact. Step 2: execute delete with explicit confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/gc-fitness/admin" method="get" className="space-y-3">
            <input type="hidden" name="deleteTarget" value="coach" />
            <Input name="targetUid" required placeholder="coach uid" defaultValue={targetUid} />
            <Button type="submit" variant="outline" className="rounded-full">Preview deletion (dry run)</Button>
          </form>

          {coachPreview ? (
            <div className="rounded-2xl border border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] p-4 text-sm text-[color:var(--badge-warning-fg)]">
              <p className="font-semibold">Preview result</p>
              <p className="mt-1 text-xs opacity-80">Total docs approx: {coachPreview.totalApprox}</p>
            </div>
          ) : null}

          <form action={deleteCoachAction} className="space-y-3">
            <Input name="coachUid" required placeholder="coach uid (same as preview)" defaultValue={targetUid} />
            <Input name="confirmation" required placeholder="Type exactly: DELETE COACH" />
            <input type="hidden" name="mode" value="execute" />
            <AdminSubmitButton
              idleLabel="Confirm and delete coach"
              pendingLabel="Deleting..."
              disabled={!canExecuteCoachDelete}
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
