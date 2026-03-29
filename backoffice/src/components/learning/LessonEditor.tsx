"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LessonEntry, LessonParagraph } from "@/lib/lesson-loader";
import { sdkFetch } from "@/lib/sdk-client";

interface LessonEditorProps {
  lesson: LessonEntry;
}

export function LessonEditor({ lesson }: LessonEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(lesson.lessonTitle);
  const [paragraphs, setParagraphs] = useState<LessonParagraph[]>(
    lesson.paragraphs ?? []
  );
  const [saving, setSaving] = useState(false);

  function handleCancel() {
    setTitle(lesson.lessonTitle);
    setParagraphs(lesson.paragraphs ?? []);
    setIsEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    await sdkFetch(`/lessons/${lesson.lessonIdentifier}`, {
      method: "PUT",
      body: JSON.stringify({ lessonTitle: title, paragraphs }),
    });
    setSaving(false);
    setIsEditing(false);
    window.location.reload();
  }

  function updateParagraphContent(index: number, value: string) {
    setParagraphs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, contentText: value } : p))
    );
  }

  if (!isEditing) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground font-mono mt-1">
              {lesson.lessonIdentifier}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </div>
        {paragraphs.length > 0 ? (
          paragraphs.map((p, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {p.paragraphTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{p.contentText}</p>
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No content available for this lesson.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label className="text-sm font-medium mb-1 block">Lesson Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-lg font-semibold"
        />
        <p className="text-sm text-muted-foreground font-mono mt-1">
          {lesson.lessonIdentifier}
        </p>
      </div>
      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {p.paragraphTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={p.contentText}
                onChange={(e) => updateParagraphContent(i, e.target.value)}
                rows={4}
                className="text-sm text-muted-foreground resize-y"
              />
            </CardContent>
          </Card>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          No paragraphs to edit for this lesson.
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="default" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button variant="ghost" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
