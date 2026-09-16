"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
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
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  POCKET_GENES_OBJECT_OPTIONS,
  POCKET_GENES_PROVIDER_OPTIONS,
  POCKET_GENES_SERVICE_OPTIONS,
  catalogServiceById,
  objectLabel,
} from "@/lib/pocket-genes-service-catalog";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import {
  SUPPORT_SERVICE_FORM_FIELD_TYPES,
  SUPPORT_SERVICE_MUTATION_MODES,
  SUPPORT_SERVICE_OFFER_STATUSES,
  SUPPORT_SERVICE_STAGES,
  SUPPORT_SERVICE_TRANSACTION_STATUSES,
  mutationModeLabel,
  offerStatusLabel,
  stageLabel,
  transactionStatusLabel,
  type SupportServiceCommercialTerms,
  type SupportServiceFormField,
  type SupportServiceFormFieldType,
  type SupportServiceInputSlot,
  type SupportServiceMutationMode,
  type SupportServiceOfferInput,
  type SupportServiceOfferRecord,
  type SupportServiceOffersPage,
  type SupportServiceOutputSlot,
  type SupportServiceStage,
  type SupportServiceTransactionInput,
  type SupportServiceTransactionRecord,
  type SupportServiceTransactionsPage,
} from "@/lib/support-services";
import { cn } from "@/lib/utils";

type WorkbenchKind = "offers" | "transactions";

type ServiceFilters = {
  query: string;
  status: string;
  stage: string;
  serviceId: string;
};

type FormFieldDraft = SupportServiceFormField & {
  optionsText: string;
};

type OfferFormState = {
  serviceId: string;
  serviceVersion: string;
  name: string;
  providerId: string;
  stages: SupportServiceStage[];
  status: NonNullable<SupportServiceOfferInput["status"]>;
  availability: string;
  description: string;
  shortContract: string;
  providerWork: string;
  formShape: {
    id: string;
    version: string;
    allowUnknownFields: boolean;
    fields: FormFieldDraft[];
  };
  inputSlots: SupportServiceInputSlot[];
  outputSlots: SupportServiceOutputSlot[];
  acceptedConditionsText: string;
  scopeRulesText: string;
  commercialTerms: SupportServiceCommercialTerms;
};

type ObjectRefDraft = {
  role: string;
  objectId: string;
  revision: string;
  required: boolean;
  acceptedTypes: string[];
};

type TransactionFormState = {
  requestId: string;
  serviceId: string;
  serviceVersion: string;
  status: NonNullable<SupportServiceTransactionInput["status"]>;
  requesterEmail: string;
  subjectId: string;
  formObjectId: string;
  formRevision: string;
  inputs: ObjectRefDraft[];
  outputs: ObjectRefDraft[];
  notes: string;
};

const SERVICE_PAGE_SIZE = 20;
const OFFERS_QUERY_KEY = "god-mode-support-service-offers";
const TRANSACTIONS_QUERY_KEY = "god-mode-support-service-transactions";
const LIVE_OFFERS_QUERY_KEY = "god-mode-support-service-offers-live-picker";

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

function optionsText(options?: SupportServiceFormField["options"]) {
  return (options ?? [])
    .map((option) =>
      option.label && option.label !== option.value
        ? `${option.value} | ${option.label}`
        : option.value,
    )
    .join("\n");
}

function parseOptionsText(value: string) {
  return splitLines(value).map((line) => {
    const [rawValue, ...labelParts] = line.split("|");
    const optionValue = rawValue?.trim() ?? "";
    const label = labelParts.join("|").trim() || optionValue;
    return { value: optionValue, label };
  });
}

function formFieldsFromRecord(fields: SupportServiceFormField[] = []) {
  return fields.map((field) => ({
    ...field,
    optionsText: optionsText(field.options),
  }));
}

function defaultOfferForm(): OfferFormState {
  return offerFormFromCatalog(POCKET_GENES_SERVICE_OPTIONS[0]);
}

function offerFormFromCatalog(
  catalogOffer = POCKET_GENES_SERVICE_OPTIONS[0],
): OfferFormState {
  return {
    serviceId: catalogOffer.serviceId,
    serviceVersion: catalogOffer.serviceVersion,
    name: catalogOffer.name,
    providerId: catalogOffer.providerId,
    stages: catalogOffer.stages.length
      ? catalogOffer.stages
      : ["test_planning"],
    status: "draft",
    availability: catalogOffer.availability || "backoffice",
    description: catalogOffer.description,
    shortContract: catalogOffer.shortContract,
    providerWork: catalogOffer.providerWork,
    formShape: {
      id: catalogOffer.formShape.id,
      version: catalogOffer.formShape.version,
      allowUnknownFields: Boolean(catalogOffer.formShape.allowUnknownFields),
      fields: formFieldsFromRecord(catalogOffer.formShape.fields),
    },
    inputSlots: catalogOffer.inputSlots.map((slot) => ({ ...slot })),
    outputSlots: catalogOffer.outputSlots.map((slot) => ({ ...slot })),
    acceptedConditionsText: catalogOffer.acceptedConditions.join("\n"),
    scopeRulesText: catalogOffer.scopeRules.join("\n"),
    commercialTerms: {
      price: { ...catalogOffer.commercialTerms.price },
      turnaround: catalogOffer.commercialTerms.turnaround,
      turnaroundStartsAt: catalogOffer.commercialTerms.turnaroundStartsAt,
      taxAndPaymentPolicy: catalogOffer.commercialTerms.taxAndPaymentPolicy,
      failurePolicy: catalogOffer.commercialTerms.failurePolicy,
    },
  };
}

