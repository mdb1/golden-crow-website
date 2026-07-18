import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { PillTabs } from "@/components/gc-fitness/pill-tabs";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import {
  listAuditTimeline,
  listDeletionHistory,
  type AuditAction,
  type AuditEntry,
  type AuditSource,
} from "@/lib/gc-fitness/audit-actions";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <adminPanel>" (issue #170).
export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

const ACTION_OPTIONS: Array<{ value: "all" | AuditAction; label: string }> = [
  { value: "all", label: "All actions" },
  { value: "create", label: "Created" },
  { value: "assign", label: "Assigned" },
  { value: "update", label: "Updated" },
  { value: "delete", label: "Deleted" },
  { value: "request", label: "Requested" },
  { value: "other", label: "Other" },
];

const SOURCE_OPTIONS: Array<{ value: "all" | AuditSource; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "coach_activity", label: "Coach activity" },
  { value: "admin_operations", label: "Admin operations" },
  { value: "audit_log", label: "Firestore writes (audit log)" },
];

function str(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function actionBadgeVariant(
  action: AuditAction,
): "brand" | "success" | "warning" | "violet" | "destructive" | "secondary" {
  switch (action) {
    case "delete":
      return "destructive";
    case "create":
      return "success";
    case "assign":
      return "brand";
    case "update":
      return "warning";
    case "request":
      return "violet";
    default:
      return "secondary";
  }
}

export default async function AuditPage({
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
  const tab = str(sp.tab) === "deletions" ? "deletions" : "timeline";
  const source = (() => {
    const v = str(sp.source);
    return v === "coach_activity" || v === "admin_operations" || v === "audit_log"
      ? v
      : "all";
  })();
  const action = (() => {
    const v = str(sp.action);
    return ACTION_OPTIONS.some((o) => o.value === v) ? (v as "all" | AuditAction) : "all";
  })();
  const actorQuery = str(sp.actor).trim();
  const clientQuery = str(sp.client).trim();
  const fromISO = str(sp.from).trim();
  const toISO = str(sp.to).trim();

  const filters = {
    source: source as "all" | AuditSource,
    action,
    actorQuery,
    clientQuery,
    fromISO,
    toISO,
  };

  let rows: AuditEntry[] = [];
  let loadError = false;
  try {
    rows =
      tab === "deletions"
        ? await listDeletionHistory(filters)
        : await listAuditTimeline(filters);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    loadError = true;
  }

  // Preserve the active tab when the filter form submits.
  const hiddenTab = tab === "deletions" ? "deletions" : "timeline";

  const buildTabHref = (target: "timeline" | "deletions") => {
    const params = new URLSearchParams();
    params.set("tab", target);
    if (source !== "all") params.set("source", source);
    if (action !== "all") params.set("action", action);
    if (actorQuery) params.set("actor", actorQuery);
    if (clientQuery) params.set("client", clientQuery);
    if (fromISO) params.set("from", fromISO);
    if (toISO) params.set("to", toISO);
    return `/gc-fitness/admin/audit?${params.toString()}`;
  };

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title="Monitoring & observability"
        subtitle="Unified, time-ordered trail of coach actions and admin operations — trace what happened and when."
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin">
              <ArrowLeft className="h-4 w-4" />
              Back to admin
            </Link>
          </Button>
        }
      />

      <PillTabs
        activeKey={tab}
        items={[
          { key: "timeline", label: "Timeline", href: buildTabHref("timeline") },
          { key: "deletions", label: "Deletions", href: buildTabHref("deletions") },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Filters</CardTitle>
          <CardDescription>
            Date range is applied server-side; actor / client / action filter the
            loaded window in memory. Times are UTC.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action="/gc-fitness/admin/audit"
            method="get"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <input type="hidden" name="tab" value={hiddenTab} />
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Source
              <select
                name="source"
                defaultValue={source}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {tab === "timeline" ? (
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Action
                <select
                  name="action"
                  defaultValue={action}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {ACTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Actor (uid / name / email)
              <Input name="actor" defaultValue={actorQuery} placeholder="contains…" className="h-9" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Client (uid / email)
              <Input name="client" defaultValue={clientQuery} placeholder="contains…" className="h-9" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              From (UTC)
              <Input name="from" type="date" defaultValue={fromISO} className="h-9" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              To (UTC)
              <Input name="to" type="date" defaultValue={toISO} className="h-9" />
            </label>

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" className="rounded-full">
                Apply filters
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={`/gc-fitness/admin/audit?tab=${hiddenTab}`}>Clear</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {tab === "deletions" ? "Deletion history" : "Activity timeline"}
          </CardTitle>
          <CardDescription>
            {tab === "deletions"
              ? "Everything that removed data — coach removals plus admin cascade / deactivation / pending-removal operations. Who, what, and when."
              : "Coach actions and admin operations merged into a single newest-first feed."}
            {" "}
            Showing {rows.length} {rows.length === 1 ? "entry" : "entries"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[60rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>When (UTC)</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Client / target</TableHead>
                  <TableHead>Source / status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadError ? (
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground" colSpan={6}>
                      Could not load the audit feed. Try narrowing the date range.
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground" colSpan={6}>
                      No matching events found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={row.isDeletion ? "bg-destructive/5" : undefined}
                    >
                      <TableCell className="whitespace-nowrap align-top text-xs">
                        {row.occurredAtISO
                          ? row.occurredAtISO.replace("T", " ").replace(/\.\d+Z$/, "Z")
                          : "—"}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-medium">{row.actorName ?? "—"}</div>
                        <div className="text-xs break-all text-muted-foreground">
                          {row.actorEmail || row.actorUid || "—"}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                          {row.source === "audit_log" ? "Firestore write" : row.actorRole}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant={actionBadgeVariant(row.action)} className="w-fit">
                              {row.action}
                            </Badge>
                            {row.occurrenceCount ? (
                              <Badge variant="secondary" className="w-fit">
                                ×{row.occurrenceCount} recurrence
                              </Badge>
                            ) : null}
                          </div>
                          <span className="text-sm">{row.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[24rem] align-top whitespace-normal text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {row.detail ?? "—"}
                      </TableCell>
                      <TableCell className="align-top">
                        {row.clientId || row.clientLabel ? (
                          <div className="space-y-0.5">
                            <div className="text-xs break-all">{row.clientLabel ?? "—"}</div>
                            <div className="font-mono text-[11px] break-all text-muted-foreground">
                              {row.clientId ?? "—"}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="align-top text-xs text-muted-foreground">
                        <div className="whitespace-normal [overflow-wrap:anywhere]">
                          {row.kind}
                        </div>
                        {row.status ? (
                          <Badge
                            variant={row.status === "failed" ? "destructive" : "secondary"}
                            className="mt-1 w-fit"
                          >
                            {row.status}
                            {row.mode ? ` · ${row.mode}` : ""}
                          </Badge>
                        ) : null}
                      </TableCell>
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
