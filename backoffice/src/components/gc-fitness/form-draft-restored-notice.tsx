"use client";

// form-draft-restored-notice.tsx
//
// #382 — tells the coach that what they see came back from a draft (after a
// reload, typically the stale-deployment one), and lets them throw it away.
// A silently restored form reads as "my edit was saved", which it was not.

import { useTranslations } from "next-intl";
import { History } from "lucide-react";

import { Button } from "@/components/ui/button";

interface FormDraftRestoredNoticeProps {
  /** Reset the form to its saved values and drop the draft. */
  onDiscard: () => void;
  /** Keep the draft, hide the notice. */
  onDismiss: () => void;
}

export function FormDraftRestoredNotice({
  onDiscard,
  onDismiss,
}: FormDraftRestoredNoticeProps) {
  const t = useTranslations("formDraft");
  return (
    <div
      role="status"
      data-testid="form-draft-restored"
      className="flex flex-col gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2">
        <History className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{t("restored")}</span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
          {t("discard")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
          {t("keep")}
        </Button>
      </div>
    </div>
  );
}