function offerFormFromRecord(record: SupportServiceOfferRecord): OfferFormState {
  return {
    serviceId: record.serviceId,
    serviceVersion: record.serviceVersion,
    name: record.name,
    providerId: record.providerId,
    stages: record.stages.length ? record.stages : ["test_planning"],
    status: record.status,
    availability: record.availability,
    description: record.description,
    shortContract: record.shortContract,
    providerWork: record.providerWork,
    formShape: {
      id: record.formShape.id,
      version: record.formShape.version,
      allowUnknownFields: Boolean(record.formShape.allowUnknownFields),
      fields: formFieldsFromRecord(record.formShape.fields),
    },
    inputSlots: record.inputSlots.map((slot) => ({ ...slot })),
    outputSlots: record.outputSlots.map((slot) => ({ ...slot })),
    acceptedConditionsText: record.acceptedConditions.join("\n"),
    scopeRulesText: record.scopeRules.join("\n"),
    commercialTerms: {
      price: { ...record.commercialTerms.price },
      turnaround: record.commercialTerms.turnaround,
      turnaroundStartsAt: record.commercialTerms.turnaroundStartsAt,
      taxAndPaymentPolicy: record.commercialTerms.taxAndPaymentPolicy,
      failurePolicy: record.commercialTerms.failurePolicy,
    },
  };
}

function makeRequestId(serviceId: string) {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "z")
    .toLowerCase();
  return `pgr_${serviceId.replace(/^pgs_/, "")}_${stamp}`;
}

function emptyObjectRefDraft(
  slot: SupportServiceInputSlot | SupportServiceOutputSlot,
): ObjectRefDraft {
  const required = "required" in slot ? slot.required : false;
  return {
    role: slot.role,
    objectId: "",
    revision: "1",
    required,
    acceptedTypes: "acceptedTypes" in slot ? slot.acceptedTypes : [slot.objectType],
  };
}

function transactionFormForService(
  serviceId: string,
  offers: SupportServiceOfferRecord[],
): TransactionFormState {
  const offer =
    offers.find((candidate) => candidate.serviceId === serviceId) ??
    catalogServiceById(serviceId);
  const version = offer?.serviceVersion ?? "1.0.0";
  const inputSlots = offer?.inputSlots ?? [];
  const outputSlots = offer?.outputSlots ?? [];

  return {
    requestId: makeRequestId(serviceId),
    serviceId,
    serviceVersion: version,
    status: "submitted",
    requesterEmail: "",
    subjectId: "",
    formObjectId: "obj_",
    formRevision: "1",
    inputs: inputSlots.map(emptyObjectRefDraft),
    outputs: outputSlots.map(emptyObjectRefDraft),
    notes: "",
  };
}

function transactionFormFromRecord(
  record: SupportServiceTransactionRecord,
  offers: SupportServiceOfferRecord[],
): TransactionFormState {
  const base = transactionFormForService(record.serviceId, offers);
  const inputByRole = new Map(record.inputs.map((slot) => [slot.role, slot]));
  const outputByRole = new Map(record.outputs.map((slot) => [slot.role, slot]));

  return {
    ...base,
    requestId: record.requestId,
    serviceVersion: record.serviceVersion,
    status: record.status,
    requesterEmail: record.requesterEmail,
    subjectId: record.subjectId,
    formObjectId: record.formRef.objectId,
    formRevision: String(record.formRef.revision),
    inputs: base.inputs.map((slot) => {
      const existing = inputByRole.get(slot.role);
      return existing
        ? {
            ...slot,
            objectId: existing.objectRef.objectId,
            revision: String(existing.objectRef.revision),
          }
        : slot;
    }),
    outputs: base.outputs.map((slot) => {
      const existing = outputByRole.get(slot.role);
      return existing
        ? {
            ...slot,
            objectId: existing.objectRef.objectId,
            revision: String(existing.objectRef.revision),
          }
        : slot;
    }),
    notes: record.notes,
  };
}

function assertIdentifier(value: string, prefix: string, label: string) {
  const pattern = new RegExp(`^${prefix}_[a-z0-9_]+$`);
  if (!pattern.test(value.trim())) {
    throw new Error(`${label} must use the ${prefix}_* convention.`);
  }
}

function assertPositiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function offerPayloadFromForm(form: OfferFormState): SupportServiceOfferInput {
  assertIdentifier(form.serviceId, "pgs", "Service ID");
  assertIdentifier(form.providerId, "pgp", "Provider ID");
  assertIdentifier(form.formShape.id, "pgfs", "Form shape ID");

  if (!form.name.trim()) {
    throw new Error("Offer name is required.");
  }
  if (!form.description.trim()) {
    throw new Error("Description is required.");
  }
  if (!form.shortContract.trim()) {
    throw new Error("Short contract is required.");
  }
  if (!form.providerWork.trim()) {
    throw new Error("Provider work is required.");
  }
  if (!form.stages.length) {
    throw new Error("At least one stage is required.");
  }
  if (form.outputSlots.length === 0) {
    throw new Error("At least one output slot is required.");
  }

  const fields = form.formShape.fields.map((field) => {
    if (!field.key.trim() || !field.label.trim()) {
      throw new Error("Every form field needs a key and label.");
    }
    if (
      (field.type === "enum" || field.type === "multi_enum") &&
      splitLines(field.optionsText).length === 0
    ) {
      throw new Error(`Field ${field.key} needs enum options.`);
    }

    return {
      key: field.key.trim(),
      label: field.label.trim(),
      type: field.type,
      required: field.required,
      options:
        field.type === "enum" || field.type === "multi_enum"
          ? parseOptionsText(field.optionsText)
          : undefined,
    };
  });
  const fieldKeys = fields.map((field) => field.key);
  for (const requiredKey of ["requested_at", "requested_by"]) {
    if (!fieldKeys.includes(requiredKey)) {
      throw new Error(`Form shape must include ${requiredKey}.`);
    }
  }

  for (const slot of form.inputSlots) {
    if (!slot.role.trim()) {
      throw new Error("Every input slot needs a role.");
    }
    if (slot.acceptedTypes.length === 0) {
      throw new Error(`Input slot ${slot.role} needs at least one accepted type.`);
    }
    if (slot.cardinality.min < 0 || slot.cardinality.max < slot.cardinality.min) {
      throw new Error(`Input slot ${slot.role} has invalid cardinality.`);
    }
  }
  for (const slot of form.outputSlots) {
    if (!slot.role.trim() || !slot.objectType) {
      throw new Error("Every output slot needs a role and object type.");
    }
  }
  if (!Number.isFinite(form.commercialTerms.price.amount)) {
    throw new Error("Price amount must be numeric.");
  }
  if (!form.commercialTerms.price.currency.trim()) {
    throw new Error("Price currency is required.");
  }
  if (!form.commercialTerms.turnaround.trim()) {
    throw new Error("Turnaround is required.");
  }
  if (splitLines(form.acceptedConditionsText).length === 0) {
    throw new Error("At least one accepted condition is required.");
  }
  if (splitLines(form.scopeRulesText).length === 0) {
    throw new Error("At least one scope rule is required.");
  }

  return {
    serviceId: form.serviceId.trim(),
    serviceVersion: form.serviceVersion.trim() || "1.0.0",
    name: form.name.trim(),
    providerId: form.providerId.trim(),
    stages: form.stages,
    status: form.status,
    availability: form.availability.trim(),
    description: form.description.trim(),
    shortContract: form.shortContract.trim(),
    providerWork: form.providerWork.trim(),
    formShape: {
      id: form.formShape.id.trim(),
      version: form.formShape.version.trim() || "1.0.0",
      allowUnknownFields: form.formShape.allowUnknownFields,
      fields,
    },
    inputSlots: form.inputSlots.map((slot) => ({
      ...slot,
      role: slot.role.trim(),
    })),
    outputSlots: form.outputSlots.map((slot) => ({
      ...slot,
      role: slot.role.trim(),
    })),
    acceptedConditions: splitLines(form.acceptedConditionsText),
    scopeRules: splitLines(form.scopeRulesText),
    commercialTerms: {
      ...form.commercialTerms,
      price: {
        ...form.commercialTerms.price,
        currency: form.commercialTerms.price.currency.trim().toUpperCase(),
        basis: form.commercialTerms.price.basis.trim(),
      },
      turnaround: form.commercialTerms.turnaround.trim(),
      turnaroundStartsAt: form.commercialTerms.turnaroundStartsAt?.trim(),
      taxAndPaymentPolicy: form.commercialTerms.taxAndPaymentPolicy?.trim(),
      failurePolicy: form.commercialTerms.failurePolicy?.trim(),
    },
  };
}

