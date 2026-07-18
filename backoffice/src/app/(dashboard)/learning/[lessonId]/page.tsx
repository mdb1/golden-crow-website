import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLessonById } from "@/lib/lesson-loader";
import { Button } from "@/components/ui/button";
import { LessonEditor } from "@/components/learning/LessonEditor";

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const lesson = await getLessonById(lessonId);

  if (!lesson) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/learning/library">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Lesson Library
        </Link>
      </Button>
      <LessonEditor lesson={lesson} />
    </div>
  );
}
