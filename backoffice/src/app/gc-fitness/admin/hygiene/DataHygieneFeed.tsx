"use client";

import type { ComponentType } from "react";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Bolt,
  Calendar,
  Camera,
  Dumbbell,
  ImageOff,
  Trash2,
  UserRoundX,
} from "lucide-react";

import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  listDataHygienePage,
  purgeDataHygieneItem,
  type DataHygieneKind,
  type DataHygienePage,
  type DataHygieneRow,
} from "@/lib/gc-fitness/data-hygiene-actions";

const PAGE_SIZE = 20;

const KIND_LABEL: Record<DataHygieneKind, string> = {
  user: "User",
  chat: "Chat",
  photo: "Image",
  template: "Workout template",
  assignment: "Workout assignment",
  log: "Workout log",
  exercise: "Exercise",
};

const KIND_ICON: Record<DataHygieneKind, ComponentType<{ className?: string }>> = {
  user: UserRoundX,
  chat: MessageIcon,
  photo: Camera,
  template: Dumbbell,
  assignment: Calendar,
  log: Bolt,
  exercise: ImageOff,
};

// Category accents mapped to the design-system badge token variants so both
// themes stay in sync (no hardcoded per-shade colors).
const KIND_VARIANT: Record<
  DataHygieneKind,
  "rose" | "violet" | "brand" | "warning" | "secondary"
> = {
  user: "rose",
  chat: "violet",
  photo: "brand",
  template: "violet",
  assignment: "warning",
  log: "warning",
  exercise: "secondary",
};

export function DataHygieneFeed({
  initialPage,
  loadError,
}: {
  initialPage: DataHygienePage;
  loadError?: string | null;
}) {
  const [rows, setRows] = useState(initialPage.rows);
  const [offset, setOffset] = useState<number | null>(initialPage.nextOffset);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [summary, setSummary] = useState(initialPage.summary);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (pending || !hasMore || offset === null) return;
    startTransition(async () => {
      const next = await listDataHygienePage(offset, PAGE_SIZE);
      setRows((current) => [...current, ...next.rows]);
      setOffset(next.nextOffset);
      setHasMore(next.hasMore);
      setSummary(next.summary);
    });
  }

  const total = Object.values(summary).reduce((acc, value) => acc + value, 0);

  return (
    <div className="flex flex-col gap-6">
      {loadError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Hygiene scan could not load</CardTitle>
            <CardDescription>
              {loadError}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The page is still usable, but the initial anomaly scan failed. Reloading after the underlying issue is fixed should restore the list.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Hygiene summary</CardTitle>
          <CardDescription>Preview of orphaned or suspicious GC Fitness records detected from recent scans.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Users" value={summary.user} />
          <SummaryCard label="Chats" value={summary.chat} />
          <SummaryCard label="Images" value={summary.photo} />
          <SummaryCard label="Workouts" value={summary.template + summary.assignment + summary.log + summary.exercise} />
          <SummaryCard label="Total" value={total} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Data issues</CardTitle>
          <CardDescription>
            Delete actions are explicit and destructive. Each row points at a record that is either orphaned or in a suspicious state.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-sm text-muted-foreground">
              No anomalies found in the current scan window.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((row) => (
                <DataHygieneRowCard key={row.id} row={row} />
              ))}
            </div>
          )}
          {hasMore ? (
            <div className="border-t px-4 py-3">
              <Button variant="outline" size="sm" className="rounded-full" onClick={loadMore} disabled={pending}>
                {pending ? "Cargando..." : "Cargar más"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-muted/20 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DataHygieneRowCard({ row }: { row: DataHygieneRow }) {
  const Icon = KIND_ICON[row.kind];

  return (
    <article className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <UiBadge variant={KIND_VARIANT[row.kind]} className="gap-1 px-1.5 py-0 text-[11px] font-normal">
            <Icon className="size-3.5" />
            {KIND_LABEL[row.kind]}
          </UiBadge>
          <span className="text-sm font-medium leading-tight">{row.title}</span>
        </div>
        <p className="text-xs text-muted-foreground">{row.detail}</p>
        <p className="inline-flex items-start gap-1 rounded-lg border border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] px-2 py-1 text-xs text-[color:var(--badge-warning-fg)]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {row.issue}
        </p>
        <p className="text-[11px] text-muted-foreground">Updated at: {row.sortAtISO ?? "—"}</p>
      </div>
      <form action={purgeDataHygieneItem} className="flex shrink-0 flex-col gap-2 lg:items-end">
        <input type="hidden" name="kind" value={row.kind} />
        <input type="hidden" name="id" value={row.id} />
        {row.userId ? <input type="hidden" name="userId" value={row.userId} /> : null}
        {row.userRole ? <input type="hidden" name="role" value={row.userRole} /> : null}
        {row.chatId ? <input type="hidden" name="chatId" value={row.chatId} /> : null}
        {row.photoId ? <input type="hidden" name="photoId" value={row.photoId} /> : null}
        {row.storagePath ? <input type="hidden" name="storagePath" value={row.storagePath} /> : null}
        {row.templateId ? <input type="hidden" name="templateId" value={row.templateId} /> : null}
        {row.assignmentId ? <input type="hidden" name="assignmentId" value={row.assignmentId} /> : null}
        {row.logId ? <input type="hidden" name="logId" value={row.logId} /> : null}
        {row.exerciseId ? <input type="hidden" name="exerciseId" value={row.exerciseId} /> : null}
        {row.ownerId ? <input type="hidden" name="ownerId" value={row.ownerId} /> : null}
        {row.source ? <input type="hidden" name="source" value={row.source} /> : null}
        <button
          type="submit"
          onClick={(event) => {
            if (!window.confirm(`Delete this ${row.kind} record from Firestore?`)) {
              event.preventDefault();
            }
          }}
          className="inline-flex h-10 items-center justify-center rounded-full border border-destructive/60 bg-transparent px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          Delete from DB
        </button>
      </form>
    </article>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return <Trash2 className={className} />;
}
