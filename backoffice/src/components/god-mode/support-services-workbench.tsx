"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Binary,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  FileText,
  Filter,
  FlaskConical,
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
  type SupportServiceOfferSnapshot,
  type SupportServiceOfferStatus,
  type SupportServiceOffersPage,
  type SupportServiceOutputSlot,
  type SupportServicePricingModel,
  type SupportServiceProviderKind,
  type SupportServiceProviderSnapshot,
  type SupportServiceStage,
  type SupportServiceTransactionInput,
  type SupportServiceTransactionRecord,
  type SupportServiceTransactionSlot,
  type SupportServiceTransactionStatus,
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
  isHiddenFromSearch: boolean;
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
  objectType: string;
  objectSnapshotText: string;
  objectCode: string;
  uploadedObjectId: string;
  fileStorageId: string;
  objectOwnerId: string;
  required: boolean;
  acceptedTypes: string[];
};

type OutputObjectDraft = {
  role: string;
  objectType: string;
  objectCode: string;
  fileName?: string;
  downloadUrl?: string;
};

type OutputObjectUploadDraft = {
  index: number;
  role: string;
  objectType: string;
  fileName: string;
  downloadUrl: string;
};

type CreatedOutputObject = {
  id: string;
  role: string;
  objectCode: string;
  objectType: string;
  fileName: string;
  downloadUrl: string;
  status: "ready";
};

type TransactionFormState = {
  requestId: string;
  offerId: string;
  serviceId: string;
  serviceVersion: number;
  providerId: string;
  providerKind: SupportServiceProviderKind;
  status: NonNullable<SupportServiceTransactionInput["status"]>;
  requestedByUserId: string;
  requestedByUserEmail: string;
  requestedAt: string;
  requestedAtClient: string;
  requestRevision: number;
  idempotencyKey: string;
  inputs: ObjectRefDraft[];
  outputObjects: OutputObjectDraft[];
  outputReportCodesText: string;
  issuesText: string;
  missingRequiredInputRoles: string[];
  offerSnapshot: SupportServiceOfferSnapshot;
  providerSnapshot: SupportServiceProviderSnapshot;
  contractSource: string;
  attachmentsPending: boolean;
};

type ServiceOfferPublishDialogState = {
  status: "publishing" | "success" | "error";
  offerId?: string;
  message?: string;
};

const SERVICE_PAGE_SIZE = 20;
const PROVIDER_OFFER_LOOKUP_LIMIT = 50;
const OFFERS_QUERY_KEY = "god-mode-support-service-offers";
const TRANSACTIONS_QUERY_KEY = "god-mode-support-service-transactions";
const LIVE_OFFERS_QUERY_KEY = "god-mode-support-service-offers-live-picker";
const EMPTY_SUPPORT_SERVICE_OFFERS: SupportServiceOfferRecord[] = [];
const FORM_OBJECT_TYPE = "pgo_form";
const DEFAULT_OUTPUT_OBJECT_TYPE = "pgo_pdf_report";
const TERMINAL_TRANSACTION_STATUSES: ReadonlySet<SupportServiceTransactionStatus> =
  new Set(["delivered", "rejected", "failed", "cancelled"]);
const ALLOWED_TRANSACTION_STATUS_TRANSITIONS: Record<
  Exclude<
    SupportServiceTransactionStatus,
    "delivered" | "rejected" | "failed" | "cancelled"
  >,
  ReadonlySet<SupportServiceTransactionStatus>
> = {
  received: new Set([
    "validating",
    "awaiting_input",
    "accepted",
    "rejected",
    "failed",
    "cancelled",
  ]),
  validating: new Set([
    "awaiting_input",
    "accepted",
    "rejected",
    "failed",
    "cancelled",
  ]),
  awaiting_input: new Set([
    "validating",
    "accepted",
    "rejected",
    "failed",
    "cancelled",
  ]),
  accepted: new Set([
    "awaiting_input",
    "queued",
    "running",
    "rejected",
    "failed",
    "cancelled",
  ]),
  queued: new Set(["awaiting_input", "running", "failed", "cancelled"]),
  running: new Set(["awaiting_input", "delivered", "failed", "cancelled"]),
};
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
const STAGE_ORDER: SupportServiceStage[] = SUPPORT_SERVICE_STAGES.map(
  (stage) => stage.value,
);
const TEST_PLANNING_OUTPUT_OBJECTS = new Set([
  "pgo_bundle_of_symptoms",
  "pgo_bundle_of_candidate_genes",
  "pgo_informed_consent",
  "pgo_test_order",
]);
const WET_LAB_OUTPUT_OBJECTS = new Set([
  "pgo_collection_request",
  "pgo_blood_sample",
  "pgo_tissue_sample",
  "pgo_embryo_sample",
  "pgo_dna_sample",
  "pgo_sequence_reads",
  "pgo_sequence_data",
]);
const BIOINFORMATICS_OUTPUT_OBJECTS = new Set([
  "pgo_aligned_reads",
  "pgo_unannotated_vcf",
  "pgo_annotated_vcf",
  "pgo_interactive_report",
  "pgo_karyotype_result",
  "pgo_flow_cytometry_data",
]);
const TEST_PLANNING_CONTEXT_OBJECTS = new Set([
  "pgo_bundle_of_symptoms",
  "pgo_bundle_of_candidate_genes",
  "pgo_informed_consent",
]);
const WET_LAB_CONTEXT_OBJECTS = new Set([
  "pgo_collection_request",
  "pgo_blood_sample",
  "pgo_tissue_sample",
  "pgo_embryo_sample",
  "pgo_dna_sample",
]);
const BIOINFORMATICS_CONTEXT_OBJECTS = new Set([
  "pgo_sequence_reads",
  "pgo_sequence_data",
  "pgo_aligned_reads",
  "pgo_unannotated_vcf",
  "pgo_annotated_vcf",
  "pgo_interactive_report",
  "pgo_karyotype_result",
  "pgo_flow_cytometry_data",
]);

const SUPPORT_SERVICE_PANEL_CLASS =
  "overflow-hidden rounded-2xl border border-violet-100/80 bg-white/92 shadow-[0_22px_62px_-46px_rgba(109,40,217,0.46)] dark:border-violet-400/16 dark:bg-slate-950/50";
const SUPPORT_SERVICE_FORM_CLASS = cn(
  SUPPORT_SERVICE_PANEL_CLASS,
  "[&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-xl [&_[data-slot=input]]:border-violet-200/75 [&_[data-slot=input]]:bg-white/90 [&_[data-slot=input]]:px-4 [&_[data-slot=input]]:shadow-sm [&_[data-slot=input]]:focus-visible:border-violet-400 [&_[data-slot=input]]:focus-visible:ring-violet-300/35 dark:[&_[data-slot=input]]:border-violet-400/18 dark:[&_[data-slot=input]]:bg-slate-950/45",
  "[&_[data-slot=textarea]]:rounded-xl [&_[data-slot=textarea]]:border-violet-200/75 [&_[data-slot=textarea]]:bg-white/90 [&_[data-slot=textarea]]:px-4 [&_[data-slot=textarea]]:py-3 [&_[data-slot=textarea]]:shadow-sm [&_[data-slot=textarea]]:focus-visible:border-violet-400 [&_[data-slot=textarea]]:focus-visible:ring-violet-300/35 dark:[&_[data-slot=textarea]]:border-violet-400/18 dark:[&_[data-slot=textarea]]:bg-slate-950/45",
  "[&_[data-slot=select-trigger]]:h-11 [&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:rounded-xl [&_[data-slot=select-trigger]]:border-violet-200/75 [&_[data-slot=select-trigger]]:bg-white/90 [&_[data-slot=select-trigger]]:px-4 [&_[data-slot=select-trigger]]:shadow-sm [&_[data-slot=select-trigger]]:focus-visible:border-violet-400 [&_[data-slot=select-trigger]]:focus-visible:ring-violet-300/35 dark:[&_[data-slot=select-trigger]]:border-violet-400/18 dark:[&_[data-slot=select-trigger]]:bg-slate-950/45",
);
const SUPPORT_SERVICE_HEADER_CLASS =
  "border-b border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.90)_54%,rgba(240,249,255,0.72))] px-5 py-4 dark:border-violet-400/14 dark:bg-[linear-gradient(145deg,rgba(30,24,57,0.94),rgba(12,35,54,0.68))]";
const SUPPORT_SERVICE_SECTION_CLASS =
  "mx-4 my-6 grid gap-6 rounded-2xl border border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(250,250,255,0.94)_58%,rgba(245,243,255,0.86))] px-4 py-5 shadow-[0_18px_56px_-48px_rgba(109,40,217,0.48)] dark:border-violet-400/16 dark:bg-[linear-gradient(145deg,rgba(18,23,40,0.94),rgba(30,24,57,0.86))] lg:mx-6 lg:px-6 lg:py-6";
const SUPPORT_SERVICE_SUBSECTION_CLASS =
  "grid gap-4 rounded-2xl border border-violet-100/70 bg-white/70 p-4 shadow-sm dark:border-violet-400/14 dark:bg-slate-950/36";
const SUPPORT_SERVICE_SUBSECTION_TITLE_CLASS =
  "text-xs font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200";
const SUPPORT_SERVICE_SOFT_BUTTON_CLASS =
  "h-9 rounded-xl border-violet-200/80 bg-white/78 px-3 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50 dark:hover:bg-violet-500/18";
const SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS =
  "h-9 rounded-xl bg-violet-600 px-4 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700";
const SUPPORT_SERVICE_TABLE_SHELL_CLASS =
  "overflow-x-auto rounded-2xl border border-violet-100/80 bg-white/80 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42";

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

function inputRoleForObjectType(objectType: string) {
  return objectType.replace(/^pgo_/, "") || "input";
}

