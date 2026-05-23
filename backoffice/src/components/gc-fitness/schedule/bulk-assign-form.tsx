"use client";

// bulk-assign-form.tsx
//
// Trainer Bulk Assign form (WTPL-06). Builds a multi-client selection via
// shadcn Checkbox + a TanStack-Table-like list, picks a template + a civil
// date, opens BulkConfirmModal listing every (client, date) pair, then
// fires `bulkAssignTemplate` Server Action on confirm.
//
// CIVIL-DATE CONTRACT (Pitfall 1):
//   - Calendar uses local-time Date with the parseCivilToLocalDate /
//     formatLocalDateToCivil bridge (same pattern as AssignTemplateModal).
//   - Default civil-date = today in the trainer's timezone via
//     civilDateToday(trainerTimezone).
//
// CONTRACT (locked, do not regress):
//   - Submit button is disabled when clientIds.length < 1 OR > 166.
//   - Submit opens the BulkConfirmModal — does NOT call the Server Action
//     yet (per CONTEXT.md §Specifics line 165 — confirm-before-write).
//   - On confirm, the FINAL subset (post-uncheck) is what gets written.
//   - Success toast: "Assigned to N clients" (the actual N count from the
//     Server-Action response). Redirect to /schedule?clientId=<first>.
//   - Error toast: surfaces the verbatim error message from the Server
//     Action — no UID lists (T-04-24).

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { civilDateToday } from "@/lib/gc-fitness/civil-date";
import { useWorkoutTemplates } from "@/lib/gc-fitness/workout-templates-listener";
import { bulkAssignTemplate } from "@/lib/gc-fitness/workout-assignment-actions";
import { MAX_CLIENTS_PER_BATCH } from "@/lib/gc-fitness/workout-assignment-schema";
import type { ClientRosterEntry } from "@/lib/gc-fitness/client-roster";

import { BulkConfirmModal } from "./bulk-confirm-modal";

interface BulkAssignFormProps {
  clients: ClientRosterEntry[];
  trainerTimezone?: string;
}

function parseCivilToLocalDate(civil: string): Date {
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDateToCivil(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function BulkAssignForm({
  clients,
  trainerTimezone = "UTC",
}: BulkAssignFormProps) {
  const t = useTranslations("schedule.bulkAssign");
  const router = useRouter();
  const { data: templates, isLoading: templatesLoading } = useWorkoutTemplates();

  const [templateId, setTemplateId] = useState<string>("");
  const [civilDate, setCivilDate] = useState<string>(() =>
    civilDateToday(trainerTimezone),
  );
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [meetingNotes, setMeetingNotes] = useState<string>("");
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedClients = useMemo(
    () => clients.filter((c) => selectedUids.has(c.uid)),
    [clients, selectedUids],
  );

  const selectedTemplate = useMemo(
    () => (templates ?? []).find((t) => t.id === templateId),
    [templates, templateId],
  );

  const isWithinCap = selectedUids.size >= 1 && selectedUids.size <= MAX_CLIENTS_PER_BATCH;

  function toggleUid(uid: string) {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function selectAll() {
    setSelectedUids(new Set(clients.slice(0, MAX_CLIENTS_PER_BATCH).map((c) => c.uid)));
  }

  function selectNone() {
    setSelectedUids(new Set());
  }

  async function onConfirm(finalClientIds: string[]) {
    if (!selectedTemplate) {
      toast.error("Pick a template first.");
      return;
    }
    if (finalClientIds.length === 0) {
      toast.error("Keep at least one client checked.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await bulkAssignTemplate({
        templateId,
        clientIds: finalClientIds,
        scheduledFor: civilDate,
        scheduledTime: scheduledTime || undefined,
        meetingNotes: meetingNotes.trim() || undefined,
        timezone: trainerTimezone,
      });
      toast.success(
        `Assigned to ${result.ids.length} ${
          result.ids.length === 1 ? "client" : "clients"
        }.`,
      );
      setConfirmOpen(false);
      // Navigate to the first client's schedule view to give the trainer
      // an immediate "here's what you just wrote" surface.
      const firstClientId = finalClientIds[0];
      router.push(`/gc-fitness/schedule?clientId=${firstClientId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Bulk assign failed.";
      // Surface verbatim — Pitfall 5: no silent truncation. Toast carries
      // count + verbatim error string only; no UID list (T-04-24).
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Template + Date</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    templatesLoading ? "Loading…" : "Choose a template"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name.en} · {t.tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Day</label>
            <Calendar
              mode="single"
              selected={parseCivilToLocalDate(civilDate)}
              onSelect={(d) => {
                if (d) setCivilDate(formatLocalDateToCivil(d));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Scheduled for {civilDate}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Time</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(event) => setScheduledTime(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Meeting notes</label>
              <textarea
                value={meetingNotes}
                onChange={(event) => setMeetingNotes(event.target.value)}
                placeholder="Zoom / Meet link, instructions, prep notes..."
                className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Clients ({selectedUids.size} selected)</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={selectNone}>
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clients on your roster yet.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs">
                  <tr>
                    <th className="w-10 p-2"></th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Timezone</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const checked = selectedUids.has(c.uid);
                    return (
                      <tr
                        key={c.uid}
                        className="border-b last:border-b-0 hover:bg-muted/30"
                      >
                        <td className="p-2">
                          <Checkbox
                            id={`select-${c.uid}`}
                            checked={checked}
                            onCheckedChange={() => toggleUid(c.uid)}
                            aria-label={`Select ${c.displayName}`}
                          />
                        </td>
                        <td className="p-2">
                          <label
                            htmlFor={`select-${c.uid}`}
                            className="cursor-pointer font-medium"
                          >
                            {c.displayName}
                          </label>
                        </td>
                        <td className="p-2 text-muted-foreground">{c.email}</td>
                        <td className="p-2 text-muted-foreground">
                          {c.timezone ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {selectedUids.size > MAX_CLIENTS_PER_BATCH ? (
            <p className="mt-2 text-xs text-destructive">
              Selected {selectedUids.size} clients — the hard cap is{" "}
              {MAX_CLIENTS_PER_BATCH} per submit. Uncheck some to continue.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!templateId || !isWithinCap}
        >
          Review {selectedUids.size}{" "}
          {selectedUids.size === 1 ? "assignment" : "assignments"}
        </Button>
      </div>

      <BulkConfirmModal
        open={confirmOpen}
        onOpenChange={(open) => !submitting && setConfirmOpen(open)}
        templateName={
          selectedTemplate ? selectedTemplate.name.en : "(unknown template)"
        }
        scheduledFor={civilDate}
        candidates={selectedClients}
        submitting={submitting}
        onConfirm={onConfirm}
      />
    </div>
  );
}