function transactionPayloadFromForm(
  form: TransactionFormState,
): SupportServiceTransactionInput {
  assertIdentifier(form.requestId, "pgr", "Request ID");
  assertIdentifier(form.serviceId, "pgs", "Service ID");
  assertIdentifier(form.formObjectId, "obj", "Form object ID");

  const formRevision = assertPositiveInteger(form.formRevision, "Form revision");
  const requiredInputs = form.inputs.filter((slot) => slot.required);
  for (const slot of requiredInputs) {
    if (!slot.objectId.trim()) {
      throw new Error(`Input ${slot.role} is required.`);
    }
  }

  const inputs = form.inputs
    .filter((slot) => slot.objectId.trim())
    .map((slot) => {
      assertIdentifier(slot.objectId, "obj", `Input ${slot.role} object ID`);
      return {
        role: slot.role,
        objectRef: {
          objectId: slot.objectId.trim(),
          revision: assertPositiveInteger(
            slot.revision,
            `Input ${slot.role} revision`,
          ),
        },
      };
    });
  const outputs = form.outputs
    .filter((slot) => slot.objectId.trim())
    .map((slot) => {
      assertIdentifier(slot.objectId, "obj", `Output ${slot.role} object ID`);
      return {
        role: slot.role,
        objectRef: {
          objectId: slot.objectId.trim(),
          revision: assertPositiveInteger(
            slot.revision,
            `Output ${slot.role} revision`,
          ),
        },
      };
    });

  if (form.status === "completed" && outputs.length === 0) {
    throw new Error("Completed transactions need at least one output object.");
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
      revision: formRevision,
    },
    inputs,
    outputs,
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

function baseRoute(kind: WorkbenchKind) {
  return kind === "offers"
    ? "/god-mode/service-offers"
    : "/god-mode/service-transactions";
}

function apiBasePath(kind: WorkbenchKind) {
  return `/admin/support-services/${kind}`;
}

export function SupportServicesBrowser({ kind }: { kind: WorkbenchKind }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ServiceFilters>(() => emptyFilters());
  const [toastCounter, setToastCounter] = useState(1);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const isOffers = kind === "offers";
  const queryKey = isOffers ? OFFERS_QUERY_KEY : TRANSACTIONS_QUERY_KEY;
  const route = baseRoute(kind);

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
  const rows = isOffers ? offers : transactions;

  const deleteMutation = useMutation({
    mutationFn: async (
      record: SupportServiceOfferRecord | SupportServiceTransactionRecord,
    ) =>
      sdkFetch(`${apiBasePath(kind)}/${encodeURIComponent(record.id)}`, {
        method: "DELETE",
      }),
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

  function handleDelete(
    record: SupportServiceOfferRecord | SupportServiceTransactionRecord,
  ) {
    const label =
      "name" in record ? record.name : (record as SupportServiceTransactionRecord).requestId;
    if (!window.confirm(`${t("Delete")} ${label}?`)) {
      return;
    }
    deleteMutation.mutate(record);
  }

  const title = isOffers ? "Service Offers" : "Service Transactions";
  const createLabel = isOffers ? "Alta de service offer" : "Alta de transaccion";
  const isInitialLoading = listQuery.isLoading && rows.length === 0;

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
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {t(title)}
              </h2>
              <HeaderUnclutterButton />
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
              <Button asChild size="sm">
                <Link href={`${route}/new`}>
                  <Plus className="h-4 w-4" />
                  <span>{t(createLabel)}</span>
                </Link>
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
              <Select
                value={filters.serviceId || "all"}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    serviceId: value === "all" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All services")}</SelectItem>
                  {POCKET_GENES_SERVICE_OPTIONS.map((service) => (
                    <SelectItem key={service.value} value={service.value}>
                      {service.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      <Button asChild size="sm">
                        <Link href={`${route}/new`}>
                          <Plus className="h-4 w-4" />
                          <span>{t(createLabel)}</span>
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isOffers ? (
                offers.map((offer) => (
                  <TableRow key={offer.id}>
                    <TableCell className="min-w-[18rem]">
                      <Link
                        href={`${route}/${encodeURIComponent(offer.id)}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {offer.name}
                      </Link>
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
                      {offer.shortContract || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        editHref={`${route}/${encodeURIComponent(offer.id)}`}
                        onDelete={() => handleDelete(offer)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="min-w-[16rem]">
                      <Link
                        href={`${route}/${encodeURIComponent(transaction.id)}`}
                        className="font-mono text-sm font-medium text-foreground hover:underline"
                      >
                        {transaction.requestId}
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {transaction.requesterEmail || transaction.subjectId || "-"}
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
                      <RowActions
                        editHref={`${route}/${encodeURIComponent(transaction.id)}`}
                        onDelete={() => handleDelete(transaction)}
                      />
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
    </>
  );
}

function RowActions({
  editHref,
  onDelete,
}: {
  editHref: string;
  onDelete: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex justify-end gap-2">
      <Button asChild variant="ghost" size="icon-sm" title={t("Edit")}>
        <Link href={editHref}>
          <Pencil className="h-4 w-4" />
          <span className="sr-only">{t("Edit")}</span>
        </Link>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        title={t("Delete")}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">{t("Delete")}</span>
      </Button>
    </div>
  );
}

export function SupportServiceOfferWorkbench({
  mode,
  offerId,
}: {
  mode: "create" | "edit";
  offerId?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OfferFormState>(() => defaultOfferForm());
  const [toastCounter, setToastCounter] = useState(1);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const isEditing = mode === "edit";

  function nextToastId() {
    setToastCounter((current) => current + 1);
    return toastCounter;
  }

  const offerQuery = useQuery({
    queryKey: [OFFERS_QUERY_KEY, offerId],
    queryFn: () =>
      sdkFetch<{ offer: SupportServiceOfferRecord }>(
        `/admin/support-services/offers/${encodeURIComponent(offerId ?? "")}`,
      ),
    enabled: isEditing && Boolean(offerId),
  });

  useEffect(() => {
    if (offerQuery.data?.offer) {
      setForm(offerFormFromRecord(offerQuery.data.offer));
    }
  }, [offerQuery.data?.offer]);

  const saveMutation = useMutation({
    mutationFn: async (payload: SupportServiceOfferInput) => {
      const path =
        isEditing && offerId
          ? `/admin/support-services/offers/${encodeURIComponent(offerId)}`
          : "/admin/support-services/offers";
      return sdkFetch<{ offer: SupportServiceOfferRecord }>(path, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });
      setToast({
        id: nextToastId(),
        tone: "success",
        message: t("Service offer saved."),
      });
      router.push(`/god-mode/service-offers/${result.offer.id}`);
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId())),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      sdkFetch(`/admin/support-services/offers/${encodeURIComponent(offerId ?? "")}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });
      router.push("/god-mode/service-offers");
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId())),
  });

  function applyCatalogService(serviceId: string) {
    const catalog = catalogServiceById(serviceId);
    if (!catalog) {
      return;
    }
    const next = offerFormFromCatalog(catalog);
    setForm((current) => ({
      ...next,
      status: current.status,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      saveMutation.mutate(offerPayloadFromForm(form));
    } catch (error) {
      setToast(mutationErrorToast(error, nextToastId()));
    }
  }

  if (isEditing && offerQuery.isLoading) {
    return <Skeleton className="h-[36rem] w-full" />;
  }

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <form className="glass-panel overflow-hidden" onSubmit={handleSubmit}>
        <WorkbenchTopbar
          title={isEditing ? "Editar service offer" : "Alta de service offer"}
          backHref="/god-mode/service-offers"
          backLabel="Back to Service Offers"
          isSaving={saveMutation.isPending}
          canDelete={isEditing}
          onDelete={() => {
            if (window.confirm(t("Delete this service offer?"))) {
              deleteMutation.mutate();
            }
          }}
        />
        <Section title="Catalog identity">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Catalog service">
              <Select value={form.serviceId} onValueChange={applyCatalogService}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POCKET_GENES_SERVICE_OPTIONS.map((service) => (
                    <SelectItem key={service.value} value={service.value}>
                      {service.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Provider">
              <Select
                value={form.providerId}
                onValueChange={(providerId) =>
                  setForm((current) => ({ ...current, providerId }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POCKET_GENES_PROVIDER_OPTIONS.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Offer name">
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Service version">
              <Input
                value={form.serviceVersion}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    serviceVersion: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(status) =>
                  setForm((current) => ({
                    ...current,
                    status: status as OfferFormState["status"],
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
                value={form.availability}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    availability: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
          <StagePicker
            value={form.stages}
            onChange={(stages) => setForm((current) => ({ ...current, stages }))}
          />
        </Section>
        <Section title="Contract">
          <div className="grid gap-4">
            <Field label="Short contract">
              <Input
                value={form.shortContract}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    shortContract: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                required
              />
            </Field>
            <Field label="Provider work">
              <Textarea
                value={form.providerWork}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    providerWork: event.target.value,
                  }))
                }
                rows={3}
                required
              />
            </Field>
          </div>
        </Section>
        <FormShapeEditor form={form} setForm={setForm} />
        <SlotEditors form={form} setForm={setForm} />
        <TermsEditor form={form} setForm={setForm} />
        <Section title="Acceptance and scope">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Accepted conditions">
              <Textarea
                value={form.acceptedConditionsText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    acceptedConditionsText: event.target.value,
                  }))
                }
                rows={8}
                required
              />
            </Field>
            <Field label="Scope rules">
              <Textarea
                value={form.scopeRulesText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scopeRulesText: event.target.value,
                  }))
                }
                rows={8}
                required
              />
            </Field>
          </div>
        </Section>
      </form>
    </>
  );
}

function FormShapeEditor({
  form,
  setForm,
}: {
  form: OfferFormState;
  setForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  function updateField(index: number, patch: Partial<FormFieldDraft>) {
    setForm((current) => ({
      ...current,
      formShape: {
        ...current.formShape,
        fields: current.formShape.fields.map((field, fieldIndex) =>
          fieldIndex === index ? { ...field, ...patch } : field,
        ),
      },
    }));
  }

  function addField() {
    setForm((current) => ({
      ...current,
      formShape: {
        ...current.formShape,
        fields: [
          ...current.formShape.fields,
          {
            key: "",
            label: "",
            type: "text",
            required: false,
            options: [],
            optionsText: "",
          },
        ],
      },
    }));
  }

  function removeField(index: number) {
    setForm((current) => ({
      ...current,
      formShape: {
        ...current.formShape,
        fields: current.formShape.fields.filter((_, fieldIndex) => fieldIndex !== index),
      },
    }));
  }

  return (
    <Section title="Form shape">
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Form shape ID">
          <Input
            value={form.formShape.id}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                formShape: { ...current.formShape, id: event.target.value },
              }))
            }
            required
          />
        </Field>
        <Field label="Form shape version">
          <Input
            value={form.formShape.version}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                formShape: { ...current.formShape, version: event.target.value },
              }))
            }
            required
          />
        </Field>
        <label className="flex items-center gap-3 pt-7 text-sm font-medium">
          <Checkbox
            checked={form.formShape.allowUnknownFields}
            onCheckedChange={(checked) =>
              setForm((current) => ({
                ...current,
                formShape: {
                  ...current.formShape,
                  allowUnknownFields: checked === true,
                },
              }))
            }
          />
          <span>{t("Allow unknown fields")}</span>
        </label>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Key")}</TableHead>
              <TableHead>{t("Label")}</TableHead>
              <TableHead>{t("Type")}</TableHead>
              <TableHead>{t("Required")}</TableHead>
              <TableHead>{t("Options")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {form.formShape.fields.map((field, index) => (
              <TableRow key={`${field.key}-${index}`}>
                <TableCell className="min-w-[12rem]">
                  <Input
                    value={field.key}
                    onChange={(event) => updateField(index, { key: event.target.value })}
                    required
                  />
                </TableCell>
                <TableCell className="min-w-[12rem]">
                  <Input
                    value={field.label}
                    onChange={(event) => updateField(index, { label: event.target.value })}
                    required
                  />
                </TableCell>
                <TableCell className="min-w-[10rem]">
                  <Select
                    value={field.type}
                    onValueChange={(type) =>
                      updateField(index, {
                        type: type as SupportServiceFormFieldType,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_SERVICE_FORM_FIELD_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={field.required}
                    onCheckedChange={(checked) =>
                      updateField(index, { required: checked === true })
                    }
                  />
                </TableCell>
                <TableCell className="min-w-[16rem]">
                  <Textarea
                    value={field.optionsText}
                    onChange={(event) =>
                      updateField(index, { optionsText: event.target.value })
                    }
                    rows={3}
                    disabled={field.type !== "enum" && field.type !== "multi_enum"}
                    placeholder="value | Label"
                    className="font-mono text-xs"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeField(index)}
                    disabled={field.key === "requested_at" || field.key === "requested_by"}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">{t("Delete")}</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addField}>
        <Plus className="h-4 w-4" />
        <span>{t("Add field")}</span>
      </Button>
    </Section>
  );
}

function SlotEditors({
  form,
  setForm,
}: {
  form: OfferFormState;
  setForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
}) {
  return (
    <Section title="Slots">
      <div className="grid gap-6 xl:grid-cols-2">
        <InputSlotEditor form={form} setForm={setForm} />
        <OutputSlotEditor form={form} setForm={setForm} />
      </div>
    </Section>
  );
}

function InputSlotEditor({
  form,
  setForm,
}: {
  form: OfferFormState;
  setForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  function updateSlot(index: number, patch: Partial<SupportServiceInputSlot>) {
    setForm((current) => ({
      ...current,
      inputSlots: current.inputSlots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    }));
  }

  function toggleAcceptedType(index: number, objectType: string) {
    const slot = form.inputSlots[index];
    if (!slot) {
      return;
    }
    const nextTypes = slot.acceptedTypes.includes(objectType)
      ? slot.acceptedTypes.filter((value) => value !== objectType)
      : [...slot.acceptedTypes, objectType];
    updateSlot(index, { acceptedTypes: nextTypes });
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-base font-semibold">{t("Input slots")}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setForm((current) => ({
              ...current,
              inputSlots: [
                ...current.inputSlots,
                {
                  role: "",
                  acceptedTypes: [],
                  required: false,
                  cardinality: { min: 0, max: 1 },
                },
              ],
            }))
          }
        >
          <Plus className="h-4 w-4" />
          <span>{t("Add input")}</span>
        </Button>
      </div>
      {form.inputSlots.map((slot, index) => (
        <div key={`${slot.role}-${index}`} className="grid gap-3 border-t border-border/70 pt-3">
          <div className="grid gap-3 md:grid-cols-[1fr_7rem_7rem_auto]">
            <Field label="Role">
              <Input
                value={slot.role}
                onChange={(event) => updateSlot(index, { role: event.target.value })}
              />
            </Field>
            <Field label="Min">
              <Input
                value={slot.cardinality.min}
                onChange={(event) =>
                  updateSlot(index, {
                    cardinality: {
                      ...slot.cardinality,
                      min: Number(event.target.value),
                    },
                  })
                }
                type="number"
                min={0}
              />
            </Field>
            <Field label="Max">
              <Input
                value={slot.cardinality.max}
                onChange={(event) =>
                  updateSlot(index, {
                    cardinality: {
                      ...slot.cardinality,
                      max: Number(event.target.value),
                    },
                  })
                }
                type="number"
                min={1}
              />
            </Field>
            <label className="flex items-center gap-3 pt-7 text-sm font-medium">
              <Checkbox
                checked={slot.required}
                onCheckedChange={(checked) =>
                  updateSlot(index, { required: checked === true })
                }
              />
              <span>{t("Required")}</span>
            </label>
          </div>
          <ObjectTypeChecklist
            selected={slot.acceptedTypes}
            onToggle={(objectType) => toggleAcceptedType(index, objectType)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setForm((current) => ({
                ...current,
                inputSlots: current.inputSlots.filter((_, slotIndex) => slotIndex !== index),
              }))
            }
            className="justify-self-start text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span>{t("Remove input slot")}</span>
          </Button>
        </div>
      ))}
    </div>
  );
}

function OutputSlotEditor({
  form,
  setForm,
}: {
  form: OfferFormState;
  setForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  function updateSlot(index: number, patch: Partial<SupportServiceOutputSlot>) {
    setForm((current) => ({
      ...current,
      outputSlots: current.outputSlots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    }));
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-base font-semibold">{t("Output slots")}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setForm((current) => ({
              ...current,
              outputSlots: [
                ...current.outputSlots,
                { role: "", objectType: "pgo_form", mutationMode: "new_object" },
              ],
            }))
          }
        >
          <Plus className="h-4 w-4" />
          <span>{t("Add output")}</span>
        </Button>
      </div>
      {form.outputSlots.map((slot, index) => (
        <div key={`${slot.role}-${index}`} className="grid gap-3 border-t border-border/70 pt-3 md:grid-cols-[1fr_1fr_12rem_auto]">
          <Field label="Role">
            <Input
              value={slot.role}
              onChange={(event) => updateSlot(index, { role: event.target.value })}
            />
          </Field>
          <Field label="Object type">
            <ObjectTypeSelect
              value={slot.objectType}
              onChange={(objectType) => updateSlot(index, { objectType })}
            />
          </Field>
          <Field label="Mutation">
            <Select
              value={slot.mutationMode}
              onValueChange={(mutationMode) =>
                updateSlot(index, {
                  mutationMode: mutationMode as SupportServiceMutationMode,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_SERVICE_MUTATION_MODES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              setForm((current) => ({
                ...current,
                outputSlots: current.outputSlots.filter((_, slotIndex) => slotIndex !== index),
              }))
            }
            className="mt-7 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">{t("Delete")}</span>
          </Button>
        </div>
      ))}
    </div>
  );
}

