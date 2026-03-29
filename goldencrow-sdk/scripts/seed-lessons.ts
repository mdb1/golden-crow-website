import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Admin init (same pattern as sdk config)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const adminDb = getFirestore();

// Resolve JSON file paths
const DICTIONARY_PATH =
  process.env.DICTIONARY_PATH ??
  path.resolve(__dirname, "../../backoffice/src/data/LessonDictionary.json");
const REFERENCE_PATH =
  process.env.REFERENCE_PATH ??
  path.resolve(__dirname, "../../backoffice/src/data/LessonReference.json");

interface LessonParagraph {
  paragraphTitle: string;
  icon: string;
  contentText: string;
}

interface LessonEntry {
  lessonIdentifier: string;
  lessonTitle: string;
  imageURL: string | null;
  lessonColor: string;
  paragraphs: LessonParagraph[] | null;
}

interface ChapterEntry {
  chapterTitle: string;
  lessons: {
    lessonIdentifier: string;
    lessonTitle: string;
    imageURL: string | null;
    lessonColor: string;
  }[];
}

interface SubjectEntry {
  subjectIdentifier: string;
  subjectTitle: string;
  chapters: ChapterEntry[];
}

interface LessonReference {
  subjects: SubjectEntry[];
}

async function main() {
  console.log("Reading lesson data...");
  const dict = JSON.parse(
    fs.readFileSync(DICTIONARY_PATH, "utf-8")
  ) as Record<string, LessonEntry>;
  const ref = JSON.parse(
    fs.readFileSync(REFERENCE_PATH, "utf-8")
  ) as LessonReference;

  // Write lesson_structure tree (single doc)
  console.log("Writing lesson_structure/tree...");
  await adminDb.collection("lesson_structure").doc("tree").set({ subjects: ref.subjects });
  console.log("Done. lesson_structure/tree written.");

  // Write all lesson docs in batches of 400
  const lessons = Object.values(dict);
  const BATCH_SIZE = 400;
  const totalBatches = Math.ceil(lessons.length / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const batchLessons = lessons.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const batch = adminDb.batch();
    for (const lesson of batchLessons) {
      const ref = adminDb.collection("lessons").doc(lesson.lessonIdentifier);
      batch.set(ref, lesson);
    }
    console.log(`Seeding batch ${i + 1}/${totalBatches}...`);
    await batch.commit();
  }

  console.log(`Done. Seeded ${lessons.length} lessons.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
