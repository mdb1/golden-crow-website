// ClientRequestRow.tsx — one "pedile algo al cliente" row, as a standalone RSC.
//
// This used to be a private `RequestRow` inside ClientRequestActionsCard, which
// parked both requests in a card of their own halfway down the profile. That
// card was a filing cabinet, not a workflow: the coach who wants to ask for a
// weigh-in is looking at the weight chart, and the one who wants photos is
// looking at the photos. So the card is gone and the rows moved next to the
// thing they are about — the settings dialog + the weight chart for `weight`,
// the progress-photos section for `progressPhotos`.
//
// Each row owns its own server action (closed over `clientId` + `kind`), so
// rendering the weight row TWICE on one page is fine — they are independent
// forms posting the same idempotent request.

import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runClientRequest } from "@/lib/gc-fitness/client-request-actions";
import {
  getClientRequestStatus,
  type ClientRequestKind,
} from "@/lib/gc-fitness/client-request-state";
import type { RequestFulfillment } from "@/lib/gc-fitness/client-request-fulfillment";

type RequestState = {
  statusText: string;
  helperText: string;
  isActive: boolean;
};

type FulfillmentNote = {
  fulfilled: boolean;
  text: string;
};

export interface ClientRequestRowProps {
  clientId: string;
  clientName: string;
  kind: ClientRequestKind;
  timezone: string;
  requestedAt: unknown;
  fulfilled?: RequestFulfillment;
  /**
   * Issue #160 — the weekly check-in covers photos AND weight, so both rows are
   * gated by the same next-eligible date derived in page.tsx from the photos it
   * already loads.
   */
  checkInEligible?: boolean;
  nextEligibleDate?: string | null;
}

export async function ClientRequestRow({
  clientId,
  clientName,
  kind,
  timezone,
  requestedAt,
  fulfilled,
  checkInEligible = true,
  nextEligibleDate = null,
}: ClientRequestRowProps) {
  const locale = await getLocale();
  const t = await getTranslations("clients.detail.requests");
  const now = new Date();

  const state = requestState(requestedAt, now, timezone, locale, t);
  const note = fulfillmentNote(
    fulfilled,
    requestedAt,
    kind === "weight" ? "weight" : "photos",
    now,
    locale,
    t,
  );

  const gated = !checkInEligible && Boolean(nextEligibleDate);
  const gatedHelper = gated
    ? t("status.photoGatedUntil", {
        date: formatCivilDate(nextEligibleDate!, locale),
      })
    : null;

  async function submit() {
    "use server";
    await runClientRequest(clientId, kind);
    revalidatePath(`/gc-fitness/clients/${clientId}`);
    revalidatePath("/gc-fitness/my-activity");
  }

  const title = kind === "weight" ? t("weight.title") : t("progressPhotos.title");
  const description =
    kind === "weight"
      ? t("weight.description", { clientName })
      : t("progressPhotos.description", { clientName });

  return (
    <form action={submit} className="rounded-xl border bg-muted/20 p-4">
      <div className="flex h-full flex-col gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
            {state.statusText}
          </span>
          {/* When gated (#160) the ready-again helper ("you can request now")
              contradicts the next-eligible-date line below — hide it. The
              active-request helper ("reactivates on …") stays. */}
          {gated && !state.isActive ? null : (
            <span className="text-xs text-muted-foreground">{state.helperText}</span>
          )}
        </div>
        {note ? (
          note.fulfilled ? (
            <Badge variant="success" className="h-auto gap-1 py-1">
              <Check aria-hidden />
              {note.text}
            </Badge>
          ) : (
            <Badge variant="warning" className="h-auto py-1">
              {note.text}
            </Badge>
          )
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {gated
              ? (gatedHelper ?? t("status.ready"))
              : state.isActive
                ? t("status.active")
                : t("status.ready")}
          </p>
          <Button
            type="submit"
            variant={state.isActive || gated ? "secondary" : "default"}
            disabled={state.isActive || gated}
          >
            {t("request.cta")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function requestState(
  requestedAt: unknown,
  now: Date,
  timezone: string,
  locale: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): RequestState {
  const status = getClientRequestStatus(requestedAt, now);
  if (!status.requestedAt) {
    return {
      statusText: t("status.never"),
      helperText: t("status.neverHelp"),
      isActive: false,
    };
  }

  const requestedAtLabel = formatDate(status.requestedAt, timezone, locale);
  const expiresAtLabel = status.expiresAt
    ? formatDate(status.expiresAt, timezone, locale, true)
    : null;
  if (status.isActive) {
    return {
      statusText: t("status.requestedOn", { date: requestedAtLabel }),
      helperText: t("status.reactivatesOn", { date: expiresAtLabel ?? "—" }),
      isActive: true,
    };
  }

  return {
    statusText: t("status.lastRequestedOn", { date: requestedAtLabel }),
    helperText: t("status.readyHelp"),
    isActive: false,
  };
}

/**
 * Build the fulfilled/pending note for a request row. Returns null when there
 * is no active-or-past request (nothing to fulfill yet) so the row shows no
 * note. When fulfilled, the label includes a relative "{ago}" string derived
 * from the satisfying upload time.
 */
function fulfillmentNote(
  fulfillment: RequestFulfillment | undefined,
  requestedAt: unknown,
  kind: "photos" | "weight",
  now: Date,
  locale: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): FulfillmentNote | null {
  const status = getClientRequestStatus(requestedAt, now);
  // No request ever made → nothing to fulfill, show no note.
  if (!status.requestedAt) return null;

  if (fulfillment?.fulfilled && fulfillment.fulfilledAt) {
    const ago = relativeTime(new Date(fulfillment.fulfilledAt), now, locale);
    return { fulfilled: true, text: t(`fulfillment.${kind}`, { ago }) };
  }

  return { fulfilled: false, text: t("fulfillment.pending") };
}

/**
 * Compact relative-time string ("hace 2 días" / "2 days ago") for a past date,
 * via `Intl.RelativeTimeFormat`. Picks the largest sensible unit.
 */
function relativeTime(value: Date, now: Date, locale: string): string {
  const diffMs = value.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(diffMs / 3600000);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(diffMs / 86400000);
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  const months = Math.round(diffMs / (30 * 86400000));
  return rtf.format(months, "month");
}

function formatDate(
  value: Date,
  timezone: string,
  locale: string,
  includeTime = false,
): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(value);
  } catch {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(value);
  }
}

/**
 * Render a civil-date ("YYYY-MM-DD") for display without letting the host
 * timezone reinterpret it as an instant — anchor at UTC noon and format in UTC.
 * Mirrors the civil-date label convention used elsewhere in the backoffice.
 */
function formatCivilDate(civilDate: string, locale: string): string {
  const [y, m, d] = civilDate.split("-").map((part) => Number.parseInt(part, 10));
  if (!y || !m || !d) return civilDate;
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return civilDate;
  }
}
