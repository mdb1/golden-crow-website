import { NextResponse } from "next/server";

import {
  gcFitnessFirestore,
  gcFitnessStorage,
} from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";

export const runtime = "nodejs";

const MAX_HABIT_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function getMediaBucketName(): string {
  return (
    process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_STORAGE_BUCKET ??
    "gcfitness-3476b.firebasestorage.app"
  );
}

function isDraftHabitTemplateId(habitId: string, trainerUid: string): boolean {
  return habitId.startsWith(`habit-template-${trainerUid}-`);
}

function isDraftHabitId(habitId: string, trainerUid: string): boolean {
  return habitId.startsWith(`habit-draft-${trainerUid}-`);
}

async function assertOwnership(habitId: string, trainerUid: string): Promise<void> {
  const db = gcFitnessFirestore();
  const [habitSnap, templateSnap] = await Promise.all([
    db.collection(FirestoreCollections.habits).doc(habitId).get(),
    db.collection(FirestoreCollections.habitTemplates).doc(habitId).get(),
  ]);
  const owner =
    (habitSnap.exists && habitSnap.get("trainerId")) ||
    (templateSnap.exists && templateSnap.get("trainerId")) ||
    null;

  if (owner !== trainerUid && !isDraftHabitTemplateId(habitId, trainerUid)) {
    throw new Error("Forbidden");
  }
}

export async function POST(request: Request) {
  let trainerUid: string;
  try {
    const trainer = await getCurrentTrainer();
    trainerUid = trainer.uid;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const habitId = String(formData.get("habitId") ?? "").trim();
  const file = formData.get("file");

  if (!habitId) {
    return NextResponse.json({ error: "Missing habitId" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const contentType = file.type;
  const ext = ALLOWED_CONTENT_TYPES[contentType];
  if (!ext) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_HABIT_PHOTO_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  try {
    if (!isDraftHabitId(habitId, trainerUid)) {
      await assertOwnership(habitId, trainerUid);
    }

    const bucketName = getMediaBucketName();
    const objectPath = `habits/${habitId}/photo.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await gcFitnessStorage()
      .bucket(bucketName)
      .file(objectPath)
      .save(buffer, {
        resumable: false,
        metadata: {
          contentType,
        },
      });

    return NextResponse.json({
      ok: true,
      gsPath: `gs://${bucketName}/${objectPath}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[gc-fitness/habits/photo] upload failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
