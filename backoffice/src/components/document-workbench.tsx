"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COLLECTIONS } from "@/lib/moderation-config";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  CollectionKey,
  ModerationDocumentRecord,
  RelatedRecordLink,
  SubcollectionKey,
} from "@/lib/moderation-types";
import {
  getChangedPaths,
  parseDocumentDraft,
  toPrettyJson,
} from "@/lib/moderation-utils";
import { SubdocumentCard } from "./subdocument-card";

interface SubdocumentGroup {
  key: SubcollectionKey;
  title: string;
  description: string;
  documents: ModerationDocumentRecord[];
}

function SaveDeleteStatus({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  return (
    <div
      className={
        tone === "success"
          ? "rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"
          : "rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      }
    >
      {message}
    </div>
  );
}

export function DocumentWorkbench({
  collectionKey,
  document,
  relatedLinks,
  backHref,
  backLabel,
  deleteHref,
  updateHref,
  subdocuments = [],
  mode = "page",
  title = "Developer raw edit workbench",
  description = "Use this only for developer-level recovery or schema work. Prefer the typed form above whenever possible.",
}: {
  collectionKey: CollectionKey;
  document: ModerationDocumentRecord;
  relatedLinks: RelatedRecordLink[];
  backHref: string;
  backLabel: string;
  deleteHref: string;
  updateHref: string;
  subdocuments?: SubdocumentGroup[];
  mode?: "page" | "embedded";
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const collection = COLLECTIONS[collectionKey];
  const [sourceData, setSourceData] = useState(document.data);
  const [draft, setDraft] = useState(toPrettyJson(document.data));
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(
    null
  );
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const parsedDraft = useMemo(() => parseDocumentDraft(draft), [draft]);
  const changedPaths = useMemo(
    () =>
      parsedDraft.data ? getChangedPaths(sourceData, parsedDraft.data).slice(0, 12) : [],
    [parsedDraft.data, sourceData]
  );

  const hasChanges =
    parsedDraft.data !== undefined && changedPaths.length > 0 && !parsedDraft.error;

  async function handleSave() {
    if (!parsedDraft.data) {
      return;
    }

    setPendingAction("save");
    setStatusMessage(null);

    try {
      const response = await sdkFetch<{ document: ModerationDocumentRecord }>(
        updateHref,
        {
          method: "PUT",
          body: JSON.stringify({ data: parsedDraft.data }),
        }
      );

      setSourceData(response.document.data);
      setDraft(toPrettyJson(response.document.data));
      setStatusMessage({
        tone: "success",
        message: "Document saved. Review the changed scope before leaving the page.",
      });
      setSaveOpen(false);
      router.refresh();
    } catch {
      setStatusMessage({
        tone: "error",
        message: "Save failed. Confirm the JSON payload and retry.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    setPendingAction("delete");
    setStatusMessage(null);

    try {
      await sdkFetch(deleteHref, {
        method: "DELETE",
      });
      router.push(backHref);
      router.refresh();
    } catch {
      setStatusMessage({
        tone: "error",
        message: "Delete failed. The record was not removed.",
      });
      setDeleteOpen(false);
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {mode === "page" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            {document.path}
          </span>
        </div>
      ) : null}

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">
              {mode === "page" ? collection.title : "Developers"}
            </p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(toPrettyJson(sourceData));
                setStatusMessage(null);
              }}
              disabled={!hasChanges}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to source
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveOpen(true)}
              disabled={!hasChanges || Boolean(parsedDraft.error)}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_320px]">
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-border/80 bg-input/70 p-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="min-h-[420px] border-0 bg-transparent font-mono text-xs leading-6 shadow-none focus-visible:ring-0"
              />
            </div>
            {parsedDraft.error ? (
              <SaveDeleteStatus tone="error" message={parsedDraft.error} />
            ) : null}
            {statusMessage ? (
              <SaveDeleteStatus
                tone={statusMessage.tone}
                message={statusMessage.message}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Changed fields
              </p>
              {hasChanges ? (
                <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
                  {changedPaths.map((path) => (
                    <li key={path} className="font-mono text-xs">
                      {path}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No pending changes.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Related records
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {relatedLinks.length > 0 ? (
                  relatedLinks.map((link) => (
                    <Link
                      key={`${link.href}-${link.label}`}
                      href={link.href}
                      className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {link.label}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {link.description}
                      </p>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No related records were inferred from this document.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {subdocuments.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <div>
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {group.title}
            </h3>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>
          {group.documents.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {group.documents.map((subdocument) => (
                <SubdocumentCard
                  key={subdocument.id}
                  collectionKey={collectionKey}
                  documentId={document.id}
                  subcollectionKey={group.key}
                  document={subdocument}
                />
              ))}
            </div>
          ) : (
            <div className="glass-panel px-4 py-4 text-sm text-muted-foreground">
              No nested {group.key} records were found.
            </div>
          )}
        </section>
      ))}

      <AlertDialog open={saveOpen} onOpenChange={setSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Save className="h-5 w-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Confirm save</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite the current document with the JSON draft. The
              following paths changed:{" "}
              {changedPaths.length > 0 ? changedPaths.join(", ") : "none"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSave}
              disabled={pendingAction === "save"}
            >
              {pendingAction === "save" ? "Saving..." : "Save document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/12 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Confirm destructive delete</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {document.path}. Any configured nested records for
              this collection are deleted first. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={pendingAction === "delete"}
            >
              {pendingAction === "delete" ? "Deleting..." : "Delete document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
