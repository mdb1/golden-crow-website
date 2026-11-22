"use server";

import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";

const horizonSchema = z.enum(["short", "medium", "long"]);
const statusSchema = z.enum(["active", "completed", "archived"]);

const createGoalSchema = z.object({
  clientId: z.string().trim().min(1),
  horizon: horizonSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  targetDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateGoalSchema = createGoalSchema
  .omit({ clientId: true })
  .partial()
  .extend({ goalId: z.string().trim().min(1), status: statusSchema.optional() });

export interface ClientGoalRow {
  id: string;
  clientId: string;
  coachId: string;
  horizon: "short" | "medium" | "long";
  title: string;
  description: string | null;
  targetDate: string | null;
  status: "active" | "completed" | "archived";
  createdAt: string | null;
  updatedAt: string | null;
  /**
   * gc-fitness#1620 / website#520 — a goal the CLIENT set for themselves in the app
   * (`clientOwned: true`, `clientId == coachId == client uid`). The coach sees it
   * read-only («Lo definió tu cliente»), like coach mode in the apps: the rules keep it
   * the client's, and `updateClientGoal` refuses it (its `coachId` is not the coach).
   */
  clientOwned: boolean;
}

function toIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === "string" ? v : null;
}

function projectGoal(
  id: string,
  data: Record<string, unknown>,
): ClientGoalRow {
  return {
    id,
    clientId: (data.clientId as string) ?? "",
    coachId: (data.coachId as string) ?? "",
    horizon:
      data.horizon === "medium" || data.horizon === "long"
        ? data.horizon
        : "short",
    title: (data.title as string) ?? "",
    description: typeof data.description === "string" ? data.description : null,
    targetDate: typeof data.targetDate === "string" ? data.targetDate : null,
    status:
      data.status === "completed" || data.status === "archived"
        ? data.status
        : "active",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    clientOwned: data.clientOwned === true,
  };
}

/** Newest first by `updatedAt` (ISO strings sort lexicographically); undated last. */
function byUpdatedDesc(a: ClientGoalRow, b: ClientGoalRow): number {
  if (a.updatedAt === b.updatedAt) return 0;
  if (a.updatedAt === null) return 1;
  if (b.updatedAt === null) return -1;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

async function assertOwnsClient(coachId: string, clientId: string) {
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(clientId)
    .get();
  if (!snap.exists || snap.get("coachId") !== coachId) {
    throw new Error("Forbidden");
  }
}

export async function listClientGoals(
  clientId: string,
): Promise<ClientGoalRow[]> {
  const trainer = await getCurrentTrainer();
  await assertOwnsClient(trainer.uid, clientId);

  const goals = gcFitnessFirestore().collection(FirestoreCollections.clientGoals);
  const [coachSnap, ownSnap] = await Promise.all([
    goals
      .where("coachId", "==", trainer.uid)
      .where("clientId", "==", clientId)
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get(),
    // website#520 — the goals the client set for themselves (gc-fitness#1620): the same
    // `clientId == X && clientOwned == true` query the apps' coach mode runs (and the one the
    // rules admit for the client's current coach). Equality-only, so no composite index.
    goals
      .where("clientId", "==", clientId)
      .where("clientOwned", "==", true)
      .limit(50)
      .get(),
  ]);

  const rows = coachSnap.docs.map((doc) =>
    projectGoal(doc.id, doc.data() as Record<string, unknown>),
  );
  const seen = new Set(rows.map((row) => row.id));
  for (const doc of ownSnap.docs) {
    const row = projectGoal(doc.id, doc.data() as Record<string, unknown>);
    // The client's OWN goals only (`coachId` is the client, the #392/#400 "self" convention).
    if (seen.has(row.id) || row.coachId !== clientId) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows.sort(byUpdatedDesc);
}

export async function createClientGoal(
  input: unknown,
): Promise<{ id: string }> {
  const trainer = await getCurrentTrainer();
  const parsed = createGoalSchema.parse(input);
  await assertOwnsClient(trainer.uid, parsed.clientId);

  const id = `goal-${trainer.uid}-${randomUUID()}`;
  await gcFitnessFirestore()
    .collection(FirestoreCollections.clientGoals)
    .doc(id)
    .set({
      id,
      clientId: parsed.clientId,
      coachId: trainer.uid,
      horizon: parsed.horizon,
      title: parsed.title,
      ...(parsed.description ? { description: parsed.description } : {}),
      ...(parsed.targetDate ? { targetDate: parsed.targetDate } : {}),
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  return { id };
}

export async function updateClientGoal(
  input: unknown,
): Promise<{ ok: true }> {
  const trainer = await getCurrentTrainer();
  const parsed = updateGoalSchema.parse(input);

  const ref = gcFitnessFirestore()
    .collection(FirestoreCollections.clientGoals)
    .doc(parsed.goalId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("coachId") !== trainer.uid) {
    throw new Error("Forbidden");
  }
  // Same roster check as create/list: after a transfer the previous coach
  // still authored the goal but must not keep editing it.
  const goalClientId = snap.get("clientId");
  if (typeof goalClientId !== "string" || goalClientId.length === 0) {
    throw new Error("Forbidden");
  }
  await assertOwnsClient(trainer.uid, goalClientId);

  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (parsed.horizon !== undefined) patch.horizon = parsed.horizon;
  if (parsed.title !== undefined) patch.title = parsed.title;
  if (parsed.description !== undefined) patch.description = parsed.description;
  if (parsed.targetDate !== undefined) patch.targetDate = parsed.targetDate;
  if (parsed.status !== undefined) patch.status = parsed.status;

  await ref.update(patch);
  return { ok: true };
}
