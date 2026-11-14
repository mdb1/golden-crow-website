import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  listCoachesForAdmin,
  listCoachAllowlist,
  previewCoachCascade,
} from "@/lib/gc-fitness/admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { countOpenReports } from "@/lib/gc-fitness/moderation-actions";
import { AdminActionForm } from "./_components/admin-action-form";
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
import {
  addAllowlistEmailAction,
  deleteCoachAction,
  promoteToAdminAction,
  removeAllowlistEmailAction,
} from "./actions";

// Tab title: "Corvo - <adminPanel>" (issue #170).
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
  const openReportsCount = await countOpenReports().catch(() => 0);
  const tCorvo = await getTranslations("corvoAdmin");
  const t = await getTranslations("admin.home");
  const tc = await getTranslations("admin.common");
  const actionMessage = op && ok === "1" ? tc("actionCompleted", { op }) : null;

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {actionMessage ? (
        <div className="rounded-2xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-4 py-3 text-sm text-[color:var(--badge-success-fg)]">
          {actionMessage}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("coachless.title")}</CardTitle>
          <CardDescription>{t("coachless.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/gc-fitness/admin/coach-less-users">{t("coachless.open")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("appVersion.title")}</CardTitle>
          <CardDescription>{t("appVersion.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/gc-fitness/admin/app-config">{t("appVersion.open")}</Link>
          </Button>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("allowlistAdd.title")}</CardTitle>
            <CardDescription>{t("allowlistAdd.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminActionForm action={addAllowlistEmailAction} className="space-y-3">
              <Input name="email" type="email" required placeholder="coach@email.com" aria-label={t("allowlistAdd.emailLabel")} />
              <AdminSubmitButton idleLabel={t("allowlistAdd.submit")} pendingLabel={t("allowlistAdd.pending")} className="h-10" />
            </AdminActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("promote.title")}</CardTitle>
            <CardDescription>{t("promote.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminActionForm action={promoteToAdminAction} className="space-y-3">
              <Input name="email" type="email" required placeholder="user@email.com" aria-label={t("promote.emailLabel")} />
              <AdminSubmitButton idleLabel={t("promote.submit")} pendingLabel={t("promote.pending")} className="h-10" />
            </AdminActionForm>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("allowlist.title")}</CardTitle>
          <CardDescription>{t("allowlist.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tc("email")}</TableHead>
                  <TableHead>{t("allowlist.enabled")}</TableHead>
                  <TableHead>{t("allowlist.updatedAt")}</TableHead>
                  <TableHead className="text-right">{tc("action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allowlistRows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground" colSpan={4}>
                      {t("allowlist.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  allowlistRows.map((row) => (
                    <TableRow key={row.email}>
                      <TableCell className="font-medium">{row.email}</TableCell>
                      <TableCell>{row.enabled ? tc("yes") : tc("no")}</TableCell>
                      <TableCell>{row.updatedAtISO ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <AdminActionForm action={removeAllowlistEmailAction}>
                          <input type="hidden" name="email" value={row.email} />
                          <AdminSubmitButton
                            idleLabel={tc("remove")}
                            pendingLabel={tc("removing")}
                            className="h-8 border border-destructive/60 bg-transparent px-3 text-xs text-destructive hover:bg-destructive/10"
                          />
                        </AdminActionForm>
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
          <CardTitle className="text-xl">{t("userSearch.title")}</CardTitle>
          <CardDescription>{t("userSearch.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/users">{t("userSearch.open")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("coaches.title")}</CardTitle>
          <CardDescription>{t("coaches.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("coaches.coach")}</TableHead>
                  <TableHead>{tc("uid")}</TableHead>
                  <TableHead>{t("coaches.roles")}</TableHead>
                  <TableHead>{tc("clients")}</TableHead>
                  <TableHead>{tc("customWorkouts")}</TableHead>
                  <TableHead>{tc("customExercises")}</TableHead>
                  <TableHead className="text-right">{tc("open")}</TableHead>
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
                        <Link href={`/gc-fitness/admin/coaches/${coach.uid}`}>{tc("view")}</Link>
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
          <CardTitle className="text-xl">{t("activity.title")}</CardTitle>
          <CardDescription>{t("activity.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/coach-activity">{t("activity.open")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className={openReportsCount > 0 ? "border-amber-500/50" : undefined}>
        <CardHeader>
          <CardTitle className="text-xl">{t("moderation.title")}</CardTitle>
          <CardDescription>
            {t("moderation.description")} {t("moderation.openReports", { count: openReportsCount })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/moderation">{t("moderation.open")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{tCorvo("cardTitle")}</CardTitle>
          <CardDescription>{tCorvo("cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/corvo">{tCorvo("openCard")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("monitoring.title")}</CardTitle>
          <CardDescription>{t("monitoring.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/audit">{t("monitoring.open")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("hygiene.title")}</CardTitle>
          <CardDescription>{t("hygiene.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/gc-fitness/admin/hygiene">{t("hygiene.open")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/35">
        <CardHeader>
          <CardTitle className="text-destructive">{t("deleteCoach.title")}</CardTitle>
          <CardDescription>{t("deleteCoach.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/gc-fitness/admin" method="get" className="space-y-3">
            <input type="hidden" name="deleteTarget" value="coach" />
            <Input name="targetUid" required placeholder={t("deleteCoach.uidPlaceholder")} defaultValue={targetUid} />
            <Button type="submit" variant="outline" className="rounded-full">{tc("previewDeletion")}</Button>
          </form>

          {coachPreview ? (
            <div className="rounded-2xl border border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] p-4 text-sm text-[color:var(--badge-warning-fg)]">
              <p className="font-semibold">{tc("previewResult")}</p>
              <p className="mt-1 text-xs opacity-80">{t("deleteCoach.totalDocs", { count: coachPreview.totalApprox })}</p>
            </div>
          ) : null}

          <AdminActionForm action={deleteCoachAction} className="space-y-3">
            <Input name="coachUid" required placeholder={t("deleteCoach.uidSamePlaceholder")} defaultValue={targetUid} />
            <Input name="confirmation" required placeholder={tc("typeExactly", { phrase: "DELETE COACH" })} />
            <input type="hidden" name="mode" value="execute" />
            <AdminSubmitButton
              idleLabel={t("deleteCoach.submit")}
              pendingLabel={tc("deleting")}
              disabled={!canExecuteCoachDelete}
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            />
          </AdminActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
