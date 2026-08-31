"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  LoaderCircle,
  PlusCircle,
  RotateCcw,
  Save,
  Trash2,
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
  PGFLEX_LOGISTICS_STATUS_OPTIONS,
  getPGFlexStatusBadgeVariant,
  getPGFlexStatusLabel,
  type PGFlexLogisticsInput,
  type PGFlexLogisticsListItem,
  type PGFlexLogisticsStatus,
  type PGFlexTransportDispatcherOption,
} from "@/lib/pgflex-logistics";
import { formatDateTime } from "@/lib/moderation-utils";
import { sdkFetch } from "@/lib/sdk-client";

const UNASSIGNED_DISPATCHER_VALUE = "__unassigned__";

type LogisticsFormState = {
  identifier: string;
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

function toFormState(
  item?: PGFlexLogisticsListItem | null,
): LogisticsFormState {
  const dispatcherId = item?.dispatcherId ?? "";
  const dispatcherFirebaseId =
    item?.dispatcherFirebaseId ??
    (dispatcherId.includes("@") ? "" : dispatcherId);
  const dispatcherEmail =
    item?.dispatcherEmail ?? (dispatcherId.includes("@") ? dispatcherId : "");

  return {
    identifier: item?.identifier ?? "",
    description: item?.description ?? "",
    linkedCodes: linkedCodesFromCsv(item?.linked_codes),
    dispatcherId,
    dispatcherFirebaseId,
    dispatcherEmail,
    origin: item?.origin ?? "",
    destination: item?.destination ?? "",
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
    description: state.description.trim() || undefined,
    linked_codes:
      state.linkedCodes.length > 0 ? state.linkedCodes.join(",") : undefined,
    dispatcherId: dispatcherFirebaseId || undefined,
    dispatcherFirebaseId: dispatcherFirebaseId || undefined,
    dispatcherEmail: dispatcherEmail || undefined,
    origin: state.origin.trim(),
    destination: state.destination.trim(),
    ...(options.includeStatus === false ? {} : { status: state.status }),
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
    <div
      className={
        mode === "create"
          ? "flex flex-col gap-5 pb-40 md:pb-44"
          : "flex flex-col gap-5"
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

          <PGFlexRoutePreview
            origin={state.origin}
            destination={state.destination}
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

      {mode === "create" ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-0">
          <div className="pointer-events-auto mx-auto md:ml-[calc(var(--sidebar-width)+1rem)] md:mr-6 lg:mr-8">
            <div className="rounded-[1.7rem] border border-white/12 bg-background/72 p-4 shadow-[0_-10px_38px_rgba(7,16,24,0.12),0_20px_48px_rgba(7,16,24,0.18)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/54">
              <Button
                onClick={() => void handleSave()}
                disabled={!changed || !canUpdate || pending !== null}
                className="h-16 w-full rounded-[1.35rem] border border-sky-200/12 bg-[linear-gradient(180deg,rgba(56,189,248,0.98),rgba(37,99,235,0.96))] text-base font-semibold text-white shadow-[0_18px_52px_rgba(37,99,235,0.34)] disabled:opacity-100 sm:text-lg"
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