function withFormInputSlot(slots: SupportServiceInputSlot[]) {
  return slots.some(isFormInputSlot)
    ? slots
    : [defaultFormInputSlot(), ...slots];
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
    isHiddenFromSearch: false,
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

function singleInputSlot(
  slot: SupportServiceInputSlot,
): SupportServiceInputSlot {
  const objectType = slot.objectType || slot.acceptedTypes[0] || "";
  const isFormSlot = objectType === FORM_OBJECT_TYPE;

  return {
    ...slot,
    role: isFormSlot ? "form" : inputRoleForObjectType(objectType),
    objectType,
    acceptedTypes: objectType ? [objectType] : [],
    required: true,
    cardinality: { min: 1, max: 1 },
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
    isHiddenFromSearch: catalogOffer.isHiddenFromSearch,
    description: catalogOffer.description,
    providerWork: catalogOffer.providerWork,
    supportsFormShape: hasFormShape,
    formShape: hasFormShape
      ? {
          id: catalogOffer.formShape.id,
          version: catalogOffer.formShape.version,
          allowUnknownFields: Boolean(
            catalogOffer.formShape.allowUnknownFields,
          ),
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
        catalogOffer.commercialTerms.pricingModel ?? "not_specified",
      price: { ...catalogOffer.commercialTerms.price },
      turnaround: catalogOffer.commercialTerms.turnaround,
    },
  };
}

function offerFormFromRecord(
  record: SupportServiceOfferRecord,
): OfferFormState {
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
    isHiddenFromSearch: record.isHiddenFromSearch,
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

function isSupportServiceStage(value: string): value is SupportServiceStage {
  return STAGE_ORDER.includes(value as SupportServiceStage);
}

function sortedStages(stages: SupportServiceStage[]) {
  return STAGE_ORDER.filter((stage) => stages.includes(stage));
}

function sameStages(left: SupportServiceStage[], right: SupportServiceStage[]) {
  const sortedLeft = sortedStages(left);
  const sortedRight = sortedStages(right);

  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((stage, index) => stage === sortedRight[index])
  );
}

function catalogStagesForObject(objectType: string) {
  return (
    POCKET_GENES_OBJECT_OPTIONS.find(
      (object) => object.value === objectType,
    )?.stages.filter(isSupportServiceStage) ?? []
  );
}

function outputStageHints(
  objectType: string,
  inputTypes: string[],
): SupportServiceStage[] {
  if (!objectType || objectType === FORM_OBJECT_TYPE) {
    return [];
  }

  if (objectType.startsWith("same_as:")) {
    return inputTypes.some((inputType) =>
      WET_LAB_CONTEXT_OBJECTS.has(inputType),
    )
      ? ["wet_lab"]
      : [];
  }

  if (TEST_PLANNING_OUTPUT_OBJECTS.has(objectType)) {
    return ["test_planning"];
  }

  if (WET_LAB_OUTPUT_OBJECTS.has(objectType)) {
    return ["wet_lab"];
  }

  if (BIOINFORMATICS_OUTPUT_OBJECTS.has(objectType)) {
    return ["bioinformatics"];
  }

  if (objectType === DEFAULT_OUTPUT_OBJECT_TYPE) {
    if (
      inputTypes.some((inputType) =>
        BIOINFORMATICS_CONTEXT_OBJECTS.has(inputType),
      )
    ) {
      return ["bioinformatics"];
    }

    if (
      inputTypes.some((inputType) => WET_LAB_CONTEXT_OBJECTS.has(inputType))
    ) {
      return ["wet_lab"];
    }

    return ["test_planning"];
  }

  const catalogStages = catalogStagesForObject(objectType);
  return catalogStages.length === 1 ? catalogStages : [];
}

function inputStageHints(objectType: string): SupportServiceStage[] {
  if (!objectType || objectType === FORM_OBJECT_TYPE) {
    return [];
  }

  if (BIOINFORMATICS_CONTEXT_OBJECTS.has(objectType)) {
    return ["bioinformatics"];
  }

  if (WET_LAB_CONTEXT_OBJECTS.has(objectType)) {
    return ["wet_lab"];
  }

  if (TEST_PLANNING_CONTEXT_OBJECTS.has(objectType)) {
    return ["test_planning"];
  }

  const catalogStages = catalogStagesForObject(objectType);
  return catalogStages.length === 1 ? catalogStages : [];
}

function predictedStagesForContract(
  inputSlots: SupportServiceInputSlot[],
  outputSlots: SupportServiceOutputSlot[],
): SupportServiceStage[] {
  const inputTypes = inputSlots
    .map(slotObjectType)
    .filter((objectType) => objectType && objectType !== FORM_OBJECT_TYPE);
  const outputTypes = outputSlots
    .map((slot) => slot.objectType)
    .filter((objectType) => objectType && objectType !== FORM_OBJECT_TYPE);
  const predicted = new Set<SupportServiceStage>();

  for (const objectType of outputTypes) {
    for (const stage of outputStageHints(objectType, inputTypes)) {
      predicted.add(stage);
    }
  }

  if (predicted.size === 0) {
    for (const objectType of inputTypes) {
      for (const stage of inputStageHints(objectType)) {
        predicted.add(stage);
      }
    }
  }

  return sortedStages(
    predicted.size ? Array.from(predicted) : ["test_planning"],
  );
}

function contractObjectLabel(value: string) {
  if (value.startsWith("same_as:")) {
    return value;
  }
  return objectLabel(value).replace(/^Pocket Genes /, "");
}

function sameIdentityObjectType(role: string) {
  return `same_as:${role}`;
}

function outputObjectLabel(slot: SupportServiceOutputSlot) {
  if (slot.objectType.startsWith("same_as:")) {
    const sourceRole =
      slot.sameIdentityAsInput ?? slot.objectType.replace(/^same_as:/, "");
    return `same_as:${sourceRole}`;
  }

  return objectLabel(slot.objectType);
}

function bindingTypeLabel(type: string) {
  return type.startsWith("same_as:") ? type : objectLabel(type);
}

function outputRevisionSourceRoles(inputSlots: SupportServiceInputSlot[]) {
  return inputSlots
    .filter((slot) => slotObjectType(slot) !== FORM_OBJECT_TYPE)
    .map((slot) => slot.role)
    .filter(Boolean);
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
  const left = inputs.length ? inputs.join(" + ") : "none";
  const right = outputs.length ? outputs.join(" + ") : "provider output";

  return `${left} -> ${right}`;
}

function serviceOfferStatusDescription(
  status: SupportServiceOfferStatus,
  t: (text: string) => string,
) {
  if (status === "active") {
    return t(
      "Active service offers are published and can be selected by new service transactions.",
    );
  }

  if (status === "inactive") {
    return t(
      "Inactive service offers stay saved, but should not receive new transaction requests until they are published again.",
    );
  }

  if (status === "archived") {
    return t(
      "Archived service offers stay available for audit and historical transactions, but are removed from normal operation.",
    );
  }

  return t(
    "Draft service offers stay private while the contract is still being shaped. Publish when the service is ready to receive transactions.",
  );
}

function serviceOfferStatusBadgeClass(status: SupportServiceOfferStatus) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/24 dark:bg-emerald-500/12 dark:text-emerald-200";
  }

  if (status === "inactive") {
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

function emptyObjectRefDraft(slot: SupportServiceInputSlot): ObjectRefDraft {
  const objectType = slotObjectType(slot);
  return {
    role: slot.role,
    objectId: "",
    revision: "1",
    objectType,
    objectSnapshotText: "",
    objectCode: "",
    uploadedObjectId: "",
    fileStorageId: "",
    objectOwnerId: "",
    required: slot.required,
    acceptedTypes: [objectType].filter(Boolean),
  };
}

function outputObjectDraft(
  slot: SupportServiceOutputSlot,
  inputSlots: SupportServiceInputSlot[],
): OutputObjectDraft {
  const inputRole =
    slot.sameIdentityAsInput || slot.objectType.replace(/^same_as:/, "");
  const inputType = inputSlots.find(
    (input) => input.role === inputRole,
  )?.objectType;
  return {
    role: slot.role,
    objectType: slot.objectType.startsWith("same_as:")
      ? inputType || ""
      : slot.objectType,
    objectCode: "",
  };
}

function offerSnapshotFromOffer(
  offer: SupportServiceOfferRecord,
): SupportServiceOfferSnapshot {
  return {
    offerId: offer.id,
    schemaVersion: offer.schemaVersion,
    serviceId: offer.serviceId,
    serviceVersion: offer.serviceVersion,
    name: offer.name,
    status: offer.status,
    isHiddenFromSearch: offer.isHiddenFromSearch,
    serviceCategory: offer.serviceCategory,
    providerId: offer.providerId,
    providerKind: offer.providerKind,
    providerName: offer.providerName,
    description: offer.description,
    providerWork: offer.providerWork,
    shortContract: offer.shortContract,
    stages: [...offer.stages],
    formShape: offer.formShape
      ? {
          ...offer.formShape,
          fields: offer.formShape.fields.map((field) => ({
            ...field,
            options: field.options?.map((option) => ({ ...option })),
          })),
        }
      : undefined,
    inputSlots: offer.inputSlots.map((slot) => ({ ...slot })),
    outputSlots: offer.outputSlots.map((slot) => ({ ...slot })),
    acceptedConditions: [...offer.acceptedConditions],
    scopeRules: [...offer.scopeRules],
    commercialTerms: offer.commercialTerms,
  };
}

function providerSnapshotFromOffer(
  offer: SupportServiceOfferRecord,
): SupportServiceProviderSnapshot {
  return {
    id: offer.providerId,
    kind: offer.providerKind,
    name: offer.providerName,
  };
}

function transactionIdempotencyKey(requestId: string) {
  return `${requestId}:backoffice`;
}

function transactionInputDraft(
  input: SupportServiceTransactionSlot,
  contractSlot?: SupportServiceInputSlot,
): ObjectRefDraft {
  const objectSnapshot =
    input.objectSnapshot &&
    typeof input.objectSnapshot === "object" &&
    !Array.isArray(input.objectSnapshot)
      ? input.objectSnapshot
      : {};
  const objectType =
    input.objectType ||
    slotObjectType(
      contractSlot ?? {
        role: input.role,
        acceptedTypes: [],
        required: true,
        cardinality: { min: 1, max: 1 },
      },
    );

  return {
    role: input.role,
    objectId: input.objectRef.objectId,
    revision: String(input.objectRef.revision),
    objectType,
    objectSnapshotText: JSON.stringify(objectSnapshot, null, 2),
    objectCode: input.objectCode ?? "",
    uploadedObjectId: input.uploadedObjectId ?? "",
    fileStorageId: input.fileStorageId ?? "",
    objectOwnerId: input.objectOwnerId ?? "",
    required: contractSlot?.required ?? true,
    acceptedTypes: contractSlot?.acceptedTypes?.length
      ? [...contractSlot.acceptedTypes]
      : objectType
        ? [objectType]
        : [],
  };
}

function emptyTransactionForm(): TransactionFormState {
  return {
    requestId: "pgr_",
    offerId: "",
    serviceId: "",
    serviceVersion: 1,
    providerId: "",
    providerKind: "organization",
    status: "received",
    requestedByUserId: "",
    requestedByUserEmail: "",
    requestedAt: "",
    requestedAtClient: "",
    requestRevision: 1,
    idempotencyKey: "",
    inputs: [],
    outputObjects: [],
    outputReportCodesText: "",
    issuesText: "[]",
    missingRequiredInputRoles: [],
    offerSnapshot: {},
    providerSnapshot: { id: "", kind: "organization", name: "" },
    contractSource: "service_offer",
    attachmentsPending: false,
  };
}

function transactionFormForOffer(
  offer: SupportServiceOfferRecord,
): TransactionFormState {
  const inputSlots = offer.inputSlots ?? [];
  const outputSlots = offer.outputSlots ?? [];
  const requestId = makeRequestId(offer.serviceId);

  return {
    requestId,
    offerId: offer.id,
    serviceId: offer.serviceId,
    serviceVersion: offer.serviceVersion,
    providerId: offer.providerId,
    providerKind: offer.providerKind,
    status: "received",
    requestedByUserId: "",
    requestedByUserEmail: "",
    requestedAt: "",
    requestedAtClient: new Date().toISOString(),
    requestRevision: 1,
    idempotencyKey: transactionIdempotencyKey(requestId),
    inputs: inputSlots.map(emptyObjectRefDraft),
    outputObjects: outputSlots.map((slot) =>
      outputObjectDraft(slot, inputSlots),
    ),
    outputReportCodesText: "",
    issuesText: "[]",
    missingRequiredInputRoles: inputSlots
      .filter((slot) => slot.required)
      .map((slot) => slot.role),
    offerSnapshot: offerSnapshotFromOffer(offer),
    providerSnapshot: providerSnapshotFromOffer(offer),
    contractSource: "service_offer",
    attachmentsPending: inputSlots.some((slot) => slot.required),
  };
}

function transactionFormForOfferId(
  offerId: string,
  offers: SupportServiceOfferRecord[],
): TransactionFormState {
  const offer = offers.find((candidate) => candidate.id === offerId);
  return offer
    ? transactionFormForOffer(offer)
    : {
        ...emptyTransactionForm(),
        offerId,
      };
}

function transactionFormFromRecord(
  record: SupportServiceTransactionRecord,
): TransactionFormState {
  const snapshotInputSlots = Array.isArray(record.offerSnapshot?.inputSlots)
    ? record.offerSnapshot.inputSlots
    : [];
  const snapshotOutputSlots = Array.isArray(record.offerSnapshot?.outputSlots)
    ? record.offerSnapshot.outputSlots
    : [];
  const contractInputSlots = snapshotInputSlots;
  const contractOutputSlots = snapshotOutputSlots;
  const recordInputs = Array.isArray(record.inputs) ? record.inputs : [];
  const recordOutputObjects = Array.isArray(record.outputObjects)
    ? record.outputObjects
    : [];
  const inputByRole = new Map(recordInputs.map((slot) => [slot.role, slot]));
  const outputByRole = new Map(
    recordOutputObjects.map((output) => [output.role, output]),
  );
  const contractInputRoles = new Set(
    contractInputSlots.map((slot) => slot.role),
  );
  const inputs = [
    ...contractInputSlots.map((slot) => {
      const existing = inputByRole.get(slot.role);
      return existing
        ? transactionInputDraft(existing, slot)
        : emptyObjectRefDraft(slot);
    }),
    ...recordInputs
      .filter((slot) => !contractInputRoles.has(slot.role))
      .map((slot) => transactionInputDraft(slot)),
  ];
  const outputObjects = contractOutputSlots.map((slot) => {
    const existing = outputByRole.get(slot.role);
    return existing
      ? {
          role: existing.role,
          objectType: existing.objectType,
          objectCode: existing.objectCode,
        }
      : outputObjectDraft(slot, contractInputSlots);
  });

  const providerSnapshot = record.providerSnapshot ?? {
    id: record.providerId,
    kind: record.providerKind,
    name: "",
  };

  return {
    requestId: record.requestId,
    offerId: record.offerId ?? "",
    serviceId: record.serviceId,
    serviceVersion: record.serviceVersion,
    providerId: record.providerId ?? providerSnapshot.id ?? "",
    providerKind:
      record.providerKind ?? providerSnapshot.kind ?? "organization",
    status: record.status,
    requestedByUserId: record.requestedByUserId ?? "",
    requestedByUserEmail: record.requestedByUserEmail ?? "",
    requestedAt: record.requestedAt ?? "",
    requestedAtClient:
      record.requestedAtClient ?? record.requestedAt ?? record.createdAt ?? "",
    requestRevision: record.requestRevision ?? 1,
    idempotencyKey:
      record.idempotencyKey ?? transactionIdempotencyKey(record.requestId),
    inputs,
    outputObjects,
    outputReportCodesText: (record.outputReports ?? [])
      .map((report) => report.reportCode)
      .join("\n"),
    issuesText: JSON.stringify(record.issues ?? [], null, 2),
    missingRequiredInputRoles: record.missingRequiredInputRoles ?? [],
    offerSnapshot: record.offerSnapshot ?? {},
    providerSnapshot,
    contractSource: record.contractSource ?? "service_offer",
    attachmentsPending: Boolean(record.attachmentsPending),
  };
}

function transactionEditableFingerprint(form: TransactionFormState) {
  return JSON.stringify({
    status: form.status,
    inputs: form.inputs,
    outputReportCodesText: form.outputReportCodesText,
    issuesText: form.issuesText,
    missingRequiredInputRoles: form.missingRequiredInputRoles,
    attachmentsPending: form.attachmentsPending,
  });
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

function parseJsonObject(value: string, label: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be a valid JSON object.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a valid JSON object.`);
  }
  if (Object.keys(parsed).length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArray(value: string, label: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be a valid JSON array.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a valid JSON array.`);
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

  const seenInputTypes = new Set<string>();
  for (const slot of form.inputSlots) {
    const objectType = slotObjectType(slot);
    if (!objectType) {
      throw new Error("Every input slot needs one object type.");
    }
    if (seenInputTypes.has(objectType)) {
      throw new Error("This input type is already added.");
    }
    seenInputTypes.add(objectType);
  }
  for (const slot of form.outputSlots) {
    if (!slot.role.trim() || !slot.objectType) {
      throw new Error("Every output slot needs a role and object type.");
    }
    if (slot.mutationMode === "new_revision") {
      if (!slot.sameIdentityAsInput) {
        throw new Error("New revision outputs need a source input role.");
      }
      const sourceInputSlot = form.inputSlots.find(
        (inputSlot) => inputSlot.role === slot.sameIdentityAsInput,
      );
      if (!sourceInputSlot) {
        throw new Error(
          "New revision outputs must reference an existing input role.",
        );
      }
      if (slotObjectType(sourceInputSlot) === FORM_OBJECT_TYPE) {
        throw new Error(
          "New revision outputs cannot revise the request form input.",
        );
      }
      if (
        slot.objectType !== sameIdentityObjectType(slot.sameIdentityAsInput)
      ) {
        throw new Error("New revision outputs must use same_as:<input_role>.");
      }
    } else if (
      slot.sameIdentityAsInput ||
      slot.objectType.startsWith("same_as:")
    ) {
      throw new Error("same_as outputs must use New revision.");
    } else if (slot.objectType === FORM_OBJECT_TYPE) {
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
    isHiddenFromSearch: form.isHiddenFromSearch,
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
    inputSlots: form.inputSlots.map((slot) => {
      const objectType = slotObjectType(slot);
      const isFormSlot = objectType === FORM_OBJECT_TYPE;

      return {
        ...slot,
        role: isFormSlot ? "form" : inputRoleForObjectType(objectType),
        objectType,
        acceptedTypes: [objectType],
        required: true,
        cardinality: { min: 1, max: 1 },
      };
    }),
    outputSlots: form.outputSlots.map((slot) => {
      const sameIdentityAsInput =
        slot.mutationMode === "new_revision"
          ? slot.sameIdentityAsInput
          : undefined;

      return {
        role: slot.role.trim(),
        objectType: sameIdentityAsInput
          ? sameIdentityObjectType(sameIdentityAsInput)
          : slot.objectType,
        mutationMode: slot.mutationMode,
        sameIdentityAsInput,
      };
    }),
    acceptedConditions: acceptedConditions.length
      ? acceptedConditions
      : undefined,
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

  const priceSummary = terms.price?.summary?.trim();

  return {
    pricingModel,
    price: priceSummary ? { summary: priceSummary } : undefined,
    turnaround,
  };
}

function transactionPayloadFromForm(
  form: TransactionFormState,
): SupportServiceTransactionInput {
  assertIdentifier(form.requestId, "pgr", "Request ID");
  assertIdentifier(form.serviceId, "pgs", "Service ID");
  if (!form.offerId.trim()) {
    throw new Error("Offer ID is required.");
  }
  if (!form.providerId.trim()) {
    throw new Error("Provider ID is required.");
  }
  if (!form.requestedByUserId.trim()) {
    throw new Error("Requester user ID is required.");
  }
  if (!form.requestedAtClient.trim()) {
    throw new Error("Client request timestamp is required.");
  }
  if (!form.idempotencyKey.trim()) {
    throw new Error("Idempotency key is required.");
  }
  if (!form.contractSource.trim()) {
    throw new Error("Contract source is required.");
  }
  const requiredInputs = form.inputs.filter((slot) => slot.required);
  const missingRequiredInputRoles = requiredInputs
    .filter((slot) => !slot.objectId.trim())
    .map((slot) => slot.role);
  for (const slot of requiredInputs) {
    if (
      !slot.objectId.trim() &&
      slot.acceptedTypes.includes(FORM_OBJECT_TYPE)
    ) {
      throw new Error(
        `Input ${slot.role} is required before creating the transaction.`,
      );
    }
  }

  const inputs = form.inputs
    .filter((slot) => slot.objectId.trim())
    .map((slot) => {
      assertIdentifier(slot.objectId, "obj", `Input ${slot.role} object ID`);
      if (!/^pgo_[a-z0-9_]+$/.test(slot.objectType)) {
        throw new Error(`Input ${slot.role} needs a concrete PGO object type.`);
      }
      const objectId = slot.objectId.trim();
      const revision = assertPositiveInteger(
        slot.revision,
        `Input ${slot.role} revision`,
      );
      const objectSnapshot = parseJsonObject(
        slot.objectSnapshotText,
        `Input ${slot.role} object snapshot`,
      );
      if (objectSnapshot.objectId !== objectId) {
        throw new Error(
          `Input ${slot.role} object snapshot must match its object ID.`,
        );
      }
      if (objectSnapshot.objectType !== slot.objectType) {
        throw new Error(
          `Input ${slot.role} object snapshot must match its object type.`,
        );
      }
      if (objectSnapshot.revision !== revision) {
        throw new Error(
          `Input ${slot.role} object snapshot must match its revision.`,
        );
      }
      const input: SupportServiceTransactionSlot = {
        role: slot.role,
        objectRef: {
          objectId,
          revision,
        },
        objectType: slot.objectType,
        objectSnapshot,
      };

      if (slot.objectType === FORM_OBJECT_TYPE) {
        const objectCode = slot.objectCode.trim();
        if (!/^\d{9}$/.test(objectCode)) {
          throw new Error(`Input ${slot.role} needs a 9-digit object code.`);
        }
        if (
          !slot.uploadedObjectId.trim() ||
          !slot.fileStorageId.trim() ||
          !slot.objectOwnerId.trim()
        ) {
          throw new Error(
            `Input ${slot.role} needs uploaded object, file storage, and object owner IDs.`,
          );
        }
        input.objectCode = objectCode;
        input.uploadedObjectId = slot.uploadedObjectId.trim();
        input.fileStorageId = slot.fileStorageId.trim();
        input.objectOwnerId = slot.objectOwnerId.trim();
      } else {
        if (slot.objectCode.trim()) {
          input.objectCode = slot.objectCode.trim();
        }
        if (slot.uploadedObjectId.trim()) {
          input.uploadedObjectId = slot.uploadedObjectId.trim();
        }
        if (slot.fileStorageId.trim()) {
          input.fileStorageId = slot.fileStorageId.trim();
        }
        if (slot.objectOwnerId.trim()) {
          input.objectOwnerId = slot.objectOwnerId.trim();
        }
      }

      return input;
    });
  const outputObjects = form.outputObjects
    .filter((output) => output.objectCode.trim())
    .map((output) => {
      const objectCode = output.objectCode.trim();
      if (!/^\d{9}$/.test(objectCode)) {
        throw new Error(`Output ${output.role} needs a 9-digit object code.`);
      }
      if (!/^pgo_[a-z0-9_]+$/.test(output.objectType)) {
        throw new Error(
          `Output ${output.role} needs a concrete PGO object type.`,
        );
      }
      return {
        role: output.role,
        objectType: output.objectType,
        objectCode,
      };
    });
  const outputReports = form.outputReportCodesText
    .split(/[\s,]+/)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
    .map((reportCode) => {
      if (!/^[A-Z0-9]{6}$/.test(reportCode)) {
        throw new Error(
          "Optional report codes must contain exactly 6 letters or digits.",
        );
      }
      return { reportCode };
    });

  if (
    form.status === "delivered" &&
    outputObjects.length !== form.outputObjects.length
  ) {
    throw new Error(
      "Delivered transactions need one uploaded object code for every promised output.",
    );
  }

  return {
    requestId: form.requestId.trim(),
    offerId: form.offerId.trim(),
    serviceId: form.serviceId.trim(),
    serviceVersion: form.serviceVersion || 1,
    providerId: form.providerId.trim(),
    providerKind: form.providerKind,
    requestedByUserId: form.requestedByUserId.trim(),
    requestedByUserEmail: form.requestedByUserEmail.trim() || undefined,
    requestedAt: form.requestedAt.trim() || undefined,
    requestedAtClient: form.requestedAtClient.trim(),
    status: form.status,
    requestRevision: form.requestRevision || 1,
    idempotencyKey: form.idempotencyKey.trim(),
    inputs,
    outputObjects,
    outputReports,
    issues: parseJsonArray(form.issuesText, "Issues"),
    missingRequiredInputRoles,
    offerSnapshot: form.offerSnapshot,
    providerSnapshot: form.providerSnapshot,
    contractSource: form.contractSource.trim(),
    attachmentsPending: missingRequiredInputRoles.length > 0,
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

function buildListPath(
  kind: WorkbenchKind,
  filters: ServiceFilters,
  cursor: string,
) {
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
      return sdkFetch<
        SupportServiceOffersPage | SupportServiceTransactionsPage
      >(buildListPath(kind, filters, cursor));
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
      "name" in record
        ? record.name
        : (record as SupportServiceTransactionRecord).requestId;
    if (!window.confirm(`${t("Delete")} ${label}?`)) {
      return;
    }
    deleteMutation.mutate(record);
  }

  const title = isOffers ? "Service Offers" : "Service Transactions";
  const createLabel = isOffers
    ? "Alta de service offer"
    : "Alta de transaccion";
  const isInitialLoading = listQuery.isLoading && rows.length === 0;

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <section className={SUPPORT_SERVICE_PANEL_CLASS}>
        <div
          className={cn("flex flex-col gap-4", SUPPORT_SERVICE_HEADER_CLASS)}
        >
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
                className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
              >
                <RefreshCw className="h-4 w-4" />
                <span>{t("Refresh")}</span>
              </Button>
              <Button
                asChild
                size="sm"
                className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
              >
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
        <div className={SUPPORT_SERVICE_TABLE_SHELL_CLASS}>
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
              ) : listQuery.isError && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 text-destructive">
                      <CircleAlert className="h-8 w-8" />
                      <p className="text-sm font-medium">
                        {t("Could not load records.")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {listQuery.error instanceof Error
                          ? listQuery.error.message
                          : t("Action failed.")}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => listQuery.refetch()}
                        className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
                      >
                        <RefreshCw className="h-4 w-4" />
                        <span>{t("Try again")}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p className="text-sm">{t("No records found.")}</p>
                      <Button
                        asChild
                        size="sm"
                        className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
                      >
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
                      <Badge
                        variant={
                          offer.status === "active" ? "default" : "outline"
                        }
                      >
                        {t(offerStatusLabel(offer.status))}
                      </Badge>
                      {offer.isHiddenFromSearch ? (
                        <Badge variant="outline" className="ml-2">
                          {t("Hidden from search")}
                        </Badge>
                      ) : null}
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
                        href={`${route}/${encodeURIComponent(transaction.requestId)}`}
                        className="font-mono text-sm font-medium text-foreground hover:underline"
                      >
                        {transaction.requestId}
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {transaction.requestedByUserEmail ||
                          transaction.requestedByUserId ||
                          "-"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {transaction.serviceId} · v{transaction.serviceVersion}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          transaction.status === "delivered"
                            ? "default"
                            : "outline"
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
                        editHref={`${route}/${encodeURIComponent(transaction.requestId)}`}
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
              className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
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
  const [statusDraft, setStatusDraft] =
    useState<SupportServiceOfferStatus>("draft");
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

  const providerOffersQuery = useInfiniteQuery({
    queryKey: [OFFERS_QUERY_KEY, "provider-siblings", form.providerId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(PROVIDER_OFFER_LOOKUP_LIMIT),
        query: form.providerId.trim(),
      });
      if (typeof pageParam === "string" && pageParam) {
        params.set("cursor", pageParam);
      }
      return sdkFetch<SupportServiceOffersPage>(
        `/admin/support-services/offers?${params.toString()}`,
      );
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(form.providerId.trim()),
  });

  useEffect(() => {
    if (
      providerOffersQuery.hasNextPage &&
      !providerOffersQuery.isFetchingNextPage
    ) {
      void providerOffersQuery.fetchNextPage();
    }
  }, [
    providerOffersQuery.fetchNextPage,
    providerOffersQuery.hasNextPage,
    providerOffersQuery.isFetchingNextPage,
  ]);

  const reservedServiceIds = useMemo(
    () =>
      (providerOffersQuery.data?.pages ?? [])
        .flatMap((page) => page.offers)
        .filter(
          (offer) =>
            offer.providerId === form.providerId &&
            offer.id !== effectiveOfferId,
        )
        .map((offer) => offer.serviceId),
    [form.providerId, effectiveOfferId, providerOffersQuery.data?.pages],
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
      (ids.serviceId !== form.serviceId ||
        ids.formShapeId !== form.formShape.id)
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
      const path = effectiveOfferId
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
      sdkFetch(
        `/admin/support-services/offers/${encodeURIComponent(offerId ?? "")}`,
        {
          method: "DELETE",
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });
      router.push("/god-mode/service-offers");
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
  });

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
  const predictedStages = useMemo(
    () => predictedStagesForContract(form.inputSlots, form.outputSlots),
    [form.inputSlots, form.outputSlots],
  );
  const lastPredictedStagesRef = useRef<SupportServiceStage[]>(predictedStages);

  useEffect(() => {
    const previousPrediction = lastPredictedStagesRef.current;
    if (sameStages(previousPrediction, predictedStages)) {
      return;
    }

    setForm((current) => {
      if (
        current.stages.length === 0 ||
        sameStages(current.stages, previousPrediction)
      ) {
        return { ...current, stages: predictedStages };
      }

      return current;
    });
    lastPredictedStagesRef.current = predictedStages;
  }, [predictedStages]);

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
      if (
        form.providerId.trim() &&
        (providerOffersQuery.isFetching || providerOffersQuery.hasNextPage)
      ) {
        throw new Error(
          "Generated service ID is still checking existing offers.",
        );
      }
      if (form.providerId.trim() && providerOffersQuery.isError) {
        throw new Error(
          "Generated service ID could not check every existing offer.",
        );
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
        message: t(
          "Publishing stopped. Review the service offer requirements and try again.",
        ),
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
      <form className={SUPPORT_SERVICE_FORM_CLASS} onSubmit={handleSubmit}>
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
            <Field label="Provider kind">
              <Select
                value={form.providerKind}
                onValueChange={(providerKind) =>
                  setForm((current) =>
                    applyGeneratedOfferIds(
                      {
                        ...current,
                        providerKind:
                          providerKind as SupportServiceProviderKind,
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
            <Field label="Offer name">
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
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
            <Field label="Native discovery">
              <div className="flex min-h-11 items-start gap-3 rounded-xl border border-violet-100 bg-white/78 px-4 py-3 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
                <Checkbox
                  id="service-offer-hidden-from-search"
                  checked={form.isHiddenFromSearch}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      isHiddenFromSearch: checked === true,
                    }))
                  }
                />
                <div className="grid gap-1">
                  <Label htmlFor="service-offer-hidden-from-search">
                    {t("Hide from native service search")}
                  </Label>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t(
                      "The offer remains active and available to authorized backoffice workflows, but it is excluded from native discovery.",
                    )}
                  </p>
                </div>
              </div>
            </Field>
          </div>
        </Section>
        <Section title="Contract">
          <div className="grid gap-4">
            <Field label="Description">
              <p className="text-xs leading-5 text-muted-foreground">
                {t(
                  "Requester-facing summary shown in the app as the service offer description. Use it to explain what the service is, when someone should request it, and what outcome they can expect.",
                )}
              </p>
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
              <p className="text-xs leading-5 text-muted-foreground">
                {t(
                  "Operational description of what the provider does after the request is submitted. It appears in the service detail context to clarify the provider-side work, not as the short marketing summary.",
                )}
              </p>
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
        <ShortContractVisual
          inputSlots={form.inputSlots}
          outputSlots={form.outputSlots}
          stages={form.stages}
          predictedStages={predictedStages}
          onStagesChange={(stages) =>
            setForm((current) => ({ ...current, stages }))
          }
          onApplyStagePrediction={() => {
            lastPredictedStagesRef.current = predictedStages;
            setForm((current) => ({ ...current, stages: predictedStages }));
          }}
        />
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
                {t(
                  "Active status is available only through Publish service offer.",
                )}
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
                {t(
                  "Pick the state that best matches what should happen next for this service offer.",
                )}
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
                  {t(
                    "Active status is available only through Publish service offer.",
                  )}
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

function ShortContractVisual({
  inputSlots,
  outputSlots,
  stages,
  predictedStages,
  onStagesChange,
  onApplyStagePrediction,
}: {
  inputSlots: SupportServiceInputSlot[];
  outputSlots: SupportServiceOutputSlot[];
  stages: SupportServiceStage[];
  predictedStages: SupportServiceStage[];
  onStagesChange: (stages: SupportServiceStage[]) => void;
  onApplyStagePrediction: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  const contractGroups = [
    {
      key: "inputs",
      label: "Inputs",
      emptyLabel: "No inputs",
      slots: inputSlots.map((slot) => ({
        role: slot.role || inputRoleForObjectType(slotObjectType(slot)),
        objectType: slotObjectType(slot),
        label: objectLabel(slotObjectType(slot)),
      })),
    },
    {
      key: "outputs",
      label: "Outputs",
      emptyLabel: "No outputs",
      slots: outputSlots.map((slot) => ({
        role: slot.role || "output",
        objectType: slot.objectType,
        label: outputObjectLabel(slot),
      })),
    },
  ];

  return (
    <Section title="Calculated short contract">
      <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        {contractGroups.map((group, groupIndex) => (
          <div key={group.key} className="contents">
            <div className="grid gap-3 rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{t(group.label)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.slots.length ? (
                  group.slots.map((slot, index) => (
                    <div
                      key={`${group.key}-${slot.role}-${slot.objectType}-${index}`}
                      className="flex min-w-[12rem] items-center gap-3 rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm shadow-sm dark:border-violet-400/16 dark:bg-slate-950/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-500/12 dark:text-violet-100">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {slot.role}
                        </span>
                        <span className="block truncate font-medium text-foreground">
                          {slot.label}
                        </span>
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                    {t(group.emptyLabel)}
                  </div>
                )}
              </div>
            </div>
            {groupIndex === 0 ? (
              <div className="flex items-center justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-100 bg-white text-violet-700 shadow-sm dark:border-violet-400/18 dark:bg-slate-950/70 dark:text-violet-100">
                  <ArrowRight className="h-5 w-5" />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <StagePipeline
        value={stages}
        predictedValue={predictedStages}
        onChange={onStagesChange}
        onApplyPrediction={onApplyStagePrediction}
      />
    </Section>
  );
}

function stagePipelineDescription(stage: SupportServiceStage) {
  if (stage === "wet_lab") {
    return "Specimen logistics, extraction, sequencing, and lab-produced source files.";
  }

  if (stage === "bioinformatics") {
    return "Digital analysis, variant interpretation, images, PGI1, and reports.";
  }

  return "Forms, consent, candidate genes, and order construction.";
}

function stagePipelineIcon(stage: SupportServiceStage) {
  if (stage === "wet_lab") {
    return FlaskConical;
  }

  if (stage === "bioinformatics") {
    return Binary;
  }

  return ClipboardList;
}

function StagePipeline({
  value,
  predictedValue,
  onChange,
  onApplyPrediction,
}: {
  value: SupportServiceStage[];
  predictedValue: SupportServiceStage[];
  onChange: (value: SupportServiceStage[]) => void;
  onApplyPrediction: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const selectedStages = sortedStages(value);
  const selectedSet = new Set(selectedStages);
  const predictedSet = new Set(predictedValue);
  const matchesPrediction = sameStages(selectedStages, predictedValue);

  function toggle(stage: SupportServiceStage) {
    if (selectedSet.has(stage)) {
      if (selectedStages.length <= 1) {
        return;
      }

      onChange(selectedStages.filter((current) => current !== stage));
      return;
    }

    onChange(sortedStages([...selectedStages, stage]));
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(245,243,255,0.78))] p-4 shadow-sm dark:border-violet-400/16 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.72),rgba(46,30,88,0.34))]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={SUPPORT_SERVICE_SUBSECTION_TITLE_CLASS}>
              {t("Stage pipeline")}
            </p>
            <Badge
              variant="outline"
              className={cn(
                "border-violet-200 bg-white/82 text-violet-700 dark:border-violet-400/22 dark:bg-violet-500/10 dark:text-violet-100",
                !matchesPrediction &&
                  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/24 dark:bg-amber-500/12 dark:text-amber-200",
              )}
            >
              {matchesPrediction
                ? t("Best-effort prediction")
                : t("Manually adjusted")}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {t(
              "Stages are inferred from the current input and output objects. Use the checkboxes only when the catalog needs a manual correction.",
            )}
          </p>
        </div>
        {!matchesPrediction ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onApplyPrediction}
            className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
          >
            <Wand2 className="h-4 w-4" />
            <span>{t("Use suggested pipeline")}</span>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        {SUPPORT_SERVICE_STAGES.map((stage, index) => {
          const selected = selectedSet.has(stage.value);
          const predicted = predictedSet.has(stage.value);
          const StageIcon = stagePipelineIcon(stage.value);

          return (
            <div key={stage.value} className="contents">
              <div
                className={cn(
                  "grid min-h-36 gap-3 rounded-2xl border p-4 transition",
                  selected
                    ? "border-violet-300 bg-white text-foreground shadow-[0_18px_44px_-34px_rgba(109,40,217,0.70)] dark:border-violet-300/34 dark:bg-slate-950/54"
                    : "border-violet-100/70 bg-white/52 text-muted-foreground dark:border-violet-400/12 dark:bg-slate-950/24",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner",
                        selected
                          ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/22 dark:bg-violet-500/12 dark:text-violet-100"
                          : "border-violet-100 bg-white/70 text-muted-foreground dark:border-violet-400/12 dark:bg-slate-950/40",
                      )}
                    >
                      <StageIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-heading text-base font-semibold text-foreground">
                        {t(stage.label)}
                      </span>
                      {predicted ? (
                        <span className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-500/12 dark:text-violet-100">
                          {t("Suggested by inputs and outputs")}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggle(stage.value)}
                    disabled={selected && selectedStages.length <= 1}
                    aria-label={t(stage.label)}
                  />
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t(stagePipelineDescription(stage.value))}
                </p>
              </div>
              {index < SUPPORT_SERVICE_STAGES.length - 1 ? (
                <div className="hidden items-center justify-center md:flex">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-100 bg-white text-violet-700 shadow-sm dark:border-violet-400/18 dark:bg-slate-950/70 dark:text-violet-100">
                    <ArrowRight className="h-5 w-5" />
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
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
              t(
                "Saving the service contract and making it available for transactions.",
              )}
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
                  ? t(
                      "The offer is saved with status active and can be selected by new service transactions.",
                    )
                  : dialog?.status === "error"
                    ? t(
                        "The offer stayed unchanged. Fix the form requirement and publish again.",
                      )
                    : t(
                        "Validating provider, contract slots, form shape, and output requirements.",
                      )}
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
      >
        <Wand2 className="h-4 w-4" />
        <span>{t("Prefill with mocked template")}</span>
      </Button>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("Prefill with mocked template")}</DialogTitle>
          <DialogDescription>
            {t(
              "Choose one Pocket-Genes-Wiki template to prefill editable fields.",
            )}
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
                      className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
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

type ProviderRecord = DiscoverOrganizationRecord | DiscoverIndividualRecord;

function providerMeta(
  provider: ProviderRecord,
  kind: SupportServiceProviderKind,
) {
  return kind === "organization"
    ? ((provider as DiscoverOrganizationRecord).organizationType ?? "")
    : ((provider as DiscoverIndividualRecord).individualType ?? "");
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
    kind === "organization"
      ? "/discover/organizations"
      : "/discover/individuals";

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
    <div className="grid w-full min-w-0 gap-2 text-sm font-medium">
      <span>{t("Provider")}</span>
      <div className="flex w-full min-w-0 flex-col gap-2 rounded-2xl border border-violet-100/80 bg-white/78 p-3 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42 sm:flex-row sm:items-center sm:justify-between">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className={cn(SUPPORT_SERVICE_SOFT_BUTTON_CLASS, "w-full sm:w-auto")}
        >
          <Search className="h-4 w-4" />
          <span>{t("Choose provider")}</span>
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(calc(100vw-2rem),64rem)] max-w-none">
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
            <div className="max-h-[24rem] overflow-y-auto rounded-2xl border border-violet-100/80 bg-white/80 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
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
                      <TableCell
                        colSpan={4}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
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
                          <Badge
                            variant={
                              provider.status === "active"
                                ? "default"
                                : "outline"
                            }
                          >
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
                            disabled={provider.status !== "active"}
                            className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
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
                className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
              >
                {providerQuery.isFetchingNextPage
                  ? t("Loading...")
                  : t("Load more")}
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
        index == null ? emptyFieldDraft() : { ...form.formShape.fields[index] },
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
      current ? { ...current, draft: { ...current.draft, ...patch } } : current,
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
            {form.supportsFormShape ? t("Enabled") : t("Not requested")}
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
              <GeneratedValue
                value={formShapeIdsPreview?.formShapeId ?? "pgfs_"}
              />
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
              className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
            >
              <Plus className="h-4 w-4" />
              <span>{t("Add field")}</span>
            </Button>
          </div>
          <div className={SUPPORT_SERVICE_TABLE_SHELL_CLASS}>
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
                  {t(
                    "Configure one form field for the support service request form.",
                  )}
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
                  className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
                >
                  {t("Cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={saveFieldDraft}
                  className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
                >
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
      <div className="grid gap-6 xl:grid-cols-2 xl:gap-8">
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
      objectType: string;
    };
  } | null>(null);
  const [slotError, setSlotError] = useState("");

  function openSlotDialog(index: number | null) {
    const slot = index == null ? null : form.inputSlots[index];
    setSlotError("");
    setSlotDialog({
      index,
      draft: {
        objectType:
          (slot ? slotObjectType(slot) : "") ||
          INPUT_OBJECT_OPTIONS[0]?.value ||
          "",
      },
    });
  }

  function updateSlotDraft(
    patch: Partial<NonNullable<typeof slotDialog>["draft"]>,
  ) {
    setSlotDialog((current) =>
      current ? { ...current, draft: { ...current.draft, ...patch } } : current,
    );
  }

  function saveSlotDraft() {
    if (!slotDialog) {
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
    const duplicateSlotIndex = form.inputSlots.findIndex(
      (slot) => slotObjectType(slot) === slotDialog.draft.objectType,
    );
    if (duplicateSlotIndex !== -1 && duplicateSlotIndex !== slotDialog.index) {
      setSlotError(t("This input type is already added."));
      return;
    }

    const nextSlot: SupportServiceInputSlot = {
      role: inputRoleForObjectType(slotDialog.draft.objectType),
      objectType: slotDialog.draft.objectType,
      acceptedTypes: [slotDialog.draft.objectType],
      required: true,
      cardinality: { min: 1, max: 1 },
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
    <div className={SUPPORT_SERVICE_SUBSECTION_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={SUPPORT_SERVICE_SUBSECTION_TITLE_CLASS}>
          {t("Input slots")}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openSlotDialog(null)}
          className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
        >
          <Plus className="h-4 w-4" />
          <span>{t("Add input")}</span>
        </Button>
      </div>
      <div className={SUPPORT_SERVICE_TABLE_SHELL_CLASS}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Input key")}</TableHead>
              <TableHead>{t("Object type")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {form.inputSlots.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
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
              {slotDialog?.index == null
                ? t("Add input slot")
                : t("Edit input slot")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Choose the object type. The input key and one required file are generated automatically.",
              )}
            </DialogDescription>
          </DialogHeader>
          {slotDialog ? (
            <div className="grid gap-4">
              <Field label="Object type">
                <ObjectTypeSelect
                  value={slotDialog.draft.objectType}
                  onChange={(objectType) => updateSlotDraft({ objectType })}
                  excludeForm
                />
              </Field>
              <Field label="Input key">
                <GeneratedValue
                  value={inputRoleForObjectType(slotDialog.draft.objectType)}
                />
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
              className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              onClick={saveSlotDraft}
              className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
            >
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
  const revisionSourceRoles = outputRevisionSourceRoles(form.inputSlots);

  function openSlotDialog(index: number | null) {
    const slot = index == null ? null : form.outputSlots[index];
    setSlotError("");
    setSlotDialog({
      index,
      draft: slot
        ? {
            ...slot,
            sameIdentityAsInput:
              slot.sameIdentityAsInput ??
              (slot.objectType.startsWith("same_as:")
                ? slot.objectType.replace(/^same_as:/, "")
                : undefined),
          }
        : defaultOutputSlot(),
    });
  }

  function updateSlotDraft(patch: Partial<SupportServiceOutputSlot>) {
    setSlotDialog((current) =>
      current ? { ...current, draft: { ...current.draft, ...patch } } : current,
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
    if (slotDialog.draft.mutationMode === "new_revision") {
      if (!slotDialog.draft.sameIdentityAsInput) {
        setSlotError(
          t("Choose the input role that keeps the same object identity."),
        );
        return;
      }
    } else {
      if (!slotDialog.draft.objectType) {
        setSlotError(t("Object type is required."));
        return;
      }
      if (slotDialog.draft.objectType === FORM_OBJECT_TYPE) {
        setSlotError(t("Output slots cannot produce request forms."));
        return;
      }
    }

    const sameIdentityAsInput =
      slotDialog.draft.mutationMode === "new_revision"
        ? slotDialog.draft.sameIdentityAsInput
        : undefined;
    const nextSlot: SupportServiceOutputSlot = {
      ...slotDialog.draft,
      role: slotDialog.draft.role.trim(),
      objectType: sameIdentityAsInput
        ? sameIdentityObjectType(sameIdentityAsInput)
        : slotDialog.draft.objectType,
      sameIdentityAsInput,
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
    <div className={SUPPORT_SERVICE_SUBSECTION_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={SUPPORT_SERVICE_SUBSECTION_TITLE_CLASS}>
          {t("Output slots")}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openSlotDialog(null)}
          className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
        >
          <Plus className="h-4 w-4" />
          <span>{t("Add output")}</span>
        </Button>
      </div>
      <div className={SUPPORT_SERVICE_TABLE_SHELL_CLASS}>
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
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
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
                    <Badge variant="secondary">{outputObjectLabel(slot)}</Badge>
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
              {slotDialog?.index == null
                ? t("Add output slot")
                : t("Edit output slot")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Define the object produced or revised by this service offer.",
              )}
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
              <Field label="Mutation">
                <Select
                  value={slotDialog.draft.mutationMode}
                  onValueChange={(mutationMode) => {
                    const nextMode = mutationMode as SupportServiceMutationMode;
                    if (nextMode === "new_revision") {
                      const sourceRole =
                        slotDialog.draft.sameIdentityAsInput ??
                        revisionSourceRoles[0] ??
                        "";
                      updateSlotDraft({
                        mutationMode: nextMode,
                        sameIdentityAsInput: sourceRole || undefined,
                        objectType: sourceRole
                          ? sameIdentityObjectType(sourceRole)
                          : "",
                      });
                      return;
                    }
                    updateSlotDraft({
                      mutationMode: nextMode,
                      sameIdentityAsInput: undefined,
                      objectType: slotDialog.draft.objectType.startsWith(
                        "same_as:",
                      )
                        ? DEFAULT_OUTPUT_OBJECT_TYPE
                        : slotDialog.draft.objectType,
                    });
                  }}
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
              {slotDialog.draft.mutationMode === "new_revision" ? (
                <Field label="Same identity as input">
                  <Select
                    value={slotDialog.draft.sameIdentityAsInput ?? ""}
                    onValueChange={(sourceRole) =>
                      updateSlotDraft({
                        sameIdentityAsInput: sourceRole,
                        objectType: sameIdentityObjectType(sourceRole),
                      })
                    }
                    disabled={revisionSourceRoles.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("Choose source input")} />
                    </SelectTrigger>
                    <SelectContent>
                      {revisionSourceRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field label="Object type">
                  <ObjectTypeSelect
                    value={slotDialog.draft.objectType}
                    onChange={(objectType) => updateSlotDraft({ objectType })}
                    excludeForm
                  />
                </Field>
              )}
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
              className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              onClick={saveSlotDraft}
              className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
            >
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

  function updatePricingModel(value: string) {
    if (
      value !== "not_specified" &&
      value !== "free" &&
      value !== "fixed" &&
      value !== "calculated_after_submission"
    ) {
      return;
    }
    const nextModel: SupportServicePricingModel = value;

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

    if (nextModel === "calculated_after_submission") {
      updateTerms({
        pricingModel: nextModel,
        price: {
          summary:
            form.commercialTerms.price?.summary ||
            "Calculated after submission",
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
          <Select value={pricingModel} onValueChange={updatePricingModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_specified">
                {t("Not specified")}
              </SelectItem>
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
        {pricingModel === "calculated_after_submission" ? (
          <Field label="Price summary">
            <Input
              value={form.commercialTerms.price?.summary ?? ""}
              onChange={(event) =>
                updateTerms({
                  price: { summary: event.target.value },
                })
              }
              placeholder={t("Calculated after submission")}
            />
          </Field>
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
  const [outputUploadDraft, setOutputUploadDraft] =
    useState<OutputObjectUploadDraft | null>(null);
  const [outputUploadError, setOutputUploadError] = useState("");
  const isEditing = mode === "edit";

  function nextToastId() {
    setToastCounter((current) => current + 1);
    return toastCounter;
  }

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
  const transactionRecord = transactionQuery.data?.transaction ?? null;
  const persistedTransactionForm = useMemo(
    () =>
      transactionRecord ? transactionFormFromRecord(transactionRecord) : null,
    [transactionRecord],
  );
  const hasUnsavedTransactionChanges = Boolean(
    persistedTransactionForm &&
      transactionEditableFingerprint(form) !==
        transactionEditableFingerprint(persistedTransactionForm),
  );

  const offersQuery = useInfiniteQuery({
    queryKey: [LIVE_OFFERS_QUERY_KEY],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(SERVICE_PAGE_SIZE),
        status: "active",
      });
      if (typeof pageParam === "string" && pageParam) {
        params.set("cursor", pageParam);
      }
      return sdkFetch<SupportServiceOffersPage>(
        `/admin/support-services/offers?${params.toString()}`,
      );
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !isEditing,
  });
  const linkedOfferQuery = useQuery({
    queryKey: [LIVE_OFFERS_QUERY_KEY, "linked", transactionRecord?.offerId],
    queryFn: () =>
      sdkFetch<{ offer: SupportServiceOfferRecord }>(
        `/admin/support-services/offers/${encodeURIComponent(
          transactionRecord?.offerId ?? "",
        )}`,
      ),
    enabled: isEditing && Boolean(transactionRecord?.offerId),
  });
  const paginatedLiveOffers = useMemo(
    () =>
      offersQuery.data?.pages.flatMap((page) => page.offers) ??
      EMPTY_SUPPORT_SERVICE_OFFERS,
    [offersQuery.data?.pages],
  );
  const liveOffers = isEditing
    ? linkedOfferQuery.data?.offer
      ? [linkedOfferQuery.data.offer]
      : EMPTY_SUPPORT_SERVICE_OFFERS
    : paginatedLiveOffers;

  useEffect(() => {
    if (transactionRecord) {
      setForm(transactionFormFromRecord(transactionRecord));
    }
  }, [transactionRecord]);

  useEffect(() => {
    if (!isEditing && !form.offerId && liveOffers[0]) {
      setForm(transactionFormForOffer(liveOffers[0]));
    }
  }, [form.offerId, isEditing, liveOffers]);

  const serviceChoices = useMemo(() => {
    if (isEditing) {
      return [];
    }

    const choices = liveOffers.map((offer) => ({
      value: offer.id,
      label: `${offer.name} (${offer.serviceId}, ${offer.providerName || offer.providerId})`,
    }));

    if (
      form.offerId &&
      !choices.some((choice) => choice.value === form.offerId)
    ) {
      choices.push({
        value: form.offerId,
        label: `${form.offerId} (${t("missing active offer")})`,
      });
    }

    return choices;
  }, [form.offerId, isEditing, liveOffers, t]);

  const selectedOffer =
    liveOffers.find((offer) => offer.id === form.offerId) ?? null;
  const terminalStatusLocked = Boolean(
    isEditing &&
    transactionRecord &&
    TERMINAL_TRANSACTION_STATUSES.has(transactionRecord.status),
  );
  const selectableTransactionStatuses = useMemo(() => {
    if (
      !transactionRecord ||
      TERMINAL_TRANSACTION_STATUSES.has(transactionRecord.status)
    ) {
      return SUPPORT_SERVICE_TRANSACTION_STATUSES.filter(
        (option) => option.value !== "delivered",
      );
    }
    const allowed =
      ALLOWED_TRANSACTION_STATUS_TRANSITIONS[
        transactionRecord.status as keyof typeof ALLOWED_TRANSACTION_STATUS_TRANSITIONS
      ];
    return SUPPORT_SERVICE_TRANSACTION_STATUSES.filter(
      (option) =>
        option.value !== "delivered" &&
        (option.value === form.status ||
          option.value === transactionRecord.status ||
          allowed.has(option.value)),
    );
  }, [form.status, transactionRecord]);
  const frozenOfferName =
    typeof form.offerSnapshot.name === "string"
      ? form.offerSnapshot.name
      : form.serviceId;
  const frozenShortContract =
    typeof form.offerSnapshot.shortContract === "string"
      ? form.offerSnapshot.shortContract
      : "";
  const frozenInputSlots = Array.isArray(form.offerSnapshot.inputSlots)
    ? form.offerSnapshot.inputSlots
    : [];
  const frozenOutputSlots = Array.isArray(form.offerSnapshot.outputSlots)
    ? form.offerSnapshot.outputSlots
    : [];
  const expectedOutputObjects = frozenOutputSlots.map((slot) =>
    outputObjectDraft(slot, frozenInputSlots),
  );
  const allOutputSlotsReady =
    expectedOutputObjects.length > 0 &&
    form.outputObjects.length === expectedOutputObjects.length &&
    expectedOutputObjects.every((expected) => {
      const boundOutput = form.outputObjects.find(
        (output) => output.role === expected.role,
      );
      return Boolean(
        boundOutput &&
          boundOutput.objectType === expected.objectType &&
          /^\d{9}$/.test(boundOutput.objectCode),
      );
    });
  const canMarkDelivered = Boolean(
    isEditing &&
      transactionRecord?.status === "running" &&
      form.status === "running" &&
      !hasUnsavedTransactionChanges &&
      !terminalStatusLocked &&
      allOutputSlotsReady,
  );

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
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTIONS_QUERY_KEY],
      });
      setToast({
        id: nextToastId(),
        tone: "success",
        message: t("Service transaction saved."),
      });
      router.push(
        `/god-mode/service-transactions/${encodeURIComponent(
          result.transaction.requestId,
        )}`,
      );
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
  });

  const uploadOutputMutation = useMutation({
    mutationFn: async (draft: OutputObjectUploadDraft) =>
      sdkFetch<{
        transaction: SupportServiceTransactionRecord;
        object: CreatedOutputObject;
      }>(
        `/admin/support-services/transactions/${encodeURIComponent(
          transactionId ?? "",
        )}/output-objects`,
        {
          method: "POST",
          body: JSON.stringify({
            role: draft.role,
            fileName: draft.fileName.trim(),
            downloadUrl: draft.downloadUrl.trim(),
          }),
        },
      ),
    onSuccess: async (result, draft) => {
      if (
        result.object.role !== draft.role ||
        result.object.objectType !== draft.objectType ||
        !/^\d{9}$/.test(result.object.objectCode)
      ) {
        setOutputUploadError(
          t("The created object does not match the selected output slot."),
        );
        return;
      }

      const authoritativeForm = transactionFormFromRecord(result.transaction);
      authoritativeForm.outputObjects = authoritativeForm.outputObjects.map(
        (output) =>
          output.role === draft.role
            ? {
                ...output,
                fileName: result.object.fileName,
                downloadUrl: result.object.downloadUrl,
              }
            : output,
      );
      setForm(authoritativeForm);
      queryClient.setQueryData(
        [TRANSACTIONS_QUERY_KEY, transactionId],
        { transaction: result.transaction },
      );
      setOutputUploadDraft(null);
      setOutputUploadError("");
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTIONS_QUERY_KEY],
      });
      setToast({
        id: nextToastId(),
        tone: "success",
        message: t("Output object created and linked."),
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Action failed.";
      setOutputUploadError(t(message));
      setToast(mutationErrorToast(error, nextToastId(), t));
    },
  });

  const deliverMutation = useMutation({
    mutationFn: async () =>
      sdkFetch<{ transaction: SupportServiceTransactionRecord }>(
        `/admin/support-services/transactions/${encodeURIComponent(
          transactionId ?? "",
        )}/deliver`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      ),
    onSuccess: async (result) => {
      setForm(transactionFormFromRecord(result.transaction));
      queryClient.setQueryData(
        [TRANSACTIONS_QUERY_KEY, transactionId],
        { transaction: result.transaction },
      );
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTIONS_QUERY_KEY],
      });
      setToast({
        id: nextToastId(),
        tone: "success",
        message: t("Service transaction marked as delivered."),
      });
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
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTIONS_QUERY_KEY],
      });
      router.push("/god-mode/service-transactions");
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
  });
  const transactionCommandPending =
    saveMutation.isPending ||
    uploadOutputMutation.isPending ||
    deliverMutation.isPending ||
    deleteMutation.isPending;

  function handleServiceChange(offerId: string) {
    setForm(transactionFormForOfferId(offerId, liveOffers));
  }

  function updateInputRef(index: number, patch: Partial<ObjectRefDraft>) {
    setForm((current) => {
      const inputs = current.inputs.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      );
      const missingRequiredInputRoles = inputs
        .filter((slot) => slot.required && !slot.objectId.trim())
        .map((slot) => slot.role);
      return {
        ...current,
        inputs,
        missingRequiredInputRoles,
        attachmentsPending: missingRequiredInputRoles.length > 0,
      };
    });
  }

  function openOutputUpload(index: number) {
    const output = form.outputObjects[index];
    if (
      !output ||
      !isEditing ||
      terminalStatusLocked ||
      hasUnsavedTransactionChanges
    ) {
      return;
    }
    setOutputUploadError("");
    setOutputUploadDraft({
      index,
      role: output.role,
      objectType: output.objectType,
      fileName: "",
      downloadUrl: "",
    });
  }

  function handleOutputUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!outputUploadDraft || !transactionId) {
      return;
    }

    const fileName = outputUploadDraft.fileName.trim();
    const downloadUrl = outputUploadDraft.downloadUrl.trim();
    if (!fileName) {
      setOutputUploadError(t("File name is required."));
      return;
    }

    try {
      const parsedUrl = new URL(downloadUrl);
      if (parsedUrl.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      setOutputUploadError(t("Use a valid HTTPS download URL."));
      return;
    }

    setOutputUploadError("");
    uploadOutputMutation.mutate({
      ...outputUploadDraft,
      fileName,
      downloadUrl,
    });
  }

  function handleMarkDelivered() {
    try {
      if (!isEditing || !transactionId || !transactionRecord) {
        throw new Error("Save the transaction before marking it as delivered.");
      }
      if (transactionRecord.status !== "running") {
        throw new Error(
          "The transaction must be running before it can be marked as delivered.",
        );
      }
      if (hasUnsavedTransactionChanges) {
        throw new Error(
          "Save other transaction changes before marking it as delivered.",
        );
      }
      if (!allOutputSlotsReady) {
        throw new Error(
          "Upload a valid object for every promised output before marking the transaction as delivered.",
        );
      }

      deliverMutation.mutate();
    } catch (error) {
      setToast(mutationErrorToast(error, nextToastId(), t));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (terminalStatusLocked) {
        throw new Error("Terminal service transactions cannot be edited.");
      }
      if (transactionCommandPending) {
        return;
      }
      if (!isEditing && !selectedOffer) {
        throw new Error("Choose an existing service offer.");
      }
      saveMutation.mutate(transactionPayloadFromForm(form));
    } catch (error) {
      setToast(mutationErrorToast(error, nextToastId(), t));
    }
  }

  if (
    (isEditing && transactionQuery.isLoading) ||
    (!isEditing && offersQuery.isLoading)
  ) {
    return <Skeleton className="h-[34rem] w-full" />;
  }

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <form className={SUPPORT_SERVICE_FORM_CLASS} onSubmit={handleSubmit}>
        <WorkbenchTopbar
          title={isEditing ? "Detalle de transaccion" : "Alta de transaccion"}
          backHref="/god-mode/service-transactions"
          backLabel="Back to Service Transactions"
          isSaving={saveMutation.isPending}
          saveDisabled={terminalStatusLocked || transactionCommandPending}
          deleteDisabled={transactionCommandPending}
          canDelete={isEditing}
          onDelete={() => {
            if (window.confirm(t("Delete this service transaction?"))) {
              deleteMutation.mutate();
            }
          }}
        />
        <fieldset
          className="contents"
          disabled={terminalStatusLocked || transactionCommandPending}
        >
        <Section title="Request identity">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Service">
              {isEditing ? (
                <div className="grid min-h-24 gap-2 rounded-xl border border-violet-100 bg-white/78 px-4 py-3 text-sm shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-foreground">
                      {frozenOfferName || t("Frozen service contract")}
                    </div>
                    <Badge variant="secondary">
                      {t("Frozen transaction contract")}
                    </Badge>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {form.serviceId || "-"} · v{form.serviceVersion || 1}
                  </div>
                  {frozenShortContract ? (
                    <div className="text-muted-foreground">
                      {frozenShortContract}
                    </div>
                  ) : null}
                  {selectedOffer ? (
                    <div className="mt-1 border-t border-violet-100 pt-2 text-xs text-muted-foreground dark:border-violet-400/14">
                      <div className="font-semibold uppercase tracking-wide">
                        {t("Current live offer context")}
                      </div>
                      <div className="mt-1">
                        {selectedOffer.name} ·{" "}
                        {selectedOffer.shortContract || "-"}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2 border-t border-violet-100 pt-2 text-xs text-muted-foreground dark:border-violet-400/14">
                      {linkedOfferQuery.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CircleAlert className="h-4 w-4" />
                      )}
                      <span>
                        {linkedOfferQuery.isLoading
                          ? t("Loading linked service...")
                          : t("Linked service offer not found.")}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-2">
                  <Select
                    value={form.offerId}
                    onValueChange={handleServiceChange}
                    disabled={serviceChoices.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("Choose active service offer")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceChoices.map((service) => (
                        <SelectItem key={service.value} value={service.value}>
                          {service.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {offersQuery.hasNextPage ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => offersQuery.fetchNextPage()}
                      disabled={offersQuery.isFetchingNextPage}
                      className={cn(
                        SUPPORT_SERVICE_SOFT_BUTTON_CLASS,
                        "justify-self-start",
                      )}
                    >
                      {offersQuery.isFetchingNextPage
                        ? t("Loading...")
                        : t("Load more")}
                    </Button>
                  ) : null}
                </div>
              )}
            </Field>
            <Field label="Request ID">
              {isEditing ? (
                <GeneratedValue
                  value={form.requestId || transactionId || "pgr_"}
                />
              ) : (
                <Input
                  value={form.requestId}
                  onChange={(event) => {
                    const requestId = event.target.value;
                    setForm((current) => ({
                      ...current,
                      requestId,
                      idempotencyKey: transactionIdempotencyKey(requestId),
                    }));
                  }}
                  required
                />
              )}
            </Field>
            <Field label="Offer ID">
              <GeneratedValue value={form.offerId || "-"} />
            </Field>
            <Field label="Service version">
              <GeneratedValue value={String(form.serviceVersion || 1)} />
            </Field>
            <Field label="Provider ID">
              <GeneratedValue value={form.providerId || "-"} />
            </Field>
            <Field label="Provider kind">
              <GeneratedValue value={t(form.providerKind)} />
            </Field>
            <Field label="Requester user ID">
              {isEditing ? (
                <GeneratedValue value={form.requestedByUserId || "-"} />
              ) : (
                <Input
                  value={form.requestedByUserId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      requestedByUserId: event.target.value,
                    }))
                  }
                  required
                />
              )}
            </Field>
            <Field label="Requester email">
              {isEditing ? (
                <GeneratedValue value={form.requestedByUserEmail || "-"} />
              ) : (
                <Input
                  value={form.requestedByUserEmail}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      requestedByUserEmail: event.target.value,
                    }))
                  }
                  type="email"
                />
              )}
            </Field>
            <Field label="Idempotency key">
              <GeneratedValue value={form.idempotencyKey || "-"} />
            </Field>
            <Field label="Client request time">
              <GeneratedValue value={form.requestedAtClient || "-"} />
            </Field>
            {isEditing ? (
              <>
                <Field label="Requested at">
                  <GeneratedValue value={form.requestedAt || "-"} />
                </Field>
                <Field label="Request revision">
                  <GeneratedValue value={String(form.requestRevision || 1)} />
                </Field>
              </>
            ) : null}
            <Field label="Contract source">
              <GeneratedValue value={form.contractSource || "-"} />
            </Field>
          </div>
          {!isEditing && serviceChoices.length === 0 ? (
            <div className="flex items-center gap-2 rounded-2xl border border-violet-100/80 bg-white/78 p-3 text-sm text-muted-foreground shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
              <CircleAlert className="h-4 w-4" />
              <span>
                {t("No service offers are available for transactions.")}
              </span>
            </div>
          ) : null}
          {!isEditing && selectedOffer ? (
            <div className="rounded-2xl border border-violet-100/80 bg-white/78 p-3 text-sm text-muted-foreground shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
              <div className="font-medium text-foreground">
                {selectedOffer.name}
              </div>
              <div>{selectedOffer.shortContract}</div>
            </div>
          ) : null}
        </Section>
        <Section title="Input object bindings">
          <ObjectRefTable slots={form.inputs} onChange={updateInputRef} />
          {form.missingRequiredInputRoles.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-800 shadow-sm dark:border-amber-400/25 dark:bg-amber-500/12 dark:text-amber-100">
              <CircleAlert className="h-4 w-4" />
              <span>{t("Pending required inputs")}</span>
              {form.missingRequiredInputRoles.map((role) => (
                <Badge key={role} variant="outline" className="font-mono">
                  {role}
                </Badge>
              ))}
            </div>
          ) : null}
        </Section>
        <Section title="Delivered output objects">
          <OutputObjectGrid
            outputs={form.outputObjects}
            canUpload={
              isEditing &&
              !terminalStatusLocked &&
              !hasUnsavedTransactionChanges
            }
            onSelect={openOutputUpload}
          />
          {!isEditing ? (
            <p className="text-sm text-muted-foreground">
              {t("Save the transaction before uploading output objects.")}
            </p>
          ) : hasUnsavedTransactionChanges ? (
            <p className="text-sm text-amber-700 dark:text-amber-200">
              {t("Save other transaction changes before uploading output objects.")}
            </p>
          ) : null}
          <div className="mt-4">
            <Field label="Optional report codes">
              <Textarea
                value={form.outputReportCodesText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    outputReportCodesText: event.target.value,
                  }))
                }
                rows={3}
                placeholder={t("One 6-character report code per line")}
              />
            </Field>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Reports may accompany a delivery, but they are not validated as service contract outputs.",
              )}
            </p>
          </div>
        </Section>
        <Section title="Issues">
          <Textarea
            value={form.issuesText}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                issuesText: event.target.value,
              }))
            }
            rows={6}
            className="font-mono text-xs"
            placeholder={t("Issues JSON array")}
          />
        </Section>
        <Section title="Transaction status">
          <div className="overflow-hidden rounded-2xl border border-violet-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(245,243,255,0.90)_58%,rgba(240,249,255,0.72))] p-4 shadow-[0_18px_56px_-48px_rgba(109,40,217,0.48)] dark:border-violet-400/18 dark:bg-[linear-gradient(145deg,rgba(18,23,40,0.94),rgba(30,24,57,0.82))]">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("Current status")}
                  </span>
                  <Badge
                    variant={form.status === "delivered" ? "default" : "secondary"}
                    className="px-3 py-1 text-sm"
                  >
                    {t(transactionStatusLabel(form.status))}
                  </Badge>
                </div>
                {terminalStatusLocked ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t("Terminal transactions cannot be reopened.")}
                  </p>
                ) : isEditing ? (
                  <div className="mt-4 max-w-md">
                    <Field label="Change status">
                      <Select
                        value={form.status}
                        onValueChange={(status) => {
                          if (!status) {
                            return;
                          }
                          setForm((current) => ({
                            ...current,
                            status: status as TransactionFormState["status"],
                          }));
                        }}
                      >
                        <SelectTrigger aria-label={t("Transaction status options")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {selectableTransactionStatuses.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(option.label)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t(
                        "Delivered is available only through Mark as delivered after every output is ready.",
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t("New transactions start with Received status.")}
                  </p>
                )}
              </div>

              {isEditing ? (
                <div className="grid gap-3 rounded-2xl border border-violet-100 bg-white/78 p-4 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {t("Output slots ready")}
                    </span>
                    <span className="font-semibold text-foreground">
                      {
                        form.outputObjects.filter((output) =>
                          /^\d{9}$/.test(output.objectCode),
                        ).length
                      }
                      /{form.outputObjects.length}
                    </span>
                  </div>
                  {hasUnsavedTransactionChanges ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t(
                        "Save other transaction changes before marking it as delivered.",
                      )}
                    </p>
                  ) : transactionRecord?.status !== "running" &&
                  transactionRecord?.status !== "delivered" ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t(
                        "The transaction must be running before it can be marked as delivered.",
                      )}
                    </p>
                  ) : !allOutputSlotsReady && form.status !== "delivered" ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t(
                        "Upload a valid object for every promised output before marking the transaction as delivered.",
                      )}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleMarkDelivered}
                    disabled={
                      !canMarkDelivered ||
                      deliverMutation.isPending ||
                      uploadOutputMutation.isPending ||
                      saveMutation.isPending
                    }
                    className="h-14 w-full justify-center rounded-xl bg-violet-600 text-base font-semibold text-white shadow-[0_16px_42px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                  >
                    {deliverMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" />
                    )}
                    {deliverMutation.isPending
                      ? t("Marking as delivered...")
                      : t("Mark as delivered")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </Section>
        </fieldset>
      </form>
      <OutputObjectUploadDialog
        draft={outputUploadDraft}
        error={outputUploadError}
        pending={uploadOutputMutation.isPending}
        onDraftChange={setOutputUploadDraft}
        onClose={() => {
          if (!uploadOutputMutation.isPending) {
            setOutputUploadDraft(null);
            setOutputUploadError("");
          }
        }}
        onSubmit={handleOutputUpload}
      />
    </>
  );
}

