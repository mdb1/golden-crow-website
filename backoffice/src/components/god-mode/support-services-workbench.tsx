"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
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
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Binary,
  BriefcaseBusiness,
  Building2,
  ChartPie,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  ClipboardList,
  Copy,
  Download,
  FileText,
  Filter,
  Fingerprint,
  FlaskConical,
  ImageIcon,
  History,
  Link2,
  Loader2,
  LockKeyhole,
  Maximize2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Stethoscope,
  UserRound,
  Trash2,
  UploadCloud,
  Wand2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { FileJsonWizard } from "@/components/file-storage/file-json-wizard";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { PublisherPortalEmptyState } from "@/components/publisher-portal-empty-state";
import { ServiceOfferMoreInformationEditor } from "@/components/god-mode/service-offer-more-information-editor";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
import {
  SUPPORT_SERVICE_CATEGORIES,
  SUPPORT_SERVICE_CATEGORY_GROUPS,
  isSupportServiceCategoryKey,
  supportServiceCategoryByKey,
  supportServiceCategoryDescription,
  supportServiceCategoryName,
  type SupportServiceCategoryKey,
} from "@/lib/support-service-categories";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import type {
  DiscoverIndividualRecord,
  DiscoverIndividualsPage,
  DiscoverOrganizationRecord,
  DiscoverOrganizationsPage,
} from "@/lib/discover";
import { appText } from "@/lib/language";
import { publisherPortalServiceTransactionsByServiceIdRoute } from "@/lib/publisher-portal-routes";
import {
  SUPPORT_SERVICE_FORM_CSV_HEADER,
  SUPPORT_SERVICE_FORM_CSV_MAX_BYTES,
  TWO_PQ_STUDY_REQUEST_FORM_CSV_PATH,
  normalizeSupportServiceFormField,
  parseSupportServiceFormCsv,
} from "@/lib/support-service-form-csv";
import {
  SUPPORT_SERVICE_FORM_FIELD_TYPES,
  SUPPORT_SERVICE_MUTATION_MODES,
  SUPPORT_SERVICE_OFFER_STATUSES,
  SUPPORT_SERVICE_STAGES,
  SUPPORT_SERVICE_TRANSACTION_STATUSES,
  isSupportServiceMoreInformationHttpsUrl,
  isSupportServiceMoreInformationImageDataUrl,
  mutationModeLabel,
  offerStatusLabel,
  stageLabel,
  transactionStatusLabel,
  type SupportServiceCommercialTerms,
  type SupportServiceFormField,
  type SupportServiceFormFieldType,
  type SupportServiceInputSlot,
  type SupportServiceIdAvailability,
  type SupportServiceLinkedReportRecord,
  type SupportServiceLinkedReportsPage,
  type SupportServiceMutationMode,
  type SupportServiceMoreInformation,
  type SupportServiceOfferInput,
  type SupportServiceOfferRecord,
  type SupportServiceOfferUpdateInput,
  type SupportServiceOfferTransactionStats,
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
import {
  MAX_INLINE_STORED_FILE_BYTES,
  storedFileNameFromJsonTitle,
  storedFileContentByteLength,
  validateStoredFileJson,
} from "@/lib/file-storage";
import type {
  AdminUserRecord,
  ModerationDocumentRecord,
} from "@/lib/moderation-types";

type WorkbenchKind = "offers" | "transactions";

type CommunityUsersPage = {
  users: AdminUserRecord[];
  nextPageToken?: string;
};

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
  isHighlightedOffer: boolean;
  isProfessionalOffer: boolean;
  promotionalBannerImageUrl: string;
  promotionalBannerImageUploadDataUrl: string;
  promotionalBannerImageUploadName: string;
  promotionalBannerImageUploadMimeType: string;
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
  showsEstimatedTurnaround: boolean;
  moreInformation: SupportServiceMoreInformation;
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
  source: "downloadUrl" | "fileStorageId" | "newFile" | null;
  downloadUrl: string;
  fileStorageId: string;
  newFileContent: string;
  createdFileStorageId: string;
};

type CreatedOutputObject = {
  id: string;
  role: string;
  objectCode: string;
  objectType: string;
  fileName: string;
  downloadUrl?: string;
  fileStorageId?: string;
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
  outputReports: Array<{ reportCode: string }>;
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

type ServiceOfferSaveIntent = "save" | "status" | "publish";

type ServiceIdValidationStatus =
  | "idle"
  | "checking"
  | "available"
  | "conflict"
  | "error"
  | "locked";

type PromotionalBannerUploadStatus = {
  tone: "loading" | "success" | "warning" | "error";
  message: string;
  href?: string;
  linkLabel?: string;
};

type ProcessedPromotionalBannerUpload = {
  dataUrl: string;
  name: string;
  mimeType: string;
  compressed: boolean;
};

const SERVICE_PAGE_SIZE = 20;
const OFFERS_QUERY_KEY = "god-mode-support-service-offers";
const TRANSACTIONS_QUERY_KEY = "god-mode-support-service-transactions";
const TRANSACTION_REPORTS_QUERY_KEY =
  "god-mode-support-service-transaction-linked-reports";
const TRANSACTION_REPORT_CANDIDATES_QUERY_KEY =
  "god-mode-support-service-transaction-report-candidates";
const LIVE_OFFERS_QUERY_KEY = "god-mode-support-service-offers-live-picker";
const EMPTY_SUPPORT_SERVICE_OFFERS: SupportServiceOfferRecord[] = [];
const FORM_OBJECT_TYPE = "pgo_form";
const DEFAULT_OUTPUT_OBJECT_TYPE = "pgo_pdf_report";
const PROMOTIONAL_BANNER_IMAGE_UPLOAD_MAX_BYTES = 600 * 1024;
const PROMOTIONAL_BANNER_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH = 900000;
const PROMOTIONAL_BANNER_IMAGE_WIDTH = 1024;
const PROMOTIONAL_BANNER_IMAGE_HEIGHT = 500;
const GENERATED_SERVICE_ID_PATTERN =
  /^pgs_[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]{5}$/;
const CURRENT_SERVICE_VERSION_CHART_COLOR = "#059669";
const SERVICE_VERSION_CHART_COLORS = [
  "#7c3aed",
  "#0891b2",
  "#d97706",
  "#e11d48",
  "#4f46e5",
  "#0d9488",
  "#c026d3",
];
const PROMOTIONAL_BANNER_IMAGE_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const PROMOTIONAL_BANNER_IMAGE_COMPRESSION_MIME_TYPES = [
  "image/webp",
  "image/jpeg",
] as const;
const PROMOTIONAL_BANNER_IMAGE_COMPRESSION_QUALITY_STEPS = [
  0.86, 0.76, 0.66, 0.56, 0.46, 0.36,
] as const;
const IMAGE_REDUCER_URL = "https://squoosh.app/";
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
const SUPPORT_SERVICE_EDITOR_HEADER_CLASS =
  "relative overflow-hidden border-b border-violet-200/80 bg-[linear-gradient(135deg,rgba(250,245,255,0.98),rgba(245,243,255,0.96)_52%,rgba(224,242,254,0.78))] px-5 py-5 text-violet-950 shadow-[0_18px_50px_-38px_rgba(109,40,217,0.45)] dark:border-violet-400/18 dark:bg-[linear-gradient(135deg,rgba(46,30,88,0.90),rgba(30,24,57,0.92)_52%,rgba(14,116,144,0.22))] dark:text-violet-50 lg:px-6";
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

const SERVICE_OFFER_WIZARD_STEPS = [
  {
    title: "Offer identity",
    description: "Choose the name and primary category for this service.",
  },
  {
    title: "Offer visibility",
    description: "Choose where and how this offer appears in the native app.",
  },
  {
    title: "Promotional image",
    description: "Add the banner people will see when they discover this service.",
  },
  {
    title: "Service presentation",
    description: "Explain what the requester receives and what you do.",
  },
  {
    title: "More information",
    description: "Build optional rich sections for the service detail experience.",
  },
  {
    title: "Request form",
    description: "Optionally collect structured information with the service request.",
  },
  {
    title: "Commercial terms",
    description: "Set optional pricing and delivery-time information.",
  },
  {
    title: "Conditions and limitations",
    description: "Add optional acceptance conditions and service limitations.",
  },
  {
    title: "Service pipeline",
    description: "Review the calculated contract and its suggested execution stages.",
  },
  {
    title: "Review and publish",
    description: "Review the offer, save a private draft, or publish it now.",
  },
] as const;

const SERVICE_OFFER_WIZARD_LAST_STEP = SERVICE_OFFER_WIZARD_STEPS.length - 1;

function formatPromotionalBannerFileSize(bytes: number) {
  const kilobytes = bytes / 1024;
  return kilobytes < 1024
    ? `${Math.round(kilobytes)} KB`
    : `${(kilobytes / 1024).toFixed(1)} MB`;
}

function promotionalBannerFileName(file: File, mimeType: string) {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const rawName = file.name || `promotional-banner.${extension}`;
  const baseName = rawName.replace(/\.[^.]+$/, "") || "promotional-banner";
  return `${baseName}-1024x500.${extension}`;
}

function readPromotionalBannerAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("IMAGE_READ_FAILED"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("IMAGE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function loadPromotionalBannerImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("IMAGE_LOAD_FAILED"));
    };
    image.src = objectUrl;
  });
}

function canResizePromotionalBanner() {
  return (
    typeof document !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.toBlob === "function"
  );
}

function drawPromotionalBannerImage(
  image: HTMLImageElement,
  mimeType: string,
) {
  const sourceWidth = image.naturalWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.height || 0;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
  }

  const targetAspect =
    PROMOTIONAL_BANNER_IMAGE_WIDTH / PROMOTIONAL_BANNER_IMAGE_HEIGHT;
  const sourceAspect = sourceWidth / sourceHeight;
  const cropWidth =
    sourceAspect > targetAspect
      ? Math.round(sourceHeight * targetAspect)
      : sourceWidth;
  const cropHeight =
    sourceAspect > targetAspect
      ? sourceHeight
      : Math.round(sourceWidth / targetAspect);
  const sourceX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
  const sourceY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("CANVAS_UNAVAILABLE");
  }

  canvas.width = PROMOTIONAL_BANNER_IMAGE_WIDTH;
  canvas.height = PROMOTIONAL_BANNER_IMAGE_HEIGHT;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(
      0,
      0,
      PROMOTIONAL_BANNER_IMAGE_WIDTH,
      PROMOTIONAL_BANNER_IMAGE_HEIGHT,
    );
  }
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    PROMOTIONAL_BANNER_IMAGE_WIDTH,
    PROMOTIONAL_BANNER_IMAGE_HEIGHT,
  );
  return canvas;
}

function promotionalBannerCanvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

async function resizePromotionalBannerFile(file: File) {
  const image = await loadPromotionalBannerImage(file);
  for (const mimeType of PROMOTIONAL_BANNER_IMAGE_COMPRESSION_MIME_TYPES) {
    const canvas = drawPromotionalBannerImage(image, mimeType);
    for (const quality of PROMOTIONAL_BANNER_IMAGE_COMPRESSION_QUALITY_STEPS) {
      const blob = await promotionalBannerCanvasToBlob(
        canvas,
        mimeType,
        quality,
      );
      if (
        blob &&
        blob.size > 0 &&
        blob.size <= PROMOTIONAL_BANNER_IMAGE_UPLOAD_MAX_BYTES
      ) {
        return new File([blob], promotionalBannerFileName(file, mimeType), {
          type: mimeType,
          lastModified: Date.now(),
        });
      }
    }
  }
  throw new Error("IMAGE_COMPRESSION_FAILED");
}

async function processPromotionalBannerFile(
  file: File,
): Promise<ProcessedPromotionalBannerUpload> {
  if (!PROMOTIONAL_BANNER_IMAGE_UPLOAD_TYPES.has(file.type)) {
    throw new Error("IMAGE_TYPE_UNSUPPORTED");
  }
  const finalFile = canResizePromotionalBanner()
    ? await resizePromotionalBannerFile(file)
    : file;
  const dataUrl = await readPromotionalBannerAsDataUrl(finalFile);
  if (dataUrl.length > PROMOTIONAL_BANNER_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH) {
    throw new Error("IMAGE_COMPRESSION_FAILED");
  }
  return {
    dataUrl,
    name: finalFile.name,
    mimeType: finalFile.type,
    compressed: finalFile !== file,
  };
}

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

function normalizedFormField(
  field: FormFieldDraft,
  existingKeys: ReadonlySet<string> = new Set<string>(),
): SupportServiceFormField {
  const isEnum = field.type === "enum" || field.type === "multi_enum";
  return normalizeSupportServiceFormField(
    {
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      helpInfoText: field.helpInfoText,
      options: isEnum ? parseOptionsText(field.optionsText) : undefined,
    },
    existingKeys,
  );
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

  const isoMatch = normalized.match(/^p(?:t)?([1-9]\d*)([wdhm])$/);
  if (isoMatch) {
    return `${isoMatch[1]}${isoMatch[2]}`;
  }

  const textMatch = normalized.match(
    /([1-9]\d*)\s*(?:business\s*)?(weeks?|wks?|w|semanas?|sem|days?|d|d[ií]as?|hours?|hrs?|h|horas?|minutes?|mins?|m|minutos?)(?![a-záéíóúüñ])/,
  );
  if (!textMatch) {
    return undefined;
  }

  const unitText = textMatch[2];
  const unit: TurnaroundUnit =
    unitText.startsWith("week") ||
    unitText.startsWith("wk") ||
    unitText.startsWith("sem") ||
    unitText === "w"
      ? "w"
      : unitText.startsWith("day") ||
          unitText.startsWith("dí") ||
          unitText.startsWith("di") ||
          unitText === "d"
        ? "d"
        : unitText.startsWith("hour") ||
            unitText.startsWith("hr") ||
            unitText.startsWith("hora") ||
            unitText === "h"
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

function commercialTermsFormValue(
  value: SupportServiceCommercialTerms | undefined,
): SupportServiceCommercialTerms {
  if (!value) {
    return {
      pricingModel: "not_specified",
      price: { currency: "ARS" },
    };
  }

  return {
    ...value,
    price: value.price ? { ...value.price } : undefined,
    turnaround: compactTurnaround(value.turnaround),
  };
}

function slugKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function randomServiceIdSuffix(excludedServiceId = "") {
  const excludedSuffix = excludedServiceId.match(/_(\d{5})$/)?.[1];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = String(
      Math.floor(10_000 + Math.random() * 90_000),
    );
    if (candidate !== excludedSuffix) {
      return candidate;
    }
  }

  const fallback = excludedSuffix ? Number(excludedSuffix) : 9_999;
  return String(fallback >= 99_999 ? 10_000 : fallback + 1);
}

function generatedOfferIds(providerName: string, excludedServiceId = "") {
  const slug = slugKey(providerName);
  if (!slug) {
    return null;
  }

  const suffix = randomServiceIdSuffix(excludedServiceId);

  return {
    serviceId: `pgs_${slug}_${suffix}`,
    formShapeId: `pgfs_${slug}_${suffix}`,
  };
}

function formShapeIdForServiceId(serviceId: string) {
  return serviceId.startsWith("pgs_")
    ? `pgfs_${serviceId.slice("pgs_".length)}`
    : "pgfs_";
}

function applyGeneratedOfferIds<T extends OfferFormState>(form: T): T {
  const ids = generatedOfferIds(form.providerName, form.serviceId);
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
    fields: formFieldsFromRecord(),
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

function defaultWizardOutputSlot(): SupportServiceOutputSlot {
  return {
    role: "pdf_report",
    objectType: DEFAULT_OUTPUT_OBJECT_TYPE,
    mutationMode: "new_object",
  };
}

function simplifiedWizardContract(form: OfferFormState): OfferFormState {
  return {
    ...form,
    inputSlots: form.supportsFormShape ? [defaultFormInputSlot()] : [],
    outputSlots: [defaultWizardOutputSlot()],
  };
}

function serviceOutputSlots(slots: SupportServiceOutputSlot[]) {
  return slots.filter(
    (slot) => slot.objectType && slot.objectType !== FORM_OBJECT_TYPE,
  );
}

function moreInformationFormValue(
  value: SupportServiceMoreInformation | null | undefined,
): SupportServiceMoreInformation {
  return {
    frequentQuestions: value?.frequentQuestions?.map((item) => ({ ...item })),
    keyInsights: value?.keyInsights?.map((item) => ({ ...item })),
    scientificFacts: value?.scientificFacts?.map((item) => ({ ...item })),
    usefulLinks: value?.usefulLinks?.map((item) => ({ ...item })),
    sampleLink: value?.sampleLink ? { ...value.sampleLink } : undefined,
    bulletSegments: value?.bulletSegments?.map((item) => ({ ...item })),
    technicalInformationFacts: value?.technicalInformationFacts?.map(
      (item) => ({ ...item, subitems: [...item.subitems] }),
    ),
    biologicalSampleRequirements:
      value?.biologicalSampleRequirements?.map((item) => ({ ...item })),
    websiteUrl: value?.websiteUrl ?? undefined,
  };
}

function normalizedMoreInformationPayload(
  value: SupportServiceMoreInformation,
): SupportServiceMoreInformation | undefined {
  const requiredText = (text: string, label: string) => {
    const normalized = text.trim();
    if (!normalized) {
      throw new Error(`${label} is required.`);
    }
    return normalized;
  };
  const httpsUrl = (url: string, label: string) => {
    const normalized = requiredText(url, label);
    if (!isSupportServiceMoreInformationHttpsUrl(normalized)) {
      throw new Error(`${label} must be a valid HTTPS URL.`);
    }
    return normalized;
  };
  const frequentQuestions = value.frequentQuestions?.map((item, index) => ({
    question: requiredText(
      item.question,
      `Frequent question ${index + 1} question`,
    ),
    answer: requiredText(
      item.answer,
      `Frequent question ${index + 1} answer`,
    ),
  }));
  const titleDescriptionItems = (
    items: Array<{ title: string; description: string }> | null | undefined,
    label: string,
  ) =>
    items?.map((item, index) => ({
      title: requiredText(item.title, `${label} ${index + 1} title`),
      description: requiredText(
        item.description,
        `${label} ${index + 1} description`,
      ),
    }));
  const keyInsights = titleDescriptionItems(value.keyInsights, "Key insight");
  const scientificFacts = titleDescriptionItems(
    value.scientificFacts,
    "Scientific fact",
  );
  const usefulLinks = value.usefulLinks?.map((item, index) => ({
    title: requiredText(item.title, `Useful link ${index + 1} title`),
    url: httpsUrl(item.url, `Useful link ${index + 1} URL`),
  }));
  const sampleLink = value.sampleLink
    ? {
        title: requiredText(value.sampleLink.title, "Sample link title"),
        description: requiredText(
          value.sampleLink.description,
          "Sample link description",
        ),
        buttonTitle: requiredText(
          value.sampleLink.buttonTitle,
          "Sample link button title",
        ),
        url: httpsUrl(value.sampleLink.url, "Sample link URL"),
      }
    : undefined;
  const bulletSegments = value.bulletSegments?.map((item, index) => {
    const label = `Illustrated segment ${index + 1}`;
    const imageUrl = item.imageUrl?.trim() ?? "";
    const imageUploadDataUrl = item.imageUploadDataUrl ?? "";
    if (Boolean(imageUrl) === Boolean(imageUploadDataUrl)) {
      throw new Error(
        `${label} requires either an image URL or an uploaded image.`,
      );
    }
    if (
      imageUploadDataUrl &&
      !isSupportServiceMoreInformationImageDataUrl(imageUploadDataUrl)
    ) {
      throw new Error(`${label} uploaded image is invalid or too large.`);
    }
    return {
      title: requiredText(item.title, `${label} title`),
      description: requiredText(item.description, `${label} description`),
      ...(imageUrl
        ? { imageUrl: httpsUrl(imageUrl, `${label} image URL`) }
        : { imageUploadDataUrl }),
    };
  });
  const technicalInformationFacts = value.technicalInformationFacts?.map(
    (item, index) => ({
      title: requiredText(item.title, `Technical fact ${index + 1} title`),
      description: requiredText(
        item.description,
        `Technical fact ${index + 1} description`,
      ),
      subitems: item.subitems.map((subitem, subitemIndex) =>
        requiredText(
          subitem,
          `Technical fact ${index + 1} supporting point ${subitemIndex + 1}`,
        ),
      ),
    }),
  );
  const biologicalSampleRequirements =
    value.biologicalSampleRequirements?.map((item, index) => ({
      title: requiredText(item.title, `Sample requirement ${index + 1} title`),
      description: requiredText(
        item.description,
        `Sample requirement ${index + 1} description`,
      ),
      instructions: requiredText(
        item.instructions,
        `Sample requirement ${index + 1} instructions`,
      ),
    }));
  const websiteUrl = value.websiteUrl?.trim()
    ? httpsUrl(value.websiteUrl, "Website URL")
    : undefined;
  const normalized = {
    ...(frequentQuestions?.length ? { frequentQuestions } : {}),
    ...(keyInsights?.length ? { keyInsights } : {}),
    ...(scientificFacts?.length ? { scientificFacts } : {}),
    ...(usefulLinks?.length ? { usefulLinks } : {}),
    ...(sampleLink ? { sampleLink } : {}),
    ...(bulletSegments?.length ? { bulletSegments } : {}),
    ...(technicalInformationFacts?.length
      ? { technicalInformationFacts }
      : {}),
    ...(biologicalSampleRequirements?.length
      ? { biologicalSampleRequirements }
      : {}),
    ...(websiteUrl ? { websiteUrl } : {}),
  } satisfies SupportServiceMoreInformation;

  return Object.keys(normalized).length ? normalized : undefined;
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
    isHighlightedOffer: false,
    isProfessionalOffer: true,
    promotionalBannerImageUrl: "",
    promotionalBannerImageUploadDataUrl: "",
    promotionalBannerImageUploadName: "",
    promotionalBannerImageUploadMimeType: "",
    description: "",
    providerWork: "",
    supportsFormShape: false,
    formShape: defaultFormShape(),
    inputSlots: [],
    outputSlots: [],
    acceptedConditionsText: "",
    scopeRulesText: "",
    commercialTerms: {
      pricingModel: "not_specified",
      price: { currency: "ARS" },
    },
    showsEstimatedTurnaround: false,
    moreInformation: {},
  };
}

