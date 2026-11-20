import { FormSelect } from "@/components/gc-fitness/form-select";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

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
  getDeletionTargetInfo,
  getCoachAdminDetail,
  listCoachOptionsForAdmin,
  previewClientCascade,
} from "@/lib/gc-fitness/admin-actions";
import { loadCoachAdminOverview } from "@/lib/gc-fitness/admin-coach-overview";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { CoachClientsTable } from "./_components/CoachClientsTable";
import {
  CoachActivityCard,
  CoachBillingCard,
  CoachChallengesCard,
  CoachEngagementCards,
  CoachOverviewKpis,
  CoachProgramsCard,
  PendingInvitesTable,
} from "./_components/CoachOverviewSections";
import { AdminActionForm } from "../../_components/admin-action-form";
import { AdminSubmitButton } from "../../_components/admin-submit-button";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import {
  deactivateClientAction,
  deleteClientAction,
  disableCoachAction,
  reactivateCoachAction,
  removePendingAction,
  transferClientAction,
  unlinkClientAction,
} from "./actions";

// Tab title: "Corvo - <adminPanel>" (issue #170).
export const generateMetadata = () => sectionMetadata("adminPanel");

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
  const t = await getTranslations("admin.coachDetail");
  const tc = await getTranslations("admin.common");
  const to = await getTranslations("admin.coachDetail.overview");
  const actionMessage = op && ok === "1" ? tc("actionCompleted", { op }) : null;
  const coachDisabled = detail.coachDisabled === true;

  // Destination coaches for the transfer control — every coach except this one.
  // #534: the projected option list, not `listCoachesForAdmin` (4 reads × every coach).
  const [allCoaches, overview] = await Promise.all([
    listCoachOptionsForAdmin(),
    getTrainerTimezone().then((fallbackTimezone) => loadCoachAdminOverview(uid, { fallbackTimezone })),
  ]);
  const otherCoaches = allCoaches.filter((coach) => coach.uid !== detail.coach.uid);
  const auditHref = (extra = "") =>
    `/gc-fitness/admin/audit?tab=timeline&coach=${encodeURIComponent(detail.coach.email || detail.coach.uid)}${extra}`;
  const clientNames = Object.fromEntries(
    overview.clients.map((c) => [c.uid, c.displayName || c.email || c.uid]),
  );
  const activeClients = overview.clients.filter((c) => !c.deleted).length;

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

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={
          <>
            {detail.coach.displayName || "—"} · {detail.coach.email}
            <span className="mt-0.5 block font-mono text-xs">{detail.coach.uid}</span>
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin">
              <ArrowLeft className="h-4 w-4" />
              {tc("backToAdmin")}
            </Link>
          </Button>
        }
      />

      {actionMessage ? (
        <div className="rounded-2xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-4 py-3 text-sm text-[color:var(--badge-success-fg)]">
          {actionMessage}
        </div>
      ) : null}

      <Card className={coachDisabled ? "border-destructive/35" : undefined}>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
            {t("access.title")}
            {coachDisabled ? (
              <Badge variant="destructive" data-testid="coach-disabled-badge">
                {t("access.disabledBadge")}
              </Badge>
            ) : (
              <Badge variant="success">{t("access.activeBadge")}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {coachDisabled ? t("access.disabledDescription") : t("access.activeDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coachDisabled ? (
            <AdminActionForm action={reactivateCoachAction.bind(null, detail.coach.uid)}>
              <AdminSubmitButton
                idleLabel={t("access.reactivate")}
                pendingLabel={t("access.reactivating")}
                className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
              />
            </AdminActionForm>
          ) : (
            <AdminActionForm
              action={disableCoachAction.bind(null, detail.coach.uid)}
              confirmMessage={t("access.disableConfirm", {
                name: detail.coach.displayName || detail.coach.email || detail.coach.uid,
              })}
            >
              <AdminSubmitButton
                idleLabel={t("access.disable")}
                pendingLabel={t("access.disabling")}
                className="inline-flex h-9 items-center rounded-md border border-destructive/60 px-4 text-sm font-medium text-destructive hover:bg-destructive/10"
              />
            </AdminActionForm>
          )}
        </CardContent>
      </Card>

      <CoachOverviewKpis activeClients={activeClients} engagement={overview.engagement} billing={overview.billing} />

      <section className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label={tc("clients")} value={detail.coach.clientsCount} />
        <Metric label={tc("customWorkouts")} value={detail.coach.customWorkoutsCount} />
        <Metric label={tc("customExercises")} value={detail.coach.customExercisesCount} />
        <Metric label={t("metrics.assignments")} value={detail.workoutAssignmentsCount} />
        <Metric label={t("metrics.habits")} value={detail.habitsCount} />
        <Metric label={t("metrics.chats")} value={detail.chatsCount} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-xl">
            {to("clients.title")}
            <Link href={auditHref()} className="text-xs font-normal text-primary hover:underline">
              {to("auditLink")}
            </Link>
          </CardTitle>
          <CardDescription>{to("clients.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <CoachClientsTable
            coachUid={detail.coach.uid}
            rows={overview.clients}
            nowMs={overview.nowMs}
            timezone={overview.timezone}
            actions={Object.fromEntries(
              overview.clients.map((client) => [
                client.uid,
                <details key={client.uid} className="inline-block text-left">
                  <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md border px-3 text-xs font-medium hover:bg-muted">
                    {tc("action")}
                  </summary>
                  {/* Inline (not a floating popover): the table scrolls, a popover would be clipped. */}
                  <div className="mt-1 w-max max-w-[22rem] rounded-xl border bg-popover p-2">
                    <div className="flex flex-col items-stretch gap-2">
                          {!client.deleted && otherCoaches.length > 0 ? (
                            <AdminActionForm action={transferClientAction} className="flex flex-wrap items-center gap-1">
                              <input type="hidden" name="coachUid" value={detail.coach.uid} />
                              <input type="hidden" name="clientUid" value={client.uid} />
                              <FormSelect
                                name="newCoachUid"
                                required
                                defaultValue=""
                                aria-label={t("linked.transferLabel", { name: client.displayName || client.email })}
                                placeholder={t("linked.transferTo")}
                                className="w-auto max-w-[12rem] text-xs"
                                options={otherCoaches.map((coach) => ({ value: coach.uid, label: coach.displayName || coach.email }))}
                              />
                              <AdminSubmitButton
                                idleLabel={t("linked.transfer")}
                                pendingLabel={t("linked.transferring")}
                                className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                              />
                            </AdminActionForm>
                          ) : null}
                          {/* Ends the coaching relationship WITHOUT deleting
                              anything: the person keeps their data and shows up
                              under Admin → Coach-less users. */}
                          <AdminActionForm action={unlinkClientAction}>
                            <input type="hidden" name="coachUid" value={detail.coach.uid} />
                            <input type="hidden" name="clientUid" value={client.uid} />
                            <AdminSubmitButton
                              idleLabel={t("linked.unlink")}
                              pendingLabel={tc("removing")}
                              title={t("linked.unlinkTitle")}
                              className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                            />
                          </AdminActionForm>
                          {!client.deleted ? (
                            <AdminActionForm action={deactivateClientAction}>
                              <input type="hidden" name="coachUid" value={detail.coach.uid} />
                              <input type="hidden" name="clientUid" value={client.uid} />
                              <AdminSubmitButton
                                idleLabel={t("linked.deactivate")}
                                pendingLabel={t("linked.deactivating")}
                                className="inline-flex h-8 items-center rounded-md border border-destructive/60 px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
                              />
                            </AdminActionForm>
                          ) : null}
                          <Button asChild variant="outline" size="sm" className="rounded-full">
                            <Link href={`/gc-fitness/admin/coaches/${detail.coach.uid}?clientUid=${encodeURIComponent(client.uid)}`}>
                              {t("linked.useInDelete")}
                            </Link>
                          </Button>
                        </div>
                  </div>
                </details>,
              ]),
            )}
          />
        </CardContent>
      </Card>

      <CoachBillingCard billing={overview.billing} clientNames={clientNames} auditHref={auditHref("&cat=billing")} />

      <CoachProgramsCard nutrition={overview.nutrition} habits={overview.habits} />

      <CoachChallengesCard challenges={overview.challenges} />

      <CoachEngagementCards
        checklist={overview.checklist}
        corvo={overview.corvo}
        social={overview.social}
        timezone={overview.timezone}
      />

      <CoachActivityCard activity={overview.activity} timezone={overview.timezone} />

      <Card className="border-destructive/35">
        <CardHeader>
          <CardTitle className="text-destructive">{t("deleteClient.title")}</CardTitle>
          <CardDescription>{t("deleteClient.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>{t("deleteClient.direct")}</li>
            <li>{t("deleteClient.cascade")}</li>
            <li>{t("deleteClient.link")}</li>
          </ul>

          <form method="get" action={`/gc-fitness/admin/coaches/${detail.coach.uid}`} className="space-y-2">
            <Input name="clientUid" required defaultValue={previewClientUid} placeholder={t("deleteClient.uidPlaceholder")} />
            <AdminSubmitButton
              idleLabel={tc("previewDeletion")}
              pendingLabel={tc("previewing")}
              className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted"
            />
          </form>

          {clientPreview ? (
            <div className="rounded-2xl border border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] p-4 text-xs">
              <p className="font-semibold text-[color:var(--badge-warning-fg)]">{tc("previewResult")}</p>
              {targetInfo?.exists ? (
                <p className="mt-1 text-muted-foreground">
                  {t("deleteClient.target", { role: targetInfo.role ?? t("deleteClient.unknownRole"), name: targetInfo.displayName || targetInfo.email || "—" })}
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">{t("deleteClient.targetNotFound")}</p>
              )}
              <div className="mt-2 grid grid-cols-2 gap-1 text-muted-foreground sm:grid-cols-3">
                <span>{t("preview.total", { count: clientPreview.totalApprox })}</span>
                <span>{t("preview.chat", { value: clientPreview.chatDocExists ? tc("yes") : tc("no") })}</span>
                <span>{t("preview.logs", { count: clientPreview.workoutLogs })}</span>
                <span>{t("preview.assignments", { count: clientPreview.workoutAssignments })}</span>
                <span>{t("preview.habits", { count: clientPreview.habits })}</span>
                <span>{t("preview.habitLogs", { count: clientPreview.habitLogs })}</span>
                <span>{t("preview.goals", { count: clientPreview.clientGoals })}</span>
                <span>{t("preview.notes", { count: clientPreview.clientNotes })}</span>
                <span>{t("preview.photos", { count: clientPreview.progressPhotos })}</span>
              </div>
            </div>
          ) : null}

          <AdminActionForm action={deleteClientAction} className="space-y-2">
            <input type="hidden" name="coachUid" value={detail.coach.uid} />
            <Input
              name="clientUid"
              required
              defaultValue={previewClientUid}
              placeholder={t("deleteClient.uidSamePlaceholder")}
            />
            <Input name="confirmation" required placeholder={tc("typeExactly", { phrase: "DELETE CLIENT" })} />
            <AdminSubmitButton
              idleLabel={t("deleteClient.submit")}
              pendingLabel={t("deleteClient.pending")}
              disabled={!canExecuteClientDelete}
              className="h-10 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
            />
            {!canExecuteClientDelete ? (
              <p className="text-xs text-muted-foreground">{t("deleteClient.dryRunFirst")}</p>
            ) : null}
          </AdminActionForm>
        </CardContent>
      </Card>

      <PendingInvitesTable
        invites={overview.invites}
        timezone={overview.timezone}
        actions={Object.fromEntries(
          overview.invites.map((pending) => [
            pending.email,
            <AdminActionForm key={pending.email} action={removePendingAction} className="inline-block">
              <input type="hidden" name="coachUid" value={detail.coach.uid} />
              <input type="hidden" name="email" value={pending.email} />
              <AdminSubmitButton
                idleLabel={t("pending.remove")}
                pendingLabel={tc("removing")}
                className="inline-flex h-8 items-center rounded-md border border-destructive/60 px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
              />
            </AdminActionForm>,
          ]),
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("operations.title")}</CardTitle>
          <CardDescription>{t("operations.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("operations.when")}</TableHead>
                  <TableHead>{t("operations.kind")}</TableHead>
                  <TableHead>{t("operations.mode")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                  <TableHead>{t("operations.error")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.recentOperations.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={5}>
                      {t("operations.empty")}
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
