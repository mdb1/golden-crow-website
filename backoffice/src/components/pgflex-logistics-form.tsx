"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Navigation,
  PackageCheck,
  PlusCircle,
  RotateCcw,
  Save,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { PGFlexRoutePreview } from "@/components/pgflex-route-preview";
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
  PGFLEX_2PQ_DESTINATION,
  PGFLEX_LOGISTICS_SHIPMENT_TYPE_OPTIONS,
  PGFLEX_LOGISTICS_STATUS_OPTIONS,
  getPGFlexStatusBadgeVariant,
  getPGFlexStatusLabel,
  type PGFlexLogisticsInput,
  type PGFlexLogisticsListItem,
  type PGFlexLogisticsShipmentType,
  type PGFlexLogisticsStatus,
  type PGFlexTransportDispatcherOption,
} from "@/lib/pgflex-logistics";
import { formatDateTime } from "@/lib/moderation-utils";
import { sdkFetch } from "@/lib/sdk-client";

const UNASSIGNED_DISPATCHER_VALUE = "__unassigned__";
const PGFLEX_CREATION_CONFETTI = [
  {
    left: "9%",
    top: "18%",
    color: "#93c5fd",
    delay: "0ms",
    duration: "1080ms",
  },
  {
    left: "18%",
    top: "10%",
    color: "#67e8f9",
    delay: "60ms",
    duration: "980ms",
  },
  {
    left: "30%",
    top: "15%",
    color: "#a5b4fc",
    delay: "110ms",
    duration: "1120ms",
  },
  {
    left: "43%",
    top: "8%",
    color: "#bae6fd",
    delay: "170ms",
    duration: "1020ms",
  },
  {
    left: "58%",
    top: "12%",
    color: "#7dd3fc",
    delay: "220ms",
    duration: "1180ms",
  },
  {
    left: "70%",
    top: "14%",
    color: "#38bdf8",
    delay: "280ms",
    duration: "1040ms",
  },
  {
    left: "82%",
    top: "9%",
    color: "#c4b5fd",
    delay: "330ms",
    duration: "1140ms",
  },
  {
    left: "90%",
    top: "20%",
    color: "#bfdbfe",
    delay: "390ms",
    duration: "990ms",
  },
] as const;

type LogisticsFormState = {
  identifier: string;
  shipmentType: PGFlexLogisticsShipmentType;
  description: string;
  linkedCodes: string[];
  dispatcherId: string;
  dispatcherFirebaseId: string;
  dispatcherEmail: string;
  origin: string;
  destination: string;
  status: PGFlexLogisticsStatus;
};

function linkedCodesFromCsv(value?: string | null) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((code) => code.trim().toUpperCase())
        .filter((code) => /^[A-Z]{3}$/.test(code)),
    ),
  ];
}