function initialOfferForm(
  mode: "create" | "edit",
  presentation: "form" | "wizard",
): OfferFormState {
  const initialForm = defaultOfferForm();
  if (mode !== "create" || presentation !== "wizard") {
    return initialForm;
  }

  const outputSlots = [defaultWizardOutputSlot()];

  return {
    ...initialForm,
    isHighlightedOffer: true,
    isProfessionalOffer: false,
    stages: predictedStagesForContract(initialForm.inputSlots, outputSlots),
    outputSlots,
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
  const hasFormShape = Boolean(catalogOffer.formShape?.id);
  const catalogInputSlots = catalogOffer.inputSlots.map((slot) =>
    singleInputSlot({ ...slot }),
  );
  return {
    serviceId: catalogOffer.serviceId,
    serviceVersion: catalogOffer.serviceVersion,
    name: catalogOffer.name,
    serviceCategory: catalogOffer.serviceCategory,
    providerKind: currentProvider.providerKind,
    providerId: currentProvider.providerId,
    providerName: currentProvider.providerName,
    stages: catalogOffer.stages.length
      ? catalogOffer.stages
      : ["test_planning"],
    status: "draft",
    isHiddenFromSearch: catalogOffer.isHiddenFromSearch,
    isHighlightedOffer: catalogOffer.isHighlightedOffer,
    isProfessionalOffer: catalogOffer.isProfessionalOffer,
    promotionalBannerImageUrl:
      catalogOffer.promotionalBannerImageUrl ?? "",
    promotionalBannerImageUploadDataUrl:
      catalogOffer.promotionalBannerImageUploadDataUrl ?? "",
    promotionalBannerImageUploadName: "",
    promotionalBannerImageUploadMimeType: "",
    description: catalogOffer.description,
    providerWork: catalogOffer.providerWork,
    supportsFormShape: hasFormShape,
    formShape: hasFormShape
      ? {
          id: catalogOffer.formShape!.id,
          version: catalogOffer.formShape!.version,
          allowUnknownFields: Boolean(
            catalogOffer.formShape!.allowUnknownFields,
          ),
          fields: formFieldsFromRecord(catalogOffer.formShape!.fields),
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
    commercialTerms: commercialTermsFormValue({
      pricingModel:
        catalogOffer.commercialTerms.pricingModel ?? "not_specified",
      price: { ...catalogOffer.commercialTerms.price },
      turnaround: catalogOffer.commercialTerms.turnaround,
    }),
    showsEstimatedTurnaround: Boolean(
      compactTurnaround(catalogOffer.commercialTerms.turnaround),
    ),
    moreInformation: moreInformationFormValue(catalogOffer.moreInformation),
  };
}

function offerFormFromRecord(
  record: SupportServiceOfferRecord,
): OfferFormState {
  const hasFormShape = Boolean(record.formShape?.id);
  const recordInputSlots = (record.inputSlots ?? []).map((slot) =>
    singleInputSlot({ ...slot }),
  );
  return {
    serviceId: record.serviceId,
    serviceVersion: record.serviceVersion,
    name: record.name,
    serviceCategory: isSupportServiceCategoryKey(record.serviceCategory)
      ? record.serviceCategory
      : "",
    providerKind: record.providerKind ?? "organization",
    providerId: record.providerId,
    providerName: record.providerName ?? "",
    stages: record.stages.length ? record.stages : ["test_planning"],
    status: record.status,
    isHiddenFromSearch: record.isHiddenFromSearch,
    isHighlightedOffer: record.isHighlightedOffer ?? false,
    isProfessionalOffer: record.isProfessionalOffer ?? true,
    promotionalBannerImageUrl: record.promotionalBannerImageUrl ?? "",
    promotionalBannerImageUploadDataUrl:
      record.promotionalBannerImageUploadDataUrl ?? "",
    promotionalBannerImageUploadName: "",
    promotionalBannerImageUploadMimeType: "",
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
      (record.outputSlots ?? []).map((slot) => ({ ...slot })),
    ),
    acceptedConditionsText: record.acceptedConditions.join("\n"),
    scopeRulesText: record.scopeRules.join("\n"),
    commercialTerms: commercialTermsFormValue(record.commercialTerms),
    showsEstimatedTurnaround: Boolean(
      compactTurnaround(record.commercialTerms?.turnaround),
    ),
    moreInformation: moreInformationFormValue(record.moreInformation),
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
  const right = outputs.length ? outputs.join(" + ") : "none";

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
    isHighlightedOffer: offer.isHighlightedOffer,
    isProfessionalOffer: offer.isProfessionalOffer,
    promotionalBannerImageUrl: offer.promotionalBannerImageUrl,
    promotionalBannerImageUploadDataUrl: offer.promotionalBannerImageUrl?.trim()
      ? null
      : offer.promotionalBannerImageUploadDataUrl,
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
    inputSlots: (offer.inputSlots ?? []).map((slot) => ({ ...slot })),
    outputSlots: (offer.outputSlots ?? []).map((slot) => ({ ...slot })),
    acceptedConditions: [...offer.acceptedConditions],
    scopeRules: [...offer.scopeRules],
    commercialTerms: offer.commercialTerms,
    moreInformation: offer.moreInformation
      ? moreInformationFormValue(offer.moreInformation)
      : offer.moreInformation,
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
    outputReports: [],
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
    outputReports: [],
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
    outputReports: [...(record.outputReports ?? [])],
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

function offerPayloadFromForm(form: OfferFormState): SupportServiceOfferInput {
  if (!form.name.trim()) {
    throw new Error("Offer name is required.");
  }
  if (!form.providerId.trim()) {
    throw new Error("Choose an organization or professional provider.");
  }
  const serviceId = form.serviceId.trim();
  const formShapeId = formShapeIdForServiceId(serviceId);
  assertIdentifier(serviceId, "pgs", "Service ID");
  if (!form.description.trim()) {
    throw new Error("Description is required.");
  }
  if (!form.providerWork.trim()) {
    throw new Error("Provider work is required.");
  }
  if (!form.stages.length) {
    throw new Error("At least one stage is required.");
  }
  if (form.promotionalBannerImageUrl.trim()) {
    let promotionalBannerUrl: URL;
    try {
      promotionalBannerUrl = new URL(form.promotionalBannerImageUrl.trim());
    } catch {
      throw new Error(
        "Promotional banner image URL must be a valid HTTPS URL.",
      );
    }
    if (
      promotionalBannerUrl.protocol !== "https:" ||
      !promotionalBannerUrl.hostname
    ) {
      throw new Error(
        "Promotional banner image URL must be a valid HTTPS URL.",
      );
    }
  }
  const formSlots = form.inputSlots.filter(isFormInputSlot);
  if (form.supportsFormShape) {
    assertIdentifier(formShapeId, "pgfs", "Form shape ID");
    if (formSlots.length !== 1) {
      throw new Error("A form shape requires exactly one pgo_form input slot.");
    }
  } else if (formSlots.length > 0) {
    throw new Error("A pgo_form input slot requires a form shape.");
  }

  const fieldKeys = new Set<string>();
  const fields = form.supportsFormShape
    ? form.formShape.fields.map((field) => {
        const normalized = normalizedFormField(field, fieldKeys);
        fieldKeys.add(normalized.key);
        return normalized;
      })
    : [];

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
  if (
    form.showsEstimatedTurnaround &&
    !compactTurnaround(form.commercialTerms.turnaround)
  ) {
    throw new Error("Enter an approximate delivery time.");
  }
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
  const serviceCategory = form.serviceCategory;
  if (!isSupportServiceCategoryKey(serviceCategory)) {
    throw new Error("Choose one service category.");
  }

  return {
    serviceId,
    serviceVersion: form.serviceVersion || 1,
    name: form.name.trim(),
    serviceCategory,
    providerKind: form.providerKind,
    providerId: form.providerId.trim(),
    providerName: form.providerName.trim(),
    stages: form.stages,
    status: form.status,
    isHiddenFromSearch: form.isHiddenFromSearch,
    isHighlightedOffer: form.isHighlightedOffer,
    isProfessionalOffer: form.isProfessionalOffer,
    promotionalBannerImageUrl:
      form.promotionalBannerImageUrl.trim() || null,
    promotionalBannerImageUploadDataUrl:
      form.promotionalBannerImageUrl.trim()
        ? null
        : form.promotionalBannerImageUploadDataUrl || null,
    description: form.description.trim(),
    shortContract: calculatedShortContract(form.inputSlots, form.outputSlots),
    providerWork: form.providerWork.trim(),
    formShape: form.supportsFormShape
      ? {
          id: formShapeId,
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
    commercialTerms: commercialTermsPayload(
      form.showsEstimatedTurnaround
        ? form.commercialTerms
        : { ...form.commercialTerms, turnaround: undefined },
    ),
    moreInformation: normalizedMoreInformationPayload(form.moreInformation),
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
  options: { includeInputs?: boolean } = {},
): SupportServiceTransactionInput {
  assertIdentifier(form.requestId, "pgr", "Request ID");
  assertIdentifier(form.serviceId, "pgs", "Service ID");
  if (!form.offerId.trim()) {
    throw new Error("Offer ID is required.");
  }
  if (!form.providerId.trim()) {
    throw new Error("Provider ID is required.");
  }
  const requestedByUserId = form.requestedByUserId.trim();
  const requestedByUserEmail = form.requestedByUserEmail.trim().toLowerCase();
  if (!requestedByUserId && !requestedByUserEmail) {
    throw new Error("Choose a requester or enter a requester email.");
  }
  if (
    requestedByUserEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedByUserEmail)
  ) {
    throw new Error("Requester email must be valid.");
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
  const includeInputs = options.includeInputs !== false;
  if (includeInputs) {
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
  }

  const inputs = includeInputs
    ? form.inputs
        .filter((slot) => slot.objectId.trim())
        .map((slot) => {
          assertIdentifier(
            slot.objectId,
            "obj",
            `Input ${slot.role} object ID`,
          );
          if (!/^pgo_[a-z0-9_]+$/.test(slot.objectType)) {
            throw new Error(
              `Input ${slot.role} needs a concrete PGO object type.`,
            );
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
              throw new Error(
                `Input ${slot.role} needs a 9-digit object code.`,
              );
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
        })
    : undefined;
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
    requestedByUserId: requestedByUserId || undefined,
    requestedByUserEmail: requestedByUserEmail || undefined,
    requestedAt: form.requestedAt.trim() || undefined,
    requestedAtClient: form.requestedAtClient.trim(),
    status: form.status,
    requestRevision: form.requestRevision || 1,
    idempotencyKey: form.idempotencyKey.trim(),
    inputs,
    outputObjects,
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

function requestErrorLog(error: unknown) {
  if (error instanceof SdkRequestError) {
    return error.details;
  }

  if (error instanceof Error) {
    return [
      `Error: ${error.message}`,
      error.stack ? `Stack:\n${error.stack}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  try {
    return `Error:\n${JSON.stringify(error, null, 2)}`;
  } catch {
    return `Error: ${String(error)}`;
  }
}

function rawJsonContent(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function rawJsonFileName(prefix: string, id?: string) {
  const safeId = (id || "record")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${prefix}-${safeId || "record"}.json`;
}

function downloadJsonFile(fileName: string, content: string) {
  const blob = new Blob([content], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

export function SupportServicesBrowser({
  kind,
  routeBase,
  canCreate = true,
  canDelete = true,
  publisherPresentation = false,
  publisherEmptyActionHref,
  displayTitle,
  recordColumnLabel,
  initialServiceIdFilter = "",
}: {
  kind: WorkbenchKind;
  routeBase?: string;
  canCreate?: boolean;
  canDelete?: boolean;
  publisherPresentation?: boolean;
  publisherEmptyActionHref?: string;
  displayTitle?: string;
  recordColumnLabel?: string;
  initialServiceIdFilter?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ServiceFilters>(() => ({
    ...emptyFilters(),
    serviceId:
      kind === "transactions" ? initialServiceIdFilter.trim() : "",
  }));
  const [toastCounter, setToastCounter] = useState(1);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [listErrorLogOpen, setListErrorLogOpen] = useState(false);
  const isOffers = kind === "offers";
  const queryKey = isOffers ? OFFERS_QUERY_KEY : TRANSACTIONS_QUERY_KEY;
  const route = routeBase ?? baseRoute(kind);

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
  const allowDelete = canDelete && !publisherPresentation;
  const listErrorLog = useMemo(
    () => (listQuery.error ? requestErrorLog(listQuery.error) : ""),
    [listQuery.error],
  );

  useEffect(() => {
    if (!listQuery.isError) {
      setListErrorLogOpen(false);
    }
  }, [listQuery.isError]);

  const deleteMutation = useMutation({
    mutationFn: async (
      record: SupportServiceOfferRecord | SupportServiceTransactionRecord,
    ) =>
      sdkFetch<{ deleted: boolean; cleanupWarnings?: string[] }>(
        `${apiBasePath(kind)}/${encodeURIComponent(record.id)}`,
        {
        method: "DELETE",
        },
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: [queryKey] });
      const cleanupWarnings = result?.cleanupWarnings ?? [];
      setToast({
        id: nextToastId(),
        tone: "success",
        message:
          cleanupWarnings.length > 0
            ? `${t("Service transaction deleted. Secondary cleanup warnings:")} ${cleanupWarnings.join(" ")}`
            : isOffers
              ? t("Service offer deleted.")
              : t("Service transaction deleted."),
        durationMs: cleanupWarnings.length > 0 ? 15000 : undefined,
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

  const title =
    displayTitle ?? (isOffers ? "Service Offers" : "Service Transactions");
  const createLabel = isOffers
    ? "Alta de service offer"
    : "Alta de transaccion";
  const isInitialLoading = listQuery.isLoading && rows.length === 0;
  const hasActiveFilters = Boolean(
    filters.query.trim() ||
      filters.status !== "all" ||
      (isOffers
        ? filters.stage !== "all"
        : filters.serviceId.trim()),
  );
  const showPublisherEmptyState =
    publisherPresentation &&
    listQuery.isSuccess &&
    rows.length === 0 &&
    !listQuery.hasNextPage;
  const isPublisherTrueEmpty =
    showPublisherEmptyState && !hasActiveFilters;
  const showPublisherRows =
    publisherPresentation &&
    (rows.length > 0 || showPublisherEmptyState);
  const hidePublisherListFooter =
    publisherPresentation && rows.length === 0 && !listQuery.hasNextPage;
  const publisherEmptyAction = !isPublisherTrueEmpty
    ? undefined
    : isOffers
      ? canCreate
        ? {
            href: `${route}/new`,
            label: t("Create your first service offer"),
            icon: Plus,
          }
        : undefined
      : publisherEmptyActionHref
        ? {
            href: publisherEmptyActionHref,
            label: t("Review service offers"),
            icon: BriefcaseBusiness,
          }
        : undefined;
  const publisherEmptyState = showPublisherEmptyState ? (
    <PublisherPortalEmptyState
      icon={isOffers ? BriefcaseBusiness : ClipboardList}
      title={
        isPublisherTrueEmpty
          ? t(isOffers ? "No service offers yet" : "No service requests yet")
          : t(
              isOffers
                ? "No service offers match your filters"
                : "No service requests match your filters",
            )
      }
      description={
        isPublisherTrueEmpty
          ? t(
              isOffers
                ? "Create your first service offer so people can discover and request what you provide."
                : "New requests will appear here when someone chooses one of your published services.",
            )
          : t("Try changing or clearing your search and filters.")
      }
      action={publisherEmptyAction}
    />
  ) : undefined;

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <Dialog open={listErrorLogOpen} onOpenChange={setListErrorLogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("Request log")}</DialogTitle>
            <DialogDescription>
              {t("Full request and response details for this failed list load.")}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/80 bg-muted/30 p-3 font-mono text-xs leading-5 text-foreground">
            {listErrorLog || t("No log details are available.")}
          </pre>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setListErrorLogOpen(false)}
            >
              {t("Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              {canCreate && !isPublisherTrueEmpty ? (
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
              ) : null}
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
          {showPublisherRows ? (
            <PublisherSupportServiceRows
              kind={kind}
              offers={offers}
              transactions={transactions}
              route={route}
              emptyState={publisherEmptyState}
            />
          ) : (
          <Table>
            <TableHeader>
              {isOffers ? (
                <TableRow>
                  <TableHead>{t("Offer")}</TableHead>
                  <TableHead>{t("Provider")}</TableHead>
                  <TableHead>{t("Stage")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  {!publisherPresentation ? (
                    <TableHead>{t("Contract")}</TableHead>
                  ) : null}
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              ) : (
                <TableRow>
                  <TableHead>
                    {t(recordColumnLabel ?? "Transaction")}
                  </TableHead>
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
                    <TableCell colSpan={isOffers && publisherPresentation ? 5 : 6}>
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : listQuery.isError && rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isOffers && publisherPresentation ? 5 : 6}
                    className="py-10 text-center"
                  >
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
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setListErrorLogOpen(true)}
                          className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
                        >
                          <FileText className="h-4 w-4" />
                          <span>{t("Show log")}</span>
                        </Button>
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
                    </div>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isOffers && publisherPresentation ? 5 : 6}
                    className="py-10 text-center"
                  >
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p className="text-sm">{t("No records found.")}</p>
                      {canCreate ? (
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
                      ) : null}
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
                        {offer.name || offer.id}
                      </Link>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {offer.serviceId} · v{offer.serviceVersion}
                      </div>
                      {(offer.complianceWarnings?.length ?? 0) > 0 ? (
                        <Badge
                          variant="outline"
                          className="mt-2 gap-1 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
                          title={offer.complianceWarnings?.join("\n")}
                        >
                          <CircleAlert className="h-3 w-3" />
                          {offer.complianceWarnings?.length} {t("compliance warnings")}
                        </Badge>
                      ) : null}
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
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          variant={
                            offer.status === "active" ? "default" : "outline"
                          }
                        >
                          {t(offerStatusLabel(offer.status))}
                        </Badge>
                        {offer.isHiddenFromSearch ? (
                          <Badge variant="outline">
                            {t("Hidden from search")}
                          </Badge>
                        ) : null}
                        {offer.isHighlightedOffer ? (
                          <Badge variant="secondary">
                            {t("Highlighted offer")}
                          </Badge>
                        ) : null}
                        {offer.isProfessionalOffer ? (
                          <Badge variant="secondary">
                            {t("Professional offer")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    {!publisherPresentation ? (
                      <TableCell className="max-w-[20rem] truncate text-sm text-muted-foreground">
                        {offer.shortContract || "-"}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right">
                      <RowActions
                        editHref={`${route}/${encodeURIComponent(offer.id)}`}
                        onDelete={
                          allowDelete ? () => handleDelete(offer) : undefined
                        }
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
                      {(transaction.complianceWarnings?.length ?? 0) > 0 ? (
                        <Badge
                          variant="outline"
                          className="mt-2 gap-1 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
                          title={transaction.complianceWarnings?.join("\n")}
                        >
                          <CircleAlert className="h-3 w-3" />
                          {transaction.complianceWarnings?.length} {t("compliance warnings")}
                        </Badge>
                      ) : null}
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
                        onDelete={
                          allowDelete
                            ? () => handleDelete(transaction)
                            : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          )}
        </div>
        {hidePublisherListFooter ? null : (
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
                {listQuery.isFetchingNextPage
                  ? t("Loading...")
                  : t("Load more")}
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

function PublisherSupportServiceRows({
  kind,
  offers,
  transactions,
  route,
  emptyState,
}: {
  kind: WorkbenchKind;
  offers: SupportServiceOfferRecord[];
  transactions: SupportServiceTransactionRecord[];
  route: string;
  emptyState?: ReactNode;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const isOffers = kind === "offers";
  const gridClass = isOffers
    ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_minmax(8rem,0.8fr)_10rem_auto]"
    : "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)_minmax(8rem,0.8fr)_10rem_auto]";

  return (
    <div data-testid="publisher-support-service-list">
      <div
        className={cn(
          "hidden gap-4 border-b border-violet-100/80 bg-violet-50/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-950/60 dark:border-violet-400/14 dark:bg-violet-500/8 dark:text-violet-100/62 lg:grid",
          gridClass,
        )}
      >
        <span>{t(isOffers ? "Offer" : "Service Request")}</span>
        <span>{t(isOffers ? "Stage" : "Service")}</span>
        <span>{t("Status")}</span>
        <span>{t("Updated")}</span>
        <span className="text-right">{t("Action")}</span>
      </div>

      {emptyState ?? (
        <div role="list">
          {isOffers
            ? offers.map((offer) => {
              const category = supportServiceCategoryByKey(
                offer.serviceCategory,
              );

              return (
                <article
                  key={offer.id}
                  role="listitem"
                  className={cn(
                    "grid gap-4 border-b border-violet-100/70 px-4 py-4 transition-colors last:border-b-0 hover:bg-violet-50/42 dark:border-violet-400/12 dark:hover:bg-violet-500/6 lg:items-center",
                    gridClass,
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <PublisherServiceOfferThumbnail offer={offer} />
                    <div className="min-w-0">
                      <h3 className="font-heading text-base font-semibold text-foreground">
                        {offer.name || offer.id}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                        {offer.description || t("No description")}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {offer.serviceId} · v{offer.serviceVersion}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Badge variant="brand">
                      {category
                        ? supportServiceCategoryName(category, language)
                        : t("Uncategorized")}
                    </Badge>
                    <div className="flex flex-wrap gap-1">
                      {offer.stages.map((stage) => (
                        <Badge key={stage} variant="secondary">
                          {t(stageLabel(stage))}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant={offer.status === "active" ? "success" : "outline"}
                    >
                      {t(offerStatusLabel(offer.status))}
                    </Badge>
                    {offer.isHighlightedOffer ? (
                      <Badge variant="secondary">{t("Highlighted offer")}</Badge>
                    ) : null}
                    {offer.isProfessionalOffer ? (
                      <Badge variant="secondary">{t("Professional offer")}</Badge>
                    ) : null}
                    {(offer.complianceWarnings?.length ?? 0) > 0 ? (
                      <Badge variant="warning">
                        <CircleAlert className="h-3 w-3" />
                        {offer.complianceWarnings?.length} {t("warnings")}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {t(dateLabel(offer.updatedAt))}
                  </div>

                  <PublisherOpenAction
                    href={`${route}/${encodeURIComponent(offer.id)}`}
                  />
                </article>
              );
            })
          : transactions.map((transaction) => {
              const transactionName = transaction.name?.trim() ?? "";
              const serviceName =
                typeof transaction.offerSnapshot?.name === "string"
                  ? transaction.offerSnapshot.name.trim()
                  : "";

              return (
                <article
                  key={transaction.id}
                  role="listitem"
                  className={cn(
                    "grid gap-4 border-b border-violet-100/70 px-4 py-4 transition-colors last:border-b-0 hover:bg-violet-50/42 dark:border-violet-400/12 dark:hover:bg-violet-500/6 lg:items-center",
                    gridClass,
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-400/16 dark:bg-violet-500/10 dark:text-violet-100">
                      <ClipboardList className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-mono text-sm font-semibold text-foreground">
                        {transaction.requestId}
                      </h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {transaction.requestedByUserEmail ||
                          transaction.requestedByUserId ||
                          "-"}
                      </p>
                      <Badge variant="outline" className="mt-2">
                        {transaction.inputs.length} {t("bound inputs")}
                      </Badge>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {transactionName || serviceName || transaction.serviceId}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {transaction.serviceId} · v{transaction.serviceVersion}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant={
                        transaction.status === "delivered"
                          ? "success"
                          : "outline"
                      }
                    >
                      {t(transactionStatusLabel(transaction.status))}
                    </Badge>
                    {(transaction.complianceWarnings?.length ?? 0) > 0 ? (
                      <Badge variant="warning">
                        <CircleAlert className="h-3 w-3" />
                        {transaction.complianceWarnings?.length} {t("warnings")}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {t(dateLabel(transaction.updatedAt))}
                  </div>

                  <PublisherOpenAction
                    href={`${route}/${encodeURIComponent(transaction.requestId)}`}
                  />
                </article>
              );
              })}
        </div>
      )}
    </div>
  );
}

function PublisherServiceOfferThumbnail({
  offer,
}: {
  offer: SupportServiceOfferRecord;
}) {
  const listBannerSource =
    offer.promotionalBannerImageUrl?.trim() ||
    offer.promotionalBannerImageUploadDataUrl?.trim() ||
    "";
  const offerDetailQuery = useQuery({
    queryKey: [OFFERS_QUERY_KEY, "publisher-thumbnail", offer.id],
    queryFn: () =>
      sdkFetch<{ offer: SupportServiceOfferRecord }>(
        `/admin/support-services/offers/${encodeURIComponent(offer.id)}`,
      ),
    enabled: !listBannerSource,
    staleTime: 5 * 60 * 1000,
  });
  const detailBannerSource =
    offerDetailQuery.data?.offer.promotionalBannerImageUrl?.trim() ||
    offerDetailQuery.data?.offer.promotionalBannerImageUploadDataUrl?.trim() ||
    "";
  const bannerSource = listBannerSource || detailBannerSource;
  const [failedBannerSource, setFailedBannerSource] = useState("");
  const showBanner = Boolean(
    bannerSource && bannerSource !== failedBannerSource,
  );

  return (
    <div
      className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-violet-100 bg-violet-50 text-violet-600 dark:border-violet-400/16 dark:bg-violet-500/10 dark:text-violet-100"
      data-testid={`service-offer-thumbnail-${offer.id}`}
    >
      {showBanner ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bannerSource}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          data-testid={`service-offer-banner-image-${offer.id}`}
          onError={() => setFailedBannerSource(bannerSource)}
        />
      ) : (
        <BriefcaseBusiness
          aria-hidden="true"
          className="h-5 w-5"
          data-testid={`service-offer-banner-fallback-${offer.id}`}
        />
      )}
    </div>
  );
}

function PublisherOpenAction({ href }: { href: string }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex lg:justify-end">
      <Button
        asChild
        variant="outline"
        size="sm"
        className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
      >
        <Link href={href}>
          <span>{t("Open")}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function RowActions({
  editHref,
  onDelete,
}: {
  editHref: string;
  onDelete?: () => void;
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
      {onDelete ? (
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
      ) : null}
    </div>
  );
}

function PromotionalBannerImageEditor({
  imageUrl,
  imageUploadDataUrl,
  imageUploadName,
  imageUploadMimeType,
  disabled,
  onChange,
  onPendingChange,
}: {
  imageUrl: string;
  imageUploadDataUrl: string;
  imageUploadName: string;
  imageUploadMimeType: string;
  disabled: boolean;
  onChange: (
    patch: Pick<
      OfferFormState,
      | "promotionalBannerImageUrl"
      | "promotionalBannerImageUploadDataUrl"
      | "promotionalBannerImageUploadName"
      | "promotionalBannerImageUploadMimeType"
    >,
  ) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadTokenRef = useRef(0);
  const [status, setStatus] =
    useState<PromotionalBannerUploadStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const previewSource = imageUrl.trim() || imageUploadDataUrl;
  const hasImageUrl = Boolean(imageUrl.trim());
  const hasUploadedImage = Boolean(imageUploadDataUrl);
  const hasChosenPath = hasImageUrl || hasUploadedImage;
  const uploadLimitLabel = formatPromotionalBannerFileSize(
    PROMOTIONAL_BANNER_IMAGE_UPLOAD_MAX_BYTES,
  );
  const uploadedImageSummary = imageUploadName
    ? `${imageUploadName}${imageUploadMimeType ? ` · ${imageUploadMimeType}` : ""}`
    : t("Using uploaded banner image");

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function updatePending(nextPending: boolean) {
    setPending(nextPending);
    onPendingChange(nextPending);
  }

  function clearUploadedImage() {
    uploadTokenRef.current += 1;
    updatePending(false);
    setDragging(false);
    setStatus(null);
    resetInput();
    onChange({
      promotionalBannerImageUrl: "",
      promotionalBannerImageUploadDataUrl: "",
      promotionalBannerImageUploadName: "",
      promotionalBannerImageUploadMimeType: "",
    });
  }

  function clearImageUrl() {
    onChange({
      promotionalBannerImageUrl: "",
      promotionalBannerImageUploadDataUrl: "",
      promotionalBannerImageUploadName: "",
      promotionalBannerImageUploadMimeType: "",
    });
  }

  function handleImageUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const nextImageUrl = event.target.value;
    if (nextImageUrl.trim()) {
      uploadTokenRef.current += 1;
      updatePending(false);
      setDragging(false);
      setStatus(null);
      resetInput();
    }
    onChange({
      promotionalBannerImageUrl: nextImageUrl,
      promotionalBannerImageUploadDataUrl: nextImageUrl.trim()
        ? ""
        : imageUploadDataUrl,
      promotionalBannerImageUploadName: nextImageUrl.trim()
        ? ""
        : imageUploadName,
      promotionalBannerImageUploadMimeType: nextImageUrl.trim()
        ? ""
        : imageUploadMimeType,
    });
  }

  async function handleUploadFile(file: File | undefined | null) {
    if (!file || disabled || pending || hasImageUrl) {
      return;
    }

    uploadTokenRef.current += 1;
    const token = uploadTokenRef.current;
    updatePending(true);
    setDragging(false);
    setStatus({
      tone: "loading",
      message:
        file.size > PROMOTIONAL_BANNER_IMAGE_UPLOAD_MAX_BYTES ||
        canResizePromotionalBanner()
          ? t("Processing banner image...")
          : t("Loading image..."),
    });

    try {
      const processed = await processPromotionalBannerFile(file);
      if (uploadTokenRef.current !== token) {
        return;
      }
      onChange({
        promotionalBannerImageUrl: "",
        promotionalBannerImageUploadDataUrl: processed.dataUrl,
        promotionalBannerImageUploadName: processed.name,
        promotionalBannerImageUploadMimeType: processed.mimeType,
      });
      setStatus({
        tone: "success",
        message: processed.compressed
          ? t("Banner image processed and ready.")
          : t("Uploaded image ready."),
      });
    } catch (error) {
      if (uploadTokenRef.current !== token) {
        return;
      }
      const unsupported =
        error instanceof Error && error.message === "IMAGE_TYPE_UNSUPPORTED";
      setStatus(
        unsupported
          ? {
              tone: "error",
              message: t(
                "Only PNG, JPG, or WebP images can be uploaded here.",
              ),
            }
          : {
              tone: "warning",
              message: t(
                "We could not compress this image under 600 KB. Reduce it and upload a smaller version.",
              ),
              href: IMAGE_REDUCER_URL,
              linkLabel: t("Compress it for free"),
            },
      );
    } finally {
      if (uploadTokenRef.current === token) {
        updatePending(false);
        resetInput();
      }
    }
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!disabled && !pending && !hasImageUrl) {
      setDragging(true);
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!disabled && !pending && !hasImageUrl) {
      setDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled && !pending && !hasImageUrl) {
      void handleUploadFile(event.dataTransfer.files?.[0]);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-violet-200/80 bg-violet-50/35 p-4 shadow-sm lg:col-span-2 dark:border-violet-400/25 dark:bg-violet-500/8"
      data-testid="service-offer-promotional-banner-section"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
            <ImageIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {t("Promotional banner image")}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t(
                "Use a wide 1024 x 500 image URL or upload a PNG, JPG, or WebP file.",
              )}
            </p>
          </div>
        </div>
        {hasUploadedImage ? (
          <span className="inline-flex w-fit items-center rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-100">
            {t("Using uploaded banner image")}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-background shadow-sm transition duration-200",
          dragging
            ? "border-violet-500 bg-violet-50 shadow-[0_18px_42px_rgba(109,40,217,0.18)] dark:bg-violet-500/12"
            : "border-border",
          !previewSource &&
            "cursor-copy hover:border-violet-300 hover:bg-violet-50/40 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/8",
          pending && "cursor-progress opacity-80",
        )}
        onDragEnter={!previewSource ? handleDragEnter : undefined}
        onDragOver={!previewSource ? handleDragOver : undefined}
        onDragLeave={!previewSource ? handleDragLeave : undefined}
        onDrop={!previewSource ? handleDrop : undefined}
        data-testid="service-offer-promotional-banner-dropzone"
      >
        {previewSource ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSource}
            alt=""
            className="aspect-[1024/500] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[1024/500] flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <UploadCloud className="h-5 w-5" />
              )}
            </span>
            <span className="font-medium">
              {dragging
                ? t("Drop image to upload")
                : t("No promotional banner image")}
            </span>
            <span className="max-w-md text-xs leading-5">
              {t("Drag a banner image here or use the upload button below.")}
            </span>
          </div>
        )}
      </div>

      <div
        className={cn(
          "grid gap-3",
          hasChosenPath
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.8fr)]",
        )}
      >
        {!hasUploadedImage ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="service-offer-promotional-banner-url">
              {t("Banner image URL")}
            </Label>
            <InputGroup className="h-10 border-foreground/20 bg-background shadow-[0_1px_0_rgba(255,255,255,0.4),0_12px_24px_rgba(9,12,18,0.08)] hover:border-foreground/30 dark:border-white/60 dark:bg-black">
              <InputGroupAddon
                data-testid="service-offer-banner-url-prefix"
                className="h-full w-11 shrink-0 border-r border-violet-100 bg-violet-50/80 p-0 text-violet-700 dark:border-white/15 dark:bg-violet-500/12 dark:text-violet-200"
              >
                <Link2 className="h-4 w-4" />
              </InputGroupAddon>
              <InputGroupInput
                id="service-offer-promotional-banner-url"
                type="url"
                value={imageUrl}
                onChange={handleImageUrlChange}
                placeholder="https://"
                disabled={disabled || pending}
                className="h-10 px-3"
              />
              {hasImageUrl ? (
                <InputGroupAddon align="inline-end" className="pr-1">
                  <InputGroupButton
                    type="button"
                    onClick={clearImageUrl}
                    disabled={disabled || pending}
                    aria-label={t("Clear banner image URL")}
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {t("Clear")}
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </div>
        ) : null}

        {!hasImageUrl ? (
          <label
            htmlFor="service-offer-promotional-banner-upload"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition duration-200",
              dragging
                ? "border-violet-500 bg-violet-50 shadow-[0_16px_34px_rgba(109,40,217,0.16)] dark:bg-violet-500/12"
                : "border-violet-300/80 bg-background/70 hover:-translate-y-0.5 hover:border-violet-400 hover:bg-background dark:border-violet-400/35 dark:bg-background/60",
              pending && "cursor-progress opacity-80",
            )}
          >
            <input
              ref={inputRef}
              id="service-offer-promotional-banner-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) =>
                void handleUploadFile(event.target.files?.[0])
              }
              disabled={disabled || pending}
              aria-label={t("Upload banner file")}
              className="sr-only"
            />
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 shadow-sm dark:bg-violet-500/15 dark:text-violet-200">
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <UploadCloud className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                {hasUploadedImage
                  ? t("Replace uploaded banner image")
                  : t("Upload banner file")}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {dragging
                  ? t("Drop image to upload")
                  : t(
                      "PNG, JPG, or WebP up to 600 KB. It will be cropped to 1024 x 500.",
                    ).replace("600 KB", uploadLimitLabel)}
              </span>
            </span>
          </label>
        ) : null}
      </div>

      {hasUploadedImage ? (
        <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50/65 px-3 py-2 text-sm text-violet-950 sm:flex-row sm:items-center sm:justify-between dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-100">
          <span className="min-w-0 truncate">{uploadedImageSummary}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearUploadedImage}
            disabled={disabled || pending}
            className="w-fit text-violet-900 hover:bg-violet-100 hover:text-violet-950 dark:text-violet-100 dark:hover:bg-violet-500/15"
          >
            <XCircle className="h-3.5 w-3.5" />
            {t("Remove uploaded banner image")}
          </Button>
        </div>
      ) : null}

      {status ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-medium leading-5",
            status.tone === "success" &&
              "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200",
            status.tone === "loading" &&
              "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-200",
            status.tone === "warning" &&
              "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100",
            status.tone === "error" && "bg-destructive/10 text-destructive",
          )}
        >
          {status.message}
          {status.href && status.linkLabel ? (
            <>
              {" "}
              <a
                href={status.href}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-4"
              >
                {status.linkLabel}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export function SupportServiceOfferWorkbench({
  mode,
  offerId,
  routeBase = "/god-mode/service-offers",
  fixedProvider,
  canDelete = true,
  presentation = "form",
  publisherEditorPresentation = false,
}: {
  mode: "create" | "edit";
  offerId?: string;
  routeBase?: string;
  fixedProvider?: {
    kind: SupportServiceProviderKind;
    id: string;
    name: string;
  };
  canDelete?: boolean;
  presentation?: "form" | "wizard";
  publisherEditorPresentation?: boolean;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OfferFormState>(() =>
    initialOfferForm(mode, presentation),
  );
  const [savedForm, setSavedForm] = useState<OfferFormState>(() =>
    initialOfferForm(mode, presentation),
  );
  const [persistedOfferId, setPersistedOfferId] = useState<string | null>(
    offerId ?? null,
  );
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDraft, setStatusDraft] =
    useState<SupportServiceOfferStatus>("draft");
  const [publishDialog, setPublishDialog] =
    useState<ServiceOfferPublishDialogState | null>(null);
  const [pendingSaveIntent, setPendingSaveIntent] =
    useState<ServiceOfferSaveIntent | null>(null);
  const [contractContinuityAccepted, setContractContinuityAccepted] =
    useState(false);
  const [rawExportOpen, setRawExportOpen] = useState(false);
  const [promotionalBannerUploadPending, setPromotionalBannerUploadPending] =
    useState(false);
  const [toastCounter, setToastCounter] = useState(1);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [versionBumpToken, setVersionBumpToken] = useState(0);
  const [formShapeVersionBumpToken, setFormShapeVersionBumpToken] =
    useState(0);
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [wizardValidationMessage, setWizardValidationMessage] = useState("");
  const isEditing = mode === "edit";
  const isWizard = presentation === "wizard" && mode === "create";
  const isPublisherOfferEditor = isEditing && publisherEditorPresentation;
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
      setVersionBumpToken(0);
      setFormShapeVersionBumpToken(0);
    }
  }, [offerQuery.data?.offer]);

  useEffect(() => {
    if (!fixedProvider?.id) {
      return;
    }

    setForm((current) => {
      if (
        current.providerKind === fixedProvider.kind &&
        current.providerId === fixedProvider.id &&
        current.providerName === fixedProvider.name
      ) {
        return current;
      }
      const next = {
        ...current,
        providerKind: fixedProvider.kind,
        providerId: fixedProvider.id,
        providerName: fixedProvider.name,
      };
      return hasPersistedOffer ? next : applyGeneratedOfferIds(next);
    });
  }, [
    fixedProvider?.id,
    fixedProvider?.kind,
    fixedProvider?.name,
    hasPersistedOffer,
  ]);

  const shouldValidateServiceId =
    !hasPersistedOffer &&
    Boolean(form.providerId.trim()) &&
    GENERATED_SERVICE_ID_PATTERN.test(form.serviceId);
  const serviceIdAvailabilityQuery = useQuery({
    queryKey: [OFFERS_QUERY_KEY, "service-id-availability", form.serviceId],
    queryFn: () => {
      const params = new URLSearchParams({ serviceId: form.serviceId });
      return sdkFetch<SupportServiceIdAvailability>(
        `/admin/support-services/offers/service-id-availability?${params.toString()}`,
      );
    },
    enabled: shouldValidateServiceId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (
      payload: SupportServiceOfferInput | SupportServiceOfferUpdateInput,
    ) => {
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
      router.push(routeBase);
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
  });

  const persistedOfferRecord = offerQuery.data?.offer ?? null;
  const changed = JSON.stringify(form) !== JSON.stringify(savedForm);
  const isWorking =
    saveMutation.isPending ||
    deleteMutation.isPending ||
    promotionalBannerUploadPending;
  const serviceIdValidated =
    hasPersistedOffer ||
    (serviceIdAvailabilityQuery.data?.serviceId === form.serviceId &&
      serviceIdAvailabilityQuery.data.available);
  const serviceIdValidationStatus: ServiceIdValidationStatus = hasPersistedOffer
    ? "locked"
    : !form.providerId.trim() ||
        !GENERATED_SERVICE_ID_PATTERN.test(form.serviceId)
      ? "idle"
      : serviceIdAvailabilityQuery.isPending ||
          serviceIdAvailabilityQuery.isFetching
        ? "checking"
        : serviceIdAvailabilityQuery.isError
          ? "error"
          : serviceIdAvailabilityQuery.data?.available
            ? "available"
            : "conflict";
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
    setForm((current) => ({
      ...next,
      serviceId: current.serviceId,
      serviceVersion: current.serviceVersion,
      status: current.status,
      formShape: {
        ...next.formShape,
        id: formShapeIdForServiceId(current.serviceId),
        version: current.formShape.version,
      },
    }));
  }

  function regenerateServiceId() {
    if (hasPersistedOffer || !form.providerName.trim()) {
      return;
    }
    setForm((current) => applyGeneratedOfferIds(current));
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
        !hasPersistedOffer &&
        form.providerId.trim() &&
        (serviceIdAvailabilityQuery.isPending ||
          serviceIdAvailabilityQuery.isFetching)
      ) {
        throw new Error("Wait until the generated service ID is validated.");
      }
      if (
        !hasPersistedOffer &&
        form.providerId.trim() &&
        serviceIdAvailabilityQuery.isError
      ) {
        throw new Error("The generated service ID could not be validated.");
      }
      if (!hasPersistedOffer && form.providerId.trim() && !serviceIdValidated) {
        throw new Error("Service ID already exists. Generate another ID.");
      }

      const previousVersion = form.serviceVersion;
      const previousFormShapeVersion = form.supportsFormShape
        ? form.formShape.version
        : null;
      const payloadForm = isWizard ? simplifiedWizardContract(form) : form;
      const basePayload = offerPayloadFromForm({ ...payloadForm, status });
      const payload = hasPersistedOffer
        ? ({
            ...basePayload,
            acknowledgesExistingTransactionContracts: true,
          } satisfies SupportServiceOfferUpdateInput)
        : basePayload;
      const result = await saveMutation.mutateAsync(payload);
      await queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });

      const nextForm = offerFormFromRecord(result.offer);
      setForm(nextForm);
      setSavedForm(nextForm);
      setPersistedOfferId(result.offer.id);
      setStatusDraft(result.offer.status);
      if (
        hasPersistedOffer &&
        result.offer.serviceVersion === previousVersion + 1
      ) {
        setVersionBumpToken((current) => current + 1);
      }
      if (
        hasPersistedOffer &&
        previousFormShapeVersion !== null &&
        result.offer.formShape?.version === previousFormShapeVersion + 1
      ) {
        setFormShapeVersionBumpToken((current) => current + 1);
      }

      if (showToast) {
        setToast({
          id: nextToastId(),
          tone: "success",
          message: t(successMessage),
        });
      }

      if (redirectToOffer) {
        router.push(`${routeBase}/${encodeURIComponent(result.offer.id)}`);
      }
      router.refresh();
      return result.offer;
    } catch (error) {
      if (
        !hasPersistedOffer &&
        error instanceof SdkRequestError &&
        error.status === 409 &&
        error.message.includes("Service ID")
      ) {
        queryClient.setQueryData<SupportServiceIdAvailability>(
          [OFFERS_QUERY_KEY, "service-id-availability", form.serviceId],
          { serviceId: form.serviceId, available: false },
        );
      }
      setToast(mutationErrorToast(error, nextToastId(), t));
      return null;
    }
  }

  async function executeSaveCurrentOffer() {
    const status = hasPersistedOffer ? form.status : "draft";
    await persistOffer(status, {
      successMessage: hasPersistedOffer
        ? "Service offer saved."
        : "Service offer draft saved.",
    });
  }

  async function executeSaveStatusDraft() {
    const saved = await persistOffer(statusDraft, {
      redirectToOffer: false,
      successMessage: "Service offer status updated.",
    });
    if (saved) {
      setStatusDialogOpen(false);
    }
  }

  async function executePublishOffer() {
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

  function requestOfferSave(intent: ServiceOfferSaveIntent) {
    if (!hasPersistedOffer) {
      if (intent === "publish") {
        void executePublishOffer();
      } else {
        void executeSaveCurrentOffer();
      }
      return;
    }

    try {
      const requestedStatus =
        intent === "status"
          ? statusDraft
          : intent === "publish"
            ? "active"
            : form.status;
      offerPayloadFromForm({ ...form, status: requestedStatus });
    } catch (error) {
      setToast(mutationErrorToast(error, nextToastId(), t));
      return;
    }

    if (intent === "status") {
      if (statusDraft === form.status) {
        setStatusDialogOpen(false);
        return;
      }
      setStatusDialogOpen(false);
    }
    setContractContinuityAccepted(false);
    setPendingSaveIntent(intent);
  }

  async function confirmOfferSave() {
    if (!pendingSaveIntent || !contractContinuityAccepted) {
      return;
    }

    const intent = pendingSaveIntent;
    setPendingSaveIntent(null);
    setContractContinuityAccepted(false);

    if (intent === "status") {
      await executeSaveStatusDraft();
      return;
    }
    if (intent === "publish") {
      await executePublishOffer();
      return;
    }
    await executeSaveCurrentOffer();
  }

  function saveCurrentOffer() {
    requestOfferSave("save");
  }

  function saveStatusDraft() {
    requestOfferSave("status");
  }

  function publishOffer() {
    requestOfferSave("publish");
  }

  function validateWizardStep(
    stepIndex: number,
    candidateForm: OfferFormState = form,
  ) {
    if (stepIndex === 0) {
      if (!candidateForm.name.trim()) {
        return t("Offer name is required.");
      }
      if (!isSupportServiceCategoryKey(candidateForm.serviceCategory)) {
        return t("Choose one service category.");
      }
    }

    if (stepIndex === 2 && candidateForm.promotionalBannerImageUrl.trim()) {
      try {
        const imageUrl = new URL(
          candidateForm.promotionalBannerImageUrl.trim(),
        );
        if (imageUrl.protocol !== "https:" || !imageUrl.hostname) {
          return t("Promotional banner image URL must be a valid HTTPS URL.");
        }
      } catch {
        return t("Promotional banner image URL must be a valid HTTPS URL.");
      }
    }

    if (stepIndex === 3) {
      if (!candidateForm.description.trim()) {
        return t("Description is required.");
      }
      if (!candidateForm.providerWork.trim()) {
        return t("Provider work is required.");
      }
    }

    if (stepIndex === 8 && candidateForm.stages.length === 0) {
      return t("Select at least one stage before continuing.");
    }

    if (stepIndex >= 4) {
      try {
        offerPayloadFromForm(
          stepIndex < 8 && candidateForm.stages.length === 0
            ? { ...candidateForm, stages: ["test_planning"] }
            : candidateForm,
        );
      } catch (error) {
        return t(
          error instanceof Error ? error.message : "Review the current step.",
        );
      }
    }

    return "";
  }

  function advanceWizard() {
    const shouldIgnoreEmptyForm =
      wizardStepIndex === 5 &&
      form.supportsFormShape &&
      form.formShape.fields.length === 0;
    let candidateForm = shouldIgnoreEmptyForm
      ? {
          ...form,
          supportsFormShape: false,
          formShape: defaultFormShape(),
          inputSlots: withoutFormInputSlots(form.inputSlots),
        }
      : form;
    if (wizardStepIndex === 5) {
      candidateForm = simplifiedWizardContract(candidateForm);
    }
    const message = validateWizardStep(wizardStepIndex, candidateForm);
    if (message) {
      setWizardValidationMessage(message);
      return;
    }

    if (shouldIgnoreEmptyForm || wizardStepIndex === 5) {
      setForm(candidateForm);
    }
    setWizardValidationMessage("");
    setWizardStepIndex((current) =>
      Math.min(current + 1, SERVICE_OFFER_WIZARD_LAST_STEP),
    );
  }

  function returnToPreviousWizardStep() {
    setWizardValidationMessage("");
    setWizardStepIndex((current) => Math.max(current - 1, 0));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isWizard && wizardStepIndex < SERVICE_OFFER_WIZARD_LAST_STEP) {
      advanceWizard();
      return;
    }
    void saveCurrentOffer();
  }

  if (isEditing && offerQuery.isLoading) {
    return <Skeleton className="h-[36rem] w-full" />;
  }

  if (isWizard) {
    const activeWizardStep = SERVICE_OFFER_WIZARD_STEPS[wizardStepIndex];
    const wizardSaveDisabled =
      isWorking ||
      (Boolean(form.providerId.trim()) && !serviceIdValidated);

    return (
      <>
        <ActionToast
          toast={toast}
          onDismiss={() => setToast(null)}
          language={language}
        />
        <form
          data-testid="service-offer-wizard"
          noValidate
          className={cn(
            SUPPORT_SERVICE_FORM_CLASS,
            "overflow-visible rounded-none border-0 bg-transparent shadow-none dark:bg-transparent",
          )}
          onSubmit={handleSubmit}
        >
          <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:gap-8">
            <aside className="overflow-hidden rounded-lg border border-violet-200/80 bg-violet-950 text-white shadow-[0_24px_70px_-48px_rgba(76,29,149,0.8)] lg:sticky lg:top-6">
              <div className="border-b border-white/10 px-5 py-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/12 text-violet-100">
                  <Wand2 className="h-5 w-5" />
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-violet-200">
                  {t("New service offer")}
                </p>
                <h2 className="mt-2 font-heading text-2xl font-semibold leading-tight">
                  {t("Build your offer step by step")}
                </h2>
              </div>
              <ol className="hidden gap-1 p-3 lg:grid">
                {SERVICE_OFFER_WIZARD_STEPS.map((step, index) => {
                  const isActive = index === wizardStepIndex;
                  const isComplete = index < wizardStepIndex;

                  return (
                    <li
                      key={step.title}
                      className={cn(
                        "flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        isActive && "bg-white text-violet-950 shadow-sm",
                        !isActive && "text-violet-100/76",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                          isActive && "border-violet-200 bg-violet-100 text-violet-800",
                          isComplete && "border-emerald-300/40 bg-emerald-400/18 text-emerald-100",
                          !isActive && !isComplete && "border-white/18 bg-white/5",
                        )}
                      >
                        {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span className="min-w-0 leading-5">{t(step.title)}</span>
                    </li>
                  );
                })}
              </ol>
            </aside>

            <div
              className={cn(
                "min-w-0",
                wizardStepIndex === SERVICE_OFFER_WIZARD_LAST_STEP &&
                  "pb-40 sm:pb-24",
              )}
            >
              <header className="mb-6 border-b border-violet-100 pb-6 dark:border-violet-400/16">
                <div
                  className="grid grid-cols-10 gap-1.5"
                  aria-label={t("Service offer creation progress")}
                >
                  {SERVICE_OFFER_WIZARD_STEPS.map((step, index) => (
                    <span
                      key={step.title}
                      className={cn(
                        "h-1.5 rounded-full transition-colors",
                        index <= wizardStepIndex
                          ? "bg-violet-600"
                          : "bg-violet-100 dark:bg-violet-400/16",
                      )}
                    />
                  ))}
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
                  {t("Step")} {wizardStepIndex + 1} {t("of")} {SERVICE_OFFER_WIZARD_STEPS.length}
                </p>
                <h1 className="mt-2 font-heading text-3xl font-semibold text-foreground">
                  {t(activeWizardStep.title)}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {t(activeWizardStep.description)}
                </p>
              </header>

              <div className="min-h-[34rem] [&>section]:mx-0 [&>section]:my-0">
                {wizardStepIndex === 0 ? (
                  <Section title="Offer identity">
                    <div className="grid gap-5">
                      <Field label="Offer name">
                        <Input
                          autoFocus
                          value={form.name}
                          onChange={(event) => {
                            setWizardValidationMessage("");
                            setForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }));
                          }}
                          required
                        />
                      </Field>
                      <Field label="Service category">
                        <ServiceCategoryPicker
                          value={form.serviceCategory}
                          disabled={isWorking}
                          onChange={(serviceCategory) => {
                            setWizardValidationMessage("");
                            setForm((current) => ({
                              ...current,
                              serviceCategory,
                            }));
                          }}
                        />
                      </Field>
                    </div>
                  </Section>
                ) : null}

                {wizardStepIndex === 1 ? (
                  <Section title="Offer visibility">
                    <div
                      data-testid="service-offer-wizard-visibility-options"
                      className="grid gap-4 lg:grid-cols-2"
                    >
                      <Field label="Highlighted offer">
                        <div className="flex min-h-28 items-start gap-3 rounded-lg border border-violet-100 bg-white/78 px-4 py-4 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
                          <Checkbox
                            id="service-offer-wizard-highlighted"
                            checked={form.isHighlightedOffer}
                            onCheckedChange={(checked) =>
                              setForm((current) => {
                                const isHighlightedOffer = checked === true;
                                return {
                                  ...current,
                                  isHighlightedOffer,
                                  isProfessionalOffer: isHighlightedOffer
                                    ? false
                                    : current.isProfessionalOffer,
                                };
                              })
                            }
                          />
                          <div className="grid gap-1">
                            <Label htmlFor="service-offer-wizard-highlighted">
                              {t("Show as a highlighted offer")}
                            </Label>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {t(
                                "End-to-end services for patients or physicians who want to request a study.",
                              )}
                            </p>
                          </div>
                        </div>
                      </Field>
                      <Field label="Professional offer">
                        <div className="flex min-h-28 items-start gap-3 rounded-lg border border-violet-100 bg-white/78 px-4 py-4 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
                          <Checkbox
                            id="service-offer-wizard-professional"
                            checked={form.isProfessionalOffer}
                            onCheckedChange={(checked) =>
                              setForm((current) => {
                                const isProfessionalOffer = checked === true;
                                return {
                                  ...current,
                                  isProfessionalOffer,
                                  isHighlightedOffer: isProfessionalOffer
                                    ? false
                                    : current.isHighlightedOffer,
                                };
                              })
                            }
                          />
                          <div className="grid gap-1">
                            <Label htmlFor="service-offer-wizard-professional">
                              {t("Show as a professional offer")}
                            </Label>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {t(
                                "Genomic services for bioinformaticians or audiences with advanced subject-matter knowledge.",
                              )}
                            </p>
                          </div>
                        </div>
                      </Field>
                    </div>
                  </Section>
                ) : null}

                {wizardStepIndex === 2 ? (
                  <PromotionalBannerImageEditor
                    imageUrl={form.promotionalBannerImageUrl}
                    imageUploadDataUrl={form.promotionalBannerImageUploadDataUrl}
                    imageUploadName={form.promotionalBannerImageUploadName}
                    imageUploadMimeType={form.promotionalBannerImageUploadMimeType}
                    disabled={isWorking}
                    onPendingChange={setPromotionalBannerUploadPending}
                    onChange={(patch) =>
                      setForm((current) => ({ ...current, ...patch }))
                    }
                  />
                ) : null}

                {wizardStepIndex === 3 ? (
                  <Section title="Service presentation">
                    <div className="grid gap-5">
                      <Field label="Description">
                        <p className="text-xs leading-5 text-muted-foreground">
                          {t(
                            "Requester-facing summary shown in the app as the service offer description. Use it to explain what the service is, when someone should request it, and what outcome they can expect.",
                          )}
                        </p>
                        <Textarea
                          value={form.description}
                          onChange={(event) => {
                            setWizardValidationMessage("");
                            setForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }));
                          }}
                          rows={5}
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
                          onChange={(event) => {
                            setWizardValidationMessage("");
                            setForm((current) => ({
                              ...current,
                              providerWork: event.target.value,
                            }));
                          }}
                          rows={5}
                          required
                        />
                      </Field>
                    </div>
                  </Section>
                ) : null}

                {wizardStepIndex === 4 ? (
                  <ServiceOfferMoreInformationEditor
                    value={form.moreInformation}
                    presentation="wizard"
                    onChange={(moreInformation) =>
                      setForm((current) => ({
                        ...current,
                        moreInformation,
                      }))
                    }
                  />
                ) : null}

                {wizardStepIndex === 5 ? (
                  <FormShapeEditor
                    form={form}
                    setForm={setForm}
                    idStatus={serviceIdValidationStatus}
                    versionBumpToken={formShapeVersionBumpToken}
                    presentation="wizard"
                  />
                ) : null}

                {wizardStepIndex === 6 ? (
                  <TermsEditor form={form} setForm={setForm} layout="stack" />
                ) : null}

                {wizardStepIndex === 7 ? (
                  <div
                    data-testid="service-offer-wizard-conditions-layout"
                    className="grid gap-8 [&>section]:m-0"
                  >
                    <Section title="Acceptance conditions">
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        {t(
                          "Define what must already be true before the provider can accept the request. This section is optional; add one condition per line only when needed.",
                        )}
                      </p>
                      <div className="pt-1">
                        <Textarea
                          aria-label={t("Acceptance conditions")}
                          value={form.acceptedConditionsText}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              acceptedConditionsText: event.target.value,
                            }))
                          }
                          rows={9}
                          placeholder={t("One acceptance condition per line")}
                        />
                      </div>
                    </Section>
                    <Section title="Service limitations">
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                          {t(
                            "Describe the processing scope and the quality requirements for client-provided information. If data, documents, or samples are incomplete or do not meet the required standards, the procedure's feasibility and the quality, accuracy, or scope of its results may be affected. This section is optional; add one limitation per line when applicable.",
                          )}
                      </p>
                      <div className="pt-1">
                        <Textarea
                          aria-label={t("Service limitations")}
                          value={form.scopeRulesText}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              scopeRulesText: event.target.value,
                            }))
                          }
                          rows={9}
                          placeholder={t("One service limitation per line")}
                        />
                      </div>
                    </Section>
                  </div>
                ) : null}

                {wizardStepIndex === 8 ? (
                  <StagePipeline
                    value={form.stages}
                    predictedValue={predictedStages}
                    layout="vertical"
                    allowEmptySelection
                    onChange={(stages) => {
                      setWizardValidationMessage("");
                      setForm((current) => ({ ...current, stages }));
                    }}
                    onApplyPrediction={() => {
                      setWizardValidationMessage("");
                      lastPredictedStagesRef.current = predictedStages;
                      setForm((current) => ({
                        ...current,
                        stages: predictedStages,
                      }));
                    }}
                  />
                ) : null}

                {wizardStepIndex === 9 ? (
                  <WizardOfferReview
                    form={form}
                    preparationStatus={serviceIdValidationStatus}
                    onRetryPreparation={regenerateServiceId}
                  />
                ) : null}
              </div>

              {wizardValidationMessage ? (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-400/24 dark:bg-rose-500/10 dark:text-rose-100"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{wizardValidationMessage}</span>
                </div>
              ) : null}

              <div
                data-testid="service-offer-wizard-action-footer"
                className={cn(
                  "border-t border-violet-100 bg-background/94 backdrop-blur dark:border-violet-400/16",
                  wizardStepIndex === SERVICE_OFFER_WIZARD_LAST_STEP
                    ? "fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_45px_-28px_rgba(15,23,42,0.42)] md:left-[var(--sidebar-width)] lg:px-6"
                    : "sticky bottom-0 z-20 mt-6 py-4",
                )}
              >
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3",
                    wizardStepIndex === SERVICE_OFFER_WIZARD_LAST_STEP &&
                      "mx-auto w-full max-w-5xl",
                  )}
                >
                  {wizardStepIndex === 0 ? (
                    <Button asChild type="button" variant="outline">
                      <Link href={routeBase}>
                        <ArrowLeft className="h-4 w-4" />
                        {t("Back to Service Offers")}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={returnToPreviousWizardStep}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {t("Back")}
                    </Button>
                  )}

                  {wizardStepIndex < SERVICE_OFFER_WIZARD_LAST_STEP ? (
                    <Button
                      type="submit"
                      disabled={isWorking}
                      className="h-11 rounded-full bg-violet-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                    >
                      {t("Continue")}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={wizardSaveDisabled}
                        onClick={() => void saveCurrentOffer()}
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {t("Save draft")}
                      </Button>
                      <Button
                        type="button"
                        disabled={wizardSaveDisabled}
                        onClick={() => void publishOffer()}
                        className="h-11 rounded-full bg-violet-600 px-6 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {t("Publish service offer")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
        <ServiceOfferPublishDialog
          dialog={publishDialog}
          offerName={form.name}
          onOpenOffer={(id) => {
            setPublishDialog(null);
            router.push(`${routeBase}/${encodeURIComponent(id)}`);
          }}
          onBackToOffers={() => {
            setPublishDialog(null);
            router.push(routeBase);
          }}
          onClose={() => setPublishDialog(null)}
        />
      </>
    );
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
          title={
            isPublisherOfferEditor
              ? "Offer editor"
              : isEditing
                ? "Editar service offer"
                : "Alta de service offer"
          }
          subtitle={
            isPublisherOfferEditor
              ? "Commercial, operational, and publication settings"
              : undefined
          }
          appearance={isPublisherOfferEditor ? "offer-editor" : "default"}
          backHref={routeBase}
          backLabel="Back to Service Offers"
          isSaving={isWorking}
          saveDisabled={
            !hasPersistedOffer &&
            Boolean(form.providerId.trim()) &&
            !serviceIdValidated
          }
          canDelete={isEditing && canDelete}
          canExportRaw={Boolean(persistedOfferRecord)}
          onExportRaw={() => setRawExportOpen(true)}
          onDelete={() => {
            if (window.confirm(t("Delete this service offer?"))) {
              deleteMutation.mutate();
            }
          }}
          saveLabel={hasPersistedOffer ? "Save changes" : "Save draft"}
        />
        {(offerQuery.data?.offer.complianceWarnings?.length ?? 0) > 0 ? (
          <div
            role="alert"
            className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-amber-950 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="grid gap-2">
                <div>
                  <p className="font-semibold">{t("Offer requires remediation")}</p>
                  <p className="text-sm opacity-80">
                    {t("This service offer remains visible in Support Services but is not fully compliant. Review these warnings, correct the editable data, and save it to normalize the entity.")}
                  </p>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {offerQuery.data?.offer.complianceWarnings?.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
        <Section
          title={
            isPublisherOfferEditor ? "Core service details" : "Offer identity"
          }
          icon={isPublisherOfferEditor ? Fingerprint : undefined}
          appearance={
            isPublisherOfferEditor ? "service-identity" : "default"
          }
          testId={
            isPublisherOfferEditor
              ? "publisher-service-offer-identity-section"
              : undefined
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <div className="text-sm font-medium text-foreground">
                {form.name || t("New service offer")}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {`${form.serviceId || "pgs_"} · v${form.serviceVersion || 1}`}
              </div>
            </div>
            <MockTemplatePicker onSelect={applyMockTemplate} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {fixedProvider ? (
              <>
                <DisplayField label="Provider kind">
                  <GeneratedValue
                    value={t(
                      fixedProvider.kind === "individual"
                        ? "Professional individual"
                        : "Organization",
                    )}
                    showLock
                  />
                </DisplayField>
                <DisplayField label="Provider">
                  <GeneratedValue
                    value={`${fixedProvider.name} · ${fixedProvider.id}`}
                    showLock
                  />
                </DisplayField>
              </>
            ) : (
              <>
                <Field label="Provider kind">
                  <Select
                    value={form.providerKind}
                    onValueChange={(providerKind) =>
                      setForm((current) => {
                        if (providerKind === current.providerKind) {
                          return current;
                        }
                        return {
                          ...current,
                          providerKind:
                            providerKind as SupportServiceProviderKind,
                          providerId: "",
                          providerName: "",
                          serviceId: hasPersistedOffer
                            ? current.serviceId
                            : "pgs_",
                          formShape: {
                            ...current.formShape,
                            id: hasPersistedOffer
                              ? current.formShape.id
                              : "pgfs_",
                          },
                        };
                      })
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
                      const next = {
                        ...current,
                        providerId: provider.id,
                        providerName: provider.name,
                      };
                      if (hasPersistedOffer || sameProvider) {
                        return next;
                      }
                      return applyGeneratedOfferIds(next);
                    })
                  }
                />
              </>
            )}
            <div className="lg:col-span-2">
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
            </div>
            <div
              data-testid="service-identity-row"
              className="grid gap-4 md:grid-cols-2 lg:col-span-2"
            >
              <DisplayField label="Service ID">
                <ServiceIdGeneratedValue
                  serviceId={form.serviceId}
                  status={serviceIdValidationStatus}
                  canRegenerate={!hasPersistedOffer}
                  onRegenerate={regenerateServiceId}
                />
              </DisplayField>
              <DisplayField label="Service version">
                <ServiceVersionGeneratedValue
                  value={form.serviceVersion || 1}
                  bumpToken={versionBumpToken}
                />
              </DisplayField>
            </div>
            <div
              data-testid="service-category-discovery-row"
              className="grid gap-4 md:grid-cols-2 lg:col-span-2"
            >
              <Field label="Service category">
                <ServiceCategoryPicker
                  value={form.serviceCategory}
                  disabled={isWorking}
                  onChange={(serviceCategory) =>
                    setForm((current) => ({
                      ...current,
                      serviceCategory,
                    }))
                  }
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
            <div
              data-testid="service-offer-audience-row"
              className="grid gap-4 md:grid-cols-2 lg:col-span-2"
            >
              <Field label="Highlighted offer">
                <div className="flex min-h-11 items-start gap-3 rounded-xl border border-violet-100 bg-white/78 px-4 py-3 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
                  <Checkbox
                    id="service-offer-highlighted"
                    checked={form.isHighlightedOffer}
                    onCheckedChange={(checked) =>
                      setForm((current) => {
                        const isHighlightedOffer = checked === true;
                        return {
                          ...current,
                          isHighlightedOffer,
                          isProfessionalOffer: isHighlightedOffer
                            ? false
                            : current.isProfessionalOffer,
                        };
                      })
                    }
                  />
                  <div className="grid gap-1">
                    <Label htmlFor="service-offer-highlighted">
                      {t("Show as a highlighted offer")}
                    </Label>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t(
                        "Places this offer in the highlighted services segment of the native experience.",
                      )}
                    </p>
                  </div>
                </div>
              </Field>
              <Field label="Professional offer">
                <div className="flex min-h-11 items-start gap-3 rounded-xl border border-violet-100 bg-white/78 px-4 py-3 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
                  <Checkbox
                    id="service-offer-professional"
                    checked={form.isProfessionalOffer}
                    onCheckedChange={(checked) =>
                      setForm((current) => {
                        const isProfessionalOffer = checked === true;
                        return {
                          ...current,
                          isProfessionalOffer,
                          isHighlightedOffer: isProfessionalOffer
                            ? false
                            : current.isHighlightedOffer,
                        };
                      })
                    }
                  />
                  <div className="grid gap-1">
                    <Label htmlFor="service-offer-professional">
                      {t("Show as a professional offer")}
                    </Label>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t(
                        "Places this offer in the services for professionals segment of the native experience.",
                      )}
                    </p>
                  </div>
                </div>
              </Field>
            </div>
            <PromotionalBannerImageEditor
              imageUrl={form.promotionalBannerImageUrl}
              imageUploadDataUrl={form.promotionalBannerImageUploadDataUrl}
              imageUploadName={form.promotionalBannerImageUploadName}
              imageUploadMimeType={form.promotionalBannerImageUploadMimeType}
              disabled={isWorking}
              onPendingChange={setPromotionalBannerUploadPending}
              onChange={(patch) =>
                setForm((current) => ({ ...current, ...patch }))
              }
            />
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
        <ServiceOfferMoreInformationEditor
          value={form.moreInformation}
          onChange={(moreInformation) =>
            setForm((current) => ({ ...current, moreInformation }))
          }
        />
        <FormShapeEditor
          form={form}
          setForm={setForm}
          idStatus={serviceIdValidationStatus}
          versionBumpToken={formShapeVersionBumpToken}
        />
        <SlotEditors form={form} setForm={setForm} />
        <TermsEditor form={form} setForm={setForm} />
        <Section title="Acceptance conditions and service limitations">
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              {t(
                "Acceptance conditions describe what must already be true before the provider can accept the request. Service limitations explain what the service does not cover, where the provider's responsibility ends, or which delivery constraints apply. This whole block is optional; add one condition or limitation per line only when the service needs them.",
              )}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Acceptance conditions">
              <Textarea
                value={form.acceptedConditionsText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    acceptedConditionsText: event.target.value,
                  }))
                }
                rows={8}
                placeholder={t("One acceptance condition per line")}
              />
            </Field>
            <Field label="Service limitations">
              <Textarea
                value={form.scopeRulesText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scopeRulesText: event.target.value,
                  }))
                }
                rows={8}
                placeholder={t("One service limitation per line")}
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
        {hasPersistedOffer ? (
          <ServiceOfferVersionHistory
            history={persistedOfferRecord?.changeLogHistoryByVersion}
            currentVersion={form.serviceVersion || 1}
          />
        ) : null}
        {hasPersistedOffer && effectiveOfferId ? (
          <ServiceOfferTransactionStatsSection
            offerId={effectiveOfferId}
            activeRequestsHref={
              isPublisherOfferEditor && form.serviceId.trim()
                ? publisherPortalServiceTransactionsByServiceIdRoute(
                    form.serviceId,
                  )
                : undefined
            }
          />
        ) : null}
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
          router.push(`${routeBase}/${encodeURIComponent(id)}`);
        }}
        onBackToOffers={() => {
          setPublishDialog(null);
          router.push(routeBase);
        }}
        onClose={() => setPublishDialog(null)}
      />
      <ServiceOfferContractContinuityDialog
        open={pendingSaveIntent !== null}
        checked={contractContinuityAccepted}
        pending={saveMutation.isPending}
        onCheckedChange={setContractContinuityAccepted}
        onCancel={() => {
          setPendingSaveIntent(null);
          setContractContinuityAccepted(false);
        }}
        onConfirm={() => void confirmOfferSave()}
      />
      <RawJsonExportDialog
        open={rawExportOpen}
        onOpenChange={setRawExportOpen}
        title="Service offer raw JSON"
        description="Read-only Firebase record preview."
        fileName={rawJsonFileName(
          "service-offer",
          persistedOfferRecord?.id ?? effectiveOfferId,
        )}
        value={persistedOfferRecord}
      />
    </>
  );
}

