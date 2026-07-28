import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AdminSubmitButton } from "../_components/admin-submit-button";
import { Button } from "@/components/ui/button";
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
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import {
  listCoachlessUsersWithStats,
  setUserEntitlementTier,
  deleteCoachlessUser,
} from "@/lib/gc-fitness/admin-coachless-actions";
import { resolveDisplayTier } from "@/lib/gc-fitness/coachless-user-model";

export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

const ROUTE = "/gc-fitness/admin/coach-less-users";

function formatDate(iso: string | null): string {
  // Stable YYYY-MM-DD (avoids the server-locale flake seen in date tests).
  return iso ? iso.slice(0, 10) : "—";
}

export default async function CoachlessUsersPage({
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
  const ok = sp.ok === "1";
  const actionMessage = op && ok ? `Action completed: ${op}.` : null;

  const rows = await listCoachlessUsersWithStats();

  async function setTierAction(formData: FormData) {
    "use server";
    const uid = String(formData.get("uid") ?? "");
    const tier = String(formData.get("tier") ?? "");
    await setUserEntitlementTier({ uid, tier });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}?op=set_${tier}&ok=1`);
  }

  async function deleteUserAction(formData: FormData) {
    "use server";
    const uid = String(formData.get("uid") ?? "");
    const emailConfirmation = String(formData.get("emailConfirmation") ?? "");
    await deleteCoachlessUser({ uid, emailConfirmation });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}?op=delete_user&ok=1`);
  }

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title="Coach-less users"
        subtitle="Self-serve clients with no coach — subscription status, content stats, and god-mode actions (grant/revoke premium, delete). Click a name to open their full profile."
      />

      <Button asChild variant="outline" size="sm" className="self-start rounded-full">
        <Link href="/gc-fitness/admin">
          <ArrowLeft className="h-4 w-4" />
          Back to admin
        </Link>
      </Button>

      {actionMessage ? (
        <div className="rounded-2xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-4 py-3 text-sm text-[color:var(--badge-success-fg)]">
          {actionMessage}
        </div>
      ) : null}

      <div className="text-sm text-muted-foreground">
        {rows.length} coach-less user{rows.length === 1 ? "" : "s"}.
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead className="text-right">Routines</TableHead>
              <TableHead className="text-right">Habits</TableHead>
              <TableHead className="text-right">Photos</TableHead>
              <TableHead className="text-right">Logs</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-muted-foreground">
                  No coach-less users.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const tier = resolveDisplayTier(row.entitlement);
                const isPremium = tier === "premium";
                return (
                  <TableRow key={row.uid}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {row.photoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.photoURL}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-muted" aria-hidden />
                        )}
                        <div>
                          {/* Row → god-mode profile (activity, routines, habits,
                              logs, photos). The detail page is the only place
                              a coach-less user's content is inspectable. */}
                          <Link
                            href={`${ROUTE}/${row.uid}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {row.displayName || row.email || "—"}
                          </Link>
                          <div className="text-xs text-muted-foreground">{row.email || "—"}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{row.uid}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          isPremium
                            ? "inline-flex rounded-full border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--badge-success-fg)]"
                            : "inline-flex rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {isPremium ? "Premium" : "Free"}
                      </span>
                      {row.entitlement ? (
                        <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                          <div>source: {row.entitlement.source || "—"}</div>
                          {row.entitlement.expiresAtISO ? (
                            <div>expires: {formatDate(row.entitlement.expiresAtISO)}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.stats.routines}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.stats.habits}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.stats.progressPhotos}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.stats.workoutLogs}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(row.createdAtISO)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-2">
                        <form action={setTierAction}>
                          <input type="hidden" name="uid" value={row.uid} />
                          <input type="hidden" name="tier" value={isPremium ? "free" : "premium"} />
                          <AdminSubmitButton
                            idleLabel={isPremium ? "Revoke premium" : "Grant premium"}
                            pendingLabel="Saving…"
                            className="h-8 rounded-full border px-3 text-xs hover:bg-muted"
                          />
                        </form>

                        <details className="text-right">
                          <summary className="cursor-pointer text-xs text-destructive underline underline-offset-2">
                            Delete user
                          </summary>
                          <form action={deleteUserAction} className="mt-2 flex flex-col items-end gap-2">
                            <input type="hidden" name="uid" value={row.uid} />
                            <p className="max-w-[16rem] text-left text-[10px] text-muted-foreground">
                              Irreversible: deletes Auth, all Firestore data, and Storage
                              photos. Type <span className="font-mono">{row.email}</span> to confirm.
                            </p>
                            <Input
                              name="emailConfirmation"
                              placeholder="type email to confirm"
                              className="h-8 w-64 text-xs"
                              autoComplete="off"
                            />
                            <AdminSubmitButton
                              idleLabel="Delete forever"
                              pendingLabel="Deleting…"
                              className="h-8 rounded-full bg-destructive px-3 text-xs text-destructive-foreground hover:bg-destructive/90"
                            />
                          </form>
                        </details>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
