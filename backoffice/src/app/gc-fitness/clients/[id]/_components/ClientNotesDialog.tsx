// ClientNotesDialog.tsx — the trainer's private log, behind a header button.
//
// Was a card in the profile grid showing a composer, the notes for the picked
// date, AND the last 8 entries — three stacked lists for something a coach
// writes after a session and rereads occasionally. Now: one button, a composer
// dated today (editable), the last 5 notes, and "Ver más" in pages of 5.
//
// Paging is purely local. Every entry already ships in the single
// `client_notes/{coachId}_{clientId}` doc the page loads, so "Ver más" is a
// slice, not a fetch — there is no second read to make.

"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { NotebookPen, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  deleteClientNote,
  editClientNote,
  updateClientNotes,
} from "@/lib/gc-fitness/client-notes-actions";
import { formatClientActivityDateTime } from "@/lib/gc-fitness/client-activity-time";

interface ClientNoteEntryView {
  date: string;
  notes: string;
  createdAt: string | null;
}

/** How many notes the dialog shows before "Ver más", and how many it adds. */
const PAGE_SIZE = 5;

export function ClientNotesDialog({
  clientId,
  timezone,
  todayCivil,
  initialEntries,
}: {
  clientId: string;
  timezone: string;
  todayCivil: string;
  initialEntries: ClientNoteEntryView[];
}) {
  const t = useTranslations("clients.detail.notes");
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [noteDate, setNoteDate] = useState(todayCivil);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState(initialEntries);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Newest first by write time. Unlike the old card this does NOT filter by the
  // picked date: the date input dates the note being WRITTEN (a coach logging
  // yesterday's session today), and hiding the rest of the log the moment they
  // change it was a side effect nobody asked for.
  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) =>
        (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date),
      ),
    [entries],
  );
  const visible = sorted.slice(0, visibleCount);
  const remaining = sorted.length - visible.length;

  function sameEntry(a: ClientNoteEntryView, b: ClientNoteEntryView): boolean {
    // Entries carry no id; the per-write ISO `createdAt` + date is their identity.
    return a.createdAt === b.createdAt && a.date === b.date;
  }

  function handleEdited(target: ClientNoteEntryView, newText: string) {
    setEntries((current) =>
      current.map((e) => (sameEntry(e, target) ? { ...e, notes: newText } : e)),
    );
  }

  function handleDeleted(target: ClientNoteEntryView) {
    setEntries((current) => current.filter((e) => !sameEntry(e, target)));
  }

  function addNote() {
    setError(null);
    const text = notes;
    const date = noteDate;
    setNotes("");
    startTransition(async () => {
      try {
        await updateClientNotes({ clientId, notes: text, date });
        setEntries((current) => [
          ...current,
          { date, notes: text, createdAt: new Date().toISOString() },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("saveFailed"));
        setNotes(text);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full">
          <NotebookPen className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <label htmlFor="note-date">{t("dateLabel")}</label>
              <input
                id="note-date"
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                className="rounded-md border bg-background px-2 py-1"
              />
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("placeholder")}
              rows={5}
              maxLength={10000}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {notes.length}/10000
              </span>
              <Button
                disabled={isPending || notes.trim().length === 0}
                onClick={addNote}
              >
                {isPending ? t("saving") : t("addNote")}
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t("recentTitle")}
            </h3>
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRecent")}</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {visible.map((entry, index) => (
                    <EntryItem
                      key={`${entry.date}-${entry.createdAt ?? index}`}
                      clientId={clientId}
                      entry={entry}
                      timezone={timezone}
                      onEdited={handleEdited}
                      onDeleted={handleDeleted}
                    />
                  ))}
                </ul>
                {remaining > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  >
                    {t("showMore", { count: remaining })}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntryItem({
  clientId,
  entry,
  timezone,
  onEdited,
  onDeleted,
}: {
  clientId: string;
  entry: ClientNoteEntryView;
  timezone: string;
  onEdited: (target: ClientNoteEntryView, newText: string) => void;
  onDeleted: (target: ClientNoteEntryView) => void;
}) {
  const t = useTranslations("clients.detail.notes");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.notes);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Legacy entries with no `createdAt` can't be uniquely targeted — hide the
  // controls rather than risk editing the wrong row.
  const canMutate = Boolean(entry.createdAt);

  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{entry.date}</span>
        <div className="flex items-center gap-2">
          <span>
            {entry.createdAt
              ? formatClientActivityDateTime(entry.createdAt, timezone)
              : ""}
          </span>
          {canMutate && !editing ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title={t("edit")}
                onClick={() => {
                  setRowError(null);
                  setDraft(entry.notes);
                  setEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">{t("edit")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                title={t("delete")}
                onClick={() => {
                  setRowError(null);
                  setConfirmingDelete(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">{t("delete")}</span>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={10000}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setEditing(false);
                setDraft(entry.notes);
                setRowError(null);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending || draft.trim().length === 0}
              onClick={() => {
                const newText = draft.trim();
                setRowError(null);
                startTransition(async () => {
                  try {
                    await editClientNote({
                      clientId,
                      entryCreatedAt: entry.createdAt ?? "",
                      entryDate: entry.date,
                      notes: newText,
                    });
                    onEdited(entry, newText);
                    setEditing(false);
                  } catch (err) {
                    setRowError(
                      err instanceof Error ? err.message : t("saveFailed"),
                    );
                  }
                });
              }}
            >
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap">{entry.notes}</p>
      )}

      {confirmingDelete ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <span className="text-xs">{t("deleteConfirm")}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setConfirmingDelete(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setRowError(null);
                startTransition(async () => {
                  try {
                    await deleteClientNote({
                      clientId,
                      entryCreatedAt: entry.createdAt ?? "",
                      entryDate: entry.date,
                    });
                    onDeleted(entry);
                  } catch (err) {
                    setRowError(
                      err instanceof Error ? err.message : t("saveFailed"),
                    );
                    setConfirmingDelete(false);
                  }
                });
              }}
            >
              {isPending ? t("deleting") : t("delete")}
            </Button>
          </div>
        </div>
      ) : null}

      {rowError ? (
        <p className="mt-1 text-xs text-destructive">{rowError}</p>
      ) : null}
    </li>
  );
}
