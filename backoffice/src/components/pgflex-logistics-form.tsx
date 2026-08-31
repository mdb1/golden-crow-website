"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, LoaderCircle, RotateCcw, Save, Trash2 } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appText } from "@/lib/language";
import {
  PGFLEX_LOGISTICS_STATUS_OPTIONS,
  getPGFlexStatusBadgeVariant,
  getPGFlexStatusLabel,
  type PGFlexLogisticsInput,
  type PGFlexLogisticsListItem,
  type PGFlexLogisticsStatus,
} from "@/lib/pgflex-logistics";
import { sdkFetch } from "@/lib/sdk-client";

type LogisticsFormState = {
  identifier: string;
  description: string;
  dispatcherId: string;
  origin: string;
  destination: string;
  pickupTime: string;
  status: PGFlexLogisticsStatus;
};

function toDateTimeLocalValue(value: string | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 16);
  }

  const localDate = new Date(
    parsed.getTime() - parsed.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  const parsed = new Date(trimmedValue);
  return Number.isNaN(parsed.getTime()) ? trimmedValue : parsed.toISOString();
}

function toFormState(item?: PGFlexLogisticsListItem | null): LogisticsFormState {
  return {
    identifier: item?.identifier ?? "",
    description: item?.description ?? "",
    dispatcherId: item?.dispatcherId ?? "",
    origin: item?.origin ?? "",
    destination: item?.destination ?? "",
    pickupTime: toDateTimeLocalValue(item?.pickupTime),
    status: item?.status ?? "awaiting_pick_up",
  };
}

function toPayload(state: LogisticsFormState): PGFlexLogisticsInput {
  return {
    identifier: state.identifier.trim(),
    description: state.description.trim() || undefined,
    dispatcherId: state.dispatcherId.trim() || undefined,
    origin: state.origin.trim(),
    destination: state.destination.trim(),
    pickupTime: toIsoDateTime(state.pickupTime),
    status: state.status,
  };
}

