"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Braces,
  CheckCircle2,
  FileText,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import {
  SUPPORT_SERVICE_OFFER_STATUSES,
  SUPPORT_SERVICE_STAGES,
  SUPPORT_SERVICE_TRANSACTION_STATUSES,
  compactJson,
  offerStatusLabel,
  stageLabel,
  transactionStatusLabel,
  type SupportServiceOfferInput,
  type SupportServiceOfferRecord,
  type SupportServiceOffersPage,
  type SupportServiceStage,
  type SupportServiceTransactionInput,
  type SupportServiceTransactionRecord,
  type SupportServiceTransactionsPage,
} from "@/lib/support-services";
import { cn } from "@/lib/utils";

type WorkbenchKind = "offers" | "transactions";

type OfferFormState = {
  serviceId: string;
  serviceVersion: string;
  name: string;
  providerId: string;
  stage: SupportServiceStage;
  status: SupportServiceOfferInput["status"];
  availability: string;
  description: string;
  shortContract: string;
  providerWork: string;
  formShapeJson: string;
  inputSlotsJson: string;
  outputSlotsJson: string;
  acceptedConditions: string;
  scopeRules: string;
  commercialTermsJson: string;
};

type TransactionFormState = {
  requestId: string;
  serviceId: string;
  serviceVersion: string;
  status: SupportServiceTransactionInput["status"];
  requesterEmail: string;
  subjectId: string;
  formObjectId: string;
  formRevision: string;
  inputsJson: string;
  outputsJson: string;
  notes: string;
};

type DialogState =
  | { mode: "create"; offer?: undefined; transaction?: undefined }
  | { mode: "edit"; offer: SupportServiceOfferRecord; transaction?: undefined }
  | {
      mode: "edit";
      offer?: undefined;
      transaction: SupportServiceTransactionRecord;
    }
  | null;

type ServiceFilters = {
  query: string;
  status: string;
  stage: string;
  serviceId: string;
};

const SERVICE_PAGE_SIZE = 20;
const OFFERS_QUERY_KEY = "god-mode-support-service-offers";
const TRANSACTIONS_QUERY_KEY = "god-mode-support-service-transactions";

const EMPTY_OFFER_FORM: OfferFormState = {
  serviceId: "pgs_",
  serviceVersion: "1.0.0",
  name: "",
  providerId: "pgp_",
  stage: "test_planning",
  status: "draft",
  availability: "backoffice",
  description: "",
  shortContract: "form → output",
  providerWork: "",
  formShapeJson: '{\n  "id": "pgfs_",\n  "version": "1.0.0",\n  "fields": []\n}',
  inputSlotsJson: "[]",
  outputSlotsJson: "[]",
  acceptedConditions: "",
  scopeRules: "",
  commercialTermsJson:
    '{\n  "price": {\n    "amount": 0,\n    "currency": "ARS",\n    "basis": "per accepted request"\n  },\n  "turnaround": ""\n}',
};

function emptyTransactionForm(): TransactionFormState {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "z")
    .toLowerCase();

  return {
    requestId: `pgr_${stamp}`,
    serviceId: "pgs_",
    serviceVersion: "1.0.0",
    status: "submitted",
    requesterEmail: "",
    subjectId: "",
    formObjectId: "obj_",
    formRevision: "1",
    inputsJson: "[]",
    outputsJson: "[]",
    notes: "",
  };
}

