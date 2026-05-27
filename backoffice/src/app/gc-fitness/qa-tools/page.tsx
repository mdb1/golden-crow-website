/**
 * /gc-fitness/qa-tools — Phase 20 minimal QA Logs panel.
 *
 * Engineering-facing surface for fast debugging. Shows:
 *   1. Recent trainer-scoped Firestore writes (real): workout templates,
 *      workout logs, habits, and chat threads modified by this trainer,
 *      sorted by `updatedAt` desc. Useful for "did my last assign hit
 *      Firestore?" / "is the user_mirror pre-load writing correctly?"
 *   2. Cloud Functions invocations (stub) — placeholder copy. Real
 *      surfacing requires GCP Audit Logs API + service-account access
 *      (deferred to a follow-on phase with proper credential handling).
 *   3. Rule denials (stub) — same gating. Cloud Audit Logs export to
 *      BigQuery is the canonical surface; deferred.
 *
 * Engineering claim gate: a trainer with `engineering === true` on their
 * custom claims OR their `/users/{uid}` doc sees this page. Everyone
 * else is redirected to /gc-fitness/dashboard. The claim is set
 * manually via Firebase Admin SDK (not exposed to a UI).
 *
 * Scope adaptations vs Phase 20 ROADMAP:
 *   - The information-hierarchy audit + empty/loading/error state pass
 *     across every /gc-fitness/* route is DEFERRED — it requires a
 *     systematic audit pass that exceeds single-session budget.
 *   - This page ships only the QA Logs minimal slice (BOUX-09 / QA-01).
 */

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import { listEngineeringUsers } from "@/lib/gc-fitness/engineering-actions";
import { EngineeringAccessCard } from "./_components/EngineeringAccessCard";

export const dynamic = "force-dynamic";

interface ActivityRow {
  collection: string;
  docId: string;
  updatedAt: Date | null;
  preview: string;
}

async function fetchRecentTrainerActivity(
  trainer: CurrentTrainer,
): Promise<ActivityRow[]> {
  const db = gcFitnessFirestore();
  const LIMIT_PER_COLLECTION = 10;

  // Parallel fetch across four trainer-scoped collections. Each query
  // pulls the most-recent updatedAt rows; we then merge + sort + cap.
  const [templates, chats, habits, workoutLogs] = await Promise.all([
    db
      .collection(FirestoreCollections.workoutTemplates)
      .where("trainerId", "==", trainer.uid)
      .orderBy("updatedAt", "desc")
      .limit(LIMIT_PER_COLLECTION)
      .get()
      .catch(() => null),
    db
      .collection(FirestoreCollections.chats)
      .where("coachId", "==", trainer.uid)
      .orderBy("updatedAt", "desc")
      .limit(LIMIT_PER_COLLECTION)
      .get()
      .catch(() => null),
    db
      .collection(FirestoreCollections.habits)
      .where("trainerId", "==", trainer.uid)
      .orderBy("updatedAt", "desc")
      .limit(LIMIT_PER_COLLECTION)
      .get()
      .catch(() => null),
    // Workout logs aren't directly trainer-scoped; we fan-in via the
    // trainer's clients. For the QA panel we cap at the trainer's own
    // recent assignments instead (cheaper, still surfaces "did my
    // assign land").
    db
      .collection(FirestoreCollections.workoutAssignments)
      .where("trainerId", "==", trainer.uid)
      .orderBy("updatedAt", "desc")
      .limit(LIMIT_PER_COLLECTION)
      .get()
      .catch(() => null),
  ]);

  const rows: ActivityRow[] = [];

  if (templates) {
    for (const doc of templates.docs) {
      const data = doc.data();
      rows.push({
        collection: "workout_templates",
        docId: doc.id,
        updatedAt: data.updatedAt?.toDate?.() ?? null,
        preview: typeof data.name === "string" ? data.name : "(unnamed template)",
      });
    }
  }
  if (chats) {
    for (const doc of chats.docs) {
      const data = doc.data();
      const lastMessageText =
        typeof data.lastMessage === "object" &&
        data.lastMessage !== null &&
        "text" in data.lastMessage &&
        typeof (data.lastMessage as { text: unknown }).text === "string"
          ? (data.lastMessage as { text: string }).text
          : "(no last message)";
      rows.push({
        collection: "chats",
        docId: doc.id,
        updatedAt: data.updatedAt?.toDate?.() ?? null,
        preview: lastMessageText,
      });
    }
  }
  if (habits) {
    for (const doc of habits.docs) {
      const data = doc.data();
      rows.push({
        collection: "habits",
        docId: doc.id,
        updatedAt: data.updatedAt?.toDate?.() ?? null,
        preview: typeof data.name === "string" ? data.name : "(unnamed habit)",
      });
    }
  }
  if (workoutLogs) {
    for (const doc of workoutLogs.docs) {
      const data = doc.data();
      rows.push({
        collection: "workout_assignments",
        docId: doc.id,
        updatedAt: data.updatedAt?.toDate?.() ?? null,
        preview: typeof data.clientId === "string" ? `client: ${data.clientId}` : "(unknown client)",
      });
    }
  }

  return rows
    .sort((a, b) => {
      const ta = a.updatedAt?.getTime() ?? 0;
      const tb = b.updatedAt?.getTime() ?? 0;
      return tb - ta;
    })
    .slice(0, 30);
}

