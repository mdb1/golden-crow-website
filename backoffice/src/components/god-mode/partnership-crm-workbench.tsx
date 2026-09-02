"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
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
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FileUp,
  Filter,
  ListChecks,
  Mail,
  Pause,
  Pencil,
  PlaneTakeoff,
  Plus,
  RefreshCw,
  Search,
  Send,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { PublisherCountryMultiSelect } from "@/components/discover/publisher-country-multi-select";
import {
  CrmCategoryMultiSelect,
  CrmCategorySelect,
  crmCategoryDisplayLabels,
  formatCrmCategory,
} from "@/components/god-mode/crm-category-select";
import { CrmImportRulesDialog } from "@/components/god-mode/crm-import-rules-dialog";
import { CrmTargetSegmentedControl } from "@/components/god-mode/crm-target-segmented-control";
import { sdkFetch } from "@/lib/sdk-client";
import { appText, type AppLanguage } from "@/lib/language";
import {
  formatDiscoverOrganizationCountries,
  getDiscoverOrganizationCountryGroups,
} from "@/lib/discover-organization-fields";
import {
  bestCrmTemplateForTarget,
  CRM_STATUS_OPTIONS,
  DEFAULT_CRM_CATEGORY,
  DEFAULT_CRM_PROFESSIONAL_CATEGORY,
  crmTargetEmail,
  normalizeCrmCategoryKeys,
  normalizeCrmCategory,
  normalizeCrmCountry,
  PARTNERSHIP_CRM_FROM_EMAIL,
  parseCrmCsv,
  renderCrmTemplate,
  statusLabel,
  type CrmDuplicateAction,
  type PartnershipCrmActivitiesPage,
  type PartnershipCrmActivityRecord,
  type PartnershipCrmImportPreview,
  type PartnershipCrmImportPreviewRow,
  type PartnershipCrmImportResult,
  type PartnershipCrmOrganizationInput,
  type PartnershipCrmOrganizationRecord,
  type PartnershipCrmOrganizationsPage,
  type PartnershipCrmProfessionalInput,
  type PartnershipCrmProfessionalRecord,
  type PartnershipCrmProfessionalsPage,
  type PartnershipCrmSentEmailLogRecord,
  type PartnershipCrmSentEmailLogsPage,
  type PartnershipCrmStatus,
  type PartnershipCrmTargetKind,
  type PartnershipCrmTargetRecord,
  type PartnershipCrmTemplateRecord,
  type PartnershipCrmTemplatesPage,
} from "@/lib/partnership-crm";
import { cn } from "@/lib/utils";

const ORGANIZATIONS_QUERY_KEY = "god-mode-partnership-crm-organizations";
const ACTIVITIES_QUERY_KEY = "god-mode-partnership-crm-activities";
const TEMPLATES_QUERY_KEY = "god-mode-partnership-crm-templates";
const SENT_EMAIL_LOG_QUERY_KEY = "god-mode-partnership-crm-sent-email-log";
const EMAIL_CTA_CLASS =
  "h-11 min-w-[11rem] bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.26)] hover:bg-blue-700 focus-visible:ring-blue-500/35 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400";
const CRM_TARGET_PAGE_SIZE = 50;
const CRM_IMPORT_SESSION_STORAGE_KEYS = {
  organizations: "golden-crow:partnership-crm-import-session:v1",
  professionals: "golden-crow:partnership-crm-professional-import-session:v1",
} as const;
const CRM_ALL_COUNTRIES_VALUE = "__all_countries__";
const CRM_NO_COUNTRY_VALUE = "__no_country__";

type CrmTargetInput =
  PartnershipCrmOrganizationInput | PartnershipCrmProfessionalInput;

type EmailState = {
  to: string;
  templateId: string;
  subject: string;
  text: string;
  step: "compose" | "preview";
};

type OrganizationDialogState =
  | { mode: "create"; organization?: undefined }
  | { mode: "edit"; organization: PartnershipCrmTargetRecord }
  | null;

type OrganizationFormState = {
  name: string;
  category: string;
  website: string;
  country: string;
  status: PartnershipCrmStatus;
  title: string;
  primaryAffiliation: string;
  potentialPocketGenesEditorFit: string;
  emailRoute: string;
  linkedInRoute: string;
  researchBasis: string;
  email: string;
  linkedIn: string;
  contactName: string;
  contactEmail: string;
  contactLinkedIn: string;
  lastContactAt: string;
  notes: string;
  is_favorite: boolean;
};

type ListFilters = {
  query: string;
  status: "all" | PartnershipCrmStatus;
  category: string;
  country: string;
  emailState: "all" | "has_email" | "missing_email";
};

type CrmImportSessionStatus =
  "previewing" | "ready" | "importing" | "paused" | "completed";

type CrmImportSessionStage = "preview" | "import" | "complete";
type CrmImportSessionMode = "setup" | "interactive" | "all";

type CrmImportErrorDetail = {
  message: string;
  stage: CrmImportSessionStage;
  mode: CrmImportSessionMode;
  targetKind: PartnershipCrmTargetKind;
  rowIndex: number | null;
  rowNumber: number | null;
  rowId?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  occurredAt: string;
  requestPayload?: unknown;
  sourceRow?: CrmTargetInput | null;
  previewRow?: PartnershipCrmImportPreviewRow | null;
  parseErrors?: Array<{ row: number; message: string }>;
  responseDetails?: string;
};

type CrmImportSession = {
  id: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  status: CrmImportSessionStatus;
  stage: CrmImportSessionStage;
  mode: CrmImportSessionMode;
  chunkSize: number;
  targetKind: PartnershipCrmTargetKind;
  sourceRows: CrmTargetInput[];
  previewRows: PartnershipCrmImportPreviewRow[];
  parseErrors: Array<{ row: number; message: string }>;
  totalRows: number;
  previewedRows: number;
  activeRowIndex: number;
  nextImportIndex: number;
  importSummary: PartnershipCrmImportResult["summary"];
  results: PartnershipCrmImportResult["results"];
  lastError?: string;
  lastErrorDetail?: CrmImportErrorDetail;
};

function crmImportSessionStorageKey(targetKind: PartnershipCrmTargetKind) {
  return CRM_IMPORT_SESSION_STORAGE_KEYS[targetKind];
}

function defaultCategoryForTarget(targetKind: PartnershipCrmTargetKind) {
  return targetKind === "professionals"
    ? DEFAULT_CRM_PROFESSIONAL_CATEGORY
    : DEFAULT_CRM_CATEGORY;
}

function emptyFormState(
  targetKind: PartnershipCrmTargetKind,
): OrganizationFormState {
  return {
    name: "",
    category: defaultCategoryForTarget(targetKind),
    website: "",
    country: "",
    status: "new",
    title: "",
    primaryAffiliation: "",
    potentialPocketGenesEditorFit: "",
    emailRoute: "",
    linkedInRoute: "",
    researchBasis: "",
    email: "",
    linkedIn: "",
    contactName: "",
    contactEmail: "",
    contactLinkedIn: "",
    lastContactAt: "",
    notes: "",
    is_favorite: false,
  };
}

const PIPELINE_STATUSES: PartnershipCrmStatus[] = [
  "new",
  "contacted",
  "replied",
  "meeting",
  "partner",
];
const OUTCOME_STATUSES: PartnershipCrmStatus[] = [
  "no_response",
  "not_interested",
  "not_a_fit",
];

function emptyImportSummary(): PartnershipCrmImportResult["summary"] {
  return {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    invalid: 0,
  };
}

function createImportSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `crm-import-${Date.now()}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown import error.";
}

function errorStringProperty(error: unknown, key: string) {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorNumberProperty(error: unknown, key: string) {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function safeImportLogValue(value: unknown) {
  if (value === undefined) {
    return "<not available>";
  }

  if (typeof value === "string") {
    return value.trim() || "<blank>";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function importRequestPayloadForRow(
  row: PartnershipCrmImportPreviewRow,
  targetKind: PartnershipCrmTargetKind,
) {
  return {
    [targetKind]: [rowForImportDecision(row, targetKind, "import")],
  };
}

function importRequestPayloadForSessionRow(
  session: CrmImportSession,
  rowIndex: number,
) {
  const row = session.previewRows[rowIndex];
  return row ? importRequestPayloadForRow(row, session.targetKind) : undefined;
}

function previewRequestPayloadForRow(
  session: CrmImportSession,
  rowIndex: number,
) {
  return {
    [session.targetKind]: [
      {
        ...session.sourceRows[rowIndex],
        rowId: `row-${rowIndex + 1}`,
      },
    ],
  };
}

function buildCrmImportErrorDetail({
  error,
  session,
  stage,
  rowIndex,
  endpoint,
  requestPayload,
}: {
  error: unknown;
  session: CrmImportSession;
  stage: CrmImportSessionStage;
  rowIndex: number | null;
  endpoint?: string;
  requestPayload?: unknown;
}): CrmImportErrorDetail {
  const previewRow =
    typeof rowIndex === "number" ? session.previewRows[rowIndex] : undefined;
  const sourceRow =
    typeof rowIndex === "number" ? session.sourceRows[rowIndex] : undefined;
  const rowNumber = typeof rowIndex === "number" ? rowIndex + 1 : null;

  return {
    message: errorMessage(error),
    stage,
    mode: session.mode,
    targetKind: session.targetKind,
    rowIndex,
    rowNumber,
    rowId: previewRow?.rowId ?? (rowNumber ? `row-${rowNumber}` : undefined),
    endpoint: errorStringProperty(error, "path") ?? endpoint,
    method: errorStringProperty(error, "method") ?? "POST",
    status: errorNumberProperty(error, "status"),
    occurredAt: new Date().toISOString(),
    requestPayload,
    sourceRow: sourceRow ?? null,
    previewRow: previewRow ?? null,
    parseErrors: session.parseErrors,
    responseDetails: errorStringProperty(error, "details"),
  };
}

function restoreCrmImportErrorDetail(
  value: unknown,
): CrmImportErrorDetail | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<CrmImportErrorDetail>;
  if (typeof candidate.message !== "string" || !candidate.message.trim()) {
    return undefined;
  }

  return {
    message: candidate.message,
    stage:
      candidate.stage === "preview" ||
      candidate.stage === "import" ||
      candidate.stage === "complete"
        ? candidate.stage
        : "import",
    mode:
      candidate.mode === "setup" ||
      candidate.mode === "interactive" ||
      candidate.mode === "all"
        ? candidate.mode
        : "setup",
    targetKind:
      candidate.targetKind === "professionals" ||
      candidate.targetKind === "organizations"
        ? candidate.targetKind
        : "organizations",
    rowIndex:
      typeof candidate.rowIndex === "number" ? candidate.rowIndex : null,
    rowNumber:
      typeof candidate.rowNumber === "number" ? candidate.rowNumber : null,
    rowId: typeof candidate.rowId === "string" ? candidate.rowId : undefined,
    endpoint:
      typeof candidate.endpoint === "string" ? candidate.endpoint : undefined,
    method: typeof candidate.method === "string" ? candidate.method : undefined,
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    occurredAt:
      typeof candidate.occurredAt === "string"
        ? candidate.occurredAt
        : new Date().toISOString(),
    requestPayload: candidate.requestPayload,
    sourceRow: (candidate.sourceRow as CrmTargetInput | null) ?? null,
    previewRow:
      (candidate.previewRow as PartnershipCrmImportPreviewRow | null) ?? null,
    parseErrors: Array.isArray(candidate.parseErrors)
      ? candidate.parseErrors
      : [],
    responseDetails:
      typeof candidate.responseDetails === "string"
        ? candidate.responseDetails
        : undefined,
  };
}

function importErrorRowLabel(session: CrmImportSession, language: AppLanguage) {
  const t = (text: string) => appText(language, text);
  const rowNumber =
    session.lastErrorDetail?.rowNumber ??
    (session.activeRowIndex >= 0 ? session.activeRowIndex + 1 : null);

  return rowNumber
    ? `${t("Row")} ${rowNumber} ${t("of")} ${session.totalRows}`
    : t("Unknown row");
}

function importErrorDescription(
  session: CrmImportSession,
  language: AppLanguage,
) {
  const t = (text: string) => appText(language, text);
  const message = session.lastErrorDetail?.message ?? session.lastError;
  const stage = session.lastErrorDetail?.stage ?? session.stage;
  const stageText =
    stage === "preview" ? t("previewing the row") : t("committing the row");

  return `${importErrorRowLabel(session, language)} ${t(
    "failed while",
  )} ${stageText}. ${t("Backend response")}: ${
    message || t("Unknown import error.")
  }. ${t(
    "Rows before this checkpoint were kept. Fix the CSV row shown in the log and resume from the saved checkpoint.",
  )}`;
}

function buildCrmImportErrorLog(
  session: CrmImportSession,
  language: AppLanguage,
) {
  const t = (text: string) => appText(language, text);
  const detail = session.lastErrorDetail;
  const rowLabel = importErrorRowLabel(session, language);

  return [
    t("Import error log"),
    "",
    `${t("File")}: ${session.fileName}`,
    `${t("CRM target")}: ${t(session.targetKind)}`,
    `${t("Failure point")}: ${rowLabel}`,
    `${t("Stage")}: ${t(detail?.stage ?? session.stage)}`,
    `${t("Mode")}: ${t(detail?.mode ?? session.mode)}`,
    `${t("Endpoint")}: ${detail?.method ?? "POST"} ${
      detail?.endpoint ?? "<not available>"
    }`,
    `${t("HTTP status")}: ${detail?.status ?? "<not available>"}`,
    `${t("Rows previewed")}: ${session.previewedRows} / ${session.totalRows}`,
    `${t("Rows already committed")}: ${session.nextImportIndex} / ${
      session.totalRows
    }`,
    `${t("Error message")}: ${detail?.message ?? session.lastError ?? "<not available>"}`,
    `${t("Occurred at")}: ${
      detail?.occurredAt
        ? formatDateTime(detail.occurredAt, language)
        : "<not available>"
    }`,
    "",
    t("What to fix"),
    importErrorDescription(session, language),
    "",
    t("Parsed CSV row"),
    safeImportLogValue(detail?.sourceRow),
    "",
    t("Preview row"),
    safeImportLogValue(detail?.previewRow),
    "",
    t("Request payload"),
    safeImportLogValue(detail?.requestPayload),
    "",
    t("Backend response details"),
    safeImportLogValue(detail?.responseDetails),
    "",
    t("CSV parse errors"),
    safeImportLogValue(detail?.parseErrors ?? session.parseErrors),
    "",
    t("Import results so far"),
    safeImportLogValue(session.results),
  ].join("\n");
}

function summarizePreviewRows(
  rows: PartnershipCrmImportPreviewRow[],
  total = rows.length,
): PartnershipCrmImportPreview["summary"] {
  return {
    total,
    valid: rows.filter((row) => row.valid).length,
    invalid: rows.filter((row) => !row.valid).length,
    missingEmail: rows.filter((row) => row.missingEmail).length,
    duplicates: rows.filter((row) => row.duplicateCandidates.length > 0).length,
  };
}

function previewFromImportSession(
  session: CrmImportSession | null,
): PartnershipCrmImportPreview | null {
  if (!session || session.previewRows.length === 0) {
    return null;
  }

  return {
    rows: session.previewRows,
    summary: summarizePreviewRows(session.previewRows, session.totalRows),
  };
}

function importSummaryAdd(
  left: PartnershipCrmImportResult["summary"],
  right: PartnershipCrmImportResult["summary"],
): PartnershipCrmImportResult["summary"] {
  return {
    total: left.total + right.total,
    created: left.created + right.created,
    updated: left.updated + right.updated,
    skipped: left.skipped + right.skipped,
    invalid: left.invalid + right.invalid,
  };
}

function withDuplicateDefaults(
  row: PartnershipCrmImportPreviewRow,
): PartnershipCrmImportPreviewRow {
  return {
    ...row,
    duplicateAction: row.duplicateCandidates.length
      ? (row.duplicateAction ?? "skip")
      : (row.duplicateAction ?? "import"),
    duplicateOrganizationId:
      row.duplicateOrganizationId ?? row.duplicateCandidates[0]?.id,
    duplicateProfessionalId:
      row.duplicateProfessionalId ?? row.duplicateCandidates[0]?.id,
  };
}

function importRowTarget(
  row: PartnershipCrmImportPreviewRow,
  targetKind: PartnershipCrmTargetKind,
) {
  return targetKind === "professionals" ? row.professional : row.organization;
}

function rowForImportDecision(
  row: PartnershipCrmImportPreviewRow,
  targetKind: PartnershipCrmTargetKind,
  duplicateAction: CrmDuplicateAction,
) {
  const target = importRowTarget(row, targetKind);
  return {
    ...(target ?? {}),
    rowId: row.rowId,
    duplicateAction,
    duplicateOrganizationId:
      row.duplicateOrganizationId ?? row.duplicateCandidates[0]?.id,
    duplicateProfessionalId:
      row.duplicateProfessionalId ?? row.duplicateCandidates[0]?.id,
  };
}

function importResultForSkippedRow(row: PartnershipCrmImportPreviewRow) {
  return {
    rowId: row.rowId,
    action: "skipped" as const,
    reason: "Skipped during interactive review.",
  };
}

function importResultForInvalidRow(row: PartnershipCrmImportPreviewRow) {
  return {
    rowId: row.rowId,
    action: "invalid" as const,
    reason: row.errors.join(", ") || "Invalid row.",
  };
}

function summaryForLocalImportAction(action: "skipped" | "invalid") {
  if (action === "skipped") {
    return {
      ...emptyImportSummary(),
      total: 1,
      skipped: 1,
    };
  }

  return {
    ...emptyImportSummary(),
    total: 1,
    invalid: 1,
  };
}

function importEndpointForTarget(targetKind: PartnershipCrmTargetKind) {
  return targetKind === "professionals"
    ? "/admin/partnership-crm/professionals/import"
    : "/admin/partnership-crm/import";
}

function importPreviewEndpointForTarget(targetKind: PartnershipCrmTargetKind) {
  return targetKind === "professionals"
    ? "/admin/partnership-crm/professionals/import-preview"
    : "/admin/partnership-crm/import-preview";
}

function importProgressPercent(session: CrmImportSession) {
  if (session.totalRows <= 0) {
    return 0;
  }

  const completedRows =
    session.stage === "preview"
      ? session.previewedRows
      : session.nextImportIndex;

  return Math.min(
    100,
    Math.max(0, Math.round((completedRows / session.totalRows) * 100)),
  );
}

function importStatusLabel(session: CrmImportSession, language: AppLanguage) {
  const t = (text: string) => appText(language, text);
  if (session.status === "previewing") {
    return t("Previewing CSV");
  }
  if (session.status === "ready") {
    if (session.mode === "setup") {
      return t("CSV loaded");
    }
    if (session.mode === "interactive") {
      return t("Waiting for next row");
    }
    return t("Ready to import");
  }
  if (session.status === "importing") {
    return t("Importing CSV");
  }
  if (session.status === "completed") {
    return t("Import completed");
  }
  return session.stage === "preview" ? t("Preview paused") : t("Import paused");
}

function validImportSession(
  value: unknown,
  expectedTargetKind: PartnershipCrmTargetKind,
): CrmImportSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<CrmImportSession>;
  const statusOptions: CrmImportSessionStatus[] = [
    "previewing",
    "ready",
    "importing",
    "paused",
    "completed",
  ];
  const stageOptions: CrmImportSessionStage[] = [
    "preview",
    "import",
    "complete",
  ];
  const modeOptions: CrmImportSessionMode[] = ["setup", "interactive", "all"];
  const restoredStatus = statusOptions.includes(
    candidate.status as CrmImportSessionStatus,
  )
    ? (candidate.status as CrmImportSessionStatus)
    : "paused";
  const restoredStage = stageOptions.includes(
    candidate.stage as CrmImportSessionStage,
  )
    ? (candidate.stage as CrmImportSessionStage)
    : "import";
  const restoredMode = modeOptions.includes(
    candidate.mode as CrmImportSessionMode,
  )
    ? (candidate.mode as CrmImportSessionMode)
    : "setup";
  const status =
    restoredStatus === "previewing" || restoredStatus === "importing"
      ? "paused"
      : restoredStatus;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.fileName !== "string" ||
    !Array.isArray(candidate.sourceRows) ||
    !Array.isArray(candidate.previewRows)
  ) {
    return null;
  }
  const targetKind =
    candidate.targetKind === "professionals" ||
    candidate.targetKind === "organizations"
      ? candidate.targetKind
      : expectedTargetKind;
  if (targetKind !== expectedTargetKind) {
    return null;
  }
  const totalRows =
    typeof candidate.totalRows === "number"
      ? candidate.totalRows
      : candidate.sourceRows.length;
  const previewedRows =
    typeof candidate.previewedRows === "number"
      ? candidate.previewedRows
      : candidate.previewRows.length;
  const nextImportIndex =
    typeof candidate.nextImportIndex === "number"
      ? candidate.nextImportIndex
      : 0;
  const activeRowIndex =
    typeof candidate.activeRowIndex === "number"
      ? candidate.activeRowIndex
      : nextImportIndex;
  const lastError =
    typeof candidate.lastError === "string"
      ? candidate.lastError
      : restoredStatus === "previewing" || restoredStatus === "importing"
        ? "The previous import stopped before finishing."
        : undefined;

  return {
    id: candidate.id,
    fileName: candidate.fileName,
    fileSize: typeof candidate.fileSize === "number" ? candidate.fileSize : 0,
    createdAt:
      typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date().toISOString(),
    status,
    stage: restoredStage,
    mode: restoredMode,
    chunkSize: 1,
    targetKind,
    sourceRows: candidate.sourceRows,
    previewRows: candidate.previewRows.map(withDuplicateDefaults),
    parseErrors: Array.isArray(candidate.parseErrors)
      ? candidate.parseErrors
      : [],
    totalRows,
    previewedRows: Math.min(Math.max(0, previewedRows), totalRows),
    activeRowIndex: Math.min(
      Math.max(0, activeRowIndex),
      Math.max(totalRows - 1, 0),
    ),
    nextImportIndex: Math.min(Math.max(0, nextImportIndex), totalRows),
    importSummary: candidate.importSummary ?? emptyImportSummary(),
    results: Array.isArray(candidate.results) ? candidate.results : [],
    lastError,
    lastErrorDetail: lastError
      ? restoreCrmImportErrorDetail(candidate.lastErrorDetail)
      : undefined,
  };
}

function loadCrmImportSession(targetKind: PartnershipCrmTargetKind) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      crmImportSessionStorageKey(targetKind),
    );
    return raw ? validImportSession(JSON.parse(raw), targetKind) : null;
  } catch {
    return null;
  }
}

function persistCrmImportSession(session: CrmImportSession) {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    window.localStorage.setItem(
      crmImportSessionStorageKey(session.targetKind),
      JSON.stringify(session),
    );
    return true;
  } catch {
    return false;
  }
}

function clearCrmImportSession(targetKind: PartnershipCrmTargetKind) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(crmImportSessionStorageKey(targetKind));
}

function crmTargetBasePath(targetKind: PartnershipCrmTargetKind) {
  return `/admin/partnership-crm/${targetKind}`;
}

function targetPageRows(
  page:
    | PartnershipCrmOrganizationsPage
    | PartnershipCrmProfessionalsPage
    | undefined,
  targetKind: PartnershipCrmTargetKind,
) {
  if (!page) {
    return [];
  }

  return targetKind === "professionals"
    ? (page as PartnershipCrmProfessionalsPage).professionals
    : (page as PartnershipCrmOrganizationsPage).organizations;
}

function buildTargetListPath(
  targetKind: PartnershipCrmTargetKind,
  filters: ListFilters,
  cursor?: string,
) {
  const params = new URLSearchParams({
    limit: String(CRM_TARGET_PAGE_SIZE),
  });
  const category = normalizeCrmCategory(filters.category, targetKind);
  const country = normalizeCrmCountry(filters.country);
  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (category) {
    params.set("category", category);
  }
  if (country) {
    params.set("country", country);
  }
  if (filters.emailState !== "all") {
    params.set("emailState", filters.emailState);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  return `${crmTargetBasePath(targetKind)}?${params.toString()}`;
}

function targetPayload(
  state: OrganizationFormState,
  targetKind: PartnershipCrmTargetKind,
): CrmTargetInput {
  const parsedLastContact = state.lastContactAt
    ? new Date(state.lastContactAt)
    : null;
  const base = {
    name: state.name.trim(),
    category: normalizeCrmCategory(state.category, targetKind),
    website: state.website.trim(),
    country: normalizeCrmCountry(state.country),
    status: state.status,
    is_favorite: state.is_favorite,
    lastContactAt:
      parsedLastContact && !Number.isNaN(parsedLastContact.getTime())
        ? parsedLastContact.toISOString()
        : null,
    notes: state.notes.trim(),
  };

  if (targetKind === "professionals") {
    return {
      ...base,
      title: state.title.trim(),
      primaryAffiliation: state.primaryAffiliation.trim(),
      potentialPocketGenesEditorFit: state.potentialPocketGenesEditorFit.trim(),
      emailRoute: state.emailRoute.trim(),
      linkedInRoute: state.linkedInRoute.trim(),
      researchBasis: state.researchBasis.trim(),
      email: state.email.trim().toLowerCase(),
      linkedIn: state.linkedIn.trim(),
    } satisfies PartnershipCrmProfessionalInput;
  }

  return {
    ...base,
    contactName: state.contactName.trim(),
    contactEmail: state.contactEmail.trim().toLowerCase(),
    contactLinkedIn: state.contactLinkedIn.trim(),
  } satisfies PartnershipCrmOrganizationInput;
}

function localDateTimeValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toFormState(
  organization: PartnershipCrmTargetRecord | undefined,
  targetKind: PartnershipCrmTargetKind,
): OrganizationFormState {
  if (!organization) {
    return emptyFormState(targetKind);
  }

  const base = {
    name: organization.name,
    category: normalizeCrmCategory(organization.category, targetKind),
    website: organization.website,
    country: normalizeCrmCountry(organization.country),
    status: organization.status,
    lastContactAt: localDateTimeValue(organization.lastContactAt),
    notes: organization.notes,
    is_favorite: organization.is_favorite,
  };

  if (targetKind === "professionals") {
    const professional = organization as PartnershipCrmProfessionalRecord;
    return {
      ...base,
      title: professional.title,
      primaryAffiliation: professional.primaryAffiliation,
      potentialPocketGenesEditorFit: professional.potentialPocketGenesEditorFit,
      emailRoute: professional.emailRoute,
      linkedInRoute: professional.linkedInRoute,
      researchBasis: professional.researchBasis,
      email: professional.email,
      linkedIn: professional.linkedIn,
      contactName: "",
      contactEmail: "",
      contactLinkedIn: "",
    };
  }

  const targetOrganization = organization as PartnershipCrmOrganizationRecord;
  return {
    ...base,
    title: "",
    primaryAffiliation: "",
    potentialPocketGenesEditorFit: "",
    emailRoute: "",
    linkedInRoute: "",
    researchBasis: "",
    email: "",
    linkedIn: "",
    contactName: targetOrganization.contactName,
    contactEmail: targetOrganization.contactEmail,
    contactLinkedIn: targetOrganization.contactLinkedIn,
  };
}

function formatDateTime(
  value: string | null | undefined,
  language: AppLanguage,
) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatDate(value: string | null | undefined, language: AppLanguage) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en-US", {
    dateStyle: "medium",
  }).format(parsed);
}

function statusBadgeVariant(status: PartnershipCrmStatus) {
  if (status === "partner") {
    return "success" as const;
  }
  if (status === "replied" || status === "meeting") {
    return "brand" as const;
  }
  if (status === "no_response") {
    return "warning" as const;
  }
  if (status === "not_interested" || status === "not_a_fit") {
    return "secondary" as const;
  }
  return "outline" as const;
}

type PipelineStatusTone = {
  card: string;
  activeCard: string;
  label: string;
  count: string;
};

const PIPELINE_STATUS_TONES: Partial<
  Record<PartnershipCrmStatus, PipelineStatusTone>
> = {
  new: {
    card: "border-sky-200/80 bg-sky-50/75 hover:border-sky-300/80 hover:bg-sky-100/70 dark:border-sky-300/20 dark:bg-sky-400/10 dark:hover:bg-sky-400/15",
    activeCard:
      "border-sky-300 bg-sky-100/90 shadow-sm dark:border-sky-300/45 dark:bg-sky-400/20",
    label: "text-sky-700 dark:text-sky-200/90",
    count: "text-sky-950 dark:text-sky-50",
  },
  contacted: {
    card: "border-orange-200/80 bg-orange-50/75 hover:border-orange-300/80 hover:bg-orange-100/70 dark:border-orange-300/20 dark:bg-orange-400/10 dark:hover:bg-orange-400/15",
    activeCard:
      "border-orange-300 bg-orange-100/90 shadow-sm dark:border-orange-300/45 dark:bg-orange-400/20",
    label: "text-orange-700 dark:text-orange-200/90",
    count: "text-orange-950 dark:text-orange-50",
  },
  replied: {
    card: "border-emerald-200/80 bg-emerald-50/75 hover:border-emerald-300/80 hover:bg-emerald-100/70 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/15",
    activeCard:
      "border-emerald-300 bg-emerald-100/90 shadow-sm dark:border-emerald-300/45 dark:bg-emerald-400/20",
    label: "text-emerald-700 dark:text-emerald-200/90",
    count: "text-emerald-950 dark:text-emerald-50",
  },
  meeting: {
    card: "border-violet-200/80 bg-violet-50/75 hover:border-violet-300/80 hover:bg-violet-100/70 dark:border-violet-300/20 dark:bg-violet-400/10 dark:hover:bg-violet-400/15",
    activeCard:
      "border-violet-300 bg-violet-100/90 shadow-sm dark:border-violet-300/45 dark:bg-violet-400/20",
    label: "text-violet-700 dark:text-violet-200/90",
    count: "text-violet-950 dark:text-violet-50",
  },
  partner: {
    card: "border-teal-200/80 bg-teal-50/75 hover:border-teal-300/80 hover:bg-teal-100/70 dark:border-teal-300/20 dark:bg-teal-400/10 dark:hover:bg-teal-400/15",
    activeCard:
      "border-teal-300 bg-teal-100/90 shadow-sm dark:border-teal-300/45 dark:bg-teal-400/20",
    label: "text-teal-700 dark:text-teal-200/90",
    count: "text-teal-950 dark:text-teal-50",
  },
};

function pipelineStatusTone(status: PartnershipCrmStatus, selected: boolean) {
  const tone = PIPELINE_STATUS_TONES[status];
  if (!tone) {
    return {
      card: selected
        ? "border-foreground/35 bg-muted shadow-sm"
        : "border-border/80 bg-background/60 hover:border-foreground/30 hover:bg-muted/40",
      label: "text-muted-foreground",
      count: "text-foreground",
    };
  }

  return {
    card: cn(tone.card, selected && tone.activeCard),
    label: tone.label,
    count: tone.count,
  };
}

function metricCount(
  targets: PartnershipCrmTargetRecord[],
  status: PartnershipCrmStatus,
) {
  return targets.filter((target) => target.status === status).length;
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {children}
    </p>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function StatusBadge({
  status,
  language,
}: {
  status: PartnershipCrmStatus;
  language: AppLanguage;
}) {
  return (
    <Badge variant={statusBadgeVariant(status)}>
      {appText(language, statusLabel(status))}
    </Badge>
  );
}

function FavoriteCell({
  isFavorite,
  status,
  language,
}: {
  isFavorite: boolean;
  status?: PartnershipCrmStatus;
  language: AppLanguage;
}) {
  const label = appText(language, isFavorite ? "Favorite" : "Not favorite");
  const sentLabel = appText(language, "Email sent");
  const replyLabel = appText(language, "Reply received");

  return (
    <span className="inline-flex min-h-6 items-center justify-center gap-1">
      <span
        role="img"
        aria-label={label}
        title={label}
        className="inline-flex h-5 w-5 items-center justify-center"
      >
        {isFavorite ? (
          <Star
            aria-hidden="true"
            className="h-4 w-4 fill-amber-400 text-amber-500"
          />
        ) : (
          <span aria-hidden="true" className="text-xs text-muted-foreground/50">
            -
          </span>
        )}
      </span>
      {status === "contacted" ? (
        <span
          role="img"
          aria-label={sentLabel}
          title={sentLabel}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-600 dark:text-amber-300"
        >
          <PlaneTakeoff aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
      ) : null}
      {status === "replied" ? (
        <span
          role="img"
          aria-label={replyLabel}
          title={replyLabel}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-emerald-600 dark:text-emerald-300"
        >
          <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </span>
  );
}

function crmDeliveryStatusCellClass(status: PartnershipCrmStatus) {
  if (status === "contacted") {
    return "bg-amber-50/45 dark:bg-amber-400/10";
  }

  if (status === "replied") {
    return "bg-emerald-50/45 dark:bg-emerald-400/10";
  }

  return undefined;
}

function crmTemplateRecommendationRank(
  template: PartnershipCrmTemplateRecord,
  target: PartnershipCrmTargetRecord | null,
  targetKind: PartnershipCrmTargetKind,
) {
  if (!target || template.status !== "active") {
    return 3;
  }

  const templateAudience = template.audience ?? "organizations";
  if (templateAudience !== targetKind) {
    return 2;
  }

  const targetCategories = normalizeCrmCategoryKeys(target.category, targetKind);
  const templateCategories = normalizeCrmCategoryKeys(
    template.category,
    targetKind,
  );

  if (
    targetCategories.length > 0 &&
    templateCategories.some((category) => targetCategories.includes(category))
  ) {
    return 0;
  }

  return 1;
}

function crmTemplateGroupsForTarget(
  templates: readonly PartnershipCrmTemplateRecord[],
  target: PartnershipCrmTargetRecord | null,
  targetKind: PartnershipCrmTargetKind,
) {
  const rankedTemplates = templates
    .map((template, index) => ({
      template,
      index,
      rank: crmTemplateRecommendationRank(template, target, targetKind),
    }))
    .sort((left, right) => {
      const favoriteDelta =
        Number(Boolean(right.template.is_favorite)) -
        Number(Boolean(left.template.is_favorite));
      return (
        left.rank - right.rank || favoriteDelta || left.index - right.index
      );
    });
  const recommendedRank = rankedTemplates.some((entry) => entry.rank === 0)
    ? 0
    : rankedTemplates.some((entry) => entry.rank === 1)
      ? 1
      : null;

  return {
    all: rankedTemplates.map((entry) => entry.template),
    recommended:
      recommendedRank === null
        ? []
        : rankedTemplates
            .filter((entry) => entry.rank === recommendedRank)
            .map((entry) => entry.template),
    other:
      recommendedRank === null
        ? rankedTemplates.map((entry) => entry.template)
        : rankedTemplates
            .filter((entry) => entry.rank !== recommendedRank)
            .map((entry) => entry.template),
  };
}

function favoriteFirstRecords<T extends { is_favorite?: boolean }>(
  records: readonly T[],
) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const favoriteDelta =
        Number(Boolean(right.record.is_favorite)) -
        Number(Boolean(left.record.is_favorite));
      return favoriteDelta || left.index - right.index;
    })
    .map(({ record }) => record);
}

function shouldIgnoreTemplateShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      "input, textarea, [contenteditable='true'], [role='textbox'], [data-slot='select-trigger'], [data-slot='select-content']",
    ),
  );
}

function CategoryBadgeGroup({
  value,
  language,
  targetKind,
}: {
  value: string;
  language: AppLanguage;
  targetKind: PartnershipCrmTargetKind;
}) {
  const labels = crmCategoryDisplayLabels(value, language, targetKind);

  if (!labels.length) {
    return <Badge variant="outline">{appText(language, "No category")}</Badge>;
  }

  return labels.map((label) => (
    <Badge key={label} variant="outline">
      {label}
    </Badge>
  ));
}

function formatCrmCountry(value: string, language: AppLanguage) {
  const countryCodes = normalizeCrmCountry(value);
  return countryCodes
    ? formatDiscoverOrganizationCountries(countryCodes, language)
    : value.trim();
}

function CrmCountrySelect({
  id,
  value,
  onChange,
  language,
  mode,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  language: AppLanguage;
  mode: "filter" | "form";
}) {
  const t = (text: string) => appText(language, text);
  const countryGroups = useMemo(
    () =>
      getDiscoverOrganizationCountryGroups(language).map((group) => ({
        ...group,
        options: group.options.filter((option) => option.code !== "GLOBAL"),
      })),
    [language],
  );
  const emptyValue =
    mode === "filter" ? CRM_ALL_COUNTRIES_VALUE : CRM_NO_COUNTRY_VALUE;
  const selectedCountry = normalizeCrmCountry(value).split(",")[0] ?? "";

  return (
    <Select
      value={selectedCountry || emptyValue}
      onValueChange={(nextValue) =>
        onChange(nextValue === emptyValue ? "" : nextValue)
      }
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={emptyValue}>
          {mode === "filter" ? t("All countries") : t("No country")}
        </SelectItem>
        {countryGroups.map((group) => (
          <SelectGroup key={group.key}>
            <SelectLabel>{t(group.label)}</SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function targetLinkedIn(
  target: PartnershipCrmTargetRecord,
  targetKind: PartnershipCrmTargetKind,
) {
  return targetKind === "professionals"
    ? (target as PartnershipCrmProfessionalRecord).linkedIn
    : (target as PartnershipCrmOrganizationRecord).contactLinkedIn;
}

function targetContactName(
  target: PartnershipCrmTargetRecord,
  targetKind: PartnershipCrmTargetKind,
) {
  return targetKind === "professionals"
    ? target.name
    : (target as PartnershipCrmOrganizationRecord).contactName;
}

function OrganizationFacts({
  organization,
  targetKind,
  language,
}: {
  organization: PartnershipCrmTargetRecord;
  targetKind: PartnershipCrmTargetKind;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const professional = organization as PartnershipCrmProfessionalRecord;
  const directEmail = crmTargetEmail(organization, targetKind);
  const linkedIn = targetLinkedIn(organization, targetKind);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" />
          {targetKind === "professionals"
            ? t("Professional")
            : t("Primary contact")}
        </div>
        <p className="mt-2 font-medium text-foreground">
          {targetContactName(organization, targetKind) || "—"}
        </p>
      </div>
      <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          {t("Mail")}
        </div>
        <p className="mt-2 break-all font-medium text-foreground">
          {directEmail || t("No email")}
        </p>
      </div>
      {targetKind === "professionals" ? (
        <>
          <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {t("Primary affiliation")}
            </div>
            <p className="mt-2 font-medium text-foreground">
              {professional.primaryAffiliation || "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" />
              {t("Role / specialty")}
            </div>
            <p className="mt-2 font-medium text-foreground">
              {professional.title || "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" />
              {t("Potential Pocket Genes editor fit")}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-5 text-foreground">
              {professional.potentialPocketGenesEditorFit || "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {t("Email route")}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-5 text-foreground">
              {professional.emailRoute || "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
              {t("LinkedIn route")}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-5 text-foreground">
              {professional.linkedInRoute || "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              {t("Research basis")}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-5 text-foreground">
              {professional.researchBasis || "—"}
            </p>
          </div>
        </>
      ) : null}
      <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {t("Last Contact")}
        </div>
        <p className="mt-2 font-medium text-foreground">
          {formatDate(organization.lastContactAt, language)}
        </p>
      </div>
      <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          {t("Website")}
        </div>
        {organization.website ? (
          <a
            href={organization.website}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
          >
            <span className="truncate">
              {organization.websiteDomain || organization.website}
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <p className="mt-2 font-medium text-muted-foreground">—</p>
        )}
      </div>
      <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ExternalLink className="h-3.5 w-3.5" />
          {t("LinkedIn")}
        </div>
        {linkedIn ? (
          <a
            href={linkedIn}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
          >
            <span className="truncate">{t("Open profile")}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <p className="mt-2 font-medium text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}

function ActivityCell({
  activity,
  language,
}: {
  activity: PartnershipCrmActivityRecord;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const subject =
    typeof activity.metadata?.subject === "string"
      ? activity.metadata.subject
      : undefined;
  const to =
    typeof activity.metadata?.to === "string"
      ? activity.metadata.to
      : undefined;

  return (
    <article className="flex flex-col gap-3 border-t border-border/80 py-4 first:border-t-0 lg:flex-row">
      <time className="shrink-0 text-xs text-muted-foreground lg:w-40">
        {formatDateTime(activity.occurredAt ?? activity.createdAt, language)}
      </time>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">
            {activity.title || t("Activity")}
          </p>
          <Badge variant="secondary">{t(activity.type)}</Badge>
          {activity.createdByEmail ? (
            <Badge variant="outline">{activity.createdByEmail}</Badge>
          ) : null}
        </div>
        {subject ? (
          <p className="mt-1 truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t("Subject")}:</span>{" "}
            {subject}
          </p>
        ) : null}
        {to ? (
          <p className="mt-1 truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("Recipient")}:
            </span>{" "}
            {to}
          </p>
        ) : null}
        {activity.body ? (
          <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-5 text-foreground/88">
            {activity.body}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function OrganizationDialog({
  state,
  pending,
  targetKind,
  onClose,
  onSubmit,
  language,
}: {
  state: OrganizationDialogState;
  pending: boolean;
  targetKind: PartnershipCrmTargetKind;
  onClose: () => void;
  onSubmit: (
    mode: "create" | "edit",
    organizationId: string | undefined,
    payload: CrmTargetInput,
  ) => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const [form, setForm] = useState<OrganizationFormState>(
    emptyFormState(targetKind),
  );

  useEffect(() => {
    setForm(toFormState(state?.organization, targetKind));
  }, [state, targetKind]);

  function update(patch: Partial<OrganizationFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      return;
    }

    onSubmit(
      state?.mode ?? "create",
      state?.organization?.id,
      targetPayload(form, targetKind),
    );
  }

  const isProfessionals = targetKind === "professionals";

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === "edit"
              ? isProfessionals
                ? t("Edit CRM professional")
                : t("Edit CRM organization")
              : isProfessionals
                ? t("Add CRM professional")
                : t("Add CRM organization")}
          </DialogTitle>
          <DialogDescription>
            {isProfessionals
              ? t("One professional, one direct email, and the next action.")
              : t(
                  "One organization, one primary contact, and the next action.",
                )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="crm-org-name">
                {isProfessionals
                  ? t("Professional name")
                  : t("Organization name")}
              </Label>
              <Input
                id="crm-org-name"
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-org-category">{t("Categories")}</Label>
              <CrmCategoryMultiSelect
                id="crm-org-category"
                value={form.category}
                onChange={(category) => update({ category })}
                language={language}
                audience={targetKind}
              />
            </div>
            {isProfessionals ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-prof-title">
                    {t("Role / specialty")}
                  </Label>
                  <Input
                    id="crm-prof-title"
                    value={form.title}
                    onChange={(event) => update({ title: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-prof-primary-affiliation">
                    {t("Primary affiliation")}
                  </Label>
                  <Input
                    id="crm-prof-primary-affiliation"
                    value={form.primaryAffiliation}
                    onChange={(event) =>
                      update({ primaryAffiliation: event.target.value })
                    }
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="crm-org-website">{t("Website")}</Label>
              <Input
                id="crm-org-website"
                value={form.website}
                onChange={(event) => update({ website: event.target.value })}
                placeholder="https://example.org"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-org-country">{t("Countries")}</Label>
              <PublisherCountryMultiSelect
                id="crm-org-country"
                value={form.country}
                onChange={(country) => update({ country })}
                language={language}
                t={t}
                includeGlobal={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Status")}</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  update({ status: value as PartnershipCrmStatus })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRM_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-is-favorite">{t("Favorite")}</Label>
              <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
                <Checkbox
                  id="crm-is-favorite"
                  checked={form.is_favorite}
                  onCheckedChange={(checked) =>
                    update({ is_favorite: checked === true })
                  }
                />
                <Star
                  aria-hidden="true"
                  className={cn(
                    "h-4 w-4",
                    form.is_favorite
                      ? "fill-amber-400 text-amber-500"
                      : "text-muted-foreground/50",
                  )}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-last-contact">{t("Last Contact")}</Label>
              <Input
                id="crm-last-contact"
                type="datetime-local"
                value={form.lastContactAt}
                onChange={(event) =>
                  update({ lastContactAt: event.target.value })
                }
              />
            </div>
            {isProfessionals ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-prof-email">{t("Direct mail")}</Label>
                  <Input
                    id="crm-prof-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => update({ email: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="crm-prof-linkedin">{t("LinkedIn")}</Label>
                  <Input
                    id="crm-prof-linkedin"
                    value={form.linkedIn}
                    onChange={(event) =>
                      update({ linkedIn: event.target.value })
                    }
                    placeholder="https://linkedin.com/in/contact"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="crm-prof-editor-fit">
                    {t("Potential Pocket Genes editor fit")}
                  </Label>
                  <Textarea
                    id="crm-prof-editor-fit"
                    value={form.potentialPocketGenesEditorFit}
                    onChange={(event) =>
                      update({
                        potentialPocketGenesEditorFit: event.target.value,
                      })
                    }
                    className="min-h-24"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="crm-prof-email-route">
                    {t("Email route")}
                  </Label>
                  <Textarea
                    id="crm-prof-email-route"
                    value={form.emailRoute}
                    onChange={(event) =>
                      update({ emailRoute: event.target.value })
                    }
                    className="min-h-24"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="crm-prof-linkedin-route">
                    {t("LinkedIn route")}
                  </Label>
                  <Textarea
                    id="crm-prof-linkedin-route"
                    value={form.linkedInRoute}
                    onChange={(event) =>
                      update({ linkedInRoute: event.target.value })
                    }
                    className="min-h-24"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="crm-prof-research-basis">
                    {t("Research basis")}
                  </Label>
                  <Textarea
                    id="crm-prof-research-basis"
                    value={form.researchBasis}
                    onChange={(event) =>
                      update({ researchBasis: event.target.value })
                    }
                    className="min-h-24"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-contact-name">{t("Contact")}</Label>
                  <Input
                    id="crm-contact-name"
                    value={form.contactName}
                    onChange={(event) =>
                      update({ contactName: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-contact-email">{t("Email")}</Label>
                  <Input
                    id="crm-contact-email"
                    type="email"
                    value={form.contactEmail}
                    onChange={(event) =>
                      update({ contactEmail: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="crm-contact-linkedin">{t("LinkedIn")}</Label>
                  <Input
                    id="crm-contact-linkedin"
                    value={form.contactLinkedIn}
                    onChange={(event) =>
                      update({ contactLinkedIn: event.target.value })
                    }
                    placeholder="https://linkedin.com/in/contact"
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="crm-notes">{t("Notes")}</Label>
              <Textarea
                id="crm-notes"
                value={form.notes}
                onChange={(event) => update({ notes: event.target.value })}
                className="min-h-28"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending || !form.name.trim()}>
              <CheckCircle2 className="h-4 w-4" />
              {pending ? t("Saving...") : t("Save changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmailComposerDialog({
  organization,
  targetKind,
  open,
  pending,
  templates,
  templatesLoading,
  templatesHasMore,
  templatesFetchingMore,
  onLoadMoreTemplates,
  onClose,
  onSend,
  language,
}: {
  organization: PartnershipCrmTargetRecord | null;
  targetKind: PartnershipCrmTargetKind;
  open: boolean;
  pending: boolean;
  templates: PartnershipCrmTemplateRecord[];
  templatesLoading: boolean;
  templatesHasMore: boolean;
  templatesFetchingMore: boolean;
  onLoadMoreTemplates: () => void;
  onClose: () => void;
  onSend: (state: EmailState) => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const [email, setEmail] = useState<EmailState | null>(null);
  const emailTargetKeyRef = useRef<string | null>(null);
  const templateGroups = useMemo(
    () => crmTemplateGroupsForTarget(templates, organization, targetKind),
    [organization, targetKind, templates],
  );
  const orderedTemplates = templateGroups.all;

  useEffect(() => {
    if (!organization || !open) {
      emailTargetKeyRef.current = null;
      setEmail(null);
      return;
    }

    const targetKey = `${targetKind}:${organization.id}`;
    const previousTargetKey = emailTargetKeyRef.current;
    emailTargetKeyRef.current = targetKey;
    const targetEmail = crmTargetEmail(organization, targetKind);
    const template = bestCrmTemplateForTarget(
      organization,
      orderedTemplates,
      targetKind,
    );
    const rendered = template
      ? renderCrmTemplate(template, organization, targetKind)
      : { subject: "", body: "" };
    setEmail((current) => {
      const hasUserDraft = Boolean(
        current &&
          previousTargetKey === targetKey &&
          (current.templateId ||
            current.subject ||
            current.text ||
            current.to !== targetEmail),
      );

      if (hasUserDraft) {
        return current;
      }

      return {
        to: targetEmail,
        templateId: template?.id ?? "",
        subject: rendered.subject,
        text: rendered.body,
        step: "compose",
      };
    });
  }, [open, orderedTemplates, organization, targetKind]);

  function update(patch: Partial<EmailState>) {
    setEmail((current) => (current ? { ...current, ...patch } : current));
  }

  function applyTemplate(templateId: string) {
    if (!organization) {
      return;
    }

    const template = orderedTemplates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }

    const rendered = renderCrmTemplate(template, organization, targetKind);
    update({
      templateId,
      subject: rendered.subject,
      text: rendered.body,
      step: "compose",
    });
  }

  const canPreview = Boolean(
    email?.to.trim() && email.subject.trim() && email.text.trim(),
  );
  const hasTemplates = orderedTemplates.length > 0;
  const isPreviewStep = email?.step === "preview";
  const selectedTemplateIndex = email?.templateId
    ? orderedTemplates.findIndex((template) => template.id === email.templateId)
    : -1;
  const canChangeTemplate = Boolean(
    email &&
      email.step === "compose" &&
      hasTemplates &&
      !templatesLoading &&
      organization,
  );

  function changeTemplate(direction: "previous" | "next") {
    if (!canChangeTemplate) {
      return;
    }

    const currentIndex =
      selectedTemplateIndex >= 0
        ? selectedTemplateIndex
        : direction === "next"
          ? -1
          : 0;
    const offset = direction === "next" ? 1 : -1;
    const nextIndex =
      (currentIndex + offset + orderedTemplates.length) %
      orderedTemplates.length;
    applyTemplate(orderedTemplates[nextIndex].id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!canChangeTemplate || shouldIgnoreTemplateShortcut(event.target)) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      changeTemplate("next");
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      changeTemplate("previous");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-5xl" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{t("Send CRM email")}</DialogTitle>
          <DialogDescription>
            {t("Individual outreach only. Review the preview before sending.")}
          </DialogDescription>
        </DialogHeader>

        {organization && email ? (
          isPreviewStep ? (
            <EmailPreviewPanel
              email={email}
              language={language}
              locked
              className="w-full"
            />
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-xl border border-border/80 bg-background/70 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t("From")}</Label>
                    <Input value={PARTNERSHIP_CRM_FROM_EMAIL} readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="crm-email-to">{t("Recipient")}</Label>
                    <Input
                      id="crm-email-to"
                      type="email"
                      value={email.to}
                      onChange={(event) =>
                        update({ to: event.target.value, step: "compose" })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,0.62fr)_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <Label>{t("Template")}</Label>
                    <Select
                      value={email.templateId || "no-template"}
                      onValueChange={(value) => {
                        if (value !== "no-template") {
                          applyTemplate(value);
                        }
                      }}
                      disabled={templatesLoading || !hasTemplates}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {!hasTemplates ? (
                          <SelectItem value="no-template">
                            {templatesLoading
                              ? t("Loading templates...")
                              : t("No active templates")}
                          </SelectItem>
                        ) : null}
                        {templateGroups.recommended.length > 0 ? (
                          <SelectGroup>
                            <SelectLabel>
                              {t("Recommended templates")}
                            </SelectLabel>
                            {templateGroups.recommended.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ) : null}
                        {templateGroups.other.length > 0 ? (
                          <SelectGroup>
                            <SelectLabel>{t("Other templates")}</SelectLabel>
                            {templateGroups.other.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ) : null}
                      </SelectContent>
                    </Select>
                    {templatesHasMore ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="w-fit px-2"
                        onClick={onLoadMoreTemplates}
                        disabled={templatesFetchingMore}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                        {templatesFetchingMore
                          ? t("Loading templates...")
                          : t("Load more templates")}
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="crm-email-subject">{t("Subject")}</Label>
                    <Input
                      id="crm-email-subject"
                      value={email.subject}
                      onChange={(event) =>
                        update({
                          subject: event.target.value,
                          step: "compose",
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-email-message">{t("Message")}</Label>
                  <Textarea
                    id="crm-email-message"
                    value={email.text}
                    onChange={(event) =>
                      update({ text: event.target.value, step: "compose" })
                    }
                    className="min-h-80 font-mono text-sm leading-6"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                {hasTemplates ? (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Sending updates last contact and records email activity.",
                    )}
                  </p>
                ) : (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href="/god-mode/plantillas/new">
                      <Plus className="h-3.5 w-3.5" />
                      {t("Alta de plantilla")}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )
        ) : null}

        {email ? (
          <DialogFooter
            className={email.step === "compose" ? "sm:justify-between" : ""}
          >
            {email.step === "compose" ? (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label={t("Previous template")}
                    title={t("Previous template")}
                    onClick={() => changeTemplate("previous")}
                    disabled={!canChangeTemplate}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label={t("Next template")}
                    title={t("Next template")}
                    onClick={() => changeTemplate("next")}
                    disabled={!canChangeTemplate}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => update({ step: "preview" })}
                  disabled={!canPreview}
                  className={EMAIL_CTA_CLASS}
                >
                  <Mail className="h-4 w-4" />
                  {t("Preview email")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="lg"
                onClick={() => onSend(email)}
                disabled={pending || !canPreview}
                className={EMAIL_CTA_CLASS}
              >
                <Send className="h-4 w-4" />
                {pending ? t("Sending...") : t("Send email")}
              </Button>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EmailPreviewPanel({
  email,
  language,
  locked = false,
  className,
}: {
  email: EmailState;
  language: AppLanguage;
  locked?: boolean;
  className?: string;
}) {
  const t = (text: string) => appText(language, text);

  return (
    <aside
      className={cn(
        "rounded-xl border border-border/80 bg-white p-4 text-slate-950 shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:bg-slate-950 dark:text-slate-50",
        locked && "p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {t("Preview")}
          </p>
          <h3
            className={cn(
              "mt-1 truncate font-heading font-semibold",
              locked ? "text-xl" : "text-lg",
            )}
          >
            {email.subject || t("No subject")}
          </h3>
        </div>
        {locked ? (
          <Badge variant="success">{t("Ready to send")}</Badge>
        ) : (
          <Badge variant="outline">{t("Draft")}</Badge>
        )}
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300">
        <p className="truncate">
          <span className="font-semibold text-slate-900 dark:text-slate-50">
            {t("From")}:
          </span>{" "}
          {PARTNERSHIP_CRM_FROM_EMAIL}
        </p>
        <p className="truncate">
          <span className="font-semibold text-slate-900 dark:text-slate-50">
            {t("Recipient")}:
          </span>{" "}
          {email.to || "—"}
        </p>
      </div>
      <div
        className={cn(
          "mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:bg-slate-900 dark:text-slate-100",
          locked && "max-h-[58vh] min-h-96 overflow-y-auto text-base leading-7",
        )}
      >
        {email.text || t("No message yet.")}
      </div>
    </aside>
  );
}

function AllSentEmailsDialog({
  open,
  onOpenChange,
  emails,
  loading,
  error,
  hasNextPage,
  loadingNextPage,
  onLoadMore,
  language,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emails: PartnershipCrmSentEmailLogRecord[];
  loading: boolean;
  error: unknown;
  hasNextPage: boolean;
  loadingNextPage: boolean;
  onLoadMore: () => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("All emails sent")}</DialogTitle>
          <DialogDescription>
            {t("Every email recorded from the CRM send flow.")}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <ErrorBanner>{t("Failed to load sent emails.")}</ErrorBanner>
        ) : null}

        {loading && emails.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : emails.length === 0 ? (
          <EmptyState>{t("No CRM emails sent yet.")}</EmptyState>
        ) : (
          <div className="space-y-3">
            {emails.map((email) => (
              <article
                key={email.id}
                className="rounded-xl border border-border/80 bg-background/70 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {formatDateTime(
                        email.sentAt ?? email.createdAt,
                        language,
                      )}
                    </p>
                    <h3 className="mt-1 truncate font-heading text-base font-semibold text-foreground">
                      {email.subject || t("No subject")}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {email.targetKind === "professionals"
                        ? t("Professionals")
                        : t("Organizations")}
                    </Badge>
                    {email.templateName ? (
                      <Badge variant="secondary">{email.templateName}</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <p className="truncate">
                    <span className="font-semibold text-foreground">
                      {t("Target")}:
                    </span>{" "}
                    {email.targetName || "—"}
                  </p>
                  <p className="truncate">
                    <span className="font-semibold text-foreground">
                      {t("Recipient")}:
                    </span>{" "}
                    {email.to || "—"}
                  </p>
                  <p className="truncate">
                    <span className="font-semibold text-foreground">
                      {t("From")}:
                    </span>{" "}
                    {email.from || PARTNERSHIP_CRM_FROM_EMAIL}
                  </p>
                  <p className="truncate">
                    <span className="font-semibold text-foreground">
                      {t("Sent by")}:
                    </span>{" "}
                    {email.createdByEmail || "—"}
                  </p>
                </div>

                <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/35 p-3 text-sm leading-6 text-foreground/88">
                  {email.body || t("No message yet.")}
                </div>
              </article>
            ))}
          </div>
        )}

        {hasNextPage ? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onLoadMore}
              disabled={loadingNextPage}
            >
              {loadingNextPage ? t("Loading...") : t("Load more")}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ImportProgressPanel({
  session,
  language,
}: {
  session: CrmImportSession;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const percent = importProgressPercent(session);
  const previewedRows = Math.min(session.previewedRows, session.totalRows);
  const committedRows = Math.min(session.nextImportIndex, session.totalRows);

  return (
    <section className="rounded-xl border border-blue-200/80 bg-blue-50/80 p-4 text-blue-950 dark:border-blue-300/20 dark:bg-blue-500/10 dark:text-blue-50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-200">
            {t("CSV import progress")}
          </p>
          <h3 className="mt-1 truncate font-heading text-lg font-semibold">
            {session.fileName}
          </h3>
          <p className="mt-1 text-sm text-blue-900/76 dark:text-blue-100/76">
            {t("Last saved")}: {formatDateTime(session.updatedAt, language)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t(session.targetKind)}</Badge>
          <Badge variant="outline">
            {importStatusLabel(session, language)}
          </Badge>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">
            {session.stage === "preview"
              ? t("Preview checkpoint")
              : t("Import checkpoint")}
          </span>
          <span className="font-semibold">{percent}%</span>
        </div>
        <Progress
          value={percent}
          className="h-2 bg-blue-100 dark:bg-blue-950/70 [&_[data-slot=progress-indicator]]:bg-blue-600 dark:[&_[data-slot=progress-indicator]]:bg-blue-400"
        />
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-lg border border-blue-200/80 bg-white/80 px-3 py-2 dark:border-blue-300/20 dark:bg-slate-950/35">
          <p className="text-xs text-blue-900/70 dark:text-blue-100/70">
            {t("Rows previewed")}
          </p>
          <p className="mt-1 font-semibold">
            {previewedRows} / {session.totalRows}
          </p>
        </div>
        <div className="rounded-lg border border-blue-200/80 bg-white/80 px-3 py-2 dark:border-blue-300/20 dark:bg-slate-950/35">
          <p className="text-xs text-blue-900/70 dark:text-blue-100/70">
            {t("Rows committed")}
          </p>
          <p className="mt-1 font-semibold">
            {committedRows} / {session.totalRows}
          </p>
        </div>
        <div className="rounded-lg border border-blue-200/80 bg-white/80 px-3 py-2 dark:border-blue-300/20 dark:bg-slate-950/35">
          <p className="text-xs text-blue-900/70 dark:text-blue-100/70">
            {t("Batch size")}
          </p>
          <p className="mt-1 font-semibold">{session.chunkSize}</p>
        </div>
        <div className="rounded-lg border border-blue-200/80 bg-white/80 px-3 py-2 dark:border-blue-300/20 dark:bg-slate-950/35">
          <p className="text-xs text-blue-900/70 dark:text-blue-100/70">
            {t("Created / updated")}
          </p>
          <p className="mt-1 font-semibold">
            {session.importSummary.created} / {session.importSummary.updated}
          </p>
        </div>
      </div>

      {session.lastError ? (
        <ImportErrorDiagnostics session={session} language={language} />
      ) : null}
    </section>
  );
}

function ImportErrorDiagnostics({
  session,
  language,
}: {
  session: CrmImportSession;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const [showLog, setShowLog] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const detail = session.lastErrorDetail;
  const logText = useMemo(
    () => buildCrmImportErrorLog(session, language),
    [language, session],
  );

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(logText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-amber-950 shadow-sm dark:border-amber-300/25 dark:bg-amber-400/10 dark:text-amber-100">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-950 dark:bg-amber-300/20 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800/76 dark:text-amber-100/76">
              {t("Import failed")}
            </p>
            <h4 className="mt-1 font-heading text-base font-semibold">
              {importErrorRowLabel(session, language)}
            </h4>
            <p className="mt-2 text-sm leading-6">
              {importErrorDescription(session, language)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowLog((current) => !current)}
            aria-expanded={showLog}
            className="border-amber-300/80 bg-white/80 text-amber-950 hover:bg-amber-100 dark:border-amber-300/30 dark:bg-slate-950/30 dark:text-amber-100 dark:hover:bg-amber-300/10"
          >
            <ListChecks className="h-3.5 w-3.5" />
            {showLog ? t("Hide log") : t("Show log")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyLog}
            className="border-amber-300/80 bg-white/80 text-amber-950 hover:bg-amber-100 dark:border-amber-300/30 dark:bg-slate-950/30 dark:text-amber-100 dark:hover:bg-amber-300/10"
          >
            <Copy className="h-3.5 w-3.5" />
            {copyStatus === "copied"
              ? t("Copied")
              : copyStatus === "error"
                ? t("Copy error")
                : t("Copy log")}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-amber-200/80 bg-white/72 px-3 py-2 dark:border-amber-300/20 dark:bg-slate-950/24">
          <p className="text-xs text-amber-900/70 dark:text-amber-100/70">
            {t("Failure point")}
          </p>
          <p className="mt-1 break-words font-semibold">
            {detail?.method ?? "POST"} {detail?.endpoint ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200/80 bg-white/72 px-3 py-2 dark:border-amber-300/20 dark:bg-slate-950/24">
          <p className="text-xs text-amber-900/70 dark:text-amber-100/70">
            {t("HTTP status")}
          </p>
          <p className="mt-1 font-semibold">
            {detail?.status ?? session.lastError}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200/80 bg-white/72 px-3 py-2 dark:border-amber-300/20 dark:bg-slate-950/24">
          <p className="text-xs text-amber-900/70 dark:text-amber-100/70">
            {t("Rows already committed")}
          </p>
          <p className="mt-1 font-semibold">
            {session.nextImportIndex} / {session.totalRows}
          </p>
        </div>
      </div>

      {showLog ? (
        <pre className="mt-4 max-h-96 overflow-auto rounded-lg border border-amber-200/80 bg-white/85 p-3 text-xs leading-5 text-amber-950 dark:border-amber-300/20 dark:bg-slate-950/45 dark:text-amber-50">
          {logText}
        </pre>
      ) : null}
    </div>
  );
}

function ImportCheckpointBanner({
  session,
  language,
  onOpen,
  onClear,
}: {
  session: CrmImportSession;
  language: AppLanguage;
  onOpen: () => void;
  onClear: () => void;
}) {
  const t = (text: string) => appText(language, text);
  const percent = importProgressPercent(session);
  const checkpointRows =
    session.stage === "preview"
      ? session.previewedRows
      : session.nextImportIndex;
  const checkpointLabel =
    session.stage === "preview" ? t("rows previewed") : t("rows committed");

  return (
    <section className="rounded-xl border border-blue-200/80 bg-blue-50/76 px-4 py-3 text-blue-950 dark:border-blue-300/20 dark:bg-blue-500/10 dark:text-blue-50">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-heading text-base font-semibold">
              {t("Import checkpoint")}
            </p>
            <Badge variant="outline">
              {importStatusLabel(session, language)}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm text-blue-900/76 dark:text-blue-100/76">
            {session.fileName} · {checkpointRows} / {session.totalRows}{" "}
            {checkpointLabel}
          </p>
          <Progress
            value={percent}
            className="mt-3 h-2 bg-blue-100 dark:bg-blue-950/70 [&_[data-slot=progress-indicator]]:bg-blue-600 dark:[&_[data-slot=progress-indicator]]:bg-blue-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onOpen}>
            <FileUp className="h-3.5 w-3.5" />
            {t("Continue ongoing import")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            {t("Discard checkpoint")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ImportReviewFact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-background/70 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 min-h-6 break-words text-sm font-semibold text-foreground">
        {value || "—"}
      </div>
    </div>
  );
}

function resultLabel(
  result: PartnershipCrmImportResult["results"][number] | undefined,
  language: AppLanguage,
) {
  const t = (text: string) => appText(language, text);
  if (!result) {
    return t("Row processed");
  }
  if (result.action === "created") {
    return t("Row imported");
  }
  if (result.action === "updated") {
    return t("Row updated");
  }
  if (result.action === "skipped") {
    return t("Row skipped");
  }
  return t("Row invalid");
}

function ImportRowReviewCard({
  session,
  row,
  targetKind,
  pending,
  automatic,
  onAdd,
  onSkip,
  onNext,
  onImportRemainingInSequence,
  onPauseAutomaticImport,
  language,
}: {
  session: CrmImportSession;
  row: PartnershipCrmImportPreviewRow | null;
  targetKind: PartnershipCrmTargetKind;
  pending: boolean;
  automatic: boolean;
  onAdd: () => void;
  onSkip: () => void;
  onNext: () => void;
  onImportRemainingInSequence: () => void;
  onPauseAutomaticImport: () => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const rowNumber = Math.min(session.activeRowIndex + 1, session.totalRows);
  const processed = session.activeRowIndex < session.nextImportIndex;
  const result = row
    ? session.results.find((entry) => entry.rowId === row.rowId)
    : undefined;
  const target = row ? importRowTarget(row, targetKind) : undefined;
  const organization = target as PartnershipCrmOrganizationInput | undefined;
  const professional = target as PartnershipCrmProfessionalInput | undefined;
  const email =
    targetKind === "professionals"
      ? professional?.email
      : organization?.contactEmail;
  const contact =
    targetKind === "professionals"
      ? professional?.primaryAffiliation
      : organization?.contactName;
  const linkedIn =
    targetKind === "professionals"
      ? professional?.linkedIn
      : organization?.contactLinkedIn;
  const canAdd = Boolean(row?.valid) && !processed && !pending;
  const canSkip = Boolean(row) && !processed && !pending;
  const canImportRemaining = Boolean(row) && !processed && !pending;
  const canMoveNext =
    processed && !pending && session.nextImportIndex < session.totalRows;

  return (
    <section className="rounded-xl border border-border/80 bg-background/70 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("Current row")}
          </p>
          <h3 className="mt-1 font-heading text-xl font-semibold">
            {t("Row")} {rowNumber} {t("of")} {session.totalRows}
          </h3>
        </div>
        {processed ? (
          <Badge variant="success">{resultLabel(result, language)}</Badge>
        ) : row?.valid ? (
          <Badge variant="success">{t("Valid")}</Badge>
        ) : row ? (
          <Badge variant="destructive">{t("Invalid")}</Badge>
        ) : (
          <Badge variant="outline">{t("Previewing CSV")}</Badge>
        )}
      </div>

      {!row ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ImportReviewFact
              label={
                targetKind === "professionals"
                  ? t("Professional")
                  : t("Organization")
              }
              value={target?.name}
            />
            <ImportReviewFact
              label={t("Mail")}
              value={email ? <span className="break-all">{email}</span> : "—"}
            />
            <ImportReviewFact
              label={t("Favorite")}
              value={
                <FavoriteCell
                  isFavorite={Boolean(target?.is_favorite)}
                  language={language}
                />
              }
            />
            <ImportReviewFact
              label={
                targetKind === "professionals"
                  ? t("Primary affiliation")
                  : t("Primary contact")
              }
              value={contact}
            />
            <ImportReviewFact
              label={t("Category")}
              value={formatCrmCategory(
                target?.category ?? "",
                language,
                targetKind,
              )}
            />
            <ImportReviewFact
              label={t("Country")}
              value={formatCrmCountry(target?.country ?? "", language)}
            />
            <ImportReviewFact
              label={t("Status")}
              value={
                target?.status ? (
                  <StatusBadge status={target.status} language={language} />
                ) : null
              }
            />
            <ImportReviewFact
              label={t("Website")}
              value={
                target?.website ? (
                  <span className="break-all">{target.website}</span>
                ) : (
                  "—"
                )
              }
            />
            <ImportReviewFact
              label={t("LinkedIn")}
              value={
                linkedIn ? <span className="break-all">{linkedIn}</span> : "—"
              }
            />
            {targetKind === "professionals" ? (
              <>
                <ImportReviewFact
                  label={t("Potential Pocket Genes editor fit")}
                  value={professional?.potentialPocketGenesEditorFit}
                />
                <ImportReviewFact
                  label={t("Email route")}
                  value={professional?.emailRoute}
                />
                <ImportReviewFact
                  label={t("LinkedIn route")}
                  value={professional?.linkedInRoute}
                />
                <ImportReviewFact
                  label={t("Research basis")}
                  value={professional?.researchBasis}
                />
              </>
            ) : null}
            <ImportReviewFact
              label={t("Last Contact")}
              value={formatDate(target?.lastContactAt, language)}
            />
            <ImportReviewFact label={t("Notes")} value={target?.notes} />
          </div>

          {row.duplicateCandidates.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-300/25 dark:bg-amber-400/10 dark:text-amber-100">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">{t("Possible duplicate")}</Badge>
                <span className="font-medium">
                  {row.duplicateCandidates
                    .map((candidate) => candidate.name)
                    .join(", ")}
                </span>
              </div>
              <p className="mt-2 text-xs opacity-80">
                {t(
                  "Add imports this row anyway. Skip leaves the existing CRM untouched.",
                )}
              </p>
            </div>
          ) : null}

          {!row.valid ? (
            <ErrorBanner>
              {row.errors.map((error) => t(error)).join(", ") ||
                t("This row is invalid and cannot be added.")}
            </ErrorBanner>
          ) : null}
        </>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {processed ? (
          <>
            <p className="text-sm text-muted-foreground sm:mr-auto">
              {result?.reason
                ? t(result.reason)
                : resultLabel(result, language)}
            </p>
            {automatic ? (
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={onPauseAutomaticImport}
                className="w-full border-red-600/35 bg-red-600 px-4 font-semibold text-white hover:border-red-700/45 hover:bg-red-700 focus-visible:ring-red-500/35 dark:border-red-400/35 dark:bg-red-500 dark:text-white dark:hover:bg-red-400 sm:w-auto"
              >
                <Pause className="h-4 w-4" />
                {t("Pause")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onImportRemainingInSequence}
                disabled={!canMoveNext}
                className="w-full border-blue-300 text-blue-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-300/35 dark:text-blue-100 dark:hover:bg-blue-500/10 sm:w-auto"
              >
                <ChevronRight className="h-4 w-4" />
                {t("Import remaining in sequence")}
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              onClick={onNext}
              disabled={!canMoveNext}
              className={EMAIL_CTA_CLASS}
            >
              <ChevronRight className="h-4 w-4" />
              {t("Next row")}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onSkip}
              disabled={!canSkip}
              className="w-full sm:w-auto"
            >
              <X className="h-4 w-4" />
              {t("Skip row")}
            </Button>
            {automatic ? (
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={onPauseAutomaticImport}
                className="w-full border-red-600/35 bg-red-600 px-4 font-semibold text-white hover:border-red-700/45 hover:bg-red-700 focus-visible:ring-red-500/35 dark:border-red-400/35 dark:bg-red-500 dark:text-white dark:hover:bg-red-400 sm:w-auto"
              >
                <Pause className="h-4 w-4" />
                {t("Pause")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onImportRemainingInSequence}
                disabled={!canImportRemaining}
                className="w-full border-blue-300 text-blue-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-300/35 dark:text-blue-100 dark:hover:bg-blue-500/10 sm:w-auto"
              >
                <ChevronRight className="h-4 w-4" />
                {t("Import remaining in sequence")}
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              onClick={onAdd}
              disabled={!canAdd}
              className={cn(EMAIL_CTA_CLASS, "w-full sm:w-auto")}
            >
              <CheckCircle2 className="h-4 w-4" />
              {pending ? t("Importing...") : t("Add")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function ImportDialog({
  open,
  pending,
  targetKind,
  session,
  preview,
  parseErrors,
  interactiveAutoImport,
  onClose,
  onTargetKindChange,
  onFileChange,
  onStartInteractive,
  onInteractiveAdd,
  onInteractiveSkip,
  onInteractiveNext,
  onImportRemainingInSequence,
  onPauseAutomaticImport,
  onImportAll,
  onClearSession,
  onResetSession,
  language,
}: {
  open: boolean;
  pending: boolean;
  targetKind: PartnershipCrmTargetKind;
  session: CrmImportSession | null;
  preview: PartnershipCrmImportPreview | null;
  parseErrors: Array<{ row: number; message: string }>;
  interactiveAutoImport: boolean;
  onClose: () => void;
  onTargetKindChange: (targetKind: PartnershipCrmTargetKind) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartInteractive: () => void;
  onInteractiveAdd: () => void;
  onInteractiveSkip: () => void;
  onInteractiveNext: () => void;
  onImportRemainingInSequence: () => void;
  onPauseAutomaticImport: () => void;
  onImportAll: () => void;
  onClearSession: () => void;
  onResetSession: () => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const completed = session?.status === "completed";
  const currentRow =
    session && preview && session.activeRowIndex < preview.rows.length
      ? (preview.rows[session.activeRowIndex] ?? null)
      : null;
  const sessionCanRun =
    Boolean(session) &&
    session?.status !== "completed" &&
    (session?.totalRows ?? 0) > 0;
  const importAllDisabled =
    pending ||
    !sessionCanRun ||
    session?.status === "completed" ||
    session?.status === "previewing";
  const showInteractiveCard =
    session?.mode === "interactive" && session.status !== "completed";
  const showAllRunning =
    session?.mode === "all" &&
    (pending ||
      session.status === "importing" ||
      session.status === "previewing");
  const showModePicker =
    Boolean(session) &&
    session?.status !== "completed" &&
    !showInteractiveCard &&
    !showAllRunning;
  const showSetupControls = !session;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("Import CRM CSV")}</DialogTitle>
          <DialogDescription>
            {t("Missing contact details do not block import.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {showSetupControls ? (
            <CrmTargetSegmentedControl
              value={targetKind}
              onChange={onTargetKindChange}
              language={language}
            />
          ) : null}

          {session && !completed ? (
            <ImportProgressPanel session={session} language={language} />
          ) : null}

          {showSetupControls ? (
            <div className="rounded-xl border border-border/80 bg-background/70 p-4">
              <Label htmlFor="crm-csv-file">{t("CSV file")}</Label>
              <Input
                id="crm-csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={onFileChange}
                disabled={pending}
                className="mt-2"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {targetKind === "professionals"
                  ? "name,category,title,primary_affiliation,potential_pocket_genes_editor_fit,email_route,linkedin_route,research_basis,website,country,email,linkedin"
                  : "name,category,website,country,contact_name,email,linkedin"}
              </p>
            </div>
          ) : null}

          {!completed && parseErrors.length > 0 ? (
            <div className="grid gap-2">
              {parseErrors.slice(0, 4).map((error) => (
                <ErrorBanner key={`${error.row}-${error.message}`}>
                  {t("Row")} {error.row}: {t(error.message)}
                </ErrorBanner>
              ))}
            </div>
          ) : null}

          {showModePicker ? (
            <section className="rounded-xl border border-border/80 bg-background/70 p-4">
              <div className="grid gap-2">
                <h3 className="font-heading text-lg font-semibold">
                  {t("Choose import mode")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Review each CSV row as a card and decide whether to add or skip it.",
                  )}
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  size="lg"
                  onClick={onStartInteractive}
                  disabled={!sessionCanRun || pending}
                  className={cn(EMAIL_CTA_CLASS, "h-14 w-full")}
                >
                  <ChevronRight className="h-5 w-5" />
                  Start interactive download
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={onImportAll}
                  disabled={importAllDisabled}
                  className={cn(EMAIL_CTA_CLASS, "h-14 w-full")}
                >
                  <FileUp className="h-5 w-5" />
                  {pending ? t("Importing...") : t("Import all")}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t(
                  "Import all previews and commits one row at a time while accepting every valid row.",
                )}
              </p>
            </section>
          ) : null}

          {showAllRunning && session ? (
            <section className="rounded-xl border border-blue-200/80 bg-blue-50/80 p-4 text-blue-950 dark:border-blue-300/20 dark:bg-blue-500/10 dark:text-blue-50">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-200">
                    {t("Automatic import")}
                  </p>
                  <h3 className="mt-1 font-heading text-lg font-semibold">
                    {t("Importing one row at a time")}
                  </h3>
                  <p className="mt-1 text-sm text-blue-900/76 dark:text-blue-100/76">
                    {t(
                      "Every accepted row is saved before the next row starts.",
                    )}
                  </p>
                </div>
                <Badge variant="outline">
                  {Math.min(session.activeRowIndex + 1, session.totalRows)} /{" "}
                  {session.totalRows}
                </Badge>
              </div>
            </section>
          ) : null}

          {showInteractiveCard && session ? (
            <ImportRowReviewCard
              session={session}
              row={currentRow}
              targetKind={targetKind}
              pending={pending}
              automatic={interactiveAutoImport}
              onAdd={onInteractiveAdd}
              onSkip={onInteractiveSkip}
              onNext={onInteractiveNext}
              onImportRemainingInSequence={onImportRemainingInSequence}
              onPauseAutomaticImport={onPauseAutomaticImport}
              language={language}
            />
          ) : null}

          {completed && session ? (
            <section className="overflow-hidden rounded-[1.35rem] border border-emerald-200 bg-[linear-gradient(155deg,rgba(240,253,244,0.98),rgba(236,253,245,0.92)_52%,rgba(209,250,229,0.92))] text-emerald-950 shadow-[0_22px_70px_rgba(16,185,129,0.20)] dark:border-emerald-300/20 dark:bg-[linear-gradient(155deg,rgba(6,78,59,0.86),rgba(6,95,70,0.54)_55%,rgba(16,185,129,0.18))] dark:text-emerald-50 dark:shadow-none">
              <div className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="relative mt-1 flex h-12 w-12 shrink-0 items-center justify-center">
                      <span className="two-pq-success-ring absolute inset-0 rounded-full bg-emerald-400/35" />
                      <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_12px_28px_rgba(5,150,105,0.28)]">
                        <CheckCircle2 className="h-6 w-6" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800/70 dark:text-emerald-100/70">
                        {t("Import completed")}
                      </p>
                      <h3 className="mt-2 font-heading text-2xl font-semibold">
                        {t("CRM import finished")}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-emerald-950/72 dark:text-emerald-50/72">
                        {t(
                          "The imported rows were committed one by one and the CRM list has been refreshed.",
                        )}
                      </p>
                      <p className="mt-2 truncate text-xs text-emerald-950/60 dark:text-emerald-50/60">
                        {session.fileName}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success" className="h-7 px-3 text-sm">
                    {session.totalRows} {t("rows")}
                  </Badge>
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-emerald-100/85 dark:bg-emerald-950/45">
                  <div className="h-full rounded-full bg-emerald-600" />
                </div>

                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("created")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {session.importSummary.created}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("updated")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {session.importSummary.updated}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("skipped")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {session.importSummary.skipped}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("invalid")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {session.importSummary.invalid}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <DialogFooter className={completed ? "gap-3" : undefined}>
          {completed ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onResetSession}
                className="h-11"
              >
                <FileUp className="h-4 w-4" />
                {t("Import another CSV")}
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={onClose}
                className={EMAIL_CTA_CLASS}
              >
                <CheckCircle2 className="h-4 w-4" />
                {t("Done")}
              </Button>
            </>
          ) : (
            <>
              {session ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClearSession}
                  disabled={pending}
                >
                  {t("Discard checkpoint")}
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartnershipCrmWorkbench() {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [targetKind, setTargetKind] =
    useState<PartnershipCrmTargetKind>("organizations");
  const [filters, setFilters] = useState<ListFilters>({
    query: "",
    status: "all",
    category: "",
    country: "",
    emailState: "all",
  });
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [organizationDialog, setOrganizationDialog] =
    useState<OrganizationDialogState>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<PartnershipCrmTargetRecord | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [sentEmailLogOpen, setSentEmailLogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRulesOpen, setImportRulesOpen] = useState(false);
  const [importPreview, setImportPreview] =
    useState<PartnershipCrmImportPreview | null>(null);
  const [parseErrors, setParseErrors] = useState<
    Array<{ row: number; message: string }>
  >([]);
  const [importSession, setImportSession] = useState<CrmImportSession | null>(
    null,
  );
  const [interactiveAutoImport, setInteractiveAutoImport] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const interactiveAutoImportRef = useRef(false);
  const importStorageWarningShownRef = useRef(false);
  const currentCursor = cursorStack[cursorStack.length - 1];

  const organizationQuery = useQuery({
    queryKey: [ORGANIZATIONS_QUERY_KEY, targetKind, filters, currentCursor],
    queryFn: () =>
      sdkFetch<
        PartnershipCrmOrganizationsPage | PartnershipCrmProfessionalsPage
      >(buildTargetListPath(targetKind, filters, currentCursor)),
  });
  const organizations = useMemo(
    () =>
      favoriteFirstRecords<PartnershipCrmTargetRecord>(
        targetPageRows(organizationQuery.data, targetKind),
      ),
    [organizationQuery.data, targetKind],
  );
  const currentListPage = cursorStack.length + 1;
  const hasNextListPage = Boolean(organizationQuery.data?.nextCursor);
  const knownListPages = currentListPage + (hasNextListPage ? 1 : 0);
  const listPageLabel = `${t("Page")} ${currentListPage} ${t(
    "of",
  )} ${knownListPages}${hasNextListPage ? "+" : ""}`;
  const templatesQuery = useInfiniteQuery({
    queryKey: [TEMPLATES_QUERY_KEY, "active"],
    queryFn: ({ pageParam }) => {
      const cursor = typeof pageParam === "string" ? pageParam : "";
      const params = new URLSearchParams({ status: "active", limit: "50" });
      if (cursor) {
        params.set("cursor", cursor);
      }

      return sdkFetch<PartnershipCrmTemplatesPage>(
        `/admin/partnership-crm/templates?${params.toString()}`,
      );
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const emailTemplates = useMemo(() => {
    const templatesById = new Map<string, PartnershipCrmTemplateRecord>();

    for (const page of templatesQuery.data?.pages ?? []) {
      const pageTemplates = Array.isArray(page.templates)
        ? page.templates
        : [];
      for (const template of pageTemplates) {
        if (!templatesById.has(template.id)) {
          templatesById.set(template.id, template);
        }
      }
    }

    return Array.from(templatesById.values());
  }, [templatesQuery.data?.pages]);
  const selectedOrganization = selectedId
    ? (organizations.find((organization) => organization.id === selectedId) ??
      null)
    : null;
  const selectedTargets = useMemo(
    () =>
      organizations.filter((organization) =>
        selectedTargetIds.has(organization.id),
      ),
    [organizations, selectedTargetIds],
  );
  const selectedTargetIdList = useMemo(
    () => Array.from(selectedTargetIds),
    [selectedTargetIds],
  );
  const selectedVisibleTargetCount = selectedTargets.length;
  const allVisibleTargetsSelected =
    organizations.length > 0 &&
    selectedVisibleTargetCount === organizations.length;
  const someVisibleTargetsSelected =
    selectedVisibleTargetCount > 0 &&
    selectedVisibleTargetCount < organizations.length;
  const showDetailPanel = Boolean(detailPanelOpen && selectedOrganization);
  const activitiesQuery = useInfiniteQuery({
    queryKey: [ACTIVITIES_QUERY_KEY, targetKind, selectedOrganization?.id],
    queryFn: ({ pageParam }) => {
      const cursor = typeof pageParam === "string" ? pageParam : "";
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) {
        params.set("cursor", cursor);
      }

      return sdkFetch<PartnershipCrmActivitiesPage>(
        `${crmTargetBasePath(targetKind)}/${encodeURIComponent(
          selectedOrganization?.id ?? "",
        )}/activities?${params.toString()}`,
      );
    },
    enabled: Boolean(selectedOrganization?.id && activityLogOpen),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const activityRows = useMemo(
    () => activitiesQuery.data?.pages.flatMap((page) => page.activities) ?? [],
    [activitiesQuery.data?.pages],
  );
  const sentEmailLogQuery = useInfiniteQuery({
    queryKey: [SENT_EMAIL_LOG_QUERY_KEY],
    queryFn: ({ pageParam }) => {
      const cursor = typeof pageParam === "string" ? pageParam : "";
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) {
        params.set("cursor", cursor);
      }

      return sdkFetch<PartnershipCrmSentEmailLogsPage>(
        `/admin/partnership-crm/sent-email-log?${params.toString()}`,
      );
    },
    enabled: sentEmailLogOpen,
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const sentEmailRows = useMemo(
    () => sentEmailLogQuery.data?.pages.flatMap((page) => page.emails) ?? [],
    [sentEmailLogQuery.data?.pages],
  );

  useEffect(() => {
    const restoredSession = loadCrmImportSession(targetKind);
    if (!restoredSession) {
      setImportSession(null);
      setImportPreview(null);
      setParseErrors([]);
      return;
    }

    setImportSession(restoredSession);
    setImportPreview(previewFromImportSession(restoredSession));
    setParseErrors(restoredSession.parseErrors);
  }, [targetKind]);

  useEffect(() => {
    if (!organizations.length) {
      setSelectedId(null);
      setDetailPanelOpen(false);
      setSelectedTargetIds((current) =>
        current.size === 0 ? current : new Set(),
      );
      return;
    }

    if (selectedId && !organizations.some((entry) => entry.id === selectedId)) {
      setSelectedId(null);
      setDetailPanelOpen(false);
      setActivityLogOpen(false);
    }
  }, [organizations, selectedId]);

  useEffect(() => {
    if (selectedTargetIds.size === 0) {
      return;
    }

    const visibleIds = new Set(organizations.map((entry) => entry.id));
    setSelectedTargetIds((current) => {
      const next = new Set(
        Array.from(current).filter((targetId) => visibleIds.has(targetId)),
      );

      return next.size === current.size ? current : next;
    });
  }, [organizations, selectedTargetIds.size]);

  function invalidateOrganizations() {
    queryClient.invalidateQueries({
      queryKey: [ORGANIZATIONS_QUERY_KEY, targetKind],
    });
  }

  function invalidateActivities(organizationId?: string) {
    queryClient.invalidateQueries({
      queryKey: [ACTIVITIES_QUERY_KEY, targetKind, organizationId],
    });
  }

  function removeTargetsFromCachedPages(targetIds: string[]) {
    const deletedIds = new Set(targetIds);

    queryClient.setQueriesData<
      PartnershipCrmOrganizationsPage | PartnershipCrmProfessionalsPage
    >({ queryKey: [ORGANIZATIONS_QUERY_KEY, targetKind] }, (current) =>
      targetKind === "professionals"
        ? current && "professionals" in current
          ? {
              ...current,
              professionals: current.professionals.filter(
                (professional) => !deletedIds.has(professional.id),
              ),
            }
          : current
        : current && "organizations" in current
          ? {
              ...current,
              organizations: current.organizations.filter(
                (organization) => !deletedIds.has(organization.id),
              ),
            }
          : current,
    );
  }

  const saveOrganizationMutation = useMutation({
    mutationFn: ({
      mode,
      organizationId,
      payload,
    }: {
      mode: "create" | "edit";
      organizationId?: string;
      payload: CrmTargetInput;
    }) => {
      const path =
        mode === "edit" && organizationId
          ? `${crmTargetBasePath(targetKind)}/${encodeURIComponent(
              organizationId,
            )}`
          : crmTargetBasePath(targetKind);

      return sdkFetch<{
        organization?: PartnershipCrmOrganizationRecord;
        professional?: PartnershipCrmProfessionalRecord;
      }>(path, {
        method: mode === "edit" ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (result) => {
      const target = result.professional ?? result.organization;
      if (!target) {
        return;
      }
      setOrganizationDialog(null);
      setSelectedId(target.id);
      setDetailPanelOpen(true);
      invalidateOrganizations();
      invalidateActivities(target.id);
      queryClient.invalidateQueries({ queryKey: [SENT_EMAIL_LOG_QUERY_KEY] });
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          targetKind === "professionals"
            ? t("CRM professional saved.")
            : t("CRM organization saved."),
      });
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          targetKind === "professionals"
            ? t("Unable to save CRM professional.")
            : t("Unable to save CRM organization."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: (organizationId: string) =>
      sdkFetch<{
        deleted: boolean;
        organizationId?: string;
        professionalId?: string;
      }>(
        `${crmTargetBasePath(targetKind)}/${encodeURIComponent(organizationId)}`,
        { method: "DELETE" },
      ),
    onSuccess: (_result, organizationId) => {
      setDeleteTarget(null);
      setSelectedTargetIds((current) => {
        if (!current.has(organizationId)) {
          return current;
        }

        const next = new Set(current);
        next.delete(organizationId);
        return next;
      });
      removeTargetsFromCachedPages([organizationId]);
      const nextSelection =
        organizations.find((organization) => organization.id !== organizationId)
          ?.id ?? null;
      setSelectedId(nextSelection);
      setDetailPanelOpen(Boolean(nextSelection));
      void queryClient.invalidateQueries({
        queryKey: [ORGANIZATIONS_QUERY_KEY, targetKind],
      });
      void queryClient.invalidateQueries({
        queryKey: [ACTIVITIES_QUERY_KEY, targetKind, organizationId],
      });
      void organizationQuery.refetch();
      router.refresh();
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          targetKind === "professionals"
            ? t("CRM professional deleted.")
            : t("CRM organization deleted."),
      });
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          targetKind === "professionals"
            ? t("Unable to delete CRM professional.")
            : t("Unable to delete CRM organization."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const deleteSelectedTargetsMutation = useMutation({
    mutationFn: (targetIds: string[]) =>
      Promise.all(
        targetIds.map((targetId) =>
          sdkFetch<{
            deleted: boolean;
            organizationId?: string;
            professionalId?: string;
          }>(
            `${crmTargetBasePath(targetKind)}/${encodeURIComponent(targetId)}`,
            { method: "DELETE" },
          ),
        ),
      ),
    onSuccess: (_result, targetIds) => {
      const deletedIds = new Set(targetIds);
      setDeleteSelectedOpen(false);
      setSelectedTargetIds(new Set());
      setDeleteTarget((current) =>
        current && deletedIds.has(current.id) ? null : current,
      );
      removeTargetsFromCachedPages(targetIds);

      if (selectedId && deletedIds.has(selectedId)) {
        const nextSelection =
          organizations.find((organization) => !deletedIds.has(organization.id))
            ?.id ?? null;
        setSelectedId(nextSelection);
        setDetailPanelOpen(Boolean(nextSelection));
        setActivityLogOpen(false);
        setEmailOpen(false);
        setNoteDraft("");
      }

      void queryClient.invalidateQueries({
        queryKey: [ORGANIZATIONS_QUERY_KEY, targetKind],
      });
      for (const targetId of targetIds) {
        void queryClient.invalidateQueries({
          queryKey: [ACTIVITIES_QUERY_KEY, targetKind, targetId],
        });
      }
      void organizationQuery.refetch();
      router.refresh();
      setToast({
        id: Date.now(),
        tone: "success",
        message: `${targetIds.length} ${
          targetKind === "professionals"
            ? t("CRM professionals deleted.")
            : t("CRM organizations deleted.")
        }`,
      });
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          targetKind === "professionals"
            ? t("Unable to delete selected CRM professionals.")
            : t("Unable to delete selected CRM organizations."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const addActivityMutation = useMutation({
    mutationFn: ({
      organizationId,
      title,
    }: {
      organizationId: string;
      title: string;
    }) =>
      sdkFetch<{ activity: PartnershipCrmActivityRecord }>(
        `${crmTargetBasePath(targetKind)}/${encodeURIComponent(
          organizationId,
        )}/activities`,
        {
          method: "POST",
          body: JSON.stringify({ type: "note", title, body: title }),
        },
      ),
    onSuccess: (_result, variables) => {
      setNoteDraft("");
      invalidateActivities(variables.organizationId);
      invalidateOrganizations();
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to add activity."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: ({
      organizationId,
      email,
    }: {
      organizationId: string;
      email: EmailState;
    }) =>
      sdkFetch<{
        organization?: PartnershipCrmOrganizationRecord;
        professional?: PartnershipCrmProfessionalRecord;
        activity: PartnershipCrmActivityRecord;
        sentEmailLog: PartnershipCrmSentEmailLogRecord;
      }>(
        `${crmTargetBasePath(targetKind)}/${encodeURIComponent(
          organizationId,
        )}/email`,
        {
          method: "POST",
          body: JSON.stringify({
            to: email.to,
            subject: email.subject,
            text: email.text,
            templateId: email.templateId,
          }),
        },
      ),
    onSuccess: (result) => {
      const target = result.professional ?? result.organization;
      if (!target) {
        return;
      }
      setEmailOpen(false);
      setSelectedId(target.id);
      setDetailPanelOpen(true);
      invalidateOrganizations();
      invalidateActivities(target.id);
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("CRM email sent."),
      });
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to send CRM email."),
        details: error instanceof Error ? error.message : undefined,
        durationMs: 18000,
      });
    },
  });

  function saveImportSession(next: CrmImportSession): CrmImportSession {
    const totalRows = next.totalRows || next.sourceRows.length;
    const nextImportIndex = Math.min(
      Math.max(0, next.nextImportIndex),
      totalRows,
    );
    const normalized = {
      ...next,
      previewRows: next.previewRows.map(withDuplicateDefaults),
      totalRows,
      previewedRows: Math.min(Math.max(0, next.previewedRows), totalRows),
      activeRowIndex: Math.min(
        Math.max(0, next.activeRowIndex),
        Math.max(totalRows - 1, 0),
      ),
      nextImportIndex,
      chunkSize: 1,
      lastErrorDetail: next.lastError ? next.lastErrorDetail : undefined,
    };

    setImportSession(normalized);
    setImportPreview(previewFromImportSession(normalized));
    setParseErrors(normalized.parseErrors);

    if (
      !persistCrmImportSession(normalized) &&
      !importStorageWarningShownRef.current
    ) {
      importStorageWarningShownRef.current = true;
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to save import checkpoint."),
      });
    }

    return normalized;
  }

  function discardImportCheckpoint() {
    setInteractiveAutoImportEnabled(false);
    clearCrmImportSession(targetKind);
    setImportSession(null);
    setImportPreview(null);
    setParseErrors([]);
    setToast({
      id: Date.now(),
      tone: "success",
      message: t("Import checkpoint discarded."),
    });
  }

  function resetImportSession() {
    setInteractiveAutoImportEnabled(false);
    clearCrmImportSession(targetKind);
    setImportSession(null);
    setImportPreview(null);
    setParseErrors([]);
  }

  async function previewCrmImportSession(
    session: CrmImportSession,
    options: {
      targetPreviewCount?: number;
      showReadyToast?: boolean;
    } = {},
  ) {
    const targetPreviewCount = Math.min(
      Math.max(options.targetPreviewCount ?? session.sourceRows.length, 0),
      session.sourceRows.length,
    );

    if (session.previewedRows >= targetPreviewCount) {
      return saveImportSession({
        ...session,
        status: "ready",
        stage: targetPreviewCount > 0 ? "import" : session.stage,
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      });
    }

    let working = saveImportSession({
      ...session,
      status: "previewing",
      stage: "preview",
      previewRows: session.previewRows.slice(0, session.previewedRows),
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });

    let failedPreviewIndex = working.previewedRows;
    let failedPreviewPayload: unknown;
    const previewEndpoint = importPreviewEndpointForTarget(working.targetKind);

    try {
      for (
        let startIndex = working.previewedRows;
        startIndex < targetPreviewCount;
        startIndex += 1
      ) {
        const chunkEndIndex = startIndex + 1;
        failedPreviewIndex = startIndex;
        failedPreviewPayload = previewRequestPayloadForRow(working, startIndex);
        const preview = await sdkFetch<PartnershipCrmImportPreview>(
          previewEndpoint,
          {
            method: "POST",
            body: JSON.stringify(failedPreviewPayload),
          },
        );

        working = saveImportSession({
          ...working,
          previewRows: [
            ...working.previewRows,
            ...preview.rows.map(withDuplicateDefaults),
          ],
          previewedRows: chunkEndIndex,
          lastError: undefined,
          updatedAt: new Date().toISOString(),
        });
      }

      working = saveImportSession({
        ...working,
        status: "ready",
        stage: targetPreviewCount > 0 ? "import" : "preview",
        previewedRows: targetPreviewCount,
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      });
      if (options.showReadyToast !== false) {
        setToast({
          id: Date.now(),
          tone: "success",
          message: t("CRM import preview ready."),
        });
      }
      return working;
    } catch (error) {
      setInteractiveAutoImportEnabled(false);
      const lastErrorDetail = buildCrmImportErrorDetail({
        error,
        session: working,
        stage: "preview",
        rowIndex: failedPreviewIndex,
        endpoint: previewEndpoint,
        requestPayload: failedPreviewPayload,
      });
      saveImportSession({
        ...working,
        status: "paused",
        stage: "preview",
        lastError: errorMessage(error),
        lastErrorDetail,
        updatedAt: new Date().toISOString(),
      });
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("CRM import paused."),
        details: importErrorDescription(
          { ...working, lastError: errorMessage(error), lastErrorDetail },
          language,
        ),
        durationMs: 18000,
      });
      return null;
    }
  }

  async function importSinglePreviewRow(
    session: CrmImportSession,
    rowIndex: number,
    decision: "add" | "skip",
  ) {
    const previewed =
      rowIndex < session.previewedRows
        ? session
        : await previewCrmImportSession(session, {
            targetPreviewCount: rowIndex + 1,
            showReadyToast: false,
          });
    if (!previewed) {
      return null;
    }

    const row = previewed.previewRows[rowIndex];
    if (!row) {
      return previewed;
    }

    if (decision === "skip") {
      return saveImportSession({
        ...previewed,
        status: "ready",
        stage: "import",
        activeRowIndex: rowIndex,
        nextImportIndex: rowIndex + 1,
        importSummary: importSummaryAdd(
          previewed.importSummary,
          summaryForLocalImportAction("skipped"),
        ),
        results: [...previewed.results, importResultForSkippedRow(row)],
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      });
    }

    if (!row.valid) {
      return saveImportSession({
        ...previewed,
        status: "ready",
        stage: "import",
        activeRowIndex: rowIndex,
        nextImportIndex: rowIndex + 1,
        importSummary: importSummaryAdd(
          previewed.importSummary,
          summaryForLocalImportAction("invalid"),
        ),
        results: [...previewed.results, importResultForInvalidRow(row)],
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      });
    }

    let importing = saveImportSession({
      ...previewed,
      status: "importing",
      stage: "import",
      activeRowIndex: rowIndex,
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });

    const importEndpoint = importEndpointForTarget(importing.targetKind);
    const requestPayload = importRequestPayloadForRow(
      row,
      importing.targetKind,
    );
    const result = await sdkFetch<PartnershipCrmImportResult>(importEndpoint, {
      method: "POST",
      body: JSON.stringify(requestPayload),
    });

    importing = saveImportSession({
      ...importing,
      status: "ready",
      stage: "import",
      activeRowIndex: rowIndex,
      nextImportIndex: rowIndex + 1,
      importSummary: importSummaryAdd(importing.importSummary, result.summary),
      results: [...importing.results, ...result.results],
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });

    return importing;
  }

  function completeCrmImportSession(session: CrmImportSession) {
    setInteractiveAutoImportEnabled(false);
    const completed = saveImportSession({
      ...session,
      status: "completed",
      stage: "complete",
      activeRowIndex: Math.max(session.totalRows - 1, 0),
      nextImportIndex: session.totalRows,
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });
    invalidateOrganizations();
    setToast({
      id: Date.now(),
      tone: "success",
      message: `${t("Import complete.")} ${
        completed.importSummary.created
      } ${t("created")}, ${completed.importSummary.updated} ${t(
        "updated",
      )}, ${completed.importSummary.skipped} ${t("skipped")}, ${
        completed.importSummary.invalid
      } ${t("invalid")}.`,
    });
    return completed;
  }

  async function runCrmImportSession(session: CrmImportSession | null) {
    if (!session || session.status === "completed") {
      return;
    }

    let working = saveImportSession({
      ...session,
      status: "importing",
      stage: "import",
      mode: "all",
      activeRowIndex: session.nextImportIndex,
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });
    let failedImportIndex = working.activeRowIndex;

    try {
      for (
        let rowIndex = working.nextImportIndex;
        rowIndex < working.totalRows;
        rowIndex += 1
      ) {
        failedImportIndex = rowIndex;
        working = saveImportSession({
          ...working,
          status: "importing",
          mode: "all",
          activeRowIndex: rowIndex,
          updatedAt: new Date().toISOString(),
        });
        const imported = await importSinglePreviewRow(working, rowIndex, "add");
        if (!imported) {
          return;
        }
        working = imported;
      }

      completeCrmImportSession(working);
    } catch (error) {
      setInteractiveAutoImportEnabled(false);
      const lastErrorDetail = buildCrmImportErrorDetail({
        error,
        session: working,
        stage: "import",
        rowIndex: failedImportIndex,
        endpoint: importEndpointForTarget(working.targetKind),
        requestPayload: importRequestPayloadForSessionRow(
          working,
          failedImportIndex,
        ),
      });
      saveImportSession({
        ...working,
        status: "paused",
        stage: "import",
        lastError: errorMessage(error),
        lastErrorDetail,
        updatedAt: new Date().toISOString(),
      });
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("CRM import paused."),
        details: importErrorDescription(
          { ...working, lastError: errorMessage(error), lastErrorDetail },
          language,
        ),
        durationMs: 18000,
      });
    }
  }

  async function startInteractiveImportSession(
    session: CrmImportSession | null,
  ) {
    if (!session || session.status === "completed") {
      return;
    }

    const rowIndex = Math.min(
      session.nextImportIndex,
      Math.max(session.totalRows - 1, 0),
    );
    setInteractiveAutoImportEnabled(false);
    const started = saveImportSession({
      ...session,
      status: "ready",
      stage: "import",
      mode: "interactive",
      activeRowIndex: rowIndex,
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });

    if (rowIndex < started.totalRows) {
      await previewCrmImportSession(started, {
        targetPreviewCount: rowIndex + 1,
        showReadyToast: false,
      });
    }
  }

  async function advanceInteractiveImportSession(
    session: CrmImportSession | null,
  ) {
    if (!session || session.status === "completed") {
      return;
    }

    if (session.nextImportIndex >= session.totalRows) {
      completeCrmImportSession(session);
      return;
    }

    const advanced = saveImportSession({
      ...session,
      status: "ready",
      stage: "import",
      mode: "interactive",
      activeRowIndex: session.nextImportIndex,
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });

    await previewCrmImportSession(advanced, {
      targetPreviewCount: advanced.activeRowIndex + 1,
      showReadyToast: false,
    });
  }

  function pauseInteractiveAutoImport() {
    setInteractiveAutoImportEnabled(false);
    setToast({
      id: Date.now(),
      tone: "success",
      message: t("Automatic import paused."),
    });
  }

  async function runInteractiveRemainingInSequence(
    session: CrmImportSession | null,
  ) {
    if (
      !session ||
      session.status === "completed" ||
      interactiveAutoImportRef.current
    ) {
      return;
    }

    setInteractiveAutoImportEnabled(true);

    let working = saveImportSession({
      ...session,
      status: "ready",
      stage: "import",
      mode: "interactive",
      activeRowIndex: Math.min(
        session.nextImportIndex,
        Math.max(session.totalRows - 1, 0),
      ),
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });
    let failedImportIndex = working.activeRowIndex;

    try {
      while (
        interactiveAutoImportRef.current &&
        working.nextImportIndex < working.totalRows
      ) {
        const rowIndex = working.nextImportIndex;
        failedImportIndex = rowIndex;
        working = saveImportSession({
          ...working,
          status: "ready",
          stage: "import",
          mode: "interactive",
          activeRowIndex: rowIndex,
          updatedAt: new Date().toISOString(),
        });

        const imported = await importSinglePreviewRow(working, rowIndex, "add");
        if (!imported) {
          setInteractiveAutoImportEnabled(false);
          return;
        }

        working = imported;
      }

      setInteractiveAutoImportEnabled(false);
      if (working.nextImportIndex >= working.totalRows) {
        completeCrmImportSession(working);
        return;
      }

      await advanceInteractiveImportSession(working);
    } catch (error) {
      setInteractiveAutoImportEnabled(false);
      const lastErrorDetail = buildCrmImportErrorDetail({
        error,
        session: working,
        stage: "import",
        rowIndex: failedImportIndex,
        endpoint: importEndpointForTarget(working.targetKind),
        requestPayload: importRequestPayloadForSessionRow(
          working,
          failedImportIndex,
        ),
      });
      saveImportSession({
        ...working,
        status: "paused",
        stage: "import",
        mode: "interactive",
        activeRowIndex: failedImportIndex,
        lastError: errorMessage(error),
        lastErrorDetail,
        updatedAt: new Date().toISOString(),
      });
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("CRM import paused."),
        details: importErrorDescription(
          { ...working, lastError: errorMessage(error), lastErrorDetail },
          language,
        ),
        durationMs: 18000,
      });
    }
  }

  async function decideInteractiveImportRow(decision: "add" | "skip") {
    if (!importSession || importSession.status === "completed") {
      return;
    }

    try {
      const rowIndex = importSession.activeRowIndex;
      const updated = await importSinglePreviewRow(
        {
          ...importSession,
          mode: "interactive",
          stage: "import",
        },
        rowIndex,
        decision,
      );
      if (!updated) {
        return;
      }
      if (updated.nextImportIndex >= updated.totalRows) {
        completeCrmImportSession(updated);
        return;
      }
      if (decision === "add") {
        await advanceInteractiveImportSession(updated);
      }
    } catch (error) {
      setInteractiveAutoImportEnabled(false);
      const rowIndex = importSession.activeRowIndex;
      const lastErrorDetail = buildCrmImportErrorDetail({
        error,
        session: importSession,
        stage: "import",
        rowIndex,
        endpoint: importEndpointForTarget(importSession.targetKind),
        requestPayload: importRequestPayloadForSessionRow(
          importSession,
          rowIndex,
        ),
      });
      saveImportSession({
        ...importSession,
        status: "paused",
        stage: "import",
        mode: "interactive",
        lastError: errorMessage(error),
        lastErrorDetail,
        updatedAt: new Date().toISOString(),
      });
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("CRM import paused."),
        details: importErrorDescription(
          { ...importSession, lastError: errorMessage(error), lastErrorDetail },
          language,
        ),
        durationMs: 18000,
      });
    }
  }

  const pageStatusCounts = useMemo(
    () =>
      Object.fromEntries(
        CRM_STATUS_OPTIONS.map((option) => [
          option.value,
          metricCount(organizations, option.value),
        ]),
      ) as Record<PartnershipCrmStatus, number>,
    [organizations],
  );
  const activityLogBadge = !selectedOrganization
    ? targetKind === "professionals"
      ? t("No professional selected")
      : t("No organization selected")
    : activitiesQuery.data
      ? `${activityRows.length} ${t("loaded")}`
      : t("Not loaded");
  const importPending =
    importSession?.status === "previewing" ||
    importSession?.status === "importing";

  function setInteractiveAutoImportEnabled(enabled: boolean) {
    interactiveAutoImportRef.current = enabled;
    setInteractiveAutoImport(enabled);
  }

  function closeImportDialog() {
    setInteractiveAutoImportEnabled(false);
    setImportOpen(false);
  }

  function resetCursorsForFilterChange(patch: Partial<ListFilters>) {
    setSelectedTargetIds(new Set());
    setDeleteSelectedOpen(false);
    setCursorStack([]);
    setFilters((current) => ({ ...current, ...patch }));
  }

  function handleTargetKindChange(nextTargetKind: PartnershipCrmTargetKind) {
    if (nextTargetKind === targetKind || importPending) {
      return;
    }

    setInteractiveAutoImportEnabled(false);
    setTargetKind(nextTargetKind);
    setCursorStack([]);
    setSelectedId(null);
    setSelectedTargetIds(new Set());
    setDetailPanelOpen(false);
    setActivityLogOpen(false);
    setNoteDraft("");
    setOrganizationDialog(null);
    setDeleteTarget(null);
    setDeleteSelectedOpen(false);
    setEmailOpen(false);
    setFilters({
      query: "",
      status: "all",
      category: "",
      country: "",
      emailState: "all",
    });
  }

  function handleTargetSelect(targetId: string) {
    setSelectedId(targetId);
    setDetailPanelOpen(true);
  }

  function setTargetSelected(targetId: string, selected: boolean) {
    setSelectedTargetIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(targetId);
      } else {
        next.delete(targetId);
      }
      return next;
    });
  }

  function setVisibleTargetsSelected(selected: boolean) {
    setSelectedTargetIds((current) => {
      const next = new Set(current);
      for (const organization of organizations) {
        if (selected) {
          next.add(organization.id);
        } else {
          next.delete(organization.id);
        }
      }
      return next;
    });
  }

  function clearSelectedTargets() {
    setSelectedTargetIds(new Set());
    setDeleteSelectedOpen(false);
  }

  function hideDetailPanel() {
    setSelectedId(null);
    setDetailPanelOpen(false);
    setActivityLogOpen(false);
    setEmailOpen(false);
    setNoteDraft("");
  }

  function toggleActivityLog() {
    if (!selectedOrganization) {
      return;
    }

    setActivityLogOpen((current) => !current);
  }

  function handleOrganizationSubmit(
    mode: "create" | "edit",
    organizationId: string | undefined,
    payload: CrmTargetInput,
  ) {
    saveOrganizationMutation.mutate({ mode, organizationId, payload });
  }

  async function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    clearCrmImportSession(targetKind);
    setInteractiveAutoImportEnabled(false);
    try {
      const text = await file.text();
      const parsed = parseCrmCsv(text, targetKind);
      if (parsed.rows.length === 0) {
        setImportSession(null);
        setImportPreview(null);
        setParseErrors(parsed.errors);
        return;
      }

      const now = new Date().toISOString();
      const session: CrmImportSession = {
        id: createImportSessionId(),
        fileName: file.name,
        fileSize: file.size,
        createdAt: now,
        updatedAt: now,
        status: "ready",
        stage: "preview",
        mode: "setup",
        chunkSize: 1,
        targetKind,
        sourceRows: parsed.rows,
        previewRows: [],
        parseErrors: parsed.errors,
        totalRows: parsed.rows.length,
        previewedRows: 0,
        activeRowIndex: 0,
        nextImportIndex: 0,
        importSummary: emptyImportSummary(),
        results: [],
      };

      saveImportSession(session);
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("CRM CSV loaded."),
      });
    } catch (error) {
      setImportSession(null);
      setImportPreview(null);
      setParseErrors([]);
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to preview CRM import."),
        details: errorMessage(error),
      });
    } finally {
      event.target.value = "";
    }
  }

  function updateSelectedStatus(status: PartnershipCrmStatus) {
    if (!selectedOrganization) {
      return;
    }

    saveOrganizationMutation.mutate({
      mode: "edit",
      organizationId: selectedOrganization.id,
      payload: targetPayload(
        { ...toFormState(selectedOrganization, targetKind), status },
        targetKind,
      ),
    });
  }

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganization || !noteDraft.trim()) {
      return;
    }

    addActivityMutation.mutate({
      organizationId: selectedOrganization.id,
      title: noteDraft.trim(),
    });
  }

  return (
    <section className="glass-panel flex flex-col gap-5 px-4 py-4 md:px-5">
      <CrmTargetSegmentedControl
        value={targetKind}
        onChange={handleTargetKindChange}
        language={language}
        disabled={importPending}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold text-foreground">
            CRM
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HeaderUnclutterButton />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void organizationQuery.refetch();
              void templatesQuery.refetch();
            }}
            disabled={organizationQuery.isFetching || templatesQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                (organizationQuery.isFetching || templatesQuery.isFetching) &&
                  "animate-spin",
              )}
            />
            {t("Refresh")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <FileUp className="h-3.5 w-3.5" />
            {t("Import CSV")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportRulesOpen(true)}
          >
            <ListChecks className="h-3.5 w-3.5" />
            {t("Import rules")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSentEmailLogOpen(true)}
          >
            <Mail className="h-3.5 w-3.5" />
            {t("All emails sent")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setOrganizationDialog({ mode: "create" })}
          >
            <Plus className="h-3.5 w-3.5" />
            {targetKind === "professionals"
              ? t("Add Professional")
              : t("Add Organization")}
          </Button>
        </div>
      </div>

      {importSession && importSession.status !== "completed" ? (
        <ImportCheckpointBanner
          session={importSession}
          language={language}
          onOpen={() => setImportOpen(true)}
          onClear={discardImportCheckpoint}
        />
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border/80 bg-background/60 p-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_160px_160px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(event) =>
              resetCursorsForFilterChange({ query: event.target.value })
            }
            placeholder={
              targetKind === "professionals"
                ? t("Search professionals...")
                : t("Search organizations...")
            }
            className="pl-8"
          />
        </div>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            resetCursorsForFilterChange({
              status: value as ListFilters["status"],
            })
          }
        >
          <SelectTrigger className="w-full">
            <Filter className="h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All statuses")}</SelectItem>
            {CRM_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CrmCategorySelect
          id="crm-category-filter"
          value={filters.category}
          onChange={(category) => resetCursorsForFilterChange({ category })}
          language={language}
          mode="filter"
          audience={targetKind}
        />
        <CrmCountrySelect
          id="crm-country-filter"
          value={filters.country}
          onChange={(country) => resetCursorsForFilterChange({ country })}
          language={language}
          mode="filter"
        />
        <Select
          value={filters.emailState}
          onValueChange={(value) =>
            resetCursorsForFilterChange({
              emailState: value as ListFilters["emailState"],
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All emails")}</SelectItem>
            <SelectItem value="has_email">{t("Has Email")}</SelectItem>
            <SelectItem value="missing_email">{t("Missing Email")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        className={cn(
          "grid gap-4",
          showDetailPanel &&
            "xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.72fr)]",
        )}
      >
        <div className="grid content-start gap-4">
          <div className="grid items-start gap-2 sm:grid-cols-5">
            {PIPELINE_STATUSES.map((status) => {
              const tone = pipelineStatusTone(
                status,
                filters.status === status,
              );

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => resetCursorsForFilterChange({ status })}
                  className={cn(
                    "h-16 self-start rounded-xl border px-3 py-2 text-left transition-colors",
                    tone.card,
                  )}
                >
                  <p className={cn("text-xs font-medium", tone.label)}>
                    {t(statusLabel(status))}
                  </p>
                  <p className={cn("mt-1 text-lg font-semibold", tone.count)}>
                    {pageStatusCounts[status]}
                  </p>
                </button>
              );
            })}
          </div>

          {organizationQuery.error ? (
            <ErrorBanner>
              {targetKind === "professionals"
                ? t("Failed to load CRM professionals.")
                : t("Failed to load CRM organizations.")}
            </ErrorBanner>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border/80 bg-background/64">
            {organizationQuery.isFetching && organizations.length === 0 ? (
              <div className="grid gap-2 p-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : organizations.length === 0 ? (
              <EmptyState>
                {targetKind === "professionals"
                  ? t("No CRM professionals found.")
                  : t("No CRM organizations found.")}
              </EmptyState>
            ) : (
              <>
                {selectedTargetIds.size > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/35 px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      {selectedTargetIds.size}{" "}
                      {targetKind === "professionals"
                        ? t(
                            selectedTargetIds.size === 1
                              ? "professional selected"
                              : "professionals selected",
                          )
                        : t(
                            selectedTargetIds.size === 1
                              ? "organization selected"
                              : "organizations selected",
                          )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearSelectedTargets}
                        disabled={deleteSelectedTargetsMutation.isPending}
                      >
                        <X className="h-3.5 w-3.5" />
                        {t("Clear selected")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteSelectedOpen(true)}
                        disabled={deleteSelectedTargetsMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("Delete selected")}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          aria-label={
                            targetKind === "professionals"
                              ? t("Select all visible CRM professionals")
                              : t("Select all visible CRM organizations")
                          }
                          checked={
                            allVisibleTargetsSelected
                              ? true
                              : someVisibleTargetsSelected
                                ? "indeterminate"
                                : false
                          }
                          disabled={deleteSelectedTargetsMutation.isPending}
                          onCheckedChange={(checked) =>
                            setVisibleTargetsSelected(checked === true)
                          }
                        />
                      </TableHead>
                      <TableHead className="w-16">
                        <span className="sr-only">{t("Favorite")}</span>
                      </TableHead>
                      <TableHead>
                        {targetKind === "professionals"
                          ? t("Professional")
                          : t("Organization")}
                      </TableHead>
                      <TableHead>{t("Status")}</TableHead>
                      <TableHead>
                        {targetKind === "professionals"
                          ? t("Mail")
                          : t("Contact")}
                      </TableHead>
                      <TableHead>{t("Last Contact")}</TableHead>
                      <TableHead>{t("Notes")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizations.map((organization) => {
                      const isSelected =
                        organization.id === selectedOrganization?.id &&
                        showDetailPanel;
                      const isBatchSelected = selectedTargetIds.has(
                        organization.id,
                      );

                      return (
                        <TableRow
                          key={organization.id}
                          data-state={
                            isSelected || isBatchSelected
                              ? "selected"
                              : undefined
                          }
                          className={cn(
                            "cursor-pointer",
                            isSelected &&
                              "bg-sky-50/80 hover:bg-sky-50 dark:bg-sky-400/10 dark:hover:bg-sky-400/12",
                          )}
                          onClick={() => handleTargetSelect(organization.id)}
                        >
                          <TableCell>
                            <Checkbox
                              aria-label={`${t("Select")} ${organization.name}`}
                              checked={isBatchSelected}
                              disabled={deleteSelectedTargetsMutation.isPending}
                              onClick={(event) => event.stopPropagation()}
                              onCheckedChange={(checked) =>
                                setTargetSelected(
                                  organization.id,
                                  checked === true,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell
                            className={cn(
                              "w-16",
                              crmDeliveryStatusCellClass(organization.status),
                            )}
                          >
                            <FavoriteCell
                              isFavorite={organization.is_favorite}
                              status={organization.status}
                              language={language}
                            />
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <button
                              type="button"
                              className="max-w-[260px] text-left"
                              onClick={() =>
                                handleTargetSelect(organization.id)
                              }
                            >
                              <span className="block truncate font-medium text-foreground">
                                {organization.name}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {formatCrmCategory(
                                  organization.category,
                                  language,
                                  targetKind,
                                ) || t("No category")}{" "}
                                ·{" "}
                                {formatCrmCountry(
                                  organization.country,
                                  language,
                                ) || t("No country")}
                              </span>
                            </button>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={organization.status}
                              language={language}
                            />
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {targetKind === "professionals" ? (
                              <div className="max-w-[210px] truncate font-medium">
                                {crmTargetEmail(organization, targetKind) ||
                                  t("No email")}
                              </div>
                            ) : (
                              <>
                                <div className="max-w-[210px] truncate font-medium">
                                  {targetContactName(
                                    organization,
                                    targetKind,
                                  ) || "—"}
                                </div>
                                <div className="max-w-[210px] truncate text-xs text-muted-foreground">
                                  {crmTargetEmail(organization, targetKind) ||
                                    t("No email")}
                                </div>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal text-sm text-muted-foreground">
                            {formatDate(organization.lastContactAt, language)}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <p className="line-clamp-2 max-w-[240px] text-xs text-muted-foreground">
                              {organization.notes || "—"}
                            </p>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">
              {organizations.length} {t("visible")}
            </span>
            <span className="text-xs text-muted-foreground/60">·</span>
            <span className="text-xs font-medium text-muted-foreground">
              {listPageLabel}
            </span>
            <div className="ml-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCursorStack((current) => {
                    setSelectedTargetIds(new Set());
                    setDeleteSelectedOpen(false);
                    return current.slice(0, -1);
                  })
                }
                disabled={
                  cursorStack.length === 0 || organizationQuery.isFetching
                }
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {t("Previous")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!organizationQuery.data?.nextCursor) {
                    return;
                  }
                  setSelectedTargetIds(new Set());
                  setDeleteSelectedOpen(false);
                  setCursorStack((current) => [
                    ...current,
                    organizationQuery.data!.nextCursor!,
                  ]);
                }}
                disabled={!hasNextListPage || organizationQuery.isFetching}
              >
                {t("Next page")}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {showDetailPanel && selectedOrganization ? (
          <aside className="grid gap-4">
            <div className="rounded-xl border border-border/80 bg-background/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={selectedOrganization.status}
                      language={language}
                    />
                    <CategoryBadgeGroup
                      value={selectedOrganization.category}
                      language={language}
                      targetKind={targetKind}
                    />
                  </div>
                  <h3 className="mt-2 truncate font-heading text-xl font-semibold text-foreground">
                    {selectedOrganization.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatCrmCountry(selectedOrganization.country, language) ||
                      t("No country")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("Edit")}
                    title={t("Edit")}
                    onClick={() =>
                      setOrganizationDialog({
                        mode: "edit",
                        organization: selectedOrganization,
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    aria-label={t("Delete")}
                    title={t("Delete")}
                    onClick={() => setDeleteTarget(selectedOrganization)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("Hide details")}
                    title={t("Hide details")}
                    onClick={hideDetailPanel}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("Pipeline")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {[...PIPELINE_STATUSES, ...OUTCOME_STATUSES].map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant={
                        selectedOrganization.status === status
                          ? "secondary"
                          : "outline"
                      }
                      size="xs"
                      onClick={() => updateSelectedStatus(status)}
                      disabled={saveOrganizationMutation.isPending}
                    >
                      {t(statusLabel(status))}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <OrganizationFacts
                  organization={selectedOrganization}
                  targetKind={targetKind}
                  language={language}
                />
              </div>

              <div className="mt-4 rounded-xl border border-border/80 bg-background/70 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("Notes")}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/88">
                  {selectedOrganization.notes || t("No notes yet.")}
                </p>
              </div>

              <Button
                type="button"
                size="lg"
                onClick={() => setEmailOpen(true)}
                disabled={!crmTargetEmail(selectedOrganization, targetKind)}
                className={cn(EMAIL_CTA_CLASS, "mt-4 w-full justify-center")}
              >
                <Mail className="h-4 w-4" />
                {t("Send Email")}
              </Button>
            </div>
          </aside>
        ) : null}
      </div>

      <section className="rounded-xl border border-border/80 bg-background/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 items-start gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
            onClick={toggleActivityLog}
            aria-expanded={activityLogOpen}
            disabled={!selectedOrganization}
          >
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-heading text-lg font-semibold text-foreground">
                  {t("Activity log")}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    activityLogOpen && "rotate-180",
                  )}
                />
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {selectedOrganization
                  ? `${selectedOrganization.name} · ${t(
                      targetKind === "professionals"
                        ? "Expand to load the selected professional activity."
                        : "Expand to load the selected organization activity.",
                    )}`
                  : targetKind === "professionals"
                    ? t("Select a professional to see CRM details.")
                    : t("Select an organization to see CRM details.")}
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{activityLogBadge}</Badge>
            {activityLogOpen && selectedOrganization ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("Refresh")}
                title={t("Refresh")}
                onClick={() => activitiesQuery.refetch()}
                disabled={activitiesQuery.isFetching}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    activitiesQuery.isFetching && "animate-spin",
                  )}
                />
              </Button>
            ) : null}
          </div>
        </div>

        {activityLogOpen ? (
          selectedOrganization ? (
            <>
              <form
                onSubmit={submitNote}
                className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <Input
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder={t("Add an activity note...")}
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!noteDraft.trim() || addActivityMutation.isPending}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("Add")}
                </Button>
              </form>

              <div className="mt-4">
                {activitiesQuery.error ? (
                  <ErrorBanner>{t("Failed to load activity log.")}</ErrorBanner>
                ) : activitiesQuery.isFetching && !activityRows.length ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-20 rounded-xl" />
                    ))}
                  </div>
                ) : !activityRows.length ? (
                  <EmptyState>{t("No activity yet.")}</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {activityRows.map((activity) => (
                      <ActivityCell
                        key={activity.id}
                        activity={activity}
                        language={language}
                      />
                    ))}
                  </div>
                )}
              </div>

              {activitiesQuery.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => activitiesQuery.fetchNextPage()}
                  disabled={activitiesQuery.isFetchingNextPage}
                >
                  {activitiesQuery.isFetchingNextPage
                    ? t("Loading...")
                    : t("Load more")}
                </Button>
              ) : null}
            </>
          ) : (
            <EmptyState>
              {targetKind === "professionals"
                ? t("Select a professional to see CRM details.")
                : t("Select an organization to see CRM details.")}
            </EmptyState>
          )
        ) : null}
      </section>

      <OrganizationDialog
        state={organizationDialog}
        pending={saveOrganizationMutation.isPending}
        targetKind={targetKind}
        onClose={() => setOrganizationDialog(null)}
        onSubmit={handleOrganizationSubmit}
        language={language}
      />

      <EmailComposerDialog
        organization={selectedOrganization}
        targetKind={targetKind}
        open={emailOpen}
        pending={sendEmailMutation.isPending}
        templates={emailTemplates}
        templatesLoading={templatesQuery.isLoading}
        templatesHasMore={Boolean(templatesQuery.hasNextPage)}
        templatesFetchingMore={templatesQuery.isFetchingNextPage}
        onLoadMoreTemplates={() => {
          void templatesQuery.fetchNextPage();
        }}
        onClose={() => setEmailOpen(false)}
        onSend={(email) => {
          if (selectedOrganization) {
            sendEmailMutation.mutate({
              organizationId: selectedOrganization.id,
              email,
            });
          }
        }}
        language={language}
      />

      <AllSentEmailsDialog
        open={sentEmailLogOpen}
        onOpenChange={setSentEmailLogOpen}
        emails={sentEmailRows}
        loading={sentEmailLogQuery.isFetching}
        error={sentEmailLogQuery.error}
        hasNextPage={Boolean(sentEmailLogQuery.hasNextPage)}
        loadingNextPage={sentEmailLogQuery.isFetchingNextPage}
        onLoadMore={() => {
          void sentEmailLogQuery.fetchNextPage();
        }}
        language={language}
      />

      <ImportDialog
        open={importOpen}
        pending={importPending}
        targetKind={targetKind}
        session={importSession}
        preview={importPreview}
        parseErrors={parseErrors}
        interactiveAutoImport={interactiveAutoImport}
        onClose={closeImportDialog}
        onTargetKindChange={handleTargetKindChange}
        onFileChange={handleCsvFileChange}
        onStartInteractive={() =>
          void startInteractiveImportSession(importSession)
        }
        onInteractiveAdd={() => void decideInteractiveImportRow("add")}
        onInteractiveSkip={() => void decideInteractiveImportRow("skip")}
        onInteractiveNext={() =>
          void advanceInteractiveImportSession(importSession)
        }
        onImportRemainingInSequence={() =>
          void runInteractiveRemainingInSequence(importSession)
        }
        onPauseAutomaticImport={pauseInteractiveAutoImport}
        onImportAll={() => void runCrmImportSession(importSession)}
        onClearSession={discardImportCheckpoint}
        onResetSession={resetImportSession}
        language={language}
      />

      <CrmImportRulesDialog
        open={importRulesOpen}
        onOpenChange={setImportRulesOpen}
        language={language}
        kind={targetKind}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {targetKind === "professionals"
                ? t("Delete CRM professional")
                : t("Delete CRM organization")}
            </DialogTitle>
            <DialogDescription>
              {targetKind === "professionals"
                ? t("This removes the professional from the partnership CRM.")
                : t("This removes the organization from the partnership CRM.")}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget ? (
            <div className="rounded-xl border border-border/80 bg-background/70 p-3">
              <p className="font-medium text-foreground">{deleteTarget.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {crmTargetEmail(deleteTarget, targetKind) || t("No email")}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteOrganizationMutation.isPending}
            >
              <X className="h-4 w-4" />
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                deleteTarget &&
                deleteOrganizationMutation.mutate(deleteTarget.id)
              }
              disabled={deleteOrganizationMutation.isPending}
            >
              <AlertTriangle className="h-4 w-4" />
              {deleteOrganizationMutation.isPending
                ? t("Deleting...")
                : t("Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteSelectedOpen}
        onOpenChange={(open) => !open && setDeleteSelectedOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {targetKind === "professionals"
                ? t("Delete selected CRM professionals")
                : t("Delete selected CRM organizations")}
            </DialogTitle>
            <DialogDescription>
              {targetKind === "professionals"
                ? t(
                    "This removes every selected professional from the partnership CRM.",
                  )
                : t(
                    "This removes every selected organization from the partnership CRM.",
                  )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-sm font-semibold text-foreground">
              {selectedTargetIds.size}{" "}
              {targetKind === "professionals"
                ? t(
                    selectedTargetIds.size === 1
                      ? "professional selected"
                      : "professionals selected",
                  )
                : t(
                    selectedTargetIds.size === 1
                      ? "organization selected"
                      : "organizations selected",
                  )}
            </p>
            <div className="mt-3 grid gap-2">
              {selectedTargets.map((target) => (
                <div
                  key={target.id}
                  className="rounded-lg border border-border/70 bg-background px-3 py-2"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {target.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {crmTargetEmail(target, targetKind) || t("No email")}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteSelectedOpen(false)}
              disabled={deleteSelectedTargetsMutation.isPending}
            >
              <X className="h-4 w-4" />
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                deleteSelectedTargetsMutation.mutate(selectedTargetIdList)
              }
              disabled={
                deleteSelectedTargetsMutation.isPending ||
                selectedTargetIdList.length === 0
              }
            >
              <AlertTriangle className="h-4 w-4" />
              {deleteSelectedTargetsMutation.isPending
                ? t("Deleting...")
                : t("Delete selected")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
    </section>
  );
}
