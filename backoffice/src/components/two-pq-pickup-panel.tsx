"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useAppLanguage } from "@/components/app-language-provider";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appText } from "@/lib/language";
import { getPGFlexStatusBadgeVariant, getPGFlexStatusLabel } from "@/lib/pgflex-logistics";
import { sdkFetch } from "@/lib/sdk-client";
import type { TwoPQPickupSummary } from "@/lib/two-pq-forms";
import { formatTwoPQCivilDate } from "@/lib/two-pq-study-summary";

type PickupAction = { action: "cancel" | "retry_notifications" } | {
  action: "reschedule";
  pickupDate: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  pickupOrigin: string;
  pickupDestination: string;
};

const notificationLabels = {
  pending: "Pending",
  sending: "Sending...",
  sent: "Sent",
  failed: "Failed",
  unassigned: "Unassigned",
} as const;

export function TwoPQPickupPanel({ formId, pickup }: {
  formId: string;
  pickup: TwoPQPickupSummary;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const [saved, setSaved] = useState<{
    source: TwoPQPickupSummary;
    pickup: TwoPQPickupSummary;
  } | null>(null);
  const [pending, setPending] = useState<PickupAction["action"] | null>(null);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = saved?.source === pickup ? saved.pickup : pickup;
  const canCancel = current.canManage && (current.status === "planned" || current.status === "confirmed");
  const canChangeSchedule = canCancel ||
    (current.canManage && current.status === "cancelled" && current.expectedCaseCount > 0);
  const notifications = [
    { label: "Planned pickup notification", status: current.plannedEmailStatus },
    { label: "Pickup confirmation notification", status: current.confirmedEmailStatus },
    { label: "Latest pickup update notification", status: current.latestEmailStatus },
  ];
  const canRetry = current.canManage && notifications.some(({ status }) =>
    status === "failed" || status === "unassigned" || status === "pending",
  );
  const scheduleFields = [
    { name: "pickupDate", label: "Expected pickup date", value: current.pickupDate, type: "date" },
    { name: "pickupWindowStart", label: "Pickup window start", value: current.pickupWindowStart, type: "time" },
    { name: "pickupWindowEnd", label: "Pickup window end", value: current.pickupWindowEnd, type: "time" },
    { name: "pickupOrigin", label: "Pickup origin", value: current.origin, type: "text" },
    { name: "pickupDestination", label: "Pickup destination", value: current.destination, type: "text" },
  ];
  const summaryFields = [
    { label: "Expected pickup date", value: formatTwoPQCivilDate(current.pickupDate, language) },
    { label: "Pickup window", value: `${current.pickupWindowStart} – ${current.pickupWindowEnd}` },
    { label: "Pickup origin", value: current.origin },
    { label: "Pickup destination", value: current.destination },
    { label: "Transport temperature", value: `${current.temperatureC} °C` },
    { label: "Cases ready for pickup", value: `${current.readyCaseCount} / ${current.expectedCaseCount}` },
  ];

  async function updatePickup(action: PickupAction) {
    if (pending) return;
    setPending(action.action);
    setError(null);
    try {
      const response = await sdkFetch<{ pickup: TwoPQPickupSummary }>(
        `/2pq/forms/${encodeURIComponent(formId)}/pickup`,
        { method: "PATCH", body: JSON.stringify(action) },
      );
      setSaved({ source: pickup, pickup: response.pickup });
      setEditing(false);
      setCancelling(false);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to update pickup.");
    } finally {
      setPending(null);
    }
  }

  function reschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void updatePickup({
      action: "reschedule",
      pickupDate: String(values.get("pickupDate") ?? ""),
      pickupWindowStart: String(values.get("pickupWindowStart") ?? ""),
      pickupWindowEnd: String(values.get("pickupWindowEnd") ?? ""),
      pickupOrigin: String(values.get("pickupOrigin") ?? "").trim(),
      pickupDestination: String(values.get("pickupDestination") ?? "").trim(),
    });
  }

  const errorMessage = error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null;

  return (
    <section id="pickup-confirmation" aria-labelledby="pickup-confirmation-title" className="glass-panel grid scroll-mt-24 gap-4 px-5 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="pickup-confirmation-title" className="font-heading text-xl font-semibold">{t("Pickup confirmation")}</h2>
        <Badge variant={getPGFlexStatusBadgeVariant(current.status)}>
          {t(getPGFlexStatusLabel(current.status))}
        </Badge>
      </div>
      {current.status === "planned" ? (
        <p className="text-sm text-muted-foreground">{t("Pickup is confirmed once all linked biopsies are saved.")}</p>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaryFields.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{t(label)}</dt>
            <dd className="break-words text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {notifications.map(({ label, status }) => status ? (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{t(label)}</dt>
            <dd className="text-sm font-medium">{t(notificationLabels[status])}</dd>
          </div>
        ) : null)}
      </dl>
      {!editing && !cancelling ? errorMessage : null}
      {canChangeSchedule || canRetry ? (
        <div className="flex flex-wrap gap-2">
          {canChangeSchedule ? (
            <>
              <Dialog open={editing} onOpenChange={(open) => {
                if (pending) return;
                if (open) setError(null);
                setEditing(open);
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={Boolean(pending)}>{t("Reschedule pickup")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={reschedule} className="grid gap-4">
                    <DialogHeader>
                      <DialogTitle>{t("Reschedule pickup")}</DialogTitle>
                      <DialogDescription>
                        {t(current.temperatureC === 4 && current.readyCaseCount === 0
                          ? "The pickup date and estimated biopsy date move together for refrigerated transport."
                          : "The new schedule applies to all cases in this pickup.")}
                      </DialogDescription>
                    </DialogHeader>
                    {scheduleFields.map(({ name, label, value, type }) => (
                      <div key={name} className="grid gap-1.5">
                        <Label htmlFor={`pickup-schedule-${name}`}>{t(label)}</Label>
                        <Input id={`pickup-schedule-${name}`} name={name} defaultValue={value} type={type} required disabled={Boolean(pending)} />
                      </div>
                    ))}
                    {errorMessage}
                    <DialogFooter>
                      <Button type="submit" disabled={Boolean(pending)}>{t("Save changes")}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              {canCancel ? <AlertDialog open={cancelling} onOpenChange={(open) => {
                if (pending) return;
                if (open) setError(null);
                setCancelling(open);
              }}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={Boolean(pending)}>{t("Cancel pickup")}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("Cancel pickup")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("This cancels transport for all cases in this pickup.")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  {errorMessage}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={Boolean(pending)}>{t("Keep pickup")}</AlertDialogCancel>
                    <Button variant="destructive" onClick={() => void updatePickup({ action: "cancel" })} disabled={Boolean(pending)}>
                      {t("Cancel pickup")}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog> : null}
            </>
          ) : null}
          {canRetry ? (
            <Button variant="outline" size="sm" onClick={() => void updatePickup({ action: "retry_notifications" })} disabled={Boolean(pending)}>
              {t("Retry pickup notifications")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
