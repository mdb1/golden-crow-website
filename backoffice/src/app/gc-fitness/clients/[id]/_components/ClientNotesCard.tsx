"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  deleteClientNote,
  editClientNote,
  updateClientNotes,
} from "@/lib/gc-fitness/client-notes-actions";

interface ClientNoteEntryView {
  date: string;
  notes: string;
  createdAt: string | null;
}

interface Props {
  clientId: string;
  initialNotes: string;
  initialUpdatedAt: string | null;
  initialEntries: ClientNoteEntryView[];
}

export function ClientNotesCard({
  clientId,
  initialNotes,
  initialUpdatedAt,
  initialEntries,
}: Props) {
  const t = useTranslations("clients.detail.notes");
  const [notes, setNotes] = useState("");
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState(initialEntries);

  void initialNotes;
  void updatedAt;

  const entriesForDate = entries
    .filter((entry) => entry.date === noteDate)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const recentEntries = entries
    .filter((entry) => entry.date <= noteDate)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 8);

  // Match an entry by its (createdAt, date) identity — entries have no id.
  function sameEntry(a: ClientNoteEntryView, b: ClientNoteEntryView): boolean {
    return a.createdAt === b.createdAt && a.date === b.date;
  }

  function handleEdited(target: ClientNoteEntryView, newText: string) {
    setEntries((current) =>
      current.map((e) =>
        sameEntry(e, target) ? { ...e, notes: newText } : e,
      ),
    );
  }

  function handleDeleted(target: ClientNoteEntryView) {
    setEntries((current) => current.filter((e) => !sameEntry(e, target)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span aria-hidden>📝</span>
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <div className="space-y-2">
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
              onClick={() => {
                setError(null);
                const text = notes;
                const date = noteDate;
                setNotes("");
                startTransition(async () => {
                  try {
                    const result = await updateClientNotes({
                      clientId,
                      notes: text,
                      date,
                    });
                    setUpdatedAt(result.updatedAt);
                    setEntries((current) => [
                      ...current,
                      {
                        date,
                        notes: text,
                        createdAt: new Date().toISOString(),
                      },
                    ]);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("saveFailed"));
                    setNotes(text);
                  }
                });
              }}
            >
              {isPending ? t("saving") : t("addNote")}
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {t("entriesForDate", { date: noteDate })}
          </h3>
          {entriesForDate.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
          ) : (
            <ul className="space-y-2">
              {entriesForDate.map((entry, index) => (
                <EntryItem
                  key={`${entry.date}-${entry.createdAt ?? index}`}
                  clientId={clientId}
                  entry={entry}
                  variant="forDate"
                  onEdited={handleEdited}
                  onDeleted={handleDeleted}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {t("recentTitle")}
          </h3>
          {recentEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRecent")}</p>
          ) : (
            <ul className="space-y-2">
              {recentEntries.map((entry, index) => (
                <EntryItem
                  key={`recent-${entry.date}-${entry.createdAt ?? index}`}
                  clientId={clientId}
                  entry={entry}
                  variant="recent"
                  onEdited={handleEdited}
                  onDeleted={handleDeleted}
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EntryItem({
  clientId,
  entry,
  variant,
  onEdited,
  onDeleted,
}: {
  clientId: string;
  entry: ClientNoteEntryView;
  variant: "forDate" | "recent";
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
    <li
      className={
        variant === "forDate"
          ? "rounded-md border bg-muted/40 p-3 text-sm"
          : "rounded-md border p-3 text-sm"
      }
    >
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{entry.date}</span>
        <div className="flex items-center gap-2">
          <span>
            {entry.createdAt
              ? new Date(entry.createdAt).toLocaleString()
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