function WizardReviewClause({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-slate-300 py-8 first:border-t-0">
      <h3 className="font-serif text-sm font-bold uppercase tracking-[0.12em] text-slate-900">
        {number}. {title}
      </h3>
      <div className="mt-5 grid gap-5 text-[0.95rem] leading-7 text-slate-700">
        {children}
      </div>
    </section>
  );
}

function WizardMoreInformationSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h4 className="font-semibold text-slate-950">{title}</h4>
      <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
        {children}
      </div>
    </section>
  );
}

function WizardMoreInformationItem({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="py-4">
      <h5 className="font-semibold text-slate-950">{title}</h5>
      <div className="mt-2 grid gap-3 whitespace-pre-wrap text-slate-700">
        {children}
      </div>
    </article>
  );
}

function WizardMoreInformationUrl({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="break-all font-mono text-sm text-violet-700 underline decoration-violet-300 underline-offset-4"
    >
      {url}
    </a>
  );
}

export function WizardMoreInformationReview({
  information,
}: {
  information: SupportServiceMoreInformation;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const frequentQuestions = information.frequentQuestions ?? [];
  const keyInsights = information.keyInsights ?? [];
  const scientificFacts = information.scientificFacts ?? [];
  const usefulLinks = information.usefulLinks ?? [];
  const bulletSegments = information.bulletSegments ?? [];
  const technicalInformationFacts = information.technicalInformationFacts ?? [];
  const biologicalSampleRequirements =
    information.biologicalSampleRequirements ?? [];
  const hasStructuredInformation =
    frequentQuestions.length > 0 ||
    keyInsights.length > 0 ||
    scientificFacts.length > 0 ||
    usefulLinks.length > 0 ||
    Boolean(information.sampleLink) ||
    bulletSegments.length > 0 ||
    technicalInformationFacts.length > 0 ||
    biologicalSampleRequirements.length > 0;

  if (!hasStructuredInformation && !information.websiteUrl?.trim()) {
    return <p className="italic text-slate-500">{t("Not provided")}</p>;
  }

  return (
    <div
      data-testid="service-offer-wizard-more-information-review"
      className="grid gap-7"
    >
      {frequentQuestions.length ? (
        <WizardMoreInformationSection title={t("Frequent questions")}>
          {frequentQuestions.map((item, index) => (
            <WizardMoreInformationItem
              key={`${item.question}-${index}`}
              title={item.question}
            >
              <p>{item.answer}</p>
            </WizardMoreInformationItem>
          ))}
        </WizardMoreInformationSection>
      ) : null}

      {keyInsights.length ? (
        <WizardMoreInformationSection title={t("Key insights")}>
          {keyInsights.map((item, index) => (
            <WizardMoreInformationItem
              key={`${item.title}-${index}`}
              title={item.title}
            >
              <p>{item.description}</p>
            </WizardMoreInformationItem>
          ))}
        </WizardMoreInformationSection>
      ) : null}

      {scientificFacts.length ? (
        <WizardMoreInformationSection title={t("Scientific facts")}>
          {scientificFacts.map((item, index) => (
            <WizardMoreInformationItem
              key={`${item.title}-${index}`}
              title={item.title}
            >
              <p>{item.description}</p>
            </WizardMoreInformationItem>
          ))}
        </WizardMoreInformationSection>
      ) : null}

      {usefulLinks.length ? (
        <WizardMoreInformationSection title={t("Useful links")}>
          {usefulLinks.map((item, index) => (
            <WizardMoreInformationItem
              key={`${item.title}-${index}`}
              title={item.title}
            >
              <WizardMoreInformationUrl url={item.url} />
            </WizardMoreInformationItem>
          ))}
        </WizardMoreInformationSection>
      ) : null}

      {information.sampleLink ? (
        <WizardMoreInformationSection title={t("Sample link")}>
          <WizardMoreInformationItem title={information.sampleLink.title}>
            <p>{information.sampleLink.description}</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
              <dt className="font-semibold text-slate-900">
                {t("Button title")}
              </dt>
              <dd>{information.sampleLink.buttonTitle}</dd>
              <dt className="font-semibold text-slate-900">{t("URL")}</dt>
              <dd>
                <WizardMoreInformationUrl url={information.sampleLink.url} />
              </dd>
            </dl>
          </WizardMoreInformationItem>
        </WizardMoreInformationSection>
      ) : null}

      {bulletSegments.length ? (
        <WizardMoreInformationSection title={t("Illustrated segments")}>
          {bulletSegments.map((item, index) => {
            const imageSource =
              item.imageUrl?.trim() || item.imageUploadDataUrl?.trim();
            return (
              <WizardMoreInformationItem
                key={`${item.title}-${index}`}
                title={item.title}
              >
                <p>{item.description}</p>
                {imageSource ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageSource}
                    alt={item.title}
                    className="max-h-72 w-full border border-slate-200 object-contain"
                  />
                ) : null}
              </WizardMoreInformationItem>
            );
          })}
        </WizardMoreInformationSection>
      ) : null}

      {technicalInformationFacts.length ? (
        <WizardMoreInformationSection title={t("Technical information")}>
          {technicalInformationFacts.map((item, index) => (
            <WizardMoreInformationItem
              key={`${item.title}-${index}`}
              title={item.title}
            >
              <p>{item.description}</p>
              {item.subitems.length ? (
                <ul className="list-disc space-y-1 pl-5">
                  {item.subitems.map((subitem, subitemIndex) => (
                    <li key={`${subitem}-${subitemIndex}`}>{subitem}</li>
                  ))}
                </ul>
              ) : null}
            </WizardMoreInformationItem>
          ))}
        </WizardMoreInformationSection>
      ) : null}

      {biologicalSampleRequirements.length ? (
        <WizardMoreInformationSection
          title={t("Biological sample requirements")}
        >
          {biologicalSampleRequirements.map((item, index) => (
            <WizardMoreInformationItem
              key={`${item.title}-${index}`}
              title={item.title}
            >
              <p>{item.description}</p>
              <div className="border-l-2 border-slate-300 pl-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  {t("Instructions")}
                </p>
                <p className="mt-1">{item.instructions}</p>
              </div>
            </WizardMoreInformationItem>
          ))}
        </WizardMoreInformationSection>
      ) : null}

      {information.websiteUrl?.trim() ? (
        <WizardMoreInformationSection title={t("Service website")}>
          <div className="py-4">
            <WizardMoreInformationUrl url={information.websiteUrl.trim()} />
          </div>
        </WizardMoreInformationSection>
      ) : null}
    </div>
  );
}

