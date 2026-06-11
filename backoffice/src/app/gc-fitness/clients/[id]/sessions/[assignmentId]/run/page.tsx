// /gc-fitness/clients/[id]/sessions/[assignmentId]/run — coach-run live workout.
//
// Server Component: trainer-auth gate only. The actual session is driven by
// the ActiveWorkoutSession client component, which calls startWorkoutSession
// on mount (idempotent create-or-resume) — mirroring iOS `.task { start() }`.
// Side-effecting writes belong in the client action, not in render.

import { notFound } from "next/navigation";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import {
  getActiveSessionForAssignment,
  startWorkoutSession,
} from "@/lib/gc-fitness/live-workout-actions";

import { ActiveWorkoutSession } from "./_components/active-workout-session";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <activeWorkout>" (issue #170).
export const generateMetadata = () => sectionMetadata("activeWorkout");

export const dynamic = "force-dynamic";

export default async function RunSessionPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>;
}) {
  const { id, assignmentId } = await params;
  try {
    await getCurrentTrainer();
  } catch {
    notFound();
  }
  const initialSession =
    (await getActiveSessionForAssignment(assignmentId).catch(() => null)) ??
    (await startWorkoutSession({ assignmentId }).catch(() => null));
  return (
    <div className="gc-page">
      <ActiveWorkoutSession
        clientId={id}
        assignmentId={assignmentId}
        initialSession={initialSession}
      />
    </div>
  );
}
