import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runClientRequest } from "@/lib/gc-fitness/client-request-actions";
import { getClientRequestStatus } from "@/lib/gc-fitness/client-request-state";

type RequestState = {
  statusText: string;
  helperText: string;
  isActive: boolean;
};

export default async function ClientRequestActionsCard({
  clientId,
  clientName,
  timezone,
  progressPhotosRequestedAt,
  bodyWeightRequestedAt,
}: {
  clientId: string;
  clientName: string;
  timezone: string;
  progressPhotosRequestedAt: unknown;
  bodyWeightRequestedAt: unknown;
}) {
  const locale = await getLocale();
  const t = await getTranslations("clients.detail.requests");
  const now = new Date();
  const progressPhotos = requestState(progressPhotosRequestedAt, now, timezone, locale, t);
  const bodyWeight = requestState(bodyWeightRequestedAt, now, timezone, locale, t);

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
          action={requestProgressPhotos}
          submitLabel={t("request.cta")}
          activeLabel={t("status.active")}
          readyLabel={t("status.ready")}
        />
        <RequestRow
          title={t("weight.title")}
          description={t("weight.description", { clientName })}
          state={bodyWeight}
          action={requestWeight}
          submitLabel={t("request.cta")}
          activeLabel={t("status.active")}
          readyLabel={t("status.ready")}
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

function RequestRow({
  title,
  description,
  state,
  action,
  submitLabel,
  activeLabel,
  readyLabel,
}: {
  title: string;
  description: string;
  state: RequestState;
  action: () => Promise<void>;
  submitLabel: string;
  activeLabel: string;
  readyLabel: string;
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
        <div className="mt-auto flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {state.isActive ? activeLabel : readyLabel}
          </p>
          <Button type="submit" variant={state.isActive ? "secondary" : "default"} disabled={state.isActive}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