export function PGFlexLogisticsForm({
  item,
  mode = "edit",
}: {
  item?: PGFlexLogisticsListItem | null;
  mode?: "create" | "edit";
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const isFullAdmin = adminContext.role === "full_admin";
  const canUpdate = mode === "create" ? isFullAdmin : Boolean(item?.canUpdate);
  const canEditAllFields = isFullAdmin;
  const sourceState = useMemo(() => toFormState(item), [item]);
  const [state, setState] = useState<LogisticsFormState>(sourceState);
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);

  function validatePayload(payload: PGFlexLogisticsInput) {
    if (!payload.identifier) {
      return "Identifier is required.";
    }

    if (!payload.origin) {
      return "Origin is required.";
    }

    if (!payload.destination) {
      return "Destination is required.";
    }

    if (!payload.pickupTime) {
      return "Time of pick up is required.";
    }

    return null;
  }

  async function handleSave() {
    if (!canUpdate || pending) {
      return;
    }

    const payload = toPayload(state);
    const validationError = isFullAdmin ? validatePayload(payload) : null;
    if (validationError) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t(validationError),
      });
      return;
    }

    setPending("save");
    try {
      if (mode === "create") {
        const response = await sdkFetch<{ item: PGFlexLogisticsListItem }>(
          "/pgflex/logistics",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
        router.push(`/pgflex/logistics/${response.item.id}`);
      } else if (item && isFullAdmin) {
        await sdkFetch<{ item: PGFlexLogisticsListItem }>(
          `/pgflex/logistics/${encodeURIComponent(item.id)}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
        );
        router.refresh();
        setToast({
          id: Date.now(),
          tone: "success",
          message: t("PGFlex logistics item saved."),
        });
      } else if (item) {
        await sdkFetch<{ item: PGFlexLogisticsListItem }>(
          `/pgflex/logistics/${encodeURIComponent(item.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ status: state.status }),
          },
        );
        router.refresh();
        setToast({
          id: Date.now(),
          tone: "success",
          message: t("PGFlex logistics status updated."),
        });
      }
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          mode === "create"
            ? t("Unable to create PGFlex logistics item.")
            : t("Unable to save PGFlex logistics item."),
      });
    } finally {
      setPending(null);
    }
  }

  async function handleDelete() {
    if (!item || !isFullAdmin || pending) {
      return;
    }

    setPending("delete");
    try {
      await sdkFetch(`/pgflex/logistics/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      router.push("/pgflex/logistics");
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to delete PGFlex logistics item."),
      });
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/pgflex/logistics">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("Back to logistics")}
          </Link>
        </Button>
        {item ? (
          <>
            <span className="font-mono text-xs text-muted-foreground">
              {item.id}
            </span>
            <Badge variant={getPGFlexStatusBadgeVariant(item.status)}>
              {t(getPGFlexStatusLabel(item.status))}
            </Badge>
          </>
        ) : null}
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create"
                ? t("Create dispatch")
                : t("Logistics workbench")}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeaderUnclutterButton />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState(sourceState)}
              disabled={!changed || pending !== null}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("Reset")}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={!changed || !canUpdate || pending !== null}
            >
              {pending === "save" ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {pending === "save"
                ? t("Saving...")
                : mode === "create"
                  ? t("Create dispatch")
                  : t("Save")}
            </Button>
          </div>
        </div>

        {!isFullAdmin && mode === "edit" ? (
          <div className="rounded-2xl border border-violet-300/35 bg-violet-500/10 px-4 py-3 text-sm text-muted-foreground">
            {t("Transport dispatchers can update only the status of assigned logistics items.")}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pgflex-identifier">{t("Identifier")}</Label>
            <Input
              id="pgflex-identifier"
              value={state.identifier}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  identifier: event.target.value,
                }))
              }
              disabled={!canEditAllFields || pending !== null}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pgflex-dispatcher">{t("Dispatcher ID")}</Label>
            <Input
              id="pgflex-dispatcher"
              value={state.dispatcherId}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  dispatcherId: event.target.value,
                }))
              }
              placeholder={t("Transport dispatcher email")}
              disabled={!canEditAllFields || pending !== null}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pgflex-origin">{t("Origin")}</Label>
            <Input
              id="pgflex-origin"
              value={state.origin}
              onChange={(event) =>
                setState((current) => ({ ...current, origin: event.target.value }))
              }
              disabled={!canEditAllFields || pending !== null}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pgflex-destination">{t("Destination")}</Label>
            <Input
              id="pgflex-destination"
              value={state.destination}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  destination: event.target.value,
                }))
              }
              disabled={!canEditAllFields || pending !== null}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pgflex-pickup">{t("Time of pick up")}</Label>
            <Input
              id="pgflex-pickup"
              type="datetime-local"
              value={state.pickupTime}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  pickupTime: event.target.value,
                }))
              }
              disabled={!canEditAllFields || pending !== null}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pgflex-status">{t("Status")}</Label>
            <Select
              value={state.status}
              onValueChange={(status) =>
                setState((current) => ({
                  ...current,
                  status: status as PGFlexLogisticsStatus,
                }))
              }
              disabled={!canUpdate || pending !== null}
            >
              <SelectTrigger id="pgflex-status">
                <SelectValue placeholder={t("Select status")} />
              </SelectTrigger>
              <SelectContent>
                {PGFLEX_LOGISTICS_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="pgflex-description">{t("Description")}</Label>
            <Textarea
              id="pgflex-description"
              value={state.description}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              disabled={!canEditAllFields || pending !== null}
            />
          </div>
        </div>
      </section>

      {mode === "edit" && item && isFullAdmin ? (
        <section className="glass-panel flex flex-col gap-4 px-5 py-4">
          <div>
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {t("Danger zone")}
            </h3>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="w-fit"
                disabled={pending !== null}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("Delete dispatch")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/12 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </AlertDialogMedia>
                <AlertDialogTitle>{t("Delete dispatch?")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("This removes the standalone PGFlex logistics item.")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    void handleDelete();
                  }}
                >
                  {pending === "delete" ? t("Deleting...") : t("Delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      ) : null}
    </div>
  );
}
