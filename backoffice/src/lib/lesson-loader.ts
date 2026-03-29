/** Load lesson data from GoldenCrowSDK (Firestore-backed) */

import { sdkFetchServer } from "./sdk-server";

export interface LessonParagraph {
  paragraphTitle: string;
  icon: string;
  contentText: string;
}

export interface LessonEntry {
  lessonIdentifier: string;
  lessonTitle: string;
  imageURL: string | null;
  lessonColor: string;
  paragraphs: LessonParagraph[] | null;
}

export interface ChapterEntry {
  chapterTitle: string;
  lessons: {
    lessonIdentifier: string;
    lessonTitle: string;
    imageURL: string | null;
    lessonColor: string;
  }[];
}

export interface SubjectEntry {
  subjectIdentifier: string;
  subjectTitle: string;
  chapters: ChapterEntry[];
}

export async function getSubjects(): Promise<SubjectEntry[]> {
  const data = await sdkFetchServer<{ tree: { subjects: SubjectEntry[] } }>("/lessons");
  return data.tree.subjects;
}

export async function getLessonById(id: string): Promise<LessonEntry | null> {
  try {
    const data = await sdkFetchServer<{ lesson: LessonEntry }>(`/lessons/${id}`);
    return data.lesson;
  } catch {
    return null;
  }
}

export async function getTotalLessonCount(): Promise<number> {
  const subjects = await getSubjects();
  return subjects.reduce(
    (total, s) => total + s.chapters.reduce((t, c) => t + c.lessons.length, 0),
    0
  );
}
