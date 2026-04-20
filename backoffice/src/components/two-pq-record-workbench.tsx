"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  FlaskConical,
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
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { OptionSelectField } from "@/components/constrained-fields";
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
import {
  type TwoPQAreaConfig,
  type TwoPQAreaKey,
  type TwoPQDetailRecord,
  type TwoPQListItem,
  type TwoPQMutableFieldKey,
  type TwoPQRecord,
  getTwoPQAreaConfig,
  getTwoPQRecordSubtitle,
  getTwoPQRecordTitle,
} from "@/lib/two-pq-areas";

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

const CREATION_CONFETTI = [
  { left: "10%", top: "18%", color: "var(--chart-4)", delay: "0ms", duration: "1080ms" },
  { left: "18%", top: "10%", color: "var(--chart-2)", delay: "60ms", duration: "980ms" },
  { left: "28%", top: "16%", color: "var(--chart-1)", delay: "110ms", duration: "1120ms" },
  { left: "40%", top: "8%", color: "var(--chart-5)", delay: "170ms", duration: "1020ms" },
  { left: "56%", top: "12%", color: "var(--chart-3)", delay: "220ms", duration: "1180ms" },
  { left: "68%", top: "14%", color: "var(--chart-4)", delay: "280ms", duration: "1040ms" },
  { left: "80%", top: "9%", color: "var(--chart-1)", delay: "330ms", duration: "1140ms" },
  { left: "88%", top: "20%", color: "var(--chart-2)", delay: "390ms", duration: "990ms" },
] as const;

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
const AUTO_SAMPLING_MIN_COPIES = 1;
const AUTO_SAMPLING_MAX_COPIES = 15;

function clampAutoSamplingCopies(value: number) {
  if (!Number.isFinite(value)) {
    return AUTO_SAMPLING_MIN_COPIES;
  }

  return Math.min(AUTO_SAMPLING_MAX_COPIES, Math.max(AUTO_SAMPLING_MIN_COPIES, Math.trunc(value)));
}

function formatThreeNumberCode(value: number) {
  return String(Math.max(0, Math.trunc(value))).padStart(3, "0");
}

function buildSixCharacterCode(threeLetterCode: string, order: number) {
  return `${normalizeThreeLetterCodeInput(threeLetterCode)}${formatThreeNumberCode(order)}`;
}

