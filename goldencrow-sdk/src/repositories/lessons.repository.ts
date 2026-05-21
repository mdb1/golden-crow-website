import { adminDbFor } from "../config/firebase.js";

// Pitfall 16 — Bind once to the MyDNAMap project at module load. Every
// downstream `adminDb.collection(...)` call below uses the named-app
// Firestore handle for "mydnamap" (no default-app slot is touched).
const adminDb = adminDbFor("mydnamap");
import type { LessonEntry, LessonTree } from "../types/sdk.types.js";

export async function getLessonTree(): Promise<LessonTree> {
  const snap = await adminDb.collection("lesson_structure").doc("tree").get();
  if (!snap.exists) return { subjects: [] };
  return snap.data() as LessonTree;
}

export async function getLessonById(id: string): Promise<LessonEntry | null> {
  const snap = await adminDb.collection("lessons").doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as LessonEntry;
}

export async function updateLesson(
  id: string,
  updates: Partial<Pick<LessonEntry, "lessonTitle" | "paragraphs">>
): Promise<LessonEntry | null> {
  const ref = adminDb.collection("lessons").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.set(updates, { merge: true });
  const updated = await ref.get();
  return updated.data() as LessonEntry;
}
