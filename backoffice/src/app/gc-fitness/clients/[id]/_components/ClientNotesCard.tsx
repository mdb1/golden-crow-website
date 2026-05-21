"use client";

import { useState, useTransition } from "react";
import { StickyNote, CalendarDays, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateClientNotes } from "@/lib/gc-fitness/client-notes-actions";

export function ClientNotesCard({
  clientId,
  initialNotes,
  initialUpdatedAt,
  initialEntries,
}: {
  clientId: string;
  initialNotes: string;
  initialUpdatedAt: string | null;
  initialEntries: Array<{ date: string; notes: string; createdAt: string | null }>;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState(initialEntries);

  const notesForSelectedDay = entries.filter((entry) => entry.date === noteDate);

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <StickyNote className="size-4" />
            Coach notes log
          </h2>
          <p className="text-sm text-muted-foreground">
            Add a note for a specific day and keep a running log.
          </p>
        </div>
        {updatedAt ? (
          <p className="text-xs text-muted-foreground">
            Saved {new Date(updatedAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CalendarDays className="size-4 text-muted-foreground" />
        <input
          type="date"
          value={noteDate}
          onChange={(event) => setNoteDate(event.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Write a note for this day..."
        className="min-h-32 resize-y"
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
                const result = await updateClientNotes({ clientId, notes, date: noteDate });
                setUpdatedAt(result.updatedAt);
                setEntries((current) => [
                  ...current,
                  { date: noteDate, notes, createdAt: new Date().toISOString() },
                ]);
                setNotes("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Save failed");
              }
            });
          }}
        >
          {isPending ? "Saving..." : "Add note"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Notes for {noteDate}
        </p>
        {notesForSelectedDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes for this day.</p>
        ) : (
          notesForSelectedDay.map((entry, index) => (
            <div key={`${entry.date}-${index}`} className="rounded-md bg-muted p-3 text-sm">
              <p className="whitespace-pre-wrap">{entry.notes}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
