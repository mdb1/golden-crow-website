// engineering-actions.ts — Plan 20-08.
//
// Server Actions to mint / revoke the engineering claim used by the
// /gc-fitness/qa-tools page. The claim is stored as a boolean on the
// /users/{uid} doc; the page gate checks both the Firebase Auth custom
// claim AND this field for defense-in-depth.
//
// SELF-MODERATING GATE:
//   Only an existing engineering trainer can grant or revoke. The very
//   first engineering trainer is set manually via the Firebase Admin SDK
//   (bootstrap). This action is the bootstrap-after-the-first-one tool.

"use server";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import {
  gcFitnessAuth,
  gcFitnessFirestore,
} from "@/lib/firebase/gc-fitness-admin";

import { getCurrentTrainer } from "./auth-helpers";
import { FirestoreCollections } from "./collections";

const grantEngineeringSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
const revokeEngineeringSchema = z.object({
  uid: z.string().min(1, "uid is required."),
});

/** Hard cap on the engineering-list query to keep the QA Tools card snappy. */
const MAX_ENGINEERING_LIST = 50;

async function assertCallerIsEngineering(): Promise<string> {
  const trainer = await getCurrentTrainer();
  const db = gcFitnessFirestore();
  const userDoc = await db
    .collection(FirestoreCollections.users)
    .doc(trainer.uid)
    .get();
  const data = userDoc.data();
  const isEngineering =
    Boolean((trainer as unknown as { engineering?: boolean }).engineering) ||
    Boolean(data?.engineering);
  if (!isEngineering) {
    throw new Error("Engineering claim required.");
  }
  return trainer.uid;
}

export async function grantEngineering(
  input: unknown,
): Promise<{ uid: string; email: string }> {
  await assertCallerIsEngineering();
  const parsed = grantEngineeringSchema.parse(input);
  const auth = gcFitnessAuth();
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(parsed.email);
  } catch {
    throw new Error(`No GC Fitness user found for ${parsed.email}.`);
  }
  const db = gcFitnessFirestore();
  await db
    .collection(FirestoreCollections.users)
    .doc(userRecord.uid)
    .set(
      {
        engineering: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  return { uid: userRecord.uid, email: parsed.email };
}

export async function revokeEngineering(
  input: unknown,
): Promise<{ uid: string }> {
  const callerUid = await assertCallerIsEngineering();
  const parsed = revokeEngineeringSchema.parse(input);
  if (parsed.uid === callerUid) {
    // Self-revoke would lock the caller out of /qa-tools mid-action.
    throw new Error(
      "Refusing to revoke your own engineering claim. Ask another engineering trainer to revoke.",
    );
  }
  const db = gcFitnessFirestore();
  await db
    .collection(FirestoreCollections.users)
    .doc(parsed.uid)
    .set(
      {
        engineering: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  return { uid: parsed.uid };
}

export interface EngineeringUserRow {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export async function listEngineeringUsers(): Promise<EngineeringUserRow[]> {
  await assertCallerIsEngineering();
  const db = gcFitnessFirestore();
  const snap = await db
    .collection(FirestoreCollections.users)
    .where("engineering", "==", true)
    .limit(MAX_ENGINEERING_LIST)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      email: typeof data.email === "string" ? data.email : null,
      displayName:
        typeof data.displayName === "string" ? data.displayName : null,
    };
  });
}