export default async function GCFitnessQAToolsPage() {
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

  // Engineering-only gate. A trainer with `engineering === true` on
  // their /users/{uid} doc OR as a custom claim sees this page; everyone
  // else gets redirected to the dashboard. The claim is set manually via
  // Firebase Admin SDK (no UI affordance) — defense against accidental
  // exposure of internal log data to non-engineering trainers.
  let isEngineering = false;
  try {
    const db = gcFitnessFirestore();
    const userDoc = await db
      .collection(FirestoreCollections.users)
      .doc(trainer.uid)
      .get();
    const data = userDoc.data();
    isEngineering =
      Boolean((trainer as unknown as { engineering?: boolean }).engineering) ||
      Boolean(data?.engineering);
  } catch {
    isEngineering = false;
  }

  if (!isEngineering) {
    redirect("/gc-fitness/dashboard");
  }

  const [activity, engineeringUsers] = await Promise.all([
    fetchRecentTrainerActivity(trainer),
    listEngineeringUsers().catch(() => [] as Awaited<ReturnType<typeof listEngineeringUsers>>),
  ]);
  const tCommon = await getTranslations("common");

  return (
    <div className="gc-page flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="section-eyebrow">GC Fitness · Engineering</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          QA Tools
        </h1>
        <p className="text-sm text-muted-foreground">
          Engineering-only view. Surfaces recent trainer-scoped Firestore
          writes for fast "did my last action hit the database?" debugging.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent trainer writes</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recent activity for this trainer. {tCommon("open")}{" "}
              <code className="rounded bg-muted px-1 py-0.5">/gc-fitness/clients</code>{" "}
              and create or modify any artifact to populate this feed.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activity.map((row, idx) => (
                <li
                  key={`${row.collection}-${row.docId}-${idx}`}
                  className="flex items-start gap-3 rounded-md border bg-card p-3 text-sm"
                >
                  <Badge variant="secondary" className="font-mono text-xs">
                    {row.collection}
                  </Badge>
                  <div className="flex flex-1 flex-col gap-1">
                    <code className="font-mono text-xs text-muted-foreground">
                      {row.docId}
                    </code>
                    <span className="text-sm">{row.preview}</span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.updatedAt
                      ? row.updatedAt.toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "(no timestamp)"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cloud Functions invocations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Deferred to a follow-on phase. Real-time Cloud Functions logs
            require GCP Audit Logs API access via a dedicated service
            account; that credential handoff is tracked separately in
            BLOCKERS.md. For now, inspect logs directly in the{" "}
            <a
              href="https://console.firebase.google.com/project/gcfitness-3476b/functions/logs"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              Firebase Console
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mirror re-link runbook (P22)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Use this when a client says “I signed in but I still don’t see my
            pre-loaded plan”.
          </p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>Open Clients and find the pending mirror row (`mirror:email`).</li>
            <li>Open the pending detail and verify pre-loaded workouts/habits exist.</li>
            <li>Ask client to sign out/in with the same Google email.</li>
            <li>Re-check recent writes feed above for migrated assignment/habit docs.</li>
            <li>
              If still broken, run iOS fallback path and inspect{" "}
              <code>users/{"{uid}"}</code> + <code>user_mirror/{"{email}"}</code>.
            </li>
          </ol>
          <div>
            <Link href="/gc-fitness/clients" className="underline underline-offset-4">
              Open clients roster
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Firestore rule denials</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Deferred. Rule denials surface in Cloud Audit Logs (data access
            logs filtered by{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              severity=ERROR
            </code>
            ). Enabling the export to BigQuery + building this viewer is a
            follow-on phase. Until then, denials show up as red rows in
            the Firebase Console &gt; Firestore &gt; Logs tab.
          </p>
        </CardContent>
      </Card>

      <EngineeringAccessCard
        initialUsers={engineeringUsers}
        currentUid={trainer.uid}
      />
    </div>
  );
}
