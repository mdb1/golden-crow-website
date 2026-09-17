"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  FileText,
  Filter,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  UserRound,
  Trash2,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  POCKET_GENES_OBJECT_OPTIONS,
  POCKET_GENES_SERVICE_OPTIONS,
  catalogServiceById,
  objectLabel,
} from "@/lib/pocket-genes-service-catalog";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import type {
  DiscoverIndividualRecord,
  DiscoverIndividualsPage,
  DiscoverOrganizationRecord,
  DiscoverOrganizationsPage,
} from "@/lib/discover";
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
  type SupportServiceOfferStatus,
  type SupportServiceOffersPage,
  type SupportServiceOutputSlot,
  type SupportServicePricingModel,
  type SupportServiceProviderKind,
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
  serviceVersion: number;
  name: string;
  serviceCategory: string;
  providerKind: SupportServiceProviderKind;
  providerId: string;
  providerName: string;
  stages: SupportServiceStage[];
  status: NonNullable<SupportServiceOfferInput["status"]>;
  availability: string;
  description: string;
  providerWork: string;
  supportsFormShape: boolean;
  formShape: {
    id: string;
    version: number;
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
  serviceVersion: number;
  status: NonNullable<SupportServiceTransactionInput["status"]>;
  requesterEmail: string;
  subjectId: string;
  inputs: ObjectRefDraft[];
  outputs: ObjectRefDraft[];
  notes: string;
};

type ServiceOfferPublishDialogState = {
  status: "publishing" | "success" | "error";
  offerId?: string;
  message?: string;
};

const SERVICE_PAGE_SIZE = 20;
const PROVIDER_OFFER_LOOKUP_LIMIT = 100;
const OFFERS_QUERY_KEY = "god-mode-support-service-offers";
const TRANSACTIONS_QUERY_KEY = "god-mode-support-service-transactions";
const LIVE_OFFERS_QUERY_KEY = "god-mode-support-service-offers-live-picker";
const FORM_OBJECT_TYPE = "pgo_form";
const DEFAULT_OUTPUT_OBJECT_TYPE = "pgo_pdf_report";
const INPUT_OBJECT_OPTIONS = POCKET_GENES_OBJECT_OPTIONS.filter(
  (object) => object.value !== FORM_OBJECT_TYPE,
);
const OUTPUT_OBJECT_OPTIONS = POCKET_GENES_OBJECT_OPTIONS.filter(
  (object) => object.value !== FORM_OBJECT_TYPE,
);
const TURNAROUND_UNITS = [
  { value: "w", label: "Weeks" },
  { value: "d", label: "Days" },
  { value: "h", label: "Hours" },
  { value: "m", label: "Minutes" },
] as const;

type TurnaroundUnit = (typeof TURNAROUND_UNITS)[number]["value"];

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

function compactTurnaround(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const compactMatch = normalized.match(/^([1-9]\d*)([wdhm])$/);
  if (compactMatch) {
    return `${compactMatch[1]}${compactMatch[2]}`;
  }

  const textMatch = normalized.match(
    /^([1-9]\d*)\s*(?:business\s*)?(week|weeks|w|day|days|d|hour|hours|h|minute|minutes|min|mins|m)\b/,
  );
  if (!textMatch) {
    return undefined;
  }

  const unitText = textMatch[2];
  const unit: TurnaroundUnit =
    unitText.startsWith("week") || unitText === "w"
      ? "w"
      : unitText.startsWith("day") || unitText === "d"
        ? "d"
        : unitText.startsWith("hour") || unitText === "h"
          ? "h"
          : "m";

  return `${textMatch[1]}${unit}`;
}

function turnaroundParts(value: string | undefined): {
  amount: string;
  unit: TurnaroundUnit;
} {
  const compact = compactTurnaround(value);
  const match = compact?.match(/^([1-9]\d*)([wdhm])$/);
  return {
    amount: match?.[1] ?? "",
    unit: (match?.[2] as TurnaroundUnit | undefined) ?? "d",
  };
}

function formatTurnaround(amount: string, unit: TurnaroundUnit) {
  const parsed = Number(amount);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }

  return `${parsed}${unit}`;
}

function slugKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function generatedIdSuffix(currentServiceId: string) {
  const match = currentServiceId.trim().match(/_(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function generatedOfferIds(
  providerName: string,
  currentServiceId = "",
  reservedServiceIds: string[] = [],
) {
  const slug = slugKey(providerName);
  if (!slug) {
    return null;
  }

  const serviceBase = `pgs_${slug}`;
  const formShapeBase = `pgfs_${slug}`;
  const usedServiceIds = new Set(
    reservedServiceIds.map((serviceId) => serviceId.trim()).filter(Boolean),
  );
  let suffix = generatedIdSuffix(currentServiceId);
  while (usedServiceIds.has(`${serviceBase}_${suffix}`)) {
    suffix += 1;
  }

  return {
    serviceId: `${serviceBase}_${suffix}`,
    formShapeId: `${formShapeBase}_${suffix}`,
  };
}

function applyGeneratedOfferIds<T extends OfferFormState>(
  form: T,
  reservedServiceIds: string[] = [],
): T {
  const ids = generatedOfferIds(
    form.providerName,
    form.serviceId,
    reservedServiceIds,
  );
  if (!ids) {
    return {
      ...form,
      serviceId: "pgs_",
      formShape: {
        ...form.formShape,
        id: "pgfs_",
      },
    };
  }

  return {
    ...form,
    serviceId: ids.serviceId,
    formShape: {
      ...form.formShape,
      id: ids.formShapeId,
    },
  };
}

function formFieldsFromRecord(fields: SupportServiceFormField[] = []) {
  return fields.map((field) => ({
    ...field,
    optionsText: optionsText(field.options),
  }));
}

function defaultFormShape() {
  return {
    id: "pgfs_",
    version: 1,
    allowUnknownFields: false,
    fields: formFieldsFromRecord([
      {
        key: "requested_at",
        label: "Requested at",
        type: "datetime",
        required: true,
      },
      {
        key: "requested_by",
        label: "Requested by",
        type: "text",
        required: true,
      },
    ]),
  };
}

function defaultFormInputSlot(): SupportServiceInputSlot {
  return {
    role: "form",
    objectType: FORM_OBJECT_TYPE,
    acceptedTypes: [FORM_OBJECT_TYPE],
    required: true,
    cardinality: { min: 1, max: 1 },
  };
}

function isFormInputSlot(slot: SupportServiceInputSlot) {
  return slotObjectType(slot) === FORM_OBJECT_TYPE;
}

function withFormInputSlot(slots: SupportServiceInputSlot[]) {
  return slots.some(isFormInputSlot) ? slots : [defaultFormInputSlot(), ...slots];
}

function withoutFormInputSlots(slots: SupportServiceInputSlot[]) {
  return slots.filter((slot) => !isFormInputSlot(slot));
}

function defaultOutputSlot(): SupportServiceOutputSlot {
  return {
    role: "report",
    objectType: DEFAULT_OUTPUT_OBJECT_TYPE,
    mutationMode: "new_object",
  };
}

function serviceOutputSlots(slots: SupportServiceOutputSlot[]) {
  const outputSlots = slots.filter(
    (slot) => slot.objectType && slot.objectType !== FORM_OBJECT_TYPE,
  );
  return outputSlots.length ? outputSlots : [defaultOutputSlot()];
}

function defaultOfferForm(): OfferFormState {
  return {
    serviceId: "pgs_",
    serviceVersion: 1,
    name: "",
    serviceCategory: "",
    providerKind: "organization",
    providerId: "",
    providerName: "",
    stages: ["test_planning"],
    status: "draft",
    availability: "backoffice",
    description: "",
    providerWork: "",
    supportsFormShape: false,
    formShape: defaultFormShape(),
    inputSlots: [],
    outputSlots: [defaultOutputSlot()],
    acceptedConditionsText: "",
    scopeRulesText: "",
    commercialTerms: {
      pricingModel: "not_specified",
      price: { currency: "ARS" },
    },
  };
}

function singleInputSlot(slot: SupportServiceInputSlot): SupportServiceInputSlot {
  const objectType = slot.objectType || slot.acceptedTypes[0] || "";
  return {
    ...slot,
    objectType,
    acceptedTypes: objectType ? [objectType] : [],
  };
}

function offerFormFromCatalog(
  catalogOffer = POCKET_GENES_SERVICE_OPTIONS[0],
  currentProvider: Pick<
    OfferFormState,
    "providerKind" | "providerId" | "providerName"
  > = {
    providerKind: "organization",
    providerId: "",
    providerName: "",
  },
): OfferFormState {
  const hasFormShape = Boolean(catalogOffer.formShape.id);
  const catalogInputSlots = catalogOffer.inputSlots.map((slot) =>
    singleInputSlot({ ...slot }),
  );
  return {
    serviceId: catalogOffer.serviceId,
    serviceVersion: catalogOffer.serviceVersion,
    name: catalogOffer.name,
    serviceCategory: catalogOffer.name,
    providerKind: currentProvider.providerKind,
    providerId: currentProvider.providerId,
    providerName: currentProvider.providerName,
    stages: catalogOffer.stages.length
      ? catalogOffer.stages
      : ["test_planning"],
    status: "draft",
    availability: catalogOffer.availability || "backoffice",
    description: catalogOffer.description,
    providerWork: catalogOffer.providerWork,
    supportsFormShape: hasFormShape,
    formShape: hasFormShape
      ? {
          id: catalogOffer.formShape.id,
          version: catalogOffer.formShape.version,
          allowUnknownFields: Boolean(catalogOffer.formShape.allowUnknownFields),
          fields: formFieldsFromRecord(catalogOffer.formShape.fields),
        }
      : defaultFormShape(),
    inputSlots: hasFormShape
      ? withFormInputSlot(catalogInputSlots)
      : withoutFormInputSlots(catalogInputSlots),
    outputSlots: serviceOutputSlots(
      catalogOffer.outputSlots.map((slot) => ({ ...slot })),
    ),
    acceptedConditionsText: catalogOffer.acceptedConditions.join("\n"),
    scopeRulesText: catalogOffer.scopeRules.join("\n"),
    commercialTerms: {
      pricingModel:
        catalogOffer.commercialTerms.price?.amount === 0
          ? "free"
          : "fixed",
      price: { ...catalogOffer.commercialTerms.price },
      turnaround: catalogOffer.commercialTerms.turnaround,
    },
  };
}

function offerFormFromRecord(record: SupportServiceOfferRecord): OfferFormState {
  const hasFormShape = Boolean(record.formShape?.id);
  const recordInputSlots = record.inputSlots.map((slot) =>
    singleInputSlot({ ...slot }),
  );
  return {
    serviceId: record.serviceId,
    serviceVersion: record.serviceVersion,
    name: record.name,
    serviceCategory: record.serviceCategory ?? "",
    providerKind: record.providerKind ?? "organization",
    providerId: record.providerId,
    providerName: record.providerName ?? "",
    stages: record.stages.length ? record.stages : ["test_planning"],
    status: record.status,
    availability: record.availability,
    description: record.description,
    providerWork: record.providerWork,
    supportsFormShape: hasFormShape,
    formShape: record.formShape
      ? {
          id: record.formShape.id,
          version: record.formShape.version,
          allowUnknownFields: Boolean(record.formShape.allowUnknownFields),
          fields: formFieldsFromRecord(record.formShape.fields),
        }
      : defaultFormShape(),
    inputSlots: hasFormShape
      ? withFormInputSlot(recordInputSlots)
      : withoutFormInputSlots(recordInputSlots),
    outputSlots: serviceOutputSlots(
      record.outputSlots.map((slot) => ({ ...slot })),
    ),
    acceptedConditionsText: record.acceptedConditions.join("\n"),
    scopeRulesText: record.scopeRules.join("\n"),
    commercialTerms: record.commercialTerms ?? {
      pricingModel: "not_specified",
      price: { currency: "ARS" },
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

function slotObjectType(slot: SupportServiceInputSlot) {
  return slot.objectType || slot.acceptedTypes[0] || "";
}

function contractObjectLabel(value: string) {
  return objectLabel(value).replace(/^Pocket Genes /, "");
}

function calculatedShortContract(
  inputSlots: SupportServiceInputSlot[],
  outputSlots: SupportServiceOutputSlot[],
) {
  const inputs = inputSlots.map((slot) => {
    const objectType = slotObjectType(slot) || "pgo_object";
    return `${slot.role || "input"}:${contractObjectLabel(objectType)}`;
  });
  const outputs = outputSlots.map((slot) => {
    const objectType = slot.objectType || "pgo_object";
    return `${slot.role || "output"}:${contractObjectLabel(objectType)}`;
  });
  const left = inputs.length ? inputs.join(" + ") : "no input";
  const right = outputs.length ? outputs.join(" + ") : "provider output";

  return `${left} -> ${right}`;
}

function serviceOfferStatusDescription(
  status: SupportServiceOfferStatus,
  t: (text: string) => string,
) {
  if (status === "active") {
    return t("Active service offers are published and can be selected by new service transactions.");
  }

  if (status === "paused") {
    return t("Paused service offers stay saved, but should not receive new transaction requests until they are published again.");
  }

  if (status === "archived") {
    return t("Archived service offers stay available for audit and historical transactions, but are removed from normal operation.");
  }

  return t("Draft service offers stay private while the contract is still being shaped. Publish when the service is ready to receive transactions.");
}

function serviceOfferStatusBadgeClass(status: SupportServiceOfferStatus) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/24 dark:bg-emerald-500/12 dark:text-emerald-200";
  }

  if (status === "paused") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/26 dark:bg-amber-500/12 dark:text-amber-200";
  }

  if (status === "archived") {
    return "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-500/30 dark:bg-slate-800/70 dark:text-slate-200";
  }

  return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/26 dark:bg-sky-500/12 dark:text-sky-200";
}

function PublishedIndicator({ t }: { t: (text: string) => string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-700 shadow-[0_10px_28px_-18px_rgba(5,150,105,0.65)] dark:border-emerald-400/26 dark:bg-emerald-500/12 dark:text-emerald-200">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
      </span>
      {t("Published")}
    </div>
  );
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
    acceptedTypes:
      "acceptedTypes" in slot ? [slotObjectType(slot)].filter(Boolean) : [slot.objectType],
  };
}

function emptyTransactionForm(): TransactionFormState {
  return {
    requestId: "pgr_",
    serviceId: "",
    serviceVersion: 1,
    status: "submitted",
    requesterEmail: "",
    subjectId: "",
    inputs: [],
    outputs: [],
    notes: "",
  };
}

function transactionFormForOffer(
  offer: SupportServiceOfferRecord,
): TransactionFormState {
  const inputSlots = offer.inputSlots ?? [];
  const outputSlots = offer.outputSlots ?? [];

  return {
    requestId: makeRequestId(offer.serviceId),
    serviceId: offer.serviceId,
    serviceVersion: offer.serviceVersion,
    status: "submitted",
    requesterEmail: "",
    subjectId: "",
    inputs: inputSlots.map(emptyObjectRefDraft),
    outputs: outputSlots.map(emptyObjectRefDraft),
    notes: "",
  };
}

function transactionFormForService(
  serviceId: string,
  offers: SupportServiceOfferRecord[],
): TransactionFormState {
  const offer = offers.find((candidate) => candidate.serviceId === serviceId);
  return offer
    ? transactionFormForOffer(offer)
    : {
        ...emptyTransactionForm(),
        requestId: serviceId ? makeRequestId(serviceId) : "pgr_",
        serviceId,
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

function offerPayloadFromForm(
  form: OfferFormState,
  reservedServiceIds: string[] = [],
): SupportServiceOfferInput {
  if (!form.name.trim()) {
    throw new Error("Offer name is required.");
  }
  if (!form.providerId.trim()) {
    throw new Error("Choose an organization or professional provider.");
  }
  const generatedIds = generatedOfferIds(
    form.providerName,
    form.serviceId,
    reservedServiceIds,
  );
  if (!generatedIds) {
    throw new Error("Choose an organization or professional provider.");
  }
  assertIdentifier(generatedIds.serviceId, "pgs", "Service ID");
  if (!form.description.trim()) {
    throw new Error("Description is required.");
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

  const formSlots = form.inputSlots.filter(isFormInputSlot);
  if (form.supportsFormShape) {
    assertIdentifier(generatedIds.formShapeId, "pgfs", "Form shape ID");
    if (formSlots.length !== 1) {
      throw new Error("A form shape requires exactly one pgo_form input slot.");
    }
  } else if (formSlots.length > 0) {
    throw new Error("A pgo_form input slot requires a form shape.");
  }

  const fields = form.supportsFormShape
    ? form.formShape.fields.map((field) => {
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
      })
    : [];
  if (form.supportsFormShape) {
    const fieldKeys = fields.map((field) => field.key);
    for (const requiredKey of ["requested_at", "requested_by"]) {
      if (!fieldKeys.includes(requiredKey)) {
        throw new Error(`Form shape must include ${requiredKey}.`);
      }
    }
  }

  for (const slot of form.inputSlots) {
    if (!slot.role.trim()) {
      throw new Error("Every input slot needs a role.");
    }
    if (!slotObjectType(slot)) {
      throw new Error(`Input slot ${slot.role} needs one object type.`);
    }
    if (slot.cardinality.min < 0 || slot.cardinality.max < slot.cardinality.min) {
      throw new Error(`Input slot ${slot.role} has invalid cardinality.`);
    }
  }
  for (const slot of form.outputSlots) {
    if (!slot.role.trim() || !slot.objectType) {
      throw new Error("Every output slot needs a role and object type.");
    }
    if (slot.objectType === FORM_OBJECT_TYPE) {
      throw new Error("Output slots cannot produce request forms.");
    }
  }
  const pricingModel = form.commercialTerms.pricingModel ?? "not_specified";
  if (pricingModel === "fixed") {
    if (!Number.isFinite(form.commercialTerms.price?.amount)) {
      throw new Error("Fixed price amount must be numeric.");
    }
    if (!form.commercialTerms.price?.currency?.trim()) {
      throw new Error("Fixed price currency is required.");
    }
  }
  const acceptedConditions = splitLines(form.acceptedConditionsText);
  const scopeRules = splitLines(form.scopeRulesText);

  return {
    serviceId: generatedIds.serviceId,
    serviceVersion: form.serviceVersion || 1,
    name: form.name.trim(),
    serviceCategory: form.serviceCategory.trim(),
    providerKind: form.providerKind,
    providerId: form.providerId.trim(),
    providerName: form.providerName.trim(),
    stages: form.stages,
    status: form.status,
    availability: form.availability.trim(),
    description: form.description.trim(),
    shortContract: calculatedShortContract(form.inputSlots, form.outputSlots),
    providerWork: form.providerWork.trim(),
    formShape: form.supportsFormShape
      ? {
          id: generatedIds.formShapeId,
          version: form.formShape.version || 1,
          allowUnknownFields: false,
          fields,
        }
      : undefined,
    inputSlots: form.inputSlots.map((slot) => ({
      ...slot,
      role: slot.role.trim(),
      objectType: slotObjectType(slot),
      acceptedTypes: [slotObjectType(slot)],
    })),
    outputSlots: form.outputSlots.map((slot) => ({
      ...slot,
      role: slot.role.trim(),
    })),
    acceptedConditions: acceptedConditions.length ? acceptedConditions : undefined,
    scopeRules: scopeRules.length ? scopeRules : undefined,
    commercialTerms: commercialTermsPayload(form.commercialTerms),
  };
}

function commercialTermsPayload(
  terms: SupportServiceCommercialTerms,
): SupportServiceCommercialTerms | undefined {
  const pricingModel = terms.pricingModel ?? "not_specified";
  const rawTurnaround = terms.turnaround?.trim();
  const turnaround = compactTurnaround(rawTurnaround);

  if (rawTurnaround && !turnaround) {
    throw new Error("Turnaround must be a duration like 2w, 1d, 3h, or 15m.");
  }

  if (pricingModel === "not_specified" && !turnaround) {
    return undefined;
  }

  if (pricingModel === "fixed") {
    return {
      pricingModel,
      price: {
        amount: terms.price?.amount,
        currency: terms.price?.currency?.trim().toUpperCase() || "ARS",
      },
      turnaround,
    };
  }

  return {
    pricingModel,
    turnaround,
  };
}

function transactionPayloadFromForm(
  form: TransactionFormState,
): SupportServiceTransactionInput {
  assertIdentifier(form.requestId, "pgr", "Request ID");
  assertIdentifier(form.serviceId, "pgs", "Service ID");
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
    serviceVersion: form.serviceVersion || 1,
    status: form.status,
    requesterEmail: form.requesterEmail.trim(),
    subjectId: form.subjectId.trim(),
    formRef: null,
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

function mutationErrorToast(
  error: unknown,
  id: number,
  translate: (text: string) => string = (text) => text,
): ActionToastState {
  const message = error instanceof Error ? error.message : "Action failed.";
  return {
    id,
    tone: "error",
    message: translate(message),
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
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
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
              <Input
                value={filters.serviceId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    serviceId: event.target.value,
                  }))
                }
                placeholder={t("Filter by service ID")}
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
                  <TableHead>{t("Inputs")}</TableHead>
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
                    <TableCell className="min-w-[13rem]">
                      <div className="text-sm font-medium">
                        {offer.providerName || offer.providerId}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {offer.providerKind} · {offer.providerId}
                      </div>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {transaction.inputs.length} {t("bound")}
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
  const [savedForm, setSavedForm] = useState<OfferFormState>(() =>
    defaultOfferForm(),
  );
  const [persistedOfferId, setPersistedOfferId] = useState<string | null>(
    offerId ?? null,
  );
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<SupportServiceOfferStatus>(
    "draft",
  );
  const [publishDialog, setPublishDialog] =
    useState<ServiceOfferPublishDialogState | null>(null);
  const [toastCounter, setToastCounter] = useState(1);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const isEditing = mode === "edit";
  const effectiveOfferId = offerId ?? persistedOfferId ?? undefined;
  const hasPersistedOffer = Boolean(effectiveOfferId);

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
      const nextForm = offerFormFromRecord(offerQuery.data.offer);
      setForm(nextForm);
      setSavedForm(nextForm);
      setPersistedOfferId(offerQuery.data.offer.id);
      setStatusDraft(offerQuery.data.offer.status);
    }
  }, [offerQuery.data?.offer]);

  const providerOffersQuery = useQuery({
    queryKey: [OFFERS_QUERY_KEY, "provider-siblings", form.providerId],
    queryFn: () =>
      sdkFetch<SupportServiceOffersPage>(
        `/admin/support-services/offers?limit=${PROVIDER_OFFER_LOOKUP_LIMIT}&query=${encodeURIComponent(
          form.providerId.trim(),
        )}`,
      ),
    enabled: Boolean(form.providerId.trim()),
  });

  const reservedServiceIds = useMemo(
    () =>
      (providerOffersQuery.data?.offers ?? [])
        .filter(
          (offer) =>
            offer.providerId === form.providerId && offer.id !== effectiveOfferId,
        )
        .map((offer) => offer.serviceId),
    [form.providerId, effectiveOfferId, providerOffersQuery.data?.offers],
  );

  useEffect(() => {
    if (!form.providerName) {
      return;
    }

    const ids = generatedOfferIds(
      form.providerName,
      form.serviceId,
      reservedServiceIds,
    );
    if (
      ids &&
      (ids.serviceId !== form.serviceId || ids.formShapeId !== form.formShape.id)
    ) {
      setForm((current) => applyGeneratedOfferIds(current, reservedServiceIds));
    }
  }, [
    form.formShape.id,
    form.providerName,
    form.serviceId,
    reservedServiceIds,
  ]);

  const saveMutation = useMutation({
    mutationFn: async (payload: SupportServiceOfferInput) => {
      const path =
        effectiveOfferId
          ? `/admin/support-services/offers/${encodeURIComponent(effectiveOfferId)}`
          : "/admin/support-services/offers";
      return sdkFetch<{ offer: SupportServiceOfferRecord }>(path, {
        method: effectiveOfferId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
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
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
  });

  const shortContractPreview = calculatedShortContract(
    form.inputSlots,
    form.outputSlots,
  );
  const offerIdsPreview = generatedOfferIds(
    form.providerName,
    form.serviceId,
    reservedServiceIds,
  );
  const changed = JSON.stringify(form) !== JSON.stringify(savedForm);
  const isWorking = saveMutation.isPending || deleteMutation.isPending;
  const canPublishCurrentOffer = hasPersistedOffer && form.status !== "active";
  const statusOptions = SUPPORT_SERVICE_OFFER_STATUSES.filter(
    (option) => form.status === "active" || option.value !== "active",
  );

  function applyMockTemplate(serviceId: string) {
    const catalog = catalogServiceById(serviceId);
    if (!catalog) {
      return;
    }
    const next = offerFormFromCatalog(catalog, {
      providerKind: form.providerKind,
      providerId: form.providerId,
      providerName: form.providerName,
    });
    setForm((current) =>
      applyGeneratedOfferIds(
        {
          ...next,
          status: current.status,
        },
        reservedServiceIds,
      ),
    );
  }

  async function persistOffer(
    status: SupportServiceOfferStatus,
    {
      redirectToOffer = mode === "create",
      showToast = true,
      successMessage = "Service offer saved.",
    }: {
      redirectToOffer?: boolean;
      showToast?: boolean;
      successMessage?: string;
    } = {},
  ) {
    try {
      if (form.providerId.trim() && providerOffersQuery.isFetching) {
        throw new Error("Generated service ID is still checking existing offers.");
      }

      const result = await saveMutation.mutateAsync(
        offerPayloadFromForm({ ...form, status }, reservedServiceIds),
      );
      await queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });

      const nextForm = offerFormFromRecord(result.offer);
      setForm(nextForm);
      setSavedForm(nextForm);
      setPersistedOfferId(result.offer.id);
      setStatusDraft(result.offer.status);

      if (showToast) {
        setToast({
          id: nextToastId(),
          tone: "success",
          message: t(successMessage),
        });
      }

      if (redirectToOffer) {
        router.push(`/god-mode/service-offers/${result.offer.id}`);
      }
      router.refresh();
      return result.offer;
    } catch (error) {
      setToast(mutationErrorToast(error, nextToastId(), t));
      return null;
    }
  }

  async function saveCurrentOffer() {
    const status = hasPersistedOffer ? form.status : "draft";
    await persistOffer(status, {
      successMessage: hasPersistedOffer
        ? "Service offer saved."
        : "Service offer draft saved.",
    });
  }

  async function saveStatusDraft() {
    if (statusDraft === form.status) {
      setStatusDialogOpen(false);
      return;
    }

    const saved = await persistOffer(statusDraft, {
      redirectToOffer: false,
      successMessage: "Service offer status updated.",
    });
    if (saved) {
      setStatusDialogOpen(false);
    }
  }

  async function publishOffer() {
    setPublishDialog({ status: "publishing" });
    const published = await persistOffer("active", {
      redirectToOffer: false,
      showToast: false,
    });
    if (!published) {
      setPublishDialog({
        status: "error",
        message: t("Publishing stopped. Review the service offer requirements and try again."),
      });
      return;
    }

    setPublishDialog({
      status: "success",
      offerId: published.id,
      message: t("This service offer is now published."),
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveCurrentOffer();
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
          isSaving={isWorking}
          canDelete={isEditing}
          onDelete={() => {
            if (window.confirm(t("Delete this service offer?"))) {
              deleteMutation.mutate();
            }
          }}
          saveLabel={hasPersistedOffer ? "Save changes" : "Save draft"}
        />
        <Section title="Offer identity">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <div className="text-sm font-medium text-foreground">
                {form.name || t("New service offer")}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {`${offerIdsPreview?.serviceId ?? "pgs_"} · v${
                  form.serviceVersion || 1
                }`}
              </div>
            </div>
            <MockTemplatePicker onSelect={applyMockTemplate} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Offer name">
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Service ID">
              <GeneratedValue value={offerIdsPreview?.serviceId ?? "pgs_"} />
            </Field>
            <Field label="Service version">
              <GeneratedValue value={String(form.serviceVersion || 1)} />
            </Field>
            <Field label="Service category">
              <Input
                value={form.serviceCategory}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    serviceCategory: event.target.value,
                  }))
                }
                placeholder={t("Optional general category")}
              />
            </Field>
            <Field label="Provider kind">
              <Select
                value={form.providerKind}
                onValueChange={(providerKind) =>
                  setForm((current) =>
                    applyGeneratedOfferIds(
                      {
                        ...current,
                        providerKind: providerKind as SupportServiceProviderKind,
                        providerId:
                          providerKind === current.providerKind
                            ? current.providerId
                            : "",
                        providerName:
                          providerKind === current.providerKind
                            ? current.providerName
                            : "",
                        serviceId:
                          providerKind === current.providerKind
                            ? current.serviceId
                            : "pgs_",
                      },
                      providerKind === current.providerKind
                        ? reservedServiceIds
                        : [],
                    ),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">
                    {t("Organization")}
                  </SelectItem>
                  <SelectItem value="individual">
                    {t("Professional individual")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <ProviderPicker
              kind={form.providerKind}
              selectedId={form.providerId}
              selectedName={form.providerName}
              onSelect={(provider) =>
                setForm((current) => {
                  const sameProvider = provider.id === current.providerId;
                  return applyGeneratedOfferIds(
                    {
                      ...current,
                      providerId: provider.id,
                      providerName: provider.name,
                      serviceId: sameProvider ? current.serviceId : "pgs_",
                    },
                    sameProvider ? reservedServiceIds : [],
                  );
                })
              }
            />
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
        <ServiceOfferStatusBlock
          status={form.status}
          statusDraft={statusDraft}
          statusOptions={statusOptions.map((option) => option.value)}
          canChangeStatus={hasPersistedOffer}
          isWorking={isWorking}
          dialogOpen={statusDialogOpen}
          onDialogOpenChange={(open) => {
            if (open) {
              setStatusDraft(form.status);
            }
            setStatusDialogOpen(open);
          }}
          onStatusDraftChange={setStatusDraft}
          onSaveStatusDraft={() => void saveStatusDraft()}
        />
        <Section title="Contract">
          <div className="grid gap-4">
            <div className="grid gap-2 text-sm font-medium">
              <span>{t("Calculated short contract")}</span>
              <div className="rounded border border-border/70 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
                {shortContractPreview}
              </div>
            </div>
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
        <FormShapeEditor
          form={form}
          reservedServiceIds={reservedServiceIds}
          setForm={setForm}
        />
        <SlotEditors form={form} setForm={setForm} />
        <TermsEditor form={form} setForm={setForm} />
        <Section title="Acceptance and scope">
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              {t(
                "Accepted conditions are the facts that must be true before the provider accepts the request. Scope rules are the boundaries the provider must follow while doing the work. This block is optional; add one rule per line only when the service needs explicit limits.",
              )}
            </p>
          </div>
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
                placeholder={t("One accepted condition per line")}
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
                placeholder={t("One scope rule per line")}
              />
            </Field>
          </div>
        </Section>
        <ServiceOfferPublishFooter
          changed={changed}
          mode={hasPersistedOffer ? "edit" : "create"}
          isWorking={isWorking}
          pending={saveMutation.isPending}
          canPublishCurrentOffer={canPublishCurrentOffer}
          onSaveChanges={() => void saveCurrentOffer()}
          onPublish={() => void publishOffer()}
        />
      </form>
      <ServiceOfferPublishDialog
        dialog={publishDialog}
        offerName={form.name}
        onOpenOffer={(id) => {
          setPublishDialog(null);
          router.push(`/god-mode/service-offers/${id}`);
        }}
        onBackToOffers={() => {
          setPublishDialog(null);
          router.push("/god-mode/service-offers");
        }}
        onClose={() => setPublishDialog(null)}
      />
    </>
  );
}

function ServiceOfferStatusBlock({
  status,
  statusDraft,
  statusOptions,
  canChangeStatus,
  isWorking,
  dialogOpen,
  onDialogOpenChange,
  onStatusDraftChange,
  onSaveStatusDraft,
}: {
  status: SupportServiceOfferStatus;
  statusDraft: SupportServiceOfferStatus;
  statusOptions: SupportServiceOfferStatus[];
  canChangeStatus: boolean;
  isWorking: boolean;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onStatusDraftChange: (status: SupportServiceOfferStatus) => void;
  onSaveStatusDraft: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <Section title="Service offer state">
      <div className="overflow-hidden rounded-2xl border border-violet-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(245,243,255,0.90)_58%,rgba(240,249,255,0.72))] p-4 shadow-[0_18px_56px_-48px_rgba(109,40,217,0.48)] dark:border-violet-400/18 dark:bg-[linear-gradient(145deg,rgba(18,23,40,0.94),rgba(30,24,57,0.82))]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                {t("Current status")}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
                  serviceOfferStatusBadgeClass(status),
                )}
              >
                {t(offerStatusLabel(status))}
              </span>
              {status === "active" ? <PublishedIndicator t={t} /> : null}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {serviceOfferStatusDescription(status, t)}
            </p>
            {status !== "active" ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-400/24 dark:bg-amber-500/12 dark:text-amber-200">
                {t("Active status is available only through Publish service offer.")}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onDialogOpenChange(true)}
            disabled={!canChangeStatus || isWorking}
            className="h-10 shrink-0 rounded-xl border-violet-200/80 bg-white/78 px-3 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50 dark:hover:bg-violet-500/18"
          >
            <Settings2 className="h-4 w-4" />
            {t("Change status")}
          </Button>
        </div>

        <AlertDialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
          <AlertDialogContent className="max-w-xl overflow-hidden rounded-2xl border border-violet-100 bg-white p-0 shadow-[0_34px_120px_rgba(109,40,217,0.22)] dark:border-violet-300/22 dark:bg-slate-950">
            <AlertDialogHeader className="border-b border-violet-100 px-6 py-5 text-left dark:border-violet-300/16">
              <AlertDialogTitle className="font-heading text-xl font-semibold">
                {t("Change service offer status")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("Pick the state that best matches what should happen next for this service offer.")}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="px-6 py-5">
              <div
                role="radiogroup"
                aria-label={t("Service offer status options")}
                className="grid gap-3"
              >
                {statusOptions.map((option) => {
                  const selected = statusDraft === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onStatusDraftChange(option)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
                        selected
                          ? "border-violet-300 bg-violet-50 text-violet-950 shadow-[0_14px_36px_-28px_rgba(109,40,217,0.65)] dark:border-violet-300/36 dark:bg-violet-500/14 dark:text-violet-50"
                          : "border-violet-100 bg-white/82 text-foreground hover:border-violet-200 hover:bg-violet-50/70 dark:border-violet-400/16 dark:bg-slate-950/42 dark:hover:bg-violet-500/10",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                          selected
                            ? "border-violet-500 bg-violet-600 text-white"
                            : "border-violet-200 bg-white text-transparent dark:border-violet-400/24 dark:bg-slate-950",
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {t(offerStatusLabel(option))}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {serviceOfferStatusDescription(option, t)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {status !== "active" ? (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-400/24 dark:bg-amber-500/12 dark:text-amber-200">
                  {t("Active status is available only through Publish service offer.")}
                </p>
              ) : null}
            </div>

            <AlertDialogFooter className="mx-0 mb-0 gap-3 border-violet-100 bg-violet-50/55 px-6 py-5 dark:border-violet-300/14 dark:bg-violet-950/16">
              <AlertDialogCancel disabled={isWorking}>
                {t("Cancel")}
              </AlertDialogCancel>
              <Button
                type="button"
                onClick={onSaveStatusDraft}
                disabled={isWorking || statusDraft === status}
                className="h-10 rounded-xl bg-violet-600 px-4 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
              >
                {isWorking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {t("Save")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Section>
  );
}

function ServiceOfferPublishFooter({
  changed,
  mode,
  isWorking,
  pending,
  canPublishCurrentOffer,
  onSaveChanges,
  onPublish,
}: {
  changed: boolean;
  mode: "create" | "edit";
  isWorking: boolean;
  pending: boolean;
  canPublishCurrentOffer: boolean;
  onSaveChanges: () => void;
  onPublish: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const primaryIsSave = mode === "edit";

  return (
    <div className="sticky bottom-0 z-20 border-t border-violet-100/80 bg-white/92 px-5 py-4 shadow-[0_-20px_60px_rgba(109,40,217,0.10)] backdrop-blur dark:border-violet-400/14 dark:bg-slate-950/88">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 text-sm text-muted-foreground">
          {changed ? t("Unsaved changes") : t("No unsaved changes")}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
          <Button
            type="button"
            size="lg"
            onClick={primaryIsSave ? onSaveChanges : onPublish}
            disabled={isWorking}
            variant={canPublishCurrentOffer ? "outline" : "default"}
            className={cn(
              "h-14 min-w-[min(100%,14rem)] justify-center rounded-xl text-base font-semibold",
              canPublishCurrentOffer
                ? "border-violet-200/80 bg-white/82 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-950 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50 dark:hover:bg-violet-500/18"
                : "bg-violet-600 text-white shadow-[0_16px_42px_rgba(109,40,217,0.24)] hover:bg-violet-700",
            )}
          >
            {pending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : primaryIsSave ? (
              <Save className="h-5 w-5" />
            ) : (
              <UploadCloud className="h-5 w-5" />
            )}
            {primaryIsSave
              ? pending
                ? t("Saving...")
                : t("Save changes")
              : pending
                ? t("Publishing...")
                : t("Publish service offer")}
          </Button>
          {canPublishCurrentOffer ? (
            <Button
              type="button"
              size="lg"
              onClick={onPublish}
              disabled={isWorking}
              className="h-14 min-w-[min(100%,18rem)] justify-center rounded-xl bg-violet-600 text-base font-semibold text-white shadow-[0_16px_42px_rgba(109,40,217,0.24)] hover:bg-violet-700"
            >
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <UploadCloud className="h-5 w-5" />
              )}
              {pending ? t("Publishing...") : t("Publish service offer")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ServiceOfferPublishDialog({
  dialog,
  offerName,
  onOpenOffer,
  onBackToOffers,
  onClose,
}: {
  dialog: ServiceOfferPublishDialogState | null;
  offerName: string;
  onOpenOffer: (offerId: string) => void;
  onBackToOffers: () => void;
  onClose: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <Dialog
      open={Boolean(dialog)}
      onOpenChange={(open) => {
        if (!open && dialog?.status !== "publishing") {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={dialog?.status !== "publishing"}
        className="max-w-xl overflow-hidden rounded-[2rem] border border-violet-100 [background:linear-gradient(155deg,rgba(255,255,255,0.98),rgba(245,243,255,0.98)_54%,rgba(240,249,255,0.90))] p-0 text-violet-950 shadow-[0_34px_120px_rgba(109,40,217,0.22)] dark:border-violet-300/22 dark:[background:linear-gradient(150deg,rgba(30,24,57,0.98),rgba(18,23,40,0.96)_48%,rgba(76,29,149,0.20))] dark:text-violet-50"
      >
        <DialogHeader className="border-b border-violet-100 px-6 py-5 dark:border-violet-300/16">
          <DialogTitle className="font-heading text-2xl font-semibold">
            {dialog?.status === "success"
              ? t("Published service offer")
              : dialog?.status === "error"
                ? t("Publish needs attention")
                : t("Publishing service offer")}
          </DialogTitle>
          <DialogDescription className="text-violet-950/70 dark:text-violet-50/70">
            {dialog?.message ??
              t("Saving the service contract and making it available for transactions.")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-6">
          <div className="flex items-start gap-4 rounded-[1.5rem] border border-violet-100 bg-white/75 px-5 py-5 shadow-sm dark:border-violet-300/16 dark:bg-violet-950/24">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm dark:bg-violet-400/12 dark:text-violet-100">
              {dialog?.status === "success" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : dialog?.status === "error" ? (
                <CircleAlert className="h-5 w-5" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-heading text-lg font-semibold">
                {dialog?.status === "success"
                  ? offerName || t("Service offer")
                  : dialog?.status === "error"
                    ? t("Nothing was published")
                    : t("Publishing in progress")}
              </p>
              <p className="mt-2 text-sm text-violet-950/70 dark:text-violet-50/70">
                {dialog?.status === "success"
                  ? t("The offer is saved with status active and can be selected by new service transactions.")
                  : dialog?.status === "error"
                    ? t("The offer stayed unchanged. Fix the form requirement and publish again.")
                    : t("Validating provider, contract slots, form shape, and output requirements.")}
              </p>
            </div>
          </div>
        </div>

        {dialog?.status === "error" ? (
          <DialogFooter className="gap-3 border-violet-100/90 bg-white/55 px-6 py-5 dark:border-violet-300/14 dark:bg-violet-950/16">
            <Button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl bg-violet-600 px-4 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
            >
              {t("OK")}
            </Button>
          </DialogFooter>
        ) : dialog?.status === "success" ? (
          <DialogFooter className="gap-3 border-violet-100/90 bg-white/55 px-6 py-5 dark:border-violet-300/14 dark:bg-violet-950/16">
            <Button
              type="button"
              variant="outline"
              onClick={onBackToOffers}
              className="h-9 rounded-xl border-violet-200/80 bg-white/78 px-3 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50 dark:hover:bg-violet-500/18"
            >
              {t("Back to Service Offers")}
            </Button>
            {dialog.offerId ? (
              <Button
                type="button"
                onClick={() => onOpenOffer(dialog.offerId!)}
                className="h-10 rounded-xl bg-violet-600 px-4 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
              >
                {t("Open offer")}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MockTemplatePicker({
  onSelect,
}: {
  onSelect: (serviceId: string) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [open, setOpen] = useState(false);

  function selectTemplate(serviceId: string) {
    onSelect(serviceId);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Wand2 className="h-4 w-4" />
        <span>{t("Prefill with mocked template")}</span>
      </Button>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("Prefill with mocked template")}</DialogTitle>
          <DialogDescription>
            {t("Choose one Pocket-Genes-Wiki template to prefill editable fields.")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[28rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Template")}</TableHead>
                <TableHead>{t("Stages")}</TableHead>
                <TableHead>{t("Contract")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {POCKET_GENES_SERVICE_OPTIONS.map((template) => (
                <TableRow key={template.serviceId}>
                  <TableCell className="min-w-[16rem]">
                    <div className="font-medium text-foreground">
                      {template.name}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {template.serviceId} · v{template.serviceVersion}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {template.stages.map((stage) => (
                        <Badge key={stage} variant="secondary">
                          {t(stageLabel(stage))}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[22rem] truncate text-sm text-muted-foreground">
                    {calculatedShortContract(
                      template.inputSlots.map((slot) => singleInputSlot(slot)),
                      template.outputSlots,
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => selectTemplate(template.serviceId)}
                    >
                      {t("Use template")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ProviderRecord =
  | DiscoverOrganizationRecord
  | DiscoverIndividualRecord;

function providerMeta(provider: ProviderRecord, kind: SupportServiceProviderKind) {
  return kind === "organization"
    ? (provider as DiscoverOrganizationRecord).organizationType ?? ""
    : (provider as DiscoverIndividualRecord).individualType ?? "";
}

function ProviderPicker({
  kind,
  selectedId,
  selectedName,
  onSelect,
}: {
  kind: SupportServiceProviderKind;
  selectedId: string;
  selectedName: string;
  onSelect: (provider: { id: string; name: string }) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const endpoint =
    kind === "organization" ? "/discover/organizations" : "/discover/individuals";

  const providerQuery = useInfiniteQuery({
    queryKey: ["support-service-provider-picker", kind],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (typeof pageParam === "string" && pageParam) {
        params.set("cursor", pageParam);
      }
      return sdkFetch<DiscoverOrganizationsPage | DiscoverIndividualsPage>(
        `${endpoint}?${params.toString()}`,
      );
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: open,
  });

  const providers = useMemo(() => {
    const pages = providerQuery.data?.pages ?? [];
    return pages.flatMap((page): ProviderRecord[] =>
      "organizations" in page ? page.organizations : page.individuals,
    );
  }, [providerQuery.data?.pages]);

  const filteredProviders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return providers;
    }

    return providers.filter((provider) =>
      [
        provider.id,
        provider.name,
        provider.status,
        providerMeta(provider, kind),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [kind, providers, query]);

  function chooseProvider(provider: ProviderRecord) {
    onSelect({ id: provider.id, name: provider.name });
    setOpen(false);
  }

  return (
    <div className="grid gap-2 text-sm font-medium">
      <span>{t("Provider")}</span>
      <div className="flex flex-col gap-2 rounded border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {selectedName || selectedId || t("No provider selected")}
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            {kind === "organization" ? (
              <Building2 className="h-3.5 w-3.5" />
            ) : (
              <UserRound className="h-3.5 w-3.5" />
            )}
            <span>{selectedId || t("Pick a Discover publisher")}</span>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Search className="h-4 w-4" />
          <span>{t("Choose provider")}</span>
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {kind === "organization"
                ? t("Choose organization provider")
                : t("Choose professional provider")}
            </DialogTitle>
            <DialogDescription>
              {t("Select a Discover publisher record for this service offer.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search loaded providers")}
                className="pl-9"
              />
            </label>
            <div className="max-h-[24rem] overflow-y-auto rounded border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Provider")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>{t("Type")}</TableHead>
                    <TableHead className="text-right">{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerQuery.isLoading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={4}>
                          <Skeleton className="h-9 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredProviders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        {t("No providers found in the loaded page.")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProviders.map((provider) => (
                      <TableRow key={provider.id}>
                        <TableCell className="min-w-[16rem]">
                          <div className="font-medium text-foreground">
                            {provider.name}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {provider.id}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={provider.status === "active" ? "default" : "outline"}>
                            {provider.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                          {providerMeta(provider, kind) || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => chooseProvider(provider)}
                          >
                            {t("Select")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            {providerQuery.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => providerQuery.fetchNextPage()}
                disabled={providerQuery.isFetchingNextPage}
              >
                {providerQuery.isFetchingNextPage ? t("Loading...") : t("Load more")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormShapeEditor({
  form,
  reservedServiceIds,
  setForm,
}: {
  form: OfferFormState;
  reservedServiceIds: string[];
  setForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const formShapeIdsPreview = generatedOfferIds(
    form.providerName,
    form.serviceId,
    reservedServiceIds,
  );
  const [fieldDialog, setFieldDialog] = useState<{
    index: number | null;
    draft: FormFieldDraft;
  } | null>(null);
  const [fieldError, setFieldError] = useState("");

  function setSupportsFormShape(supportsFormShape: boolean) {
    setForm((current) => ({
      ...current,
      supportsFormShape,
      formShape: supportsFormShape ? current.formShape : defaultFormShape(),
      inputSlots: supportsFormShape
        ? withFormInputSlot(current.inputSlots)
        : withoutFormInputSlots(current.inputSlots),
    }));
  }

  function emptyFieldDraft(): FormFieldDraft {
    return {
      key: "",
      label: "",
      type: "text",
      required: false,
      options: [],
      optionsText: "",
    };
  }

  function openFieldDialog(index: number | null) {
    setFieldError("");
    setFieldDialog({
      index,
      draft:
        index == null
          ? emptyFieldDraft()
          : { ...form.formShape.fields[index] },
    });
  }

  function removeField(index: number) {
    setForm((current) => ({
      ...current,
      formShape: {
        ...current.formShape,
        fields: current.formShape.fields.filter(
          (_, fieldIndex) => fieldIndex !== index,
        ),
      },
    }));
  }

  function updateFieldDraft(patch: Partial<FormFieldDraft>) {
    setFieldDialog((current) =>
      current
        ? { ...current, draft: { ...current.draft, ...patch } }
        : current,
    );
  }

  function saveFieldDraft() {
    if (!fieldDialog) {
      return;
    }

    const draft = fieldDialog.draft;
    if (!draft.key.trim() || !draft.label.trim()) {
      setFieldError(t("Field key and label are required."));
      return;
    }
    if (
      (draft.type === "enum" || draft.type === "multi_enum") &&
      splitLines(draft.optionsText).length === 0
    ) {
      setFieldError(t("Enum fields need at least one option."));
      return;
    }

    const nextField: FormFieldDraft = {
      ...draft,
      key: draft.key.trim(),
      label: draft.label.trim(),
      options:
        draft.type === "enum" || draft.type === "multi_enum"
          ? parseOptionsText(draft.optionsText)
          : [],
      optionsText:
        draft.type === "enum" || draft.type === "multi_enum"
          ? draft.optionsText
          : "",
    };

    setForm((current) => ({
      ...current,
      formShape: {
        ...current.formShape,
        fields:
          fieldDialog.index == null
            ? [...current.formShape.fields, nextField]
            : current.formShape.fields.map((field, fieldIndex) =>
                fieldIndex === fieldDialog.index ? nextField : field,
              ),
      },
    }));
    setFieldDialog(null);
  }

  return (
    <Section title="Form input">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="font-heading text-base font-semibold text-foreground">
            {t("Request form")}
          </h3>
          <div className="text-sm text-muted-foreground">
            {form.supportsFormShape
              ? t("Enabled")
              : t("Not requested")}
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <Checkbox
            checked={form.supportsFormShape}
            onCheckedChange={(checked) =>
              setSupportsFormShape(checked === true)
            }
          />
          <span>{t("Support form input")}</span>
        </label>
      </div>
      {!form.supportsFormShape ? null : (
        <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Form shape ID">
          <GeneratedValue value={formShapeIdsPreview?.formShapeId ?? "pgfs_"} />
        </Field>
        <Field label="Form shape version">
          <GeneratedValue value={String(form.formShape.version || 1)} />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {form.formShape.fields.length} {t("fields")}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openFieldDialog(null)}
        >
          <Plus className="h-4 w-4" />
          <span>{t("Add field")}</span>
        </Button>
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
                <TableCell className="min-w-[12rem] font-mono text-sm">
                  {field.key}
                </TableCell>
                <TableCell className="min-w-[12rem]">
                  {field.label}
                </TableCell>
                <TableCell>
                  {t(
                    SUPPORT_SERVICE_FORM_FIELD_TYPES.find(
                      (option) => option.value === field.type,
                    )?.label ?? field.type,
                  )}
                </TableCell>
                <TableCell>
                  {field.required ? (
                    <Badge variant="outline">{t("Required")}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {splitLines(field.optionsText).length || "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openFieldDialog(index)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">{t("Edit")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeField(index)}
                      disabled={
                        field.key === "requested_at" ||
                        field.key === "requested_by"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">{t("Delete")}</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={Boolean(fieldDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setFieldDialog(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {fieldDialog?.index == null
                ? t("Add form field")
                : t("Edit form field")}
            </DialogTitle>
            <DialogDescription>
              {t("Configure one form field for the support service request form.")}
            </DialogDescription>
          </DialogHeader>
          {fieldDialog ? (
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Key">
                  <Input
                    value={fieldDialog.draft.key}
                    onChange={(event) =>
                      updateFieldDraft({ key: event.target.value })
                    }
                    disabled={
                      fieldDialog.draft.key === "requested_at" ||
                      fieldDialog.draft.key === "requested_by"
                    }
                    placeholder="lowercase_key"
                  />
                </Field>
                <Field label="Label">
                  <Input
                    value={fieldDialog.draft.label}
                    onChange={(event) =>
                      updateFieldDraft({ label: event.target.value })
                    }
                  />
                </Field>
                <Field label="Type">
                  <Select
                    value={fieldDialog.draft.type}
                    onValueChange={(type) =>
                      updateFieldDraft({
                        type: type as SupportServiceFormFieldType,
                        optionsText:
                          type === "enum" || type === "multi_enum"
                            ? fieldDialog.draft.optionsText
                            : "",
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
                </Field>
                <label className="flex items-center gap-3 pt-7 text-sm font-medium">
                  <Checkbox
                    checked={fieldDialog.draft.required}
                    onCheckedChange={(checked) =>
                      updateFieldDraft({ required: checked === true })
                    }
                  />
                  <span>{t("Required")}</span>
                </label>
              </div>
              <Field label="Options">
                <Textarea
                  value={fieldDialog.draft.optionsText}
                  onChange={(event) =>
                    updateFieldDraft({ optionsText: event.target.value })
                  }
                  rows={5}
                  disabled={
                    fieldDialog.draft.type !== "enum" &&
                    fieldDialog.draft.type !== "multi_enum"
                  }
                  placeholder="value | Label"
                  className="font-mono text-xs"
                />
              </Field>
              {fieldError ? (
                <p className="text-sm text-destructive">{fieldError}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFieldDialog(null)}
            >
              {t("Cancel")}
            </Button>
            <Button type="button" onClick={saveFieldDraft}>
              {t("Save field")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
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
  const [slotDialog, setSlotDialog] = useState<{
    index: number | null;
    draft: {
      role: string;
      objectType: string;
      required: boolean;
      min: string;
      max: string;
    };
  } | null>(null);
  const [slotError, setSlotError] = useState("");

  function openSlotDialog(index: number | null) {
    const slot = index == null ? null : form.inputSlots[index];
    setSlotError("");
    setSlotDialog({
      index,
      draft: {
        role: slot?.role ?? "",
        objectType:
          (slot ? slotObjectType(slot) : "") ||
          INPUT_OBJECT_OPTIONS[0]?.value ||
          "",
        required: slot?.required ?? false,
        min: String(slot?.cardinality.min ?? 0),
        max: String(slot?.cardinality.max ?? 1),
      },
    });
  }

  function updateSlotDraft(patch: Partial<NonNullable<typeof slotDialog>["draft"]>) {
    setSlotDialog((current) =>
      current
        ? { ...current, draft: { ...current.draft, ...patch } }
        : current,
    );
  }

  function saveSlotDraft() {
    if (!slotDialog) {
      return;
    }

    const min = Number(slotDialog.draft.min);
    const max = Number(slotDialog.draft.max);
    if (!slotDialog.draft.role.trim()) {
      setSlotError(t("Role is required."));
      return;
    }
    if (!slotDialog.draft.objectType) {
      setSlotError(t("Object type is required."));
      return;
    }
    if (slotDialog.draft.objectType === FORM_OBJECT_TYPE) {
      setSlotError(t("Form inputs are managed by Support form input."));
      return;
    }
    if (!Number.isInteger(min) || min < 0 || !Number.isInteger(max) || max < 1 || max < min) {
      setSlotError(t("Cardinality must use valid whole numbers."));
      return;
    }

    const nextSlot: SupportServiceInputSlot = {
      role: slotDialog.draft.role.trim(),
      objectType: slotDialog.draft.objectType,
      acceptedTypes: [slotDialog.draft.objectType],
      required: slotDialog.draft.required,
      cardinality: { min, max },
    };

    setForm((current) => ({
      ...current,
      inputSlots:
        slotDialog.index == null
          ? [...current.inputSlots, nextSlot]
          : current.inputSlots.map((slot, slotIndex) =>
              slotIndex === slotDialog.index ? nextSlot : slot,
            ),
    }));
    setSlotDialog(null);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-base font-semibold">{t("Input slots")}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openSlotDialog(null)}
        >
          <Plus className="h-4 w-4" />
          <span>{t("Add input")}</span>
        </Button>
      </div>
      <div className="overflow-x-auto rounded border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Role")}</TableHead>
              <TableHead>{t("Object type")}</TableHead>
              <TableHead>{t("Cardinality")}</TableHead>
              <TableHead>{t("Required")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {form.inputSlots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  {t("No input slots defined.")}
                </TableCell>
              </TableRow>
            ) : (
              form.inputSlots.map((slot, index) => {
                const isManagedFormSlot = isFormInputSlot(slot);

                return (
                  <TableRow key={`${slot.role}-${index}`}>
                    <TableCell className="font-mono text-sm">
                      {slot.role || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {objectLabel(slotObjectType(slot))}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {slot.cardinality.min}-{slot.cardinality.max}
                    </TableCell>
                    <TableCell>
                      {slot.required ? (
                        <Badge variant="outline">{t("Required")}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isManagedFormSlot}
                          onClick={() => openSlotDialog(index)}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">{t("Edit")}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isManagedFormSlot}
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              inputSlots: current.inputSlots.filter(
                                (_, slotIndex) => slotIndex !== index,
                              ),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">{t("Delete")}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={Boolean(slotDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setSlotDialog(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {slotDialog?.index == null ? t("Add input slot") : t("Edit input slot")}
            </DialogTitle>
            <DialogDescription>
              {t("Each input slot accepts one Pocket Genes object type.")}
            </DialogDescription>
          </DialogHeader>
          {slotDialog ? (
            <div className="grid gap-4">
              <Field label="Role">
                <Input
                  value={slotDialog.draft.role}
                  onChange={(event) =>
                    updateSlotDraft({ role: event.target.value })
                  }
                  placeholder="test_order"
                />
              </Field>
              <Field label="Object type">
                <ObjectTypeSelect
                  value={slotDialog.draft.objectType}
                  onChange={(objectType) => updateSlotDraft({ objectType })}
                  excludeForm
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                <Field label="Min">
                  <Input
                    value={slotDialog.draft.min}
                    onChange={(event) =>
                      updateSlotDraft({ min: event.target.value })
                    }
                    type="number"
                    min={0}
                  />
                </Field>
                <Field label="Max">
                  <Input
                    value={slotDialog.draft.max}
                    onChange={(event) =>
                      updateSlotDraft({ max: event.target.value })
                    }
                    type="number"
                    min={1}
                  />
                </Field>
                <label className="flex items-center gap-3 pt-7 text-sm font-medium">
                  <Checkbox
                    checked={slotDialog.draft.required}
                    onCheckedChange={(checked) =>
                      updateSlotDraft({ required: checked === true })
                    }
                  />
                  <span>{t("Required")}</span>
                </label>
              </div>
              {slotError ? (
                <p className="text-sm text-destructive">{slotError}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSlotDialog(null)}
            >
              {t("Cancel")}
            </Button>
            <Button type="button" onClick={saveSlotDraft}>
              {t("Save input slot")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [slotDialog, setSlotDialog] = useState<{
    index: number | null;
    draft: SupportServiceOutputSlot;
  } | null>(null);
  const [slotError, setSlotError] = useState("");

  function openSlotDialog(index: number | null) {
    const slot = index == null ? null : form.outputSlots[index];
    setSlotError("");
    setSlotDialog({
      index,
      draft: slot
        ? { ...slot }
        : defaultOutputSlot(),
    });
  }

  function updateSlotDraft(patch: Partial<SupportServiceOutputSlot>) {
    setSlotDialog((current) =>
      current
        ? { ...current, draft: { ...current.draft, ...patch } }
        : current,
    );
  }

  function saveSlotDraft() {
    if (!slotDialog) {
      return;
    }
    if (!slotDialog.draft.role.trim()) {
      setSlotError(t("Role is required."));
      return;
    }
    if (!slotDialog.draft.objectType) {
      setSlotError(t("Object type is required."));
      return;
    }
    if (slotDialog.draft.objectType === FORM_OBJECT_TYPE) {
      setSlotError(t("Output slots cannot produce request forms."));
      return;
    }

    const nextSlot: SupportServiceOutputSlot = {
      ...slotDialog.draft,
      role: slotDialog.draft.role.trim(),
    };

    setForm((current) => ({
      ...current,
      outputSlots:
        slotDialog.index == null
          ? [...current.outputSlots, nextSlot]
          : current.outputSlots.map((slot, slotIndex) =>
              slotIndex === slotDialog.index ? nextSlot : slot,
            ),
    }));
    setSlotDialog(null);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-base font-semibold">{t("Output slots")}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openSlotDialog(null)}
        >
          <Plus className="h-4 w-4" />
          <span>{t("Add output")}</span>
        </Button>
      </div>
      <div className="overflow-x-auto rounded border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Role")}</TableHead>
              <TableHead>{t("Object type")}</TableHead>
              <TableHead>{t("Mutation")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {form.outputSlots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  {t("No output slots defined.")}
                </TableCell>
              </TableRow>
            ) : (
              form.outputSlots.map((slot, index) => (
                <TableRow key={`${slot.role}-${index}`}>
                  <TableCell className="font-mono text-sm">
                    {slot.role || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {objectLabel(slot.objectType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t(mutationModeLabel(slot.mutationMode))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openSlotDialog(index)}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">{t("Edit")}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={form.outputSlots.length <= 1}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            outputSlots: current.outputSlots.filter(
                              (_, slotIndex) => slotIndex !== index,
                            ),
                          }))
                        }
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
      <Dialog
        open={Boolean(slotDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setSlotDialog(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {slotDialog?.index == null ? t("Add output slot") : t("Edit output slot")}
            </DialogTitle>
            <DialogDescription>
              {t("Define the object produced or revised by this service offer.")}
            </DialogDescription>
          </DialogHeader>
          {slotDialog ? (
            <div className="grid gap-4">
              <Field label="Role">
                <Input
                  value={slotDialog.draft.role}
                  onChange={(event) =>
                    updateSlotDraft({ role: event.target.value })
                  }
                  placeholder="report"
                />
              </Field>
              <Field label="Object type">
                <ObjectTypeSelect
                  value={slotDialog.draft.objectType}
                  onChange={(objectType) => updateSlotDraft({ objectType })}
                  excludeForm
                />
              </Field>
              <Field label="Mutation">
                <Select
                  value={slotDialog.draft.mutationMode}
                  onValueChange={(mutationMode) =>
                    updateSlotDraft({
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
              {slotError ? (
                <p className="text-sm text-destructive">{slotError}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSlotDialog(null)}
            >
              {t("Cancel")}
            </Button>
            <Button type="button" onClick={saveSlotDraft}>
              {t("Save output slot")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const pricingModel = form.commercialTerms.pricingModel ?? "not_specified";
  const turnaround = turnaroundParts(form.commercialTerms.turnaround);
  const [turnaroundUnitDraft, setTurnaroundUnitDraft] =
    useState<TurnaroundUnit>(turnaround.unit);
  const selectedTurnaroundUnit = turnaround.amount
    ? turnaround.unit
    : turnaroundUnitDraft;

  useEffect(() => {
    if (turnaround.amount) {
      setTurnaroundUnitDraft(turnaround.unit);
    }
  }, [turnaround.amount, turnaround.unit]);

  function updateTerms(
    patch: SupportServiceCommercialTerms,
    options: { clearPrice?: boolean } = {},
  ) {
    setForm((current) => ({
      ...current,
      commercialTerms: {
        ...current.commercialTerms,
        ...patch,
        price: options.clearPrice
          ? undefined
          : patch.price
            ? {
                ...current.commercialTerms.price,
                ...patch.price,
              }
            : current.commercialTerms.price,
      },
    }));
  }

  function updatePricingModel(nextModel: SupportServicePricingModel) {
    if (nextModel === "fixed") {
      updateTerms({
        pricingModel: nextModel,
        price: {
          amount: form.commercialTerms.price?.amount ?? 0,
          currency: form.commercialTerms.price?.currency || "ARS",
        },
      });
      return;
    }

    updateTerms(
      {
        pricingModel: nextModel,
        price:
          nextModel === "not_specified"
            ? { currency: form.commercialTerms.price?.currency || "ARS" }
            : undefined,
      },
      { clearPrice: nextModel !== "not_specified" },
    );
  }

  function updateTurnaround(amount: string, unit: TurnaroundUnit) {
    setTurnaroundUnitDraft(unit);
    updateTerms({
      turnaround: formatTurnaround(amount, unit),
    });
  }

  return (
    <Section title="Commercial terms">
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Pricing">
          <Select
            value={pricingModel}
            onValueChange={(value) =>
              updatePricingModel(value as SupportServicePricingModel)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_specified">{t("Not specified")}</SelectItem>
              <SelectItem value="free">{t("Free")}</SelectItem>
              <SelectItem value="fixed">{t("Fixed price")}</SelectItem>
              <SelectItem value="calculated_after_submission">
                {t("Calculated after submission")}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {pricingModel === "fixed" ? (
          <>
            <Field label="Price amount">
              <Input
                value={form.commercialTerms.price?.amount ?? 0}
                onChange={(event) =>
                  updateTerms({
                    price: {
                      amount: Number(event.target.value),
                    },
                  })
                }
                type="number"
                min={0}
              />
            </Field>
            <Field label="Currency">
              <Select
                value={form.commercialTerms.price?.currency || "ARS"}
                onValueChange={(currency) =>
                  updateTerms({
                    price: { currency },
                  })
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
          </>
        ) : null}
        <Field label="Turnaround">
          <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
            <Input
              value={turnaround.amount}
              onChange={(event) =>
                updateTurnaround(event.target.value, selectedTurnaroundUnit)
              }
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="2"
            />
            <Select
              value={selectedTurnaroundUnit}
              onValueChange={(unit) =>
                updateTurnaround(turnaround.amount, unit as TurnaroundUnit)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TURNAROUND_UNITS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {t(unit.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
    emptyTransactionForm(),
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
        "/admin/support-services/offers?limit=50",
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

  useEffect(() => {
    if (!isEditing && !form.serviceId && liveOffers[0]) {
      setForm(transactionFormForOffer(liveOffers[0]));
    }
  }, [form.serviceId, isEditing, liveOffers]);

  const serviceChoices = useMemo(() => {
    const seen = new Set<string>();
    const choices = liveOffers.map((offer) => ({
      value: offer.serviceId,
      label: `${offer.name} (${offer.serviceId}, ${t(offerStatusLabel(offer.status))})`,
    }));

    if (
      form.serviceId &&
      !choices.some((choice) => choice.value === form.serviceId)
    ) {
      choices.push({
        value: form.serviceId,
        label: `${form.serviceId} (${t("missing active offer")})`,
      });
    }

    return choices.filter((choice) => {
      if (seen.has(choice.value)) {
        return false;
      }
      seen.add(choice.value);
      return true;
    });
  }, [form.serviceId, liveOffers, t]);

  const selectedOffer =
    liveOffers.find((offer) => offer.serviceId === form.serviceId) ?? null;

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
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
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
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
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
      if (!selectedOffer) {
        throw new Error("Choose an existing service offer.");
      }
      saveMutation.mutate(transactionPayloadFromForm(form));
    } catch (error) {
      setToast(mutationErrorToast(error, nextToastId(), t));
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
              <Select
                value={form.serviceId}
                onValueChange={handleServiceChange}
                disabled={serviceChoices.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Choose active service offer")} />
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
              <GeneratedValue value={String(form.serviceVersion || 1)} />
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
          {serviceChoices.length === 0 ? (
            <div className="flex items-center gap-2 rounded border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
              <CircleAlert className="h-4 w-4" />
              <span>{t("No service offers are available for transactions.")}</span>
            </div>
          ) : null}
          {selectedOffer ? (
            <div className="rounded border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">{selectedOffer.name}</div>
              <div>{selectedOffer.shortContract}</div>
            </div>
          ) : null}
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
  saveLabel = "Save",
}: {
  title: string;
  backHref: string;
  backLabel: string;
  isSaving: boolean;
  canDelete: boolean;
  onDelete: () => void;
  saveLabel?: string;
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
          <span>{isSaving ? t("Saving...") : t(saveLabel)}</span>
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

function GeneratedValue({ value }: { value: string }) {
  return (
    <div className="flex min-h-10 items-center rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm text-muted-foreground">
      {value}
    </div>
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
  excludeForm = false,
}: {
  value: string;
  onChange: (value: string) => void;
  excludeForm?: boolean;
}) {
  const options = excludeForm
    ? OUTPUT_OBJECT_OPTIONS
    : POCKET_GENES_OBJECT_OPTIONS;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((object) => (
          <SelectItem key={object.value} value={object.value}>
            {object.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
