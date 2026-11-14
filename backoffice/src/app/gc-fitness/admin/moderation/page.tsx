// /gc-fitness/admin/moderation — the moderation queue (gc-fitness #1050, S10).
//
// App Store guideline 1.2 (user-generated content) requires that reported
// content be acted on within 24 hours. This page is that: every open report,
// grouped by the thing reported (three reports on one profile are ONE row), the
// content in context, a visible SLA clock, and three verbs — Ocultar, Suspender,
// Descartar — each written to `admin_operations` with the actor.
//
// Filters are a plain GET form; the verbs are Server Actions in
// `moderation-actions.ts`. The rows are rendered by `ModerationQueue`, a client
// component only because the destructive verbs go through `window.confirm`.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { PillTabs } from "@/components/gc-fitness/pill-tabs";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { listModerationQueue, type ModerationQueuePage } from "@/lib/gc-fitness/moderation-actions";
import {
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  isReportStatus,
  isReportTargetType,
  type ReportStatus,
  type ReportTargetType,
} from "@/lib/gc-fitness/moderation-model";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

import { ModerationQueue } from "./_components/ModerationQueue";

export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    throw err;
  }

  const sp = await searchParams;
  const status: ReportStatus = isReportStatus(str(sp.status)) ? (str(sp.status) as ReportStatus) : "open";
  const targetType: ReportTargetType | "all" = isReportTargetType(str(sp.type))
    ? (str(sp.type) as ReportTargetType)
    : "all";
  const op = str(sp.op);
  const tm = await getTranslations("admin.moderation");
  const tc = await getTranslations("admin.common");
  const opLabel = (value: string): string => {
    switch (value) {
      case "hide":
        return tm("ops.hide");
      case "suspend":
        return tm("ops.suspend");
      case "dismiss":
        return tm("ops.dismiss");
      case "unsuspend":
        return tm("ops.unsuspend");
      case "unhide":
        return tm("ops.unhide");
      default:
        return tc("actionCompleted", { op: value });
    }
  };
  const statusLabel = (value: ReportStatus): string => {
    switch (value) {
      case "open":
        return tm("status.open");
      case "actioned":
        return tm("status.actioned");
      case "dismissed":
        return tm("status.dismissed");
    }
  };
  const targetTypeLabel = (type: ReportTargetType): string => {
    switch (type) {
      case "profile":
        return tm("targetType.profile");
      case "routine":
        return tm("targetType.routine");
      case "comment":
        return tm("targetType.comment");
      case "message":
        return tm("targetType.message");
      case "challenge":
        return tm("targetType.challenge");
    }
  };
  const banner = op && str(sp.ok) === "1" ? opLabel(op) : null;

  let page: ModerationQueuePage | null = null;
  let loadError = false;
  try {
    page = await listModerationQueue({ status, targetType });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    loadError = true;
  }

  const hrefFor = (nextStatus: ReportStatus, nextType: ReportTargetType | "all") => {
    const params = new URLSearchParams();
    if (nextStatus !== "open") params.set("status", nextStatus);
    if (nextType !== "all") params.set("type", nextType);
    const query = params.toString();
    return `/gc-fitness/admin/moderation${query ? `?${query}` : ""}`;
  };

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={tm("title")}
        subtitle={tm("subtitle")}
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin">
              <ArrowLeft className="h-4 w-4" />
              {tc("backToAdmin")}
            </Link>
          </Button>
        }
      />

      {banner ? (
        <div
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-foreground"
          data-testid="moderation-banner"
        >
          {banner}
        </div>
      ) : null}

      <PillTabs
        activeKey={status}
        items={REPORT_STATUSES.map((s) => ({
          key: s,
          label: statusLabel(s),
          count: s === "open" && page ? page.openCount : undefined,
          href: hrefFor(s, targetType),
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{tm("filtersTitle")}</CardTitle>
          <CardDescription>{tm("filtersDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(["all", ...REPORT_TARGET_TYPES] as const).map((type) => (
              <Button
                key={type}
                asChild
                variant={type === targetType ? "default" : "outline"}
                size="sm"
                className="rounded-full"
              >
                <Link href={hrefFor(status, type)}>{type === "all" ? tm("allTypes") : targetTypeLabel(type)}</Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loadError || !page ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {tm("loadError")}
          </CardContent>
        </Card>
      ) : (
        <ModerationQueue groups={page.groups} status={status} nowISO={new Date().toISOString()} />
      )}
    </div>
  );
}