function buildAutoSamplingPreviewItems(threeLetterCode: string, copies: number): AutoSamplingPreviewItem[] {
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

function isAutoSamplingFormComplete(config: AutoSamplingFormState) {
  return Boolean(
    config.caseLabel.trim() &&
      config.sampleType.trim() &&
      config.processingStatus.trim()
  );
}

function normalizeThreeLetterCodeInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

function generateRandomThreeLetterCode(excludedValue?: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const normalizedExcludedValue = excludedValue?.trim().toUpperCase();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = Array.from({ length: 3 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)]
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
    (_, index) => normalizedCode[index] ?? placeholder
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
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={RELATION_SECTION_CLASSNAME}>
      <div className="flex flex-col gap-3 border-b border-emerald-200/70 px-5 py-4 dark:border-emerald-300/16">
        <div>
          <h3 className="font-heading text-lg font-semibold text-emerald-950 dark:text-emerald-50">{title}</h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-900/45 dark:text-emerald-50/56">
            {subtitle}
          </p>
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
}: {
  record: TwoPQListItem;
  badge: string;
  note?: string;
  actions?: ReactNode;
}) {
  const linkedArea = getTwoPQAreaConfig(record.areaKey);
  const title = linkedArea ? getTwoPQRecordTitle(linkedArea, record) : record.id;
  const subtitle = linkedArea ? getTwoPQRecordSubtitle(linkedArea, record) : "";

  return (
    <div className="rounded-[1.35rem] border border-emerald-100 [background:linear-gradient(180deg,rgba(255,255,255,0.82),rgba(240,253,244,0.82))] px-4 py-4 shadow-[0_12px_32px_rgba(220,252,231,0.82)] dark:border-emerald-300/18 dark:[background:linear-gradient(180deg,rgba(7,30,22,0.98),rgba(8,38,27,0.96)_52%,rgba(5,150,105,0.18))] dark:shadow-none">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/18 dark:bg-emerald-400/12 dark:text-emerald-50">
              {badge}
            </Badge>
            <span className="font-mono text-[11px] text-emerald-900/52 dark:text-emerald-50/58">{record.id}</span>
          </div>
          <p className="mt-3 text-base font-semibold text-emerald-950 dark:text-emerald-50">{title}</p>
          <p className="mt-1 text-sm text-emerald-900/68 dark:text-emerald-50/72">{subtitle || "Linked entity"}</p>
          {note ? <p className="mt-2 text-xs text-emerald-900/52 dark:text-emerald-50/58">{note}</p> : null}
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
}) {
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
            placeholder={`Search ${area.label.toLowerCase()}...`}
            className="border-emerald-100 bg-white/82 text-emerald-950 placeholder:text-emerald-900/35 dark:border-emerald-300/18 dark:bg-emerald-950/32 dark:text-emerald-50 dark:placeholder:text-emerald-50/32"
          />
          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {loading ? (
              <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                Loading available {area.navLabel.toLowerCase()}...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                No matching records available.
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
                        {getTwoPQRecordSubtitle(area, record) || "Linked entity"}
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
                          Open
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onSelect(record)}
                        disabled={pendingRecordId === record.id}
                        className={RELATION_PRIMARY_BUTTON_CLASSNAME}
                      >
                        {pendingRecordId === record.id ? "Linking..." : selectLabel}
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
  }
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

  return area.fieldGroups.flatMap((group) => group.fields.map((field) => field.key));
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
  patients: Array<{ id: string; fullName: string; institutionId: string; doctorId: string }>;
  preloadedBatch?: TwoPQListItem | null;
  preloadedCase?: TwoPQListItem | null;
  mode?: "create" | "edit";
}) {
  const area = getTwoPQAreaConfig(areaKey)!;
  const adminContext = useAdminContext();
  const router = useRouter();
  const scopedInstitutionId =
    adminContext.role === "institution_admin" || adminContext.role === "institution_doctor"
      ? adminContext.institutionId
      : undefined;
  const scopedDoctorId =
    adminContext.role === "institution_doctor" ? adminContext.doctorId : undefined;
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
      patientId: detail?.record.patientId ?? preloadedCase?.patientId ?? preloadedBatch?.patientId,
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
    ]
  );
  const [state, setState] = useState<FormState>(() => toFormState(detail?.record, defaults));
  const [pendingAction, setPendingAction] = useState<
    null | "create" | "replace" | "update" | "delete"
  >(null);
  const [pendingRelationRecordId, setPendingRelationRecordId] = useState<string | null>(null);
  const [relationDialog, setRelationDialog] = useState<RelationDialogKey | null>(null);
  const [relationQuery, setRelationQuery] = useState("");
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [latestErrorLog, setLatestErrorLog] = useState<ErrorLogState | null>(null);
  const [isErrorLogOpen, setIsErrorLogOpen] = useState(false);
  const [copiedErrorLog, setCopiedErrorLog] = useState(false);
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);
  const [draftBatch, setDraftBatch] = useState<TwoPQListItem | null>(() => preloadedBatch ?? null);
  const [draftCase, setDraftCase] = useState<TwoPQListItem | null>(() => preloadedCase ?? null);
  const [threeLetterCode, setThreeLetterCode] = useState(
    () => detail?.record.three_letter_code ?? ""
  );
  const [threeLetterCodeModal, setThreeLetterCodeModal] =
    useState<ThreeLetterCodeModalMode | null>(null);
  const [threeLetterCodeDraft, setThreeLetterCodeDraft] = useState("");
  const [pendingThreeLetterCodeAction, setPendingThreeLetterCodeAction] = useState(false);
  const [isAutoSamplingSetupOpen, setIsAutoSamplingSetupOpen] = useState(false);
  const [autoSamplingConfig, setAutoSamplingConfig] = useState<AutoSamplingFormState>(() => ({
    caseLabel: detail?.record.caseLabel ?? "",
    sampleType: "",
    processingStatus: "awaiting_reception",
    collectionDate: "",
    receptionDate: "",
    runId: "",
    qcStatus: "",
    notes: "",
  }));
  const [autoSamplingCopies, setAutoSamplingCopies] = useState(AUTO_SAMPLING_MIN_COPIES);
  const [autoSamplingProcess, setAutoSamplingProcess] = useState<AutoSamplingProcessState | null>(
    null
  );

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
  }, [detail?.record.caseLabel, detail?.record.id]);

  useEffect(() => {
    if (autoSamplingProcess?.status !== "success") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAutoSamplingProcess(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [autoSamplingProcess?.status]);

  const sourceState = useMemo(
    () => toFormState(detail?.record, defaults),
    [defaults, detail?.record]
  );
  const changedKeys = useMemo(
    () =>
      (Object.keys(state) as TwoPQMutableFieldKey[]).filter(
        (key) => state[key] !== sourceState[key]
      ),
    [sourceState, state]
  );
  const changed = changedKeys.length > 0;
  const availableDoctors = useMemo(
    () =>
      doctors.filter((doctor) =>
        state.institutionId ? doctor.institutionId === state.institutionId : true
      ),
    [doctors, state.institutionId]
  );
  const availablePatients = useMemo(
    () =>
      patients.filter((patient) => {
        if (state.institutionId && patient.institutionId !== state.institutionId) {
          return false;
        }
        if (state.doctorId && patient.doctorId !== state.doctorId) {
          return false;
        }
        return true;
      }),
    [patients, state.doctorId, state.institutionId]
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
  const canReplace = mode === "create" ? false : Boolean(detail?.record.canReplace);
  const canUpdate = mode === "create" ? false : Boolean(detail?.record.canUpdate);
  const canDelete = mode === "create" ? false : Boolean(detail?.record.canDelete);
  const batchArea = getTwoPQAreaConfig("sequencing")!;
  const caseArea = getTwoPQAreaConfig("cases")!;
  const samplingArea = getTwoPQAreaConfig("sampling")!;
  const autoSamplingProcessingOptions =
    samplingArea.fieldGroups
      .flatMap((group) => group.fields)
      .find((field) => field.key === "processingStatus")?.options ?? [];
  const normalizedThreeLetterCode = normalizeThreeLetterCodeInput(threeLetterCode);
  const hasThreeLetterCode = normalizedThreeLetterCode.length === 3;
  const normalizedThreeLetterCodeDraft = normalizeThreeLetterCodeInput(threeLetterCodeDraft);
  const canConfirmThreeLetterCode =
    threeLetterCodeModal === "remove" ? hasThreeLetterCode : normalizedThreeLetterCodeDraft.length === 3;
  const autoSamplingPreviewItems = useMemo(
    () => buildAutoSamplingPreviewItems(normalizedThreeLetterCode, autoSamplingCopies),
    [autoSamplingCopies, normalizedThreeLetterCode]
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
          .filter((sampleId): sampleId is string => Boolean(sampleId))
      ),
    [autoSamplingInventoryQuery.data?.records]
  );
  const autoSamplingConflictingCodes = useMemo(
    () =>
      autoSamplingPreviewItems
        .filter((item) => existingSamplingSampleIds.has(item.sixCharacterCode))
        .map((item) => item.sixCharacterCode),
    [autoSamplingPreviewItems, existingSamplingSampleIds]
  );
  const canGenerateAutoSampling =
    Boolean(detail?.record.canUpdate) &&
    isAutoSamplingFormComplete(autoSamplingConfig) &&
    autoSamplingConflictingCodes.length === 0 &&
    !autoSamplingInventoryQuery.isFetching &&
    !autoSamplingInventoryQuery.isError &&
    !autoSamplingProcess;
  const autoSamplingSuccessfulCount =
    autoSamplingProcess?.items.filter((item) => item.status === "success").length ?? 0;
  const autoSamplingErroredCount =
    autoSamplingProcess?.items.filter((item) => item.status === "error").length ?? 0;
  const autoSamplingPendingCount =
    autoSamplingProcess?.items.filter((item) => item.status === "pending").length ?? 0;
  const autoSamplingProgressPercent = autoSamplingProcess
    ? autoSamplingProcess.status === "success"
      ? 100
      : autoSamplingProcess.status === "validating"
        ? 96
        : Math.max(
            4,
            Math.round(
              (autoSamplingSuccessfulCount / Math.max(autoSamplingProcess.items.length, 1)) * 100
            )
          )
    : 0;
  const linkedBatch = mode === "create" ? draftBatch : detail?.linkedBatch ?? null;
  const linkedCase = mode === "create" ? draftCase : detail?.linkedCase ?? null;
  const linkedCases = detail?.linkedCases ?? [];
  const linkedSamplings = detail?.linkedSamplings ?? [];
  const loadBatchCandidates = relationDialog === "case-parent-batch";
  const loadCaseCandidates =
    relationDialog === "sampling-parent-case" || relationDialog === "sequencing-child-case";
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

  const linkedCaseIds = useMemo(() => new Set(linkedCases.map((record) => record.id)), [linkedCases]);
  const linkedSamplingIds = useMemo(
    () => new Set(linkedSamplings.map((record) => record.id)),
    [linkedSamplings]
  );
  const batchCandidates = useMemo(
    () => (batchesQuery.data?.records ?? []).filter((record) => record.id !== linkedBatch?.id),
    [batchesQuery.data?.records, linkedBatch?.id]
  );
  const sequencingCaseCandidates = useMemo(
    () => (casesQuery.data?.records ?? []).filter((record) => !linkedCaseIds.has(record.id)),
    [casesQuery.data?.records, linkedCaseIds]
  );
  const parentCaseCandidates = useMemo(
    () => (casesQuery.data?.records ?? []).filter((record) => record.id !== linkedCase?.id),
    [casesQuery.data?.records, linkedCase?.id]
  );
  const samplingCandidates = useMemo(
    () => (samplingsQuery.data?.records ?? []).filter((record) => !linkedSamplingIds.has(record.id)),
    [linkedSamplingIds, samplingsQuery.data?.records]
  );
  const sequencingCaseNotes = useMemo(
    () =>
      Object.fromEntries(
        sequencingCaseCandidates.map((record) => [
          record.id,
          record.parent_batch && record.parent_batch !== detail?.record.id
            ? `Currently linked to batch ${record.parent_batch}. Linking here will move it.`
            : "This case will become a child of the current batch.",
        ])
      ),
    [detail?.record.id, sequencingCaseCandidates]
  );
  const samplingNotes = useMemo(
    () =>
      Object.fromEntries(
        samplingCandidates.map((record) => [
          record.id,
          record.parent_case && record.parent_case !== detail?.record.id
            ? `Currently linked to case ${record.parent_case}. Linking here will move it.`
            : "This sampling record will become a child of the current case.",
        ])
      ),
    [detail?.record.id, samplingCandidates]
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
    }
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

  function pushErrorToast(error: unknown, fallbackMessage: string, title = "Request log") {
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
    setLatestErrorLog((current) => current ?? { title: "Request log", details });
    setIsErrorLogOpen(true);
  }

  async function handleCopyErrorLog() {
    if (!latestErrorLog?.details) {
      return;
    }

    try {
      await navigator.clipboard.writeText(latestErrorLog.details);
      setCopiedErrorLog(true);
    } catch {
      pushToast("error", "Unable to copy the error log.", { durationMs: 7000 });
    }
  }

  function openThreeLetterCodeModal(mode: ThreeLetterCodeModalMode) {
    if (mode === "manual") {
      setThreeLetterCodeDraft(normalizedThreeLetterCode);
    } else if (mode === "random") {
      setThreeLetterCodeDraft(generateRandomThreeLetterCode(normalizedThreeLetterCode));
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
        normalizedThreeLetterCodeDraft || normalizedThreeLetterCode
      )
    );
  }

  async function handleThreeLetterCodeConfirm() {
    if (!detail || !threeLetterCodeModal || !canConfirmThreeLetterCode) {
      return;
    }

    const nextThreeLetterCode =
      threeLetterCodeModal === "remove" ? "" : normalizedThreeLetterCodeDraft;

    setPendingThreeLetterCodeAction(true);
    try {
      await sdkFetch<{ record: TwoPQRecord }>(`/2pq/${area.key}/${detail.record.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          three_letter_code: nextThreeLetterCode,
        }),
      });

      setThreeLetterCode(nextThreeLetterCode);
      closeThreeLetterCodeModal(true);
      pushToast(
        "success",
        threeLetterCodeModal === "remove"
          ? "Three letter code removed."
          : hasThreeLetterCode
            ? "Three letter code updated."
            : "Three letter code saved."
      );
      router.refresh();
    } catch (error) {
      pushErrorToast(
        error,
        threeLetterCodeModal === "remove"
          ? "Unable to remove the three letter code."
          : "Unable to save the three letter code.",
        "Three letter code request"
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
      processingStatus: autoSamplingProcessingOptions[0]?.value ?? "awaiting_reception",
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

  function updateAutoSamplingConfig<Key extends keyof AutoSamplingFormState>(
    key: Key,
    value: AutoSamplingFormState[Key]
  ) {
    setAutoSamplingConfig((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleAutoSamplingCopiesChange(value: number) {
    setAutoSamplingCopies(clampAutoSamplingCopies(value));
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

  async function lookupSamplingBySampleId(sampleId: string) {
    const response = await sdkFetch<{ records: TwoPQListItem[] }>(
      `/2pq/sampling?query=${encodeURIComponent(sampleId)}`
    );

    return response.records.find(
      (record) => record.sampleId?.trim().toUpperCase() === sampleId.toUpperCase()
    );
  }

  function buildAutoSamplingPayload(config: AutoSamplingFormState, sampleId: string) {
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

    const caseDetail = await sdkFetch<TwoPQDetailRecord>(`/2pq/cases/${detail.record.id}`);
    const linkedSamplingIds = new Set(caseDetail.linkedSamplings.map((record) => record.id));

    for (const item of items) {
      if (!item.samplingRecordId) {
        throw new Error(`Sampling ${item.sixCharacterCode} is missing a created record id.`);
      }

      const samplingDetail = await sdkFetch<TwoPQDetailRecord>(
        `/2pq/sampling/${item.samplingRecordId}`
      );
      const linkedSampleId = samplingDetail.record.sampleId?.trim().toUpperCase() ?? "";

      if (linkedSampleId !== item.sixCharacterCode) {
        throw new Error(
          `Sampling ${item.sixCharacterCode} was created with sample ID ${linkedSampleId || "<empty>"}.`
        );
      }

      if (samplingDetail.record.parent_case !== detail.record.id) {
        throw new Error(
          `Sampling ${item.sixCharacterCode} is linked to case ${samplingDetail.record.parent_case ?? "<none>"} instead of ${detail.record.id}.`
        );
      }

      if (!linkedSamplingIds.has(item.samplingRecordId)) {
        throw new Error(
          `Current case ${detail.record.id} does not list sampling ${item.samplingRecordId} in linked samplings.`
        );
      }
    }
  }

  async function finalizeAutoSamplingProcess(
    items: AutoSamplingProcessItem[],
    config: AutoSamplingFormState
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
        `${items.length} sampling record${items.length === 1 ? "" : "s"} created and linked.`
      );
      setAutoSamplingProcess({
        config,
        items,
        status: "success",
        currentIndex: null,
      });
    } catch (error) {
      const presentation = getErrorPresentation(error, "Final validation failed.");
      setAutoSamplingProcess({
        config,
        items,
        status: "paused",
        currentIndex: null,
        errorTitle: "Auto sampling validation",
        errorDetails: presentation.details,
      });
    }
  }

  async function runAutoSamplingProcess(
    items: AutoSamplingProcessItem[],
    config: AutoSamplingFormState,
    startIndex: number
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
        const existingSampling = await lookupSamplingBySampleId(nextItems[index].sixCharacterCode);
        if (existingSampling) {
          if (existingSampling.parent_case !== detail.record.id) {
            throw new Error(
              `Sample ID ${nextItems[index].sixCharacterCode} is already used by sampling ${existingSampling.id}.`
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

        const response = await sdkFetch<{ record: TwoPQRecord }>("/2pq/sampling", {
          method: "POST",
          body: JSON.stringify(
            buildAutoSamplingPayload(config, nextItems[index].sixCharacterCode)
          ),
        });

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
          `Unable to create sampling ${nextItems[index].sixCharacterCode}.`
        );
        nextItems[index] = {
          ...nextItems[index],
          status: "error",
          errorTitle: `Create ${nextItems[index].sixCharacterCode}`,
          errorDetails: presentation.details,
        };
        setAutoSamplingProcess({
          config,
          items: [...nextItems],
          status: "paused",
          currentIndex: index,
          errorTitle: `Create ${nextItems[index].sixCharacterCode}`,
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
    const items: AutoSamplingProcessItem[] = autoSamplingPreviewItems.map((item) => ({
      ...item,
      attempts: 0,
      status: "pending",
    }));

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
        autoSamplingProcess.config
      );
      return;
    }

    void runAutoSamplingProcess(
      autoSamplingProcess.items.map((item) => ({ ...item })),
      autoSamplingProcess.config,
      autoSamplingProcess.currentIndex
    );
  }

  function syncDraftScope(
    current: FormState,
    parent: Pick<TwoPQListItem, "institutionId" | "doctorId" | "patientId">,
    options?: { caseLabel?: string; patientId?: string }
  ) {
    const scopeChanged =
      current.institutionId !== parent.institutionId || current.doctorId !== parent.doctorId;

    return {
      ...current,
      institutionId: parent.institutionId,
      doctorId: parent.doctorId,
      patientId:
        options?.patientId ?? (scopeChanged ? parent.patientId ?? "" : current.patientId),
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
    logTitle = "Relation request log"
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
    logTitle = "Relation update log"
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
      logTitle
    );
  }

  function handleDraftBatchSelection(record: TwoPQListItem) {
    setDraftBatch(record);
    setState((current) => syncDraftScope(current, record));
    setRelationDialog(null);
    setRelationQuery("");
    pushToast("success", "Batch preloaded for the new case.");
  }

  function handleDraftCaseSelection(record: TwoPQListItem) {
    setDraftCase(record);
    setState((current) =>
      syncDraftScope(current, record, {
        caseLabel: record.caseLabel ?? current.caseLabel,
        patientId: record.patientId ?? "",
      })
    );
    setRelationDialog(null);
    setRelationQuery("");
    pushToast("success", "Case preloaded for the new sampling record.");
  }

  function handleClearDraftBatch() {
    setDraftBatch(null);
    pushToast("success", "Batch removed from the draft case.");
  }

  function handleClearDraftCase() {
    setDraftCase(null);
    pushToast("success", "Case removed from the draft sampling record.");
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
      "Batch linked to case.",
      "Unable to link the selected batch.",
      "Link batch to case"
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
      "Batch unlinked from case.",
      "Unable to unlink the batch.",
      "Unlink batch from case"
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
      "Case linked to sampling.",
      "Unable to link the selected case.",
      "Link case to sampling"
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
      "Case unlinked from sampling.",
      "Unable to unlink the case.",
      "Unlink case from sampling"
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
      "Case linked to batch.",
      "Unable to link the selected case.",
      "Link case to batch"
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
      "Case unlinked from batch.",
      "Unable to unlink the case.",
      "Unlink case from batch"
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
      "Sampling linked to case.",
      "Unable to link the selected sampling.",
      "Link sampling to case"
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
      "Sampling unlinked from case.",
      "Unable to unlink the sampling.",
      "Unlink sampling from case"
    );
  }

  async function handleCreate() {
    if (!validateRequiredFields()) {
      return;
    }

    setPendingAction("create");
    try {
      const payload = buildPayload(getFieldKeys(areaKey));
      if (areaKey === "cases" && draftBatch?.id) {
        payload.parent_batch = draftBatch.id;
      }
      if (areaKey === "sampling" && draftCase?.id) {
        payload.parent_case = draftCase.id;
      }

      const response = await sdkFetch<{ record: TwoPQRecord }>(`/2pq/${area.key}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreatedRecordId(response.record.id);
      pushToast("success", `${area.label} record created.`);
    } catch (error) {
      setCreatedRecordId(null);
      pushErrorToast(
        error,
        `Unable to create ${area.label.toLowerCase()} record.`,
        `Create ${area.label} record`
      );
      setPendingAction(null);
    }
  }

  function handleContinue() {
    if (!createdRecordId) {
      return;
    }

    router.push(`${area.route}?createdId=${encodeURIComponent(createdRecordId)}`);
  }

  async function handleReplace() {
    if (!detail || !validateRequiredFields()) {
      return;
    }

    setPendingAction("replace");
    try {
      await sdkFetch<{ record: TwoPQRecord }>(`/2pq/${area.key}/${detail.record.id}`, {
        method: "PUT",
        body: JSON.stringify(buildPayload(getFieldKeys(areaKey))),
      });
      pushToast("success", `${area.label} record replaced.`);
      router.refresh();
    } catch (error) {
      pushErrorToast(
        error,
        `Unable to replace ${area.label.toLowerCase()} record.`,
        `Replace ${area.label} record`
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
      await sdkFetch<{ record: TwoPQRecord }>(`/2pq/${area.key}/${detail.record.id}`, {
        method: "PATCH",
        body: JSON.stringify(buildPayload(changedKeys)),
      });
      pushToast("success", `${area.label} record updated.`);
      router.refresh();
    } catch (error) {
      pushErrorToast(
        error,
        `Unable to update ${area.label.toLowerCase()} record.`,
        `Update ${area.label} record`
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    if (!detail) {
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
        `Unable to delete ${area.label.toLowerCase()} record.`,
        `Delete ${area.label} record`
      );
      setPendingAction(null);
    }
  }

  const canManageRelations = mode === "create" ? true : Boolean(detail?.record.canUpdate);

  return (
    <div className="flex flex-col gap-5">
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        onViewLog={toast?.tone === "error" && toast.details ? handleErrorLogOpen : null}
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
              {latestErrorLog?.title ?? "Request log"}
            </DialogTitle>
            <DialogDescription className="text-emerald-900/65">
              Full request error log. You can copy this message for debugging.
            </DialogDescription>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-5 top-5 h-9 w-9 rounded-full text-emerald-950 hover:bg-emerald-100/80"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close error log</span>
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
                {copiedErrorLog ? "Copied" : "Copy error"}
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
                Close
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
                ? "Remove three letter code"
                : threeLetterCodeModal === "random"
                  ? "Generate random three letter code"
                  : hasThreeLetterCode
                    ? "Edit three letter code"
                    : "Add three letter code"}
            </DialogTitle>
            <DialogDescription className="text-fuchsia-950/68 dark:text-fuchsia-50/72">
              {threeLetterCodeModal === "remove"
                ? "This will clear the unique three-letter shortcut stored on the case document."
                : "This short letter-only identifier is unique to the case and is stored in Firebase as three_letter_code."}
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
              <span className="sr-only">Close three letter code modal</span>
            </Button>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="rounded-[1.4rem] border border-fuchsia-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                Preview
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
                  ? "Removing it frees the code so another case can use it later."
                  : "Exactly three letters. The code is always stored and shown in uppercase."}
              </p>
            </div>

            {threeLetterCodeModal === "manual" ? (
              <div className="space-y-2">
                <Label htmlFor="three-letter-code-input">Three letter code</Label>
                <Input
                  id="three-letter-code-input"
                  value={threeLetterCodeDraft}
                  onChange={(event) =>
                    setThreeLetterCodeDraft(normalizeThreeLetterCodeInput(event.target.value))
                  }
                  placeholder="ABC"
                  autoComplete="off"
                  maxLength={3}
                  disabled={pendingThreeLetterCodeAction}
                  className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                />
                <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                  Letters only. Use this when you want to reserve a specific short code for the case.
                </p>
              </div>
            ) : null}

            {threeLetterCodeModal === "random" ? (
              <div className="space-y-3">
                <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                  <p className="text-sm text-fuchsia-950/72 dark:text-fuchsia-50/72">
                    A random candidate is ready. If you want another option before saving, generate a new suggestion.
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
                  Regenerate
                </Button>
              </div>
            ) : null}

            {threeLetterCodeModal === "remove" ? (
              <div className="rounded-[1.25rem] border border-fuchsia-200/90 bg-white/72 px-4 py-4 text-sm text-fuchsia-950/72 dark:border-fuchsia-300/18 dark:bg-fuchsia-950/24 dark:text-fuchsia-50/72">
                This case will no longer display a three letter code until a new one is assigned.
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
              disabled={!canConfirmThreeLetterCode || pendingThreeLetterCodeAction}
              className={`${THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME} h-11 px-6`}
            >
              {pendingThreeLetterCodeAction ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : threeLetterCodeModal === "remove" ? (
                <Trash2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isAutoSamplingSetupOpen} onOpenChange={setIsAutoSamplingSetupOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-5xl overflow-hidden rounded-[2rem] border border-fuchsia-100 [background:linear-gradient(155deg,rgba(254,250,255,0.98),rgba(250,245,255,0.98)_54%,rgba(244,214,255,0.94))] p-0 text-fuchsia-950 shadow-[0_34px_120px_rgba(168,85,247,0.22)] dark:border-fuchsia-400/28 dark:[background:linear-gradient(150deg,rgba(34,17,45,0.98),rgba(54,24,66,0.96)_48%,rgba(168,85,247,0.2))] dark:text-fuchsia-50 dark:shadow-[0_30px_110px_rgba(88,28,135,0.36)]"
        >
          <DialogHeader className="relative border-b border-fuchsia-100 px-6 py-5 pr-16 dark:border-fuchsia-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
              Add multiple samplings at once
            </DialogTitle>
            <DialogDescription className="text-fuchsia-950/68 dark:text-fuchsia-50/72">
              Configure one sampling template, then generate sequential sampling records linked to
              the current case one by one.
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={closeAutoSamplingSetupModal}
              className="absolute right-5 top-5 h-9 w-9 rounded-full text-fuchsia-950 hover:bg-fuchsia-100/80 dark:text-fuchsia-50 dark:hover:bg-fuchsia-900/36"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close multiple sampling modal</span>
            </Button>
          </DialogHeader>

          <div className="space-y-6 px-6 py-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                  Parent case ID
                </p>
                <p className="mt-2 font-mono text-sm text-fuchsia-950 dark:text-fuchsia-50">
                  {detail?.record.id}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                  Three letter code
                </p>
                <p className="mt-2 font-mono text-sm text-fuchsia-950 dark:text-fuchsia-50">
                  {normalizedThreeLetterCode}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-fuchsia-100 bg-white/72 px-4 py-4 shadow-[0_12px_30px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                  Sample ID pattern
                </p>
                <p className="mt-2 font-mono text-sm text-fuchsia-950 dark:text-fuchsia-50">
                  {autoSamplingPreviewItems[0]?.sixCharacterCode}...
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="auto-sampling-case-label">Case label</Label>
                <Input
                  id="auto-sampling-case-label"
                  value={autoSamplingConfig.caseLabel}
                  onChange={(event) => updateAutoSamplingConfig("caseLabel", event.target.value)}
                  placeholder="CMS-2026-001"
                  className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                />
                <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                  This label is written into every generated sampling record.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-sampling-sample-type">Sample type</Label>
                <Input
                  id="auto-sampling-sample-type"
                  value={autoSamplingConfig.sampleType}
                  onChange={(event) => updateAutoSamplingConfig("sampleType", event.target.value)}
                  placeholder="Blood"
                  className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                />
                <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                  Required. This value is copied into each sampling.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Processing status</Label>
                <Select
                  value={autoSamplingConfig.processingStatus}
                  onValueChange={(value) => updateAutoSamplingConfig("processingStatus", value)}
                >
                  <SelectTrigger className="w-full border-fuchsia-100 bg-white/82 text-fuchsia-950 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50">
                    <SelectValue placeholder="Select processing status" />
                  </SelectTrigger>
                  <SelectContent>
                    {autoSamplingProcessingOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                  Required. All generated samplings start with this processing state.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-sampling-run-id">Run ID</Label>
                <Input
                  id="auto-sampling-run-id"
                  value={autoSamplingConfig.runId}
                  onChange={(event) => updateAutoSamplingConfig("runId", event.target.value)}
                  placeholder="SEQ-0007"
                  className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                />
                <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                  Optional batch or sequencing run pointer.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-sampling-collection-date">Collection date</Label>
                <Input
                  id="auto-sampling-collection-date"
                  type="date"
                  value={autoSamplingConfig.collectionDate}
                  onChange={(event) =>
                    updateAutoSamplingConfig("collectionDate", event.target.value)
                  }
                  className="border-fuchsia-100 bg-white/82 text-fuchsia-950 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50"
                />
                <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                  Optional collection date copied into every generated record.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-sampling-reception-date">Reception date</Label>
                <Input
                  id="auto-sampling-reception-date"
                  type="date"
                  value={autoSamplingConfig.receptionDate}
                  onChange={(event) =>
                    updateAutoSamplingConfig("receptionDate", event.target.value)
                  }
                  className="border-fuchsia-100 bg-white/82 text-fuchsia-950 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50"
                />
                <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                  Optional reception date copied into every generated record.
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="auto-sampling-qc-status">QC status</Label>
                <Input
                  id="auto-sampling-qc-status"
                  value={autoSamplingConfig.qcStatus}
                  onChange={(event) => updateAutoSamplingConfig("qcStatus", event.target.value)}
                  placeholder="Passed"
                  className="border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                />
                <p className="text-xs text-fuchsia-950/62 dark:text-fuchsia-50/62">
                  Optional quality-control outcome shared by the generated set.
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="auto-sampling-notes">Notes</Label>
                <Textarea
                  id="auto-sampling-notes"
                  value={autoSamplingConfig.notes}
                  onChange={(event) => updateAutoSamplingConfig("notes", event.target.value)}
                  placeholder="Reception issues, missing tubes, or extraction notes..."
                  className="min-h-[7rem] border-fuchsia-100 bg-white/82 text-fuchsia-950 placeholder:text-fuchsia-950/32 dark:border-fuchsia-200/18 dark:bg-fuchsia-950/28 dark:text-fuchsia-50 dark:placeholder:text-fuchsia-50/32"
                />
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-fuchsia-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <Label htmlFor="auto-sampling-copies">Number of copies</Label>
                  <Input
                    id="auto-sampling-copies"
                    type="number"
                    min={AUTO_SAMPLING_MIN_COPIES}
                    max={AUTO_SAMPLING_MAX_COPIES}
                    value={autoSamplingCopies}
                    onChange={(event) =>
                      handleAutoSamplingCopiesChange(Number.parseInt(event.target.value || "1", 10))
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
                      handleAutoSamplingCopiesChange(Number.parseInt(event.target.value, 10))
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
                    6 character codes to be generated
                  </h3>
                  <p className="mt-1 text-sm text-fuchsia-950/68 dark:text-fuchsia-50/72">
                    Each sequential sampling will use the current case three-letter code plus its
                    matching 3 number code as the final sample ID.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-fuchsia-200 bg-white/72 text-fuchsia-950 dark:border-fuchsia-300/18 dark:bg-fuchsia-400/10 dark:text-fuchsia-50"
                >
                  {autoSamplingPreviewItems.length} planned
                </Badge>
              </div>

              {autoSamplingInventoryQuery.isFetching ? (
                <div className={THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME}>
                  Validating existing sampling IDs before generation...
                </div>
              ) : null}

              {autoSamplingInventoryQuery.isError ? (
                <div className={THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME}>
                  Existing sampling IDs could not be validated right now. Fix the connection issue
                  before running this batch.
                </div>
              ) : null}

              {autoSamplingConflictingCodes.length > 0 ? (
                <div className="rounded-[1.35rem] border border-destructive/28 bg-destructive/8 px-4 py-4 text-sm text-destructive">
                  These sample IDs already exist and block generation:{" "}
                  <span className="font-mono">{autoSamplingConflictingCodes.join(", ")}</span>
                </div>
              ) : null}

              {!isAutoSamplingFormComplete(autoSamplingConfig) ? (
                <div className={THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME}>
                  Fill the required fields: case label, sample type, and processing status.
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                      Sample ID to be created for this sequential sampling slot.
                    </p>
                  </div>
                ))}
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
              <FlaskConical className="h-4 w-4" />
              Generate
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
          className="max-w-5xl overflow-hidden rounded-[2rem] border border-fuchsia-100 [background:linear-gradient(155deg,rgba(254,250,255,0.98),rgba(250,245,255,0.98)_54%,rgba(244,214,255,0.94))] p-0 text-fuchsia-950 shadow-[0_34px_120px_rgba(168,85,247,0.22)] dark:border-fuchsia-400/28 dark:[background:linear-gradient(150deg,rgba(34,17,45,0.98),rgba(54,24,66,0.96)_48%,rgba(168,85,247,0.2))] dark:text-fuchsia-50 dark:shadow-[0_30px_110px_rgba(88,28,135,0.36)]"
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
                  Auto Sampling Creation Modal
                </p>
                <h3 className="mt-2 font-heading text-3xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                  Sequential sampling batch completed
                </h3>
                <p className="mt-3 max-w-2xl text-sm text-fuchsia-950/72 dark:text-fuchsia-50/76">
                  All {autoSamplingProcess.items.length} sampling records were created, validated,
                  and linked to case <span className="font-mono">{detail?.record.id}</span>.
                </p>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader className="relative border-b border-fuchsia-100 px-6 py-5 pr-16 dark:border-fuchsia-300/16">
                <DialogTitle className="font-heading text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                  Auto sampling creation modal
                </DialogTitle>
                <DialogDescription className="text-fuchsia-950/68 dark:text-fuchsia-50/72">
                  Sampling records are generated sequentially with the current case as their linked
                  parent case.
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
                    <span className="sr-only">Close auto sampling creation modal</span>
                  </Button>
                ) : null}
              </DialogHeader>

              <div className="space-y-5 px-6 py-5">
                <div className="rounded-[1.5rem] border border-fuchsia-100 bg-white/72 px-5 py-5 shadow-[0_14px_36px_rgba(250,232,255,0.6)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        Process progress
                      </p>
                      <p className="mt-2 text-sm text-fuchsia-950/72 dark:text-fuchsia-50/72">
                        {autoSamplingProcess?.status === "running"
                          ? `Creating ${autoSamplingProcess.items[autoSamplingProcess.currentIndex ?? 0]?.sixCharacterCode ?? ""} right now.`
                          : autoSamplingProcess?.status === "validating"
                            ? "Running the final validation pass across every created sampling."
                            : "The process is paused. Review the error, then retry from the blocked step."}
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
                        Created
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                        {autoSamplingSuccessfulCount}
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] border border-fuchsia-100 bg-white/78 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        Pending
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                        {autoSamplingPendingCount}
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] border border-fuchsia-100 bg-white/78 px-4 py-4 dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-950/52 dark:text-fuchsia-50/58">
                        Blocked
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                        {autoSamplingErroredCount}
                      </p>
                    </div>
                  </div>
                </div>

                {autoSamplingProcess?.status === "paused" ? (
                  <div className="rounded-[1.35rem] border border-destructive/28 bg-destructive/8 px-4 py-4 text-sm text-destructive">
                    {autoSamplingProcess.errorTitle ?? "Auto sampling paused"}. Retry continues from
                    the blocked sequential step.
                  </div>
                ) : null}

                <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
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
                            {item.status}
                          </Badge>
                          <span className="font-mono text-xs text-fuchsia-950/58 dark:text-fuchsia-50/58">
                            {item.threeNumberCode}
                          </span>
                        </div>
                        <span className="text-xs text-fuchsia-950/58 dark:text-fuchsia-50/58">
                          Attempt {item.attempts}
                        </span>
                      </div>
                      <p className="mt-3 font-mono text-lg font-semibold tracking-[0.08em] text-fuchsia-950 dark:text-fuchsia-50">
                        {item.sixCharacterCode}
                      </p>
                      <p className="mt-2 text-xs text-fuchsia-950/60 dark:text-fuchsia-50/60">
                        Sample ID for sequential slot #{item.order}.
                      </p>
                      {item.samplingRecordId ? (
                        <p className="mt-3 text-xs text-fuchsia-950/68 dark:text-fuchsia-50/68">
                          Created record:{" "}
                          <span className="font-mono">{item.samplingRecordId}</span>
                        </p>
                      ) : null}
                      {item.status === "error" ? (
                        <p className="mt-3 text-xs text-destructive">
                          Generation paused on this item. Inspect the error log for details.
                        </p>
                      ) : null}
                    </div>
                  ))}
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
                    Inspect error
                  </Button>
                  <Button
                    type="button"
                    onClick={handleRetryAutoSamplingProcess}
                    className={`${THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME} h-11 px-6`}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry
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
        title="Link Batch"
        description="Select the sequencing batch that should act as the parent entity for this case."
        records={batchCandidates}
        loading={batchesQuery.isFetching}
        pendingRecordId={pendingRelationRecordId}
        query={relationQuery}
        onQueryChange={setRelationQuery}
        onSelect={(record) => void handleLinkBatchToCase(record)}
        selectLabel={mode === "create" ? "Use batch" : "Link batch"}
      />
      <RelationSelectionDialog
        open={relationDialog === "sampling-parent-case"}
        onOpenChange={handleRelationDialogChange}
        area={caseArea}
        title="Link Case"
        description="Select the parent case that should own this sampling record."
        records={parentCaseCandidates}
        loading={casesQuery.isFetching}
        pendingRecordId={pendingRelationRecordId}
        query={relationQuery}
        onQueryChange={setRelationQuery}
        onSelect={(record) => void handleLinkCaseToSampling(record)}
        selectLabel={mode === "create" ? "Use case" : "Link case"}
      />
      <RelationSelectionDialog
        open={relationDialog === "sequencing-child-case"}
        onOpenChange={handleRelationDialogChange}
        area={caseArea}
        title="Link Existing Case"
        description="Attach an existing case to this sequencing batch. If the case already belongs to another batch, it will be moved."
        records={sequencingCaseCandidates}
        loading={casesQuery.isFetching}
        pendingRecordId={pendingRelationRecordId}
        query={relationQuery}
        onQueryChange={setRelationQuery}
        onSelect={(record) => void handleLinkExistingCase(record)}
        selectLabel="Link case"
        noteByRecordId={sequencingCaseNotes}
      />
      <RelationSelectionDialog
        open={relationDialog === "case-child-sampling"}
        onOpenChange={handleRelationDialogChange}
        area={samplingArea}
        title="Link Existing Sampling"
        description="Attach an existing sampling record to this case. If it already belongs to another case, it will be moved."
        records={samplingCandidates}
        loading={samplingsQuery.isFetching}
        pendingRecordId={pendingRelationRecordId}
        query={relationQuery}
        onQueryChange={setRelationQuery}
        onSelect={(record) => void handleLinkExistingSampling(record)}
        selectLabel="Link sampling"
        noteByRecordId={samplingNotes}
      />
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
                Entity Created
              </p>
              <h3 className="mt-2 font-heading text-3xl font-semibold text-white">
                {area.label} record launched
              </h3>
              <p className="mt-2 max-w-md text-sm text-emerald-50/84">
                New record <span className="font-mono text-emerald-50">{createdRecordId}</span> is
                live and ready in the full {area.navLabel.toLowerCase()} list.
              </p>
              <Button
                onClick={handleContinue}
                className="mt-6 h-12 rounded-[1.1rem] border border-emerald-100/12 bg-[linear-gradient(180deg,rgba(110,231,183,0.98),rgba(16,185,129,0.96))] px-6 text-sm font-semibold text-emerald-950 shadow-[0_18px_48px_rgba(16,185,129,0.26)]"
              >
                Continue
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
            Back to {area.navLabel.toLowerCase()}
          </Link>
        </Button>
        {detail ? (
          <span className="font-mono text-xs text-muted-foreground">{detail.record.id}</span>
        ) : null}
        <Badge variant="outline">{area.collectionKey}</Badge>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">2PQ</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? area.createLabel : `${area.label} workbench`}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{area.summary}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState(sourceState)}
              disabled={!changed || pendingAction !== null}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
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
                  {pendingAction === "replace" ? "Replacing..." : "Replace"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleUpdate()}
                  disabled={!canUpdate || !changed || pendingAction !== null}
                >
                  <Save className="h-3.5 w-3.5" />
                  {pendingAction === "update" ? "Updating..." : "Update"}
                </Button>
                {canDelete ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={pendingAction !== null}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogMedia className="bg-destructive/12 text-destructive">
                          <AlertTriangle className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Delete {area.label} record?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes the Firestore document from <code>{area.collectionKey}</code>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => void handleDelete()}
                        >
                          Delete record
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="brand">Create</Badge>
          <Badge variant={canReplace ? "brand" : "outline"}>Replace</Badge>
          <Badge variant={canUpdate ? "success" : "outline"}>Update</Badge>
          <Badge variant={canDelete ? "destructive" : "outline"}>Delete</Badge>
        </div>

        {mode === "create" ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-0">
            <div className="pointer-events-auto mx-auto md:ml-[calc(var(--sidebar-width)+1rem)] md:mr-6 lg:mr-8">
              <div className="two-pq-create-dock rounded-[1.7rem] border border-white/12 bg-background/72 p-4 shadow-[0_-10px_38px_rgba(7,16,24,0.12),0_20px_48px_rgba(7,16,24,0.18)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/54">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/86">
                      Launch New Record
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {changed
                        ? `${changedKeys.length} field${changedKeys.length === 1 ? "" : "s"} staged for this ${area.label.toLowerCase()} record.`
                        : `Fill the required fields, then launch the ${area.label.toLowerCase()} record.`}
                    </p>
                  </div>
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
                      ? "Record created"
                      : pendingAction === "create"
                        ? "Creating record..."
                        : "Create Record"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className={mode === "create" ? "grid gap-4 pb-40 md:pb-44" : "grid gap-4"}>
          {areaKey === "sequencing" || areaKey === "cases" || areaKey === "sampling" ? (
            <div className={RELATION_STRIP_CLASSNAME}>
          {areaKey === "sequencing" ? (
            <RelationSection
              title="Linked cases"
              subtitle="Children entities"
              actions={
                mode === "create" ? (
                  <span className={RELATION_HINT_CLASSNAME}>
                    Create this batch first to start linking cases.
                  </span>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRelationDialog("sequencing-child-case")}
                      disabled={!canManageRelations || pendingRelationRecordId !== null}
                      className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Link existing
                    </Button>
                    {hasThreeLetterCode ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={openAutoSamplingSetupModal}
                        disabled={!canManageRelations || Boolean(autoSamplingProcess)}
                        className={THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME}
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        Add multiple samplings at once
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      asChild
                      className={RELATION_PRIMARY_BUTTON_CLASSNAME}
                    >
                      <Link href={`${caseArea.route}/new?batchId=${encodeURIComponent(detail!.record.id)}`}>
                        <Plus className="h-3.5 w-3.5" />
                        New case
                      </Link>
                    </Button>
                  </>
                )
              }
            >
              {mode === "create" ? (
                <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                  Save the sequencing batch, then link existing cases or create a new child case with
                  the batch preloaded.
                </div>
              ) : linkedCases.length === 0 ? (
                <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                  No cases are linked to this batch yet.
                </div>
              ) : (
                <div className="grid gap-3">
                  {linkedCases.map((record) => (
                    <LinkedEntityCard
                      key={record.id}
                      record={record}
                      badge="Case"
                      actions={
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                          >
                            <Link href={getRecordHref(record)}>
                              Open
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleUnlinkExistingCase(record)}
                            disabled={!canManageRelations || pendingRelationRecordId === record.id}
                            className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                          >
                            {pendingRelationRecordId === record.id ? "Unlinking..." : "Unlink"}
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
              title="Linked Batch"
              subtitle="Parent entity"
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openRelationDialog("case-parent-batch")}
                    disabled={!canManageRelations || pendingRelationRecordId !== null}
                    className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {linkedBatch ? "Change batch" : "Link batch"}
                  </Button>
                  {linkedBatch ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleUnlinkBatchFromCase()}
                      disabled={!canManageRelations || pendingRelationRecordId === linkedBatch.id}
                      className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                    >
                      {pendingRelationRecordId === linkedBatch.id ? "Unlinking..." : "Unlink"}
                    </Button>
                  ) : null}
                </>
              }
            >
              {linkedBatch ? (
                <LinkedEntityCard
                  record={linkedBatch}
                  badge="Batch"
                  note="The batch is the parent entity. Unlinking removes the relationship only."
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                    >
                      <Link href={getRecordHref(linkedBatch)}>
                        Open
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                  No parent batch is linked to this case yet.
                </div>
              )}
            </RelationSection>
          ) : null}

          {areaKey === "cases" ? (
            <RelationSection
              title="Linked samplings"
              subtitle="Children entities"
              actions={
                mode === "create" ? (
                  <span className={RELATION_HINT_CLASSNAME}>
                    Create this case first to start linking samplings.
                  </span>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRelationDialog("case-child-sampling")}
                      disabled={!canManageRelations || pendingRelationRecordId !== null}
                      className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Link existing
                    </Button>
                    <Button
                      size="sm"
                      asChild
                      className={RELATION_PRIMARY_BUTTON_CLASSNAME}
                    >
                      <Link href={`${samplingArea.route}/new?caseId=${encodeURIComponent(detail!.record.id)}`}>
                        <Plus className="h-3.5 w-3.5" />
                        New sampling
                      </Link>
                    </Button>
                  </>
                )
              }
            >
              {mode === "create" ? (
                <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                  Save the case, then link existing sampling records or create a new child sampling
                  with this case preloaded.
                </div>
              ) : linkedSamplings.length === 0 ? (
                <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                  No samplings are linked to this case yet.
                </div>
              ) : (
                <div className="grid gap-3">
                  {linkedSamplings.map((record) => (
                    <LinkedEntityCard
                      key={record.id}
                      record={record}
                      badge="Sampling"
                      actions={
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                          >
                            <Link href={getRecordHref(record)}>
                              Open
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleUnlinkExistingSampling(record)}
                            disabled={!canManageRelations || pendingRelationRecordId === record.id}
                            className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                          >
                            {pendingRelationRecordId === record.id ? "Unlinking..." : "Unlink"}
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
              title="Linked Case"
              subtitle="Parent entity"
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openRelationDialog("sampling-parent-case")}
                    disabled={!canManageRelations || pendingRelationRecordId !== null}
                    className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {linkedCase ? "Change case" : "Link case"}
                  </Button>
                  {linkedCase ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleUnlinkCaseFromSampling()}
                      disabled={!canManageRelations || pendingRelationRecordId === linkedCase.id}
                      className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                    >
                      {pendingRelationRecordId === linkedCase.id ? "Unlinking..." : "Unlink"}
                    </Button>
                  ) : null}
                </>
              }
            >
              {linkedCase ? (
                <LinkedEntityCard
                  record={linkedCase}
                  badge="Case"
                  note="The case is the parent entity. Unlinking removes the relationship only."
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className={RELATION_SECONDARY_BUTTON_CLASSNAME}
                    >
                      <Link href={getRecordHref(linkedCase)}>
                        Open
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className={RELATION_EMPTY_STATE_CLASSNAME}>
                  No parent case is linked to this sampling record yet.
                </div>
              )}
            </RelationSection>
          ) : null}
            </div>
          ) : null}

          {areaKey === "cases" && mode !== "create" ? (
            <section className={THREE_LETTER_CODE_SECTION_CLASSNAME}>
              <div className="flex flex-col gap-4 border-b border-fuchsia-200/70 px-5 py-5 dark:border-fuchsia-300/16 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg font-semibold text-fuchsia-950 dark:text-fuchsia-50">
                      Three letter code
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-fuchsia-200 bg-white/72 text-fuchsia-950 dark:border-fuchsia-300/18 dark:bg-fuchsia-400/10 dark:text-fuchsia-50"
                    >
                      {hasThreeLetterCode ? "Assigned" : "Not assigned"}
                    </Badge>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm text-fuchsia-950/72 dark:text-fuchsia-50/74">
                    A unique three-letter shorthand for this 2PQ case. Use it as a quick visual
                    identifier when operators need a short code instead of the full case label.
                  </p>
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
                    {hasThreeLetterCode ? "Edit" : "Add manually"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openThreeLetterCodeModal("random")}
                    disabled={pendingThreeLetterCodeAction}
                    className={THREE_LETTER_CODE_PRIMARY_BUTTON_CLASSNAME}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate random
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openThreeLetterCodeModal("remove")}
                    disabled={!hasThreeLetterCode || pendingThreeLetterCodeAction}
                    className={THREE_LETTER_CODE_SECONDARY_BUTTON_CLASSNAME}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 lg:grid-cols-[auto,1fr] lg:items-center">
                {hasThreeLetterCode ? (
                  <>
                    <div className="rounded-[1.45rem] border border-fuchsia-100 bg-white/70 px-4 py-4 shadow-[0_16px_38px_rgba(250,232,255,0.62)] dark:border-fuchsia-200/16 dark:bg-fuchsia-950/24 dark:shadow-none">
                      <ThreeLetterCodeVisualizer code={normalizedThreeLetterCode} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-fuchsia-950 dark:text-fuchsia-50">
                        {normalizedThreeLetterCode} is active for this case.
                      </p>
                      <p className="text-sm text-fuchsia-950/70 dark:text-fuchsia-50/72">
                        The code is stored on the case document as <code>three_letter_code</code>
                        and stays available here for quick reference.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className={`${THREE_LETTER_CODE_EMPTY_STATE_CLASSNAME} lg:col-span-2`}>
                    No three letter code has been assigned yet. Add one manually or generate a new
                    random code to reserve a unique shorthand for this case.
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
              <h3 className="font-heading text-lg font-semibold text-foreground">{group.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>

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
                    (field.key === "institutionId" && Boolean(scopedInstitutionId)) ||
                    (field.key === "doctorId" && Boolean(scopedDoctorId));

                  return (
                    <div
                      key={field.key}
                      className={field.type === "textarea" ? "space-y-2 md:col-span-2" : "space-y-2"}
                    >
                      <Label htmlFor={`${area.key}-${field.key}`}>{field.label}</Label>
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
                              if (field.key === "institutionId" && current.institutionId !== value) {
                                next.doctorId = "";
                                next.patientId = "";
                              }
                              if (field.key === "doctorId" && current.doctorId !== value) {
                                next.patientId = "";
                              }
                              return next;
                            })
                          }
                          placeholder={field.placeholder ?? `Select ${field.label.toLowerCase()}`}
                          emptyLabel={`No ${field.label.toLowerCase()}`}
                          disabled={disabled}
                        />
                      ) : (
                        <Input
                          id={`${area.key}-${field.key}`}
                          type={field.type === "date" ? "date" : field.type === "email" ? "email" : "text"}
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
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
