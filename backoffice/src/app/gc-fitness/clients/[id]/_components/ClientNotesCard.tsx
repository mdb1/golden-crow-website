"use client";

import { useState, useTransition } from "react";
import { StickyNote, CalendarDays, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("clients.detail.notes");
  const tCommon = useTranslations("common");
  const [notes, setNotes] = useState(initialNotes);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState(initialEntries);

  const notesForSelectedDay = entries.filter((entry) => entry.date === noteDate);
  const recentEntries = [...entries]
    .filter((entry) => entry.date <= noteDate)
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 8);

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <StickyNote className="size-4" />
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {updatedAt ? (
          <p className="text-xs text-muted-foreground">
            {t("savedAt", { datetime: new Date(updatedAt).toLocaleString() })}
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
        placeholder={t("placeholder")}
        className="min-h-32 resize-y"
        maxLength={10000}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("characterCount", { count: notes.length })}
        </p>
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
                setError(err instanceof Error ? err.message : t("saveFailed"));
              }
            });
          }}
        >
          {isPending ? tCommon("saving") : t("addCta")}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("notesForDate", { date: noteDate })}
        </p>
        {notesForSelectedDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noNotesForDay")}</p>
        ) : (
          notesForSelectedDay.map((entry, index) => (
            <div key={`${entry.date}-${index}`} className="rounded-md bg-muted p-3 text-sm">
              <p className="whitespace-pre-wrap">{entry.notes}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {entry.createdAt
                  ? new Date(entry.createdAt).toLocaleString()
                  : tCommon("emDash")}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("previousNotes")}
        </p>
        {recentEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPreviousNotes")}</p>
        ) : (
          recentEntries.map((entry, index) => (
            <div key={`recent-${entry.date}-${index}`} className="rounded-md border p-3 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{entry.date}</span>
                <span>
                  {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : tCommon("emDash")}
                </span>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap">{entry.notes}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