function normalizeLinkedCode(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function dispatcherActionForStatus(status: PGFlexLogisticsStatus) {
  if (status === "awaiting_pick_up") {
    return {
      nextStatus: "in_transit" as const,
      label: "Pedido Retirado",
      savingLabel: "Saving pickup...",
      Icon: Truck,
    };
  }

  if (status === "in_transit") {
    return {
      nextStatus: "arrived" as const,
      label: "Pedido Entregado",
      savingLabel: "Saving delivery...",
      Icon: CheckCircle2,
    };
  }

  return null;
}

function readOnlyValue(value?: string | null) {
  return value?.trim() || "-";
}

function toFormState(
  item?: PGFlexLogisticsListItem | null,
): LogisticsFormState {
  const dispatcherId = item?.dispatcherId ?? "";
  const dispatcherFirebaseId =
    item?.dispatcherFirebaseId ??
    (dispatcherId.includes("@") ? "" : dispatcherId);
  const dispatcherEmail =
    item?.dispatcherEmail ?? (dispatcherId.includes("@") ? dispatcherId : "");
  const shipmentType =
    item?.shipmentType ??
    (item ? (item.linked_codes ? "2pq" : "other") : "2pq");

  return {
    identifier: item?.identifier ?? "",
    shipmentType,
    description: item?.description ?? "",
    linkedCodes: linkedCodesFromCsv(item?.linked_codes),
    dispatcherId,
    dispatcherFirebaseId,
    dispatcherEmail,
    origin: item?.origin ?? "",
    destination:
      item?.destination ??
      (shipmentType === "other" ? "" : PGFLEX_2PQ_DESTINATION),
    status: item?.status ?? "awaiting_pick_up",
  };
}

function toPayload(
  state: LogisticsFormState,
  selectedDispatcher?: PGFlexTransportDispatcherOption,
  options: { includeStatus?: boolean } = {},
): PGFlexLogisticsInput {
  const dispatcherFirebaseId =
    selectedDispatcher?.firebaseUid ?? state.dispatcherFirebaseId.trim();
  const dispatcherEmail =
    selectedDispatcher?.email ?? state.dispatcherEmail.trim();

  return {
    identifier: state.identifier.trim(),
    shipmentType: state.shipmentType,
    description: state.description.trim() || undefined,
    linked_codes:
      state.shipmentType === "2pq" && state.linkedCodes.length > 0
        ? state.linkedCodes.join(",")
        : undefined,
    dispatcherId: dispatcherFirebaseId || undefined,
    dispatcherFirebaseId: dispatcherFirebaseId || undefined,
    dispatcherEmail: dispatcherEmail || undefined,
    origin: state.origin.trim(),
    destination:
      state.shipmentType === "2pq"
        ? PGFLEX_2PQ_DESTINATION
        : state.destination.trim(),
    ...(options.includeStatus === false ? {} : { status: state.status }),
  };
}

function DispatcherRoutePoint({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-sky-100/80 bg-white/82 px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-sky-300/16 dark:bg-slate-950/40">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700/80 dark:text-sky-200/82">
        <MapPin className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold leading-tight text-foreground md:text-3xl">
        {readOnlyValue(value)}
      </p>
    </div>
  );
}

function DispatcherReadOnlyField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/18 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold leading-6 text-foreground">
        {readOnlyValue(value)}
      </p>
    </div>
  );
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
  const isTransportDispatcher = adminContext.role === "transport_dispatcher";
  const canUpdate = mode === "create" ? isFullAdmin : Boolean(item?.canUpdate);
  const canEditAllFields = isFullAdmin;
  const sourceState = useMemo(() => toFormState(item), [item]);
  const [state, setState] = useState<LogisticsFormState>(sourceState);
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [createdItem, setCreatedItem] =
    useState<PGFlexLogisticsListItem | null>(null);
  const {
    data: dispatcherOptionsPayload,
    isFetching: isFetchingDispatcherOptions,
  } = useQuery({
    queryKey: ["pgflex", "transport-dispatcher-options"],
    queryFn: () =>
      sdkFetch<{ dispatchers: PGFlexTransportDispatcherOption[] }>(
        "/roles/transport-dispatchers/options",
      ),
    enabled: isFullAdmin,
    staleTime: 60_000,
  });
  const dispatcherOptions = dispatcherOptionsPayload?.dispatchers ?? [];
  const selectedDispatcher = dispatcherOptions.find(
    (dispatcher) =>
      dispatcher.firebaseUid === state.dispatcherFirebaseId ||
      dispatcher.email === state.dispatcherEmail,
  );
  const dispatcherSelectValue =
    selectedDispatcher?.firebaseUid ||
    state.dispatcherFirebaseId ||
    UNASSIGNED_DISPATCHER_VALUE;
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);
  const createdItemHref = createdItem
    ? `/pgflex/logistics/${encodeURIComponent(createdItem.id)}`
    : "/pgflex/logistics";

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

    return null;
  }

  function handleDispatcherChange(value: string) {
    if (value === UNASSIGNED_DISPATCHER_VALUE) {
      setState((current) => ({
        ...current,
        dispatcherId: "",
        dispatcherFirebaseId: "",
        dispatcherEmail: "",
      }));
      return;
    }

    const dispatcher = dispatcherOptions.find(
      (option) => option.firebaseUid === value,
    );
    setState((current) => ({
      ...current,
      dispatcherId: dispatcher?.firebaseUid ?? value,
      dispatcherFirebaseId: dispatcher?.firebaseUid ?? value,
      dispatcherEmail: dispatcher?.email ?? current.dispatcherEmail,
    }));
  }

  function handleShipmentTypeChange(value: string) {
    const shipmentType = value as PGFlexLogisticsShipmentType;

    setState((current) => ({
      ...current,
      shipmentType,
      linkedCodes: shipmentType === "2pq" ? current.linkedCodes : [],
      destination:
        shipmentType === "2pq"
          ? PGFLEX_2PQ_DESTINATION
          : current.destination === PGFLEX_2PQ_DESTINATION
            ? ""
            : current.destination,
    }));
  }

  function handleAddLinkedCode() {
    const input = window.prompt(t("Enter a 3-letter code"));

    if (input === null) {
      return;
    }

    const code = normalizeLinkedCode(input);

    if (!code) {
      window.alert(t("Use exactly 3 letters, no numbers."));
      return;
    }

    setState((current) => {
      if (current.linkedCodes.includes(code)) {
        window.alert(t("Code already added."));
        return current;
      }

      return {
        ...current,
        linkedCodes: [...current.linkedCodes, code],
      };
    });
  }

  function handleRemoveLinkedCode(code: string) {
    setState((current) => ({
      ...current,
      linkedCodes: current.linkedCodes.filter(
        (currentCode) => currentCode !== code,
      ),
    }));
  }

  async function handleSave() {
    if (!canUpdate || pending) {
      return;
    }

    const payload = toPayload(state, selectedDispatcher, {
      includeStatus: mode !== "create",
    });
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
        setCreatedItem(response.item);
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

  async function handleDispatcherAdvance(nextStatus: PGFlexLogisticsStatus) {
    if (!item || !isTransportDispatcher || !canUpdate || pending) {
      return;
    }

    setPending("save");
    try {
      await sdkFetch<{ item: PGFlexLogisticsListItem }>(
        `/pgflex/logistics/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      router.refresh();
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("PGFlex logistics status updated."),
      });
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to update PGFlex logistics status."),
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

  if (mode === "edit" && item && isTransportDispatcher) {
    const action = dispatcherActionForStatus(item.status);
    const linkedCodes = linkedCodesFromCsv(item.linked_codes);
    const ActionIcon = action?.Icon;

    return (
      <div
        className={
          action ? "flex flex-col gap-5 pb-40 md:pb-44" : "flex flex-col gap-5"
        }
      >
        <ActionToast toast={toast} onDismiss={() => setToast(null)} />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/pgflex/logistics">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("Back to logistics")}
            </Link>
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            {item.id}
          </span>
          <Badge variant={getPGFlexStatusBadgeVariant(item.status)}>
            {t(getPGFlexStatusLabel(item.status))}
          </Badge>
        </div>

        <section className="glass-panel flex flex-col gap-6 px-5 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-500/10 text-sky-700 shadow-[0_14px_34px_rgba(14,165,233,0.16)] dark:border-sky-300/18 dark:text-sky-100">
                <PackageCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-heading text-2xl font-semibold leading-tight text-foreground">
                  {item.identifier}
                </h2>
                <p className="mt-1 text-base text-muted-foreground">
                  {t("Read-only dispatch detail")}
                </p>
              </div>
            </div>
            <Badge variant={getPGFlexStatusBadgeVariant(item.status)}>
              {t(getPGFlexStatusLabel(item.status))}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
            <DispatcherRoutePoint label={t("From")} value={item.origin} />
            <div className="flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-sky-200/80 bg-sky-500/10 text-sky-700 shadow-[0_14px_34px_rgba(14,165,233,0.14)] dark:border-sky-300/18 dark:text-sky-100">
                <Navigation className="h-5 w-5" />
              </div>
            </div>
            <DispatcherRoutePoint label={t("To")} value={item.destination} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <DispatcherReadOnlyField
              label={t("Shipment type")}
              value={item.shipmentType === "2pq" ? "2PQ" : t("Other")}
            />
            <DispatcherReadOnlyField
              label={t("Time requested")}
              value={
                formatDateTime(item.timeRequested) ??
                item.timeRequested ??
                t("No timestamp")
              }
            />
            <DispatcherReadOnlyField
              label={t("Linked codes")}
              value={linkedCodes.length > 0 ? linkedCodes.join(", ") : "-"}
            />
            <DispatcherReadOnlyField
              label={t("Status")}
              value={t(getPGFlexStatusLabel(item.status))}
            />
            {item.item_was_picked_date_at ? (
              <DispatcherReadOnlyField
                label={t("Picked up at")}
                value={
                  formatDateTime(item.item_was_picked_date_at) ??
                  item.item_was_picked_date_at
                }
              />
            ) : null}
            {item.item_was_delivered_at ? (
              <DispatcherReadOnlyField
                label={t("Delivered at")}
                value={
                  formatDateTime(item.item_was_delivered_at) ??
                  item.item_was_delivered_at
                }
              />
            ) : null}
            {item.description ? (
              <div className="md:col-span-2">
                <DispatcherReadOnlyField
                  label={t("Description")}
                  value={item.description}
                />
              </div>
            ) : null}
          </div>
        </section>

        {action && ActionIcon ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-0">
            <div className="pointer-events-auto mx-auto md:ml-[calc(var(--sidebar-width)+1rem)] md:mr-6 lg:mr-8">
              <div className="rounded-[1.7rem] border border-white/12 bg-background/72 p-4 shadow-[0_-10px_38px_rgba(7,16,24,0.12),0_20px_48px_rgba(7,16,24,0.18)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/54">
                <div className="flex justify-end">
                  <Button
                    onClick={() =>
                      void handleDispatcherAdvance(action.nextStatus)
                    }
                    disabled={!canUpdate || pending !== null}
                    className="h-16 w-full rounded-[1.35rem] border border-sky-200/12 bg-[linear-gradient(180deg,rgba(56,189,248,0.98),rgba(37,99,235,0.96))] text-base font-semibold text-white shadow-[0_18px_52px_rgba(37,99,235,0.34)] disabled:opacity-100 sm:text-lg lg:min-w-[20rem] lg:w-auto lg:px-10"
                  >
                    {pending === "save" ? (
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                    ) : (
                      <ActionIcon className="h-5 w-5" />
                    )}
                    {pending === "save"
                      ? t(action.savingLabel)
                      : t(action.label)}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={
        mode === "create"
          ? "flex flex-col gap-5 pb-40 md:pb-44"
          : "flex flex-col gap-5"
      }
    >
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />
      {mode === "create" && createdItem ? (
        <div className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-background/42 backdrop-blur-[4px]" />
          <div className="pointer-events-auto animate-in fade-in-0 zoom-in-95 relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-sky-200/42 bg-[linear-gradient(155deg,rgba(186,230,253,0.42),rgba(12,74,110,0.98)_50%,rgba(37,99,235,0.94))] px-6 py-8 text-center shadow-[0_34px_130px_rgba(14,165,233,0.34)]">
            {PGFLEX_CREATION_CONFETTI.map((particle, index) => (
              <span
                key={`${particle.left}-${particle.delay}-${index}`}
                className="two-pq-confetti absolute h-3 w-3 rounded-[5px]"
                style={{
                  left: particle.left,
                  top: particle.top,
                  background: particle.color,
                  animationDelay: particle.delay,
                  animationDuration: particle.duration,
                }}
              />
            ))}
            <div className="relative flex flex-col items-center">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-sky-100/18 text-sky-50 shadow-[0_0_0_14px_rgba(186,230,253,0.13)]">
                <span className="two-pq-success-ring absolute inset-0 rounded-full border border-sky-100/60" />
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-sky-50/88">
                {t("Dispatch created")}
              </p>
              <h3 className="mt-2 font-heading text-3xl font-semibold text-white">
                {t("The PGFlex dispatch is ready")}
              </h3>
              <p className="mt-2 max-w-lg text-sm text-sky-50/84">
                {t("Dispatch")}{" "}
                <span className="font-mono text-sky-50">
                  {createdItem.identifier || createdItem.id}
                </span>{" "}
                {t("was saved and is available in PGFlex.")}
              </p>
              <div className="mt-6 grid w-full max-w-lg gap-2 sm:grid-cols-2">
                <Button
                  className="h-12 rounded-[1.1rem] border border-sky-100/12 bg-white px-6 text-sm font-semibold text-sky-950 shadow-[0_18px_48px_rgba(186,230,253,0.22)] hover:bg-sky-50"
                  asChild
                >
                  <Link href={createdItemHref}>
                    <PackageCheck className="h-4 w-4" />
                    {t("Open dispatch")}
                  </Link>
                </Button>
                <Button
                  className="h-12 rounded-[1.1rem] border border-sky-100/16 bg-sky-300/18 px-6 text-sm font-semibold text-white shadow-[0_18px_48px_rgba(12,74,110,0.22)] hover:bg-sky-200/22"
                  asChild
                >
                  <Link href="/pgflex/logistics">
                    {t("See all dispatches")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
            {mode === "edit" ? (
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
                {pending === "save" ? t("Saving...") : t("Save")}
              </Button>
            ) : null}
          </div>
        </div>

        {!isFullAdmin && mode === "edit" ? (
          <div className="rounded-2xl border border-violet-300/35 bg-violet-500/10 px-4 py-3 text-sm text-muted-foreground">
            {t(
              "Transport dispatchers can update only the status of assigned logistics items.",
            )}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="pgflex-shipment-type">{t("Shipment type")}</Label>
            <Select
              value={state.shipmentType}
              onValueChange={handleShipmentTypeChange}
              disabled={!canEditAllFields || pending !== null}
            >
              <SelectTrigger id="pgflex-shipment-type" className="w-full">
                <SelectValue placeholder={t("Select shipment type")} />
              </SelectTrigger>
              <SelectContent>
                {PGFLEX_LOGISTICS_SHIPMENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <Label htmlFor="pgflex-dispatcher">
              {t("Transport dispatcher")}
            </Label>
            <Select
              value={dispatcherSelectValue}
              onValueChange={handleDispatcherChange}
              disabled={!canEditAllFields || pending !== null}
            >
              <SelectTrigger id="pgflex-dispatcher" className="w-full">
                <SelectValue
                  placeholder={
                    isFetchingDispatcherOptions
                      ? t("Loading transport dispatchers...")
                      : t("Select transport dispatcher")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_DISPATCHER_VALUE}>
                  {t("Unassigned")}
                </SelectItem>
                {state.dispatcherFirebaseId && !selectedDispatcher ? (
                  <SelectItem value={state.dispatcherFirebaseId}>
                    {t("Assigned dispatcher")}
                  </SelectItem>
                ) : null}
                {dispatcherOptions.map((dispatcher) => (
                  <SelectItem
                    key={dispatcher.firebaseUid}
                    value={dispatcher.firebaseUid}
                  >
                    {dispatcher.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {state.shipmentType === "2pq" ? (
            <div className="space-y-2 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>{t("Linked codes")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddLinkedCode}
                  disabled={!canEditAllFields || pending !== null}
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  {t("Add more")}
                </Button>
              </div>
              {state.linkedCodes.length > 0 ? (
                <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-muted/20 px-3 py-3">
                  {state.linkedCodes.map((code) => (
                    <span
                      key={code}
                      className="inline-flex h-8 items-center gap-2 rounded-full border border-violet-200/80 bg-violet-500/10 px-3 font-mono text-sm font-semibold text-violet-700 dark:border-violet-300/25 dark:text-violet-100"
                    >
                      {code}
                      {canEditAllFields ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveLinkedCode(code)}
                          disabled={pending !== null}
                          aria-label={`${t("Remove code")} ${code}`}
                          className="rounded-full text-violet-500 transition hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 dark:text-violet-200 dark:hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/80 bg-muted/15 px-3 py-3 text-sm text-muted-foreground">
                  {t("No linked codes added.")}
                </div>
              )}
            </div>
          ) : null}

          <PGFlexRoutePreview
            origin={state.origin}
            destination={state.destination}
            showDestinationField={state.shipmentType === "other"}
            disabled={!canEditAllFields || pending !== null}
            onOriginChange={(origin) =>
              setState((current) => ({ ...current, origin }))
            }
            onDestinationChange={(destination) =>
              setState((current) => ({ ...current, destination }))
            }
          />

          {mode === "edit" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="pgflex-time-requested">
                  {t("Time requested")}
                </Label>
                <Input
                  id="pgflex-time-requested"
                  value={
                    formatDateTime(item?.timeRequested ?? item?.pickupTime) ??
                    item?.timeRequested ??
                    item?.pickupTime ??
                    t("No timestamp")
                  }
                  disabled
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
            </>
          ) : null}

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

      {mode === "create" && !createdItem ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-0">
          <div className="pointer-events-auto mx-auto md:ml-[calc(var(--sidebar-width)+1rem)] md:mr-6 lg:mr-8">
            <div className="rounded-[1.7rem] border border-white/12 bg-background/72 p-4 shadow-[0_-10px_38px_rgba(7,16,24,0.12),0_20px_48px_rgba(7,16,24,0.18)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/54">
              <div className="flex justify-end">
                <Button
                  onClick={() => void handleSave()}
                  disabled={!changed || !canUpdate || pending !== null}
                  className="h-16 w-full rounded-[1.35rem] border border-sky-200/12 bg-[linear-gradient(180deg,rgba(56,189,248,0.98),rgba(37,99,235,0.96))] text-base font-semibold text-white shadow-[0_18px_52px_rgba(37,99,235,0.34)] disabled:opacity-100 sm:text-lg lg:min-w-[20rem] lg:w-auto lg:px-10"
                >
                  {pending === "save" ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <Save className="h-5 w-5" />
                  )}
                  {pending === "save" ? t("Saving...") : t("Create dispatch")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