function TermsEditor({
  form,
  setForm,
}: {
  form: OfferFormState;
  setForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
}) {
  return (
    <Section title="Commercial terms">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Price amount">
          <Input
            value={form.commercialTerms.price.amount}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                commercialTerms: {
                  ...current.commercialTerms,
                  price: {
                    ...current.commercialTerms.price,
                    amount: Number(event.target.value),
                  },
                },
              }))
            }
            type="number"
            min={0}
          />
        </Field>
        <Field label="Currency">
          <Select
            value={form.commercialTerms.price.currency}
            onValueChange={(currency) =>
              setForm((current) => ({
                ...current,
                commercialTerms: {
                  ...current.commercialTerms,
                  price: { ...current.commercialTerms.price, currency },
                },
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["ARS", "USD", "EUR"].map((currency) => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Price basis">
          <Input
            value={form.commercialTerms.price.basis}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                commercialTerms: {
                  ...current.commercialTerms,
                  price: {
                    ...current.commercialTerms.price,
                    basis: event.target.value,
                  },
                },
              }))
            }
          />
        </Field>
        <label className="flex items-center gap-3 pt-7 text-sm font-medium">
          <Checkbox
            checked={form.commercialTerms.price.isMock === true}
            onCheckedChange={(checked) =>
              setForm((current) => ({
                ...current,
                commercialTerms: {
                  ...current.commercialTerms,
                  price: {
                    ...current.commercialTerms.price,
                    isMock: checked === true,
                  },
                },
              }))
            }
          />
          <span>Mock price</span>
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Turnaround">
          <Input
            value={form.commercialTerms.turnaround}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                commercialTerms: {
                  ...current.commercialTerms,
                  turnaround: event.target.value,
                },
              }))
            }
            required
          />
        </Field>
        <Field label="Turnaround starts at">
          <Input
            value={form.commercialTerms.turnaroundStartsAt ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                commercialTerms: {
                  ...current.commercialTerms,
                  turnaroundStartsAt: event.target.value,
                },
              }))
            }
          />
        </Field>
        <Field label="Tax and payment policy">
          <Textarea
            value={form.commercialTerms.taxAndPaymentPolicy ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                commercialTerms: {
                  ...current.commercialTerms,
                  taxAndPaymentPolicy: event.target.value,
                },
              }))
            }
            rows={3}
          />
        </Field>
        <Field label="Failure policy">
          <Textarea
            value={form.commercialTerms.failurePolicy ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                commercialTerms: {
                  ...current.commercialTerms,
                  failurePolicy: event.target.value,
                },
              }))
            }
            rows={3}
          />
        </Field>
      </div>
    </Section>
  );
}

