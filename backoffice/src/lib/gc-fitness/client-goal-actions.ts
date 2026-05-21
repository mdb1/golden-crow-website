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
  };
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

  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.clientGoals)
    .where("coachId", "==", trainer.uid)
    .where("clientId", "==", clientId)
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();

  return snap.docs.map((doc) =>
    projectGoal(doc.id, doc.data() as Record<string, unknown>),
  );
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
