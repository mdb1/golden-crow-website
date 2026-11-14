"use client";

// ModerationQueue — the rows of /gc-fitness/admin/moderation (gc-fitness #1050).
//
// One row per reported TARGET, every report inside it. The verbs are `<form>`s
// whose hidden fields are the whole payload the Server Action reads: target
// type + id + owner, and the ids of the open reports on screen (what the action
// resolves). `window.confirm` gates Ocultar and Suspender — Descartar touches
// nothing, so it does not ask.

import { type FormEvent } from "react";

import { AdminSubmitButton } from "@/app/gc-fitness/admin/_components/admin-submit-button";
import { Card, CardContent } from "@/components/ui/card";
import {
  dismissReports,
  hideReportedContent,
  suspendReportedAuthor,
  unhideReportedContent,
  unsuspendSocialAccount,
} from "@/lib/gc-fitness/moderation-actions";
import { useTranslations } from "next-intl";

import {
  actionsFor,
  reportAgeHours,
  slaState,
  type ModerationGroup,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from "@/lib/gc-fitness/moderation-model";

const SLA_CLASS: Record<ReturnType<typeof slaState>, string> = {
  fresh: "text-muted-foreground",
  "due-soon": "text-amber-600 font-medium",
  breached: "text-destructive font-semibold",
};


function confirmGate(message: string) {
  return (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}

export function ModerationQueue({
  groups,
  status,
  nowISO,
}: {
  groups: ModerationGroup[];
  status: ReportStatus;
  nowISO: string;
}) {
  const now = new Date(nowISO);
  const tm = useTranslations("admin.moderation");
  const ageLabel = (createdAtISO: string | null): string => {
    const hours = reportAgeHours(createdAtISO, now);
    if (hours === null) return tm("age.justNow");
    if (hours < 1) return tm("age.minutes", { count: Math.round(hours * 60) });
    if (hours < 48) return tm("age.hours", { count: Math.round(hours) });
    return tm("age.days", { count: Math.round(hours / 24) });
  };
  const reasonLabel = (reason: ReportReason): string => {
    switch (reason) {
      case "spam":
        return tm("reason.spam");
      case "harassment":
        return tm("reason.harassment");
      case "sexual":
        return tm("reason.sexual");
      case "violence":
        return tm("reason.violence");
      case "impersonation":
        return tm("reason.impersonation");
      case "other":
        return tm("reason.other");
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

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="moderation-empty">
          {status === "open" ? tm("emptyOpen") : tm("emptyOther")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="moderation-queue">
      {groups.map((group) => {
        const sla = status === "open" ? slaState(group.oldestOpenISO, now) : "fresh";
        const openIds = group.reports.filter((r) => r.status === "open").map((r) => r.id);
        const preview = group.preview;
        return (
          <Card key={group.key} data-testid={`moderation-group-${group.targetType}-${group.targetId}`}>
            <CardContent className="flex flex-col gap-4 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                      {targetTypeLabel(group.targetType)}
                    </span>
                    <span className="text-muted-foreground">
                      {tm("reportCount", { count: group.reports.length })}
                    </span>
                    {preview?.hidden ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700">{tm("badges.hidden")}</span>
                    ) : null}
                    {preview?.ownerSuspended ? (
                      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">{tm("badges.suspended")}</span>
                    ) : null}
                    {preview?.missing ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{tm("badges.missing")}</span>
                    ) : null}
                  </div>
                  <div className="text-base font-semibold text-foreground [overflow-wrap:anywhere]">
                    {preview?.title ?? group.targetId}
                  </div>
                  {preview?.body ? (
                    <blockquote className="whitespace-pre-wrap border-l-2 border-muted pl-3 text-sm text-foreground [overflow-wrap:anywhere]">
                      {preview.body}
                    </blockquote>
                  ) : null}
                  <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {tm("idLabel")} <code>{group.targetId}</code>
                    {group.targetOwnerUid ? (
                      <>
                        {" · "}{tm("ownerLabel")} <code>{group.targetOwnerUid}</code>
                      </>
                    ) : null}
                  </div>
                </div>
                {status === "open" ? (
                  <div className={`text-xs ${SLA_CLASS[sla]}`} data-testid="moderation-sla">
                    {sla === "breached" ? `${tm("sla.breached")} · ` : sla === "due-soon" ? `${tm("sla.dueSoon")} · ` : ""}
                    {ageLabel(group.oldestOpenISO)}
                  </div>
                ) : null}
              </div>

              <ul className="flex flex-col gap-1 text-sm">
                {group.reports.map((report) => (
                  <li key={report.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{reasonLabel(report.reason)}</span>
                    <span className="text-xs text-muted-foreground">
                      {tm("byLabel")} <code>{report.reporterUid}</code> · {ageLabel(report.createdAtISO)}
                      {report.status !== "open" && report.resolution ? ` · ${report.resolution}` : ""}
                    </span>
                    {report.note ? (
                      <span className="w-full whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]">
                        “{report.note}”
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2">
                {status === "open"
                  ? actionsFor(group.targetType).map((action) => {
                      const hidden = (
                        <>
                          <input type="hidden" name="targetType" value={group.targetType} />
                          <input type="hidden" name="targetId" value={group.targetId} />
                          <input type="hidden" name="targetOwnerUid" value={group.targetOwnerUid} />
                          <input type="hidden" name="reportIds" value={openIds.join(",")} />
                        </>
                      );
                      if (action === "hide") {
                        return (
                          <form
                            key={action}
                            action={hideReportedContent}
                            onSubmit={confirmGate(tm("confirm.hide"))}
                          >
                            {hidden}
                            <AdminSubmitButton
                              idleLabel={tm("actions.hide")}
                              pendingLabel={tm("actions.hiding")}
                              disabled={preview?.hidden === true}
                              className="rounded-full border border-amber-600/50 px-3 py-1.5 text-sm text-amber-700"
                            />
                          </form>
                        );
                      }
                      if (action === "suspend") {
                        return (
                          <form
                            key={action}
                            action={suspendReportedAuthor}
                            onSubmit={confirmGate(tm("confirm.suspend"))}
                          >
                            {hidden}
                            <AdminSubmitButton
                              idleLabel={tm("actions.suspend")}
                              pendingLabel={tm("actions.suspending")}
                              disabled={preview?.ownerSuspended === true || !group.targetOwnerUid}
                              className="rounded-full border border-destructive/60 px-3 py-1.5 text-sm text-destructive"
                            />
                          </form>
                        );
                      }
                      return (
                        <form key={action} action={dismissReports}>
                          {hidden}
                          <AdminSubmitButton
                            idleLabel={tm("actions.dismiss")}
                            pendingLabel={tm("actions.dismissing")}
                            className="rounded-full border border-input px-3 py-1.5 text-sm text-foreground"
                          />
                        </form>
                      );
                    })
                  : null}

                {preview?.hidden && group.targetType !== "profile" ? (
                  <form action={unhideReportedContent}>
                    <input type="hidden" name="targetType" value={group.targetType} />
                    <input type="hidden" name="targetId" value={group.targetId} />
                    <input type="hidden" name="targetOwnerUid" value={group.targetOwnerUid} />
                    <AdminSubmitButton
                      idleLabel={tm("actions.unhide")}
                      pendingLabel={tm("actions.unhiding")}
                      className="rounded-full border border-input px-3 py-1.5 text-sm text-foreground"
                    />
                  </form>
                ) : null}
                {preview?.ownerSuspended && group.targetOwnerUid ? (
                  <form action={unsuspendSocialAccount}>
                    <input type="hidden" name="uid" value={group.targetOwnerUid} />
                    <AdminSubmitButton
                      idleLabel={tm("actions.unsuspend")}
                      pendingLabel={tm("actions.unsuspending")}
                      className="rounded-full border border-input px-3 py-1.5 text-sm text-foreground"
                    />
                  </form>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
