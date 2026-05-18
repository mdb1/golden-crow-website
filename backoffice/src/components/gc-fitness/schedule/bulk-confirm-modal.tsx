"use client";

// bulk-confirm-modal.tsx
//
// Pre-submit confirmation dialog for the trainer Bulk Assign flow (WTPL-06).
// Shows the trainer EVERY client+date pair BEFORE the WriteBatch is built.
// Each row has a per-client checkbox (default checked) so the trainer can
// uncheck specific clients before confirming — that's the "are you sure"
// affordance per CONTEXT.md §Specifics line 165.
//
// CONTRACT (locked, do not regress):
//   - Confirm button is disabled when zero clients are checked.
//   - On confirm, the parent gets the FINAL subset of clientIds (the ones
//     that are still checked after any uncheck) — NOT the original full
//     list. This is the user-visible "uncheck path" the bulk-assign
//     Server Action accepts as input.
//   - Error path: parent surfaces the verbatim Server-Action error string
//     (Pitfall 5 — no silent truncation of partial-failure messaging).

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ClientRosterEntry } from "@/lib/gc-fitness/client-roster";

interface BulkConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  scheduledFor: string;
  /** Initially-selected clients passed in from BulkAssignForm. */
  candidates: ClientRosterEntry[];
  submitting: boolean;
  onConfirm: (finalClientIds: string[]) => void;
}

export function BulkConfirmModal({
  open,
  onOpenChange,
  templateName,
  scheduledFor,
  candidates,
  submitting,
  onConfirm,
}: BulkConfirmModalProps) {
  // Track the SUBSET of candidates the trainer wants to keep — defaults to
  // "all of them" every time the modal opens with new candidates.
  const [keepUids, setKeepUids] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.uid)),
  );

  useEffect(() => {
    if (open) {
      setKeepUids(new Set(candidates.map((c) => c.uid)));
    }
  }, [open, candidates]);

  function toggle(uid: string) {
    setKeepUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  const finalCount = keepUids.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Assign &ldquo;{templateName}&rdquo; to {finalCount}{" "}
            {finalCount === 1 ? "client" : "clients"} on {scheduledFor}?
          </DialogTitle>
          <DialogDescription>
            Uncheck any clients you don&rsquo;t want to assign to. Submission
            writes all checked clients atomically — either every assignment
            is created or none are.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto rounded border p-2">
          <ul className="flex flex-col gap-1.5">
            {candidates.map((c) => {
              const checked = keepUids.has(c.uid);
              return (
                <li
                  key={c.uid}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                >
                  <Checkbox
                    id={`bulk-uid-${c.uid}`}
                    checked={checked}
                    onCheckedChange={() => toggle(c.uid)}
                    aria-label={`Include ${c.displayName}`}
                  />
                  <label
                    htmlFor={`bulk-uid-${c.uid}`}
                    className="flex flex-col cursor-pointer"
                  >
                    <span className="font-medium">{c.displayName}</span>
                    {c.email && c.email !== c.displayName ? (
                      <span className="text-xs text-muted-foreground">
                        {c.email}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(Array.from(keepUids))}
            disabled={submitting || finalCount === 0}
          >
            {submitting
              ? "Assigning…"
              : `Confirm ${finalCount} ${
                  finalCount === 1 ? "assignment" : "assignments"
                }`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