export function SupportServiceTransactionWorkbench({
  mode,
  transactionId,
}: {
  mode: "create" | "edit";
  transactionId?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TransactionFormState>(() =>
    transactionFormForService(POCKET_GENES_SERVICE_OPTIONS[0].serviceId, []),
  );
  const [toastCounter, setToastCounter] = useState(1);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const isEditing = mode === "edit";

  function nextToastId() {
    setToastCounter((current) => current + 1);
    return toastCounter;
  }

  const offersQuery = useQuery({
    queryKey: [LIVE_OFFERS_QUERY_KEY],
    queryFn: () =>
      sdkFetch<SupportServiceOffersPage>(
        "/admin/support-services/offers?limit=50&status=active",
      ),
  });
  const liveOffers = offersQuery.data?.offers ?? [];

  const transactionQuery = useQuery({
    queryKey: [TRANSACTIONS_QUERY_KEY, transactionId],
    queryFn: () =>
      sdkFetch<{ transaction: SupportServiceTransactionRecord }>(
        `/admin/support-services/transactions/${encodeURIComponent(
          transactionId ?? "",
        )}`,
      ),
    enabled: isEditing && Boolean(transactionId),
  });

  useEffect(() => {
    if (transactionQuery.data?.transaction) {
      setForm(transactionFormFromRecord(transactionQuery.data.transaction, liveOffers));
    }
  }, [liveOffers, transactionQuery.data?.transaction]);

  const serviceChoices = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...liveOffers.map((offer) => ({
        value: offer.serviceId,
        label: `${offer.name} (${offer.serviceId})`,
      })),
      ...POCKET_GENES_SERVICE_OPTIONS.map((offer) => ({
        value: offer.serviceId,
        label: `${offer.name} (${offer.serviceId})`,
      })),
    ].filter((choice) => {
      if (seen.has(choice.value)) {
        return false;
      }
      seen.add(choice.value);
      return true;
    });
  }, [liveOffers]);

  const selectedOffer =
    liveOffers.find((offer) => offer.serviceId === form.serviceId) ??
    catalogServiceById(form.serviceId);

  const saveMutation = useMutation({
    mutationFn: async (payload: SupportServiceTransactionInput) => {
      const path =
        isEditing && transactionId
          ? `/admin/support-services/transactions/${encodeURIComponent(
              transactionId,
            )}`
          : "/admin/support-services/transactions";
      return sdkFetch<{ transaction: SupportServiceTransactionRecord }>(path, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: [TRANSACTIONS_QUERY_KEY] });
      setToast({
        id: nextToastId(),
        tone: "success",
        message: t("Service transaction saved."),
      });
      router.push(`/god-mode/service-transactions/${result.transaction.id}`);
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId())),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      sdkFetch(
        `/admin/support-services/transactions/${encodeURIComponent(
          transactionId ?? "",
        )}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [TRANSACTIONS_QUERY_KEY] });
      router.push("/god-mode/service-transactions");
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId())),
  });

  function handleServiceChange(serviceId: string) {
    setForm(transactionFormForService(serviceId, liveOffers));
  }

  function updateInputRef(index: number, patch: Partial<ObjectRefDraft>) {
    setForm((current) => ({
      ...current,
      inputs: current.inputs.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    }));
  }

  function updateOutputRef(index: number, patch: Partial<ObjectRefDraft>) {
    setForm((current) => ({
      ...current,
      outputs: current.outputs.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      saveMutation.mutate(transactionPayloadFromForm(form));
    } catch (error) {
      setToast(mutationErrorToast(error, nextToastId()));
    }
  }

  if ((isEditing && transactionQuery.isLoading) || offersQuery.isLoading) {
    return <Skeleton className="h-[34rem] w-full" />;
  }

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <form className="glass-panel overflow-hidden" onSubmit={handleSubmit}>
        <WorkbenchTopbar
          title={isEditing ? "Editar transaccion" : "Alta de transaccion"}
          backHref="/god-mode/service-transactions"
          backLabel="Back to Service Transactions"
          isSaving={saveMutation.isPending}
          canDelete={isEditing}
          onDelete={() => {
            if (window.confirm(t("Delete this service transaction?"))) {
              deleteMutation.mutate();
            }
          }}
        />
        <Section title="Request identity">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Service">
              <Select value={form.serviceId} onValueChange={handleServiceChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serviceChoices.map((service) => (
                    <SelectItem key={service.value} value={service.value}>
                      {service.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(status) =>
                  setForm((current) => ({
                    ...current,
                    status: status as TransactionFormState["status"],
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
            <Field label="Request ID">
              <Input
                value={form.requestId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requestId: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field label="Service version">
              <Input
                value={form.serviceVersion}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    serviceVersion: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field label="Requester email">
              <Input
                value={form.requesterEmail}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requesterEmail: event.target.value,
                  }))
                }
                type="email"
              />
            </Field>
            <Field label="Subject ID">
              <Input
                value={form.subjectId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    subjectId: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
          {selectedOffer ? (
            <div className="rounded border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">{selectedOffer.name}</div>
              <div>{selectedOffer.shortContract}</div>
            </div>
          ) : null}
        </Section>
        <Section title="Mandatory form reference">
          <div className="grid gap-4 md:grid-cols-[1fr_10rem]">
            <Field label="Form object ID">
              <Input
                value={form.formObjectId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    formObjectId: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field label="Revision">
              <Input
                value={form.formRevision}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    formRevision: event.target.value,
                  }))
                }
                inputMode="numeric"
                required
              />
            </Field>
          </div>
        </Section>
        <Section title="Input object bindings">
          <ObjectRefTable slots={form.inputs} onChange={updateInputRef} />
        </Section>
        <Section title="Output object bindings">
          <ObjectRefTable slots={form.outputs} onChange={updateOutputRef} />
        </Section>
        <Section title="Notes">
          <Textarea
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            rows={4}
          />
        </Section>
      </form>
    </>
  );
}

function ObjectRefTable({
  slots,
  onChange,
}: {
  slots: ObjectRefDraft[];
  onChange: (index: number, patch: Partial<ObjectRefDraft>) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  if (slots.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleAlert className="h-4 w-4" />
        <span>{t("No object bindings are defined for this service.")}</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Role")}</TableHead>
            <TableHead>{t("Accepted types")}</TableHead>
            <TableHead>{t("Object ID")}</TableHead>
            <TableHead>{t("Revision")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slots.map((slot, index) => (
            <TableRow key={`${slot.role}-${index}`}>
              <TableCell className="font-mono text-sm">
                {slot.role}
                {slot.required ? (
                  <Badge variant="outline" className="ml-2">
                    {t("Required")}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="min-w-[14rem]">
                <div className="flex flex-wrap gap-1">
                  {slot.acceptedTypes.map((type) => (
                    <Badge key={type} variant="secondary">
                      {objectLabel(type)}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="min-w-[16rem]">
                <Input
                  value={slot.objectId}
                  onChange={(event) =>
                    onChange(index, { objectId: event.target.value })
                  }
                  required={slot.required}
                  placeholder="obj_..."
                />
              </TableCell>
              <TableCell className="w-32">
                <Input
                  value={slot.revision}
                  onChange={(event) =>
                    onChange(index, { revision: event.target.value })
                  }
                  inputMode="numeric"
                  required={slot.required || Boolean(slot.objectId)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function WorkbenchTopbar({
  title,
  backHref,
  backLabel,
  isSaving,
  canDelete,
  onDelete,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  isSaving: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-3 border-b border-border/70 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          {t(title)}
        </h2>
        <HeaderUnclutterButton />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild type="button" variant="outline" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            <span>{t(backLabel)}</span>
          </Link>
        </Button>
        {canDelete ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="border-destructive/30 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span>{t("Delete")}</span>
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={isSaving}>
          <CheckCircle2 className="h-4 w-4" />
          <span>{isSaving ? t("Saving...") : t("Save")}</span>
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <section className="grid gap-4 border-b border-border/70 p-4 last:border-b-0 lg:p-5">
      <h3 className="font-heading text-base font-semibold text-foreground">
        {t(title)}
      </h3>
      {children}
    </section>
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

function StagePicker({
  value,
  onChange,
}: {
  value: SupportServiceStage[];
  onChange: (value: SupportServiceStage[]) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  function toggle(stage: SupportServiceStage) {
    onChange(
      value.includes(stage)
        ? value.filter((current) => current !== stage)
        : [...value, stage],
    );
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{t("Stages")}</p>
      <div className="flex flex-wrap gap-3">
        {SUPPORT_SERVICE_STAGES.map((stage) => (
          <label key={stage.value} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.includes(stage.value)}
              onCheckedChange={() => toggle(stage.value)}
            />
            <span>{t(stage.label)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ObjectTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {POCKET_GENES_OBJECT_OPTIONS.map((object) => (
          <SelectItem key={object.value} value={object.value}>
            {object.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ObjectTypeChecklist({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto rounded border border-border/70 p-3 sm:grid-cols-2">
      {POCKET_GENES_OBJECT_OPTIONS.map((object) => (
        <label key={object.value} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={selected.includes(object.value)}
            onCheckedChange={() => onToggle(object.value)}
          />
          <span className="min-w-0 truncate">{object.label}</span>
        </label>
      ))}
    </div>
  );
}
