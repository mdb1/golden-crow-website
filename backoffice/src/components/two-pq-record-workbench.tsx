"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CircleDot,
  FileCode2,
  FolderOpen,
  Link2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Copy,
  X,
} from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { OptionSelectField } from "@/components/constrained-fields";
import { FormRequestedWarningDialog } from "@/components/form-requested-warning-dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogClose,
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
import { Textarea } from "@/components/ui/textarea";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";
import { isInstitutionManagerRole } from "@/lib/admin-areas";
import {
  type TwoPQAreaConfig,
  type TwoPQAreaKey,
  type TwoPQDetailRecord,
  type TwoPQFieldConfig,
  type TwoPQListItem,
  type TwoPQMutableFieldKey,
  type TwoPQRecord,
  getTwoPQAreaConfig,
  getTwoPQRecordSubtitle,
  getTwoPQRecordTitle,
  translateTwoPQAreaConfig,
} from "@/lib/two-pq-areas";
import { appText } from "@/lib/language";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FORM_REQUESTED_DIRECT_CREATE_AREAS = new Set<TwoPQAreaKey>([
  "cases",
  "sampling",
  "sequencing",
  "shipments",
]);

type FormState = Record<TwoPQMutableFieldKey, string>;
type RelationDialogKey =
  | "case-parent-batch"
  | "sampling-parent-case"
  | "sequencing-child-case"
  | "case-child-sampling";
type ErrorLogState = {
  title: string;
  details: string;
};
type ThreeLetterCodeModalMode = "manual" | "random" | "remove";
type AutoSamplingFormState = {
  caseLabel: string;
  sampleType: string;
  processingStatus: string;
  collectionDate: string;
  receptionDate: string;
  runId: string;
  qcStatus: string;
  notes: string;
};
type AutoSamplingPreviewItem = {
  order: number;
  threeNumberCode: string;
  sixCharacterCode: string;
};
type AutoSamplingProcessItem = AutoSamplingPreviewItem & {
  attempts: number;
  status: "pending" | "running" | "success" | "error";
  samplingRecordId?: string;
  errorTitle?: string;
  errorDetails?: string;
};
type AutoSamplingProcessState = {
  config: AutoSamplingFormState;
  items: AutoSamplingProcessItem[];
  status: "running" | "paused" | "validating" | "success";
  currentIndex: number | null;
  errorTitle?: string;
  errorDetails?: string;
};
const MULTI_SAMPLING_EDITABLE_FIELD_KEYS = [
  "caseLabel",
  "sampleType",
  "processingStatus",
  "collectionDate",
  "receptionDate",
  "runId",
  "qcStatus",
  "notes",
] as const satisfies readonly TwoPQMutableFieldKey[];
type MultiSamplingEditableFieldKey =
  (typeof MULTI_SAMPLING_EDITABLE_FIELD_KEYS)[number];
type MultiSamplingEditFieldState = {
  enabled: boolean;
  value: string;
};
type MultiSamplingEditFormState = Record<
  MultiSamplingEditableFieldKey,
  MultiSamplingEditFieldState
>;
type MultiSamplingEditProcessItem = {
  order: number;
  samplingRecordId: string;
  sampleId: string;
  attempts: number;
  status: "pending" | "running" | "success" | "error";
  errorTitle?: string;
  errorDetails?: string;
};
type MultiSamplingEditProcessState = {
  patch: Partial<Record<MultiSamplingEditableFieldKey, string>>;
  items: MultiSamplingEditProcessItem[];
  status: "running" | "paused" | "validating" | "success";
  currentIndex: number | null;
  errorTitle?: string;
  errorDetails?: string;
};
const CASE_DELETE_PROCESS_STEP_KEYS = [
  "validate",
  "delete-samplings",
  "delete-case",
  "refresh",
] as const;
type CaseDeleteProcessStepKey = (typeof CASE_DELETE_PROCESS_STEP_KEYS)[number];
type CaseDeleteProcessStepStatus = "pending" | "running" | "success" | "error";
type CaseDeleteProcessStep = {
  key: CaseDeleteProcessStepKey;
  status: CaseDeleteProcessStepStatus;
};
type CaseDeleteProcessState = {
  status: "running" | "success" | "error";
  caseId: string;
  samplingCount: number;
  steps: CaseDeleteProcessStep[];
  errorTitle?: string;
  errorDetails?: string;
};
type TwoPQFileStorageSnapshot = {
  main_case: {
    id: string;
    sibling_case_ids: string[];
    parent_batch_id: string | null;
    children_sampling_ids: string[];
    last_updated: string;
  };
  entities: {
    batches: Array<Record<string, unknown>>;
    cases: Array<Record<string, unknown>>;
    samplings: Array<Record<string, unknown>>;
  };
};
type FileStorageModalMode = "publish" | "update";
type PublishFileStorageModalState = {
  mode: FileStorageModalMode;
  status: "loading" | "ready" | "publishing";
  fileName: string;
  snapshot: TwoPQFileStorageSnapshot | null;
  preview: string;
  autoSubmit: boolean;
};
type StoredFileDocumentRecord = {
  id: string;
  data: Record<string, unknown>;
};
type ReportCodeStatusRecord = {
  id: string;
  code: string;
  userId: string;
  linkedFileId?: string | null;
  uploadedReportId?: string;
  fileName?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  providerFormat?: string | null;
};
type PublishReportCodeResult = {
  reportCode: string;
  uploadedReportId: string;
  fileId: string;
  created: boolean;
};
const MULTI_SAMPLING_EDITABLE_FIELD_SET =
  new Set<MultiSamplingEditableFieldKey>(MULTI_SAMPLING_EDITABLE_FIELD_KEYS);
const STORED_FILE_FRESHNESS_TOLERANCE_MS = 60_000;

const CREATION_CONFETTI = [
  {
    left: "10%",
    top: "18%",
    color: "var(--chart-4)",
    delay: "0ms",
    duration: "1080ms",
  },
  {
    left: "18%",
    top: "10%",
    color: "var(--chart-2)",
    delay: "60ms",
    duration: "980ms",
  },
  {
    left: "28%",
    top: "16%",
    color: "var(--chart-1)",
    delay: "110ms",
    duration: "1120ms",
  },
  {
    left: "40%",
    top: "8%",
    color: "var(--chart-5)",
    delay: "170ms",
    duration: "1020ms",
  },
  {
    left: "56%",
    top: "12%",
    color: "var(--chart-3)",
    delay: "220ms",
    duration: "1180ms",
  },
  {
    left: "68%",
    top: "14%",
    color: "var(--chart-4)",
    delay: "280ms",
    duration: "1040ms",
  },
  {
    left: "80%",
    top: "9%",
    color: "var(--chart-1)",
    delay: "330ms",
    duration: "1140ms",
  },
  {
    left: "88%",
    top: "20%",
    color: "var(--chart-2)",
    delay: "390ms",
    duration: "990ms",
  },
] as const;

function buildInitialCaseDeleteProcess(
  caseId: string,
  samplingCount: number,
): CaseDeleteProcessState {
  return {
    status: "running",
    caseId,
    samplingCount,
    steps: CASE_DELETE_PROCESS_STEP_KEYS.map((key, index) => ({
      key,
      status: index === 0 ? "running" : "pending",
    })),
  };
}