function emptyFilters(): ServiceFilters {
  return {
    query: "",
    status: "all",
    stage: "all",
    serviceId: "",
  };
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseJsonObject(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function parseJsonArray(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }

  return parsed as Record<string, unknown>[];
}

function offerFormFromRecord(record?: SupportServiceOfferRecord): OfferFormState {
  if (!record) {
    return EMPTY_OFFER_FORM;
  }

  return {
    serviceId: record.serviceId,
    serviceVersion: record.serviceVersion,
    name: record.name,
    providerId: record.providerId,
    stage: record.stages[0] ?? "test_planning",
    status: record.status,
    availability: record.availability,
    description: record.description,
    shortContract: record.shortContract,
    providerWork: record.providerWork,
    formShapeJson: compactJson(record.formShape, "{}"),
    inputSlotsJson: compactJson(record.inputSlots, "[]"),
    outputSlotsJson: compactJson(record.outputSlots, "[]"),
    acceptedConditions: record.acceptedConditions.join("\n"),
    scopeRules: record.scopeRules.join("\n"),
    commercialTermsJson: compactJson(record.commercialTerms, "{}"),
  };
}

function transactionFormFromRecord(
  record?: SupportServiceTransactionRecord,
): TransactionFormState {
  if (!record) {
    return emptyTransactionForm();
  }

  return {
    requestId: record.requestId,
    serviceId: record.serviceId,
    serviceVersion: record.serviceVersion,
    status: record.status,
    requesterEmail: record.requesterEmail,
    subjectId: record.subjectId,
    formObjectId: record.formRef.objectId,
    formRevision: String(record.formRef.revision),
    inputsJson: compactJson(record.inputs, "[]"),
    outputsJson: compactJson(record.outputs, "[]"),
    notes: record.notes,
  };
}

function offerPayloadFromForm(form: OfferFormState): SupportServiceOfferInput {
  return {
    serviceId: form.serviceId.trim(),
    serviceVersion: form.serviceVersion.trim() || "1.0.0",
    name: form.name.trim(),
    providerId: form.providerId.trim(),
    stages: [form.stage],
    status: form.status,
    availability: form.availability.trim(),
    description: form.description.trim(),
    shortContract: form.shortContract.trim(),
    providerWork: form.providerWork.trim(),
    formShape: parseJsonObject(form.formShapeJson, "Form shape"),
    inputSlots: parseJsonArray(form.inputSlotsJson, "Input slots"),
    outputSlots: parseJsonArray(form.outputSlotsJson, "Output slots"),
    acceptedConditions: splitLines(form.acceptedConditions),
    scopeRules: splitLines(form.scopeRules),
    commercialTerms: parseJsonObject(
      form.commercialTermsJson,
      "Commercial terms",
    ),
  };
}

function transactionPayloadFromForm(
  form: TransactionFormState,
): SupportServiceTransactionInput {
  const revision = Number(form.formRevision);
  if (!Number.isFinite(revision) || revision < 1) {
    throw new Error("Form revision must be a positive number.");
  }

  return {
    requestId: form.requestId.trim(),
    serviceId: form.serviceId.trim(),
    serviceVersion: form.serviceVersion.trim() || "1.0.0",
    status: form.status,
    requesterEmail: form.requesterEmail.trim(),
    subjectId: form.subjectId.trim(),
    formRef: {
      objectId: form.formObjectId.trim(),
      revision: Math.trunc(revision),
    },
    inputs: parseJsonArray(form.inputsJson, "Inputs").map((item) => ({
      role: String(item.role ?? "").trim(),
      objectRef: item.objectRef as SupportServiceTransactionInput["formRef"],
    })),
    outputs: parseJsonArray(form.outputsJson, "Outputs").map((item) => ({
      role: String(item.role ?? "").trim(),
      objectRef: item.objectRef as SupportServiceTransactionInput["formRef"],
    })),
    notes: form.notes.trim(),
  };
}

function dateLabel(value?: string) {
  if (!value) {
    return "No timestamp";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function mutationErrorToast(error: unknown, id: number): ActionToastState {
  return {
    id,
    tone: "error",
    message: error instanceof Error ? error.message : "Action failed.",
    details: error instanceof SdkRequestError ? error.details : undefined,
  };
}

function buildListPath(kind: WorkbenchKind, filters: ServiceFilters, cursor: string) {
  const params = new URLSearchParams({
    limit: String(SERVICE_PAGE_SIZE),
  });
  if (cursor) {
    params.set("cursor", cursor);
  }
  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (kind === "offers" && filters.stage !== "all") {
    params.set("stage", filters.stage);
  }
  if (kind === "transactions" && filters.serviceId.trim()) {
    params.set("serviceId", filters.serviceId.trim());
  }

  return `/admin/support-services/${kind}?${params.toString()}`;
}

function basePath(kind: WorkbenchKind) {
  return `/admin/support-services/${kind}`;
}

export function SupportServicesWorkbench({ kind }: { kind: WorkbenchKind }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ServiceFilters>(() => emptyFilters());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [offerForm, setOfferForm] = useState<OfferFormState>(EMPTY_OFFER_FORM);
  const [transactionForm, setTransactionForm] = useState<TransactionFormState>(
    () => emptyTransactionForm(),
  );
  const [toastCounter, setToastCounter] = useState(1);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const isOffers = kind === "offers";
  const queryKey = isOffers ? OFFERS_QUERY_KEY : TRANSACTIONS_QUERY_KEY;

  function nextToastId() {
    setToastCounter((current) => current + 1);
    return toastCounter;
  }

  const listQuery = useInfiniteQuery({
    queryKey: [queryKey, filters],
    queryFn: ({ pageParam }) => {
      const cursor = typeof pageParam === "string" ? pageParam : "";
      return sdkFetch<SupportServiceOffersPage | SupportServiceTransactionsPage>(
        buildListPath(kind, filters, cursor),
      );
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const offers = useMemo(
    () =>
      listQuery.data?.pages.flatMap((page) =>
        "offers" in page ? page.offers : [],
      ) ?? [],
    [listQuery.data?.pages],
  );
  const transactions = useMemo(
    () =>
      listQuery.data?.pages.flatMap((page) =>
        "transactions" in page ? page.transactions : [],
      ) ?? [],
    [listQuery.data?.pages],
  );

  const saveOfferMutation = useMutation({
    mutationFn: async (payload: SupportServiceOfferInput) => {
      const editing = dialog?.mode === "edit" ? dialog.offer : undefined;
      const path = editing
        ? `${basePath("offers")}/${encodeURIComponent(editing.id)}`
        : basePath("offers");
      return sdkFetch<{ offer: SupportServiceOfferRecord }>(path, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });
      setDialog(null);
      setToast({
        id: nextToastId(),
        tone: "success",
        message: t("Service offer saved."),
      });
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId())),
  });

  const saveTransactionMutation = useMutation({
    mutationFn: async (payload: SupportServiceTransactionInput) => {
      const editing = dialog?.mode === "edit" ? dialog.transaction : undefined;
      const path = editing
        ? `${basePath("transactions")}/${encodeURIComponent(editing.id)}`
        : basePath("transactions");
      return sdkFetch<{ transaction: SupportServiceTransactionRecord }>(path, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTIONS_QUERY_KEY],
      });
      setDialog(null);
      setToast({
        id: nextToastId(),
        tone: "success",
        message: t("Service transaction saved."),
      });
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId())),
  });

  const deleteMutation = useMutation({
    mutationFn: async (record: SupportServiceOfferRecord | SupportServiceTransactionRecord) => {
      const path = isOffers
        ? `${basePath("offers")}/${encodeURIComponent(record.id)}`
        : `${basePath("transactions")}/${encodeURIComponent(record.id)}`;
      return sdkFetch(path, { method: "DELETE" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queryKey] });
      setToast({
        id: nextToastId(),
        tone: "success",
        message: isOffers
          ? t("Service offer deleted.")
          : t("Service transaction deleted."),
      });
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId())),
  });

  function openCreateDialog() {
    setDialog({ mode: "create" });
    if (isOffers) {
      setOfferForm(EMPTY_OFFER_FORM);
    } else {
      setTransactionForm(emptyTransactionForm());
    }
  }

  function openEditOffer(offer: SupportServiceOfferRecord) {
    setOfferForm(offerFormFromRecord(offer));
    setDialog({ mode: "edit", offer });
  }

  function openEditTransaction(transaction: SupportServiceTransactionRecord) {
    setTransactionForm(transactionFormFromRecord(transaction));
    setDialog({ mode: "edit", transaction });
  }

  function handleDelete(record: SupportServiceOfferRecord | SupportServiceTransactionRecord) {
    const label = isOffers
      ? (record as SupportServiceOfferRecord).name
      : (record as SupportServiceTransactionRecord).requestId;
    if (!window.confirm(`${t("Delete")} ${label}?`)) {
      return;
    }
    deleteMutation.mutate(record);
  }

  function handleOfferSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      saveOfferMutation.mutate(offerPayloadFromForm(offerForm));
    } catch (error) {
      setToast(mutationErrorToast(error, nextToastId()));
    }
  }

  function handleTransactionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      saveTransactionMutation.mutate(
        transactionPayloadFromForm(transactionForm),
      );
    } catch (error) {
      setToast(mutationErrorToast(error, nextToastId()));
    }
  }

  const rows = isOffers ? offers : transactions;
  const isInitialLoading = listQuery.isLoading && rows.length === 0;
  const title = isOffers ? "Service Offers" : "Service Transactions";
  const createLabel = isOffers ? "Alta de service offer" : "Alta de transaccion";

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <section className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border/70 p-4 lg:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-xl font-semibold text-foreground">
                  {t(title)}
                </h2>
                <HeaderUnclutterButton />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => listQuery.refetch()}
              >
                <RefreshCw className="h-4 w-4" />
                <span>{t("Refresh")}</span>
              </Button>
              <Button type="button" size="sm" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                <span>{t(createLabel)}</span>
              </Button>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_12rem_12rem]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.query}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                placeholder={t("Search by ID, provider, request, or name")}
                className="pl-9"
              />
            </label>
            <Select
              value={filters.status}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, status: value }))
              }
            >
              <SelectTrigger>
                <Filter className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All statuses")}</SelectItem>
                {(isOffers
                  ? SUPPORT_SERVICE_OFFER_STATUSES
                  : SUPPORT_SERVICE_TRANSACTION_STATUSES
                ).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOffers ? (
              <Select
                value={filters.stage}
                onValueChange={(value) =>
                  setFilters((current) => ({ ...current, stage: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All stages")}</SelectItem>
                  {SUPPORT_SERVICE_STAGES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={filters.serviceId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    serviceId: event.target.value,
                  }))
                }
                placeholder="pgs_final_report"
              />
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {isOffers ? (
                <TableRow>
                  <TableHead>{t("Offer")}</TableHead>
                  <TableHead>{t("Provider")}</TableHead>
                  <TableHead>{t("Stage")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Contract")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              ) : (
                <TableRow>
                  <TableHead>{t("Transaction")}</TableHead>
                  <TableHead>{t("Service")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Form ref")}</TableHead>
                  <TableHead>{t("Updated")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p className="text-sm">{t("No records found.")}</p>
                      <Button type="button" size="sm" onClick={openCreateDialog}>
                        <Plus className="h-4 w-4" />
                        <span>{t(createLabel)}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isOffers ? (
                offers.map((offer) => (
                  <TableRow key={offer.id}>
                    <TableCell className="min-w-[18rem]">
                      <div className="font-medium text-foreground">{offer.name}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {offer.serviceId} · v{offer.serviceVersion}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {offer.providerId}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {offer.stages.map((stage) => (
                          <Badge key={stage} variant="secondary">
                            {t(stageLabel(stage))}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={offer.status === "active" ? "default" : "outline"}>
                        {t(offerStatusLabel(offer.status))}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[20rem] truncate text-sm text-muted-foreground">
                      {offer.shortContract || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditOffer(offer)}
                          title={t("Edit")}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">{t("Edit")}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(offer)}
                          title={t("Delete")}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">{t("Delete")}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="min-w-[16rem]">
                      <div className="font-mono text-sm font-medium text-foreground">
                        {transaction.requestId}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {transaction.requesterEmail || transaction.subjectId || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {transaction.serviceId} · v{transaction.serviceVersion}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          transaction.status === "completed" ? "default" : "outline"
                        }
                      >
                        {t(transactionStatusLabel(transaction.status))}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {transaction.formRef.objectId}@{transaction.formRef.revision}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dateLabel(transaction.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditTransaction(transaction)}
                          title={t("Edit")}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">{t("Edit")}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(transaction)}
                          title={t("Delete")}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">{t("Delete")}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-border/70 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {rows.length} {t("loaded")}
          </p>
          {listQuery.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => listQuery.fetchNextPage()}
              disabled={listQuery.isFetchingNextPage}
            >
              {listQuery.isFetchingNextPage ? t("Loading...") : t("Load more")}
            </Button>
          ) : null}
        </div>
      </section>

      <Dialog open={Boolean(dialog && isOffers)} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit"
                ? t("Editar service offer")
                : t("Alta de service offer")}
            </DialogTitle>
          </DialogHeader>
          <form className="grid gap-5" onSubmit={handleOfferSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <Input
                  value={offerForm.name}
                  onChange={(event) =>
                    setOfferForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field label="Service ID">
                <Input
                  value={offerForm.serviceId}
                  onChange={(event) =>
                    setOfferForm((current) => ({
                      ...current,
                      serviceId: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field label="Provider ID">
                <Input
                  value={offerForm.providerId}
                  onChange={(event) =>
                    setOfferForm((current) => ({
                      ...current,
                      providerId: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field label="Version">
                <Input
                  value={offerForm.serviceVersion}
                  onChange={(event) =>
                    setOfferForm((current) => ({
                      ...current,
                      serviceVersion: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field label="Stage">
                <Select
                  value={offerForm.stage}
                  onValueChange={(value) =>
                    setOfferForm((current) => ({
                      ...current,
                      stage: value as SupportServiceStage,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORT_SERVICE_STAGES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  value={offerForm.status}
                  onValueChange={(value) =>
                    setOfferForm((current) => ({
                      ...current,
                      status: value as SupportServiceOfferInput["status"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORT_SERVICE_OFFER_STATUSES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Availability">
                <Input
                  value={offerForm.availability}
                  onChange={(event) =>
                    setOfferForm((current) => ({
                      ...current,
                      availability: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Short contract">
                <Input
                  value={offerForm.shortContract}
                  onChange={(event) =>
                    setOfferForm((current) => ({
                      ...current,
                      shortContract: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <Field label="Description">
              <Textarea
                value={offerForm.description}
                onChange={(event) =>
                  setOfferForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
              />
            </Field>
            <Field label="Provider work">
              <Textarea
                value={offerForm.providerWork}
                onChange={(event) =>
                  setOfferForm((current) => ({
                    ...current,
                    providerWork: event.target.value,
                  }))
                }
                rows={3}
              />
            </Field>
            <JsonField label="Form shape JSON" value={offerForm.formShapeJson} onChange={(value) => setOfferForm((current) => ({ ...current, formShapeJson: value }))} />
            <div className="grid gap-4 md:grid-cols-2">
              <JsonField label="Input slots JSON" value={offerForm.inputSlotsJson} onChange={(value) => setOfferForm((current) => ({ ...current, inputSlotsJson: value }))} />
              <JsonField label="Output slots JSON" value={offerForm.outputSlotsJson} onChange={(value) => setOfferForm((current) => ({ ...current, outputSlotsJson: value }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Accepted conditions">
                <Textarea
                  value={offerForm.acceptedConditions}
                  onChange={(event) =>
                    setOfferForm((current) => ({
                      ...current,
                      acceptedConditions: event.target.value,
                    }))
                  }
                  rows={5}
                />
              </Field>
              <Field label="Scope rules">
                <Textarea
                  value={offerForm.scopeRules}
                  onChange={(event) =>
                    setOfferForm((current) => ({
                      ...current,
                      scopeRules: event.target.value,
                    }))
                  }
                  rows={5}
                />
              </Field>
            </div>
            <JsonField label="Commercial terms JSON" value={offerForm.commercialTermsJson} onChange={(value) => setOfferForm((current) => ({ ...current, commercialTermsJson: value }))} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                <X className="h-4 w-4" />
                <span>{t("Cancel")}</span>
              </Button>
              <Button type="submit" disabled={saveOfferMutation.isPending}>
                <CheckCircle2 className="h-4 w-4" />
                <span>{saveOfferMutation.isPending ? t("Saving...") : t("Save")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(dialog && !isOffers)} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit"
                ? t("Editar transaccion")
                : t("Alta de transaccion")}
            </DialogTitle>
          </DialogHeader>
          <form className="grid gap-5" onSubmit={handleTransactionSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Request ID">
                <Input
                  value={transactionForm.requestId}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      requestId: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field label="Service ID">
                <Input
                  value={transactionForm.serviceId}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      serviceId: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field label="Version">
                <Input
                  value={transactionForm.serviceVersion}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      serviceVersion: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field label="Status">
                <Select
                  value={transactionForm.status}
                  onValueChange={(value) =>
                    setTransactionForm((current) => ({
                      ...current,
                      status:
                        value as SupportServiceTransactionInput["status"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORT_SERVICE_TRANSACTION_STATUSES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Requester email">
                <Input
                  value={transactionForm.requesterEmail}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      requesterEmail: event.target.value,
                    }))
                  }
                  type="email"
                />
              </Field>
              <Field label="Subject ID">
                <Input
                  value={transactionForm.subjectId}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      subjectId: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Form object ID">
                <Input
                  value={transactionForm.formObjectId}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      formObjectId: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field label="Form revision">
                <Input
                  value={transactionForm.formRevision}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      formRevision: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                  required
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <JsonField label="Inputs JSON" value={transactionForm.inputsJson} onChange={(value) => setTransactionForm((current) => ({ ...current, inputsJson: value }))} />
              <JsonField label="Outputs JSON" value={transactionForm.outputsJson} onChange={(value) => setTransactionForm((current) => ({ ...current, outputsJson: value }))} />
            </div>
            <Field label="Notes">
              <Textarea
                value={transactionForm.notes}
                onChange={(event) =>
                  setTransactionForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={4}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                <X className="h-4 w-4" />
                <span>{t("Cancel")}</span>
              </Button>
              <Button type="submit" disabled={saveTransactionMutation.isPending}>
                <CheckCircle2 className="h-4 w-4" />
                <span>{saveTransactionMutation.isPending ? t("Saving...") : t("Save")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <Label className="grid gap-2 text-sm font-medium">
      <span>{t(label)}</span>
      {children}
    </Label>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <Label className="grid gap-2 text-sm font-medium">
      <span className="flex items-center gap-2">
        <Braces className="h-4 w-4 text-muted-foreground" />
        {t(label)}
      </span>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        className={cn("font-mono text-xs leading-5")}
      />
    </Label>
  );
}
