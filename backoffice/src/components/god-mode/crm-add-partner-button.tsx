"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Handshake, LoaderCircle } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { PARTNERS_QUERY_KEY, PARTNERS_ROUTE } from "@/lib/connected-partners";
import { appText } from "@/lib/language";

export type CrmPartnerResult = { partner: { id: string }; created: boolean };

export function CrmAddPartnerButton({
  email,
  disabled = false,
  onAdd,
}: {
  email: string;
  disabled?: boolean;
  onAdd: () => Promise<CrmPartnerResult>;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const queryClient = useQueryClient();
  const messageId = useId();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CrmPartnerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missingEmail = !email.trim();

  async function add() {
    if (lock.current || disabled || missingEmail || result) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const next = await onAdd();
      setResult(next);
      await queryClient.invalidateQueries({ queryKey: PARTNERS_QUERY_KEY }).catch(() => undefined);
    } catch (failure) {
      setError(t(failure instanceof Error ? failure.message : "Could not add this partner."));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mt-2 grid gap-2" data-testid="crm-add-partner">
      {result ? (
        <>
          <Button asChild variant="outline" size="lg" className="w-full justify-center border-emerald-500/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200">
            <Link href={`${PARTNERS_ROUTE}/${encodeURIComponent(result.partner.id)}/edit`}>
              <ExternalLink className="size-4" />
              {t("View partner")}
            </Link>
          </Button>
          <p role="status" className="flex items-center justify-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5 shrink-0" />
            {t(result.created ? "Partner created." : "A partner with this email already exists.")}
          </p>
        </>
      ) : (
        <Button type="button" variant="outline" size="lg" onClick={() => void add()} disabled={disabled || missingEmail || pending} aria-describedby={missingEmail || error ? messageId : undefined} aria-busy={pending} className="w-full justify-center border-emerald-500/40 bg-emerald-500/5 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-200">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Handshake className="size-4" />}
          {t(pending ? "Adding partner..." : "Add as partner")}
        </Button>
      )}
      {error ? <p id={messageId} role="alert" className="text-sm text-destructive">{error}</p> : null}
      {missingEmail && !result ? <p id={messageId} className="text-xs text-muted-foreground">{t("Add an email to this CRM record to create a partner.")}</p> : null}
    </div>
  );
}
