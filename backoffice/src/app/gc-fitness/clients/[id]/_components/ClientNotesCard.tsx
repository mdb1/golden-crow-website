"use client";

import { useState, useTransition } from "react";
import { StickyNote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateClientNotes } from "@/lib/gc-fitness/client-notes-actions";

export function ClientNotesCard({
  clientId,
  initialNotes,
  initialUpdatedAt,
}: {
  clientId: string;
  initialNotes: string;
  initialUpdatedAt: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <StickyNote className="size-4" />
            Private coach notes
          </h2>
          <p className="text-sm text-muted-foreground">
            Only trainers can read these notes.
          </p>
        </div>
        {updatedAt ? (
          <p className="text-xs text-muted-foreground">
            Saved {new Date(updatedAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Injuries, preferences, context, next check-in..."
        className="min-h-40 resize-y"
        maxLength={10000}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{notes.length}/10000</p>
        <Button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const result = await updateClientNotes({ clientId, notes });
                setUpdatedAt(result.updatedAt);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Save failed");
              }
            });
          }}
        >
          {isPending ? "Saving..." : "Save notes"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