function pauseForProcessStep(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

const EMPTY_FORM_STATE: FormState = {
  institutionId: "",
  doctorId: "",
  patientId: "",
  caseLabel: "",
  caseStatus: "",
  caseType: "",
  priority: "",
  sampleId: "",
  shipmentId: "",
  trackingNumber: "",
  requestedAt: "",
  dueAt: "",
  sampleType: "",
  collectionDate: "",
  receptionDate: "",
  processingStatus: "",
  runId: "",
  qcStatus: "",
  carrier: "",
  dispatchDate: "",
  deliveryDate: "",
  deliveryStatus: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  platform: "",
  scheduling: "",
  analysisStatus: "",
  providerName: "",
  providerFormat: "",
  phoneNumber: "",
  reportCode: "",
  uploadedReportId: "",
  clientCaseStatus: "",
  reportDelivery: "",
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  preferredLanguage: "",
  country: "",
  roleEmail: "",
  accessStatus: "",
  communicationStatus: "",
  notes: "",
};

function getRecordHref(record: TwoPQListItem) {
  const linkedArea = getTwoPQAreaConfig(record.areaKey);
  return linkedArea ? `${linkedArea.route}/${record.id}` : "#";
}

const RELATION_STRIP_CLASSNAME =
  "order-last col-span-full -mx-1 flex flex-row gap-4 overflow-x-auto px-1 pb-1 pt-2";
const RELATION_SECTION_CLASSNAME =
  "min-w-[22rem] max-w-[28rem] shrink-0 overflow-hidden rounded-[1.75rem] border border-emerald-100 [background:linear-gradient(160deg,rgba(249,253,250,0.98),rgba(240,253,244,0.98)_42%,rgba(220,252,231,0.92))] shadow-[0_18px_56px_rgba(187,247,208,0.32)] dark:border-emerald-400/28 dark:[background:linear-gradient(145deg,rgba(6,35,24,0.98),rgba(10,42,30,0.95)_45%,rgba(16,185,129,0.2))] dark:shadow-[0_24px_80px_-52px_rgba(16,185,129,0.8)]";
const RELATION_SECONDARY_BUTTON_CLASSNAME =
  "border-emerald-100 bg-white/80 text-emerald-900 shadow-[0_10px_24px_rgba(220,252,231,0.78)] hover:bg-emerald-50 dark:border-emerald-200/18 dark:bg-emerald-950/24 dark:text-emerald-50 dark:shadow-none dark:hover:bg-emerald-900/34";
const RELATION_PRIMARY_BUTTON_CLASSNAME =
  "border border-emerald-100 bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(220,252,231,0.98))] text-emerald-950 shadow-[0_14px_32px_rgba(187,247,208,0.38)] hover:brightness-[1.01] dark:border-emerald-200/18 dark:bg-[linear-gradient(180deg,rgba(6,35,24,0.98),rgba(16,80,58,0.94))] dark:text-emerald-50 dark:shadow-none dark:hover:brightness-[1.06]";
const RELATION_HINT_CLASSNAME =
  "rounded-full border border-emerald-100 bg-white/72 px-3 py-1 text-xs text-emerald-900/55 shadow-[0_8px_22px_rgba(220,252,231,0.68)] dark:border-emerald-200/18 dark:bg-emerald-950/24 dark:text-emerald-50/72 dark:shadow-none";
const RELATION_EMPTY_STATE_CLASSNAME =
  "rounded-[1.35rem] border border-dashed border-emerald-100 [background:linear-gradient(180deg,rgba(255,255,255,0.72),rgba(240,253,244,0.72))] px-4 py-5 text-sm text-emerald-900/65 dark:border-emerald-300/18 dark:[background:linear-gradient(180deg,rgba(7,30,22,0.92),rgba(6,78,59,0.48))] dark:text-emerald-50/72";
const THREE_LETTER_CODE_SECTION_CLASSNAME =
  "col-span-full overflow-hidden rounded-[1.75rem] border border-fuchsia-100 [background:linear-gradient(160deg,rgba(254,250,255,0.98),rgba(250,245,255,0.98)_46%,rgba(244,214,255,0.92))] shadow-[0_18px_56px_rgba(232,121,249,0.18)] dark:border-fuchsia-400/28 dark:[background:linear-gradient(150deg,rgba(34,17,45,0.98),rgba(54,24,66,0.96)_48%,rgba(168,85,247,0.24))] dark:shadow-[0_24px_80px_-52px_rgba(168,85,247,0.88)]";
const THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME =
  "border border-fuchsia-100 bg-[linear-gradient(180deg,rgba(252,231,243,0.98),rgba(245,208,254,0.98))] text-fuchsia-950 shadow-[0_14px_34px_rgba(232,121,249,0.22)] hover:brightness-[1.02] dark:border-fuchsia-200/18 dark:bg-[linear-gradient(180deg,rgba(69,28,88,0.98),rgba(88,28,135,0.94))] dark:text-fuchsia-50 dark:shadow-none dark:hover:brightness-[1.06]";
const THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME =
  "border-fuchsia-100 bg-white/82 text-fuchsia-950 shadow-[0_10px_24px_rgba(250,232,255,0.78)] hover:bg-fuchsia-50 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:shadow-none dark:hover:bg-fuchsia-900/34";
const THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME =
  "rounded-[1.35rem] border border-dashed border-fuchsia-200/90 [background:linear-gradient(180deg,rgba(255,255,255,0.74),rgba(252,231,243,0.74))] px-4 py-5 text-sm text-fuchsia-950/72 dark:border-fuchsia-300/20 dark:[background:linear-gradient(180deg,rgba(48,20,56,0.92),rgba(88,28,135,0.36))] dark:text-fuchsia-50/76";
const FILE_STORAGE_SECTION_CLASSNAME =
  "order-[10000] col-span-full overflow-hidden rounded-[1.9rem] border border-indigo-100 [background:linear-gradient(155deg,rgba(246,248,255,0.98),rgba(238,242,255,0.98)_44%,rgba(224,231,255,0.94))] shadow-[0_24px_72px_rgba(99,102,241,0.16)] dark:border-indigo-400/28 dark:[background:linear-gradient(145deg,rgba(18,22,48,0.98),rgba(27,33,70,0.96)_46%,rgba(79,70,229,0.24))] dark:shadow-[0_24px_80px_-52px_rgba(99,102,241,0.88)]";
const REPORT_CODE_PUBLISH_SECTION_CLASSNAME =
  "order-[10001] col-span-full overflow-hidden rounded-[1.9rem] border border-indigo-100 [background:linear-gradient(155deg,rgba(241,245,255,0.99),rgba(232,239,255,0.98)_44%,rgba(218,228,255,0.94))] shadow-[0_24px_72px_rgba(79,70,229,0.18)] dark:border-indigo-400/28 dark:[background:linear-gradient(145deg,rgba(17,20,56,0.98),rgba(29,36,84,0.96)_46%,rgba(99,102,241,0.28))] dark:shadow-[0_24px_80px_-52px_rgba(99,102,241,0.9)]";
const FILE_STORAGE_PRIMARY_BUTTON_CLASSNAME =
  "border border-indigo-100 bg-[linear-gradient(180deg,rgba(224,231,255,0.98),rgba(199,210,254,0.98))] text-indigo-950 shadow-[0_14px_34px_rgba(99,102,241,0.18)] hover:brightness-[1.02] dark:border-indigo-200/18 dark:bg-[linear-gradient(180deg,rgba(49,46,129,0.98),rgba(67,56,202,0.94))] dark:text-indigo-50 dark:shadow-none dark:hover:brightness-[1.06]";
const FILE_STORAGE_SECONDARY_BUTTON_CLASSNAME =
  "border-indigo-100 bg-white/82 text-indigo-950 shadow-[0_10px_24px_rgba(224,231,255,0.86)] hover:bg-indigo-50 dark:border-indigo-200/18 dark:bg-indigo-950/28 dark:text-indigo-50 dark:shadow-none dark:hover:bg-indigo-900/34";
const FILE_STORAGE_EMPTY_STATE_CLASSNAME =
  "rounded-[1.35rem] border border-dashed border-indigo-200/90 [background:linear-gradient(180deg,rgba(255,255,255,0.76),rgba(224,231,255,0.76))] px-4 py-5 text-sm text-indigo-950/74 dark:border-indigo-300/20 dark:[background:linear-gradient(180deg,rgba(18,22,48,0.92),rgba(67,56,202,0.3))] dark:text-indigo-50/76";
const AUTO_SAMPLING_MIN_COPIES = 1;
const AUTO_SAMPLING_MAX_COPIES = 15;

function clampAutoSamplingCopies(value: number) {
  if (!Number.isFinite(value)) {
    return AUTO_SAMPLING_MIN_COPIES;
  }

  return Math.min(
    AUTO_SAMPLING_MAX_COPIES,
    Math.max(AUTO_SAMPLING_MIN_COPIES, Math.trunc(value)),
  );
}

function formatThreeNumberCode(value: number) {
  return String(Math.max(0, Math.trunc(value))).padStart(3, "0");
}

function buildSixCharacterCode(threeLetterCode: string, order: number) {
  return `${normalizeThreeLetterCodeInput(threeLetterCode)}${formatThreeNumberCode(order)}`;
}

function buildAutoSamplingPreviewItems(
  threeLetterCode: string,
  copies: number,
): AutoSamplingPreviewItem[] {
  const normalizedCopies = clampAutoSamplingCopies(copies);
  return Array.from({ length: normalizedCopies }, (_, index) => {
    const order = index + 1;
    const threeNumberCode = formatThreeNumberCode(order);
    return {
      order,
      threeNumberCode,
      sixCharacterCode: buildSixCharacterCode(threeLetterCode, order),
    };
  });
}

function buildExpectedCaseLabelFromThreeLetterCode(threeLetterCode: string) {
  const normalizedThreeLetterCode =
    normalizeThreeLetterCodeInput(threeLetterCode);
  return normalizedThreeLetterCode.length === 3
    ? `${normalizedThreeLetterCode}XXX`
    : "";
}

function getTrimmedUnknownString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toTimestampOrNull(value?: string) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatDateTimeWithSeconds(value?: string) {
  const timestamp = toTimestampOrNull(value);
  if (timestamp === null) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function resolveStoredFileLinkedReportCode(
  document: StoredFileDocumentRecord | null | undefined,
) {
  return (
    getTrimmedUnknownString(document?.data.linked_report_code) ??
    getTrimmedUnknownString(document?.data.linked_report_id) ??
    ""
  );
}

function toNullableTrimmedString(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function uniqueStringValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function buildSnapshotScope(
  record: Pick<TwoPQRecord, "institutionId" | "doctorId" | "patientId">,
) {
  return {
    institutionId: record.institutionId,
    doctorId: record.doctorId,
    patientId: toNullableTrimmedString(record.patientId),
  };
}

function buildSnapshotAudit(
  record: Pick<TwoPQRecord, "createdByEmail" | "updatedByEmail">,
) {
  return {
    createdByEmail: toNullableTrimmedString(record.createdByEmail),
    updatedByEmail: toNullableTrimmedString(record.updatedByEmail),
  };
}

function buildSnapshotTimestamps(
  record: Pick<TwoPQRecord, "createdAt" | "updatedAt">,
) {
  return {
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildCaseSnapshotRecord(record: TwoPQListItem, samplingIds: string[]) {
  return {
    id: record.id,
    kind: "case",
    scope: buildSnapshotScope(record),
    identity: {
      caseLabel: toNullableTrimmedString(record.caseLabel),
    },
    classification: {
      caseType: toNullableTrimmedString(record.caseType),
    },
    status: {
      caseStatus: toNullableTrimmedString(record.caseStatus),
      priority: toNullableTrimmedString(record.priority),
    },
    logistics: {
      trackingNumber: toNullableTrimmedString(record.trackingNumber),
      requestedAt: toNullableTrimmedString(record.requestedAt),
      dueAt: toNullableTrimmedString(record.dueAt),
    },
    relations: {
      batchId: toNullableTrimmedString(record.parent_batch),
      samplingIds,
    },
    notes: toNullableTrimmedString(record.notes),
    timestamps: buildSnapshotTimestamps(record),
    audit: buildSnapshotAudit(record),
  };
}

function buildBatchSnapshotRecord(record: TwoPQListItem, caseIds: string[]) {
  return {
    id: record.id,
    kind: "batch",
    scope: buildSnapshotScope(record),
    identity: {
      batchLabel:
        toNullableTrimmedString(record.caseLabel) ??
        toNullableTrimmedString(record.runId) ??
        record.id,
      runId: toNullableTrimmedString(record.runId),
    },
    status: {
      analysisStatus: toNullableTrimmedString(record.analysisStatus),
    },
    execution: {
      platform: toNullableTrimmedString(record.platform),
      scheduling: toNullableTrimmedString(record.scheduling),
      providerName: toNullableTrimmedString(record.providerName),
      providerFormat: toNullableTrimmedString(record.providerFormat),
      contactName: toNullableTrimmedString(record.contactName),
      contactEmail: toNullableTrimmedString(record.contactEmail),
      phoneNumber: toNullableTrimmedString(record.phoneNumber),
    },
    relations: {
      caseIds,
    },
    notes: toNullableTrimmedString(record.notes),
    timestamps: buildSnapshotTimestamps(record),
    audit: buildSnapshotAudit(record),
  };
}

function buildSamplingSnapshotRecord(record: TwoPQListItem) {
  return {
    id: record.id,
    kind: "sampling",
    scope: buildSnapshotScope(record),
    identity: {
      sampleId: toNullableTrimmedString(record.sampleId),
      caseLabelSnapshot: toNullableTrimmedString(record.caseLabel),
    },
    specimen: {
      sampleType: toNullableTrimmedString(record.sampleType),
    },
    status: {
      processingStatus: toNullableTrimmedString(record.processingStatus),
      qcStatus: toNullableTrimmedString(record.qcStatus),
    },
    dates: {
      collectionDate: toNullableTrimmedString(record.collectionDate),
      receptionDate: toNullableTrimmedString(record.receptionDate),
      runId: toNullableTrimmedString(record.runId),
    },
    relations: {
      caseId: toNullableTrimmedString(record.parent_case),
    },
    notes: toNullableTrimmedString(record.notes),
    timestamps: buildSnapshotTimestamps(record),
    audit: buildSnapshotAudit(record),
  };
}

function buildTwoPQFileStorageSnapshot({
  currentCase,
  linkedBatch,
  linkedSamplings,
  siblingCases,
}: {
  currentCase: TwoPQListItem;
  linkedBatch: TwoPQListItem | null;
  linkedSamplings: TwoPQListItem[];
  siblingCases: TwoPQListItem[];
}): TwoPQFileStorageSnapshot {
  const siblingCaseIds = siblingCases.map((record) => record.id);
  const caseSamplingIds = linkedSamplings.map((record) => record.id);
  const allCases = [
    currentCase,
    ...siblingCases.filter((record) => record.id !== currentCase.id),
  ];
  const allCaseIds = uniqueStringValues(allCases.map((record) => record.id));

  return {
    main_case: {
      id: currentCase.id,
      sibling_case_ids: siblingCaseIds,
      parent_batch_id: toNullableTrimmedString(currentCase.parent_batch),
      children_sampling_ids: caseSamplingIds,
      last_updated: currentCase.updatedAt,
    },
    entities: {
      batches: linkedBatch
        ? [buildBatchSnapshotRecord(linkedBatch, allCaseIds)]
        : [],
      cases: allCases.map((record) =>
        buildCaseSnapshotRecord(
          record,
          record.id === currentCase.id
            ? caseSamplingIds
            : (record.children_sampling ?? []),
        ),
      ),
      samplings: linkedSamplings.map((record) =>
        buildSamplingSnapshotRecord(record),
      ),
    },
  };
}

function isAutoSamplingFormComplete(config: AutoSamplingFormState) {
  return Boolean(
    config.caseLabel.trim() &&
    config.sampleType.trim() &&
    config.processingStatus.trim(),
  );
}

function buildInitialMultiSamplingEditFormState(): MultiSamplingEditFormState {
  return MULTI_SAMPLING_EDITABLE_FIELD_KEYS.reduce((nextState, key) => {
    nextState[key] = {
      enabled: false,
      value: "",
    };
    return nextState;
  }, {} as MultiSamplingEditFormState);
}

function buildMultiSamplingEditPatch(formState: MultiSamplingEditFormState) {
  return MULTI_SAMPLING_EDITABLE_FIELD_KEYS.reduce<
    Partial<Record<MultiSamplingEditableFieldKey, string>>
  >((patch, key) => {
    if (formState[key].enabled) {
      patch[key] = formState[key].value;
    }
    return patch;
  }, {});
}

function normalizeThreeLetterCodeInput(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

function generateRandomThreeLetterCode(excludedValue?: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const normalizedExcludedValue = excludedValue?.trim().toUpperCase();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = Array.from(
      { length: 3 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
    if (candidate !== normalizedExcludedValue) {
      return candidate;
    }
  }

  return normalizedExcludedValue === "AAA" ? "ZZZ" : "AAA";
}

function ThreeLetterCodeVisualizer({
  code,
  placeholder = "•",
}: {
  code?: string;
  placeholder?: string;
}) {
  const normalizedCode = normalizeThreeLetterCodeInput(code ?? "");
  const glyphs = Array.from(
    { length: 3 },
    (_, index) => normalizedCode[index] ?? placeholder,
  );

  return (
    <div className="flex items-center gap-3">
      {glyphs.map((glyph, index) => (
        <div
          key={`${glyph}-${index}`}
          className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] border border-black/8 bg-white/92 text-xl font-black uppercase tracking-[0.08em] text-black shadow-[0_12px_28px_rgba(255,255,255,0.28)] dark:bg-white/88"
        >
          {glyph}
        </div>
      ))}
    </div>
  );
}

function RelationSection({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={RELATION_SECTION_CLASSNAME}>
      <div className="flex flex-col gap-3 border-b border-emerald-200/70 px-5 py-4 dark:border-emerald-300/16">
        <div>
          <h3 className="font-heading text-lg font-semibold text-emerald-950 dark:text-emerald-50">
            {title}
          </h3>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function LinkedEntityCard({
  record,
  badge,
  note,
  actions,
  translate = (text) => text,
}: {
  record: TwoPQListItem;
  badge: string;
  note?: string;
  actions?: ReactNode;
  translate?: (text: string) => string;
}) {
  const t = translate;
  const linkedArea = getTwoPQAreaConfig(record.areaKey);
  const title = linkedArea
    ? getTwoPQRecordTitle(linkedArea, record)
    : record.id;
  const subtitle = linkedArea ? getTwoPQRecordSubtitle(linkedArea, record) : "";

  return (
    <div className="rounded-[1.35rem] border border-emerald-100 [background:linear-gradient(180deg,rgba(255,255,255,0.82),rgba(240,253,244,0.82))] px-4 py-4 shadow-[0_12px_32px_rgba(220,252,231,0.82)] dark:border-emerald-300/18 dark:[background:linear-gradient(180deg,rgba(7,30,22,0.98),rgba(8,38,27,0.96)_52%,rgba(5,150,105,0.18))] dark:shadow-none">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/18 dark:bg-emerald-400/12 dark:text-emerald-50"
            >
              {badge}
            </Badge>
            <span className="font-mono text-[11px] text-emerald-900/52 dark:text-emerald-50/58">
              {record.id}
            </span>
          </div>
          <p className="mt-3 text-base font-semibold text-emerald-950 dark:text-emerald-50">
            {title}
          </p>
          <p className="mt-1 text-sm text-emerald-900/68 dark:text-emerald-50/72">
            {subtitle || t("Linked entity")}
          </p>
          {note ? (
            <p className="mt-2 text-xs text-emerald-900/52 dark:text-emerald-50/58">
              {note}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function RelationSelectionDialog({
  open,
  onOpenChange,
  area,
  title,
  description,
  records,
  loading,
  pendingRecordId,
  query,
  onQueryChange,
  onSelect,
  selectLabel,
  noteByRecordId,
  translate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area: TwoPQAreaConfig;
  title: string;
  description: string;
  records: TwoPQListItem[];
  loading: boolean;
  pendingRecordId: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (record: TwoPQListItem) => void;
  selectLabel: string;
  noteByRecordId?: Record<string, string>;
  translate: (text: string) => string;
}) {
  const t = translate;
  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return records;
    }

    return records.filter((record) => {
      const titleText = getTwoPQRecordTitle(area, record);
      const subtitleText = getTwoPQRecordSubtitle(area, record);
      const note = noteByRecordId?.[record.id];
      return [record.id, titleText, subtitleText, note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [area, noteByRecordId, query, records]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden rounded-[2rem] border border-emerald-100 [background:linear-gradient(155deg,rgba(249,253,250,0.98),rgba(240,253,244,0.98)_56%,rgba(220,252,231,0.94))] p-0 text-emerald-950 shadow-[0_34px_120px_rgba(187,247,208,0.36)] dark:border-emerald-400/28 dark:[background:linear-gradient(150deg,rgba(6,35,24,0.98),rgba(8,38,27,0.96)_48%,rgba(5,150,105,0.18))] dark:text-emerald-50 dark:shadow-[0_30px_110px_rgba(6,95,70,0.42)]">
        <DialogHeader className="border-b border-emerald-100 px-6 py-5 dark:border-emerald-300/16">
          <DialogTitle className="font-heading text-2xl font-semibold text-emerald-950 dark:text-emerald-50">
            {title}
          </DialogTitle>
          <DialogDescription className="text-emerald-900/65 dark:text-emerald-50/68">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5">
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("Search records...")}
            className="border-emerald-100 bg-white/82 text-emerald-950 placeholder:text-emerald-900/35 dark:border-emerald-300/18 dark:bg-emerald-950/32 dark:text-emerald-50 dark:placeholder:text-emerald-50/32"
          />
          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {loading ? (
              <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                {t("Loading available records...")}
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                {t("No matching records available.")}
              </div>
            ) : (
              filteredRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-[1.35rem] border border-emerald-100 [background:linear-gradient(180deg,rgba(255,255,255,0.82),rgba(240,253,244,0.82))] px-4 py-4 shadow-[0_10px_28px_rgba(220,252,231,0.76)] dark:border-emerald-300/18 dark:[background:linear-gradient(180deg,rgba(7,30,22,0.98),rgba(8,38,27,0.96)_52%,rgba(5,150,105,0.18))] dark:shadow-none"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-50">
                          {getTwoPQRecordTitle(area, record)}
                        </p>
                        <span className="font-mono text-[11px] text-emerald-900/48 dark:text-emerald-50/58">
                          {record.id}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-emerald-900/68 dark:text-emerald-50/72">
                        {getTwoPQRecordSubtitle(area, record) ||
                          t("Linked entity")}
                      </p>
                      {noteByRecordId?.[record.id] ? (
                        <p className="mt-2 text-xs text-emerald-900/52 dark:text-emerald-50/58">
                          {noteByRecordId[record.id]}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                      >
                        <Link href={getRecordHref(record)}>
                          {t("Open")}
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onSelect(record)}
                        disabled={pendingRecordId === record.id}
                        className={RELATION_PRIMARY_BUTTON_CLASSNAME}
                      >
                        {pendingRecordId === record.id
                          ? t("Linking...")
                          : selectLabel}
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function normalizeDateInput(value?: string) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function toFormState(
  record?: Partial<TwoPQRecord>,
  defaults?: {
    institutionId?: string;
    doctorId?: string;
    patientId?: string;
    caseLabel?: string;
  },
): FormState {
  return {
    ...EMPTY_FORM_STATE,
    institutionId: record?.institutionId ?? defaults?.institutionId ?? "",
    doctorId: record?.doctorId ?? defaults?.doctorId ?? "",
    patientId: record?.patientId ?? defaults?.patientId ?? "",
    caseLabel: record?.caseLabel ?? defaults?.caseLabel ?? "",
    caseStatus: record?.caseStatus ?? "",
    caseType: record?.caseType ?? "",
    priority: record?.priority ?? "",
    sampleId: record?.sampleId ?? "",
    shipmentId: record?.shipmentId ?? "",
    trackingNumber: record?.trackingNumber ?? "",
    requestedAt: normalizeDateInput(record?.requestedAt),
    dueAt: normalizeDateInput(record?.dueAt),
    sampleType: record?.sampleType ?? "",
    collectionDate: normalizeDateInput(record?.collectionDate),
    receptionDate: normalizeDateInput(record?.receptionDate),
    processingStatus: record?.processingStatus ?? "",
    runId: record?.runId ?? "",
    qcStatus: record?.qcStatus ?? "",
    carrier: record?.carrier ?? "",
    dispatchDate: normalizeDateInput(record?.dispatchDate),
    deliveryDate: normalizeDateInput(record?.deliveryDate),
    deliveryStatus: record?.deliveryStatus ?? "",
    contactName: record?.contactName ?? "",
    contactEmail: record?.contactEmail ?? "",
    contactPhone: record?.contactPhone ?? "",
    platform: record?.platform ?? "",
    scheduling: record?.scheduling ?? "",
    analysisStatus: record?.analysisStatus ?? "",
    providerName: record?.providerName ?? "",
    providerFormat: record?.providerFormat ?? "",
    phoneNumber: record?.phoneNumber ?? "",
    reportCode: record?.reportCode ?? "",
    uploadedReportId: record?.uploadedReportId ?? "",
    clientCaseStatus: record?.clientCaseStatus ?? "",
    reportDelivery: record?.reportDelivery ?? "",
    clientName: record?.clientName ?? "",
    clientEmail: record?.clientEmail ?? "",
    clientPhone: record?.clientPhone ?? "",
    preferredLanguage: record?.preferredLanguage ?? "",
    country: record?.country ?? "",
    roleEmail: record?.roleEmail ?? "",
    accessStatus: record?.accessStatus ?? "",
    communicationStatus: record?.communicationStatus ?? "",
    notes: record?.notes ?? "",
  };
}

function getFieldKeys(areaKey: TwoPQAreaKey) {
  const area = getTwoPQAreaConfig(areaKey);
  if (!area) {
    return [] as TwoPQMutableFieldKey[];
  }

  return area.fieldGroups.flatMap((group) =>
    group.fields.map((field) => field.key),
  );
}

export function TwoPQRecordWorkbench({
  areaKey,
  detail,
  institutions,
  doctors,
  patients,
  preloadedBatch,
  preloadedCase,
  mode = "edit",
}: {
  areaKey: TwoPQAreaKey;
  detail?: TwoPQDetailRecord;
  institutions: Array<{ id: string; name: string }>;
  doctors: Array<{ id: string; fullName: string; institutionId: string }>;
  patients: Array<{
    id: string;
    fullName: string;
    institutionId: string;
    doctorId: string;
  }>;
  preloadedBatch?: TwoPQListItem | null;
  preloadedCase?: TwoPQListItem | null;
  mode?: "create" | "edit";
}) {
  const rawArea = getTwoPQAreaConfig(areaKey)!;
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const area = translateTwoPQAreaConfig(rawArea, language);
  const adminContext = useAdminContext();
  const router = useRouter();
  const scopedInstitutionId =
    isInstitutionManagerRole(adminContext.role) ||
    adminContext.role === "institution_doctor"
      ? adminContext.institutionId
      : undefined;
  const scopedDoctorId =
    adminContext.role === "institution_doctor"
      ? adminContext.doctorId
      : undefined;
  const defaults = useMemo(
    () => ({
      institutionId:
        scopedInstitutionId ??
        detail?.record.institutionId ??
        preloadedBatch?.institutionId ??
        preloadedCase?.institutionId,
      doctorId:
        scopedDoctorId ??
        detail?.record.doctorId ??
        preloadedBatch?.doctorId ??
        preloadedCase?.doctorId,
      patientId:
        detail?.record.patientId ??
        preloadedCase?.patientId ??
        preloadedBatch?.patientId,
      caseLabel: areaKey === "sampling" ? preloadedCase?.caseLabel : undefined,
    }),
    [
      areaKey,
      detail?.record.doctorId,
      detail?.record.institutionId,
      detail?.record.patientId,
      preloadedBatch?.doctorId,
      preloadedBatch?.institutionId,
      preloadedBatch?.patientId,
      preloadedCase?.caseLabel,
      preloadedCase?.doctorId,
      preloadedCase?.institutionId,
      preloadedCase?.patientId,
      scopedDoctorId,
      scopedInstitutionId,
    ],
  );
  const [state, setState] = useState<FormState>(() =>
    toFormState(detail?.record, defaults),
  );
  const [pendingAction, setPendingAction] = useState<
    null | "create" | "replace" | "update" | "delete"
  >(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formRequestedWarningOpen, setFormRequestedWarningOpen] =
    useState(false);
  const [deleteLinkedSamplings, setDeleteLinkedSamplings] = useState(false);
  const [caseDeleteProcess, setCaseDeleteProcess] =
    useState<CaseDeleteProcessState | null>(null);
  const [pendingRelationRecordId, setPendingRelationRecordId] = useState<
    string | null
  >(null);
  const [relationDialog, setRelationDialog] =
    useState<RelationDialogKey | null>(null);
  const [relationQuery, setRelationQuery] = useState("");
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [latestErrorLog, setLatestErrorLog] = useState<ErrorLogState | null>(
    null,
  );
  const [isErrorLogOpen, setIsErrorLogOpen] = useState(false);
  const [copiedErrorLog, setCopiedErrorLog] = useState(false);
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);
  const [draftBatch, setDraftBatch] = useState<TwoPQListItem | null>(
    () => preloadedBatch ?? null,
  );
  const [draftCase, setDraftCase] = useState<TwoPQListItem | null>(
    () => preloadedCase ?? null,
  );
  const [threeLetterCode, setThreeLetterCode] = useState(
    () => detail?.record.three_letter_code ?? "",
  );
  const [threeLetterCodeModal, setThreeLetterCodeModal] =
    useState<ThreeLetterCodeModalMode | null>(null);
  const [threeLetterCodeDraft, setThreeLetterCodeDraft] = useState("");
  const [pendingThreeLetterCodeAction, setPendingThreeLetterCodeAction] =
    useState(false);
  const [pendingCaseLabelCorrection, setPendingCaseLabelCorrection] =
    useState(false);
  const [isAutoSamplingSetupOpen, setIsAutoSamplingSetupOpen] = useState(false);
  const [autoSamplingConfig, setAutoSamplingConfig] =
    useState<AutoSamplingFormState>(() => ({
      caseLabel: detail?.record.caseLabel ?? "",
      sampleType: "",
      processingStatus: "awaiting_reception",
      collectionDate: "",
      receptionDate: "",
      runId: "",
      qcStatus: "",
      notes: "",
    }));
  const [autoSamplingCopies, setAutoSamplingCopies] = useState(
    AUTO_SAMPLING_MIN_COPIES,
  );
  const [autoSamplingProcess, setAutoSamplingProcess] =
    useState<AutoSamplingProcessState | null>(null);
  const [isMultiSamplingEditOpen, setIsMultiSamplingEditOpen] = useState(false);
  const [multiSamplingEditForm, setMultiSamplingEditForm] =
    useState<MultiSamplingEditFormState>(() =>
      buildInitialMultiSamplingEditFormState(),
    );
  const [multiSamplingEditProcess, setMultiSamplingEditProcess] =
    useState<MultiSamplingEditProcessState | null>(null);
  const [publishFileStorageModal, setPublishFileStorageModal] =
    useState<PublishFileStorageModalState | null>(null);
  const [isFileStorageSectionExpanded, setIsFileStorageSectionExpanded] =
    useState(true);
  const [
    isPublishFileStoragePreviewExpanded,
    setIsPublishFileStoragePreviewExpanded,
  ] = useState(false);
  const [isReportCodeSectionExpanded, setIsReportCodeSectionExpanded] =
    useState(true);
  const [isPublishReportCodeModalOpen, setIsPublishReportCodeModalOpen] =
    useState(false);
  const [pendingPublishReportCode, setPendingPublishReportCode] =
    useState(false);
  const publishFileStorageRequestIdRef = useRef(0);

  useEffect(() => {
    setThreeLetterCode(detail?.record.three_letter_code ?? "");
  }, [detail?.record.three_letter_code]);

  useEffect(() => {
    setAutoSamplingConfig({
      caseLabel: detail?.record.caseLabel ?? "",
      sampleType: "",
      processingStatus: "awaiting_reception",
      collectionDate: "",
      receptionDate: "",
      runId: "",
      qcStatus: "",
      notes: "",
    });
    setAutoSamplingCopies(AUTO_SAMPLING_MIN_COPIES);
    setIsAutoSamplingSetupOpen(false);
    setAutoSamplingProcess(null);
    setIsMultiSamplingEditOpen(false);
    setMultiSamplingEditForm(buildInitialMultiSamplingEditFormState());
    setMultiSamplingEditProcess(null);
    publishFileStorageRequestIdRef.current += 1;
    setPublishFileStorageModal(null);
    setIsFileStorageSectionExpanded(
      !(detail?.record.stored_file_id?.trim() ?? ""),
    );
    setIsPublishFileStoragePreviewExpanded(false);
    setIsReportCodeSectionExpanded(true);
    setIsPublishReportCodeModalOpen(false);
    setPendingPublishReportCode(false);
    setPendingCaseLabelCorrection(false);
    setDeleteDialogOpen(false);
    setDeleteLinkedSamplings(false);
    setCaseDeleteProcess(null);
  }, [
    detail?.record.caseLabel,
    detail?.record.id,
    detail?.record.stored_file_id,
  ]);

  useEffect(() => {
    if (autoSamplingProcess?.status !== "success") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAutoSamplingProcess(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [autoSamplingProcess?.status]);

  useEffect(() => {
    if (multiSamplingEditProcess?.status !== "success") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMultiSamplingEditProcess(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [multiSamplingEditProcess?.status]);

  const sourceState = useMemo(
    () => toFormState(detail?.record, defaults),
    [defaults, detail?.record],
  );
  const changedKeys = useMemo(
    () =>
      (Object.keys(state) as TwoPQMutableFieldKey[]).filter(
        (key) => state[key] !== sourceState[key],
      ),
    [sourceState, state],
  );
  const changed = changedKeys.length > 0;
  const availableDoctors = useMemo(
    () =>
      doctors.filter((doctor) =>
        state.institutionId
          ? doctor.institutionId === state.institutionId
          : true,
      ),
    [doctors, state.institutionId],
  );
  const availablePatients = useMemo(
    () =>
      patients.filter((patient) => {
        if (
          state.institutionId &&
          patient.institutionId !== state.institutionId
        ) {
          return false;
        }
        if (state.doctorId && patient.doctorId !== state.doctorId) {
          return false;
        }
        return true;
      }),
    [patients, state.doctorId, state.institutionId],
  );

  const institutionOptions = institutions.map((institution) => ({
    value: institution.id,
    label: `${institution.name} (${institution.id})`,
  }));
  const doctorOptions = availableDoctors.map((doctor) => ({
    value: doctor.id,
    label: `${doctor.fullName} (${doctor.id})`,
  }));
  const patientOptions = availablePatients.map((patient) => ({
    value: patient.id,
    label: `${patient.fullName} (${patient.id})`,
  }));
  const canReplace =
    mode === "create" ? false : Boolean(detail?.record.canReplace);
  const canUpdate =
    mode === "create" ? false : Boolean(detail?.record.canUpdate);
  const canDelete =
    mode === "create" ? false : Boolean(detail?.record.canDelete);
  const directCreateMustUseFormRole =
    adminContext.role === "institution_operator" ||
    adminContext.role === "institution_laboratory_staff";
  const shouldBlockDirectCreateForArea = (targetAreaKey: TwoPQAreaKey) =>
    directCreateMustUseFormRole &&
    FORM_REQUESTED_DIRECT_CREATE_AREAS.has(targetAreaKey);
  const directCreateRequiresForm =
    mode === "create" && shouldBlockDirectCreateForArea(areaKey);
  const batchArea = translateTwoPQAreaConfig(
    getTwoPQAreaConfig("sequencing")!,
    language,
  );
  const caseArea = translateTwoPQAreaConfig(
    getTwoPQAreaConfig("cases")!,
    language,
  );
  const samplingArea = translateTwoPQAreaConfig(
    getTwoPQAreaConfig("sampling")!,
    language,
  );
  const autoSamplingProcessingOptions =
    samplingArea.fieldGroups
      .flatMap((group) => group.fields)
      .find((field) => field.key === "processingStatus")?.options ?? [];
  const multiSamplingEditableFields = useMemo(
    () =>
      samplingArea.fieldGroups
        .flatMap((group) => group.fields)
        .filter(
          (
            field,
          ): field is TwoPQFieldConfig & {
            key: MultiSamplingEditableFieldKey;
          } =>
            MULTI_SAMPLING_EDITABLE_FIELD_SET.has(
              field.key as MultiSamplingEditableFieldKey,
            ),
        ),
    [samplingArea.fieldGroups],
  );
  const multiSamplingFieldLabelByKey = useMemo(
    () =>
      Object.fromEntries(
        multiSamplingEditableFields.map((field) => [field.key, field.label]),
      ) as Record<MultiSamplingEditableFieldKey, string>,
    [multiSamplingEditableFields],
  );
  const normalizedThreeLetterCode =
    normalizeThreeLetterCodeInput(threeLetterCode);
  const expectedCaseLabelFromThreeLetterCode =
    buildExpectedCaseLabelFromThreeLetterCode(normalizedThreeLetterCode);
  const hasThreeLetterCode = normalizedThreeLetterCode.length === 3;
  const fileStorageSnapshotFileName =
    buildExpectedCaseLabelFromThreeLetterCode(normalizedThreeLetterCode) ||
    detail?.record.caseLabel?.trim() ||
    detail?.record.id ||
    "";
  const hasCaseLabelMismatchWarning =
    areaKey === "cases" &&
    mode !== "create" &&
    hasThreeLetterCode &&
    Boolean(expectedCaseLabelFromThreeLetterCode) &&
    state.caseLabel.trim() !== expectedCaseLabelFromThreeLetterCode;
  const normalizedThreeLetterCodeDraft =
    normalizeThreeLetterCodeInput(threeLetterCodeDraft);
  const canConfirmThreeLetterCode =
    threeLetterCodeModal === "remove"
      ? hasThreeLetterCode
      : normalizedThreeLetterCodeDraft.length === 3;
  const autoSamplingPreviewItems = useMemo(
    () =>
      buildAutoSamplingPreviewItems(
        normalizedThreeLetterCode,
        autoSamplingCopies,
      ),
    [autoSamplingCopies, normalizedThreeLetterCode],
  );
  const autoSamplingInventoryQuery = useQuery({
    queryKey: ["2pq-auto-sampling-records"],
    queryFn: () => sdkFetch<{ records: TwoPQListItem[] }>("/2pq/sampling"),
    enabled:
      areaKey === "cases" &&
      mode !== "create" &&
      hasThreeLetterCode &&
      (isAutoSamplingSetupOpen || Boolean(autoSamplingProcess)),
    staleTime: 30_000,
  });
  const existingSamplingSampleIds = useMemo(
    () =>
      new Set(
        (autoSamplingInventoryQuery.data?.records ?? [])
          .map((record) => record.sampleId?.trim().toUpperCase())
          .filter((sampleId): sampleId is string => Boolean(sampleId)),
      ),
    [autoSamplingInventoryQuery.data?.records],
  );
  const autoSamplingConflictingCodes = useMemo(
    () =>
      autoSamplingPreviewItems
        .filter((item) => existingSamplingSampleIds.has(item.sixCharacterCode))
        .map((item) => item.sixCharacterCode),
    [autoSamplingPreviewItems, existingSamplingSampleIds],
  );
  const multiSamplingEditPatch = useMemo(
    () => buildMultiSamplingEditPatch(multiSamplingEditForm),
    [multiSamplingEditForm],
  );
  const multiSamplingEditPatchEntries = useMemo(
    () =>
      Object.entries(multiSamplingEditPatch) as [
        MultiSamplingEditableFieldKey,
        string,
      ][],
    [multiSamplingEditPatch],
  );
  const multiSamplingEditSelectedFieldLabels = useMemo(
    () =>
      multiSamplingEditPatchEntries.map(
        ([key]) => multiSamplingFieldLabelByKey[key] ?? key,
      ),
    [multiSamplingEditPatchEntries, multiSamplingFieldLabelByKey],
  );
  const canGenerateAutoSampling =
    Boolean(detail?.record.canUpdate) &&
    isAutoSamplingFormComplete(autoSamplingConfig) &&
    autoSamplingConflictingCodes.length === 0 &&
    !autoSamplingInventoryQuery.isFetching &&
    !autoSamplingInventoryQuery.isError &&
    !autoSamplingProcess;
  const autoSamplingSuccessfulCount =
    autoSamplingProcess?.items.filter((item) => item.status === "success")
      .length ?? 0;
  const autoSamplingErroredCount =
    autoSamplingProcess?.items.filter((item) => item.status === "error")
      .length ?? 0;
  const autoSamplingPendingCount =
    autoSamplingProcess?.items.filter((item) => item.status === "pending")
      .length ?? 0;
  const autoSamplingProgressPercent = autoSamplingProcess
    ? autoSamplingProcess.status === "success"
      ? 100
      : autoSamplingProcess.status === "validating"
        ? 96
        : Math.max(
            4,
            Math.round(
              (autoSamplingSuccessfulCount /
                Math.max(autoSamplingProcess.items.length, 1)) *
                100,
            ),
          )
    : 0;
  const linkedBatch =
    mode === "create" ? draftBatch : (detail?.linkedBatch ?? null);
  const linkedCase =
    mode === "create" ? draftCase : (detail?.linkedCase ?? null);
  const linkedCases = detail?.linkedCases ?? [];
  const linkedSamplings = detail?.linkedSamplings ?? [];
  const caseDeleteCompletedStepCount =
    caseDeleteProcess?.steps.filter((step) => step.status === "success")
      .length ?? 0;
  const caseDeleteProgressPercent = caseDeleteProcess
    ? caseDeleteProcess.status === "success"
      ? 100
      : Math.max(
          8,
          Math.round(
            (caseDeleteCompletedStepCount / caseDeleteProcess.steps.length) *
              100,
          ),
        )
    : 0;
  const storedFileId = detail?.record.stored_file_id?.trim() ?? "";
  const hasStoredFileId = Boolean(storedFileId);
  const hasFileStorageAccess = adminContext.role === "full_admin";
  const canOpenPublishFileStorageModal =
    areaKey === "cases" &&
    mode !== "create" &&
    hasThreeLetterCode &&
    Boolean(detail);
  const canOpenPublishReportCodeModal =
    areaKey === "cases" &&
    mode !== "create" &&
    hasThreeLetterCode &&
    hasStoredFileId &&
    Boolean(detail);
  const canPublishCaseToFileStorage =
    canOpenPublishFileStorageModal &&
    hasFileStorageAccess &&
    Boolean(detail?.record.canUpdate);
  const storedFileDocumentQuery = useQuery({
    queryKey: ["2pq-case-stored-file", storedFileId],
    queryFn: async () => {
      try {
        return (
          await sdkFetch<{ document: StoredFileDocumentRecord }>(
            `/file-storage/${storedFileId}`,
          )
        ).document;
      } catch (error) {
        if (error instanceof SdkRequestError && error.status === 404) {
          return null;
        }

        throw error;
      }
    },
    enabled: canOpenPublishReportCodeModal && hasFileStorageAccess,
    staleTime: 30_000,
  });
  const reportCodeStatusQuery = useQuery({
    queryKey: [
      "2pq-case-report-code-status",
      expectedCaseLabelFromThreeLetterCode,
    ],
    queryFn: async () => {
      try {
        return (
          await sdkFetch<{ report: ReportCodeStatusRecord }>(
            `/reports/${expectedCaseLabelFromThreeLetterCode}`,
          )
        ).report;
      } catch (error) {
        if (error instanceof SdkRequestError && error.status === 404) {
          return null;
        }

        throw error;
      }
    },
    enabled:
      canOpenPublishReportCodeModal &&
      hasFileStorageAccess &&
      Boolean(expectedCaseLabelFromThreeLetterCode),
    staleTime: 30_000,
  });
  const storedFileDocument = storedFileDocumentQuery.data ?? null;
  const storedFileLinkedReportCode =
    resolveStoredFileLinkedReportCode(storedFileDocument);
  const storedFileLastModifiedDate =
    getTrimmedUnknownString(storedFileDocument?.data.last_modified_date) ??
    getTrimmedUnknownString(storedFileDocument?.data.creation_date) ??
    "";
  const caseLastUpdatedDate =
    detail?.record.last_updated_date?.trim() ??
    detail?.record.updatedAt?.trim() ??
    "";
  const caseLastUpdatedTimestamp = toTimestampOrNull(caseLastUpdatedDate);
  const storedFileLastModifiedTimestamp = toTimestampOrNull(
    storedFileLastModifiedDate,
  );
  const isStoredFileSnapshotStale =
    hasStoredFileId &&
    storedFileDocumentQuery.isSuccess &&
    Boolean(storedFileDocument) &&
    caseLastUpdatedTimestamp !== null &&
    storedFileLastModifiedTimestamp !== null &&
    caseLastUpdatedTimestamp - storedFileLastModifiedTimestamp >
      STORED_FILE_FRESHNESS_TOLERANCE_MS;
  const reportCodeStatus = reportCodeStatusQuery.data ?? null;
  const reportCodeLinkedFileId = reportCodeStatus?.linkedFileId?.trim() ?? "";
  const isStoredFileDocumentMissing =
    canOpenPublishReportCodeModal &&
    hasFileStorageAccess &&
    storedFileDocumentQuery.isSuccess &&
    !storedFileDocument;
  const hasStoredFileReportCodeConflict =
    Boolean(storedFileLinkedReportCode) &&
    storedFileLinkedReportCode !== expectedCaseLabelFromThreeLetterCode;
  const hasReportCodeFileConflict =
    Boolean(reportCodeLinkedFileId) && reportCodeLinkedFileId !== storedFileId;
  const reportCodeOwnerId = reportCodeStatus?.userId?.trim() ?? "";
  const hasReportCodeOwnershipConflict =
    Boolean(reportCodeOwnerId) && reportCodeOwnerId !== adminContext.uid;
  const reportCodePublishConflictMessage = hasStoredFileReportCodeConflict
    ? `This stored file is already linked to report code ${storedFileLinkedReportCode}.`
    : hasReportCodeFileConflict
      ? `Report code ${expectedCaseLabelFromThreeLetterCode} already points to stored file ${reportCodeLinkedFileId}.`
      : hasReportCodeOwnershipConflict
        ? `Report code ${expectedCaseLabelFromThreeLetterCode} already belongs to another owner (${reportCodeOwnerId}).`
        : null;
  const isReportCodeStatusLoading =
    storedFileDocumentQuery.isLoading || reportCodeStatusQuery.isLoading;
  const isPublishedAsReportCode =
    Boolean(reportCodeStatus) &&
    reportCodeLinkedFileId === storedFileId &&
    !hasReportCodeOwnershipConflict;
  const canPublishAsReportCode =
    canOpenPublishReportCodeModal &&
    hasFileStorageAccess &&
    Boolean(detail?.record.canUpdate) &&
    !pendingPublishReportCode &&
    !isStoredFileDocumentMissing &&
    !isReportCodeStatusLoading &&
    !storedFileDocumentQuery.isError &&
    !reportCodeStatusQuery.isError &&
    !reportCodePublishConflictMessage &&
    !isPublishedAsReportCode;
  const formattedCaseLastUpdatedDate =
    formatDateTimeWithSeconds(caseLastUpdatedDate) ?? t("Not available");
  const formattedStoredFileLastModifiedDate = formatDateTimeWithSeconds(
    storedFileLastModifiedDate,
  );
  const fileStoragePrimaryActionLabel = hasStoredFileId
    ? t("Update in File Storage")
    : t("Publish to File Storage");

  useEffect(() => {
    if (isPublishedAsReportCode) {
      setIsReportCodeSectionExpanded(false);
    }
  }, [isPublishedAsReportCode]);
  const canApplyMultiSamplingEdit =
    Boolean(detail?.record.canUpdate) &&
    linkedSamplings.length > 0 &&
    multiSamplingEditPatchEntries.length > 0 &&
    !multiSamplingEditProcess;
  const multiSamplingEditSuccessfulCount =
    multiSamplingEditProcess?.items.filter((item) => item.status === "success")
      .length ?? 0;
  const multiSamplingEditErroredCount =
    multiSamplingEditProcess?.items.filter((item) => item.status === "error")
      .length ?? 0;
  const multiSamplingEditPendingCount =
    multiSamplingEditProcess?.items.filter((item) => item.status === "pending")
      .length ?? 0;
  const multiSamplingEditProgressPercent = multiSamplingEditProcess
    ? multiSamplingEditProcess.status === "success"
      ? 100
      : multiSamplingEditProcess.status === "validating"
        ? 96
        : Math.max(
            4,
            Math.round(
              (multiSamplingEditSuccessfulCount /
                Math.max(multiSamplingEditProcess.items.length, 1)) *
                100,
            ),
          )
    : 0;
  const loadBatchCandidates = relationDialog === "case-parent-batch";
  const loadCaseCandidates =
    relationDialog === "sampling-parent-case" ||
    relationDialog === "sequencing-child-case";
  const loadSamplingCandidates = relationDialog === "case-child-sampling";
  const batchesQuery = useQuery({
    queryKey: ["2pq-relation-records", "sequencing"],
    queryFn: () => sdkFetch<{ records: TwoPQListItem[] }>("/2pq/sequencing"),
    enabled: loadBatchCandidates,
    staleTime: 30_000,
  });
  const casesQuery = useQuery({
    queryKey: ["2pq-relation-records", "cases"],
    queryFn: () => sdkFetch<{ records: TwoPQListItem[] }>("/2pq/cases"),
    enabled: loadCaseCandidates,
    staleTime: 30_000,
  });
  const samplingsQuery = useQuery({
    queryKey: ["2pq-relation-records", "sampling"],
    queryFn: () => sdkFetch<{ records: TwoPQListItem[] }>("/2pq/sampling"),
    enabled: loadSamplingCandidates,
    staleTime: 30_000,
  });

  const linkedCaseIds = useMemo(
    () => new Set(linkedCases.map((record) => record.id)),
    [linkedCases],
  );
  const linkedSamplingIds = useMemo(
    () => new Set(linkedSamplings.map((record) => record.id)),
    [linkedSamplings],
  );
  const batchCandidates = useMemo(
    () =>
      (batchesQuery.data?.records ?? []).filter(
        (record) => record.id !== linkedBatch?.id,
      ),
    [batchesQuery.data?.records, linkedBatch?.id],
  );
  const sequencingCaseCandidates = useMemo(
    () =>
      (casesQuery.data?.records ?? []).filter(
        (record) => !linkedCaseIds.has(record.id),
      ),
    [casesQuery.data?.records, linkedCaseIds],
  );
  const parentCaseCandidates = useMemo(
    () =>
      (casesQuery.data?.records ?? []).filter(
        (record) => record.id !== linkedCase?.id,
      ),
    [casesQuery.data?.records, linkedCase?.id],
  );
  const samplingCandidates = useMemo(
    () =>
      (samplingsQuery.data?.records ?? []).filter(
        (record) => !linkedSamplingIds.has(record.id),
      ),
    [linkedSamplingIds, samplingsQuery.data?.records],
  );
  const sequencingCaseNotes = useMemo(
    () =>
      Object.fromEntries(
        sequencingCaseCandidates.map((record) => [
          record.id,
          record.parent_batch && record.parent_batch !== detail?.record.id
            ? `${t("Currently linked to batch")} ${record.parent_batch}. ${t("Linking here will move it.")}`
            : t("This case will become a child of the current batch."),
        ]),
      ),
    [detail?.record.id, language, sequencingCaseCandidates],
  );
  const samplingNotes = useMemo(
    () =>
      Object.fromEntries(
        samplingCandidates.map((record) => [
          record.id,
          record.parent_case && record.parent_case !== detail?.record.id
            ? `${t("Currently linked to case")} ${record.parent_case}. ${t("Linking here will move it.")}`
            : t(
                "This sampling record will become a child of the current case.",
              ),
        ]),
      ),
    [detail?.record.id, language, samplingCandidates],
  );

  function buildPayload(keys: TwoPQMutableFieldKey[]) {
    return keys.reduce<Record<string, string>>((payload, key) => {
      payload[key] = state[key];
      return payload;
    }, {});
  }

  function validateRequiredFields() {
    for (const group of area.fieldGroups) {
      for (const field of group.fields) {
        if (field.required && !state[field.key].trim()) {
          setToast({
            id: Date.now(),
            tone: "error",
            message: `${field.label} is required.`,
          });
          return false;
        }
      }
    }

    return true;
  }

  function pushToast(
    tone: ActionToastState["tone"],
    message: string,
    options?: {
      details?: string;
      durationMs?: number;
    },
  ) {
    setToast({
      id: Date.now(),
      tone,
      message,
      details: options?.details,
      durationMs: options?.durationMs,
    });
  }

  function getErrorPresentation(error: unknown, fallbackMessage: string) {
    if (error instanceof SdkRequestError) {
      return {
        message: `${fallbackMessage} ${error.message}`.trim(),
        details: error.details,
      };
    }

    if (error instanceof Error) {
      const details = `${error.name}: ${error.message}`;
      return {
        message: `${fallbackMessage} ${error.message}`.trim(),
        details,
      };
    }

    return {
      message: fallbackMessage,
      details: fallbackMessage,
    };
  }

  function pushErrorToast(
    error: unknown,
    fallbackMessage: string,
    title = t("Request log"),
  ) {
    const presentation = getErrorPresentation(error, fallbackMessage);
    setLatestErrorLog({
      title,
      details: presentation.details,
    });
    setCopiedErrorLog(false);
    pushToast("error", presentation.message, {
      details: presentation.details,
      durationMs: 20_000,
    });
  }

  function handleErrorLogOpen() {
    const details = toast?.details;
    if (!details) {
      return;
    }

    setCopiedErrorLog(false);
    setLatestErrorLog(
      (current) => current ?? { title: t("Request log"), details },
    );
    setIsErrorLogOpen(true);
  }

  function updateCaseDeleteProcessStep(
    stepKey: CaseDeleteProcessStepKey,
    status: CaseDeleteProcessStepStatus,
  ) {
    setCaseDeleteProcess((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step) =>
              step.key === stepKey ? { ...step, status } : step,
            ),
          }
        : current,
    );
  }

  function updateCaseDeleteProcessSteps(
    statuses: Partial<
      Record<CaseDeleteProcessStepKey, CaseDeleteProcessStepStatus>
    >,
  ) {
    setCaseDeleteProcess((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step) => ({
              ...step,
              status: statuses[step.key] ?? step.status,
            })),
          }
        : current,
    );
  }

  function getCaseDeleteProcessStepCopy(stepKey: CaseDeleteProcessStepKey) {
    switch (stepKey) {
      case "validate":
        return {
          title: t("Validate case and linked biopsies"),
          description: t(
            "Checking permissions and every biopsy currently linked to this case.",
          ),
        };
      case "delete-samplings":
        return {
          title: t("Delete associated biopsies"),
          description: t(
            "Removing the biopsy records selected for full deletion.",
          ),
        };
      case "delete-case":
        return {
          title: t("Delete case record"),
          description: t(
            "Removing the case document after the biopsy decision is applied.",
          ),
        };
      case "refresh":
        return {
          title: t("Refresh case list"),
          description: t("Preparing the updated case list after deletion."),
        };
    }
  }

  function openCaseDeleteProcessErrorLog() {
    if (!caseDeleteProcess?.errorDetails) {
      return;
    }

    setLatestErrorLog({
      title: caseDeleteProcess.errorTitle ?? t("Case deletion error"),
      details: caseDeleteProcess.errorDetails,
    });
    setCopiedErrorLog(false);
    setIsErrorLogOpen(true);
  }

  function handleCaseDeleteProcessExit() {
    setCaseDeleteProcess(null);
    router.push(area.route);
    router.refresh();
  }

  async function handleCopyErrorLog() {
    if (!latestErrorLog?.details) {
      return;
    }

    try {
      await navigator.clipboard.writeText(latestErrorLog.details);
      setCopiedErrorLog(true);
    } catch {
      pushToast("error", t("Unable to copy the error log."), {
        durationMs: 7000,
      });
    }
  }

  function openThreeLetterCodeModal(mode: ThreeLetterCodeModalMode) {
    if (mode === "manual") {
      setThreeLetterCodeDraft(normalizedThreeLetterCode);
    } else if (mode === "random") {
      setThreeLetterCodeDraft(
        generateRandomThreeLetterCode(normalizedThreeLetterCode),
      );
    } else {
      setThreeLetterCodeDraft(normalizedThreeLetterCode);
    }

    setThreeLetterCodeModal(mode);
  }

  function closeThreeLetterCodeModal(force = false) {
    if (pendingThreeLetterCodeAction && !force) {
      return;
    }

    setThreeLetterCodeModal(null);
    setThreeLetterCodeDraft("");
  }

  function regenerateThreeLetterCodeDraft() {
    setThreeLetterCodeDraft(
      generateRandomThreeLetterCode(
        normalizedThreeLetterCodeDraft || normalizedThreeLetterCode,
      ),
    );
  }

  async function handleThreeLetterCodeConfirm() {
    if (!threeLetterCodeModal || !canConfirmThreeLetterCode) {
      return;
    }

    const nextThreeLetterCode =
      threeLetterCodeModal === "remove" ? "" : normalizedThreeLetterCodeDraft;
    const nextCaseLabel = nextThreeLetterCode
      ? buildExpectedCaseLabelFromThreeLetterCode(nextThreeLetterCode)
      : "";

    if (mode === "create" && areaKey === "cases") {
      setThreeLetterCode(nextThreeLetterCode);
      if (nextCaseLabel) {
        setState((current) => ({
          ...current,
          caseLabel: nextCaseLabel,
        }));
      }
      closeThreeLetterCodeModal(true);
      pushToast(
        "success",
        threeLetterCodeModal === "remove"
          ? t("Three letter code removed from the draft case.")
          : hasThreeLetterCode
            ? t("Three letter code updated for the draft case.")
            : t("Three letter code saved for the draft case."),
      );
      return;
    }

    if (!detail) {
      return;
    }

    setPendingThreeLetterCodeAction(true);
    try {
      await sdkFetch<{ record: TwoPQRecord }>(
        `/2pq/${area.key}/${detail.record.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            three_letter_code: nextThreeLetterCode,
            ...(nextCaseLabel ? { caseLabel: nextCaseLabel } : {}),
          }),
        },
      );

      setThreeLetterCode(nextThreeLetterCode);
      if (nextCaseLabel) {
        setState((current) => ({
          ...current,
          caseLabel: nextCaseLabel,
        }));
      }
      closeThreeLetterCodeModal(true);
      pushToast(
        "success",
        threeLetterCodeModal === "remove"
          ? t("Three letter code removed.")
          : hasThreeLetterCode
            ? t("Three letter code updated.")
            : t("Three letter code saved."),
      );
      router.refresh();
    } catch (error) {
      pushErrorToast(
        error,
        threeLetterCodeModal === "remove"
          ? t("Unable to remove the three letter code.")
          : t("Unable to save the three letter code."),
        t("Three letter code request"),
      );
    } finally {
      setPendingThreeLetterCodeAction(false);
    }
  }

  function openAutoSamplingSetupModal() {
    if (!detail) {
      return;
    }

    setAutoSamplingConfig({
      caseLabel: detail.record.caseLabel ?? "",
      sampleType: "",
      processingStatus:
        autoSamplingProcessingOptions[0]?.value ?? "awaiting_reception",
      collectionDate: "",
      receptionDate: "",
      runId: "",
      qcStatus: "",
      notes: "",
    });
    setAutoSamplingCopies(AUTO_SAMPLING_MIN_COPIES);
    setIsAutoSamplingSetupOpen(true);
  }

  function closeAutoSamplingSetupModal() {
    setIsAutoSamplingSetupOpen(false);
  }

  function openMultiSamplingEditModal() {
    setMultiSamplingEditForm(buildInitialMultiSamplingEditFormState());
    setIsMultiSamplingEditOpen(true);
  }

  function closeMultiSamplingEditModal() {
    setIsMultiSamplingEditOpen(false);
  }

  function closePublishFileStorageModal(force = false) {
    if (publishFileStorageModal?.status === "publishing" && !force) {
      return;
    }

    publishFileStorageRequestIdRef.current += 1;
    setPublishFileStorageModal(null);
    setIsPublishFileStoragePreviewExpanded(false);
  }

  function openPublishReportCodeModal() {
    if (!canOpenPublishReportCodeModal) {
      return;
    }

    setIsPublishReportCodeModalOpen(true);
  }

  function closePublishReportCodeModal(force = false) {
    if (pendingPublishReportCode && !force) {
      return;
    }

    setIsPublishReportCodeModalOpen(false);
  }

  async function openPublishFileStorageModal(options?: {
    mode?: FileStorageModalMode;
    autoSubmit?: boolean;
  }) {
    if (
      !detail ||
      !canOpenPublishFileStorageModal ||
      !fileStorageSnapshotFileName
    ) {
      return;
    }

    const mode = options?.mode ?? (hasStoredFileId ? "update" : "publish");
    const autoSubmit = options?.autoSubmit ?? false;
    const requestId = publishFileStorageRequestIdRef.current + 1;
    publishFileStorageRequestIdRef.current = requestId;
    setIsPublishFileStoragePreviewExpanded(false);
    setPublishFileStorageModal({
      mode,
      status: "loading",
      fileName: fileStorageSnapshotFileName,
      snapshot: null,
      preview: "",
      autoSubmit,
    });

    try {
      const siblingCases =
        detail.record.parent_batch || linkedBatch?.id
          ? (
              await sdkFetch<{ records: TwoPQListItem[] }>("/2pq/cases")
            ).records.filter(
              (record) =>
                record.parent_batch ===
                  (detail.record.parent_batch ?? linkedBatch?.id) &&
                record.id !== detail.record.id,
            )
          : [];
      const snapshot = buildTwoPQFileStorageSnapshot({
        currentCase: detail.record,
        linkedBatch,
        linkedSamplings,
        siblingCases,
      });
      const preview = JSON.stringify(snapshot, null, 2);

      if (publishFileStorageRequestIdRef.current !== requestId) {
        return;
      }

      setPublishFileStorageModal({
        mode,
        status: "ready",
        fileName: fileStorageSnapshotFileName,
        snapshot,
        preview,
        autoSubmit,
      });
    } catch (error) {
      if (publishFileStorageRequestIdRef.current !== requestId) {
        return;
      }
      setPublishFileStorageModal(null);
      pushErrorToast(
        error,
        t("Unable to prepare the file-storage snapshot preview."),
        t("Prepare file-storage snapshot"),
      );
    }
  }

  async function handlePublishToFileStorage(
    modalStateOverride?: PublishFileStorageModalState,
  ) {
    const modalState = modalStateOverride ?? publishFileStorageModal;
    if (!detail || !modalState?.snapshot || !modalState.preview) {
      return;
    }

    setPublishFileStorageModal({
      ...modalState,
      status: "publishing",
      autoSubmit: false,
    });

    try {
      const timestamp = new Date().toISOString();
      if (modalState.mode === "update") {
        if (!storedFileId) {
          throw new Error("No stored_file_id is linked to this case.");
        }

        await sdkFetch<{ document: { id: string } }>(
          `/file-storage/${storedFileId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              data: {
                file_name: modalState.fileName,
                creator_email: adminContext.email,
                file_type: "2pq",
                file_content: modalState.preview,
                last_modified_date: timestamp,
              },
            }),
          },
        );

        await storedFileDocumentQuery.refetch();
      } else {
        const createResponse = await sdkFetch<{ document: { id: string } }>(
          "/file-storage",
          {
            method: "POST",
            body: JSON.stringify({
              data: {
                file_name: modalState.fileName,
                creator_email: adminContext.email,
                linked_report_id: null,
                file_type: "2pq",
                file_content: modalState.preview,
                creation_date: timestamp,
                last_modified_date: timestamp,
              },
            }),
          },
        );

        await sdkFetch<{ record: TwoPQRecord }>(
          `/2pq/cases/${detail.record.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              stored_file_id: createResponse.document.id,
            }),
          },
        );
      }

      closePublishFileStorageModal(true);
      pushToast(
        "success",
        modalState.mode === "update"
          ? `Case snapshot updated in file storage as ${modalState.fileName}.`
          : `Case snapshot published to file storage as ${modalState.fileName}.`,
      );
      router.refresh();
    } catch (error) {
      setPublishFileStorageModal({
        ...modalState,
        status: "ready",
        autoSubmit: false,
      });
      pushErrorToast(
        error,
        modalState.mode === "update"
          ? t("Unable to update this case snapshot in file storage.")
          : t("Unable to publish this case snapshot to file storage."),
        modalState.mode === "update"
          ? t("Update in File Storage")
          : t("Publish to File Storage"),
      );
    }
  }

  useEffect(() => {
    if (
      !publishFileStorageModal ||
      publishFileStorageModal.status !== "ready" ||
      !publishFileStorageModal.autoSubmit
    ) {
      return;
    }

    const modalState = publishFileStorageModal;
    setPublishFileStorageModal({
      ...modalState,
      autoSubmit: false,
    });
    void handlePublishToFileStorage({
      ...modalState,
      autoSubmit: false,
    });
  }, [publishFileStorageModal]);

  async function handlePublishAsReportCode() {
    if (!detail || !storedFileId || !expectedCaseLabelFromThreeLetterCode) {
      return;
    }

    setPendingPublishReportCode(true);

    try {
      const response = await sdkFetch<PublishReportCodeResult>(
        "/reports/publish-from-file-storage",
        {
          method: "POST",
          body: JSON.stringify({
            fileId: storedFileId,
            reportCode: expectedCaseLabelFromThreeLetterCode,
          }),
        },
      );

      closePublishReportCodeModal(true);
      pushToast(
        "success",
        response.created
          ? `Report code ${response.reportCode} is now linked to the stored file.`
          : `Report code ${response.reportCode} was synchronized to the stored file.`,
      );
      await Promise.all([
        storedFileDocumentQuery.refetch(),
        reportCodeStatusQuery.refetch(),
      ]);
      router.refresh();
    } catch (error) {
      pushErrorToast(
        error,
        t("Unable to publish this stored file as a report code."),
        t("Publish as report code"),
      );
    } finally {
      setPendingPublishReportCode(false);
    }
  }

  function updateAutoSamplingConfig<Key extends keyof AutoSamplingFormState>(
    key: Key,
    value: AutoSamplingFormState[Key],
  ) {
    setAutoSamplingConfig((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleAutoSamplingCopiesChange(value: number) {
    setAutoSamplingCopies(clampAutoSamplingCopies(value));
  }

  function toggleMultiSamplingEditField(
    key: MultiSamplingEditableFieldKey,
    enabled: boolean,
  ) {
    setMultiSamplingEditForm((current) => ({
      ...current,
      [key]: {
        ...current[key],
        enabled,
      },
    }));
  }

  function updateMultiSamplingEditFieldValue(
    key: MultiSamplingEditableFieldKey,
    value: string,
  ) {
    setMultiSamplingEditForm((current) => ({
      ...current,
      [key]: {
        ...current[key],
        value,
      },
    }));
  }

  function openAutoSamplingProcessErrorLog() {
    if (!autoSamplingProcess?.errorDetails) {
      return;
    }

    setLatestErrorLog({
      title: autoSamplingProcess.errorTitle ?? "Auto sampling error",
      details: autoSamplingProcess.errorDetails,
    });
    setCopiedErrorLog(false);
    setIsErrorLogOpen(true);
  }

  function openMultiSamplingEditProcessErrorLog() {
    if (!multiSamplingEditProcess?.errorDetails) {
      return;
    }

    setLatestErrorLog({
      title: multiSamplingEditProcess.errorTitle ?? "Multi sampling edit error",
      details: multiSamplingEditProcess.errorDetails,
    });
    setCopiedErrorLog(false);
    setIsErrorLogOpen(true);
  }

  async function lookupSamplingBySampleId(sampleId: string) {
    const response = await sdkFetch<{ records: TwoPQListItem[] }>(
      `/2pq/sampling?query=${encodeURIComponent(sampleId)}`,
    );

    return response.records.find(
      (record) =>
        record.sampleId?.trim().toUpperCase() === sampleId.toUpperCase(),
    );
  }

  function buildAutoSamplingPayload(
    config: AutoSamplingFormState,
    sampleId: string,
  ) {
    if (!detail) {
      throw new Error("Case detail is required to generate linked samplings.");
    }

    const payload: Record<string, string> = {
      institutionId: detail.record.institutionId,
      doctorId: detail.record.doctorId,
      parent_case: detail.record.id,
      caseLabel: config.caseLabel.trim(),
      sampleId,
      sampleType: config.sampleType.trim(),
      processingStatus: config.processingStatus.trim(),
    };

    if (detail.record.patientId) {
      payload.patientId = detail.record.patientId;
    }
    if (config.collectionDate) {
      payload.collectionDate = config.collectionDate;
    }
    if (config.receptionDate) {
      payload.receptionDate = config.receptionDate;
    }
    if (config.runId.trim()) {
      payload.runId = config.runId.trim();
    }
    if (config.qcStatus.trim()) {
      payload.qcStatus = config.qcStatus.trim();
    }
    if (config.notes.trim()) {
      payload.notes = config.notes.trim();
    }

    return payload;
  }

  async function validateAutoSamplingProcess(items: AutoSamplingProcessItem[]) {
    if (!detail) {
      throw new Error("Case detail is required for validation.");
    }

    const caseDetail = await sdkFetch<TwoPQDetailRecord>(
      `/2pq/cases/${detail.record.id}`,
    );
    const linkedSamplingIds = new Set(
      caseDetail.linkedSamplings.map((record) => record.id),
    );

    for (const item of items) {
      if (!item.samplingRecordId) {
        throw new Error(
          `Sampling ${item.sixCharacterCode} is missing a created record id.`,
        );
      }

      const samplingDetail = await sdkFetch<TwoPQDetailRecord>(
        `/2pq/sampling/${item.samplingRecordId}`,
      );
      const linkedSampleId =
        samplingDetail.record.sampleId?.trim().toUpperCase() ?? "";

      if (linkedSampleId !== item.sixCharacterCode) {
        throw new Error(
          `Sampling ${item.sixCharacterCode} was created with sample ID ${linkedSampleId || "<empty>"}.`,
        );
      }

      if (samplingDetail.record.parent_case !== detail.record.id) {
        throw new Error(
          `Sampling ${item.sixCharacterCode} is linked to case ${samplingDetail.record.parent_case ?? "<none>"} instead of ${detail.record.id}.`,
        );
      }

      if (!linkedSamplingIds.has(item.samplingRecordId)) {
        throw new Error(
          `Current case ${detail.record.id} does not list sampling ${item.samplingRecordId} in linked samplings.`,
        );
      }
    }
  }

  async function finalizeAutoSamplingProcess(
    items: AutoSamplingProcessItem[],
    config: AutoSamplingFormState,
  ) {
    setAutoSamplingProcess({
      config,
      items,
      status: "validating",
      currentIndex: null,
    });

    try {
      await validateAutoSamplingProcess(items);
      await autoSamplingInventoryQuery.refetch();
      router.refresh();
      pushToast(
        "success",
        `${items.length} ${items.length === 1 ? t("sampling record created and linked.") : t("sampling records created and linked.")}`,
      );
      setAutoSamplingProcess({
        config,
        items,
        status: "success",
        currentIndex: null,
      });
    } catch (error) {
      const presentation = getErrorPresentation(
        error,
        t("Final validation failed."),
      );
      setAutoSamplingProcess({
        config,
        items,
        status: "paused",
        currentIndex: null,
        errorTitle: t("Auto sampling validation"),
        errorDetails: presentation.details,
      });
    }
  }

  async function runAutoSamplingProcess(
    items: AutoSamplingProcessItem[],
    config: AutoSamplingFormState,
    startIndex: number,
  ) {
    if (!detail) {
      return;
    }

    const nextItems = items.map((item) => ({ ...item }));

    for (let index = startIndex; index < nextItems.length; index += 1) {
      if (nextItems[index].status === "success") {
        continue;
      }

      nextItems[index] = {
        ...nextItems[index],
        attempts: nextItems[index].attempts + 1,
        status: "running",
        errorTitle: undefined,
        errorDetails: undefined,
      };
      setAutoSamplingProcess({
        config,
        items: [...nextItems],
        status: "running",
        currentIndex: index,
      });

      try {
        const existingSampling = await lookupSamplingBySampleId(
          nextItems[index].sixCharacterCode,
        );
        if (existingSampling) {
          if (existingSampling.parent_case !== detail.record.id) {
            throw new Error(
              `Sample ID ${nextItems[index].sixCharacterCode} is already used by sampling ${existingSampling.id}.`,
            );
          }

          nextItems[index] = {
            ...nextItems[index],
            status: "success",
            samplingRecordId: existingSampling.id,
          };
          setAutoSamplingProcess({
            config,
            items: [...nextItems],
            status: "running",
            currentIndex: index,
          });
          continue;
        }

        const response = await sdkFetch<{ record: TwoPQRecord }>(
          "/2pq/sampling",
          {
            method: "POST",
            body: JSON.stringify(
              buildAutoSamplingPayload(
                config,
                nextItems[index].sixCharacterCode,
              ),
            ),
          },
        );

        nextItems[index] = {
          ...nextItems[index],
          status: "success",
          samplingRecordId: response.record.id,
        };
        setAutoSamplingProcess({
          config,
          items: [...nextItems],
          status: "running",
          currentIndex: index,
        });
      } catch (error) {
        const presentation = getErrorPresentation(
          error,
          `${t("Unable to create sampling")} ${nextItems[index].sixCharacterCode}.`,
        );
        nextItems[index] = {
          ...nextItems[index],
          status: "error",
          errorTitle: `${t("Create")} ${nextItems[index].sixCharacterCode}`,
          errorDetails: presentation.details,
        };
        setAutoSamplingProcess({
          config,
          items: [...nextItems],
          status: "paused",
          currentIndex: index,
          errorTitle: `${t("Create")} ${nextItems[index].sixCharacterCode}`,
          errorDetails: presentation.details,
        });
        return;
      }
    }

    await finalizeAutoSamplingProcess(nextItems, config);
  }

  function handleStartAutoSamplingProcess() {
    if (!detail || !canGenerateAutoSampling) {
      return;
    }

    const config: AutoSamplingFormState = {
      caseLabel: autoSamplingConfig.caseLabel.trim(),
      sampleType: autoSamplingConfig.sampleType.trim(),
      processingStatus: autoSamplingConfig.processingStatus.trim(),
      collectionDate: autoSamplingConfig.collectionDate,
      receptionDate: autoSamplingConfig.receptionDate,
      runId: autoSamplingConfig.runId.trim(),
      qcStatus: autoSamplingConfig.qcStatus.trim(),
      notes: autoSamplingConfig.notes.trim(),
    };
    const items: AutoSamplingProcessItem[] = autoSamplingPreviewItems.map(
      (item) => ({
        ...item,
        attempts: 0,
        status: "pending",
      }),
    );

    setIsAutoSamplingSetupOpen(false);
    setAutoSamplingProcess({
      config,
      items,
      status: "running",
      currentIndex: 0,
    });
    void runAutoSamplingProcess(items, config, 0);
  }

  function handleRetryAutoSamplingProcess() {
    if (!autoSamplingProcess) {
      return;
    }

    if (autoSamplingProcess.currentIndex === null) {
      void finalizeAutoSamplingProcess(
        autoSamplingProcess.items.map((item) => ({ ...item })),
        autoSamplingProcess.config,
      );
      return;
    }

    void runAutoSamplingProcess(
      autoSamplingProcess.items.map((item) => ({ ...item })),
      autoSamplingProcess.config,
      autoSamplingProcess.currentIndex,
    );
  }

  async function validateMultiSamplingEditProcess(
    items: MultiSamplingEditProcessItem[],
    patch: Partial<Record<MultiSamplingEditableFieldKey, string>>,
  ) {
    if (!detail) {
      throw new Error("Case detail is required for validation.");
    }

    const patchEntries = Object.entries(patch) as [
      MultiSamplingEditableFieldKey,
      string,
    ][];
    const caseDetail = await sdkFetch<TwoPQDetailRecord>(
      `/2pq/cases/${detail.record.id}`,
    );
    const linkedSamplingIds = new Set(
      caseDetail.linkedSamplings.map((record) => record.id),
    );

    for (const item of items) {
      const samplingDetail = await sdkFetch<TwoPQDetailRecord>(
        `/2pq/sampling/${item.samplingRecordId}`,
      );

      if (samplingDetail.record.parent_case !== detail.record.id) {
        throw new Error(
          `Sampling ${item.sampleId} is linked to case ${samplingDetail.record.parent_case ?? "<none>"} instead of ${detail.record.id}.`,
        );
      }

      if (!linkedSamplingIds.has(item.samplingRecordId)) {
        throw new Error(
          `Current case ${detail.record.id} does not list sampling ${item.samplingRecordId} in linked samplings.`,
        );
      }

      for (const [fieldKey, nextValue] of patchEntries) {
        const currentValue = samplingDetail.record[fieldKey] ?? "";
        if (currentValue !== nextValue) {
          throw new Error(
            `Sampling ${item.sampleId} has ${multiSamplingFieldLabelByKey[fieldKey] ?? fieldKey} value ${currentValue || "<empty>"} instead of ${nextValue || "<empty>"}.`,
          );
        }
      }
    }
  }

  async function finalizeMultiSamplingEditProcess(
    items: MultiSamplingEditProcessItem[],
    patch: Partial<Record<MultiSamplingEditableFieldKey, string>>,
  ) {
    setMultiSamplingEditProcess({
      patch,
      items,
      status: "validating",
      currentIndex: null,
    });

    try {
      await validateMultiSamplingEditProcess(items, patch);
      router.refresh();
      pushToast(
        "success",
        `${items.length} ${items.length === 1 ? t("child sampling record updated.") : t("child sampling records updated.")}`,
      );
      setMultiSamplingEditProcess({
        patch,
        items,
        status: "success",
        currentIndex: null,
      });
    } catch (error) {
      const presentation = getErrorPresentation(
        error,
        t("Final validation failed."),
      );
      setMultiSamplingEditProcess({
        patch,
        items,
        status: "paused",
        currentIndex: null,
        errorTitle: t("Multi sampling edit validation"),
        errorDetails: presentation.details,
      });
    }
  }

  async function runMultiSamplingEditProcess(
    items: MultiSamplingEditProcessItem[],
    patch: Partial<Record<MultiSamplingEditableFieldKey, string>>,
    startIndex: number,
  ) {
    const nextItems = items.map((item) => ({ ...item }));

    for (let index = startIndex; index < nextItems.length; index += 1) {
      if (nextItems[index].status === "success") {
        continue;
      }

      nextItems[index] = {
        ...nextItems[index],
        attempts: nextItems[index].attempts + 1,
        status: "running",
        errorTitle: undefined,
        errorDetails: undefined,
      };
      setMultiSamplingEditProcess({
        patch,
        items: [...nextItems],
        status: "running",
        currentIndex: index,
      });

      try {
        await sdkFetch<{ record: TwoPQRecord }>(
          `/2pq/sampling/${nextItems[index].samplingRecordId}`,
          {
            method: "PATCH",
            body: JSON.stringify(patch),
          },
        );

        nextItems[index] = {
          ...nextItems[index],
          status: "success",
        };
        setMultiSamplingEditProcess({
          patch,
          items: [...nextItems],
          status: "running",
          currentIndex: index,
        });
      } catch (error) {
        const presentation = getErrorPresentation(
          error,
          `${t("Unable to update sampling")} ${nextItems[index].sampleId}.`,
        );
        nextItems[index] = {
          ...nextItems[index],
          status: "error",
          errorTitle: `${t("Update")} ${nextItems[index].sampleId}`,
          errorDetails: presentation.details,
        };
        setMultiSamplingEditProcess({
          patch,
          items: [...nextItems],
          status: "paused",
          currentIndex: index,
          errorTitle: `${t("Update")} ${nextItems[index].sampleId}`,
          errorDetails: presentation.details,
        });
        return;
      }
    }

    await finalizeMultiSamplingEditProcess(nextItems, patch);
  }

  function handleStartMultiSamplingEditProcess() {
    if (
      !detail ||
      !canApplyMultiSamplingEdit ||
      multiSamplingEditPatchEntries.length === 0
    ) {
      return;
    }

    const patch = { ...multiSamplingEditPatch };
    const items: MultiSamplingEditProcessItem[] = linkedSamplings.map(
      (record, index) => ({
        order: index + 1,
        samplingRecordId: record.id,
        sampleId: record.sampleId?.trim() || record.id,
        attempts: 0,
        status: "pending",
      }),
    );

    setIsMultiSamplingEditOpen(false);
    setMultiSamplingEditProcess({
      patch,
      items,
      status: "running",
      currentIndex: 0,
    });
    void runMultiSamplingEditProcess(items, patch, 0);
  }

  function handleRetryMultiSamplingEditProcess() {
    if (!multiSamplingEditProcess) {
      return;
    }

    if (multiSamplingEditProcess.currentIndex === null) {
      void finalizeMultiSamplingEditProcess(
        multiSamplingEditProcess.items.map((item) => ({ ...item })),
        multiSamplingEditProcess.patch,
      );
      return;
    }

    void runMultiSamplingEditProcess(
      multiSamplingEditProcess.items.map((item) => ({ ...item })),
      multiSamplingEditProcess.patch,
      multiSamplingEditProcess.currentIndex,
    );
  }

  function syncDraftScope(
    current: FormState,
    parent: Pick<TwoPQListItem, "institutionId" | "doctorId" | "patientId">,
    options?: { caseLabel?: string; patientId?: string },
  ) {
    const scopeChanged =
      current.institutionId !== parent.institutionId ||
      current.doctorId !== parent.doctorId;

    return {
      ...current,
      institutionId: parent.institutionId,
      doctorId: parent.doctorId,
      patientId:
        options?.patientId ??
        (scopeChanged ? (parent.patientId ?? "") : current.patientId),
      caseLabel: options?.caseLabel ?? current.caseLabel,
    };
  }

  function openRelationDialog(nextDialog: RelationDialogKey) {
    setRelationQuery("");
    setRelationDialog(nextDialog);
  }

  function handleRelationDialogChange(open: boolean) {
    if (open) {
      return;
    }

    setRelationDialog(null);
    setRelationQuery("");
  }

  async function performRelationRequest(
    recordId: string,
    request: () => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
    logTitle = t("Relation request log"),
  ) {
    setPendingRelationRecordId(recordId);
    try {
      await request();
      setRelationDialog(null);
      setRelationQuery("");
      pushToast("success", successMessage);
      router.refresh();
    } catch (error) {
      pushErrorToast(error, failureMessage, logTitle);
    } finally {
      setPendingRelationRecordId(null);
    }
  }

  async function performRelationPatch(
    targetAreaKey: TwoPQAreaKey,
    recordId: string,
    payload: Partial<Record<"parent_batch" | "parent_case", string>>,
    successMessage: string,
    failureMessage: string,
    logTitle = t("Relation update log"),
  ) {
    await performRelationRequest(
      recordId,
      () =>
        sdkFetch(`/2pq/${targetAreaKey}/${recordId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }),
      successMessage,
      failureMessage,
      logTitle,
    );
  }

  function handleDraftBatchSelection(record: TwoPQListItem) {
    setDraftBatch(record);
    setState((current) => syncDraftScope(current, record));
    setRelationDialog(null);
    setRelationQuery("");
    pushToast("success", t("Batch preloaded for the new case."));
  }

  function handleDraftCaseSelection(record: TwoPQListItem) {
    setDraftCase(record);
    setState((current) =>
      syncDraftScope(current, record, {
        caseLabel: record.caseLabel ?? current.caseLabel,
        patientId: record.patientId ?? "",
      }),
    );
    setRelationDialog(null);
    setRelationQuery("");
    pushToast("success", t("Case preloaded for the new sampling record."));
  }

  function handleClearDraftBatch() {
    setDraftBatch(null);
    pushToast("success", t("Batch removed from the draft case."));
  }

  function handleClearDraftCase() {
    setDraftCase(null);
    pushToast("success", t("Case removed from the draft sampling record."));
  }

  async function handleLinkBatchToCase(record: TwoPQListItem) {
    if (mode === "create") {
      handleDraftBatchSelection(record);
      return;
    }

    if (!detail) {
      return;
    }

    await performRelationPatch(
      "cases",
      detail.record.id,
      { parent_batch: record.id },
      t("Batch linked to case."),
      t("Unable to link the selected batch."),
      t("Link batch to case"),
    );
  }

  async function handleUnlinkBatchFromCase() {
    if (mode === "create") {
      handleClearDraftBatch();
      return;
    }

    if (!detail || !linkedBatch) {
      return;
    }

    await performRelationPatch(
      "cases",
      detail.record.id,
      { parent_batch: "" },
      t("Batch unlinked from case."),
      t("Unable to unlink the batch."),
      t("Unlink batch from case"),
    );
  }

  async function handleLinkCaseToSampling(record: TwoPQListItem) {
    if (mode === "create") {
      handleDraftCaseSelection(record);
      return;
    }

    if (!detail) {
      return;
    }

    await performRelationPatch(
      "sampling",
      detail.record.id,
      { parent_case: record.id },
      t("Case linked to sampling."),
      t("Unable to link the selected case."),
      t("Link case to sampling"),
    );
  }

  async function handleUnlinkCaseFromSampling() {
    if (mode === "create") {
      handleClearDraftCase();
      return;
    }

    if (!detail || !linkedCase) {
      return;
    }

    await performRelationPatch(
      "sampling",
      detail.record.id,
      { parent_case: "" },
      t("Case unlinked from sampling."),
      t("Unable to unlink the case."),
      t("Unlink case from sampling"),
    );
  }

  async function handleLinkExistingCase(record: TwoPQListItem) {
    if (!detail) {
      return;
    }

    await performRelationPatch(
      "cases",
      record.id,
      { parent_batch: detail.record.id },
      t("Case linked to batch."),
      t("Unable to link the selected case."),
      t("Link case to batch"),
    );
  }

  async function handleUnlinkExistingCase(record: TwoPQListItem) {
    if (!detail) {
      return;
    }

    await performRelationPatch(
      "cases",
      record.id,
      { parent_batch: "" },
      t("Case unlinked from batch."),
      t("Unable to unlink the case."),
      t("Unlink case from batch"),
    );
  }

  async function handleLinkExistingSampling(record: TwoPQListItem) {
    if (!detail) {
      return;
    }

    await performRelationPatch(
      "sampling",
      record.id,
      { parent_case: detail.record.id },
      t("Sampling linked to case."),
      t("Unable to link the selected sampling."),
      t("Link sampling to case"),
    );
  }

  async function handleUnlinkExistingSampling(record: TwoPQListItem) {
    if (!detail) {
      return;
    }

    await performRelationPatch(
      "sampling",
      record.id,
      { parent_case: "" },
      t("Sampling unlinked from case."),
      t("Unable to unlink the sampling."),
      t("Unlink sampling from case"),
    );
  }

  function showDirectCreateRequiresFormAlert() {
    setFormRequestedWarningOpen(true);
  }

  async function handleCreate() {
    if (directCreateRequiresForm) {
      showDirectCreateRequiresFormAlert();
      return;
    }

    if (!validateRequiredFields()) {
      return;
    }

    setPendingAction("create");
    try {
      const payload = buildPayload(getFieldKeys(areaKey));
      if (areaKey === "cases" && draftBatch?.id) {
        payload.parent_batch = draftBatch.id;
      }
      if (areaKey === "cases" && normalizedThreeLetterCode) {
        payload.three_letter_code = normalizedThreeLetterCode;
      }
      if (areaKey === "sampling" && draftCase?.id) {
        payload.parent_case = draftCase.id;
      }

      const response = await sdkFetch<{ record: TwoPQRecord }>(
        `/2pq/${area.key}`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setCreatedRecordId(response.record.id);
      pushToast("success", `${area.label} ${t("record created.")}`);
    } catch (error) {
      setCreatedRecordId(null);
      pushErrorToast(
        error,
        `${t("Unable to create")} ${area.label.toLowerCase()} ${t("record.")}`,
        `${t("Create")} ${area.label} ${t("record")}`,
      );
      setPendingAction(null);
    }
  }

  function handleContinue() {
    if (!createdRecordId) {
      return;
    }

    router.push(
      `${area.route}?createdId=${encodeURIComponent(createdRecordId)}`,
    );
  }

  async function handleReplace() {
    if (!detail || !validateRequiredFields()) {
      return;
    }

    setPendingAction("replace");
    try {
      await sdkFetch<{ record: TwoPQRecord }>(
        `/2pq/${area.key}/${detail.record.id}`,
        {
          method: "PUT",
          body: JSON.stringify(buildPayload(getFieldKeys(areaKey))),
        },
      );
      pushToast("success", `${area.label} ${t("record replaced.")}`);
      router.refresh();
    } catch (error) {
      pushErrorToast(
        error,
        `${t("Unable to replace")} ${area.label.toLowerCase()} ${t("record.")}`,
        `${t("Replace")} ${area.label} ${t("record")}`,
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUpdate() {
    if (!detail || !changed || !validateRequiredFields()) {
      return;
    }

    setPendingAction("update");
    try {
      await sdkFetch<{ record: TwoPQRecord }>(
        `/2pq/${area.key}/${detail.record.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(buildPayload(changedKeys)),
        },
      );
      pushToast("success", `${area.label} ${t("record updated.")}`);
      router.refresh();
    } catch (error) {
      pushErrorToast(
        error,
        `${t("Unable to update")} ${area.label.toLowerCase()} ${t("record.")}`,
        `${t("Update")} ${area.label} ${t("record")}`,
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeleteCaseWithLinkedSamplings() {
    if (!detail || areaKey !== "cases") {
      return;
    }

    const caseId = detail.record.id;
    setDeleteDialogOpen(false);
    setPendingAction("delete");
    setCaseDeleteProcess(
      buildInitialCaseDeleteProcess(caseId, linkedSamplings.length),
    );

    try {
      await pauseForProcessStep(180);
      updateCaseDeleteProcessSteps({
        validate: "success",
        "delete-samplings": "running",
      });

      const result = await sdkFetch<{
        success: true;
        recordId: string;
        deletedLinkedSamplingIds?: string[];
      }>(`/2pq/${area.key}/${caseId}?deleteLinkedSamplings=1`, {
        method: "DELETE",
      });
      const deletedSamplingCount =
        result.deletedLinkedSamplingIds?.length ?? linkedSamplings.length;

      updateCaseDeleteProcessSteps({
        "delete-samplings": "success",
        "delete-case": "success",
        refresh: "running",
      });
      setCaseDeleteProcess((current) =>
        current
          ? {
              ...current,
              samplingCount: deletedSamplingCount,
            }
          : current,
      );

      await pauseForProcessStep(220);
      setCaseDeleteProcess((current) =>
        current
          ? {
              ...current,
              status: "success",
              samplingCount: deletedSamplingCount,
              steps: current.steps.map((step) => ({
                ...step,
                status: "success",
              })),
            }
          : current,
      );
      setDeleteLinkedSamplings(false);
    } catch (error) {
      const presentation = getErrorPresentation(
        error,
        t("Unable to delete case and associated biopsies."),
      );
      updateCaseDeleteProcessStep("delete-samplings", "error");
      setCaseDeleteProcess((current) =>
        current
          ? {
              ...current,
              status: "error",
              errorTitle: t("Case deletion error"),
              errorDetails: presentation.details,
            }
          : current,
      );
      setLatestErrorLog({
        title: t("Case deletion error"),
        details: presentation.details,
      });
      setCopiedErrorLog(false);
      pushToast("error", presentation.message, {
        details: presentation.details,
        durationMs: 20_000,
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(
    options: { deleteLinkedSamplings?: boolean } = {},
  ) {
    if (!detail) {
      return;
    }

    if (areaKey === "cases" && options.deleteLinkedSamplings) {
      await handleDeleteCaseWithLinkedSamplings();
      return;
    }

    setPendingAction("delete");
    try {
      await sdkFetch(`/2pq/${area.key}/${detail.record.id}`, {
        method: "DELETE",
      });
      router.push(area.route);
      router.refresh();
    } catch (error) {
      pushErrorToast(
        error,
        `${t("Unable to delete")} ${area.label.toLowerCase()} ${t("record.")}`,
        `${t("Delete")} ${area.label} ${t("record")}`,
      );
      setPendingAction(null);
    }
  }

  async function handleCorrectCaseLabelToThreeLetterCode() {
    if (
      !detail ||
      areaKey !== "cases" ||
      !expectedCaseLabelFromThreeLetterCode ||
      !hasCaseLabelMismatchWarning
    ) {
      return;
    }

    setPendingCaseLabelCorrection(true);
    try {
      await sdkFetch<{ record: TwoPQRecord }>(
        `/2pq/${area.key}/${detail.record.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            caseLabel: expectedCaseLabelFromThreeLetterCode,
          }),
        },
      );

      setState((current) => ({
        ...current,
        caseLabel: expectedCaseLabelFromThreeLetterCode,
      }));
      pushToast(
        "success",
        `${t("Case label corrected to")} ${expectedCaseLabelFromThreeLetterCode}.`,
      );
      router.refresh();
    } catch (error) {
      pushErrorToast(
        error,
        t("Unable to correct the case label."),
        t("Correct case label"),
      );
    } finally {
      setPendingCaseLabelCorrection(false);
    }
  }

  const canManageRelations =
    mode === "create" ? true : Boolean(detail?.record.canUpdate);

  return (
    <div className="flex flex-col gap-5">
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        onViewLog={
          toast?.tone === "error" && toast.details ? handleErrorLogOpen : null
        }
      />
      <FormRequestedWarningDialog
        open={formRequestedWarningOpen}
        onOpenChange={setFormRequestedWarningOpen}
        title="Use the corresponding form"
        dashboardHref="/2pq-dashboard"
        dashboardLabel="Go to 2PQ dashboard"
      />
      <Dialog
        open={Boolean(latestErrorLog) && isErrorLogOpen}
        onOpenChange={(open) => {
          setIsErrorLogOpen(open);
          if (!open) {
            setCopiedErrorLog(false);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-4xl rounded-[2rem] border border-emerald-100 bg-[linear-gradient(160deg,rgba(249,253,250,0.98),rgba(255,255,255,0.98)_45%,rgba(240,253,244,0.96))] p-0 shadow-[0_32px_120px_rgba(15,23,42,0.16)]"
        >
          <DialogHeader className="relative border-b border-emerald-100 px-6 py-5 pr-16">
            <DialogTitle className="font-heading text-2xl font-semibold text-emerald-950">
              {latestErrorLog?.title ?? t("Request log")}
            </DialogTitle>
            <DialogDescription className="text-emerald-900/65">
              {t(
                "Full request error log. You can copy this message for debugging.",
              )}
            </DialogDescription>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-5 top-5 h-9 w-9 rounded-full text-emerald-950 hover:bg-emerald-100/80"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">{t("Close error log")}</span>
              </Button>
            </DialogClose>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleCopyErrorLog()}
                className="border border-emerald-100 bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(220,252,231,0.98))] text-emerald-950 shadow-[0_12px_30px_rgba(187,247,208,0.32)]"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedErrorLog ? t("Copied") : t("Copy error")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsErrorLogOpen(false);
                  setCopiedErrorLog(false);
                }}
                className="border-emerald-100 bg-white/80 text-emerald-900 hover:bg-emerald-50"
              >
                {t("Close")}
              </Button>
            </div>
            <Textarea
              readOnly
              value={latestErrorLog?.details ?? ""}
              className="min-h-[24rem] resize-none border-emerald-100 bg-white/88 font-mono text-xs leading-5 text-emerald-950"
            />
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={threeLetterCodeModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeThreeLetterCodeModal();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-2xl overflow-hidden rounded-[2rem] border border-fuchsia-100 [background:linear-gradient(155deg,rgba(254,250,255,0.98),rgba(250,245,255,0.98)_54%,rgba(244,214,255,0.94))] p-0 text-fuchsia-950 shadow-[0_34px_120px_rgba(168,85,247,0.22)] dark:border-fuchsia-400/28 dark:[background:linear-gradient(150deg,rgba(34,17,45,0.98),rgba(54,24,66,0.96)_48%,rgba(168,85,247,0.2))] dark:text-fuchsia-50 dark:shadow-[0_30px_110px_rgba(88,28,135,0.36)]"
        >
          <DialogHeader className="relative border-b border-fuchsia-100 px-6 py-5 pr-16 dark:border-fuchsia-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
              {threeLetterCodeModal === "remove"
                ? t("Remove three letter code")
                : threeLetterCodeModal === "random"
                  ? t("Generate random three letter code")
                  : hasThreeLetterCode
                    ? t("Edit three letter code")
                    : t("Add three letter code")}
            </DialogTitle>
            <DialogDescription className="text-fuchsia-950/68 dark:text-fuchsia-50/72">
              {threeLetterCodeModal === "remove"
                ? mode === "create"
                  ? t(
                      "This will clear the unique three-letter shortcut currently staged for the new case.",
                    )
                  : t(
                      "This will clear the unique three-letter shortcut stored on the case document.",
                    )
                : mode === "create"
                  ? t(
                      "This short letter-only identifier is unique to the case and will be stored in Firebase as three_letter_code when the record is created.",
                    )
                  : t(
                      "This short letter-only identifier is unique to the case and is stored in Firebase as three_letter_code.",
                    )}
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => closeThreeLetterCodeModal()}
              disabled={pendingThreeLetterCodeAction}
              className="absolute right-5 top-5 h-9 w-9 rounded-full text-fuchsia-950 hover:bg-fuchsia-100/80 dark:text-fuchsia-50 dark:hover:bg-fuchsia-900/36"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">
                {t("Close three letter code modal")}
              </span>
            </Button>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="rounded-[1.4rem] border border-fuchsia-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                {t("Preview")}
              </p>
              <div className="mt-4">
                <ThreeLetterCodeVisualizer
                  code={
                    threeLetterCodeModal === "remove"
                      ? normalizedThreeLetterCode
                      : normalizedThreeLetterCodeDraft
                  }
                />
              </div>
              <p className="mt-4 text-sm text-fuchsia-950/70 dark:text-fuchsia-50/72">
                {threeLetterCodeModal === "remove"
                  ? mode === "create"
                    ? t(
                        "Removing it clears the staged value so the new case will be created without a three letter code.",
                      )
                    : t(
                        "Removing it frees the code so another case can use it later.",
                      )
                  : t(
                      "Exactly three letters. The code is always stored and shown in uppercase.",
                    )}
              </p>
            </div>

            {threeLetterCodeModal === "manual" ? (
              <div className="space-y-2">
                <Label htmlFor="three-letter-code-input">
                  {t("Three letter code")}
                </Label>
                <Input
                  id="three-letter-code-input"
                  value={threeLetterCodeDraft}
                  onChange={(event) =>
                    setThreeLetterCodeDraft(
                      normalizeThreeLetterCodeInput(event.target.value),
                    )
                  }
                  placeholder="ABC"
                  autoComplete="off"
                  maxLength={3}
                  disabled={pendingThreeLetterCodeAction}
                  className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                />
                <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                  {t(
                    "Letters only. Use this when you want to reserve a specific short code for the case.",
                  )}
                </p>
              </div>
            ) : null}

            {threeLetterCodeModal === "random" ? (
              <div className="space-y-3">
                <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                  <p className="text-sm text-fuchsia-950/72 dark:text-fuchsia-50/72">
                    {t(
                      "A random candidate is ready. If you want another option before saving, generate a new suggestion.",
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={regenerateThreeLetterCodeDraft}
                  disabled={pendingThreeLetterCodeAction}
                  className={THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("Regenerate")}
                </Button>
              </div>
            ) : null}

            {threeLetterCodeModal === "remove" ? (
              <div className="rounded-[1.25rem] border border-fuchsia-200/90 bg-white/72 px-4 py-4 text-sm text-fuchsia-950/72 dark:border-fuchsia-300/18 dark:bg-fuchsia-950/24 dark:text-fuchsia-50/72">
                {mode === "create"
                  ? t(
                      "This new case will no longer carry a staged three letter code until a new one is assigned.",
                    )
                  : t(
                      "This case will no longer display a three letter code until a new one is assigned.",
                    )}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-3 border-fuchsia-100/90 bg-white/55 px-6 py-5 dark:border-fuchsia-300/14 dark:bg-fuchsia-950/16">
            <Button
              type="button"
              variant="outline"
              onClick={() => closeThreeLetterCodeModal()}
              disabled={pendingThreeLetterCodeAction}
              className={`${THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME} h-11 px-6`}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleThreeLetterCodeConfirm()}
              disabled={
                !canConfirmThreeLetterCode || pendingThreeLetterCodeAction
              }
              className={`${THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME} h-11 px-6`}
            >
              {pendingThreeLetterCodeAction ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : threeLetterCodeModal === "remove" ? (
                <Trash2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={publishFileStorageModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            closePublishFileStorageModal();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[min(56rem,calc(100vh-1.5rem))] w-[min(96vw,84rem)] max-h-[calc(100vh-1.5rem)] max-w-[calc(100%-2rem)] sm:max-w-[min(96vw,84rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[2rem] border border-indigo-100 [background:linear-gradient(155deg,rgba(246,248,255,0.98),rgba(238,242,255,0.98)_50%,rgba(224,231,255,0.94))] p-0 text-indigo-950 shadow-[0_34px_120px_rgba(99,102,241,0.2)] dark:border-indigo-400/28 dark:[background:linear-gradient(150deg,rgba(18,22,48,0.98),rgba(27,33,70,0.96)_48%,rgba(79,70,229,0.2))] dark:text-indigo-50 dark:shadow-[0_30px_110px_rgba(49,46,129,0.34)]"
        >
          <DialogHeader className="relative border-b border-indigo-100 px-6 py-5 pr-16 dark:border-indigo-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold text-indigo-950 dark:text-indigo-50">
              {publishFileStorageModal?.mode === "update"
                ? t("Update in File Storage")
                : t("Publish to File Storage")}
            </DialogTitle>
            <DialogDescription className="text-indigo-950/68 dark:text-indigo-50/72">
              {publishFileStorageModal?.mode === "update"
                ? t(
                    "Build a fresh JSON snapshot from the current case, its linked batch, and its child samplings, then update the existing file_storage record in place.",
                  )
                : t(
                    "Build a JSON snapshot from the current case, its linked batch, and its child samplings, then publish that snapshot into the reusable file storage collection.",
                  )}
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => closePublishFileStorageModal()}
              disabled={publishFileStorageModal?.status === "publishing"}
              className="absolute right-5 top-5 h-9 w-9 rounded-full text-indigo-950 hover:bg-indigo-100/80 dark:text-indigo-50 dark:hover:bg-indigo-900/36"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">
                {publishFileStorageModal?.mode === "update"
                  ? t("Close update in file storage modal")
                  : t("Close publish to file storage modal")}
              </span>
            </Button>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto overscroll-contain">
            {publishFileStorageModal?.status === "loading" ? (
              <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-indigo-200/90 bg-white/78 text-indigo-700 shadow-[0_18px_44px_rgba(165,180,252,0.34)] dark:border-indigo-300/18 dark:bg-indigo-950/24 dark:text-indigo-200 dark:shadow-none">
                  <LoaderCircle className="h-7 w-7 animate-spin" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/54 dark:text-indigo-50/58">
                    Building snapshot
                  </p>
                  <h3 className="font-heading text-xl font-semibold text-indigo-950 dark:text-indigo-50">
                    {publishFileStorageModal?.mode === "update"
                      ? t("Preparing the update preview")
                      : t("Preparing the publish preview")}
                  </h3>
                  <p className="max-w-xl text-sm text-indigo-950/68 dark:text-indigo-50/72">
                    {publishFileStorageModal?.mode === "update"
                      ? t(
                          "Pulling the latest linked case graph and generating the JSON snapshot preview that will replace the current stored file contents.",
                        )
                      : t(
                          "Pulling the latest linked case graph and generating the JSON snapshot preview for file storage.",
                        )}
                  </p>
                </div>
              </div>
            ) : publishFileStorageModal ? (
              <div className="space-y-6 px-6 py-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[1.25rem] border border-indigo-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                      File name
                    </p>
                    <p className="mt-2 font-mono text-sm text-indigo-950 dark:text-indigo-50">
                      {publishFileStorageModal.fileName}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-indigo-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                      Case ID
                    </p>
                    <p className="mt-2 font-mono text-sm text-indigo-950 dark:text-indigo-50">
                      {detail?.record.id}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-indigo-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                      {t("Snapshot nodes")}
                    </p>
                    <p className="mt-2 text-sm text-indigo-950 dark:text-indigo-50">
                      {publishFileStorageModal.snapshot?.entities.batches
                        .length ?? 0}{" "}
                      {t("batch")},{" "}
                      {publishFileStorageModal.snapshot?.entities.cases
                        .length ?? 0}{" "}
                      {t("case")},{" "}
                      {publishFileStorageModal.snapshot?.entities.samplings
                        .length ?? 0}{" "}
                      {t("sampling")}
                    </p>
                  </div>
                </div>

                {changed ? (
                  <div className="rounded-[1.25rem] border border-amber-200/90 bg-amber-50/86 px-4 py-4 text-sm text-amber-950/82 dark:border-amber-300/22 dark:bg-amber-500/12 dark:text-amber-100/84">
                    {t(
                      "Unsaved edits in this workbench are not included in the snapshot. This flow uses the saved case detail currently loaded from Firebase.",
                    )}
                  </div>
                ) : null}

                <div className="rounded-[1.5rem] border border-indigo-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-lg font-semibold text-indigo-950 dark:text-indigo-50">
                        {t("Snapshot JSON preview")}
                      </h3>
                      <p className="mt-1 text-sm text-indigo-950/68 dark:text-indigo-50/72">
                        {publishFileStorageModal.mode === "update"
                          ? t(
                              "Scroll the preview below to inspect the autogenerated case snapshot before it overwrites the current file storage snapshot.",
                            )
                          : t(
                              "Scroll the preview below to inspect the autogenerated case snapshot before it is published into file storage.",
                            )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setIsPublishFileStoragePreviewExpanded(
                          (current) => !current,
                        )
                      }
                      className={FILE_STORAGE_SECONDARY_BUTTON_CLASSNAME}
                    >
                      {isPublishFileStoragePreviewExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {isPublishFileStoragePreviewExpanded
                        ? t("Compact preview")
                        : t("Expand preview")}
                    </Button>
                  </div>
                  <Textarea
                    readOnly
                    value={publishFileStorageModal.preview}
                    className={`mt-4 resize-none border-indigo-100 bg-white/90 font-mono text-xs leading-6 text-indigo-950 dark:border-indigo-200/18 dark:bg-indigo-950/32 dark:text-indigo-50 ${
                      isPublishFileStoragePreviewExpanded
                        ? "min-h-[34rem] max-h-[68vh]"
                        : "min-h-[20rem] max-h-[26rem]"
                    } overflow-y-auto`}
                  />
                </div>

                <div className="rounded-[1.35rem] border border-indigo-100 bg-white/72 px-4 py-4 text-sm text-indigo-950/72 dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:text-indigo-50/72">
                  {publishFileStorageModal.mode === "update" ? (
                    <>
                      Updating rewrites the existing{" "}
                      <span className="font-mono">file_storage</span> record in
                      place and keeps the current{" "}
                      <span className="font-mono">stored_file_id</span> linked
                      to this case.
                    </>
                  ) : (
                    <>
                      Publishing creates a new{" "}
                      <span className="font-mono">file_storage</span> record and
                      writes the returned document id into{" "}
                      <span className="font-mono">stored_file_id</span> on this
                      case.
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-3 border-indigo-100/90 bg-white/55 px-6 py-5 dark:border-indigo-300/14 dark:bg-indigo-950/16">
            <Button
              type="button"
              variant="outline"
              onClick={() => closePublishFileStorageModal()}
              disabled={publishFileStorageModal?.status === "publishing"}
              className={`${FILE_STORAGE_SECONDARY_BUTTON_CLASSNAME} h-11 px-6`}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handlePublishToFileStorage()}
              disabled={
                !publishFileStorageModal?.snapshot ||
                publishFileStorageModal.status === "loading" ||
                publishFileStorageModal.status === "publishing"
              }
              className={`${FILE_STORAGE_PRIMARY_BUTTON_CLASSNAME} h-11 px-6`}
            >
              {publishFileStorageModal?.status === "publishing" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <FileCode2 className="h-4 w-4" />
              )}
              {publishFileStorageModal?.mode === "update"
                ? t("Update")
                : t("Publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isPublishReportCodeModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePublishReportCodeModal();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-[min(96vw,84rem)] max-w-[calc(100%-2rem)] sm:max-w-[min(96vw,84rem)] overflow-hidden rounded-[2rem] border border-indigo-100 [background:linear-gradient(155deg,rgba(241,245,255,0.98),rgba(232,239,255,0.98)_52%,rgba(218,228,255,0.94))] p-0 text-indigo-950 shadow-[0_34px_120px_rgba(79,70,229,0.18)] dark:border-indigo-400/28 dark:[background:linear-gradient(150deg,rgba(17,20,56,0.98),rgba(29,36,84,0.96)_48%,rgba(99,102,241,0.24))] dark:text-indigo-50 dark:shadow-[0_30px_110px_rgba(49,46,129,0.34)]"
        >
          <DialogHeader className="relative border-b border-indigo-100 px-6 py-5 pr-16 dark:border-indigo-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold text-indigo-950 dark:text-indigo-50">
              {t("Publish as report code")}
            </DialogTitle>
            <DialogDescription className="text-indigo-950/68 dark:text-indigo-50/72">
              {t(
                "This will ensure the current stored file is linked to report code",
              )}{" "}
              <span className="font-mono">
                {expectedCaseLabelFromThreeLetterCode}
              </span>{" "}
              {t("and will use the signed-in admin as the report owner.")}
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => closePublishReportCodeModal()}
              disabled={pendingPublishReportCode}
              className="absolute right-5 top-5 h-9 w-9 rounded-full text-indigo-950 hover:bg-indigo-100/80 dark:text-indigo-50 dark:hover:bg-indigo-900/36"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">
                {t("Close publish as report code modal")}
              </span>
            </Button>
          </DialogHeader>
          <div className="space-y-5 px-7 py-6 sm:px-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.35rem] border border-indigo-100 bg-white/76 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                  {t("Report code")}
                </p>
                <p className="mt-2 font-mono text-sm text-indigo-950 dark:text-indigo-50">
                  {expectedCaseLabelFromThreeLetterCode}
                </p>
                <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                  {t(
                    "Derived from the current case three-letter code using the fixed",
                  )}{" "}
                  <span className="font-mono">XXX</span> {t("suffix.")}
                </p>
              </div>
              <div className="rounded-[1.35rem] border border-indigo-100 bg-white/76 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                  {t("Stored file")}
                </p>
                <p className="mt-2 font-mono text-sm text-indigo-950 dark:text-indigo-50">
                  {storedFileId}
                </p>
                <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                  {t("Provider format will be saved as")}{" "}
                  <span className="font-mono">2pq</span>{" "}
                  {t(
                    "and the file name will stay synced to this stored file snapshot.",
                  )}
                </p>
              </div>
              <div className="rounded-[1.35rem] border border-indigo-100 bg-white/76 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                  {t("Report owner")}
                </p>
                <p className="mt-2 text-sm font-medium text-indigo-950 dark:text-indigo-50">
                  {adminContext.email}
                </p>
                <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                  {t(
                    "The current admin user will be written into the report-code ownership fields and the uploaded-report owner metadata.",
                  )}
                </p>
              </div>
              <div className="rounded-[1.35rem] border border-indigo-100 bg-white/76 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                  {t("Current publish state")}
                </p>
                <p className="mt-2 text-sm font-medium text-indigo-950 dark:text-indigo-50">
                  {isStoredFileDocumentMissing
                    ? t("The stored file document can no longer be found.")
                    : isReportCodeStatusLoading
                      ? t("Checking the current report-code linkage...")
                      : isPublishedAsReportCode
                        ? t(
                            "This report code already resolves to the current stored file.",
                          )
                        : reportCodePublishConflictMessage
                          ? reportCodePublishConflictMessage
                          : reportCodeStatus
                            ? t(
                                "An existing report record will be synchronized to this stored file.",
                              )
                            : t(
                                "A fresh report code and uploaded-report link will be created.",
                              )}
                </p>
                <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                  {t("linked report on file_storage:")}{" "}
                  <span className="font-mono">
                    {storedFileLinkedReportCode || t("Not linked yet")}
                  </span>
                </p>
              </div>
            </div>

            {reportCodePublishConflictMessage || isStoredFileDocumentMissing ? (
              <div className="rounded-[1.25rem] border border-amber-300/90 bg-amber-50/90 px-4 py-4 text-sm text-amber-950 shadow-[0_10px_22px_rgba(251,191,36,0.16)] dark:border-amber-300/30 dark:bg-amber-500/12 dark:text-amber-50">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  <p>
                    {isStoredFileDocumentMissing
                      ? t(
                          "The case points to a stored_file_id that no longer exists, so report-code publishing is blocked until the file is republished.",
                        )
                      : reportCodePublishConflictMessage}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-4 border-indigo-100/90 bg-white/55 px-7 py-6 sm:px-8 dark:border-indigo-300/14 dark:bg-indigo-950/16">
            <Button
              type="button"
              variant="outline"
              onClick={() => closePublishReportCodeModal()}
              disabled={pendingPublishReportCode}
              className={`${FILE_STORAGE_SECONDARY_BUTTON_CLASSNAME} h-12 px-7`}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handlePublishAsReportCode()}
              disabled={!canPublishAsReportCode}
              className={`${FILE_STORAGE_PRIMARY_BUTTON_CLASSNAME} h-12 px-8 sm:px-10`}
            >
              {pendingPublishReportCode ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {t("Publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isMultiSamplingEditOpen}
        onOpenChange={setIsMultiSamplingEditOpen}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[min(54rem,calc(100vh-1.5rem))] w-[min(96vw,92rem)] max-h-[calc(100vh-1.5rem)] max-w-none sm:max-w-[min(96vw,92rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[2rem] border border-fuchsia-100 [background:linear-gradient(155deg,rgba(254,250,255,0.98),rgba(250,245,255,0.98)_54%,rgba(244,214,255,0.94))] p-0 text-fuchsia-950 shadow-[0_34px_120px_rgba(168,85,247,0.22)] dark:border-fuchsia-400/28 dark:[background:linear-gradient(150deg,rgba(34,17,45,0.98),rgba(54,24,66,0.96)_48%,rgba(168,85,247,0.2))] dark:text-fuchsia-50 dark:shadow-[0_30px_110px_rgba(88,28,135,0.36)]"
        >
          <DialogHeader className="relative border-b border-fuchsia-100 px-6 py-5 pr-16 dark:border-fuchsia-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
              {t("Multi sampling edit modal")}
            </DialogTitle>
            <DialogDescription className="text-fuchsia-950/68 dark:text-fuchsia-50/72">
              {t(
                "Select the sampling fields to patch across every linked child sampling at once. Only checked rows will be applied.",
              )}
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={closeMultiSamplingEditModal}
              className="absolute right-5 top-5 h-9 w-9 rounded-full text-fuchsia-950 hover:bg-fuchsia-100/80 dark:text-fuchsia-50 dark:hover:bg-fuchsia-900/36"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">
                {t("Close multi sampling edit modal")}
              </span>
            </Button>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <div className="space-y-6 px-6 py-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                    {t("Parent case ID")}
                  </p>
                  <p className="mt-2 font-mono text-sm text-fuchsia-950 dark:text-fuchsia-50">
                    {detail?.record.id}
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                    {t("Linked samplings")}
                  </p>
                  <p className="mt-2 font-mono text-sm text-fuchsia-950 dark:text-fuchsia-50">
                    {linkedSamplings.length}
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                    {t("Fields selected")}
                  </p>
                  <p className="mt-2 font-mono text-sm text-fuchsia-950 dark:text-fuchsia-50">
                    {multiSamplingEditPatchEntries.length}
                  </p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-fuchsia-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-lg font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                      {t("Sampling fields")}
                    </h3>
                    <p className="mt-1 text-sm text-fuchsia-950/68 dark:text-fuchsia-50/72">
                      {t(
                        "Row structure is checkbox, field label, then the new value to write into every linked child sampling. Leave a checked value empty if you want to clear that field.",
                      )}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-fuchsia-200 bg-white/72 text-fuchsia-950 dark:border-fuchsia-300/18 dark:bg-fuchsia-400/10 dark:text-fuchsia-50"
                  >
                    {linkedSamplings.length} {t("targets")}
                  </Badge>
                </div>

                <div className="mt-4 rounded-[1.35rem] border border-fuchsia-100 bg-white/76 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                  <Table className="min-w-[76rem]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-20 px-4 py-3 text-fuchsia-950/62 dark:text-fuchsia-50/68">
                          {t("Apply")}
                        </TableHead>
                        <TableHead className="min-w-[22rem] px-4 py-3 text-fuchsia-950/62 dark:text-fuchsia-50/68">
                          {t("Field")}
                        </TableHead>
                        <TableHead className="min-w-[30rem] px-4 py-3 text-fuchsia-950/62 dark:text-fuchsia-50/68">
                          {t("New value")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {multiSamplingEditableFields.map((field) => (
                        <TableRow
                          key={`multi-sampling-edit-${field.key}`}
                          className="border-fuchsia-100/80 hover:bg-fuchsia-50/42 dark:border-fuchsia-300/12 dark:hover:bg-fuchsia-950/18"
                        >
                          <TableCell className="px-4 py-3 align-top">
                            <input
                              aria-label={`${t("Apply")} ${field.label} ${t("to all linked samplings")}`}
                              type="checkbox"
                              checked={multiSamplingEditForm[field.key].enabled}
                              onChange={(event) =>
                                toggleMultiSamplingEditField(
                                  field.key,
                                  event.target.checked,
                                )
                              }
                              className="mt-1 h-4 w-4 rounded border border-fuchsia-200 bg-white text-fuchsia-600 shadow-sm outline-none ring-offset-0 focus:ring-2 focus:ring-fuchsia-300 dark:border-fuchsia-300/22 dark:bg-fuchsia-950/24"
                            />
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top whitespace-normal">
                            <div className="min-w-0 max-w-[24rem]">
                              <p className="font-medium text-fuchsia-950 dark:text-fuchsia-50">
                                {field.label}
                              </p>
                              <p className="mt-1 text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                                {field.description}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top whitespace-normal">
                            <Input
                              value={multiSamplingEditForm[field.key].value}
                              onChange={(event) =>
                                updateMultiSamplingEditFieldValue(
                                  field.key,
                                  event.target.value,
                                )
                              }
                              type={field.type === "date" ? "date" : "text"}
                              placeholder={
                                field.placeholder ??
                                `${t("New")} ${field.label.toLowerCase()}`
                              }
                              className="min-w-[30rem] border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 disabled:cursor-not-allowed disabled:opacity-60 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                              disabled={
                                !multiSamplingEditForm[field.key].enabled
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {multiSamplingEditPatchEntries.length === 0 ? (
                <div className={THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME}>
                  {t(
                    "Turn on at least one checkbox before applying a bulk update.",
                  )}
                </div>
              ) : (
                <div className="rounded-[1.35rem] border border-fuchsia-100 bg-white/72 px-4 py-4 text-sm text-fuchsia-950/72 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:text-fuchsia-50/72">
                  {t("Fields queued for bulk edit:")}{" "}
                  <span className="font-medium">
                    {multiSamplingEditSelectedFieldLabels.join(", ")}
                  </span>
                  .
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-3 border-fuchsia-100/90 bg-white/55 px-6 py-5 dark:border-fuchsia-300/14 dark:bg-fuchsia-950/16">
            <Button
              type="button"
              variant="outline"
              onClick={closeMultiSamplingEditModal}
              className={`${THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME} h-11 px-6`}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleStartMultiSamplingEditProcess}
              disabled={!canApplyMultiSamplingEdit}
              className={`${THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME} h-11 px-6`}
            >
              <Save className="h-4 w-4" />
              {t("Apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isAutoSamplingSetupOpen}
        onOpenChange={setIsAutoSamplingSetupOpen}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[min(54rem,calc(100vh-1.5rem))] w-[min(96vw,84rem)] max-h-[calc(100vh-1.5rem)] max-w-[calc(100%-2rem)] sm:max-w-[min(96vw,84rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[2rem] border border-fuchsia-100 [background:linear-gradient(155deg,rgba(254,250,255,0.98),rgba(250,245,255,0.98)_54%,rgba(244,214,255,0.94))] p-0 text-fuchsia-950 shadow-[0_34px_120px_rgba(168,85,247,0.22)] dark:border-fuchsia-400/28 dark:[background:linear-gradient(150deg,rgba(34,17,45,0.98),rgba(54,24,66,0.96)_48%,rgba(168,85,247,0.2))] dark:text-fuchsia-50 dark:shadow-[0_30px_110px_rgba(88,28,135,0.36)]"
        >
          <DialogHeader className="relative border-b border-fuchsia-100 px-6 py-5 pr-16 dark:border-fuchsia-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
              {t("Add multiple samplings at once")}
            </DialogTitle>
            <DialogDescription className="text-fuchsia-950/68 dark:text-fuchsia-50/72">
              {t(
                "Configure one sampling template, then generate sequential sampling records linked to the current case one by one.",
              )}
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={closeAutoSamplingSetupModal}
              className="absolute right-5 top-5 h-9 w-9 rounded-full text-fuchsia-950 hover:bg-fuchsia-100/80 dark:text-fuchsia-50 dark:hover:bg-fuchsia-900/36"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">
                {t("Close multiple sampling modal")}
              </span>
            </Button>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <div className="space-y-6 px-6 py-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                    {t("Parent case ID")}
                  </p>
                  <p className="mt-2 font-mono text-sm text-fuchsia-950 dark:text-fuchsia-50">
                    {detail?.record.id}
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                    {t("Three letter code")}
                  </p>
                  <p className="mt-2 font-mono text-sm text-fuchsia-950 dark:text-fuchsia-50">
                    {normalizedThreeLetterCode}
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                    {t("Sample ID pattern")}
                  </p>
                  <p className="mt-2 font-mono text-sm text-fuchsia-950 dark:text-fuchsia-50">
                    {autoSamplingPreviewItems[0]?.sixCharacterCode}...
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="auto-sampling-case-label">
                    {t("Case label")}
                  </Label>
                  <Input
                    id="auto-sampling-case-label"
                    value={autoSamplingConfig.caseLabel}
                    onChange={(event) =>
                      updateAutoSamplingConfig("caseLabel", event.target.value)
                    }
                    placeholder="CMS-2026-001"
                    className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                  />
                  <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                    {t(
                      "This label is written into every generated sampling record.",
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auto-sampling-sample-type">
                    {t("Sample type")}
                  </Label>
                  <Input
                    id="auto-sampling-sample-type"
                    value={autoSamplingConfig.sampleType}
                    onChange={(event) =>
                      updateAutoSamplingConfig("sampleType", event.target.value)
                    }
                    placeholder="Blood"
                    className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                  />
                  <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                    {t("Required. This value is copied into each sampling.")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{t("Processing status")}</Label>
                  <Select
                    value={autoSamplingConfig.processingStatus}
                    onValueChange={(value) =>
                      updateAutoSamplingConfig("processingStatus", value)
                    }
                  >
                    <SelectTrigger className="w-full border-fuchsia-100 bg-white/82 text-fuchsia-950 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50">
                      <SelectValue
                        placeholder={t("Select processing status")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {autoSamplingProcessingOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                    {t(
                      "Required. All generated samplings start with this processing state.",
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auto-sampling-run-id">{t("Run ID")}</Label>
                  <Input
                    id="auto-sampling-run-id"
                    value={autoSamplingConfig.runId}
                    onChange={(event) =>
                      updateAutoSamplingConfig("runId", event.target.value)
                    }
                    placeholder="SEQ-0007"
                    className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                  />
                  <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                    {t("Optional batch or sequencing run pointer.")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auto-sampling-collection-date">
                    {t("Collection date")}
                  </Label>
                  <Input
                    id="auto-sampling-collection-date"
                    type="date"
                    value={autoSamplingConfig.collectionDate}
                    onChange={(event) =>
                      updateAutoSamplingConfig(
                        "collectionDate",
                        event.target.value,
                      )
                    }
                    className="border-fuchsia-100 bg-white/82 text-fuchsia-950 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50"
                  />
                  <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                    {t(
                      "Optional collection date copied into every generated record.",
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auto-sampling-reception-date">
                    {t("Reception date")}
                  </Label>
                  <Input
                    id="auto-sampling-reception-date"
                    type="date"
                    value={autoSamplingConfig.receptionDate}
                    onChange={(event) =>
                      updateAutoSamplingConfig(
                        "receptionDate",
                        event.target.value,
                      )
                    }
                    className="border-fuchsia-100 bg-white/82 text-fuchsia-950 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50"
                  />
                  <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                    {t(
                      "Optional reception date copied into every generated record.",
                    )}
                  </p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="auto-sampling-qc-status">
                    {t("QC status")}
                  </Label>
                  <Input
                    id="auto-sampling-qc-status"
                    value={autoSamplingConfig.qcStatus}
                    onChange={(event) =>
                      updateAutoSamplingConfig("qcStatus", event.target.value)
                    }
                    placeholder="Passed"
                    className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                  />
                  <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                    {t(
                      "Optional quality-control outcome shared by the generated set.",
                    )}
                  </p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="auto-sampling-notes">{t("Notes")}</Label>
                  <Textarea
                    id="auto-sampling-notes"
                    value={autoSamplingConfig.notes}
                    onChange={(event) =>
                      updateAutoSamplingConfig("notes", event.target.value)
                    }
                    placeholder="Reception issues, missing tubes, or extraction notes..."
                    className="min-h-[7rem] border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                  />
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-fuchsia-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <Label htmlFor="auto-sampling-copies">
                      {t("Number of copies")}
                    </Label>
                    <Input
                      id="auto-sampling-copies"
                      type="number"
                      min={AUTO_SAMPLING_MIN_COPIES}
                      max={AUTO_SAMPLING_MAX_COPIES}
                      value={autoSamplingCopies}
                      onChange={(event) =>
                        handleAutoSamplingCopiesChange(
                          Number.parseInt(event.target.value || "1", 10),
                        )
                      }
                      className="w-32 border-fuchsia-100 bg-white/92 text-fuchsia-950 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50"
                    />
                  </div>
                  <div className="w-full lg:max-w-xl">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                      <span>1</span>
                      <span>{autoSamplingCopies}</span>
                      <span>15</span>
                    </div>
                    <input
                      id="auto-sampling-slider"
                      type="range"
                      min={AUTO_SAMPLING_MIN_COPIES}
                      max={AUTO_SAMPLING_MAX_COPIES}
                      step={1}
                      value={autoSamplingCopies}
                      onChange={(event) =>
                        handleAutoSamplingCopiesChange(
                          Number.parseInt(event.target.value, 10),
                        )
                      }
                      className="h-3 w-full cursor-pointer accent-fuchsia-600"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-lg font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                      {t("6 character codes to be generated")}
                    </h3>
                    <p className="mt-1 text-sm text-fuchsia-950/68 dark:text-fuchsia-50/72">
                      {t(
                        "Each sequential sampling will use the current case three-letter code plus its matching 3 number code as the final sample ID.",
                      )}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-fuchsia-200 bg-white/72 text-fuchsia-950 dark:border-fuchsia-300/18 dark:bg-fuchsia-400/10 dark:text-fuchsia-50"
                  >
                    {autoSamplingPreviewItems.length} {t("planned")}
                  </Badge>
                </div>

                {autoSamplingInventoryQuery.isFetching ? (
                  <div className={THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME}>
                    {t("Validating existing sampling IDs before generation...")}
                  </div>
                ) : null}

                {autoSamplingInventoryQuery.isError ? (
                  <div className={THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME}>
                    {t(
                      "Existing sampling IDs could not be validated right now. Fix the connection issue before running this batch.",
                    )}
                  </div>
                ) : null}

                {autoSamplingConflictingCodes.length > 0 ? (
                  <div className="rounded-[1.35rem] border border-destructive/28 bg-destructive/8 px-4 py-4 text-sm text-destructive">
                    {t("These sample IDs already exist and block generation:")}{" "}
                    <span className="font-mono">
                      {autoSamplingConflictingCodes.join(", ")}
                    </span>
                  </div>
                ) : null}

                {!isAutoSamplingFormComplete(autoSamplingConfig) ? (
                  <div className={THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME}>
                    {t(
                      "Fill the required fields: case label, sample type, and processing status.",
                    )}
                  </div>
                ) : null}

                <div className="-mx-1 overflow-x-auto pb-1">
                  <div className="grid min-w-max grid-flow-col auto-cols-[minmax(17rem,19rem)] gap-3 px-1 sm:auto-cols-[minmax(18rem,20rem)]">
                    {autoSamplingPreviewItems.map((item) => (
                      <div
                        key={item.sixCharacterCode}
                        className="rounded-[1.35rem] border border-fuchsia-100 bg-white/76 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.56)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Badge
                            variant="outline"
                            className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950 dark:border-fuchsia-300/18 dark:bg-fuchsia-400/10 dark:text-fuchsia-50"
                          >
                            {item.threeNumberCode}
                          </Badge>
                          <span className="text-xs text-fuchsia-950/58 dark:text-fuchsia-50/58">
                            #{item.order}
                          </span>
                        </div>
                        <p className="mt-3 font-mono text-xl font-semibold tracking-[0.08em] text-fuchsia-950 dark:text-fuchsia-50">
                          {item.sixCharacterCode}
                        </p>
                        <p className="mt-2 text-xs text-fuchsia-950/60 dark:text-fuchsia-50/60">
                          {t(
                            "Sample ID to be created for this sequential sampling slot.",
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-3 border-fuchsia-100/90 bg-white/55 px-6 py-5 dark:border-fuchsia-300/14 dark:bg-fuchsia-950/16">
            <Button
              type="button"
              variant="outline"
              onClick={closeAutoSamplingSetupModal}
              className={`${THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME} h-11 px-6`}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleStartAutoSamplingProcess}
              disabled={!canGenerateAutoSampling}
              className={`${THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME} h-11 px-6`}
            >
              <CircleDot className="h-4 w-4" />
              {t("Generate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(autoSamplingProcess)}
        onOpenChange={(open) => {
          if (
            !open &&
            autoSamplingProcess &&
            autoSamplingProcess.status !== "running" &&
            autoSamplingProcess.status !== "validating" &&
            autoSamplingProcess.status !== "success"
          ) {
            setAutoSamplingProcess(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100vh-1.5rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[2rem] border border-fuchsia-100 [background:linear-gradient(155deg,rgba(254,250,255,0.98),rgba(250,245,255,0.98)_54%,rgba(244,214,255,0.94))] p-0 text-fuchsia-950 shadow-[0_34px_120px_rgba(168,85,247,0.22)] dark:border-fuchsia-400/28 dark:[background:linear-gradient(150deg,rgba(34,17,45,0.98),rgba(54,24,66,0.96)_48%,rgba(168,85,247,0.2))] dark:text-fuchsia-50 dark:shadow-[0_30px_110px_rgba(88,28,135,0.36)]"
        >
          {autoSamplingProcess?.status === "success" ? (
            <div className="relative overflow-hidden px-6 py-10 text-center">
              {CREATION_CONFETTI.map((particle, index) => (
                <span
                  key={`auto-sampling-success-${particle.left}-${particle.delay}-${index}`}
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
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-200/18 text-emerald-50 shadow-[0_0_0_14px_rgba(74,222,128,0.12)]">
                  <span className="two-pq-success-ring absolute inset-0 rounded-full border border-emerald-200/55" />
                  <CheckCircle2 className="h-12 w-12" />
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-950/62 dark:text-fuchsia-50/72">
                  {t("Auto Sampling Creation Modal")}
                </p>
                <h3 className="mt-2 font-heading text-3xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                  {t("Sequential sampling batch completed")}
                </h3>
                <p className="mt-3 max-w-2xl text-sm text-fuchsia-950/72 dark:text-fuchsia-50/76">
                  {t("All")} {autoSamplingProcess.items.length}{" "}
                  {t(
                    "sampling records were created, validated, and linked to case",
                  )}{" "}
                  <span className="font-mono">{detail?.record.id}</span>.
                </p>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader className="relative border-b border-fuchsia-100 px-6 py-5 pr-16 dark:border-fuchsia-300/16">
                <DialogTitle className="font-heading text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                  {t("Auto sampling creation modal")}
                </DialogTitle>
                <DialogDescription className="text-fuchsia-950/68 dark:text-fuchsia-50/72">
                  {t(
                    "Sampling records are generated sequentially with the current case as their linked parent case.",
                  )}
                </DialogDescription>
                {autoSamplingProcess?.status === "paused" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setAutoSamplingProcess(null)}
                    className="absolute right-5 top-5 h-9 w-9 rounded-full text-fuchsia-950 hover:bg-fuchsia-100/80 dark:text-fuchsia-50 dark:hover:bg-fuchsia-900/36"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">
                      {t("Close auto sampling creation modal")}
                    </span>
                  </Button>
                ) : null}
              </DialogHeader>

              <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
                <div className="rounded-[1.5rem] border border-fuchsia-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        {t("Process progress")}
                      </p>
                      <p className="mt-2 text-sm text-fuchsia-950/72 dark:text-fuchsia-50/72">
                        {autoSamplingProcess?.status === "running"
                          ? `${t("Creating")} ${autoSamplingProcess.items[autoSamplingProcess.currentIndex ?? 0]?.sixCharacterCode ?? ""} ${t("right now.")}`
                          : autoSamplingProcess?.status === "validating"
                            ? t(
                                "Running the final validation pass across every created sampling.",
                              )
                            : t(
                                "The process is paused. Review the error, then retry from the blocked step.",
                              )}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-fuchsia-200 bg-white/72 text-fuchsia-950 dark:border-fuchsia-300/18 dark:bg-fuchsia-400/10 dark:text-fuchsia-50"
                    >
                      {autoSamplingProgressPercent}%
                    </Badge>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-fuchsia-100/90 dark:bg-fuchsia-950/50">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(217,70,239,0.92),rgba(168,85,247,0.96))] transition-[width] duration-300"
                      style={{ width: `${autoSamplingProgressPercent}%` }}
                    />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-[1.15rem] border border-fuchsia-100 bg-white/78 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        {t("Created")}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                        {autoSamplingSuccessfulCount}
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] border border-fuchsia-100 bg-white/78 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        {t("Pending")}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                        {autoSamplingPendingCount}
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] border border-fuchsia-100 bg-white/78 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        {t("Blocked")}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                        {autoSamplingErroredCount}
                      </p>
                    </div>
                  </div>
                </div>

                {autoSamplingProcess?.status === "paused" ? (
                  <div className="rounded-[1.35rem] border border-destructive/28 bg-destructive/8 px-4 py-4 text-sm text-destructive">
                    {autoSamplingProcess.errorTitle ??
                      t("Auto sampling paused")}
                    . {t("Retry continues from the blocked sequential step.")}
                  </div>
                ) : null}

                <div className="-mx-1 overflow-x-auto pb-1">
                  <div className="grid min-w-max grid-flow-col auto-cols-[minmax(17rem,19rem)] gap-3 px-1 sm:auto-cols-[minmax(18rem,20rem)]">
                    {autoSamplingProcess?.items.map((item) => (
                      <div
                        key={`auto-sampling-process-${item.sixCharacterCode}`}
                        className="rounded-[1.35rem] border border-fuchsia-100 bg-white/76 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.56)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                item.status === "success"
                                  ? "success"
                                  : item.status === "error"
                                    ? "destructive"
                                    : item.status === "running"
                                      ? "brand"
                                      : "outline"
                              }
                            >
                              {t(item.status)}
                            </Badge>
                            <span className="font-mono text-xs text-fuchsia-950/58 dark:text-fuchsia-50/58">
                              {item.threeNumberCode}
                            </span>
                          </div>
                          <span className="text-xs text-fuchsia-950/58 dark:text-fuchsia-50/58">
                            {t("Attempt")} {item.attempts}
                          </span>
                        </div>
                        <p className="mt-3 font-mono text-lg font-semibold tracking-[0.08em] text-fuchsia-950 dark:text-fuchsia-50">
                          {item.sixCharacterCode}
                        </p>
                        <p className="mt-2 text-xs text-fuchsia-950/60 dark:text-fuchsia-50/60">
                          {t("Sample ID for sequential slot")} #{item.order}.
                        </p>
                        {item.samplingRecordId ? (
                          <p className="mt-3 text-xs text-fuchsia-950/68 dark:text-fuchsia-50/68">
                            {t("Created record:")}{" "}
                            <span className="font-mono">
                              {item.samplingRecordId}
                            </span>
                          </p>
                        ) : null}
                        {item.status === "error" ? (
                          <p className="mt-3 text-xs text-destructive">
                            {t(
                              "Generation paused on this item. Inspect the error log for details.",
                            )}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {autoSamplingProcess?.status === "paused" ? (
                <DialogFooter className="gap-3 border-fuchsia-100/90 bg-white/55 px-6 py-5 dark:border-fuchsia-300/14 dark:bg-fuchsia-950/16">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openAutoSamplingProcessErrorLog}
                    disabled={!autoSamplingProcess.errorDetails}
                    className={`${THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME} h-11 px-6`}
                  >
                    <Copy className="h-4 w-4" />
                    {t("Inspect error")}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleRetryAutoSamplingProcess}
                    className={`${THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME} h-11 px-6`}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("Retry")}
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(multiSamplingEditProcess)}
        onOpenChange={(open) => {
          if (
            !open &&
            multiSamplingEditProcess &&
            multiSamplingEditProcess.status !== "running" &&
            multiSamplingEditProcess.status !== "validating" &&
            multiSamplingEditProcess.status !== "success"
          ) {
            setMultiSamplingEditProcess(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[min(48rem,calc(100vh-1.5rem))] max-h-[calc(100vh-1.5rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[2rem] border border-fuchsia-100 [background:linear-gradient(155deg,rgba(254,250,255,0.98),rgba(250,245,255,0.98)_54%,rgba(244,214,255,0.94))] p-0 text-fuchsia-950 shadow-[0_34px_120px_rgba(168,85,247,0.22)] dark:border-fuchsia-400/28 dark:[background:linear-gradient(150deg,rgba(34,17,45,0.98),rgba(54,24,66,0.96)_48%,rgba(168,85,247,0.2))] dark:text-fuchsia-50 dark:shadow-[0_30px_110px_rgba(88,28,135,0.36)]"
        >
          {multiSamplingEditProcess?.status === "success" ? (
            <div className="relative overflow-hidden px-6 py-10 text-center">
              {CREATION_CONFETTI.map((particle, index) => (
                <span
                  key={`multi-sampling-edit-success-${particle.left}-${particle.delay}-${index}`}
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
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-200/18 text-emerald-50 shadow-[0_0_0_14px_rgba(74,222,128,0.12)]">
                  <span className="two-pq-success-ring absolute inset-0 rounded-full border border-emerald-200/55" />
                  <CheckCircle2 className="h-12 w-12" />
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-950/62 dark:text-fuchsia-50/72">
                  {t("Multi Sampling Edit Modal")}
                </p>
                <h3 className="mt-2 font-heading text-3xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                  {t("Bulk sampling update completed")}
                </h3>
                <p className="mt-3 max-w-2xl text-sm text-fuchsia-950/72 dark:text-fuchsia-50/76">
                  {t("All")} {multiSamplingEditProcess.items.length}{" "}
                  {t("linked samplings were updated and validated for case")}{" "}
                  <span className="font-mono">{detail?.record.id}</span>.
                </p>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader className="relative border-b border-fuchsia-100 px-6 py-5 pr-16 dark:border-fuchsia-300/16">
                <DialogTitle className="font-heading text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                  {t("Multi sampling edit progress")}
                </DialogTitle>
                <DialogDescription className="text-fuchsia-950/68 dark:text-fuchsia-50/72">
                  {t(
                    "Checked fields are being patched across the current case child samplings one by one.",
                  )}
                </DialogDescription>
                {multiSamplingEditProcess?.status === "paused" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setMultiSamplingEditProcess(null)}
                    className="absolute right-5 top-5 h-9 w-9 rounded-full text-fuchsia-950 hover:bg-fuchsia-100/80 dark:text-fuchsia-50 dark:hover:bg-fuchsia-900/36"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">
                      {t("Close multi sampling edit progress")}
                    </span>
                  </Button>
                ) : null}
              </DialogHeader>

              <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
                <div className="rounded-[1.5rem] border border-fuchsia-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        {t("Process progress")}
                      </p>
                      <p className="mt-2 text-sm text-fuchsia-950/72 dark:text-fuchsia-50/72">
                        {multiSamplingEditProcess?.status === "running"
                          ? `${t("Updating")} ${multiSamplingEditProcess.items[multiSamplingEditProcess.currentIndex ?? 0]?.sampleId ?? ""} ${t("right now.")}`
                          : multiSamplingEditProcess?.status === "validating"
                            ? t(
                                "Running the final validation pass across every updated child sampling.",
                              )
                            : t(
                                "The process is paused. Review the error, then retry from the blocked step.",
                              )}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-fuchsia-200 bg-white/72 text-fuchsia-950 dark:border-fuchsia-300/18 dark:bg-fuchsia-400/10 dark:text-fuchsia-50"
                    >
                      {multiSamplingEditProgressPercent}%
                    </Badge>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-fuchsia-100/90 dark:bg-fuchsia-950/50">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(217,70,239,0.92),rgba(168,85,247,0.96))] transition-[width] duration-300"
                      style={{ width: `${multiSamplingEditProgressPercent}%` }}
                    />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-[1.15rem] border border-fuchsia-100 bg-white/78 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        {t("Updated")}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                        {multiSamplingEditSuccessfulCount}
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] border border-fuchsia-100 bg-white/78 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        {t("Pending")}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                        {multiSamplingEditPendingCount}
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] border border-fuchsia-100 bg-white/78 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        {t("Blocked")}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                        {multiSamplingEditErroredCount}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[1.15rem] border border-fuchsia-100 bg-white/76 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                      {t("Fields being applied")}
                    </p>
                    <p className="mt-2 text-sm text-fuchsia-950/72 dark:text-fuchsia-50/72">
                      {multiSamplingEditSelectedFieldLabels.length > 0
                        ? multiSamplingEditSelectedFieldLabels.join(", ")
                        : t("No fields selected.")}
                    </p>
                  </div>
                </div>

                {multiSamplingEditProcess?.status === "paused" ? (
                  <div className="rounded-[1.35rem] border border-destructive/28 bg-destructive/8 px-4 py-4 text-sm text-destructive">
                    {multiSamplingEditProcess.errorTitle ??
                      t("Multi sampling edit paused")}
                    . {t("Retry continues from the blocked child sampling.")}
                  </div>
                ) : null}

                <div className="-mx-1 overflow-x-auto pb-1">
                  <div className="grid min-w-max grid-flow-col auto-cols-[minmax(17rem,19rem)] gap-3 px-1 sm:auto-cols-[minmax(18rem,20rem)]">
                    {multiSamplingEditProcess?.items.map((item) => (
                      <div
                        key={`multi-sampling-edit-process-${item.samplingRecordId}`}
                        className="rounded-[1.35rem] border border-fuchsia-100 bg-white/76 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.56)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Badge
                            variant={
                              item.status === "success"
                                ? "success"
                                : item.status === "error"
                                  ? "destructive"
                                  : item.status === "running"
                                    ? "brand"
                                    : "outline"
                            }
                          >
                            {t(item.status)}
                          </Badge>
                          <span className="text-xs text-fuchsia-950/58 dark:text-fuchsia-50/58">
                            {t("Attempt")} {item.attempts}
                          </span>
                        </div>
                        <p className="mt-3 font-mono text-lg font-semibold tracking-[0.08em] text-fuchsia-950 dark:text-fuchsia-50">
                          {item.sampleId}
                        </p>
                        <p className="mt-2 text-xs text-fuchsia-950/60 dark:text-fuchsia-50/60">
                          {t("Child sampling")} #{item.order}{" "}
                          {t("with record id")}{" "}
                          <span className="font-mono">
                            {item.samplingRecordId}
                          </span>
                          .
                        </p>
                        {item.status === "error" ? (
                          <p className="mt-3 text-xs text-destructive">
                            {t(
                              "Update paused on this sampling. Inspect the error log for details.",
                            )}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {multiSamplingEditProcess?.status === "paused" ? (
                <DialogFooter className="gap-3 border-fuchsia-100/90 bg-white/55 px-6 py-5 dark:border-fuchsia-300/14 dark:bg-fuchsia-950/16">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openMultiSamplingEditProcessErrorLog}
                    disabled={!multiSamplingEditProcess.errorDetails}
                    className={`${THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME} h-11 px-6`}
                  >
                    <Copy className="h-4 w-4" />
                    {t("Inspect error")}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleRetryMultiSamplingEditProcess}
                    className={`${THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME} h-11 px-6`}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("Retry")}
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
      <RelationSelectionDialog
        open={relationDialog === "case-parent-batch"}
        onOpenChange={handleRelationDialogChange}
        area={batchArea}
        title={t("Link Batch")}
        description={t(
          "Select the sequencing batch that should act as the parent entity for this case.",
        )}
        records={batchCandidates}
        loading={batchesQuery.isFetching}
        pendingRecordId={pendingRelationRecordId}
        query={relationQuery}
        onQueryChange={setRelationQuery}
        onSelect={(record) => void handleLinkBatchToCase(record)}
        selectLabel={mode === "create" ? t("Use batch") : t("Link batch")}
        translate={t}
      />
      <RelationSelectionDialog
        open={relationDialog === "sampling-parent-case"}
        onOpenChange={handleRelationDialogChange}
        area={caseArea}
        title={t("Link Case")}
        description={t(
          "Select the parent case that should own this sampling record.",
        )}
        records={parentCaseCandidates}
        loading={casesQuery.isFetching}
        pendingRecordId={pendingRelationRecordId}
        query={relationQuery}
        onQueryChange={setRelationQuery}
        onSelect={(record) => void handleLinkCaseToSampling(record)}
        selectLabel={mode === "create" ? t("Use case") : t("Link case")}
        translate={t}
      />
      <RelationSelectionDialog
        open={relationDialog === "sequencing-child-case"}
        onOpenChange={handleRelationDialogChange}
        area={caseArea}
        title={t("Link Existing Case")}
        description={t(
          "Attach an existing case to this sequencing batch. If the case already belongs to another batch, it will be moved.",
        )}
        records={sequencingCaseCandidates}
        loading={casesQuery.isFetching}
        pendingRecordId={pendingRelationRecordId}
        query={relationQuery}
        onQueryChange={setRelationQuery}
        onSelect={(record) => void handleLinkExistingCase(record)}
        selectLabel={t("Link case")}
        noteByRecordId={sequencingCaseNotes}
        translate={t}
      />
      <RelationSelectionDialog
        open={relationDialog === "case-child-sampling"}
        onOpenChange={handleRelationDialogChange}
        area={samplingArea}
        title={t("Link Existing Sampling")}
        description={t(
          "Attach an existing sampling record to this case. If it already belongs to another case, it will be moved.",
        )}
        records={samplingCandidates}
        loading={samplingsQuery.isFetching}
        pendingRecordId={pendingRelationRecordId}
        query={relationQuery}
        onQueryChange={setRelationQuery}
        onSelect={(record) => void handleLinkExistingSampling(record)}
        selectLabel={t("Link sampling")}
        noteByRecordId={samplingNotes}
        translate={t}
      />
      <Dialog
        open={Boolean(caseDeleteProcess)}
        onOpenChange={(open) => {
          if (
            open ||
            !caseDeleteProcess ||
            caseDeleteProcess.status === "running"
          ) {
            return;
          }

          if (caseDeleteProcess.status === "success") {
            handleCaseDeleteProcessExit();
          } else {
            setCaseDeleteProcess(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[min(48rem,calc(100vh-1.5rem))] max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[2rem] border border-rose-100 [background:linear-gradient(155deg,rgba(255,251,251,0.98),rgba(255,255,255,0.98)_54%,rgba(255,228,230,0.94))] p-0 text-rose-950 shadow-[0_34px_120px_rgba(225,29,72,0.18)] dark:border-rose-400/28 dark:[background:linear-gradient(150deg,rgba(45,18,23,0.98),rgba(66,24,32,0.96)_48%,rgba(225,29,72,0.2))] dark:text-rose-50 dark:shadow-[0_30px_110px_rgba(127,29,29,0.32)]"
        >
          {caseDeleteProcess?.status === "success" ? (
            <div className="relative overflow-hidden px-6 py-10 text-center">
              {CREATION_CONFETTI.map((particle, index) => (
                <span
                  key={`case-delete-success-${particle.left}-${particle.delay}-${index}`}
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
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-200/18 text-emerald-50 shadow-[0_0_0_14px_rgba(74,222,128,0.12)]">
                  <span className="two-pq-success-ring absolute inset-0 rounded-full border border-emerald-200/55" />
                  <CheckCircle2 className="h-12 w-12" />
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-rose-950/62 dark:text-rose-50/72">
                  {t("Read-only completion")}
                </p>
                <h3 className="mt-2 font-heading text-3xl font-semibold text-rose-950 dark:text-rose-50">
                  {t("Case deletion completed")}
                </h3>
                <p className="mt-3 max-w-2xl text-sm text-rose-950/72 dark:text-rose-50/76">
                  {t("Case")}{" "}
                  <span className="font-mono">{caseDeleteProcess.caseId}</span>{" "}
                  {t("and")} {caseDeleteProcess.samplingCount}{" "}
                  {t("associated biopsies were deleted together.")}
                </p>
                <Button
                  type="button"
                  onClick={handleCaseDeleteProcessExit}
                  className="mt-6 h-12 rounded-[1.1rem] bg-[linear-gradient(180deg,rgba(79,70,229,0.98),rgba(67,56,202,0.96))] px-6 text-sm font-semibold text-white shadow-[0_18px_48px_rgba(79,70,229,0.24)]"
                >
                  {t("Back to cases")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader className="relative border-b border-rose-100 px-6 py-5 pr-16 dark:border-rose-300/16">
                <DialogTitle className="font-heading text-2xl font-semibold text-rose-950 dark:text-rose-50">
                  {t("Case deletion progress")}
                </DialogTitle>
                <DialogDescription className="text-rose-950/68 dark:text-rose-50/72">
                  {t(
                    "The case and its associated biopsies are being deleted in a controlled backend operation.",
                  )}
                </DialogDescription>
                {caseDeleteProcess?.status === "error" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setCaseDeleteProcess(null)}
                    className="absolute right-5 top-5 h-9 w-9 rounded-full text-rose-950 hover:bg-rose-100/80 dark:text-rose-50 dark:hover:bg-rose-900/36"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">
                      {t("Close case deletion progress")}
                    </span>
                  </Button>
                ) : null}
              </DialogHeader>

              <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
                <div className="rounded-[1.5rem] border border-rose-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(255,228,230,0.6)] dark:border-rose-200/16 dark:bg-rose-950/24 dark:shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-950/52 dark:text-rose-50/58">
                        {t("Process progress")}
                      </p>
                      <p className="mt-2 text-sm text-rose-950/72 dark:text-rose-50/72">
                        {caseDeleteProcess?.status === "error"
                          ? t(
                              "The deletion stopped. Open the error log to inspect the backend response.",
                            )
                          : t(
                              "Deleting the case and the linked biopsy records selected in the confirmation.",
                            )}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-rose-200 bg-white/72 text-rose-950 dark:border-rose-300/18 dark:bg-rose-400/10 dark:text-rose-50"
                    >
                      {caseDeleteProgressPercent}%
                    </Badge>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-rose-100/90 dark:bg-rose-950/50">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(244,63,94,0.92),rgba(225,29,72,0.96))] transition-[width] duration-300"
                      style={{ width: `${caseDeleteProgressPercent}%` }}
                    />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {caseDeleteProcess?.steps.map((step) => {
                      const copy = getCaseDeleteProcessStepCopy(step.key);
                      return (
                        <div
                          key={`case-delete-step-${step.key}`}
                          className="rounded-[1.25rem] border border-rose-100 bg-white/78 px-4 py-4 shadow-[0_10px_28px_rgba(255,228,230,0.5)] dark:border-rose-200/16 dark:bg-rose-950/24 dark:shadow-none"
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={
                                step.status === "success"
                                  ? "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white"
                                  : step.status === "error"
                                    ? "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                                    : step.status === "running"
                                      ? "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white"
                                      : "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 dark:border-rose-300/20 dark:bg-rose-950/30"
                              }
                            >
                              {step.status === "success" ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : step.status === "error" ? (
                                <AlertTriangle className="h-4 w-4" />
                              ) : step.status === "running" ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <CircleDot className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-rose-950 dark:text-rose-50">
                                {copy.title}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-rose-950/62 dark:text-rose-50/68">
                                {copy.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {caseDeleteProcess?.status === "error" ? (
                  <div className="rounded-[1.35rem] border border-destructive/28 bg-destructive/8 px-4 py-4 text-sm text-destructive">
                    {caseDeleteProcess.errorTitle ?? t("Case deletion error")}.{" "}
                    {t(
                      "No local cleanup was completed after the backend rejected the request.",
                    )}
                  </div>
                ) : null}
              </div>

              {caseDeleteProcess?.status === "error" ? (
                <DialogFooter className="gap-3 border-rose-100/90 bg-white/55 px-6 py-5 dark:border-rose-300/14 dark:bg-rose-950/16">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openCaseDeleteProcessErrorLog}
                    disabled={!caseDeleteProcess.errorDetails}
                    className={`${THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME} h-11 px-6`}
                  >
                    <Copy className="h-4 w-4" />
                    {t("Inspect error")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setCaseDeleteProcess(null)}
                    className="h-11 px-6"
                  >
                    {t("Close")}
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
      {createdRecordId ? (
        <div className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-background/36 backdrop-blur-[3px]" />
          <div className="pointer-events-auto animate-in fade-in-0 zoom-in-95 relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-emerald-300/38 bg-[linear-gradient(155deg,rgba(74,222,128,0.34),rgba(7,30,22,0.97)_52%,rgba(5,150,105,0.92))] px-6 py-8 text-center shadow-[0_34px_120px_rgba(34,197,94,0.34)]">
            {CREATION_CONFETTI.map((particle, index) => (
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
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-200/18 text-emerald-50 shadow-[0_0_0_14px_rgba(74,222,128,0.12)]">
                <span className="two-pq-success-ring absolute inset-0 rounded-full border border-emerald-200/55" />
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/88">
                {t("Entity Created")}
              </p>
              <h3 className="mt-2 font-heading text-3xl font-semibold text-white">
                {t("Record launched")}
              </h3>
              <p className="mt-2 max-w-md text-sm text-emerald-50/84">
                {t("New record")}{" "}
                <span className="font-mono text-emerald-50">
                  {createdRecordId}
                </span>{" "}
                {t("is live and ready in the full list.")}
              </p>
              <Button
                onClick={handleContinue}
                className="mt-6 h-12 rounded-[1.1rem] border border-emerald-100/12 bg-[linear-gradient(180deg,rgba(110,231,183,0.98),rgba(16,185,129,0.96))] px-6 text-sm font-semibold text-emerald-950 shadow-[0_18px_48px_rgba(16,185,129,0.26)]"
              >
                {t("Continue")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={area.route}>
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("Back to")} {area.navLabel.toLowerCase()}
          </Link>
        </Button>
        {detail ? (
          <span className="font-mono text-xs text-muted-foreground">
            {detail.record.id}
          </span>
        ) : null}
        <Badge variant="outline">{area.collectionKey}</Badge>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create"
                ? area.createLabel
                : `${area.label} ${t("workbench")}`}
            </h2>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            {area.key === "cases" && mode !== "create" ? (
              <div className="rounded-[1rem] border border-border/70 bg-background/72 px-4 py-3 text-left shadow-sm lg:text-right">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Case Last Updated
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {formattedCaseLastUpdatedDate}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <HeaderUnclutterButton />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setState(sourceState)}
                disabled={!changed || pendingAction !== null}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("Reset")}
              </Button>
              {mode === "create" ? null : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleReplace()}
                    disabled={!canReplace || !changed || pendingAction !== null}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {pendingAction === "replace"
                      ? t("Replacing...")
                      : t("Replace")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleUpdate()}
                    disabled={!canUpdate || !changed || pendingAction !== null}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {pendingAction === "update"
                      ? t("Updating...")
                      : t("Update")}
                  </Button>
                  {canDelete ? (
                    <AlertDialog
                      open={deleteDialogOpen}
                      onOpenChange={(open) => {
                        setDeleteDialogOpen(open);
                        if (!open && pendingAction !== "delete") {
                          setDeleteLinkedSamplings(false);
                        }
                      }}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={pendingAction !== null}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("Delete")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogMedia className="bg-destructive/12 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                          </AlertDialogMedia>
                          <AlertDialogTitle>
                            {t("Delete record?")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {areaKey === "cases"
                              ? t(
                                  "This deletes the case. By default, linked biopsies are kept and only unlinked from this case.",
                                )
                              : t(
                                  "This removes the Firestore document from",
                                )}{" "}
                            {areaKey === "cases" ? null : (
                              <code>{area.collectionKey}</code>
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        {areaKey === "cases" ? (
                          <div className="space-y-3 rounded-[1.25rem] border border-destructive/16 bg-destructive/8 px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {t("Associated biopsies")}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {linkedSamplings.length === 0
                                    ? t(
                                        "No linked biopsies are currently attached to this case.",
                                      )
                                    : `${linkedSamplings.length} ${t("linked biopsies will be unlinked unless you choose to delete them too.")}`}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  linkedSamplings.length > 0
                                    ? "destructive"
                                    : "outline"
                                }
                              >
                                {linkedSamplings.length}
                              </Badge>
                            </div>
                            <label
                              htmlFor="delete-linked-samplings"
                              className={`flex items-start gap-3 rounded-[1rem] border border-border/70 bg-background/78 px-3 py-3 text-sm shadow-sm ${
                                linkedSamplings.length === 0
                                  ? "cursor-not-allowed opacity-60"
                                  : "cursor-pointer"
                              }`}
                            >
                              <Checkbox
                                id="delete-linked-samplings"
                                checked={deleteLinkedSamplings}
                                disabled={linkedSamplings.length === 0}
                                onCheckedChange={(checked) =>
                                  setDeleteLinkedSamplings(checked === true)
                                }
                                className="mt-0.5"
                              />
                              <span>
                                <span className="block font-semibold text-foreground">
                                  {t("Delete associated biopsies too")}
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                  {t(
                                    "If selected, every biopsy currently linked to this case will be removed instead of only being unlinked.",
                                  )}
                                </span>
                              </span>
                            </label>
                          </div>
                        ) : null}
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() =>
                              void handleDelete({ deleteLinkedSamplings })
                            }
                          >
                            {areaKey === "cases" && deleteLinkedSamplings
                              ? t("Delete case and biopsies")
                              : t("Delete record")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="brand">{t("Create")}</Badge>
          <Badge variant={canReplace ? "brand" : "outline"}>
            {t("Replace")}
          </Badge>
          <Badge variant={canUpdate ? "success" : "outline"}>
            {t("Update")}
          </Badge>
          <Badge variant={canDelete ? "destructive" : "outline"}>
            {t("Delete")}
          </Badge>
        </div>

        {mode === "create" ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-0">
            <div className="pointer-events-auto mx-auto md:ml-[calc(var(--sidebar-width)+1rem)] md:mr-6 lg:mr-8">
              <div className="two-pq-create-dock rounded-[1.7rem] border border-white/12 bg-background/72 p-4 shadow-[0_-10px_38px_rgba(7,16,24,0.12),0_20px_48px_rgba(7,16,24,0.18)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/54">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/86">
                      {t("Launch New Record")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {changed
                        ? `${changedKeys.length} ${changedKeys.length === 1 ? t("field staged for this record.") : t("fields staged for this record.")}`
                        : t(
                            "Fill the required fields, then launch the record.",
                          )}
                    </p>
                  </div>
                  <div className="flex w-full flex-col items-start gap-2 lg:w-auto lg:items-end">
                    <Button
                      onClick={() => void handleCreate()}
                      disabled={pendingAction !== null}
                      className="h-16 w-full rounded-[1.35rem] border border-sky-200/12 bg-[linear-gradient(180deg,rgba(56,189,248,0.98),rgba(37,99,235,0.96))] text-base font-semibold text-white shadow-[0_18px_52px_rgba(37,99,235,0.34)] disabled:opacity-100 lg:min-w-[20rem] lg:w-auto lg:px-10"
                    >
                      {createdRecordId ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : pendingAction === "create" ? (
                        <LoaderCircle className="h-5 w-5 animate-spin" />
                      ) : (
                        <Sparkles className="h-5 w-5" />
                      )}
                      {createdRecordId
                        ? t("Record created")
                        : pendingAction === "create"
                          ? t("Creating record...")
                          : area.createLabel}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div
          className={
            mode === "create" ? "grid gap-4 pb-40 md:pb-44" : "grid gap-4"
          }
        >
          {areaKey === "sequencing" ||
          areaKey === "cases" ||
          areaKey === "sampling" ? (
            <div className={RELATION_STRIP_CLASSNAME}>
              {areaKey === "sequencing" ? (
                <RelationSection
                  title={t("Linked cases")}
                  actions={
                    mode === "create" ? (
                      <span className={RELATION_HINT_CLASSNAME}>
                        {t("Create this batch first to start linking cases.")}
                      </span>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openRelationDialog("sequencing-child-case")
                          }
                          disabled={
                            !canManageRelations ||
                            pendingRelationRecordId !== null
                          }
                          className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {t("Link existing")}
                        </Button>
                        {shouldBlockDirectCreateForArea("cases") ? (
                          <Button
                            size="sm"
                            onClick={showDirectCreateRequiresFormAlert}
                            className={RELATION_PRIMARY_BUTTON_CLASSNAME}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t("New case")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            asChild
                            className={RELATION_PRIMARY_BUTTON_CLASSNAME}
                          >
                            <Link
                              href={`${caseArea.route}/new?batchId=${encodeURIComponent(detail!.record.id)}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {t("New case")}
                            </Link>
                          </Button>
                        )}
                      </>
                    )
                  }
                >
                  {mode === "create" ? (
                    <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                      {t(
                        "Save the sequencing batch, then link existing cases or create a new child case with the batch preloaded.",
                      )}
                    </div>
                  ) : linkedCases.length === 0 ? (
                    <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                      {t("No cases are linked to this batch yet.")}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {linkedCases.map((record) => (
                        <LinkedEntityCard
                          key={record.id}
                          record={record}
                          badge={t("Case")}
                          translate={t}
                          actions={
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                              >
                                <Link href={getRecordHref(record)}>
                                  {t("Open")}
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void handleUnlinkExistingCase(record)
                                }
                                disabled={
                                  !canManageRelations ||
                                  pendingRelationRecordId === record.id
                                }
                                className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                              >
                                {pendingRelationRecordId === record.id
                                  ? t("Unlinking...")
                                  : t("Unlink")}
                              </Button>
                            </>
                          }
                        />
                      ))}
                    </div>
                  )}
                </RelationSection>
              ) : null}

              {areaKey === "cases" ? (
                <RelationSection
                  title={t("Linked Batch")}
                  actions={
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRelationDialog("case-parent-batch")}
                        disabled={
                          !canManageRelations ||
                          pendingRelationRecordId !== null
                        }
                        className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {linkedBatch ? t("Change batch") : t("Link batch")}
                      </Button>
                      {linkedBatch ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleUnlinkBatchFromCase()}
                          disabled={
                            !canManageRelations ||
                            pendingRelationRecordId === linkedBatch.id
                          }
                          className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                        >
                          {pendingRelationRecordId === linkedBatch.id
                            ? t("Unlinking...")
                            : t("Unlink")}
                        </Button>
                      ) : null}
                    </>
                  }
                >
                  {linkedBatch ? (
                    <LinkedEntityCard
                      record={linkedBatch}
                      badge={t("Batch")}
                      note={t(
                        "The batch is the parent entity. Unlinking removes the relationship only.",
                      )}
                      translate={t}
                      actions={
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                        >
                          <Link href={getRecordHref(linkedBatch)}>
                            {t("Open")}
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      }
                    />
                  ) : (
                    <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                      {t("No parent batch is linked to this case yet.")}
                    </div>
                  )}
                </RelationSection>
              ) : null}

              {areaKey === "cases" ? (
                <RelationSection
                  title={t("Linked samplings")}
                  actions={
                    mode === "create" ? (
                      <span className={RELATION_HINT_CLASSNAME}>
                        {t(
                          "Create this case first to start linking samplings.",
                        )}
                      </span>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openRelationDialog("case-child-sampling")
                          }
                          disabled={
                            !canManageRelations ||
                            pendingRelationRecordId !== null
                          }
                          className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {t("Link existing")}
                        </Button>
                        {linkedSamplings.length > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={openMultiSamplingEditModal}
                            disabled={
                              !canManageRelations ||
                              Boolean(autoSamplingProcess) ||
                              Boolean(multiSamplingEditProcess)
                            }
                            className={
                              THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME
                            }
                          >
                            <Save className="h-3.5 w-3.5" />
                            {t("Edit multiple samplings at once")}
                          </Button>
                        ) : hasThreeLetterCode ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={openAutoSamplingSetupModal}
                            disabled={
                              !canManageRelations ||
                              Boolean(autoSamplingProcess) ||
                              Boolean(multiSamplingEditProcess)
                            }
                            className={
                              THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME
                            }
                          >
                            <CircleDot className="h-3.5 w-3.5" />
                            {t("Add multiple samplings at once")}
                          </Button>
                        ) : null}
                        {shouldBlockDirectCreateForArea("sampling") ? (
                          <Button
                            size="sm"
                            onClick={showDirectCreateRequiresFormAlert}
                            className={RELATION_PRIMARY_BUTTON_CLASSNAME}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t("New sampling")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            asChild
                            className={RELATION_PRIMARY_BUTTON_CLASSNAME}
                          >
                            <Link
                              href={`${samplingArea.route}/new?caseId=${encodeURIComponent(detail!.record.id)}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {t("New sampling")}
                            </Link>
                          </Button>
                        )}
                      </>
                    )
                  }
                >
                  {mode === "create" ? (
                    <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                      {t(
                        "Save the case, then link existing sampling records or create a new child sampling with this case preloaded.",
                      )}
                    </div>
                  ) : linkedSamplings.length === 0 ? (
                    <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                      {t("No samplings are linked to this case yet.")}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {linkedSamplings.map((record) => (
                        <LinkedEntityCard
                          key={record.id}
                          record={record}
                          badge={t("Sampling")}
                          translate={t}
                          actions={
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                              >
                                <Link href={getRecordHref(record)}>
                                  {t("Open")}
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void handleUnlinkExistingSampling(record)
                                }
                                disabled={
                                  !canManageRelations ||
                                  pendingRelationRecordId === record.id
                                }
                                className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                              >
                                {pendingRelationRecordId === record.id
                                  ? t("Unlinking...")
                                  : t("Unlink")}
                              </Button>
                            </>
                          }
                        />
                      ))}
                    </div>
                  )}
                </RelationSection>
              ) : null}

              {areaKey === "sampling" ? (
                <RelationSection
                  title={t("Linked Case")}
                  actions={
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openRelationDialog("sampling-parent-case")
                        }
                        disabled={
                          !canManageRelations ||
                          pendingRelationRecordId !== null
                        }
                        className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {linkedCase ? t("Change case") : t("Link case")}
                      </Button>
                      {linkedCase ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleUnlinkCaseFromSampling()}
                          disabled={
                            !canManageRelations ||
                            pendingRelationRecordId === linkedCase.id
                          }
                          className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                        >
                          {pendingRelationRecordId === linkedCase.id
                            ? t("Unlinking...")
                            : t("Unlink")}
                        </Button>
                      ) : null}
                    </>
                  }
                >
                  {linkedCase ? (
                    <LinkedEntityCard
                      record={linkedCase}
                      badge={t("Case")}
                      note={t(
                        "The case is the parent entity. Unlinking removes the relationship only.",
                      )}
                      translate={t}
                      actions={
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                        >
                          <Link href={getRecordHref(linkedCase)}>
                            {t("Open")}
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      }
                    />
                  ) : (
                    <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                      {t(
                        "No parent case is linked to this sampling record yet.",
                      )}
                    </div>
                  )}
                </RelationSection>
              ) : null}
            </div>
          ) : null}

          {areaKey === "cases" ? (
            <section className={THREE_LETTER_CODE_SECTION_CLASSNAME}>
              <div className="flex flex-col gap-4 border-b border-fuchsia-200/70 px-5 py-5 dark:border-fuchsia-300/16 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                      {t("Three letter code")}
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-fuchsia-200 bg-white/72 text-fuchsia-950 dark:border-fuchsia-300/18 dark:bg-fuchsia-400/10 dark:text-fuchsia-50"
                    >
                      {hasThreeLetterCode ? t("Assigned") : t("Not assigned")}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openThreeLetterCodeModal("manual")}
                    disabled={pendingThreeLetterCodeAction}
                    className={THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME}
                  >
                    {hasThreeLetterCode ? t("Edit") : t("Add manually")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openThreeLetterCodeModal("random")}
                    disabled={pendingThreeLetterCodeAction}
                    className={THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("Generate random")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openThreeLetterCodeModal("remove")}
                    disabled={
                      !hasThreeLetterCode || pendingThreeLetterCodeAction
                    }
                    className={THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("Remove")}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 lg:grid-cols-[auto,1fr] lg:items-center">
                {hasThreeLetterCode ? (
                  <>
                    <div className="rounded-[1.45rem] border border-fuchsia-100 bg-white/70 px-4 py-4 shadow-[0_16px_38px_rgba(250,232,255,0.62)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                      <ThreeLetterCodeVisualizer
                        code={normalizedThreeLetterCode}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-fuchsia-950 dark:text-fuchsia-50">
                        {mode === "create"
                          ? `${normalizedThreeLetterCode} ${t("is staged for this new case.")}`
                          : `${normalizedThreeLetterCode} ${t("is active for this case.")}`}
                      </p>
                      <p className="text-sm text-fuchsia-950/70 dark:text-fuchsia-50/72">
                        {mode === "create" ? (
                          <>
                            {t(
                              "The code will be stored on the new case document as",
                            )}{" "}
                            <code>three_letter_code</code> {t("when you tap")}{" "}
                            <span className="font-medium">
                              {area.createLabel}
                            </span>
                            .
                          </>
                        ) : (
                          <>
                            {t("The code is stored on the case document as")}{" "}
                            <code>three_letter_code</code>{" "}
                            {t("and stays available here for quick reference.")}
                          </>
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <div
                    className={`${THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME} lg:col-span-2`}
                  >
                    {mode === "create"
                      ? t(
                          "No three letter code is staged yet. Add one manually or generate a new random code so the case is created with its shorthand already assigned.",
                        )
                      : t(
                          "No three letter code has been assigned yet. Add one manually or generate a new random code to reserve a unique shorthand for this case.",
                        )}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {area.fieldGroups.map((group) => (
            <section
              key={group.title}
              className="rounded-2xl border border-border/70 bg-background/45 px-4 py-4"
            >
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {group.title}
              </h3>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {group.fields.map((field) => {
                  const options =
                    field.optionSource === "institutions"
                      ? institutionOptions
                      : field.optionSource === "doctors"
                        ? doctorOptions
                        : field.optionSource === "patients"
                          ? patientOptions
                          : field.options;
                  const disabled =
                    pendingAction !== null ||
                    pendingCaseLabelCorrection ||
                    (field.key === "institutionId" &&
                      Boolean(scopedInstitutionId)) ||
                    (field.key === "doctorId" && Boolean(scopedDoctorId));

                  return (
                    <div
                      key={field.key}
                      className={
                        field.type === "textarea"
                          ? "space-y-2 md:col-span-2"
                          : "space-y-2"
                      }
                    >
                      <Label htmlFor={`${area.key}-${field.key}`}>
                        {field.label}
                      </Label>
                      {field.type === "textarea" ? (
                        <Textarea
                          id={`${area.key}-${field.key}`}
                          value={state[field.key]}
                          onChange={(event) =>
                            setState((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                          disabled={disabled}
                        />
                      ) : field.type === "select" ? (
                        <OptionSelectField
                          options={options ?? []}
                          value={state[field.key]}
                          onChange={(value) =>
                            setState((current) => {
                              const next = { ...current, [field.key]: value };
                              if (
                                field.key === "institutionId" &&
                                current.institutionId !== value
                              ) {
                                next.doctorId = "";
                                next.patientId = "";
                              }
                              if (
                                field.key === "doctorId" &&
                                current.doctorId !== value
                              ) {
                                next.patientId = "";
                              }
                              return next;
                            })
                          }
                          placeholder={
                            field.placeholder ??
                            `${t("Select")} ${field.label.toLowerCase()}`
                          }
                          emptyLabel={`${t("No")} ${field.label.toLowerCase()}`}
                          disabled={disabled}
                        />
                      ) : (
                        <Input
                          id={`${area.key}-${field.key}`}
                          type={
                            field.type === "date"
                              ? "date"
                              : field.type === "email"
                                ? "email"
                                : "text"
                          }
                          value={state[field.key]}
                          onChange={(event) =>
                            setState((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                          disabled={disabled}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        {field.description}
                      </p>
                      {field.key === "caseLabel" &&
                      hasCaseLabelMismatchWarning ? (
                        <div className="rounded-[1.15rem] border border-amber-300/90 bg-amber-50/90 px-3 py-3 text-sm text-amber-950 shadow-[0_10px_22px_rgba(251,191,36,0.16)] dark:border-amber-300/30 dark:bg-amber-500/12 dark:text-amber-50">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                              <p>
                                {t(
                                  "Case label must match the active three letter code. Expected value:",
                                )}{" "}
                                <span className="font-mono font-semibold">
                                  {expectedCaseLabelFromThreeLetterCode}
                                </span>
                                .
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                void handleCorrectCaseLabelToThreeLetterCode()
                              }
                              disabled={
                                pendingCaseLabelCorrection ||
                                pendingAction !== null
                              }
                              className="h-9 shrink-0 border border-amber-300/90 bg-[linear-gradient(180deg,rgba(254,249,195,0.98),rgba(253,230,138,0.98))] px-4 text-amber-950 shadow-[0_10px_24px_rgba(251,191,36,0.2)] hover:brightness-[1.02] dark:border-amber-300/30 dark:bg-[linear-gradient(180deg,rgba(146,64,14,0.92),rgba(202,138,4,0.9))] dark:text-amber-50 dark:shadow-none"
                            >
                              {pendingCaseLabelCorrection ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : null}
                              {t("Correct")}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {areaKey === "cases" && mode !== "create" && hasThreeLetterCode ? (
            <section className={FILE_STORAGE_SECTION_CLASSNAME}>
              <div
                className={`flex flex-col gap-4 px-5 py-5 dark:border-indigo-300/16 lg:flex-row lg:items-start lg:justify-between ${
                  isFileStorageSectionExpanded
                    ? "border-b border-indigo-200/70"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setIsFileStorageSectionExpanded((current) => !current)
                  }
                  aria-expanded={isFileStorageSectionExpanded}
                  className="group max-w-3xl text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg font-semibold text-indigo-950 dark:text-indigo-50">
                      {t("Publish to File Storage")}
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-indigo-200 bg-white/72 text-indigo-950 dark:border-indigo-300/18 dark:bg-indigo-400/10 dark:text-indigo-50"
                    >
                      {hasStoredFileId ? t("Published") : t("Not published")}
                    </Badge>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-indigo-200/80 bg-white/72 text-indigo-950 transition-transform duration-200 group-hover:bg-white/90 dark:border-indigo-300/18 dark:bg-indigo-400/10 dark:text-indigo-50 dark:group-hover:bg-indigo-400/16">
                      {isFileStorageSectionExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-indigo-950/72 dark:text-indigo-50/74">
                    {hasStoredFileId
                      ? t(
                          "Inspect the current stored snapshot metadata, then update the linked Firebase",
                        )
                      : t(
                          "Generate a reusable JSON snapshot of this case, its parent batch, and its child samplings, then publish that snapshot into the Firebase",
                        )}{" "}
                    <code>file_storage</code>
                    {hasStoredFileId
                      ? ` ${t("document in place.")}`
                      : ` ${t("collection.")}`}
                  </p>
                </button>
                <div className="flex flex-wrap gap-2">
                  {hasStoredFileId && hasFileStorageAccess ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      asChild
                      className={FILE_STORAGE_SECONDARY_BUTTON_CLASSNAME}
                    >
                      <Link href={`/collections/file_storage/${storedFileId}`}>
                        <FolderOpen className="h-3.5 w-3.5" />
                        {t("Show in File Storage")}
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      void openPublishFileStorageModal({
                        mode: hasStoredFileId ? "update" : "publish",
                      })
                    }
                    disabled={!canPublishCaseToFileStorage}
                    className={FILE_STORAGE_PRIMARY_BUTTON_CLASSNAME}
                  >
                    <FileCode2 className="h-3.5 w-3.5" />
                    {fileStoragePrimaryActionLabel}
                  </Button>
                </div>
              </div>

              {isFileStorageSectionExpanded ? (
                <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.1fr),minmax(0,1fr),minmax(0,1fr)]">
                  <div className="rounded-[1.3rem] border border-indigo-100 bg-white/74 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                      {t("6-character file name")}
                    </p>
                    <p className="mt-2 font-mono text-sm text-indigo-950 dark:text-indigo-50">
                      {fileStorageSnapshotFileName}
                    </p>
                    <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                      {t(
                        "Derived from the case three-letter code as the canonical publish name.",
                      )}
                    </p>
                  </div>
                  <div className="rounded-[1.3rem] border border-indigo-100 bg-white/74 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                      {t("Stored file status")}
                    </p>
                    <p className="mt-2 text-sm font-medium text-indigo-950 dark:text-indigo-50">
                      {hasStoredFileId
                        ? t("A stored file is already linked to this case.")
                        : t("No stored file has been published yet.")}
                    </p>
                    <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                      {!hasFileStorageAccess
                        ? t(
                            "Only full admins can open, publish, or update file_storage documents from this section.",
                          )
                        : hasStoredFileId
                          ? t(
                              "Updating rewrites the current file_storage snapshot in place and keeps this case linked to the same stored_file_id.",
                            )
                          : t(
                              "Publishing will create a new file and save its document id on this case as stored_file_id.",
                            )}
                    </p>
                    {hasStoredFileId ? (
                      <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                        {t("Stored file last updated:")}{" "}
                        <span className="font-medium text-indigo-950 dark:text-indigo-50">
                          {storedFileDocumentQuery.isLoading
                            ? t("Checking...")
                            : (formattedStoredFileLastModifiedDate ??
                              t("Not available"))}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-[1.3rem] border border-indigo-100 bg-white/74 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                      stored_file_id
                    </p>
                    <p className="mt-2 font-mono text-sm text-indigo-950 dark:text-indigo-50">
                      {hasStoredFileId ? storedFileId : t("Not saved yet")}
                    </p>
                    <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                      {t(
                        "This field is written back into the case entity in Firebase after publish.",
                      )}
                    </p>
                  </div>
                </div>
              ) : null}
              {isStoredFileSnapshotStale ? (
                <div className="px-5 pb-5">
                  <div className="rounded-[1.25rem] border border-amber-300/90 bg-amber-50/90 px-4 py-4 text-sm text-amber-950 shadow-[0_10px_22px_rgba(251,191,36,0.16)] dark:border-amber-300/30 dark:bg-amber-500/12 dark:text-amber-50">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                        <p>
                          {t(
                            "The current stored file snapshot may be out of date. This case was updated",
                          )}{" "}
                          <span className="font-medium">
                            {formattedCaseLastUpdatedDate}
                          </span>
                          ,{" "}
                          {t(
                            "while the published stored file was last updated",
                          )}{" "}
                          <span className="font-medium">
                            {formattedStoredFileLastModifiedDate ??
                              t("at an unknown time")}
                          </span>
                          .{" "}
                          {t(
                            "Update it so the file storage snapshot reflects the latest case information.",
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void openPublishFileStorageModal({
                            mode: "update",
                            autoSubmit: true,
                          })
                        }
                        disabled={!canPublishCaseToFileStorage}
                        className="h-9 shrink-0 border border-amber-300/90 bg-white/90 px-4 text-amber-950 hover:bg-amber-100 dark:border-amber-300/30 dark:bg-amber-950/30 dark:text-amber-50 dark:hover:bg-amber-900/30"
                      >
                        {t("Update")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {areaKey === "cases" &&
          mode !== "create" &&
          hasThreeLetterCode &&
          hasStoredFileId ? (
            <section className={REPORT_CODE_PUBLISH_SECTION_CLASSNAME}>
              <div
                className={`flex flex-col gap-4 px-5 py-5 dark:border-indigo-300/16 lg:flex-row lg:items-start lg:justify-between ${
                  isReportCodeSectionExpanded
                    ? "border-b border-indigo-200/70"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setIsReportCodeSectionExpanded((current) => !current)
                  }
                  aria-expanded={isReportCodeSectionExpanded}
                  className="group max-w-3xl text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg font-semibold text-indigo-950 dark:text-indigo-50">
                      {t("Publish as report code")}
                    </h3>
                    <Badge
                      variant="outline"
                      className={
                        reportCodePublishConflictMessage ||
                        isStoredFileDocumentMissing
                          ? "border-amber-300 bg-amber-50/90 text-amber-950 dark:border-amber-300/30 dark:bg-amber-500/12 dark:text-amber-50"
                          : "border-indigo-200 bg-white/72 text-indigo-950 dark:border-indigo-300/18 dark:bg-indigo-400/10 dark:text-indigo-50"
                      }
                    >
                      {!hasFileStorageAccess
                        ? t("Restricted")
                        : isStoredFileDocumentMissing
                          ? t("Missing file")
                          : isReportCodeStatusLoading
                            ? t("Checking")
                            : isPublishedAsReportCode
                              ? t("Published")
                              : reportCodePublishConflictMessage
                                ? t("Conflict")
                                : t("Not published")}
                    </Badge>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-indigo-200/80 bg-white/72 text-indigo-950 transition-transform duration-200 group-hover:bg-white/90 dark:border-indigo-300/18 dark:bg-indigo-400/10 dark:text-indigo-50 dark:group-hover:bg-indigo-400/16">
                      {isReportCodeSectionExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-indigo-950/72 dark:text-indigo-50/74">
                    {t("Promote the current")} <code>file_storage</code>{" "}
                    {t(
                      "snapshot into a reusable 2PQ report code using the current signed-in admin as the report owner. The report code for this case is derived from the three-letter code as",
                    )}{" "}
                    <code>{expectedCaseLabelFromThreeLetterCode}</code>.
                  </p>
                </button>
                <div className="flex flex-wrap gap-2">
                  {isPublishedAsReportCode && hasFileStorageAccess ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      asChild
                      className={FILE_STORAGE_SECONDARY_BUTTON_CLASSNAME}
                    >
                      <Link
                        href={`/reports/${expectedCaseLabelFromThreeLetterCode}`}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {t("Show report code")}
                      </Link>
                    </Button>
                  ) : null}
                  {isPublishedAsReportCode &&
                  hasFileStorageAccess &&
                  reportCodeStatus?.uploadedReportId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      asChild
                      className={FILE_STORAGE_SECONDARY_BUTTON_CLASSNAME}
                    >
                      <Link
                        href={`/reports/uploads/${reportCodeStatus.uploadedReportId}`}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        {t("Show uploaded report")}
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openPublishReportCodeModal()}
                    disabled={!canPublishAsReportCode}
                    className={FILE_STORAGE_PRIMARY_BUTTON_CLASSNAME}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {t("Publish as report code")}
                  </Button>
                </div>
              </div>

              {isReportCodeSectionExpanded ? (
                <>
                  <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr),minmax(0,1fr)]">
                    <div className="rounded-[1.3rem] border border-indigo-100 bg-white/74 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                        {t("Report code")}
                      </p>
                      <p className="mt-2 font-mono text-sm text-indigo-950 dark:text-indigo-50">
                        {expectedCaseLabelFromThreeLetterCode}
                      </p>
                      <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                        {t(
                          "This is the 6-character code derived from the active three-letter code plus",
                        )}{" "}
                        <span className="font-mono">XXX</span>.
                      </p>
                    </div>
                    <div className="rounded-[1.3rem] border border-indigo-100 bg-white/74 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                        {t("Owner and source")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-indigo-950 dark:text-indigo-50">
                        {adminContext.email}
                      </p>
                      <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                        {t(
                          "The new report code will use the current admin user as owner, with provider format",
                        )}{" "}
                        <span className="font-mono">2pq</span>{" "}
                        {t("and stored file")}{" "}
                        <span className="font-mono">{storedFileId}</span>.
                      </p>
                    </div>
                    <div className="rounded-[1.3rem] border border-indigo-100 bg-white/74 px-4 py-4 shadow-[0_14px_34px_rgba(224,231,255,0.72)] dark:border-indigo-200/16 dark:bg-indigo-950/24 dark:shadow-none">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-950/52 dark:text-indigo-50/58">
                        {t("Current linkage")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-indigo-950 dark:text-indigo-50">
                        {isStoredFileDocumentMissing
                          ? t("Stored file document missing.")
                          : !hasFileStorageAccess
                            ? t(
                                "Only full admins can inspect or publish report-code linkage from this section.",
                              )
                            : isReportCodeStatusLoading
                              ? t("Checking current publish state...")
                              : isPublishedAsReportCode
                                ? t(
                                    "Report code already resolves back to this stored file.",
                                  )
                                : reportCodePublishConflictMessage
                                  ? reportCodePublishConflictMessage
                                  : t("No report code has been linked yet.")}
                      </p>
                      <p className="mt-2 text-xs text-indigo-950/62 dark:text-indigo-50/64">
                        {t("file_storage linked code:")}{" "}
                        <span className="font-mono">
                          {storedFileLinkedReportCode || t("Not linked yet")}
                        </span>
                        {" · "}
                        {t("uploaded report id:")}{" "}
                        <span className="font-mono">
                          {reportCodeStatus?.uploadedReportId ??
                            t("Not created yet")}
                        </span>
                      </p>
                    </div>
                  </div>

                  {hasFileStorageAccess &&
                  (storedFileDocumentQuery.isError ||
                    reportCodeStatusQuery.isError) ? (
                    <div className="px-5 pb-5">
                      <div className="rounded-[1.25rem] border border-amber-300/90 bg-amber-50/90 px-4 py-4 text-sm text-amber-950 shadow-[0_10px_22px_rgba(251,191,36,0.16)] dark:border-amber-300/30 dark:bg-amber-500/12 dark:text-amber-50">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                            <p>
                              {t(
                                "Unable to verify the latest report-code publish state right now. Retry the status check before publishing.",
                              )}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void storedFileDocumentQuery.refetch();
                              void reportCodeStatusQuery.refetch();
                            }}
                            className="h-9 shrink-0 border border-amber-300/90 bg-white/90 px-4 text-amber-950 hover:bg-amber-100 dark:border-amber-300/30 dark:bg-amber-950/30 dark:text-amber-50 dark:hover:bg-amber-900/30"
                          >
                            <RotateCcw className="h-4 w-4" />
                            {t("Retry status")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
