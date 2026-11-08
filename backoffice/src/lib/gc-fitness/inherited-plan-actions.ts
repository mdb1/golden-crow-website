"use server";

// inherited-plan-actions.ts — gc-fitness#1504: the current coach ends what a former
// coach left on their client's plan. Nothing is ever deleted automatically (a swap
// keeps the plan, #1395); this is the explicit exit. Same result as the app's
// `endInheritedPlan` callable.
//
// A new file on purpose: moving an existing action would rotate its ID (#382).

import { FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { civilDateFormat } from "./civil-date";
import { NOT_YOUR_CLIENT } from "./coach-ownership";
import { FirestoreCollections } from "./collections";
import { planInheritedPlanEnd } from "./inherited-plan";

/** Same default the apps' `HabitSchedule.isActive` and functions fall back to. */
const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
const WRITES_PER_BATCH = 400;
const LOG_IN_CHUNK = 30;

async function assignmentIdsWithLogs(
  db: FirebaseFirestore.Firestore,
  ids: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const logs = db.collection(FirestoreCollections.workoutLogs);
  for (let i = 0; i < ids.length; i += LOG_IN_CHUNK) {
    const chunk = ids.slice(i, i + LOG_IN_CHUNK);
    // Both wire spellings exist on logs in production (see the server's twin).
    const [snake, camel] = await Promise.all([
      logs.where("assignment_id", "in", chunk).get(),
      logs.where("assignmentId", "in", chunk).get(),
    ]);
    for (const d of snake.docs) out.add(d.get("assignment_id") as string);
    for (const d of camel.docs) out.add(d.get("assignmentId") as string);
  }
  return out;
}

export async function endInheritedPlan(input: { clientId: string }): Promise<{
  ok: true;
  assignmentsDeleted: number;
  habitsEnded: number;
  habitsDeleted: number;
}> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const clientId = typeof input?.clientId === "string" ? input.clientId.trim() : "";
  if (!clientId || clientId === trainer.uid) throw new Error(NOT_YOUR_CLIENT);

  const clientSnap = await db.collection(FirestoreCollections.users).doc(clientId).get();
  if (!clientSnap.exists || clientSnap.get("coachId") !== trainer.uid) {
    throw new Error(NOT_YOUR_CLIENT);
  }

  // The CLIENT's civil date: "today's workout" is theirs, not the coach's.
  const rawTimezone = clientSnap.get("timezone");
  const today = civilDateFormat(
    new Date(),
    typeof rawTimezone === "string" && rawTimezone.length > 0 ? rawTimezone : DEFAULT_TIMEZONE,
  );

  const [assignmentsSnap, habitsSnap] = await Promise.all([
    db
      .collection(FirestoreCollections.workoutAssignments)
      .where("clientId", "==", clientId)
      .where("scheduledFor", ">=", today)
      .get(),
    db.collection(FirestoreCollections.habits).where("clientId", "==", clientId).get(),
  ]);
  const toDocs = (snap: FirebaseFirestore.QuerySnapshot) =>
    snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  const assignments = toDocs(assignmentsSnap);
  const habits = toDocs(habitsSnap);

  const args = { coachId: trainer.uid, today, assignments, habits };
  const candidates = planInheritedPlanEnd(args).deleteAssignmentIds;
  const loggedAssignmentIds = await assignmentIdsWithLogs(db, candidates);
  const plan = planInheritedPlanEnd({ ...args, loggedAssignmentIds });

  const now = FieldValue.serverTimestamp();
  const assignmentsCol = db.collection(FirestoreCollections.workoutAssignments);
  const habitsCol = db.collection(FirestoreCollections.habits);
  const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
  for (const id of plan.deleteAssignmentIds) {
    ops.push((b) => b.delete(assignmentsCol.doc(id)));
  }
  for (const { id, endsOn } of plan.endHabits) {
    ops.push((b) => b.update(habitsCol.doc(id), { endsOn, reminderEnabled: false, updatedAt: now }));
  }
  for (const id of plan.deleteHabitIds) {
    ops.push((b) => b.update(habitsCol.doc(id), { deleted: true, reminderEnabled: false, updatedAt: now }));
  }
  for (let i = 0; i < ops.length; i += WRITES_PER_BATCH) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + WRITES_PER_BATCH)) op(batch);
    await batch.commit();
  }

  return {
    ok: true,
    assignmentsDeleted: plan.deleteAssignmentIds.length,
    habitsEnded: plan.endHabits.length,
    habitsDeleted: plan.deleteHabitIds.length,
  };
}