function OutputObjectGrid({
  outputs,
  canUpload,
  onSelect,
}: {
  outputs: OutputObjectDraft[];
  canUpload: boolean;
  onSelect: (index: number) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  if (outputs.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <CircleAlert className="h-4 w-4" />
        <span>{t("The linked service contract has no output slots.")}</span>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {outputs.map((output, index) => {
        const ready = /^\d{9}$/.test(output.objectCode);
        const actionLabel = ready
          ? `${t("Ready object linked")} · ${output.role}`
          : `${t("Upload output object")} · ${output.role}`;

        return (
          <button
            key={`${output.role}-${index}`}
            type="button"
            aria-label={actionLabel}
            onClick={() => onSelect(index)}
            disabled={!canUpload || ready}
            className={cn(
              "group grid min-h-48 gap-4 rounded-2xl border-2 border-dashed p-5 text-left transition",
              ready
                ? "border-emerald-300 bg-emerald-50/55 shadow-[0_18px_48px_-38px_rgba(5,150,105,0.55)] dark:border-emerald-400/34 dark:bg-emerald-500/10"
                : "border-violet-200 bg-white/74 hover:border-violet-400 hover:bg-violet-50/70 hover:shadow-[0_18px_48px_-38px_rgba(109,40,217,0.6)] dark:border-violet-400/22 dark:bg-slate-950/38 dark:hover:border-violet-300/44 dark:hover:bg-violet-500/10",
              (!canUpload || ready) && "cursor-default opacity-80",
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs font-semibold text-muted-foreground">
                  {output.role}
                </span>
                <span className="mt-1 block font-heading text-base font-semibold text-foreground">
                  {bindingTypeLabel(output.objectType)}
                </span>
                <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
                  {output.objectType}
                </span>
              </span>
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border shadow-sm transition",
                  ready
                    ? "border-emerald-200 bg-white text-emerald-700 dark:border-emerald-400/28 dark:bg-emerald-500/12 dark:text-emerald-100"
                    : "border-violet-200 bg-white text-violet-700 group-hover:scale-105 dark:border-violet-400/24 dark:bg-violet-500/12 dark:text-violet-100",
                )}
              >
                {ready ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </span>
            </span>

            <span className="mt-auto block">
              {ready ? (
                <>
                  {output.fileName ? (
                    <span className="block truncate text-sm font-medium text-foreground">
                      {output.fileName}
                    </span>
                  ) : null}
                  <span className="mt-1 block font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-200">
                    {output.objectCode}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("Ready object linked")}
                  </span>
                </>
              ) : (
                <span className="text-sm font-medium text-violet-700 dark:text-violet-100">
                  {t("Add ready object")}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function OutputObjectUploadDialog({
  draft,
  error,
  pending,
  onDraftChange,
  onClose,
  onSubmit,
}: {
  draft: OutputObjectUploadDraft | null;
  error: string;
  pending: boolean;
  onDraftChange: (draft: OutputObjectUploadDraft | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        className="max-w-xl overflow-hidden rounded-[2rem] border border-violet-100 p-0 shadow-[0_34px_120px_rgba(109,40,217,0.22)] dark:border-violet-300/22"
      >
        <form onSubmit={onSubmit}>
          <DialogHeader className="border-b border-violet-100 px-6 py-5 text-left dark:border-violet-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold">
              {t("Upload output object")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Provide a public download URL. The SDK validates the downloaded content against the exact PGO type before creating a ready object.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 px-6 py-6">
            <div className="grid gap-2 rounded-2xl border border-violet-100 bg-violet-50/55 p-4 dark:border-violet-400/18 dark:bg-violet-500/10">
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                {draft?.role ?? "-"}
              </span>
              <span className="font-semibold text-foreground">
                {draft ? bindingTypeLabel(draft.objectType) : "-"}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {draft?.objectType ?? "-"}
              </span>
            </div>

            <Field label="File name">
              <Input
                value={draft?.fileName ?? ""}
                onChange={(event) =>
                  draft &&
                  onDraftChange({ ...draft, fileName: event.target.value })
                }
                placeholder="result.pgobject.json"
                disabled={pending}
                autoFocus
                required
              />
            </Field>
            <Field label="Download URL">
              <Input
                value={draft?.downloadUrl ?? ""}
                onChange={(event) =>
                  draft &&
                  onDraftChange({ ...draft, downloadUrl: event.target.value })
                }
                placeholder="https://example.org/result.pgobject.json"
                inputMode="url"
                type="url"
                disabled={pending}
                required
              />
            </Field>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-400/24 dark:bg-amber-500/12 dark:text-amber-100">
              {t(
                "Only finalized PGO wrappers supplied by HTTPS download URL are supported. File Storage references and in-progress objects are not accepted.",
              )}
            </div>
            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-3 border-violet-100 bg-violet-50/55 px-6 py-5 dark:border-violet-300/14 dark:bg-violet-950/16">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={pending || !draft}
              className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {pending ? t("Creating object...") : t("Create and link object")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <div className={SUPPORT_SERVICE_TABLE_SHELL_CLASS}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Role")}</TableHead>
            <TableHead>{t("Object type")}</TableHead>
            <TableHead>{t("Object ID")}</TableHead>
            <TableHead>{t("Revision")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slots.map((slot, index) => {
            const mustAttachNow =
              slot.required && slot.acceptedTypes.includes(FORM_OBJECT_TYPE);

            return (
              <Fragment key={`${slot.role}-${index}`}>
                <TableRow>
                  <TableCell className="font-mono text-sm">
                    {slot.role}
                    {slot.required ? (
                      <Badge variant="outline" className="ml-2">
                        {t("Required")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-[14rem]">
                    <Badge variant="secondary">
                      {bindingTypeLabel(slot.objectType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-[16rem]">
                    <Input
                      aria-label={`${t("Object ID")} · ${slot.role}`}
                      value={slot.objectId}
                      onChange={(event) =>
                        onChange(index, { objectId: event.target.value })
                      }
                      required={mustAttachNow}
                      placeholder="obj_..."
                    />
                  </TableCell>
                  <TableCell className="w-32">
                    <Input
                      aria-label={`${t("Revision")} · ${slot.role}`}
                      value={slot.revision}
                      onChange={(event) =>
                        onChange(index, { revision: event.target.value })
                      }
                      inputMode="numeric"
                      required={mustAttachNow || Boolean(slot.objectId)}
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="bg-violet-50/30 dark:bg-violet-500/[0.03]"
                  >
                    <div className="grid gap-4 py-2">
                      <label className="grid gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>{t("Object snapshot")}</span>
                        <Textarea
                          aria-label={`${t("Object snapshot")} · ${slot.role}`}
                          value={slot.objectSnapshotText}
                          onChange={(event) =>
                            onChange(index, {
                              objectSnapshotText: event.target.value,
                            })
                          }
                          required={mustAttachNow || Boolean(slot.objectId)}
                          rows={5}
                          className="font-mono text-xs font-normal normal-case tracking-normal"
                          placeholder={
                            '{"objectId":"obj_...","objectType":"pgo_...","revision":1}'
                          }
                        />
                      </label>
                      {slot.objectType === FORM_OBJECT_TYPE ? (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="grid gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>{t("Object code")}</span>
                            <Input
                              aria-label={`${t("Object code")} · ${slot.role}`}
                              value={slot.objectCode}
                              onChange={(event) =>
                                onChange(index, {
                                  objectCode: event.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 9),
                                })
                              }
                              required
                              inputMode="numeric"
                              maxLength={9}
                              placeholder="000000000"
                              className="font-normal normal-case tracking-normal"
                            />
                          </label>
                          <label className="grid gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>{t("Uploaded object ID")}</span>
                            <Input
                              aria-label={`${t("Uploaded object ID")} · ${slot.role}`}
                              value={slot.uploadedObjectId}
                              onChange={(event) =>
                                onChange(index, {
                                  uploadedObjectId: event.target.value,
                                })
                              }
                              required
                              className="font-normal normal-case tracking-normal"
                            />
                          </label>
                          <label className="grid gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>{t("File storage ID")}</span>
                            <Input
                              aria-label={`${t("File storage ID")} · ${slot.role}`}
                              value={slot.fileStorageId}
                              onChange={(event) =>
                                onChange(index, {
                                  fileStorageId: event.target.value,
                                })
                              }
                              required
                              className="font-normal normal-case tracking-normal"
                            />
                          </label>
                          <label className="grid gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>{t("Object owner ID")}</span>
                            <Input
                              aria-label={`${t("Object owner ID")} · ${slot.role}`}
                              value={slot.objectOwnerId}
                              onChange={(event) =>
                                onChange(index, {
                                  objectOwnerId: event.target.value,
                                })
                              }
                              required
                              className="font-normal normal-case tracking-normal"
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
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
  saveDisabled = false,
  deleteDisabled = false,
  canDelete,
  onDelete,
  saveLabel = "Save",
}: {
  title: string;
  backHref: string;
  backLabel: string;
  isSaving: boolean;
  saveDisabled?: boolean;
  deleteDisabled?: boolean;
  canDelete: boolean;
  onDelete: () => void;
  saveLabel?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between",
        SUPPORT_SERVICE_HEADER_CLASS,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-100 text-violet-700 shadow-inner dark:border-violet-400/20 dark:bg-violet-500/14 dark:text-violet-100">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold text-foreground">
            {t(title)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("Pocket Genes service contract")}
          </p>
        </div>
        <HeaderUnclutterButton />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          asChild
          type="button"
          variant="outline"
          size="sm"
          className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
        >
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
            disabled={deleteDisabled}
            className="h-9 rounded-xl border-destructive/30 bg-white/78 px-3 text-destructive shadow-sm hover:bg-destructive/5 hover:text-destructive dark:bg-slate-950/50"
          >
            <Trash2 className="h-4 w-4" />
            <span>{t("Delete")}</span>
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={isSaving || saveDisabled}
          className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
        >
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
    <section className={SUPPORT_SERVICE_SECTION_CLASS}>
      <div className="flex items-center gap-3 border-b border-violet-100/80 pb-4 dark:border-violet-400/14">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-700 shadow-inner dark:border-violet-400/18 dark:bg-violet-500/12 dark:text-violet-100">
          <FileText className="h-4 w-4" />
        </span>
        <h3 className="font-heading text-xl font-semibold text-foreground">
          {t(title)}
        </h3>
      </div>
      {children}
    </section>
  );
}

function GeneratedValue({ value }: { value: string }) {
  return (
    <div className="flex min-h-11 items-center rounded-xl border border-violet-100 bg-white/78 px-4 py-2 font-mono text-sm text-muted-foreground shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
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
    <Label className="grid gap-2 text-sm font-medium text-foreground">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t(label)}
      </span>
      {children}
    </Label>
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
