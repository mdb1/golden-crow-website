import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runClientRequest } from "@/lib/gc-fitness/client-request-actions";
import { getClientRequestStatus } from "@/lib/gc-fitness/client-request-state";
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

export default async function ClientRequestActionsCard({
  clientId,
  clientName,
  timezone,
  progressPhotosRequestedAt,
  bodyWeightRequestedAt,
  progressPhotosFulfilled,
  bodyWeightFulfilled,
  progressPhotosCheckInEligible = true,
  progressPhotosNextEligibleDate = null,
}: {
  clientId: string;
  clientName: string;
  timezone: string;
  progressPhotosRequestedAt: unknown;
  bodyWeightRequestedAt: unknown;
  progressPhotosFulfilled?: RequestFulfillment;
  bodyWeightFulfilled?: RequestFulfillment;
  // Issue #160 — when the client is NOT eligible (baseline complete AND within
  // the 7-day window), both request buttons are disabled with a helper naming
  // the next-eligible date. Derived in page.tsx from the photos it already
  // loads — no extra read. The weekly check-in covers photos AND weight in the
  // coaching flow, so the weight row is gated by the same date.
  progressPhotosCheckInEligible?: boolean;
  progressPhotosNextEligibleDate?: string | null;
}) {
  const locale = await getLocale();
  const t = await getTranslations("clients.detail.requests");
  const now = new Date();
  const progressPhotos = requestState(progressPhotosRequestedAt, now, timezone, locale, t);
  const bodyWeight = requestState(bodyWeightRequestedAt, now, timezone, locale, t);
  const progressPhotosNote = fulfillmentNote(
    progressPhotosFulfilled,
    progressPhotosRequestedAt,
    "photos",
    now,
    locale,
    t,
  );
  const bodyWeightNote = fulfillmentNote(
    bodyWeightFulfilled,
    bodyWeightRequestedAt,
    "weight",
    now,
    locale,
    t,
  );

  // Issue #160 — gate BOTH request rows. When the client is within their
  // weekly check-in window, re-requesting can't help, so disable the buttons
  // and explain the next-eligible date (the check-in covers photos + weight).
  const photoGated =
    !progressPhotosCheckInEligible && Boolean(progressPhotosNextEligibleDate);
  const photoGatedHelper = photoGated
    ? t("status.photoGatedUntil", {
        date: formatCivilDate(progressPhotosNextEligibleDate!, locale),
      })
    : null;

  async function requestProgressPhotos() {
    "use server";
    await runClientRequest(clientId, "progressPhotos");
    revalidatePath(`/gc-fitness/clients/${clientId}`);
    revalidatePath("/gc-fitness/my-activity");
  }

  async function requestWeight() {
    "use server";
    await runClientRequest(clientId, "weight");
    revalidatePath(`/gc-fitness/clients/${clientId}`);
    revalidatePath("/gc-fitness/my-activity");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <RequestRow
          title={t("progressPhotos.title")}
          description={t("progressPhotos.description", { clientName })}
          state={progressPhotos}
          note={progressPhotosNote}
          action={requestProgressPhotos}
          submitLabel={t("request.cta")}
          activeLabel={t("status.active")}
          readyLabel={t("status.ready")}
          gated={photoGated}
          gatedHelper={photoGatedHelper}
        />
        <RequestRow
          title={t("weight.title")}
          description={t("weight.description", { clientName })}
          state={bodyWeight}
          note={bodyWeightNote}
          action={requestWeight}
          submitLabel={t("request.cta")}
          activeLabel={t("status.active")}
          readyLabel={t("status.ready")}
          gated={photoGated}
          gatedHelper={photoGatedHelper}
        />
      </CardContent>
    </Card>
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
      helperText: t("status.reactivatesOn", {
        date: expiresAtLabel ?? "—",
      }),
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
  const absMinutes = Math.abs(minutes);
  if (absMinutes < 60) return rtf.format(minutes, "minute");
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

function RequestRow({
  title,
  description,
  state,
  note,
  action,
  submitLabel,
  activeLabel,
  readyLabel,
  gated = false,
  gatedHelper = null,
}: {
  title: string;
  description: string;
  state: RequestState;
  note: FulfillmentNote | null;
  action: () => Promise<void>;
  submitLabel: string;
  activeLabel: string;
  readyLabel: string;
  gated?: boolean;
  gatedHelper?: string | null;
}) {
  return (
    <form action={action} className="rounded-xl border bg-muted/20 p-4">
      <div className="flex h-full flex-col gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
            {state.statusText}
          </span>
          <span className="text-xs text-muted-foreground">{state.helperText}</span>
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
        {gated && gatedHelper ? (
          <p className="text-xs text-muted-foreground">{gatedHelper}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {gated ? (gatedHelper ?? readyLabel) : state.isActive ? activeLabel : readyLabel}
          </p>
          <Button
            type="submit"
            variant={state.isActive || gated ? "secondary" : "default"}
            disabled={state.isActive || gated}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
