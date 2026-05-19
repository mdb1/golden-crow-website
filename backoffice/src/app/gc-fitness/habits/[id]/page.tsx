// /gc-fitness/habits/[id]/page.tsx — per-habit detail (Server Component)
//
// V1 ships the metadata card + a Compliance placeholder. The compliance
// widget itself (7d + 30d ratio, sparkline, recent logs) lands in P06-08
// — this plan establishes the route so the iOS app + the templates list
// can deep-link to a stable URL.
//
// Trainer ownership is enforced via `getCurrentTrainer() + .trainerId
// === uid` (Admin SDK bypasses rules, so we enforce here too).

import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import type { HabitType } from "@/lib/gc-fitness/habit-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  ComplianceWidget,
  ComplianceWidgetSkeleton,
} from "./_components/ComplianceWidget";

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ id: string }>;
}

const TYPE_LABELS: Record<HabitType, string> = {
  binary: "Yes / No",
  "multi-choice": "Multiple choice",
  numeric: "Numeric",
  weight: "Weight",
};

export default async function HabitDetailPage({ params }: PageParams) {
  let trainer: CurrentTrainer;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const { id } = await params;
  const db = gcFitnessFirestore();
  const snap = await db.collection(FirestoreCollections.habits).doc(id).get();
  if (!snap.exists) {
    redirect("/gc-fitness/habits");
  }
  const data = snap.data() as Record<string, unknown> & {
    trainerId?: string;
    clientId?: string;
    type?: HabitType;
    name?: { en?: string; es?: string };
    description?: { en?: string; es?: string };
    options?: string[];
    targetValue?: number;
    unit?: string;
    reminderEnabled?: boolean;
    reminderTime?: string;
    seedSource?: string;
    deleted?: boolean;
  };

  if (data.trainerId !== trainer.uid) {
    redirect("/gc-fitness/forbidden");
  }

  const habitType = (data.type as HabitType) ?? "binary";
  const nameEN = data.name?.en ?? "(untitled)";
  const nameES = data.name?.es ?? "";

  // Best-effort client display name lookup. Falls back to the raw UID.
  let clientLabel = data.clientId ?? "—";
  if (data.clientId) {
    const userSnap = await db.collection("users").doc(data.clientId).get();
    if (userSnap.exists) {
      const u = userSnap.data() as { displayName?: string; email?: string };
      clientLabel = u.displayName ?? u.email ?? data.clientId;
    }
  }

  const createdAt =
    data.createdAt &&
    typeof (data.createdAt as { toDate?: () => Date }).toDate === "function"
      ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
      : null;
  const updatedAt =
    data.updatedAt &&
    typeof (data.updatedAt as { toDate?: () => Date }).toDate === "function"
      ? (data.updatedAt as { toDate: () => Date }).toDate().toISOString()
      : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {nameEN}
          </h1>
          {nameES && (
            <p className="text-sm text-muted-foreground">{nameES}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="secondary">
              {TYPE_LABELS[habitType] ?? habitType}
            </Badge>
            {data.deleted === true && (
              <Badge variant="destructive">Deleted</Badge>
            )}
            {data.seedSource && (
              <Badge variant="outline">Seed: {data.seedSource}</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button asChild variant="outline">
            <Link href={`/gc-fitness/habits/${id}/edit`}>Edit</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Client
            </dt>
            <dd className="mt-1 font-medium">{clientLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Type
            </dt>
            <dd className="mt-1">{TYPE_LABELS[habitType]}</dd>
          </div>
          {data.description?.en && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </dt>
              <dd className="mt-1 whitespace-pre-wrap">
                {data.description.en}
                {data.description.es && (
                  <>
                    <br />
                    <span className="text-muted-foreground">
                      {data.description.es}
                    </span>
                  </>
                )}
              </dd>
            </div>
          )}
          {habitType === "multi-choice" && data.options && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Options
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {data.options.map((o) => (
                  <Badge key={o} variant="outline" className="font-normal">
                    {o}
                  </Badge>
                ))}
              </dd>
            </div>
          )}
          {habitType === "numeric" && data.targetValue !== undefined && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Daily target
              </dt>
              <dd className="mt-1">
                {data.targetValue} {data.unit ?? ""}
              </dd>
            </div>
          )}
          {(habitType === "weight" || habitType === "numeric") &&
            data.unit && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Unit
                </dt>
                <dd className="mt-1">{data.unit}</dd>
              </div>
            )}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reminder
            </dt>
            <dd className="mt-1">
              {data.reminderEnabled && data.reminderTime ? (
                <span className="font-mono">{data.reminderTime}</span>
              ) : (
                <span className="text-muted-foreground">Off</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Created
            </dt>
            <dd className="mt-1 text-muted-foreground">
              {createdAt ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Updated
            </dt>
            <dd className="mt-1 text-muted-foreground">
              {updatedAt ?? "—"}
            </dd>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance</CardTitle>
        </CardHeader>
        <CardContent>
          {/*
            Suspense boundary so the metadata card above renders immediately
            while the ComplianceWidget's Server Action fetches habit logs.
            ComplianceWidget itself is a Server Component (async function) —
            calling fetchHabitCompliance server-side avoids the extra client
            round-trip a useEffect + await pattern would incur.
          */}
          <Suspense fallback={<ComplianceWidgetSkeleton />}>
            <ComplianceWidget habitId={id} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
