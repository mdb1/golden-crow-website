import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
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
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import {
  deleteClientCascade,
  deactivateClientForCoach,
  getDeletionTargetInfo,
  getCoachAdminDetail,
  listCoachesForAdmin,
  previewClientCascade,
  removePendingClientForCoach,
  transferClientToCoach,
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

  // Destination coaches for the transfer control — every coach except this one.
  const allCoaches = await listCoachesForAdmin();
  const otherCoaches = allCoaches.filter((coach) => coach.uid !== detail.coach.uid);

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
  const canExecuteClientDelete = previewClientUid.length > 0 && clientPreview !== null;

  async function deactivateClientAction(formData: FormData) {
    "use server";
    const coachUid = String(formData.get("coachUid") ?? "");
    const clientUid = String(formData.get("clientUid") ?? "");
    await deactivateClientForCoach({ coachUid, clientUid });
    revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
  }

  async function transferClientAction(formData: FormData) {
    "use server";
    const coachUid = String(formData.get("coachUid") ?? "");
    const clientUid = String(formData.get("clientUid") ?? "");
    const newCoachUid = String(formData.get("newCoachUid") ?? "");
    await transferClientToCoach({ clientUid, newCoachUid });
    revalidatePath(`/gc-fitness/admin/coaches/${coachUid}`);
    redirect(`/gc-fitness/admin/coaches/${coachUid}?op=transfer_client&ok=1`);
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
      <PageHeader
        title="Coach detail"
        subtitle={
          <>
            {detail.coach.displayName || "—"} · {detail.coach.email}
            <span className="mt-0.5 block font-mono text-xs">{detail.coach.uid}</span>
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin">Back to admin</Link>
          </Button>
        }
      />

      {actionMessage ? (
        <div className="rounded-2xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-4 py-3 text-sm text-[color:var(--badge-success-fg)]">
          {actionMessage}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="Clients" value={detail.coach.clientsCount} />
        <Metric label="Custom workouts" value={detail.coach.customWorkoutsCount} />
        <Metric label="Custom exercises" value={detail.coach.customExercisesCount} />
        <Metric label="Assignments" value={detail.workoutAssignmentsCount} />
        <Metric label="Habits" value={detail.habitsCount} />
        <Metric label="Chats" value={detail.chatsCount} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Linked clients</CardTitle>
          <CardDescription>Current coach-client relationship and quick actions.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>UID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.linkedClients.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={4}>
                      No linked clients.
                    </TableCell>
                  </TableRow>
                ) : (
                  detail.linkedClients.map((client) => (
                    <TableRow key={client.uid}>
                      <TableCell>
                        <div className="font-medium">
                          <Link
                            href={`/gc-fitness/admin/coaches/${detail.coach.uid}/clients/${client.uid}`}
                            className="text-primary hover:underline"
                          >
                            {client.displayName || "—"}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">{client.email}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{client.uid}</TableCell>
                      <TableCell>
                        {client.deleted ? <Badge variant="secondary">deleted</Badge> : <Badge variant="success">active</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {!client.deleted && otherCoaches.length > 0 ? (
                            <form action={transferClientAction} className="flex items-center gap-1">
                              <input type="hidden" name="coachUid" value={detail.coach.uid} />
                              <input type="hidden" name="clientUid" value={client.uid} />
                              <select
                                name="newCoachUid"
                                required
                                defaultValue=""
                                aria-label={`Transfer ${client.displayName || client.email} to coach`}
                                className="h-8 max-w-[12rem] rounded-md border bg-background px-2 text-xs"
                              >
                                <option value="" disabled>
                                  Transfer to…
                                </option>
                                {otherCoaches.map((coach) => (
                                  <option key={coach.uid} value={coach.uid}>
                                    {coach.displayName || coach.email}
                                  </option>
                                ))}
                              </select>
                              <AdminSubmitButton
                                idleLabel="Transfer"
                                pendingLabel="Transferring..."
                                className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                              />
                            </form>
                          ) : null}
                          {!client.deleted ? (
                            <form action={deactivateClientAction}>
                              <input type="hidden" name="coachUid" value={detail.coach.uid} />
                              <input type="hidden" name="clientUid" value={client.uid} />
                              <AdminSubmitButton
                                idleLabel="Deactivate"
                                pendingLabel="Deactivating..."
                                className="inline-flex h-8 items-center rounded-md border border-destructive/60 px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
                              />
                            </form>
                          ) : null}
                          <Button asChild variant="outline" size="sm" className="rounded-full">
                            <Link href={`/gc-fitness/admin/coaches/${detail.coach.uid}?clientUid=${encodeURIComponent(client.uid)}`}>
                              Use in delete
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/35">
        <CardHeader>
          <CardTitle className="text-destructive">Delete client (cascade)</CardTitle>
          <CardDescription>
            Step 1: preview impact. Step 2: execute with explicit confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Direct: auth account + users/{`{clientUid}`}</li>
            <li>Cascade: chat, workout logs, assignments, habits, goals, notes and progress photos metadata.</li>
            <li>The coach link is removed because the client document is deleted.</li>
          </ul>

          <form method="get" action={`/gc-fitness/admin/coaches/${detail.coach.uid}`} className="space-y-2">
            <Input name="clientUid" required defaultValue={previewClientUid} placeholder="client uid" />
            <AdminSubmitButton
              idleLabel="Preview deletion (dry run)"
              pendingLabel="Previewing..."
              className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted"
            />
          </form>

          {clientPreview ? (
            <div className="rounded-2xl border border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] p-4 text-xs">
              <p className="font-semibold text-[color:var(--badge-warning-fg)]">Preview result</p>
              {targetInfo?.exists ? (
                <p className="mt-1 text-muted-foreground">
                  Target: {targetInfo.role ?? "unknown"} · {targetInfo.displayName || targetInfo.email || "—"}
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">Target not found in users collection.</p>
              )}
              <div className="mt-2 grid grid-cols-2 gap-1 text-muted-foreground sm:grid-cols-3">
                <span>Total approx: {clientPreview.totalApprox}</span>
                <span>chat: {clientPreview.chatDocExists ? "yes" : "no"}</span>
                <span>logs: {clientPreview.workoutLogs}</span>
                <span>assignments: {clientPreview.workoutAssignments}</span>
                <span>habits: {clientPreview.habits}</span>
                <span>habit logs: {clientPreview.habitLogs}</span>
                <span>goals: {clientPreview.clientGoals}</span>
                <span>notes: {clientPreview.clientNotes}</span>
                <span>photos: {clientPreview.progressPhotos}</span>
              </div>
            </div>
          ) : null}

          <form action={deleteClientAction} className="space-y-2">
            <input type="hidden" name="coachUid" value={detail.coach.uid} />
            <Input
              name="clientUid"
              required
              defaultValue={previewClientUid}
              placeholder="client uid (same as preview)"
            />
            <Input name="confirmation" required placeholder="Type exactly: DELETE CLIENT" />
            <AdminSubmitButton
              idleLabel="Confirm and delete client"
              pendingLabel="Deleting client..."
              disabled={!canExecuteClientDelete}
              className="h-10 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
            />
            {!canExecuteClientDelete ? (
              <p className="text-xs text-muted-foreground">Run dry run first to enable delete.</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Pending clients</CardTitle>
          <CardDescription>Pre-provisioned clients in user_mirror for this coach.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.pendingClients.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={3}>
                      No pending clients.
                    </TableCell>
                  </TableRow>
                ) : (
                  detail.pendingClients.map((pending) => (
                    <TableRow key={pending.email}>
                      <TableCell>{pending.email}</TableCell>
                      <TableCell>{pending.displayName || "—"}</TableCell>
                      <TableCell className="text-right">
                        <form action={removePendingAction} className="inline-block">
                          <input type="hidden" name="coachUid" value={detail.coach.uid} />
                          <input type="hidden" name="email" value={pending.email} />
                          <AdminSubmitButton
                            idleLabel="Remove pending"
                            pendingLabel="Removing..."
                            className="inline-flex h-8 items-center rounded-md border border-destructive/60 px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
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
          <CardTitle className="text-xl">Recent admin operations (target coach)</CardTitle>
          <CardDescription>From `admin_operations`.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When (UTC)</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.recentOperations.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={5}>
                      No admin operations yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  detail.recentOperations.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell>{op.createdAtISO ?? "—"}</TableCell>
                      <TableCell>{op.kind}</TableCell>
                      <TableCell>{op.mode}</TableCell>
                      <TableCell>{op.status}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{op.errorMessage ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm" className="gap-2">
      <CardHeader className="pb-0">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