function WizardOfferReview({
  form,
  preparationStatus,
  onRetryPreparation,
}: {
  form: OfferFormState;
  preparationStatus: ServiceIdValidationStatus;
  onRetryPreparation: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const selectedCategory = supportServiceCategoryByKey(form.serviceCategory);
  const bannerSource =
    form.promotionalBannerImageUrl.trim() ||
    form.promotionalBannerImageUploadDataUrl;
  const acceptedConditions = splitLines(form.acceptedConditionsText);
  const serviceLimitations = splitLines(form.scopeRulesText);
  const selectedStages = sortedStages(form.stages);
  const pricingModel = form.commercialTerms.pricingModel ?? "not_specified";
  const pricingLabel =
    pricingModel === "free"
      ? t("Free")
      : pricingModel === "fixed"
        ? `${form.commercialTerms.price?.currency || "ARS"} ${Number(
            form.commercialTerms.price?.amount ?? 0,
          ).toLocaleString(language === "es" ? "es-AR" : "en-US")}`
        : pricingModel === "calculated_after_submission"
          ? t("Calculated after submission")
          : t("Not specified");
  const priceExplanation = form.commercialTerms.price?.summary?.trim();
  const turnaround = turnaroundParts(form.commercialTerms.turnaround);
  const turnaroundUnit = TURNAROUND_UNITS.find(
    (unit) => unit.value === turnaround.unit,
  );
  const turnaroundLabel = turnaround.amount
    ? `${turnaround.amount} ${t(turnaroundUnit?.label ?? "Days")}`
    : t("Not specified");
  const providerKindLabel =
    form.providerKind === "organization"
      ? t("Organization")
      : t("Professional individual");
  const offerProfile = [
    form.isHighlightedOffer ? t("Highlighted offer") : "",
    form.isProfessionalOffer ? t("Professional offer") : "",
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <article
      data-testid="service-offer-wizard-review"
      role="region"
      tabIndex={0}
      aria-label={t("Service offer contract summary")}
      className="mx-auto max-h-[calc(100dvh-22rem)] min-h-80 w-full max-w-[54rem] overflow-y-auto overscroll-contain border border-slate-300 bg-white font-serif text-slate-900 shadow-[0_30px_80px_-38px_rgba(15,23,42,0.34)] [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-4"
    >
      <div className="px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
        <header
          data-testid="service-offer-wizard-review-preview"
          className="text-center"
        >
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            {t("Service offer contract summary")}
          </p>
          <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
            {form.name.trim() || t("Not specified")}
          </h2>
          <p className="mt-4 text-sm italic text-slate-500">
            {t("Document for review before publication")}
          </p>
          <div className="mt-7 border-y border-slate-300 py-3 text-xs uppercase tracking-[0.12em] text-slate-600">
            <span>{t("Service ID")}: </span>
            <span className="font-mono normal-case tracking-normal text-slate-900">
              {form.serviceId.trim() || t("Not specified")}
            </span>
            <span className="px-2 text-slate-300" aria-hidden="true">
              |
            </span>
            <span>{t("Version")}: </span>
            <span className="text-slate-900">{form.serviceVersion || 1}</span>
          </div>
          <WizardOfferPreparationStatus
            status={preparationStatus}
            onRetry={onRetryPreparation}
          />
        </header>

        <WizardReviewClause number="1" title={t("Provider identity")}>
          <dl className="divide-y divide-slate-200 border-y border-slate-200">
            <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
              <dt className="font-semibold text-slate-900">{t("Provider name")}</dt>
              <dd>{form.providerName.trim() || t("Not specified")}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
              <dt className="font-semibold text-slate-900">{t("Provider kind")}</dt>
              <dd>{providerKindLabel}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
              <dt className="font-semibold text-slate-900">{t("Provider ID")}</dt>
              <dd className="break-all font-mono text-sm">
                {form.providerId.trim() || t("Not specified")}
              </dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
              <dt className="font-semibold text-slate-900">{t("Service category")}</dt>
              <dd>
                {selectedCategory
                  ? supportServiceCategoryName(selectedCategory, language)
                  : t("Uncategorized")}
              </dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
              <dt className="font-semibold text-slate-900">{t("Type")}</dt>
              <dd>{offerProfile || t("Not specified")}</dd>
            </div>
          </dl>
          {bannerSource ? (
            <figure className="border-t border-slate-200 pt-5">
              <figcaption className="mb-3 text-sm font-semibold text-slate-900">
                {t("Promotional image")}
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bannerSource}
                alt={form.name.trim() || t("Promotional image")}
                className="aspect-[1024/500] max-h-64 w-full border border-slate-200 object-cover"
              />
            </figure>
          ) : (
            <p className="text-sm italic text-slate-500">
              {t("Promotional image")}: {t("Not provided")}
            </p>
          )}
        </WizardReviewClause>

        <WizardReviewClause number="2" title={t("Service presentation")}>
          <div>
            <h4 className="font-semibold text-slate-950">{t("Description")}</h4>
            <p className="mt-2 whitespace-pre-wrap">
              {form.description.trim() || t("Not specified")}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-950">{t("Provider work")}</h4>
            <p className="mt-2 whitespace-pre-wrap">
              {form.providerWork.trim() || t("Not specified")}
            </p>
          </div>
        </WizardReviewClause>

        <WizardReviewClause number="3" title={t("More information")}>
          <WizardMoreInformationReview information={form.moreInformation} />
        </WizardReviewClause>

        <WizardReviewClause number="4" title={t("Inputs and outputs")}>
          <div>
            <h4 className="font-semibold text-slate-950">{t("Request form")}</h4>
            <p className="mt-1 text-sm text-slate-600">
              {form.supportsFormShape
                ? `${form.formShape.fields.length} ${t("fields")}`
                : t("Not requested")}
            </p>
            {form.supportsFormShape && form.formShape.fields.length ? (
              <ol className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {form.formShape.fields.map((field, index) => {
                  const fieldType = SUPPORT_SERVICE_FORM_FIELD_TYPES.find(
                    (option) => option.value === field.type,
                  );
                  return (
                    <li
                      key={field.key}
                      className="grid gap-1 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4"
                    >
                      <span className="text-slate-400">{index + 1}.</span>
                      <span>
                        <strong className="font-semibold text-slate-900">
                          {field.label}
                        </strong>
                        <span className="ml-2 font-mono text-xs text-slate-500">
                          {field.key}
                        </span>
                      </span>
                      <span className="text-sm text-slate-600">
                        {t(fieldType?.label ?? field.type)} · {field.required ? t("Required") : t("Optional")}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>

          <div>
            <h4 className="font-semibold text-slate-950">{t("Inputs")}</h4>
            {form.inputSlots.length ? (
              <ol className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {form.inputSlots.map((slot, index) => (
                  <li
                    key={`${slot.role}-${index}`}
                    className="grid gap-1 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4"
                  >
                    <span className="text-slate-400">{index + 1}.</span>
                    <span>
                      <strong className="font-semibold text-slate-900">
                        {objectLabel(slotObjectType(slot))}
                      </strong>
                      <span className="ml-2 font-mono text-xs text-slate-500">
                        {slot.role}
                      </span>
                    </span>
                    <span className="text-sm text-slate-600">
                      {slot.required ? t("Required") : t("Optional")} · {slot.cardinality.min}–{slot.cardinality.max}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 italic text-slate-500">{t("No inputs")}</p>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-slate-950">{t("Outputs")}</h4>
            {form.outputSlots.length ? (
              <ol className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {form.outputSlots.map((slot, index) => (
                  <li
                    key={`${slot.role}-${index}`}
                    className="grid gap-1 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4"
                  >
                    <span className="text-slate-400">{index + 1}.</span>
                    <span>
                      <strong className="font-semibold text-slate-900">
                        {outputObjectLabel(slot)}
                      </strong>
                      <span className="ml-2 font-mono text-xs text-slate-500">
                        {slot.role}
                      </span>
                    </span>
                    <span className="text-sm text-slate-600">
                      {t(mutationModeLabel(slot.mutationMode))}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 italic text-slate-500">{t("No outputs")}</p>
            )}
          </div>
        </WizardReviewClause>

        <WizardReviewClause number="5" title={t("Commercial terms")}>
          <dl className="divide-y divide-slate-200 border-y border-slate-200">
            <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
              <dt className="font-semibold text-slate-900">{t("Pricing")}</dt>
              <dd>{pricingLabel}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
              <dt className="font-semibold text-slate-900">{t("Turnaround")}</dt>
              <dd>{turnaroundLabel}</dd>
            </div>
            {priceExplanation ? (
              <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
                <dt className="font-semibold text-slate-900">{t("Price summary")}</dt>
                <dd>{priceExplanation}</dd>
              </div>
            ) : null}
          </dl>
        </WizardReviewClause>

        <WizardReviewClause number="6" title={t("Conditions and limitations")}>
          <div>
            <h4 className="font-semibold text-slate-950">
              {t("Acceptance conditions")}
            </h4>
            {acceptedConditions.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {acceptedConditions.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 italic text-slate-500">{t("Not specified")}</p>
            )}
          </div>
          <div>
            <h4 className="font-semibold text-slate-950">
              {t("Service limitations")}
            </h4>
            {serviceLimitations.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {serviceLimitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 italic text-slate-500">{t("Not specified")}</p>
            )}
          </div>
        </WizardReviewClause>

        <WizardReviewClause number="7" title={t("Stage pipeline")}>
          <ol className="divide-y divide-slate-200 border-y border-slate-200">
            {selectedStages.map((stage, index) => (
              <li
                key={stage}
                className="grid gap-2 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-5"
              >
                <span className="text-xl text-slate-400">{index + 1}.</span>
                <span>
                  <strong className="block font-semibold text-slate-950">
                    {t(stageLabel(stage))}
                  </strong>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    {t(stagePipelineDescription(stage))}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </WizardReviewClause>

        <p className="border-t border-slate-300 pt-6 text-center text-xs italic leading-5 text-slate-500">
          {t("This summary reflects the service terms configured by the provider.")}
        </p>
      </div>
    </article>
  );
}

function WizardOfferPreparationStatus({
  status,
  onRetry,
}: {
  status: ServiceIdValidationStatus;
  onRetry: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  if (status === "available" || status === "locked") {
    return (
      <div
        data-testid="service-offer-wizard-preparation-status"
        role="status"
        className="flex items-start justify-center gap-2 border-b border-emerald-700/30 py-3 text-sm text-emerald-800"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("The service offer is ready to save.")}</span>
      </div>
    );
  }

  if (status === "conflict" || status === "error") {
    return (
      <div
        data-testid="service-offer-wizard-preparation-status"
        role="alert"
        className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-700/30 py-3 text-sm text-amber-900"
      >
        <span className="flex min-w-0 items-start gap-3">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("A unique service identifier could not be prepared.")}</span>
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          {t("Try again")}
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="service-offer-wizard-preparation-status"
      role="status"
      className="flex items-start justify-center gap-2 border-b border-slate-300 py-3 text-sm text-slate-700"
    >
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
      <span>{t("Preparing the service offer...")}</span>
    </div>
  );
}

function ServiceOfferVersionHistory({
  history,
  currentVersion,
}: {
  history: SupportServiceOfferRecord["changeLogHistoryByVersion"];
  currentVersion: number;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [open, setOpen] = useState(false);
  const transitions = Object.entries(history ?? {})
    .flatMap(([key, entry]) => {
      const match = key.match(/^v([1-9]\d*)_to_v([1-9]\d*)$/);
      if (!match) {
        return [];
      }
      return [
        {
          key,
          fromVersion: Number(match[1]),
          toVersion: Number(match[2]),
          text: language === "es" ? entry.es : entry.en,
        },
      ];
    })
    .sort((left, right) => left.fromVersion - right.fromVersion);

  return (
    <>
      <section
        data-testid="service-offer-version-history"
        className={SUPPORT_SERVICE_SECTION_CLASS}
      >
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-4 border-b border-violet-100/80 pb-4 text-left transition-colors hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-4 dark:border-violet-400/14 dark:hover:text-violet-200"
        >
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-700 shadow-inner dark:border-violet-400/18 dark:bg-violet-500/12 dark:text-violet-100">
              <History className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-xl font-semibold text-foreground">
                {t("Version history")}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
                <span>{`${transitions.length} ${t(
                  transitions.length === 1
                    ? "version change"
                    : "version changes",
                )}`}</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:border-emerald-400/24 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <LockKeyhole className="h-3 w-3" />
                  {t("Read only")}
                </span>
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-200">
            <span className="hidden sm:inline">{t("Open full history")}</span>
            <Maximize2 className="h-4 w-4" />
          </span>
        </button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[min(calc(100vw-2rem),90rem)] max-w-none flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white p-0 shadow-[0_34px_120px_rgba(109,40,217,0.24)] sm:max-w-none dark:border-violet-300/20 dark:bg-slate-950">
          <DialogHeader className="shrink-0 border-b border-violet-100 px-5 py-5 text-left sm:px-7 dark:border-violet-400/16">
            <div className="flex items-start gap-3 pr-8">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-400/18 dark:bg-violet-500/12 dark:text-violet-100">
                <History className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="font-heading text-2xl font-semibold">
                  {t("Version history")}
                </DialogTitle>
                <DialogDescription className="mt-1 leading-6">
                  {t(
                    "Complete read-only record of every service-offer version transition.",
                  )}
                </DialogDescription>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{`${transitions.length} ${t(
                    transitions.length === 1
                      ? "version change"
                      : "version changes",
                  )}`}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:border-emerald-400/24 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <LockKeyhole className="h-3 w-3" />
                    {t("Read only")}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>
          <div
            data-testid="service-offer-version-history-scroll"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7 sm:py-7"
          >
            {transitions.length > 0 ? (
              <div className="relative grid gap-6 before:absolute before:bottom-8 before:left-[1.45rem] before:top-8 before:w-px before:bg-violet-200 dark:before:bg-violet-400/24">
                {transitions.map((transition) => {
                  const lines = transition.text
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean);
                  const heading = lines[0] ?? transition.key;
                  const changes = lines.slice(1).map((line) =>
                    line.replace(/^·\s*/, ""),
                  );

                  return (
                    <article
                      key={transition.key}
                      aria-label={`${t("Version transition")} v${transition.fromVersion} ${t("to")} v${transition.toVersion}`}
                      className="relative grid min-w-0 gap-4 pl-14 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6"
                    >
                      <span className="absolute left-0 top-4 flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-white bg-violet-600 text-white shadow-[0_12px_28px_rgba(109,40,217,0.28)] dark:border-slate-950">
                        <History className="h-4 w-4" />
                      </span>
                      <div className="flex min-w-0 flex-col justify-center rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-4 dark:border-violet-400/18 dark:bg-violet-500/10">
                        <code className="break-all text-xs font-semibold text-violet-700 dark:text-violet-200">
                          {transition.key}
                        </code>
                        <div className="mt-3 flex items-center gap-2" aria-hidden="true">
                          <span className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 font-mono text-sm font-semibold text-violet-800 dark:border-violet-400/24 dark:bg-slate-950/60 dark:text-violet-100">
                            {`v${transition.fromVersion}`}
                          </span>
                          <ArrowRight className="h-4 w-4 text-violet-500" />
                          <span className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-mono text-sm font-semibold text-cyan-800 dark:border-cyan-400/24 dark:bg-cyan-500/10 dark:text-cyan-100">
                            {`v${transition.toVersion}`}
                          </span>
                        </div>
                        {transition.toVersion === currentVersion ? (
                          <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/24 dark:bg-emerald-500/10 dark:text-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            {t("Current version")}
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0 rounded-xl border border-violet-100 bg-white/82 px-5 py-5 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
                        <p className="whitespace-pre-wrap break-words text-base font-semibold leading-6 text-foreground">
                          {heading}
                        </p>
                        <div className="mt-4 grid gap-3">
                          {changes.map((change, index) => (
                            <div
                              key={`${transition.key}-${index}`}
                              className="flex min-w-0 items-start gap-3 rounded-lg bg-violet-50/65 px-4 py-3 text-sm leading-6 text-foreground dark:bg-violet-500/8"
                            >
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                              <span className="min-w-0 whitespace-pre-wrap break-words">
                                {change}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/45 px-4 py-4 text-sm text-muted-foreground dark:border-violet-400/20 dark:bg-violet-500/8">
                <History className="h-4 w-4 shrink-0" />
                <span>{t("No version changes have been recorded yet.")}</span>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t border-violet-100 px-5 py-4 sm:px-7 dark:border-violet-400/16">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
            >
              {t("Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ServiceOfferContractContinuityDialog({
  open,
  checked,
  pending,
  onCheckedChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  checked: boolean;
  pending: boolean;
  onCheckedChange: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const checkboxId = "service-offer-contract-continuity";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent className="max-w-2xl overflow-hidden rounded-2xl border border-violet-100 bg-white p-0 shadow-[0_34px_120px_rgba(109,40,217,0.22)] dark:border-violet-300/22 dark:bg-slate-950">
        <AlertDialogHeader className="border-b border-violet-100 px-6 py-5 text-left dark:border-violet-300/16">
          <AlertDialogTitle className="font-heading text-xl font-semibold">
            {t("Existing transaction contracts remain binding")}
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-6">
            {t(
              "This save creates a new service-offer version. It does not rewrite any transaction already created.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 px-6 py-5">
          <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/80 p-4 dark:border-violet-400/24 dark:bg-violet-500/10">
            <Checkbox
              id={checkboxId}
              checked={checked}
              disabled={pending}
              onCheckedChange={(value) => onCheckedChange(value === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor={checkboxId}
              className="cursor-pointer text-sm leading-6 text-violet-950 dark:text-violet-50"
            >
              {t(
                "I acknowledge that every existing transaction must be completed under the offer version, requirements, outputs, timing, and provider commitments that applied when that user requested the service.",
              )}
            </Label>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm leading-6 text-emerald-950 dark:border-emerald-400/24 dark:bg-emerald-500/10 dark:text-emerald-100">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              {t(
                "The new version applies only to transactions created after this save.",
              )}
            </p>
          </div>
        </div>

        <AlertDialogFooter className="mx-0 mb-0 gap-3 border-violet-100 bg-violet-50/55 px-6 py-5 dark:border-violet-300/14 dark:bg-violet-950/16">
          <AlertDialogCancel disabled={pending} onClick={onCancel}>
            {t("Cancel")}
          </AlertDialogCancel>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!checked || pending}
            className="h-10 rounded-xl bg-violet-600 px-4 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {t("Acknowledge and save")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  layout = "horizontal",
  allowEmptySelection = false,
}: {
  value: SupportServiceStage[];
  predictedValue: SupportServiceStage[];
  onChange: (value: SupportServiceStage[]) => void;
  onApplyPrediction: () => void;
  layout?: "horizontal" | "vertical";
  allowEmptySelection?: boolean;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const selectedStages = sortedStages(value);
  const selectedSet = new Set(selectedStages);
  const predictedSet = new Set(predictedValue);
  const matchesPrediction = sameStages(selectedStages, predictedValue);

  function toggle(stage: SupportServiceStage) {
    if (selectedSet.has(stage)) {
      if (!allowEmptySelection && selectedStages.length <= 1) {
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

      <div
        data-testid="service-offer-stage-pipeline-layout"
        data-orientation={layout}
        className={cn(
          "grid gap-3",
          layout === "horizontal" &&
            "md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch",
        )}
      >
        {SUPPORT_SERVICE_STAGES.map((stage, index) => {
          const selected = selectedSet.has(stage.value);
          const predicted = predictedSet.has(stage.value);
          const StageIcon = stagePipelineIcon(stage.value);
          const checkboxId = `service-offer-stage-${stage.value}`;
          const stageCheckbox = (
            <Checkbox
              id={checkboxId}
              checked={selected}
              onCheckedChange={() => toggle(stage.value)}
              disabled={
                !allowEmptySelection &&
                selected &&
                selectedStages.length <= 1
              }
              aria-label={t(stage.label)}
              className={cn(
                layout === "vertical"
                  ? "mt-1 size-8 rounded-lg border-[3px] [&_svg]:size-5"
                  : "ml-auto",
              )}
            />
          );

          return (
            <div key={stage.value} className="contents">
              <div
                data-testid={`service-offer-stage-card-${stage.value}`}
                className={cn(
                  "grid min-h-36 gap-3 rounded-2xl border p-4 transition",
                  selected
                    ? "border-violet-300 bg-white text-foreground shadow-[0_18px_44px_-34px_rgba(109,40,217,0.70)] dark:border-violet-300/34 dark:bg-slate-950/54"
                    : "border-violet-100/70 bg-white/52 text-muted-foreground dark:border-violet-400/12 dark:bg-slate-950/24",
                )}
              >
                <div
                  data-testid="service-offer-stage-header"
                  className="flex items-start gap-4"
                >
                  {layout === "vertical" ? stageCheckbox : null}
                  <Label
                    htmlFor={checkboxId}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 font-normal"
                  >
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
                          {t("Suggested based on input and output types")}
                        </span>
                      ) : null}
                    </span>
                  </Label>
                  {layout === "horizontal" ? stageCheckbox : null}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t(stagePipelineDescription(stage.value))}
                </p>
              </div>
              {index < SUPPORT_SERVICE_STAGES.length - 1 ? (
                <div
                  data-testid="service-offer-stage-pipeline-connector"
                  data-orientation={layout}
                  className={cn(
                    "items-center justify-center",
                    layout === "vertical" ? "flex" : "hidden md:flex",
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-100 bg-white text-violet-700 shadow-sm dark:border-violet-400/18 dark:bg-slate-950/70 dark:text-violet-100">
                    {layout === "vertical" ? (
                      <ArrowDown
                        data-testid="service-offer-stage-pipeline-arrow-down"
                        className="h-5 w-5"
                      />
                    ) : (
                      <ArrowRight
                        data-testid="service-offer-stage-pipeline-arrow-right"
                        className="h-5 w-5"
                      />
                    )}
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

function serviceCategoryGroupIcon(groupId: string) {
  switch (groupId) {
    case "clinical_preparation":
      return ClipboardList;
    case "specimen_and_laboratory":
      return FlaskConical;
    case "specialized_screening":
      return UserRound;
    case "bioinformatics_pipeline":
      return Binary;
    case "interpretation_by_purpose":
      return Search;
    case "complete_reproductive_reports":
      return Fingerprint;
    case "complete_animal_food_reports":
      return FlaskConical;
    case "human_health_and_support":
      return UserRound;
    case "legal_advice":
      return Building2;
    case "education_and_career":
      return ClipboardList;
    case "technology_business_and_finance":
      return BriefcaseBusiness;
    case "health_professional_development":
      return Stethoscope;
    default:
      return FileText;
  }
}

function normalizeServiceCategorySearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function ServiceCategoryPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: SupportServiceCategoryKey) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SupportServiceCategoryKey | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const selectedCategory = supportServiceCategoryByKey(value);
  const draftCategory = supportServiceCategoryByKey(draft);
  const normalizedSearchQuery = normalizeServiceCategorySearch(searchQuery);
  const visibleCategoryGroups = SUPPORT_SERVICE_CATEGORY_GROUPS.map(
    (group) => ({
      ...group,
      categories: group.keys
        .map((key) =>
          SUPPORT_SERVICE_CATEGORIES.find(
            (category) => category.key === key,
          ),
        )
        .filter(
          (category): category is NonNullable<typeof category> =>
            category !== undefined,
        )
        .filter(
          (category) =>
            !normalizedSearchQuery ||
              normalizeServiceCategorySearch(
                [
                  category.key,
                  category.nameEnglish,
                  category.nameSpanish,
                  category.descriptionEnglish,
                  category.descriptionSpanish,
                ].join(" "),
              ).includes(normalizedSearchQuery),
        ),
    }),
  ).filter((group) => group.categories.length > 0);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraft(selectedCategory?.key ?? "");
      setSearchQuery("");
    }
    setOpen(nextOpen);
  }

  function applyCategory() {
    if (!isSupportServiceCategoryKey(draft)) {
      return;
    }
    onChange(draft);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        disabled={disabled}
        aria-label={
          selectedCategory
            ? t("Change service category")
            : t("Choose service category")
        }
        className={cn(
          "flex min-h-20 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-sm transition",
          selectedCategory
            ? "border-violet-200 bg-white/82 hover:border-violet-300 hover:bg-violet-50/70 dark:border-violet-400/20 dark:bg-slate-950/42 dark:hover:bg-violet-500/10"
            : "border-amber-300 bg-amber-50/85 hover:border-amber-400 hover:bg-amber-50 dark:border-amber-400/30 dark:bg-amber-500/10",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            selectedCategory
              ? "bg-violet-100 text-violet-700 dark:bg-violet-500/16 dark:text-violet-100"
              : "bg-amber-100 text-amber-700 dark:bg-amber-500/16 dark:text-amber-100",
          )}
        >
          {selectedCategory ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <CircleAlert className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            {selectedCategory
              ? supportServiceCategoryName(selectedCategory, language)
              : t("Uncategorized")}
          </span>
          {selectedCategory ? (
            <code className="mt-1 block truncate text-[11px] text-violet-700 dark:text-violet-200">
              {selectedCategory.key}
            </code>
          ) : null}
        </span>
        <Settings2 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-200" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[min(calc(100vw-2rem),80rem)] max-w-none flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white p-0 shadow-[0_34px_120px_rgba(109,40,217,0.24)] sm:max-w-none dark:border-violet-300/20 dark:bg-slate-950">
          <DialogHeader className="shrink-0 border-b border-violet-100 bg-violet-50/55 px-6 py-5 text-left dark:border-violet-300/16 dark:bg-violet-950/24">
            <DialogTitle className="font-heading text-2xl font-semibold">
              {t("Choose service category")}
            </DialogTitle>
            <DialogDescription className="max-w-4xl leading-6">
              {t(
                "Choose the single category that describes the primary contracted and billable outcome. Supporting inputs, steps, and provider profession do not determine it.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="shrink-0 border-b border-violet-100 bg-white px-5 py-4 sm:px-6 dark:border-violet-300/16 dark:bg-slate-950">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label={t("Search service categories")}
                placeholder={t("Search service categories by name or code...")}
                className="h-11 rounded-xl border-violet-200 bg-violet-50/35 pl-10 focus-visible:ring-violet-400 dark:border-violet-400/20 dark:bg-violet-500/8"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div
              role="radiogroup"
              aria-label={t("Service category options")}
              className="grid gap-7"
            >
              {visibleCategoryGroups.map((group) => {
                const GroupIcon = serviceCategoryGroupIcon(group.id);

                return (
                  <section key={group.id} className="grid gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/16 dark:text-violet-100">
                        <GroupIcon className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          {language === "es"
                            ? group.nameSpanish
                            : group.nameEnglish}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {language === "es"
                            ? group.descriptionSpanish
                            : group.descriptionEnglish}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {group.categories.map((category) => {
                        const selected = draft === category.key;
                        return (
                          <button
                            key={category.key}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setDraft(category.key)}
                            className={cn(
                              "flex min-h-40 w-full items-start gap-4 rounded-xl border px-4 py-4 text-left transition",
                              selected
                                ? "border-violet-400 bg-violet-50 text-violet-950 shadow-[0_16px_40px_-28px_rgba(109,40,217,0.7)] ring-2 ring-violet-200 dark:border-violet-300/50 dark:bg-violet-500/14 dark:text-violet-50 dark:ring-violet-400/18"
                                : "border-violet-100 bg-white/82 text-foreground hover:border-violet-200 hover:bg-violet-50/55 dark:border-violet-400/16 dark:bg-slate-950/42 dark:hover:bg-violet-500/10",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                                selected
                                  ? "border-violet-600 bg-violet-600 text-white"
                                  : "border-violet-200 bg-white text-transparent dark:border-violet-400/28 dark:bg-slate-950",
                              )}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">
                                {supportServiceCategoryName(category, language)}
                              </span>
                              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                                {supportServiceCategoryDescription(
                                  category,
                                  language,
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {visibleCategoryGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/45 px-5 py-10 text-center text-sm text-muted-foreground dark:border-violet-400/24 dark:bg-violet-500/8">
                  {t("No service categories match this search.")}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-3 border-t border-violet-100 bg-white/95 px-6 py-4 dark:border-violet-300/16 dark:bg-slate-950/95">
            <div className="mr-auto hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold text-foreground">
                {draftCategory
                  ? supportServiceCategoryName(draftCategory, language)
                  : t("No category selected")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {draftCategory?.key ?? t("Select one category to continue.")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              onClick={applyCategory}
              disabled={!draftCategory}
              className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
            >
              <Check className="h-4 w-4" />
              {t("Apply category")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
        <DialogContent className="w-[min(calc(100vw-2rem),92rem)] max-w-none sm:max-w-none">
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

function TransactionRequesterIdentity({
  isEditing,
  showLockedFields,
  requestedByUserId,
  requestedByUserEmail,
  onChange,
}: {
  isEditing: boolean;
  showLockedFields?: boolean;
  requestedByUserId: string;
  requestedByUserEmail: string;
  onChange: (identity: { userId: string; email: string }) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftUserId, setDraftUserId] = useState(requestedByUserId);

  const usersQuery = useInfiniteQuery({
    queryKey: ["support-service-requester-picker"],
    queryFn: ({ pageParam }) =>
      sdkFetch<CommunityUsersPage>(
        typeof pageParam === "string" && pageParam
          ? `/users?pageToken=${encodeURIComponent(pageParam)}`
          : "/users",
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    enabled: open,
  });

  const communityUsers = useMemo(
    () =>
      (usersQuery.data?.pages.flatMap((page) => page.users) ?? []).filter(
        (user) => user.linkedRecords?.communityUser,
      ),
    [usersQuery.data?.pages],
  );
  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return communityUsers;
    }
    return communityUsers.filter((user) =>
      [user.uid, user.email, user.displayName, user.country, user.patientID]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [communityUsers, query]);
  const draftUser = communityUsers.find((user) => user.uid === draftUserId);

  function openPicker() {
    setDraftUserId(requestedByUserId);
    setOpen(true);
  }

  function applyUser() {
    if (!draftUser?.email || draftUser.disabled) {
      return;
    }
    onChange({ userId: draftUser.uid, email: draftUser.email.toLowerCase() });
    setOpen(false);
  }

  return (
    <article className="grid gap-4 rounded-2xl border border-violet-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.88))] p-5 shadow-[0_18px_52px_-42px_rgba(109,40,217,0.58)] dark:border-violet-400/20 dark:bg-[linear-gradient(145deg,rgba(18,23,40,0.94),rgba(30,24,57,0.84))] lg:col-span-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/16 dark:text-violet-100">
            <UserRound className="h-4 w-4" />
          </span>
          <div>
            <h4 className="font-heading text-base font-semibold text-foreground">
              {t("Requester identity")}
            </h4>
            <p className="text-xs leading-5 text-muted-foreground">
              {requestedByUserId
                ? t("Linked community user")
                : t("Email-only deferred requester")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DisplayField label="Requester user ID">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <GeneratedValue
                value={requestedByUserId || t("No user selected")}
                showLock={showLockedFields && isEditing}
              />
            </div>
            {!isEditing ? (
              <div className="flex flex-wrap gap-2">
                {requestedByUserId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onChange({ userId: "", email: "" })}
                    className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
                  >
                    <XCircle className="h-4 w-4" />
                    {t("Remove linked user")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openPicker}
                  className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
                >
                  <Search className="h-4 w-4" />
                  {t("Pick a user")}
                </Button>
              </div>
            ) : null}
          </div>
        </DisplayField>
        <Field label="Requester email">
          {isEditing ? (
            <GeneratedValue
              value={requestedByUserEmail || "-"}
              showLock={showLockedFields}
            />
          ) : (
            <Input
              value={requestedByUserEmail}
              onChange={(event) =>
                onChange({ userId: "", email: event.target.value })
              }
              type="email"
              maxLength={254}
              required={!requestedByUserId}
              disabled={Boolean(requestedByUserId)}
              placeholder={t("Enter an email when no user is linked")}
            />
          )}
        </Field>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88vh] w-[min(calc(100vw-2rem),86rem)] max-w-none flex-col overflow-hidden sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{t("Choose requester")}</DialogTitle>
            <DialogDescription>
              {t(
                "Search community users and select exactly one requester. Applying the selection fills both the user ID and email.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search community users by name, email, or ID")}
                className="pl-9"
              />
            </label>
            <div className="min-h-0 overflow-y-auto rounded-2xl border border-violet-100/80 bg-white/80 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Community user")}</TableHead>
                    <TableHead>{t("Email")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead className="text-right">{t("Selection")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQuery.isLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={4}>
                          <Skeleton className="h-12 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : usersQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center">
                        <p className="text-sm text-destructive">
                          {t("Community users could not be loaded.")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => usersQuery.refetch()}
                          className={cn(
                            SUPPORT_SERVICE_SOFT_BUTTON_CLASS,
                            "mt-3",
                          )}
                        >
                          <RefreshCw className="h-4 w-4" />
                          {t("Try again")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {t("No community users match this search.")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => {
                      const selected = user.uid === draftUserId;
                      const selectable = Boolean(user.email) && !user.disabled;
                      return (
                        <TableRow
                          key={user.uid}
                          role="radio"
                          aria-checked={selected}
                          aria-disabled={!selectable}
                          onClick={() => selectable && setDraftUserId(user.uid)}
                          className={cn(
                            selectable && "cursor-pointer",
                            selected && "bg-violet-50 dark:bg-violet-500/12",
                            !selectable && "opacity-55",
                          )}
                        >
                          <TableCell className="min-w-[18rem]">
                            <div className="font-medium text-foreground">
                              {user.displayName || user.email || user.uid}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {user.uid}
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[16rem] text-sm">
                            {user.email || t("No email available")}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={user.disabled ? "destructive" : "secondary"}>
                                {user.disabled ? t("Disabled") : t("Active")}
                              </Badge>
                              {user.emailVerified ? (
                                <Badge variant="outline">{t("Verified")}</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={cn(
                                "inline-flex h-7 w-7 items-center justify-center rounded-full border",
                                selected
                                  ? "border-violet-600 bg-violet-600 text-white"
                                  : "border-violet-200 text-transparent dark:border-violet-400/28",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-3 border-t border-violet-100 pt-4 dark:border-violet-300/16">
            {usersQuery.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => usersQuery.fetchNextPage()}
                disabled={usersQuery.isFetchingNextPage}
                className={cn(SUPPORT_SERVICE_SOFT_BUTTON_CLASS, "mr-auto")}
              >
                {usersQuery.isFetchingNextPage
                  ? t("Loading...")
                  : t("Load more")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              onClick={applyUser}
              disabled={!draftUser?.email || Boolean(draftUser.disabled)}
              className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
            >
              <Check className="h-4 w-4" />
              {t("Apply user")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function FormShapeEditor({
  form,
  setForm,
  idStatus,
  versionBumpToken,
  presentation = "form",
}: {
  form: OfferFormState;
  setForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
  idStatus: ServiceIdValidationStatus;
  versionBumpToken: number;
  presentation?: "form" | "wizard";
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const formShapeIdPreview = formShapeIdForServiceId(form.serviceId);
  const [fieldDialog, setFieldDialog] = useState<{
    index: number | null;
    draft: FormFieldDraft;
  } | null>(null);
  const [fieldError, setFieldError] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importRulesOpen, setImportRulesOpen] = useState(false);
  const [csvImportError, setCsvImportError] = useState("");
  const [importedFieldCount, setImportedFieldCount] = useState<number | null>(
    null,
  );

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
      helpInfoText: "",
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
    setFieldError("");
    setFieldDialog((current) =>
      current ? { ...current, draft: { ...current.draft, ...patch } } : current,
    );
  }

  function saveFieldDraft() {
    if (!fieldDialog) {
      return;
    }

    const draft = fieldDialog.draft;
    let normalized: SupportServiceFormField;
    try {
      normalized = normalizedFormField(
        draft,
        new Set(
          form.formShape.fields
            .filter((_, index) => index !== fieldDialog.index)
            .map((field) => field.key.trim()),
        ),
      );
    } catch (error) {
      setFieldError(
        t(error instanceof Error ? error.message : "Invalid form field."),
      );
      return;
    }

    const nextField: FormFieldDraft = {
      ...normalized,
      options: normalized.options ?? [],
      optionsText:
        normalized.type === "enum" || normalized.type === "multi_enum"
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

  async function importFieldsFromCsv(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }

    setCsvImportError("");
    setImportedFieldCount(null);
    if (file.size > SUPPORT_SERVICE_FORM_CSV_MAX_BYTES) {
      setCsvImportError(t("CSV file exceeds the 512 KiB limit."));
      return;
    }

    try {
      const fields = parseSupportServiceFormCsv(await file.text());
      setForm((current) => ({
        ...current,
        supportsFormShape: true,
        formShape: {
          ...current.formShape,
          fields: formFieldsFromRecord(fields),
        },
        inputSlots: withFormInputSlot(current.inputSlots),
      }));
      setImportedFieldCount(fields.length);
    } catch (error) {
      setCsvImportError(
        error instanceof Error ? error.message : t("Could not import CSV."),
      );
    }
  }

  return (
    <Section title="Form input" hideTitle={presentation === "wizard"}>
      {presentation === "wizard" ? (
        <button
          type="button"
          data-testid="service-offer-wizard-form-disclosure"
          aria-expanded={form.supportsFormShape}
          onClick={() => setSupportsFormShape(!form.supportsFormShape)}
          className={cn(
            "flex min-h-32 w-full items-center gap-4 rounded-lg border px-5 py-5 text-left shadow-sm transition duration-200",
            form.supportsFormShape
              ? "border-violet-300 bg-violet-50/80 text-violet-950 shadow-[0_18px_44px_-34px_rgba(109,40,217,0.72)] dark:border-violet-300/34 dark:bg-violet-500/12 dark:text-violet-50"
              : "border-violet-100 bg-white/82 text-foreground hover:border-violet-300 hover:bg-violet-50/60 dark:border-violet-400/16 dark:bg-slate-950/42 dark:hover:bg-violet-500/10",
          )}
        >
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border",
              form.supportsFormShape
                ? "border-violet-200 bg-white text-violet-700 dark:border-violet-400/24 dark:bg-slate-950/60 dark:text-violet-100"
                : "border-violet-100 bg-violet-50 text-violet-600 dark:border-violet-400/16 dark:bg-violet-500/10 dark:text-violet-200",
            )}
          >
            <ClipboardList className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-lg font-semibold">
              {t("Support form input")}
            </span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              {form.supportsFormShape
                ? t("The request form is included in this offer.")
                : t("This offer does not request a form.")}
            </span>
          </span>
          <span className="hidden shrink-0 rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-xs font-semibold text-violet-800 sm:inline-flex dark:border-violet-400/24 dark:bg-slate-950/50 dark:text-violet-100">
            {form.supportsFormShape ? t("Enabled") : t("Not requested")}
          </span>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-violet-600 transition-transform duration-200 dark:text-violet-200",
              form.supportsFormShape && "rotate-180",
            )}
          />
        </button>
      ) : (
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
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          aria-label={t("CSV file")}
          data-testid="service-form-csv-input"
          className="sr-only"
          onChange={(event) => void importFieldsFromCsv(event)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => csvInputRef.current?.click()}
          className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
        >
          <UploadCloud className="h-4 w-4" />
          <span>{t("Import from CSV")}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setImportRulesOpen(true)}
          className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
        >
          <FileText className="h-4 w-4" />
          <span>{t("Import rules")}</span>
        </Button>
      </div>
      {csvImportError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("Could not import CSV.")} {csvImportError}
        </p>
      ) : null}
      {importedFieldCount != null ? (
        <p
          role="status"
          data-testid="service-form-csv-import-status"
          className="text-sm text-emerald-700 dark:text-emerald-300"
        >
          {t("CSV loaded:")} {importedFieldCount} {t("fields")}.
          {" "}
          {t("Save changes to persist the imported form and create the next offer version.")}
        </p>
      ) : null}
      {!form.supportsFormShape ? null : (
        <>
          {presentation === "form" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <DisplayField label="Form shape ID">
                <FormShapeIdGeneratedValue
                  formShapeId={formShapeIdPreview}
                  status={idStatus}
                />
              </DisplayField>
              <DisplayField label="Form shape version">
                <FormShapeVersionGeneratedValue
                  value={form.formShape.version || 1}
                  bumpToken={versionBumpToken}
                />
              </DisplayField>
            </div>
          ) : null}
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
                  {presentation === "form" ? (
                    <>
                      <TableHead>{t("Required")}</TableHead>
                      <TableHead>{t("Help info")}</TableHead>
                      <TableHead>{t("Options")}</TableHead>
                    </>
                  ) : null}
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
                    {presentation === "form" ? (
                      <>
                        <TableCell>
                          {field.required ? (
                            <Badge variant="outline">{t("Required")}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {field.helpInfoText || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {splitLines(field.optionsText).length || "-"}
                        </TableCell>
                      </>
                    ) : null}
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
                  <Field label="Help info text">
                    <Textarea
                      value={fieldDialog.draft.helpInfoText ?? ""}
                      onChange={(event) =>
                        updateFieldDraft({ helpInfoText: event.target.value })
                      }
                      rows={3}
                      maxLength={500}
                      placeholder={t(
                        "Optional guidance shown from the field info button.",
                      )}
                    />
                  </Field>
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
      <Dialog open={importRulesOpen} onOpenChange={setImportRulesOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("Import rules")}</DialogTitle>
            <DialogDescription>
              {t("Rules for request-form CSV imports.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 text-sm">
            <section className="grid gap-2">
              <h3 className="font-heading font-semibold">
                {t("Exact header")}
              </h3>
              <code className="overflow-x-auto rounded-lg border bg-muted/35 p-3 font-mono text-xs">
                {SUPPORT_SERVICE_FORM_CSV_HEADER}
              </code>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  {t(
                    "Use UTF-8 comma-separated CSV. The first row must match the exact header above.",
                  )}
                </li>
                <li>
                  {t(
                    "Use one row per form field. Row order becomes form field order.",
                  )}
                </li>
                <li>
                  {t(
                    "Quote cells containing commas, double quotes, or line breaks. Escape a double quote as two double quotes.",
                  )}
                </li>
              </ul>
            </section>

            <section className="grid gap-2">
              <h3 className="font-heading font-semibold">
                {t("Column rules")}
              </h3>
              <div className={SUPPORT_SERVICE_TABLE_SHELL_CLASS}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Column")}</TableHead>
                      <TableHead>{t("Rule")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-mono">key</TableCell>
                      <TableCell>
                        {t(
                          "Required and unique. Start with a lowercase letter; then use only lowercase letters, numbers, or underscores. Maximum 64 characters.",
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono">label</TableCell>
                      <TableCell>
                        {t("Required text. Maximum 120 characters.")}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono">type</TableCell>
                      <TableCell>
                        {t("Required. Use one exact accepted type listed below.")}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono">required</TableCell>
                      <TableCell>
                        {t("Use exactly lower-case true or false.")}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono">helpInfoText</TableCell>
                      <TableCell>
                        {t("Optional text. Maximum 500 characters.")}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono">options</TableCell>
                      <TableCell>
                        {t(
                          "Required only for enum and multi_enum. Use a nonempty JSON array of objects containing only value and label. Leave blank for every other type.",
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </section>

            <section className="grid gap-2">
              <h3 className="font-heading font-semibold">
                {t("Accepted field types")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {SUPPORT_SERVICE_FORM_FIELD_TYPES.map((option) => (
                  <Badge key={option.value} variant="outline" className="font-mono">
                    {option.value}
                  </Badge>
                ))}
              </div>
            </section>

            <section className="grid gap-2">
              <h3 className="font-heading font-semibold">
                {t("Options JSON example")}
              </h3>
              <code className="overflow-x-auto rounded-lg border bg-muted/35 p-3 font-mono text-xs">
                {'[{"value":"active","label":"Activo"},{"value":"inactive","label":"Inactivo"}]'}
              </code>
              <p className="text-muted-foreground">
                {t(
                  "Inside CSV, quote the entire options cell and escape each JSON double quote by doubling it.",
                )}
              </p>
            </section>

            <section className="grid gap-2">
              <h3 className="font-heading font-semibold">
                {t("Import behavior")}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  {t(
                    "The entire CSV is validated before any field changes. A single invalid row rejects the complete import.",
                  )}
                </li>
                <li>
                  {t(
                    "Imported fields replace the current request-form fields; offer identity, outputs, and commercial terms are unchanged.",
                  )}
                </li>
                <li>
                  {t(
                    "Importing automatically enables the request form and its required form / pgo_form input slot.",
                  )}
                </li>
                <li>
                  {t(
                    "The import remains an unsaved edit until Save changes completes successfully.",
                  )}
                </li>
              </ul>
            </section>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportRulesOpen(false)}
              className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
            >
              {t("Close")}
            </Button>
            <Button asChild className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}>
              <a href={TWO_PQ_STUDY_REQUEST_FORM_CSV_PATH} download>
                <Download className="h-4 w-4" />
                {t("Download 2PQ CSV")}
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function SlotEditors({
  form,
  setForm,
  layout = "columns",
}: {
  form: OfferFormState;
  setForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
  layout?: "columns" | "stack";
}) {
  return (
    <Section title="Slots">
      <div
        data-testid="service-offer-slot-layout"
        className={cn(
          "grid gap-6",
          layout === "columns" && "xl:grid-cols-2 xl:gap-8",
        )}
      >
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
  layout = "columns",
}: {
  form: OfferFormState;
  setForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
  layout?: "columns" | "stack";
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

  function updateTurnaroundVisibility(value: string) {
    if (value !== "not_specified" && value !== "estimated") {
      return;
    }

    setForm((current) => ({
      ...current,
      showsEstimatedTurnaround: value === "estimated",
      commercialTerms:
        value === "estimated"
          ? current.commercialTerms
          : { ...current.commercialTerms, turnaround: undefined },
    }));
  }

  function updateTurnaroundUnit(unit: string) {
    if (!TURNAROUND_UNITS.some((option) => option.value === unit)) {
      return;
    }
    const nextUnit = unit as TurnaroundUnit;
    setTurnaroundUnitDraft(nextUnit);
    if (!turnaround.amount) {
      return;
    }
    updateTerms({
      turnaround: formatTurnaround(turnaround.amount, nextUnit),
    });
  }

  return (
    <Section title="Commercial terms">
      <div
        data-testid="service-offer-terms-layout"
        className={cn(
          "grid gap-5",
          layout === "columns" && "xl:grid-cols-2",
        )}
      >
        <section
          data-testid="service-offer-pricing-card"
          className="grid content-start gap-5 rounded-2xl border border-sky-100 bg-[linear-gradient(145deg,rgba(240,249,255,0.82),rgba(255,255,255,0.94))] p-5 shadow-sm dark:border-sky-400/15 dark:bg-[linear-gradient(145deg,rgba(14,116,144,0.12),rgba(2,6,23,0.42))]"
        >
          <div className="flex items-center gap-3 border-b border-sky-100 pb-4 dark:border-sky-400/15">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">
              <BadgeDollarSign className="h-4 w-4" aria-hidden="true" />
            </span>
            <h4 className="font-heading text-base font-semibold text-foreground">
              {t("Pricing and explanation")}
            </h4>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
        </section>

        <section
          data-testid="service-offer-turnaround-card"
          className="grid content-start gap-5 rounded-2xl border border-violet-100 bg-[linear-gradient(145deg,rgba(245,243,255,0.88),rgba(255,255,255,0.94))] p-5 shadow-sm dark:border-violet-400/15 dark:bg-[linear-gradient(145deg,rgba(124,58,237,0.12),rgba(2,6,23,0.42))]"
        >
          <div className="flex items-center gap-3 border-b border-violet-100 pb-4 dark:border-violet-400/15">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
            </span>
            <h4 className="font-heading text-base font-semibold text-foreground">
              {t("Delivery time")}
            </h4>
          </div>

          <Field label="Turnaround">
            <Select
              value={
                form.showsEstimatedTurnaround ? "estimated" : "not_specified"
              }
              onValueChange={updateTurnaroundVisibility}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_specified">
                  {t("Not specified")}
                </SelectItem>
                <SelectItem value="estimated">
                  {t("Show approximate delivery time")}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {form.showsEstimatedTurnaround ? (
            <div
              data-testid="service-offer-turnaround-fields"
              className="grid gap-4 rounded-xl border border-violet-100/80 bg-white/72 p-4 shadow-inner dark:border-violet-400/12 dark:bg-slate-950/28 sm:grid-cols-[minmax(0,1fr)_9rem]"
            >
              <Field label="Amount">
                <Input
                  data-testid="service-offer-turnaround-amount"
                  value={turnaround.amount}
                  onChange={(event) =>
                    updateTurnaround(event.target.value, selectedTurnaroundUnit)
                  }
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="2"
                  required
                />
              </Field>
              <Field label="Unit">
                <Select
                  value={selectedTurnaroundUnit}
                  onValueChange={updateTurnaroundUnit}
                  required
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
              </Field>
            </div>
          ) : null}
        </section>
      </div>
    </Section>
  );
}

export function SupportServiceTransactionWorkbench({
  mode,
  transactionId,
  routeBase = "/god-mode/service-transactions",
  canDelete = true,
  showLockedFields = false,
}: {
  mode: "create" | "edit";
  transactionId?: string;
  routeBase?: string;
  canDelete?: boolean;
  showLockedFields?: boolean;
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
  const [createdOutputFileIds, setCreatedOutputFileIds] = useState<
    Record<string, string>
  >({});
  const [outputUploadError, setOutputUploadError] = useState("");
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [selectedReportCode, setSelectedReportCode] = useState("");
  const [recentlyAddedReportCode, setRecentlyAddedReportCode] = useState("");
  const [rawExportOpen, setRawExportOpen] = useState(false);
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
  const linkedReportsQuery = useQuery({
    queryKey: [TRANSACTION_REPORTS_QUERY_KEY, transactionId],
    queryFn: () =>
      sdkFetch<{ reports: SupportServiceLinkedReportRecord[] }>(
        `/admin/support-services/transactions/${encodeURIComponent(
          transactionId ?? "",
        )}/output-reports`,
      ),
    enabled: isEditing && Boolean(transactionId),
    retry: false,
  });
  const reportCandidatesQuery = useInfiniteQuery({
    queryKey: [
      TRANSACTION_REPORT_CANDIDATES_QUERY_KEY,
      transactionId,
      reportSearch,
    ],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(SERVICE_PAGE_SIZE),
      });
      if (reportSearch) {
        params.set("query", reportSearch);
      }
      if (typeof pageParam === "string" && pageParam) {
        params.set("cursor", pageParam);
      }
      return sdkFetch<SupportServiceLinkedReportsPage>(
        `/admin/support-services/transactions/${encodeURIComponent(
          transactionId ?? "",
        )}/output-reports/candidates?${params.toString()}`,
      );
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: reportPickerOpen && isEditing && Boolean(transactionId),
    retry: false,
  });
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

  useEffect(() => {
    if (!recentlyAddedReportCode) {
      return;
    }
    const timeout = window.setTimeout(
      () => setRecentlyAddedReportCode(""),
      1800,
    );
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedReportCode]);

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
  const linkedReports =
    linkedReportsQuery.data?.reports ??
    form.outputReports.map(({ reportCode }) => ({
      reportCode,
      available: false,
    }));
  const linkedReportCodes = new Set(
    form.outputReports.map(({ reportCode }) => reportCode),
  );
  const reportCandidates =
    reportCandidatesQuery.data?.pages
      .flatMap((page) => page.reports)
      .filter((report) => !linkedReportCodes.has(report.reportCode)) ?? [];
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
        `${routeBase}/${encodeURIComponent(result.transaction.requestId)}`,
      );
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
  });

  const uploadOutputMutation = useMutation({
    mutationFn: async (draft: OutputObjectUploadDraft) => {
      if (!draft.source) {
        throw new Error("Choose an output object source.");
      }

      let source: { downloadUrl: string } | { fileStorageId: string };
      if (draft.source === "downloadUrl") {
        source = { downloadUrl: draft.downloadUrl.trim() };
      } else if (draft.source === "fileStorageId") {
        source = { fileStorageId: draft.fileStorageId.trim() };
      } else {
        let createdFileStorageId = draft.createdFileStorageId.trim();
        if (!createdFileStorageId) {
          const createdFile = await sdkFetch<{
            document: ModerationDocumentRecord;
          }>("/file-storage", {
            method: "POST",
            body: JSON.stringify({
              data: {
                file_name: storedFileNameFromJsonTitle(
                  draft.objectType,
                  draft.role,
                  draft.newFileContent,
                ),
                file_type: draft.objectType,
                file_content: draft.newFileContent,
              },
            }),
          });
          createdFileStorageId = createdFile.document.id;
          setCreatedOutputFileIds((current) => ({
            ...current,
            [draft.role]: createdFileStorageId,
          }));
          setOutputUploadDraft((current) =>
            current &&
            current.role === draft.role &&
            current.source === "newFile"
              ? { ...current, createdFileStorageId }
              : current,
          );
        }
        source = { fileStorageId: createdFileStorageId };
      }

      try {
        return await sdkFetch<{
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
              ...source,
            }),
          },
        );
      } catch (error) {
        if (draft.source === "newFile" && "fileStorageId" in source) {
          const reason =
            error instanceof Error ? error.message : "The object link failed.";
          throw new Error(
            `File ${source.fileStorageId} was created, but the output object could not be linked. Retry to reuse this file without creating a duplicate. ${reason}`,
          );
        }
        throw error;
      }
    },
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
      if (draft.source === "newFile") {
        setCreatedOutputFileIds((current) => {
          const next = { ...current };
          delete next[draft.role];
          return next;
        });
      }
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

  const attachReportMutation = useMutation({
    mutationFn: async (reportCode: string) =>
      sdkFetch<{
        transaction: SupportServiceTransactionRecord;
        report: SupportServiceLinkedReportRecord;
      }>(
        `/admin/support-services/transactions/${encodeURIComponent(
          transactionId ?? "",
        )}/output-reports`,
        {
          method: "POST",
          body: JSON.stringify({ reportCode }),
        },
      ),
    onSuccess: async (result) => {
      setForm(transactionFormFromRecord(result.transaction));
      queryClient.setQueryData(
        [TRANSACTIONS_QUERY_KEY, transactionId],
        { transaction: result.transaction },
      );
      queryClient.setQueryData<{ reports: SupportServiceLinkedReportRecord[] }>(
        [TRANSACTION_REPORTS_QUERY_KEY, transactionId],
        (current) => ({
          reports: [
            ...(current?.reports ?? []).filter(
              (report) => report.reportCode !== result.report.reportCode,
            ),
            result.report,
          ],
        }),
      );
      setRecentlyAddedReportCode(result.report.reportCode);
      setReportPickerOpen(false);
      setSelectedReportCode("");
      setReportSearch("");
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTIONS_QUERY_KEY],
      });
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTION_REPORTS_QUERY_KEY, transactionId],
      });
      setToast({
        id: nextToastId(),
        tone: "success",
        message: t("Report linked to the transaction."),
      });
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
  });

  const removeReportMutation = useMutation({
    mutationFn: async (reportCode: string) =>
      sdkFetch<{
        transaction: SupportServiceTransactionRecord;
        reportCode: string;
      }>(
        `/admin/support-services/transactions/${encodeURIComponent(
          transactionId ?? "",
        )}/output-reports/${encodeURIComponent(reportCode)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (result) => {
      setForm(transactionFormFromRecord(result.transaction));
      queryClient.setQueryData(
        [TRANSACTIONS_QUERY_KEY, transactionId],
        { transaction: result.transaction },
      );
      queryClient.setQueryData<{ reports: SupportServiceLinkedReportRecord[] }>(
        [TRANSACTION_REPORTS_QUERY_KEY, transactionId],
        (current) => ({
          reports: (current?.reports ?? []).filter(
            (report) => report.reportCode !== result.reportCode,
          ),
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTIONS_QUERY_KEY],
      });
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTION_REPORTS_QUERY_KEY, transactionId],
      });
      setToast({
        id: nextToastId(),
        tone: "success",
        message: t("Report removed from the transaction."),
      });
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
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
      sdkFetch<{ deleted: boolean; cleanupWarnings?: string[] }>(
        `/admin/support-services/transactions/${encodeURIComponent(
          transactionId ?? "",
        )}`,
        { method: "DELETE" },
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: [TRANSACTIONS_QUERY_KEY],
      });
      if (result?.cleanupWarnings?.length) {
        window.alert(
          `${t("Service transaction deleted. Secondary cleanup warnings:")} ${result.cleanupWarnings.join(" ")}`,
        );
      }
      router.push(routeBase);
      router.refresh();
    },
    onError: (error) => setToast(mutationErrorToast(error, nextToastId(), t)),
  });
  const transactionCommandPending =
    saveMutation.isPending ||
    uploadOutputMutation.isPending ||
    attachReportMutation.isPending ||
    removeReportMutation.isPending ||
    deliverMutation.isPending ||
    deleteMutation.isPending;

  function handleServiceChange(offerId: string) {
    setForm(transactionFormForOfferId(offerId, liveOffers));
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
      source: createdOutputFileIds[output.role] ? "newFile" : null,
      downloadUrl: "",
      fileStorageId: "",
      newFileContent: "",
      createdFileStorageId: createdOutputFileIds[output.role] ?? "",
    });
  }

  function selectOutputUploadSource(
    source: "downloadUrl" | "fileStorageId" | "newFile",
  ) {
    setOutputUploadError("");
    setOutputUploadDraft((current) =>
      current
        ? {
            ...current,
            source,
            downloadUrl: "",
            fileStorageId: "",
            newFileContent: "",
            createdFileStorageId:
              source === "newFile"
                ? createdOutputFileIds[current.role] ??
                  current.createdFileStorageId
                : current.createdFileStorageId,
          }
        : null,
    );
  }

  function resetOutputUploadSource() {
    setOutputUploadError("");
    setOutputUploadDraft((current) =>
      current
        ? {
            ...current,
            source: null,
            downloadUrl: "",
            fileStorageId: "",
            newFileContent: "",
            createdFileStorageId: "",
          }
        : null,
    );
  }

  function handleOutputUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!outputUploadDraft || !transactionId) {
      return;
    }

    if (!outputUploadDraft.source) {
      setOutputUploadError(t("Choose an output object source."));
      return;
    }

    if (outputUploadDraft.source === "downloadUrl") {
      const downloadUrl = outputUploadDraft.downloadUrl.trim();
      try {
        const parsedUrl = new URL(downloadUrl);
        if (parsedUrl.protocol !== "https:") {
          throw new Error("invalid protocol");
        }
      } catch {
        setOutputUploadError(t("Use a valid HTTPS download URL."));
        return;
      }
    } else if (
      outputUploadDraft.source === "fileStorageId" &&
      !outputUploadDraft.fileStorageId.trim()
    ) {
      setOutputUploadError(t("File ID is required."));
      return;
    } else if (outputUploadDraft.source === "newFile") {
      if (
        !outputUploadDraft.createdFileStorageId.trim() &&
        !outputUploadDraft.newFileContent.trim()
      ) {
        setOutputUploadError(t("File JSON is required."));
        return;
      }
      if (
        !outputUploadDraft.createdFileStorageId.trim() &&
        !validateStoredFileJson(outputUploadDraft.newFileContent)
      ) {
        setOutputUploadError(t("File JSON must be valid JSON."));
        return;
      }
      if (
        !outputUploadDraft.createdFileStorageId.trim() &&
        storedFileContentByteLength(outputUploadDraft.newFileContent) >
          MAX_INLINE_STORED_FILE_BYTES
      ) {
        setOutputUploadError(t("File JSON cannot exceed 900 KiB."));
        return;
      }
    }

    setOutputUploadError("");
    uploadOutputMutation.mutate({
      ...outputUploadDraft,
      downloadUrl: outputUploadDraft.downloadUrl.trim(),
      fileStorageId: outputUploadDraft.fileStorageId.trim(),
      newFileContent: outputUploadDraft.newFileContent,
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
      saveMutation.mutate(
        transactionPayloadFromForm(form, { includeInputs: !isEditing }),
      );
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
          backHref={routeBase}
          backLabel="Back to Service Transactions"
          isSaving={saveMutation.isPending}
          saveDisabled={terminalStatusLocked || transactionCommandPending}
          showSaveAction={false}
          deleteDisabled={transactionCommandPending}
          canDelete={isEditing && canDelete}
          canExportRaw={Boolean(transactionRecord)}
          onExportRaw={() => setRawExportOpen(true)}
          onDelete={() => {
            if (window.confirm(t("Delete this service transaction?"))) {
              deleteMutation.mutate();
            }
          }}
        />
        {(transactionRecord?.complianceWarnings?.length ?? 0) > 0 ? (
          <div
            role="alert"
            className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-amber-950 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="grid gap-2">
                <div>
                  <p className="font-semibold">{t("Transaction requires remediation")}</p>
                  <p className="text-sm opacity-80">
                    {t("This root transaction remains visible in Support Services even when historical data is not fully compliant. Correct editable data where possible. Frozen snapshots stay read-only and do not block unrelated saves.")}
                  </p>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {transactionRecord?.complianceWarnings?.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
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
                    {showLockedFields ? (
                      <span
                        className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-100 bg-violet-50 text-violet-600 dark:border-violet-400/18 dark:bg-violet-500/10 dark:text-violet-200"
                        title={t("Read only")}
                      >
                        <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">{t("Read only")}</span>
                      </span>
                    ) : null}
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
                  showLock={showLockedFields}
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
              <GeneratedValue
                value={form.offerId || "-"}
                showLock={showLockedFields}
              />
            </Field>
            <Field label="Service version">
              <GeneratedValue
                value={String(form.serviceVersion || 1)}
                showLock={showLockedFields}
              />
            </Field>
            <Field label="Provider ID">
              <GeneratedValue
                value={form.providerId || "-"}
                showLock={showLockedFields}
              />
            </Field>
            <Field label="Provider kind">
              <GeneratedValue
                value={t(form.providerKind)}
                showLock={showLockedFields}
              />
            </Field>
            <TransactionRequesterIdentity
              isEditing={isEditing}
              showLockedFields={showLockedFields}
              requestedByUserId={form.requestedByUserId}
              requestedByUserEmail={form.requestedByUserEmail}
              onChange={({ userId, email }) =>
                setForm((current) => ({
                  ...current,
                  requestedByUserId: userId,
                  requestedByUserEmail: email,
                }))
              }
            />
            <Field label="Idempotency key">
              <GeneratedValue
                value={form.idempotencyKey || "-"}
                showLock={showLockedFields}
              />
            </Field>
            <Field label="Client request time">
              <GeneratedValue
                value={form.requestedAtClient || "-"}
                showLock={showLockedFields}
              />
            </Field>
            {isEditing ? (
              <>
                <Field label="Requested at">
                  <GeneratedValue
                    value={form.requestedAt || "-"}
                    showLock={showLockedFields}
                  />
                </Field>
                <Field label="Request revision">
                  <GeneratedValue
                    value={String(form.requestRevision || 1)}
                    showLock={showLockedFields}
                  />
                </Field>
              </>
            ) : null}
            <Field label="Contract source">
              <GeneratedValue
                value={form.contractSource || "-"}
                showLock={showLockedFields}
              />
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
          <ObjectRefTable slots={form.inputs} />
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
        </Section>
        </fieldset>
        <LinkedOutputReportsSection
          reports={linkedReports}
          loading={linkedReportsQuery.isLoading}
          loadError={linkedReportsQuery.error}
          isEditing={isEditing}
          canManage={
            isEditing &&
            !hasUnsavedTransactionChanges &&
            !attachReportMutation.isPending &&
            !removeReportMutation.isPending
          }
          recentlyAddedReportCode={recentlyAddedReportCode}
          removingReportCode={removeReportMutation.variables ?? ""}
          onRetry={() => linkedReportsQuery.refetch()}
          onAdd={() => {
            setSelectedReportCode("");
            setReportSearch("");
            setReportPickerOpen(true);
          }}
          onRemove={(reportCode) => {
            if (window.confirm(t("Remove this report from the transaction?"))) {
              removeReportMutation.mutate(reportCode);
            }
          }}
          hasUnsavedTransactionChanges={hasUnsavedTransactionChanges}
        />
        <fieldset
          className="contents"
          disabled={terminalStatusLocked || transactionCommandPending}
        >
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
                      {expectedOutputObjects.length === 0
                        ? t(
                            "This service does not require output files. Mark it as delivered when the work is complete.",
                          )
                        : t(
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
                </div>
              ) : null}
            </div>
          </div>
        </Section>
        </fieldset>
        <ServiceTransactionActionFooter
          isEditing={isEditing}
          changed={!isEditing || hasUnsavedTransactionChanges}
          terminalStatusLocked={terminalStatusLocked}
          transactionCommandPending={transactionCommandPending}
          savePending={saveMutation.isPending}
          deliverPending={deliverMutation.isPending}
          canMarkDelivered={canMarkDelivered}
          onMarkDelivered={handleMarkDelivered}
        />
      </form>
      <OutputObjectUploadDialog
        draft={outputUploadDraft}
        error={outputUploadError}
        pending={uploadOutputMutation.isPending}
        onDraftChange={setOutputUploadDraft}
        onSourceSelect={selectOutputUploadSource}
        onBack={resetOutputUploadSource}
        onClose={() => {
          if (!uploadOutputMutation.isPending) {
            setOutputUploadDraft(null);
            setOutputUploadError("");
          }
        }}
        onSubmit={handleOutputUpload}
      />
      <LinkedOutputReportPickerDialog
        open={reportPickerOpen}
        reports={reportCandidates}
        linkedReportCodes={linkedReportCodes}
        query={reportSearch}
        selectedReportCode={selectedReportCode}
        loading={reportCandidatesQuery.isLoading}
        fetching={reportCandidatesQuery.isFetching}
        error={reportCandidatesQuery.error}
        hasMore={Boolean(reportCandidatesQuery.hasNextPage)}
        pending={attachReportMutation.isPending}
        onQueryChange={(value) => {
          const normalized = value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 6);
          setReportSearch(normalized);
          setSelectedReportCode("");
        }}
        onSelect={setSelectedReportCode}
        onLoadMore={() => reportCandidatesQuery.fetchNextPage()}
        onRetry={() => reportCandidatesQuery.refetch()}
        onClose={() => {
          if (!attachReportMutation.isPending) {
            setReportPickerOpen(false);
            setSelectedReportCode("");
            setReportSearch("");
          }
        }}
        onSubmit={() => {
          if (selectedReportCode) {
            attachReportMutation.mutate(selectedReportCode);
          }
        }}
      />
      <RawJsonExportDialog
        open={rawExportOpen}
        onOpenChange={setRawExportOpen}
        title="Service transaction raw JSON"
        description="Read-only Firebase record preview."
        fileName={rawJsonFileName(
          "service-transaction",
          transactionRecord?.requestId ?? transactionId,
        )}
        value={transactionRecord}
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
      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        {t("No output files are required for this service.")}
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

function linkedReportFormatLabel(value?: string) {
  switch (value?.toLowerCase()) {
    case "mdm":
      return "MyDNAMap";
    case "ag":
      return "Actyon Genomics";
    case "2pq":
      return "2PQ";
    case "vcf":
      return "VCF";
    case "pdf":
      return "PDF";
    default:
      return value?.toUpperCase() || "—";
  }
}

function LinkedOutputReportsSection({
  reports,
  loading,
  loadError,
  isEditing,
  canManage,
  recentlyAddedReportCode,
  removingReportCode,
  hasUnsavedTransactionChanges,
  onRetry,
  onAdd,
  onRemove,
}: {
  reports: SupportServiceLinkedReportRecord[];
  loading: boolean;
  loadError: Error | null;
  isEditing: boolean;
  canManage: boolean;
  recentlyAddedReportCode: string;
  removingReportCode: string;
  hasUnsavedTransactionChanges: boolean;
  onRetry: () => void;
  onAdd: () => void;
  onRemove: (reportCode: string) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <Section title="Linked output reports">
      <div className="flex flex-col gap-4 rounded-2xl border border-cyan-100 bg-[linear-gradient(135deg,rgba(236,254,255,0.92),rgba(255,255,255,0.86)_52%,rgba(245,243,255,0.88))] p-4 shadow-[0_20px_60px_-48px_rgba(8,145,178,0.5)] dark:border-cyan-400/18 dark:bg-[linear-gradient(135deg,rgba(8,47,73,0.28),rgba(15,23,42,0.62)_52%,rgba(46,16,101,0.24))] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200 bg-white text-cyan-700 shadow-sm dark:border-cyan-400/25 dark:bg-cyan-500/10 dark:text-cyan-100">
            <FileText className="h-5 w-5" />
          </span>
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">
                {t("Supplemental reports")}
              </p>
              <Badge variant="outline" className="border-cyan-200 bg-white/80 text-cyan-800 dark:border-cyan-400/28 dark:bg-cyan-500/10 dark:text-cyan-100">
                {t("Always optional")}
              </Badge>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t(
                "Link ready reports for the requester without changing the frozen offer, promised output files, or transaction status.",
              )}
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={onAdd}
          disabled={!canManage}
          className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 text-white shadow-[0_14px_34px_-20px_rgba(8,145,178,0.9)] hover:from-cyan-500 hover:to-violet-500"
        >
          <Plus className="h-4 w-4" />
          {t("Link report")}
        </Button>
      </div>

      {!isEditing ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {t("Save the transaction before linking reports.")}
        </div>
      ) : hasUnsavedTransactionChanges ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100">
          {t("Save other transaction changes before managing linked reports.")}
        </div>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.max(reports.length, 3) }).map((_, index) => (
            <Skeleton key={index} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-8 text-center text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">
          <CircleAlert className="h-5 w-5" />
          <span>{t("Linked reports could not be resolved.")}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            {t("Retry")}
          </Button>
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-cyan-100 bg-cyan-50/30 px-5 py-10 text-center dark:border-cyan-400/18 dark:bg-cyan-500/5">
          <FileText className="mx-auto h-8 w-8 text-cyan-600/70 dark:text-cyan-200/70" />
          <p className="mt-3 font-medium text-foreground">
            {t("No reports linked")}
          </p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            {t(
              "This is valid: reports are supplemental and are never required to complete the service.",
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => {
            const recentlyAdded =
              report.reportCode === recentlyAddedReportCode;
            const removing = report.reportCode === removingReportCode;
            return (
              <article
                key={report.reportCode}
                aria-label={`${t("Linked report")} · ${report.reportCode}`}
                className={cn(
                  "relative flex min-h-72 flex-col overflow-hidden rounded-2xl border bg-white/86 p-5 shadow-[0_20px_54px_-42px_rgba(8,145,178,0.65)] transition-all duration-500 dark:bg-slate-950/48",
                  report.available
                    ? "border-cyan-200/90 dark:border-cyan-400/24"
                    : "border-rose-200 dark:border-rose-400/25",
                  recentlyAdded &&
                    "animate-in fade-in zoom-in-95 ring-4 ring-emerald-300/35 duration-500",
                )}
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-muted-foreground">
                      {report.fileName || t("Uploaded report")}
                    </p>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-[0.14em] text-foreground">
                      {report.reportCode}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
                      report.available
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100"
                        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100",
                    )}
                  >
                    {recentlyAdded ? (
                      <Check className="h-5 w-5 animate-in zoom-in" />
                    ) : report.available ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <CircleAlert className="h-5 w-5" />
                    )}
                  </span>
                </div>

                {report.available ? (
                  <>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge className="bg-cyan-100 text-cyan-900 hover:bg-cyan-100 dark:bg-cyan-500/16 dark:text-cyan-100">
                        {linkedReportFormatLabel(report.providerFormat)}
                      </Badge>
                      <Badge variant="secondary">
                        {t("Version")} {report.uploadVersionCount ?? "—"}
                      </Badge>
                      <Badge variant="outline">
                        {t("Ready")}
                      </Badge>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-cyan-100 py-4 text-xs dark:border-cyan-400/14">
                      <div>
                        <dt className="text-muted-foreground">{t("Report type")}</dt>
                        <dd className="mt-1 font-medium text-foreground">
                          {linkedReportFormatLabel(report.providerFormat)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("Provider")}</dt>
                        <dd className="mt-1 truncate font-medium text-foreground">
                          {report.providerName || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("Status")}</dt>
                        <dd className="mt-1 font-mono font-medium text-foreground">
                          {report.trackingStatus || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("Owner")}</dt>
                        <dd className="mt-1 truncate font-medium text-foreground">
                          {report.ownerName || report.ownerEmail || report.ownerId || "—"}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm leading-5 text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">
                    {report.error || t("Report metadata is loading.")}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href={`/reports/${encodeURIComponent(report.reportCode)}?from=service-transaction`}>
                      {t("Open report")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(report.reportCode)}
                    disabled={!canManage || removing}
                    className="ml-auto text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-200 dark:hover:bg-rose-500/10"
                  >
                    {removing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {t("Remove")}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function LinkedOutputReportPickerDialog({
  open,
  reports,
  linkedReportCodes,
  query,
  selectedReportCode,
  loading,
  fetching,
  error,
  hasMore,
  pending,
  onQueryChange,
  onSelect,
  onLoadMore,
  onRetry,
  onClose,
  onSubmit,
}: {
  open: boolean;
  reports: SupportServiceLinkedReportRecord[];
  linkedReportCodes: Set<string>;
  query: string;
  selectedReportCode: string;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  hasMore: boolean;
  pending: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (reportCode: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        className="flex max-h-[88vh] flex-col overflow-hidden rounded-[2rem] border border-cyan-100 p-0 shadow-[0_36px_140px_rgba(8,145,178,0.25)] sm:max-w-6xl dark:border-cyan-400/20"
      >
        <DialogHeader className="border-b border-cyan-100 bg-[linear-gradient(120deg,rgba(236,254,255,0.96),rgba(245,243,255,0.94))] px-6 py-5 text-left dark:border-cyan-400/16 dark:bg-[linear-gradient(120deg,rgba(8,47,73,0.34),rgba(46,16,101,0.28))]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 text-white shadow-lg">
              <Search className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="font-heading text-2xl font-semibold">
                {t("Choose an existing report")}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {t(
                  "Search by report code, review its registered metadata, and link exactly one report.",
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-6 py-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("Search by 6-character report code")}
              aria-label={t("Search reports by code")}
              autoFocus
              className="h-12 rounded-xl border-cyan-200 bg-white pl-12 font-mono text-base uppercase tracking-[0.12em] shadow-sm dark:border-cyan-400/22 dark:bg-slate-950/54"
            />
            {fetching && !loading ? (
              <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-600" />
            ) : null}
          </div>

          <div className="min-h-0 overflow-y-auto pr-1">
            {loading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-44 rounded-2xl" />
                ))}
              </div>
            ) : error ? (
              <div className="grid place-items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-12 text-center text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">
                <CircleAlert className="h-7 w-7" />
                <p>{t("Reports could not be loaded.")}</p>
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="h-4 w-4" />
                  {t("Retry")}
                </Button>
              </div>
            ) : reports.length === 0 ? (
              <div className="grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-cyan-100 px-5 py-12 text-center dark:border-cyan-400/18">
                <FileText className="h-8 w-8 text-cyan-600/70" />
                <p className="font-medium text-foreground">
                  {query
                    ? t("No report codes match this search.")
                    : t("No ready reports are available to link.")}
                </p>
                {linkedReportCodes.size > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("Reports already linked are omitted from this picker.")}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {reports.map((report) => {
                  const selected = selectedReportCode === report.reportCode;
                  return (
                    <button
                      key={report.reportCode}
                      type="button"
                      aria-pressed={selected}
                      disabled={!report.available || pending}
                      onClick={() => onSelect(report.reportCode)}
                      className={cn(
                        "group relative min-h-44 overflow-hidden rounded-2xl border p-4 text-left transition-all",
                        selected
                          ? "border-cyan-500 bg-cyan-50/80 shadow-[0_18px_48px_-30px_rgba(8,145,178,0.8)] ring-2 ring-cyan-400/30 dark:bg-cyan-500/10"
                          : "border-border bg-white/76 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg dark:bg-slate-950/42 dark:hover:border-cyan-400/35",
                        !report.available && "cursor-not-allowed border-rose-200 bg-rose-50/50 opacity-75 dark:border-rose-400/22 dark:bg-rose-500/8",
                      )}
                    >
                      <span className={cn("absolute inset-y-0 left-0 w-1", report.available ? "bg-gradient-to-b from-cyan-500 to-violet-600" : "bg-rose-400")} />
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-mono text-xl font-bold tracking-[0.12em] text-foreground">
                            {report.reportCode}
                          </span>
                          <span className="mt-1 block truncate text-sm font-medium text-foreground">
                            {report.fileName || t("Uploaded report")}
                          </span>
                        </span>
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition", selected ? "border-cyan-500 bg-cyan-600 text-white" : "border-border bg-background text-muted-foreground group-hover:border-cyan-300")}>
                          {selected ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        </span>
                      </span>
                      {report.available ? (
                        <span className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <span className="rounded-lg bg-muted/55 px-2.5 py-2">
                            <span className="block text-muted-foreground">{t("Report type")}</span>
                            <span className="mt-0.5 block font-semibold text-foreground">{linkedReportFormatLabel(report.providerFormat)}</span>
                          </span>
                          <span className="rounded-lg bg-muted/55 px-2.5 py-2">
                            <span className="block text-muted-foreground">{t("Version")}</span>
                            <span className="mt-0.5 block font-semibold text-foreground">v{report.uploadVersionCount ?? "—"}</span>
                          </span>
                          <span className="col-span-2 truncate text-muted-foreground">
                            {report.providerName || report.ownerName || report.ownerEmail || t("Registered report")}
                          </span>
                        </span>
                      ) : (
                        <span className="mt-4 block text-sm leading-5 text-rose-700 dark:text-rose-200">
                          {report.error || t("This report is not ready to link.")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {hasMore ? (
              <div className="mt-4 flex justify-center">
                <Button type="button" variant="outline" onClick={onLoadMore} disabled={fetching}>
                  {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {fetching ? t("Loading...") : t("Load more")}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-cyan-100 bg-muted/25 px-6 py-4 dark:border-cyan-400/14">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!selectedReportCode || pending}
            className="bg-gradient-to-r from-cyan-600 to-violet-600 text-white hover:from-cyan-500 hover:to-violet-500"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {pending ? t("Linking report...") : t("Link selected report")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutputObjectUploadDialog({
  draft,
  error,
  pending,
  onDraftChange,
  onSourceSelect,
  onBack,
  onClose,
  onSubmit,
}: {
  draft: OutputObjectUploadDraft | null;
  error: string;
  pending: boolean;
  onDraftChange: (draft: OutputObjectUploadDraft | null) => void;
  onSourceSelect: (
    source: "downloadUrl" | "fileStorageId" | "newFile",
  ) => void;
  onBack: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const source = draft?.source ?? null;
  const [wizardOpen, setWizardOpen] = useState(false);

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
              {source === "downloadUrl"
                ? t(
                    "Provide a public download URL. The SDK validates the downloaded content against the exact PGO type before creating a ready object.",
                  )
                : source === "fileStorageId"
                  ? t(
                      "Provide a File Storage file ID. The SDK loads and validates its content against the exact PGO type before creating a ready object.",
                    )
                  : source === "newFile"
                    ? t(
                        "Write the finalized PGO JSON manually or build it with the file wizard. The file is created first and then linked to a new ready object.",
                      )
                  : t(
                      "Choose where the finalized PGO content should be loaded from.",
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

            {!source ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-24 justify-start gap-3 rounded-2xl border-violet-200 px-5 py-4 text-left text-violet-800 hover:border-violet-400 hover:bg-violet-50 dark:border-violet-400/26 dark:text-violet-100 dark:hover:bg-violet-500/10"
                  onClick={() => onSourceSelect("downloadUrl")}
                  autoFocus
                >
                  <UploadCloud className="h-5 w-5 shrink-0" />
                  <span className="whitespace-normal leading-5">
                    {t("Continue with download URL")}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-24 justify-start gap-3 rounded-2xl border-violet-200 px-5 py-4 text-left text-violet-800 hover:border-violet-400 hover:bg-violet-50 dark:border-violet-400/26 dark:text-violet-100 dark:hover:bg-violet-500/10"
                  onClick={() => onSourceSelect("fileStorageId")}
                >
                  <FileText className="h-5 w-5 shrink-0" />
                  <span className="whitespace-normal leading-5">
                    {t("Continue with file ID")}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-24 justify-start gap-3 rounded-2xl border-violet-200 px-5 py-4 text-left text-violet-800 hover:border-violet-400 hover:bg-violet-50 dark:border-violet-400/26 dark:text-violet-100 dark:hover:bg-violet-500/10"
                  onClick={() => onSourceSelect("newFile")}
                >
                  <Wand2 className="h-5 w-5 shrink-0" />
                  <span className="whitespace-normal leading-5">
                    {t("Continue with new file")}
                  </span>
                </Button>
              </div>
            ) : source === "downloadUrl" ? (
              <>
                <Field label="Download URL">
                  <Input
                    value={draft?.downloadUrl ?? ""}
                    onChange={(event) =>
                      draft &&
                      onDraftChange({
                        ...draft,
                        downloadUrl: event.target.value,
                      })
                    }
                    placeholder="https://example.org/result.pgobject.json"
                    inputMode="url"
                    type="url"
                    disabled={pending}
                    autoFocus
                    required
                  />
                </Field>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-400/24 dark:bg-amber-500/12 dark:text-amber-100">
                  {t(
                    "Only finalized PGO content JSON supplied by an HTTPS download URL is supported. In-progress objects are not accepted.",
                  )}
                </div>
              </>
            ) : source === "fileStorageId" ? (
              <>
                <Field label="File ID">
                  <Input
                    value={draft?.fileStorageId ?? ""}
                    onChange={(event) =>
                      draft &&
                      onDraftChange({
                        ...draft,
                        fileStorageId: event.target.value,
                      })
                    }
                    placeholder="file_storage_document_id"
                    disabled={pending}
                    autoFocus
                    required
                  />
                </Field>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-400/24 dark:bg-amber-500/12 dark:text-amber-100">
                  {t(
                    "Only finalized PGO content JSON from File Storage is supported. In-progress objects are not accepted.",
                  )}
                </div>
              </>
            ) : (
              <>
                <Field label="File JSON">
                  <div className="grid gap-2">
                    <Textarea
                      value={draft?.newFileContent ?? ""}
                      onChange={(event) =>
                        draft &&
                        onDraftChange({
                          ...draft,
                          newFileContent: event.target.value,
                        })
                      }
                      placeholder="Write JSON manually or use the file wizard."
                      className="min-h-64 font-mono text-xs leading-6"
                      disabled={pending || Boolean(draft?.createdFileStorageId)}
                      autoFocus
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-self-start"
                      onClick={() => setWizardOpen(true)}
                      disabled={pending || Boolean(draft?.createdFileStorageId)}
                    >
                      <Wand2 className="h-4 w-4" />
                      {t("Open file wizard")}
                    </Button>
                  </div>
                </Field>
                {draft?.createdFileStorageId ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950 dark:border-amber-400/28 dark:bg-amber-500/12 dark:text-amber-50">
                    {t(
                      "The stored file was already created. Retrying will reuse it and will not create a duplicate.",
                    )}{" "}
                    <Link
                      href={`/collections/file_storage/${encodeURIComponent(
                        draft.createdFileStorageId,
                      )}`}
                      target="_blank"
                      className="font-mono font-semibold underline"
                    >
                      {draft.createdFileStorageId}
                    </Link>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-400/24 dark:bg-amber-500/12 dark:text-amber-100">
                    {t(
                      "The purple action first creates a validated File Storage record, then creates and links the ready output object.",
                    )}
                  </div>
                )}
                <FileJsonWizard
                  open={wizardOpen}
                  fileType={draft?.objectType ?? ""}
                  initialJson={draft?.newFileContent ?? ""}
                  onOpenChange={setWizardOpen}
                  onSave={(newFileContent) =>
                    draft && onDraftChange({ ...draft, newFileContent })
                  }
                />
              </>
            )}
            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-3 border-violet-100 bg-violet-50/55 px-6 py-5 dark:border-violet-300/14 dark:bg-violet-950/16">
            {source ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                disabled={pending || Boolean(draft?.createdFileStorageId)}
              >
                <ArrowLeft className="h-4 w-4" />
                {t("Back")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              {t("Cancel")}
            </Button>
            {source ? (
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
                {pending
                  ? t("Creating object...")
                  : t("Create and link object")}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ObjectRefTable({
  slots,
}: {
  slots: ObjectRefDraft[];
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [snapshotPreview, setSnapshotPreview] = useState<{
    role: string;
    content: string;
  } | null>(null);

  if (slots.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        {t("No input files are required for this service.")}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {slots.map((slot, index) => {
          const identityCells = [
            { label: t("Object ID"), value: slot.objectId },
            { label: t("Revision"), value: slot.revision },
            { label: t("Object code"), value: slot.objectCode },
            {
              label: t("Uploaded object ID"),
              value: slot.uploadedObjectId,
            },
            { label: t("File storage ID"), value: slot.fileStorageId },
            { label: t("Object owner ID"), value: slot.objectOwnerId },
          ];

          return (
            <article
              key={`${slot.role}-${index}`}
              aria-label={`${t("Input object bindings")} · ${slot.role}`}
              className="overflow-hidden rounded-2xl border border-violet-100/80 bg-white/80 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100/80 bg-violet-50/35 px-4 py-3 dark:border-violet-400/14 dark:bg-violet-500/[0.04]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {slot.role}
                  </span>
                  {slot.required ? (
                    <Badge variant="outline">{t("Required")}</Badge>
                  ) : null}
                </div>
                <Badge variant="secondary">
                  {bindingTypeLabel(slot.objectType)}
                </Badge>
              </header>

              <dl className="grid gap-px bg-violet-100/80 sm:grid-cols-2 xl:grid-cols-3 dark:bg-violet-400/14">
                {identityCells.map((cell) => (
                  <div
                    key={cell.label}
                    className="min-w-0 bg-white/90 px-4 py-3 dark:bg-slate-950/72"
                  >
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {cell.label}
                    </dt>
                    <dd className="mt-1 break-all font-mono text-sm text-foreground">
                      {cell.value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-100/80 px-4 py-3 dark:border-violet-400/14">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("Object snapshot")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "Frozen snapshots are read-only evidence and cannot be edited here.",
                    )}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <span
                    role="button"
                    tabIndex={slot.objectSnapshotText.trim() ? 0 : -1}
                    aria-disabled={!slot.objectSnapshotText.trim()}
                    onClick={() => {
                      if (slot.objectSnapshotText.trim()) {
                        setSnapshotPreview({
                          role: slot.role,
                          content: slot.objectSnapshotText,
                        });
                      }
                    }}
                    onKeyDown={(event) => {
                      if (
                        slot.objectSnapshotText.trim() &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        setSnapshotPreview({
                          role: slot.role,
                          content: slot.objectSnapshotText,
                        });
                      }
                    }}
                  >
                    <FileText className="h-4 w-4" />
                    {slot.objectSnapshotText.trim()
                      ? t("View object snapshot")
                      : t("No snapshot available")}
                  </span>
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      <Dialog
        open={Boolean(snapshotPreview)}
        onOpenChange={(open) => {
          if (!open) {
            setSnapshotPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-5">
            <DialogTitle>{t("Object snapshot preview")}</DialogTitle>
            <DialogDescription>
              {snapshotPreview?.role ?? "-"} · {t("Read only")}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words bg-muted/25 p-6 font-mono text-xs leading-5 text-foreground">
            {snapshotPreview?.content ?? ""}
          </pre>
          <DialogFooter className="border-t border-border/70 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSnapshotPreview(null)}
            >
              {t("Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RawJsonExportDialog({
  open,
  onOpenChange,
  title,
  description,
  fileName,
  value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  fileName: string;
  value: unknown;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const content = useMemo(() => rawJsonContent(value), [value]);
  const lineCount = content.split("\n").length;

  useEffect(() => {
    if (open) {
      setCopyState("idle");
    }
  }, [content, open]);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(content);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  function downloadJson() {
    downloadJsonFile(fileName, content);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b border-violet-100 bg-[linear-gradient(135deg,rgba(250,245,255,0.96),rgba(255,255,255,0.92))] px-6 py-5 dark:border-violet-400/14 dark:bg-[linear-gradient(135deg,rgba(46,30,88,0.36),rgba(15,23,42,0.92))]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle>{t(title)}</DialogTitle>
              <DialogDescription>{t(description)}</DialogDescription>
            </div>
            <Badge
              variant="outline"
              className="border-violet-200 bg-white/82 text-violet-700 dark:border-violet-400/22 dark:bg-violet-500/10 dark:text-violet-100"
            >
              {t("Preview")}
            </Badge>
          </div>
        </DialogHeader>
        <div className="grid gap-4 bg-violet-50/35 px-6 py-4 dark:bg-violet-500/[0.04]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t("Raw JSON")}</Badge>
            <span className="break-all font-mono text-xs text-muted-foreground">
              {fileName}
            </span>
            <span className="rounded-full bg-white/78 px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-sm dark:bg-slate-950/50">
              {lineCount} {t("lines")}
            </span>
          </div>
          {copyState === "copied" ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-400/28 dark:bg-emerald-500/12 dark:text-emerald-100">
              {t("JSON copied.")}
            </div>
          ) : copyState === "error" ? (
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              {t(
                "Clipboard copy failed. You can still select the JSON and copy it manually.",
              )}
            </div>
          ) : null}
        </div>
        <pre className="max-h-[62vh] overflow-auto whitespace-pre-wrap break-words bg-white p-6 font-mono text-xs leading-5 text-foreground dark:bg-slate-950/88">
          {content}
        </pre>
        <DialogFooter className="gap-3 border-t border-violet-100 bg-white/92 px-6 py-4 dark:border-violet-400/14 dark:bg-slate-950/88">
          <Button type="button" variant="outline" onClick={() => void copyJson()}>
            {copyState === "copied" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copyState === "copied" ? t("Copied") : t("Copy JSON")}
          </Button>
          <Button
            type="button"
            className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
            onClick={downloadJson}
          >
            <Download className="h-4 w-4" />
            {t("Download JSON")}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceTransactionActionFooter({
  isEditing,
  changed,
  terminalStatusLocked,
  transactionCommandPending,
  savePending,
  deliverPending,
  canMarkDelivered,
  onMarkDelivered,
}: {
  isEditing: boolean;
  changed: boolean;
  terminalStatusLocked: boolean;
  transactionCommandPending: boolean;
  savePending: boolean;
  deliverPending: boolean;
  canMarkDelivered: boolean;
  onMarkDelivered: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="sticky bottom-0 z-20 border-t border-violet-100/80 bg-white/92 px-5 py-4 shadow-[0_-20px_60px_rgba(109,40,217,0.10)] backdrop-blur dark:border-violet-400/14 dark:bg-slate-950/88">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 text-sm text-muted-foreground">
          {terminalStatusLocked
            ? t("Terminal service transactions cannot be edited.")
            : changed
              ? t("Unsaved changes")
              : t("No unsaved changes")}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={terminalStatusLocked || transactionCommandPending}
            variant={isEditing ? "outline" : "default"}
            className={cn(
              "h-14 min-w-[min(100%,14rem)] justify-center rounded-xl text-base font-semibold",
              isEditing
                ? "border-violet-200/80 bg-white/82 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-950 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50 dark:hover:bg-violet-500/18"
                : "bg-violet-600 text-white shadow-[0_16px_42px_rgba(109,40,217,0.24)] hover:bg-violet-700",
            )}
          >
            {savePending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {savePending ? t("Saving...") : t("Save")}
          </Button>
          {isEditing ? (
            <Button
              type="button"
              size="lg"
              onClick={onMarkDelivered}
              disabled={!canMarkDelivered || transactionCommandPending}
              className="h-14 min-w-[min(100%,18rem)] justify-center rounded-xl bg-violet-600 text-base font-semibold text-white shadow-[0_16px_42px_rgba(109,40,217,0.24)] hover:bg-violet-700"
            >
              {deliverPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              {deliverPending
                ? t("Marking as delivered...")
                : t("Mark as delivered")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WorkbenchTopbar({
  title,
  subtitle = "Pocket Genes service contract",
  appearance = "default",
  backHref,
  backLabel,
  isSaving,
  saveDisabled = false,
  showSaveAction = true,
  deleteDisabled = false,
  canDelete,
  canExportRaw = false,
  onExportRaw,
  onDelete,
  saveLabel = "Save",
}: {
  title: string;
  subtitle?: string;
  appearance?: "default" | "offer-editor";
  backHref: string;
  backLabel: string;
  isSaving: boolean;
  saveDisabled?: boolean;
  showSaveAction?: boolean;
  deleteDisabled?: boolean;
  canDelete: boolean;
  canExportRaw?: boolean;
  onExportRaw?: () => void;
  onDelete: () => void;
  saveLabel?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const isOfferEditor = appearance === "offer-editor";
  const HeaderIcon = isOfferEditor ? Pencil : FileText;

  return (
    <div
      data-testid={
        isOfferEditor ? "publisher-service-offer-editor-header" : undefined
      }
      className={cn(
        "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between",
        isOfferEditor
          ? SUPPORT_SERVICE_EDITOR_HEADER_CLASS
          : SUPPORT_SERVICE_HEADER_CLASS,
      )}
    >
      {isOfferEditor ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-14 -top-24 h-56 w-56 rounded-full bg-fuchsia-300/35 blur-3xl dark:bg-fuchsia-500/16"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 right-32 h-44 w-44 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-400/12"
          />
        </>
      ) : null}
      <div className="relative z-10 flex min-w-0 items-center gap-3">
        <div
          data-testid={
            isOfferEditor
              ? "publisher-service-offer-editor-header-icon"
              : undefined
          }
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center",
            isOfferEditor
              ? "rounded-2xl border border-violet-200 bg-white/82 text-violet-700 shadow-[0_12px_28px_-20px_rgba(109,40,217,0.75)] dark:border-violet-300/24 dark:bg-violet-500/14 dark:text-violet-100"
              : "rounded-2xl border border-violet-200 bg-violet-100 text-violet-700 shadow-inner dark:border-violet-400/20 dark:bg-violet-500/14 dark:text-violet-100",
          )}
        >
          <HeaderIcon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2
            className={cn(
              isOfferEditor
                ? "font-sans text-2xl font-bold tracking-tight text-violet-950 dark:text-violet-50"
                : "font-heading text-xl font-semibold text-foreground",
            )}
          >
            {t(title)}
          </h2>
          <p
            className={cn(
              "text-sm",
              isOfferEditor
                ? "mt-1 font-mono text-xs uppercase tracking-[0.08em] text-violet-700 dark:text-violet-200/72"
                : "text-muted-foreground",
            )}
          >
            {t(subtitle)}
          </p>
        </div>
        <HeaderUnclutterButton
          className={
            isOfferEditor
              ? "text-violet-500 hover:bg-white/65 hover:text-violet-800 dark:text-violet-200/70 dark:hover:bg-white/10 dark:hover:text-white"
              : undefined
          }
        />
      </div>
      <div className="relative z-10 flex flex-wrap items-center gap-2">
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
        {canExportRaw ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExportRaw}
            className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
          >
            <Download className="h-4 w-4" />
            <span>{t("Export raw file")}</span>
          </Button>
        ) : null}
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
        {showSaveAction ? (
          <Button
            type="submit"
            size="sm"
            disabled={isSaving || saveDisabled}
            className={SUPPORT_SERVICE_PRIMARY_BUTTON_CLASS}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{isSaving ? t("Saving...") : t(saveLabel)}</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  hideTitle = false,
  icon: Icon = FileText,
  appearance = "default",
  testId,
}: {
  title: string;
  children: React.ReactNode;
  hideTitle?: boolean;
  icon?: LucideIcon;
  appearance?: "default" | "service-identity";
  testId?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const isServiceIdentity = appearance === "service-identity";

  return (
    <section data-testid={testId} className={SUPPORT_SERVICE_SECTION_CLASS}>
      {hideTitle ? null : (
        <div
          className={cn(
            "flex items-center gap-3 border-b pb-4",
            isServiceIdentity
              ? "border-sky-100 dark:border-sky-400/15"
              : "border-violet-100/80 dark:border-violet-400/14",
          )}
        >
          <span
            data-testid={
              isServiceIdentity
                ? "publisher-service-offer-identity-icon"
                : undefined
            }
            className={cn(
              "flex h-10 w-10 items-center justify-center",
              isServiceIdentity
                ? "rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200"
                : "rounded-2xl border border-violet-100 bg-violet-50 text-violet-700 shadow-inner dark:border-violet-400/18 dark:bg-violet-500/12 dark:text-violet-100",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <h3
            className={cn(
              isServiceIdentity
                ? "font-heading text-lg font-semibold tracking-tight text-sky-950 dark:text-sky-100"
                : "font-heading text-xl font-semibold text-foreground",
            )}
          >
            {t(title)}
          </h3>
        </div>
      )}
      {children}
    </section>
  );
}

function GeneratedValue({
  value,
  showLock = false,
}: {
  value: string;
  showLock?: boolean;
}) {
  const { language } = useAppLanguage();
  const readOnlyLabel = appText(language, "Read only");

  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-violet-100 bg-white/78 px-4 py-2 font-mono text-sm text-muted-foreground shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42">
      <span className="min-w-0 break-all">{value}</span>
      {showLock ? (
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-200"
          title={readOnlyLabel}
        >
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{readOnlyLabel}</span>
        </span>
      ) : null}
    </div>
  );
}

function ServiceOfferTransactionStatsSection({
  offerId,
  activeRequestsHref,
}: {
  offerId: string;
  activeRequestsHref?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [expanded, setExpanded] = useState(false);
  const statsQuery = useQuery({
    queryKey: [OFFERS_QUERY_KEY, offerId, "transaction-stats"],
    queryFn: () =>
      sdkFetch<SupportServiceOfferTransactionStats>(
        `/admin/support-services/offers/${encodeURIComponent(offerId)}/transaction-stats`,
      ),
    enabled: Boolean(offerId) && expanded,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const stats =
    statsQuery.data && Array.isArray(statsQuery.data.versions)
      ? statsQuery.data
      : null;
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language === "es" ? "es-AR" : "en-US"),
    [language],
  );

  if (statsQuery.isLoading || (!stats && !statsQuery.isError)) {
    return (
      <ServiceOfferTransactionStatsModal
        expanded={expanded}
        onExpandedChange={setExpanded}
        activeRequestsHref={activeRequestsHref}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-52 w-full rounded-xl" />
        </div>
      </ServiceOfferTransactionStatsModal>
    );
  }

  if (statsQuery.isError || !stats) {
    return (
      <ServiceOfferTransactionStatsModal
        expanded={expanded}
        onExpandedChange={setExpanded}
        activeRequestsHref={activeRequestsHref}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CircleAlert className="h-4 w-4" />
            <span>{t("Could not load transaction statistics.")}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => statsQuery.refetch()}
            className="border-current/20 bg-white/80 dark:bg-slate-950/50"
          >
            <RefreshCw className="h-4 w-4" />
            {t("Try again")}
          </Button>
        </div>
      </ServiceOfferTransactionStatsModal>
    );
  }

  const finishedTransactions = Math.max(
    0,
    stats.totalTransactions - stats.activeTransactions,
  );
  const historicalVersions = stats.versions
    .filter(
      (version) => version.serviceVersion !== stats.currentServiceVersion,
    )
    .sort((left, right) => right.serviceVersion - left.serviceVersion);
  const colorByHistoricalVersion = new Map(
    [...historicalVersions]
      .sort((left, right) => left.serviceVersion - right.serviceVersion)
      .map((version, index) => [
        version.serviceVersion,
        SERVICE_VERSION_CHART_COLORS[
          index % SERVICE_VERSION_CHART_COLORS.length
        ],
      ]),
  );
  const totalStatusChartData: ServiceTransactionChartDatum[] = [
    {
      name: t("Active transactions"),
      value: stats.activeTransactions,
      fill: "#7c3aed",
    },
    {
      name: t("Finished transactions"),
      value: finishedTransactions,
      fill: "#0891b2",
    },
  ];
  const activeRecencyChartData: ServiceTransactionChartDatum[] = [
    {
      name: t("Current version active"),
      value: stats.currentVersionActiveTransactions,
      fill: CURRENT_SERVICE_VERSION_CHART_COLOR,
    },
    {
      name: t("Older-version active"),
      value: stats.outdatedActiveTransactions,
      fill: "#d97706",
    },
  ];
  const activeByVersionChartData: ServiceTransactionChartDatum[] = [
    {
      name: `v${stats.currentServiceVersion}`,
      value: stats.currentVersionActiveTransactions,
      fill: CURRENT_SERVICE_VERSION_CHART_COLOR,
      badge: t("Current contract"),
    },
    ...historicalVersions.map((version) => ({
      name: `v${version.serviceVersion}`,
      value: version.activeTransactions,
      fill:
        colorByHistoricalVersion.get(version.serviceVersion) ??
        SERVICE_VERSION_CHART_COLORS[0] ??
        "#7c3aed",
    })),
  ];
  const metrics = [
    {
      label: "Active transactions",
      value: stats.activeTransactions,
      className: "text-violet-700 dark:text-violet-200",
      testId: "service-offer-active-transactions",
    },
    {
      label: "Finished transactions",
      value: finishedTransactions,
      className: "text-cyan-700 dark:text-cyan-200",
      testId: "service-offer-finished-transactions",
    },
    {
      label: "Current version active",
      value: stats.currentVersionActiveTransactions,
      className: "text-emerald-700 dark:text-emerald-200",
      testId: "service-offer-current-version-transactions",
    },
    {
      label: "Older-version active",
      value: stats.outdatedActiveTransactions,
      className: "text-amber-700 dark:text-amber-200",
      testId: "service-offer-outdated-transactions",
    },
  ];

  return (
    <ServiceOfferTransactionStatsModal
      expanded={expanded}
      onExpandedChange={setExpanded}
      activeRequestsHref={activeRequestsHref}
    >
      <p className="text-sm leading-6 text-muted-foreground">
        {t(
          "Counts include every transaction linked to this offer. Finished transactions are the total minus the active transactions.",
        )}
      </p>
      <dl className="grid grid-cols-2 border-y border-violet-100/80 sm:grid-cols-4 dark:border-violet-400/16">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={cn(
              "grid min-h-24 content-center gap-1 border-violet-100/80 px-4 py-5 dark:border-violet-400/16",
              index % 2 === 0 && "border-r sm:border-r-0",
              index < 2 && "border-b sm:border-b-0",
              index > 0 && "sm:border-l",
            )}
          >
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(metric.label)}
            </dt>
            <dd
              data-testid={metric.testId}
              className={cn("text-3xl font-bold", metric.className)}
            >
              {numberFormatter.format(metric.value)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
        <ServiceTransactionDonutChart
          title={t("Total transactions by status")}
          data={totalStatusChartData}
          total={stats.totalTransactions}
          centerLabel={t("Total count")}
          emptyLabel={t("No transactions for this offer.")}
          numberFormatter={numberFormatter}
          testId="service-offer-total-status-chart"
        />
        <ServiceTransactionDonutChart
          title={t("Active transactions by version recency")}
          data={activeRecencyChartData}
          total={stats.activeTransactions}
          centerLabel={t("Active count")}
          emptyLabel={t("No active transactions for this offer.")}
          numberFormatter={numberFormatter}
          testId="service-offer-active-recency-chart"
        />
        <ServiceTransactionDonutChart
          title={t("Active transactions by offer version")}
          data={activeByVersionChartData}
          total={stats.activeTransactions}
          centerLabel={t("Active count")}
          emptyLabel={t("No active transactions for this offer.")}
          numberFormatter={numberFormatter}
          testId="service-offer-active-by-version-chart"
        />
      </div>
    </ServiceOfferTransactionStatsModal>
  );
}

type ServiceTransactionChartDatum = {
  name: string;
  value: number;
  fill: string;
  badge?: string;
};

function ServiceTransactionDonutChart({
  title,
  data,
  total,
  centerLabel,
  emptyLabel,
  numberFormatter,
  testId,
}: {
  title: string;
  data: ServiceTransactionChartDatum[];
  total: number;
  centerLabel: string;
  emptyLabel: string;
  numberFormatter: Intl.NumberFormat;
  testId: string;
}) {
  const visibleData = data.filter((item) => item.value > 0);
  const ariaLabel = `${title}: ${data
    .map((item) => `${item.name} ${item.value}`)
    .join(", ")}`;

  return (
    <div
      data-testid={testId}
      className="grid min-w-0 content-start justify-items-center gap-4 border-t border-violet-100/80 pt-5 dark:border-violet-400/16"
    >
      <h4 className="min-h-10 text-center text-sm font-semibold leading-5 text-foreground">
        {title}
      </h4>
      <div
        role="img"
        aria-label={ariaLabel}
        className="relative h-[190px] w-[190px]"
      >
        {visibleData.length > 0 ? (
          <>
            <PieChart width={190} height={190}>
              <Pie
                data={visibleData}
                dataKey="value"
                nameKey="name"
                cx={95}
                cy={95}
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
                stroke="transparent"
                isAnimationActive={false}
              >
                {visibleData.map((item) => (
                  <Cell key={item.name} fill={item.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <span className="text-2xl font-bold text-foreground">
                {numberFormatter.format(total)}
              </span>
              <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {centerLabel}
              </span>
            </div>
          </>
        ) : (
          <div className="grid h-[190px] w-[190px] place-content-center justify-items-center gap-2 rounded-full border border-dashed border-violet-200 text-center text-muted-foreground dark:border-violet-400/25">
            <ChartPie className="h-7 w-7" />
            <span className="max-w-32 text-xs">{emptyLabel}</span>
          </div>
        )}
      </div>
      <div
        data-testid={`${testId}-legend`}
        className="w-full divide-y divide-violet-100/80 border-y border-violet-100/80 dark:divide-violet-400/16 dark:border-violet-400/16"
      >
        {data.map((item) => (
          <div
            key={item.name}
            data-testid={`${testId}-legend-item`}
            data-color={item.fill}
            className="flex min-h-12 items-center justify-between gap-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: item.fill }}
              />
              <span className="min-w-0 text-sm font-medium text-foreground">
                {item.name}
              </span>
              {item.badge ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200"
                >
                  {item.badge}
                </Badge>
              ) : null}
            </div>
            <span className="shrink-0 font-mono text-sm font-semibold text-foreground">
              {numberFormatter.format(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceOfferTransactionStatsModal({
  expanded,
  onExpandedChange,
  activeRequestsHref,
  children,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  activeRequestsHref?: string;
  children: React.ReactNode;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <>
      <section
        data-testid="service-offer-transaction-stats"
        className={SUPPORT_SERVICE_SECTION_CLASS}
      >
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t("Number of active requests")}
          onClick={() => onExpandedChange(true)}
          className="flex w-full items-center justify-between gap-4 border-b border-violet-100/80 pb-4 text-left transition-colors hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-4 dark:border-violet-400/14 dark:hover:text-cyan-200"
        >
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700 shadow-inner dark:border-cyan-400/18 dark:bg-cyan-500/10 dark:text-cyan-100">
              <ChartPie className="h-4 w-4" />
            </span>
            <span className="font-heading text-xl font-semibold text-foreground">
              {t("Number of active requests")}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-cyan-700 dark:text-cyan-200">
            <span className="hidden sm:inline">{t("Open full statistics")}</span>
            <Maximize2 className="h-4 w-4" />
          </span>
        </button>
        {activeRequestsHref ? (
          <Link
            href={activeRequestsHref}
            data-testid="service-offer-active-requests-link"
            className="mt-4 flex w-full items-center justify-between gap-4 rounded-xl border border-violet-200/80 bg-white/78 px-4 py-3 text-left text-violet-900 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-4 dark:border-violet-400/18 dark:bg-slate-950/42 dark:text-violet-50 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-500/10"
          >
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700 shadow-inner dark:border-cyan-400/18 dark:bg-cyan-500/10 dark:text-cyan-100">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="font-heading text-lg font-semibold">
                {t("View active requests")}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-200" />
          </Link>
        ) : null}
      </section>

      <Dialog open={expanded} onOpenChange={onExpandedChange}>
        <DialogContent className="flex max-h-[92vh] w-[min(calc(100vw-2rem),90rem)] max-w-none flex-col overflow-hidden rounded-2xl border border-cyan-100 bg-white p-0 shadow-[0_34px_120px_rgba(8,145,178,0.2)] sm:max-w-none dark:border-cyan-300/20 dark:bg-slate-950">
          <DialogHeader className="shrink-0 border-b border-cyan-100 px-5 py-5 text-left sm:px-7 dark:border-cyan-400/16">
            <div className="flex items-start gap-3 pr-8">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-400/18 dark:bg-cyan-500/10 dark:text-cyan-100">
                <ChartPie className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="font-heading text-2xl font-semibold">
                  {t("Number of active requests")}
                </DialogTitle>
                <DialogDescription className="mt-1 leading-6">
                  {t(
                    "Detailed transaction status and offer-version distribution.",
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div
            data-testid="service-offer-transaction-stats-scroll"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7 sm:py-7"
          >
            <div className="grid gap-7">{children}</div>
          </div>
          <DialogFooter className="shrink-0 border-t border-cyan-100 px-5 py-4 sm:px-7 dark:border-cyan-400/16">
            <Button
              type="button"
              variant="outline"
              onClick={() => onExpandedChange(false)}
              className={SUPPORT_SERVICE_SOFT_BUTTON_CLASS}
            >
              {t("Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ServiceIdGeneratedValue({
  serviceId,
  status,
  canRegenerate,
  onRegenerate,
}: {
  serviceId: string;
  status: ServiceIdValidationStatus;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const statusContent = {
    idle: {
      icon: CircleAlert,
      label: t("Choose a provider to generate a service ID."),
      className:
        "border-violet-100 bg-white/78 text-muted-foreground dark:border-violet-400/16 dark:bg-slate-950/42",
    },
    checking: {
      icon: Loader2,
      label: t("Generating and checking service ID..."),
      className:
        "border-violet-200 bg-violet-50/70 text-violet-700 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-100",
    },
    available: {
      icon: CheckCircle2,
      label: t("Service ID is available."),
      className:
        "border-emerald-200 bg-emerald-50/75 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200",
    },
    conflict: {
      icon: XCircle,
      label: t("Service ID already exists."),
      className:
        "border-rose-200 bg-rose-50/75 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200",
    },
    error: {
      icon: XCircle,
      label: t("Service ID could not be validated."),
      className:
        "border-rose-200 bg-rose-50/75 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200",
    },
    locked: {
      icon: CheckCircle2,
      label: t("Service ID is fixed for this existing offer."),
      className:
        "border-emerald-200 bg-emerald-50/75 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200",
    },
  } satisfies Record<
    ServiceIdValidationStatus,
    {
      icon: typeof CircleAlert;
      label: string;
      className: string;
    }
  >;
  const currentStatus = statusContent[status];
  const StatusIcon = currentStatus.icon;
  const showRegenerate =
    canRegenerate && (status === "conflict" || status === "error");

  return (
    <div
      data-testid="service-id-generated-value"
      className={cn(
        "flex min-h-16 flex-col gap-3 rounded-xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        currentStatus.className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <StatusIcon
          className={cn(
            "h-5 w-5 shrink-0",
            status === "checking" && "animate-spin",
          )}
        />
        <div className="min-w-0">
          <div className="break-all font-mono text-sm font-semibold text-foreground">
            {serviceId || "pgs_"}
          </div>
          <div
            data-testid="service-id-validation-status"
            aria-live="polite"
            className="mt-1 text-xs font-medium"
          >
            {currentStatus.label}
          </div>
        </div>
      </div>
      {showRegenerate ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          className="shrink-0 gap-2 border-current/20 bg-white/80 dark:bg-slate-950/50"
        >
          <RefreshCw className="h-4 w-4" />
          {t("Regenerate service ID")}
        </Button>
      ) : null}
    </div>
  );
}

function ServiceVersionGeneratedValue({
  value,
  bumpToken,
}: {
  value: number;
  bumpToken: number;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div
      data-testid="service-version-generated-value"
      className="relative flex min-h-16 items-center gap-3 overflow-hidden rounded-xl border border-violet-100 bg-white/78 px-4 py-3 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42"
    >
      <span className="flex h-10 min-w-14 items-center justify-center rounded-xl bg-violet-100 px-3 font-mono text-lg font-bold text-violet-800 dark:bg-violet-500/16 dark:text-violet-100">
        v{value}
      </span>
      <span className="pr-10 text-xs leading-5 text-muted-foreground">
        {t("The service version increases after every successful save.")}
      </span>
      {bumpToken > 0 ? (
        <span
          key={bumpToken}
          data-testid="service-version-bump"
          aria-live="polite"
          className="pointer-events-none absolute right-4 top-1/2 font-mono text-base font-bold text-emerald-600 dark:text-emerald-300"
          style={{
            animation:
              "support-service-version-bump 1.5s ease-out forwards",
          }}
        >
          +1
        </span>
      ) : null}
    </div>
  );
}

function FormShapeIdGeneratedValue({
  formShapeId,
  status,
}: {
  formShapeId: string;
  status: ServiceIdValidationStatus;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const statusContent = {
    idle: {
      icon: CircleAlert,
      label: t("Choose a provider to generate the request form ID."),
      className:
        "border-violet-100 bg-white/78 text-muted-foreground dark:border-violet-400/16 dark:bg-slate-950/42",
    },
    checking: {
      icon: Loader2,
      label: t("Generating the request form ID from the service ID..."),
      className:
        "border-violet-200 bg-violet-50/70 text-violet-700 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-100",
    },
    available: {
      icon: CheckCircle2,
      label: t("Request form ID is linked to the validated service ID."),
      className:
        "border-emerald-200 bg-emerald-50/75 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200",
    },
    conflict: {
      icon: XCircle,
      label: t("Resolve the service ID conflict to generate this ID."),
      className:
        "border-rose-200 bg-rose-50/75 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200",
    },
    error: {
      icon: XCircle,
      label: t("Request form ID could not be validated."),
      className:
        "border-rose-200 bg-rose-50/75 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200",
    },
    locked: {
      icon: CheckCircle2,
      label: t("Request form ID is fixed for this existing offer."),
      className:
        "border-emerald-200 bg-emerald-50/75 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200",
    },
  } satisfies Record<
    ServiceIdValidationStatus,
    {
      icon: typeof CircleAlert;
      label: string;
      className: string;
    }
  >;
  const currentStatus = statusContent[status];
  const StatusIcon = currentStatus.icon;

  return (
    <div
      data-testid="form-shape-id-generated-value"
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 shadow-sm",
        currentStatus.className,
      )}
    >
      <StatusIcon
        className={cn(
          "h-5 w-5 shrink-0",
          status === "checking" && "animate-spin",
        )}
      />
      <div className="min-w-0">
        <div className="break-all font-mono text-sm font-semibold text-foreground">
          {formShapeId || "pgfs_"}
        </div>
        <div aria-live="polite" className="mt-1 text-xs font-medium">
          {currentStatus.label}
        </div>
      </div>
    </div>
  );
}

function FormShapeVersionGeneratedValue({
  value,
  bumpToken,
}: {
  value: number;
  bumpToken: number;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div
      data-testid="form-shape-version-generated-value"
      className="relative flex min-h-16 items-center gap-3 overflow-hidden rounded-xl border border-violet-100 bg-white/78 px-4 py-3 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/42"
    >
      <span className="flex h-10 min-w-14 items-center justify-center rounded-xl bg-violet-100 px-3 font-mono text-lg font-bold text-violet-800 dark:bg-violet-500/16 dark:text-violet-100">
        v{value}
      </span>
      <span className="pr-10 text-xs leading-5 text-muted-foreground">
        {t("This version increases only when the request form changes.")}
      </span>
      {bumpToken > 0 ? (
        <span
          key={bumpToken}
          data-testid="form-shape-version-bump"
          aria-live="polite"
          className="pointer-events-none absolute right-4 top-1/2 font-mono text-base font-bold text-emerald-600 dark:text-emerald-300"
          style={{
            animation:
              "support-service-version-bump 1.5s ease-out forwards",
          }}
        >
          +1
        </span>
      ) : null}
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

function DisplayField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="grid gap-2 text-sm font-medium text-foreground">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t(label)}
      </div>
      {children}
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
