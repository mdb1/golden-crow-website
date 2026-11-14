"use client";

// CorvoReportTriageForm — #504: the operator's triage of ONE Corvo report
// (new / reviewed / resolved + an internal note), on the report's context page.
// Saves through `setCorvoReportTriage`; the note never reaches the user.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setCorvoReportTriage } from "@/lib/gc-fitness/ai-coach-admin-actions";
import {
  REPORT_TRIAGE_NOTE_MAX,
  REPORT_TRIAGE_STATES,
  type ReportTriage,
  type ReportTriageState,
} from "@/lib/gc-fitness/ai-coach-report-triage";

export function CorvoReportTriageForm({
  uid,
  messageId,
  initial,
}: {
  uid: string;
  messageId: string;
  initial: ReportTriage;
}) {
  const t = useTranslations("corvoAdmin.reports");
  const router = useRouter();
  const [status, setStatus] = useState<ReportTriageState>(initial.status);
  const [note, setNote] = useState(initial.note);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      data-testid="corvo-report-triage"
      className="flex flex-col gap-3 rounded-2xl border bg-card px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await setCorvoReportTriage({ uid, messageId, status, note });
          if (result.ok) {
            setMessage(t("triage.saved"));
            router.refresh();
          } else {
            setMessage(t("triage.error", { error: result.error }));
          }
        });
      }}
    >
      <div>
        <p className="font-semibold">{t("triage.title")}</p>
        <p className="text-xs text-muted-foreground">{t("triage.help")}</p>
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t("triage.statusLabel")}</legend>
        {REPORT_TRIAGE_STATES.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
          >
            <input
              type="radio"
              name="triage-status"
              value={value}
              checked={status === value}
              onChange={() => setStatus(value)}
            />
            {value === "resolved"
              ? t("states.resolved")
              : value === "reviewed"
                ? t("states.reviewed")
                : t("states.new")}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">{t("triage.noteLabel")}</span>
        <Textarea
          value={note}
          maxLength={REPORT_TRIAGE_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("triage.notePlaceholder")}
          rows={3}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" className="rounded-full" disabled={pending}>
          {pending ? t("triage.saving") : t("triage.save")}
        </Button>
        {message ? (
          <span role="status" className="text-xs text-muted-foreground">
            {message}
          </span>
        ) : null}
        {initial.updatedAtISO ? (
          <span className="text-xs text-muted-foreground">
            {t("triage.lastUpdate", { time: initial.updatedAtISO.slice(0, 16).replace("T", " ") })}
          </span>
        ) : null}
      </div>
    </form>
  );
}
