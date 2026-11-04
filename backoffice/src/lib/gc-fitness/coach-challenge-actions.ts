"use server";

// coach-challenge-actions.ts — gc-fitness #1475 (S6): el coach crea / borra / lista los
// desafíos para TODO su equipo. El doc se escribe en `social_challenges/{auto id}` con el
// Admin SDK y la forma EXACTA la arma `buildCoachChallengeDoc` (coach-challenges.ts).
//
// Reglas de este archivo ("use server"):
//   - sólo exports `async` (un export síncrono pasa jest y rompe `next build`, #785);
//   - las fallas que el coach puede arreglar se DEVUELVEN (`ActionResult`), no se tiran (#1104);
//   - nada de `undefined` en lo escrito (el Admin SDK lo rechaza) — lo garantiza el builder;
//   - la lista usa sólo igualdades (`creatorUid`, `origin`) y ordena en memoria: sin índice
//     compuesto nuevo.

import { revalidatePath } from "next/cache";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import type { ActionResult } from "./action-result";
import { getCurrentTrainer } from "./auth-helpers";
import { listClients } from "./client-roster";
import {
  buildCoachChallengeDoc,
  sortCoachChallenges,
  summarizeCoachChallenge,
  validateCoachChallengeInput,
  type CoachChallengeFormInput,
  type CoachChallengeSummary,
} from "./coach-challenges";
import { FirestoreCollections } from "./collections";
import { getTrainerTimezone } from "./trainer-timezone";

const PAGE_PATH = "/gc-fitness/challenges";

/** Los uids de los clientes REALES del coach (los pendientes tienen un uid `mirror:` sintético). */
async function rosterClientUids(): Promise<{ uids: string[]; names: Map<string, string> }> {
  const roster = await listClients();
  const real = roster.filter((c) => !c.pendingProvisioning);
  return {
    uids: real.map((c) => c.uid),
    names: new Map(real.map((c) => [c.uid, c.displayName])),
  };
}

export async function createCoachChallenge(
  formInput: CoachChallengeFormInput,
): Promise<ActionResult<{ id: string }>> {
  const trainer = await getCurrentTrainer();
  const [{ uids }, timezone] = await Promise.all([rosterClientUids(), getTrainerTimezone()]);

  const validation = validateCoachChallengeInput(formInput ?? ({} as CoachChallengeFormInput), {
    coachUid: trainer.uid,
    clientUids: uids,
    timezone,
    nowMs: Date.now(),
  });
  if (!validation.ok) {
    return { ok: false, error: `${validation.error.field}.${validation.error.reason}` };
  }

  const doc = buildCoachChallengeDoc(validation.value, trainer.uid, {
    timestamp: (ms) => Timestamp.fromMillis(ms),
    serverTimestamp: () => FieldValue.serverTimestamp(),
  });
  const ref = gcFitnessFirestore().collection(FirestoreCollections.socialChallenges).doc();
  await ref.create(doc);
  revalidatePath(PAGE_PATH);
  return { ok: true, id: ref.id };
}

export async function deleteCoachChallenge(challengeId: unknown): Promise<ActionResult> {
  const trainer = await getCurrentTrainer();
  if (typeof challengeId !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(challengeId)) {
    return { ok: false, error: "notFound" };
  }
  const ref = gcFitnessFirestore().collection(FirestoreCollections.socialChallenges).doc(challengeId);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() ?? {}) : null;
  // Sólo los suyos y sólo los de origen coach: un desafío de amigos donde el coach casualmente
  // es creador (o el de otro coach) no se toca desde acá. Mismo error para «no existe» y
  // «no es tuyo»: no revela qué ids existen.
  if (!data || data.creatorUid !== trainer.uid || data.origin !== "coach") {
    return { ok: false, error: "notFound" };
  }
  await ref.delete();
  revalidatePath(PAGE_PATH);
  return { ok: true };
}

export async function listCoachChallenges(): Promise<CoachChallengeSummary[]> {
  const trainer = await getCurrentTrainer();
  const [snap, names] = await Promise.all([
    gcFitnessFirestore()
      .collection(FirestoreCollections.socialChallenges)
      .where("creatorUid", "==", trainer.uid)
      .where("origin", "==", "coach")
      .get(),
    // Fallback de nombre para un miembro unido sin displayName; best-effort.
    rosterClientUids()
      .then((r) => r.names)
      .catch(() => new Map<string, string>()),
  ]);
  const nowMs = Date.now();
  const out: CoachChallengeSummary[] = [];
  snap.forEach((doc) => {
    const summary = summarizeCoachChallenge(doc.id, (doc.data() ?? {}) as Record<string, unknown>, nowMs, names);
    if (summary) out.push(summary);
  });
  return sortCoachChallenges(out);
}
