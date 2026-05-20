import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the Pocket Gyms project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "pocket-gyms" (no default-app slot is touched).
const adminDb = adminDbFor("pocket-gyms");
import { FieldValue } from "firebase-admin/firestore";
import { AdminRepositoryError } from "./admin-errors.js";
import type { GymMemberRecord } from "../types/gym.types.js";

const GYM_USERS_COLLECTION = "gym_users";

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTimestampToIso(value: unknown): string {
  if (value !== null && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return new Date().toISOString();
}

function toGymMemberRecord(id: string, data: Record<string, unknown>): GymMemberRecord {
  return {
    id,
    displayName: normalizeOptionalString(data.displayName) ?? "",
    photoURL: normalizeOptionalString(data.photoURL),
    age: normalizeOptionalString(data.age),
    gender: normalizeOptionalString(data.gender),
    goals: Array.isArray(data.goals) ? (data.goals as unknown[]).map(g => String(g)) : [],
    memberSince: normalizeTimestampToIso(data.memberSince),
    gymId: normalizeOptionalString(data.gymId) ?? "prolife360",
  };
}

export async function listGymMembers(query?: string): Promise<GymMemberRecord[]> {
  const snapshot = await adminDb.collection(GYM_USERS_COLLECTION).get();
  let members = snapshot.docs.map(doc =>
    toGymMemberRecord(doc.id, doc.data() as Record<string, unknown>)
  );

  if (query && query.trim()) {
    const lowerQuery = query.trim().toLowerCase();
    members = members.filter(member =>
      member.displayName.toLowerCase().includes(lowerQuery)
    );
  }

  return members.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getGymMember(uid: string): Promise<GymMemberRecord> {
  const doc = await adminDb.collection(GYM_USERS_COLLECTION).doc(uid).get();
  if (!doc.exists) {
    throw new AdminRepositoryError(`Gym member not found: ${uid}`, 404);
  }
  return toGymMemberRecord(doc.id, doc.data() as Record<string, unknown>);
}

export async function createGymMember(data: {
  uid: string;
  displayName: string;
  photoURL?: string;
  age?: string;
  gender?: string;
  goals?: string[];
  gymId?: string;
}): Promise<GymMemberRecord> {
  const { uid, displayName, photoURL, age, gender, goals, gymId } = data;

  const docData: Record<string, unknown> = {
    displayName,
    photoURL: photoURL ?? null,
    age: age ?? null,
    gender: gender ?? null,
    goals: goals ?? [],
    gymId: gymId ?? "prolife360",
    memberSince: FieldValue.serverTimestamp(),
  };

  await adminDb.collection(GYM_USERS_COLLECTION).doc(uid).set(docData);

  const created = await adminDb.collection(GYM_USERS_COLLECTION).doc(uid).get();
  return toGymMemberRecord(created.id, created.data() as Record<string, unknown>);
}

export async function updateGymMember(
  uid: string,
  data: {
    displayName?: string;
    photoURL?: string;
    age?: string;
    gender?: string;
    goals?: string[];
    gymId?: string;
  }
): Promise<GymMemberRecord> {
  const docRef = adminDb.collection(GYM_USERS_COLLECTION).doc(uid);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(`Gym member not found: ${uid}`, 404);
  }

  const updates: Record<string, unknown> = {};
  if (data.displayName !== undefined) updates.displayName = data.displayName;
  if (data.photoURL !== undefined) updates.photoURL = data.photoURL;
  if (data.age !== undefined) updates.age = data.age;
  if (data.gender !== undefined) updates.gender = data.gender;
  if (data.goals !== undefined) updates.goals = data.goals;
  if (data.gymId !== undefined) updates.gymId = data.gymId;

  await docRef.update(updates);

  const updated = await docRef.get();
  return toGymMemberRecord(updated.id, updated.data() as Record<string, unknown>);
}

export async function deleteGymMember(uid: string): Promise<{ deleted: true }> {
  const docRef = adminDb.collection(GYM_USERS_COLLECTION).doc(uid);
  const existing = await docRef.get();
  if (!existing.exists) {
    throw new AdminRepositoryError(`Gym member not found: ${uid}`, 404);
  }

  await docRef.delete();
  return { deleted: true };
}
