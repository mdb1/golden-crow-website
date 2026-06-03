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

const KIND_TONE: Record<DataHygieneKind, string> = {
  user: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  chat: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  photo: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
  template: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
  assignment: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  log: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300",
  exercise: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300",
};

export function DataHygieneFeed({
  initialPage,
}: {
  initialPage: DataHygienePage;
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
      <Card>
        <CardHeader>
          <CardTitle>Hygiene summary</CardTitle>
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
          <CardTitle>Data issues</CardTitle>
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
              <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
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
    <div className="rounded-lg border bg-muted/20 px-4 py-3">
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
          <UiBadge variant="outline" className={`gap-1 px-1.5 py-0 text-[11px] font-normal ${KIND_TONE[row.kind]}`}>
            <Icon className="size-3.5" />
            {KIND_LABEL[row.kind]}
          </UiBadge>
          <span className="text-sm font-medium leading-tight">{row.title}</span>
        </div>
        <p className="text-xs text-muted-foreground">{row.detail}</p>
        <p className="inline-flex items-start gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
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
          className="inline-flex h-9 items-center justify-center rounded-md border border-destructive/60 bg-transparent px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
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
