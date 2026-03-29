"use client";

import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { SubjectEntry } from "@/lib/lesson-loader";

interface LearningTreeProps {
  subjects: SubjectEntry[];
}

export function LearningTree({ subjects }: LearningTreeProps) {
  return (
    <div className="flex flex-col gap-4">
      {subjects.map((subject) => (
        <Accordion key={subject.subjectIdentifier} type="multiple">
          <AccordionItem value={subject.subjectIdentifier}>
            <AccordionTrigger className="font-bold">
              {subject.subjectTitle}
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-4 pl-2">
                {subject.chapters.map((chapter, chapterIndex) => (
                  <div key={chapterIndex}>
                    <p className="text-sm text-muted-foreground mb-2">
                      {chapter.chapterTitle}
                    </p>
                    <ul className="flex flex-col gap-1 pl-2">
                      {chapter.lessons.map((lesson) => (
                        <li key={lesson.lessonIdentifier}>
                          <Link
                            href={"/learning/" + lesson.lessonIdentifier}
                            className="text-sm hover:underline"
                          >
                            {lesson.lessonTitle}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ))}
    </div>
  );
}
