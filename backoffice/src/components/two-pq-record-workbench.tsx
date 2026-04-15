"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Link2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Copy,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  "min-w-[22rem] max-w-[28rem] shrink-0 overflow-hidden rounded-[1.75rem] border border-emerald-100 bg-[linear-gradient(160deg,rgba(249,253,250,0.98),rgba(240,253,244,0.98)_42%,rgba(220,252,231,0.92))] shadow-[0_18px_56px_rgba(187,247,208,0.32)]";
const RELATION_SECONDARY_BUTTON_CLASSNAME =
  "border-emerald-100 bg-white/80 text-emerald-900 shadow-[0_10px_24px_rgba(220,252,231,0.78)] hover:bg-emerald-50";
const RELATION_PRIMARY_BUTTON_CLASSNAME =
  "border border-emerald-100 bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(220,252,231,0.98))] text-emerald-950 shadow-[0_14px_32px_rgba(187,247,208,0.38)] hover:brightness-[1.01]";
const RELATION_HINT_CLASSNAME =
  "rounded-full border border-emerald-100 bg-white/72 px-3 py-1 text-xs text-emerald-900/55 shadow-[0_8px_22px_rgba(220,252,231,0.68)]";
const RELATION_EMPTY_STATE_CLASSNAME =
  "rounded-[1.35rem] border border-dashed border-emerald-100 bg-white/72 px-4 py-5 text-sm text-emerald-900/65";

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
      <div className="flex flex-col gap-3 border-b border-emerald-200/70 px-5 py-4">
        <div>
          <h3 className="font-heading text-lg font-semibold text-emerald-950">{title}</h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-900/45">
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
    <div className="rounded-[1.35rem] border border-emerald-100 bg-white/82 px-4 py-4 shadow-[0_12px_32px_rgba(220,252,231,0.82)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
              {badge}
            </Badge>
            <span className="font-mono text-[11px] text-emerald-900/52">{record.id}</span>
          </div>
          <p className="mt-3 text-base font-semibold text-emerald-950">{title}</p>
          <p className="mt-1 text-sm text-emerald-900/68">{subtitle || "Linked entity"}</p>
          {note ? <p className="mt-2 text-xs text-emerald-900/52">{note}</p> : null}
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
      <DialogContent className="max-w-3xl overflow-hidden rounded-[2rem] border border-emerald-100 bg-[linear-gradient(155deg,rgba(249,253,250,0.98),rgba(240,253,244,0.98)_56%,rgba(220,252,231,0.94))] p-0 text-emerald-950 shadow-[0_34px_120px_rgba(187,247,208,0.36)]">
        <DialogHeader className="border-b border-emerald-100 px-6 py-5">
          <DialogTitle className="font-heading text-2xl font-semibold text-emerald-950">
            {title}
          </DialogTitle>
          <DialogDescription className="text-emerald-900/65">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5">
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={`Search ${area.label.toLowerCase()}...`}
            className="border-emerald-100 bg-white/82 text-emerald-950 placeholder:text-emerald-900/35"
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
                  className="rounded-[1.35rem] border border-emerald-100 bg-white/82 px-4 py-4 shadow-[0_10px_28px_rgba(220,252,231,0.76)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-emerald-950">
                          {getTwoPQRecordTitle(area, record)}
                        </p>
                        <span className="font-mono text-[11px] text-emerald-900/48">
                          {record.id}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-emerald-900/68">
                        {getTwoPQRecordSubtitle(area, record) || "Linked entity"}
                      </p>
                      {noteByRecordId?.[record.id] ? (
                        <p className="mt-2 text-xs text-emerald-900/52">
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
      durationMs: 10_000,
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

    await performRelationRequest(
      record.id,
      () => sdkFetch(`/2pq/relations/batches/${record.id}/cases/${detail.record.id}`, { method: "POST" }),
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

    await performRelationRequest(
      linkedBatch.id,
      () =>
        sdkFetch(`/2pq/relations/batches/${linkedBatch.id}/cases/${detail.record.id}`, {
          method: "DELETE",
        }),
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

    await performRelationRequest(
      record.id,
      () => sdkFetch(`/2pq/relations/cases/${record.id}/samplings/${detail.record.id}`, { method: "POST" }),
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

    await performRelationRequest(
      linkedCase.id,
      () =>
        sdkFetch(`/2pq/relations/cases/${linkedCase.id}/samplings/${detail.record.id}`, {
          method: "DELETE",
        }),
      "Case unlinked from sampling.",
      "Unable to unlink the case.",
      "Unlink case from sampling"
    );
  }

  async function handleLinkExistingCase(record: TwoPQListItem) {
    if (!detail) {
      return;
    }

    await performRelationRequest(
      record.id,
      () => sdkFetch(`/2pq/relations/batches/${detail.record.id}/cases/${record.id}`, { method: "POST" }),
      "Case linked to batch.",
      "Unable to link the selected case.",
      "Link case to batch"
    );
  }

  async function handleUnlinkExistingCase(record: TwoPQListItem) {
    if (!detail) {
      return;
    }

    await performRelationRequest(
      record.id,
      () =>
        sdkFetch(`/2pq/relations/batches/${detail.record.id}/cases/${record.id}`, {
          method: "DELETE",
        }),
      "Case unlinked from batch.",
      "Unable to unlink the case.",
      "Unlink case from batch"
    );
  }

  async function handleLinkExistingSampling(record: TwoPQListItem) {
    if (!detail) {
      return;
    }

    await performRelationRequest(
      record.id,
      () => sdkFetch(`/2pq/relations/cases/${detail.record.id}/samplings/${record.id}`, { method: "POST" }),
      "Sampling linked to case.",
      "Unable to link the selected sampling.",
      "Link sampling to case"
    );
  }

  async function handleUnlinkExistingSampling(record: TwoPQListItem) {
    if (!detail) {
      return;
    }

    await performRelationRequest(
      record.id,
      () =>
        sdkFetch(`/2pq/relations/cases/${detail.record.id}/samplings/${record.id}`, {
          method: "DELETE",
        }),
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
    if (!detail || !changed) {
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
        <DialogContent className="max-w-4xl rounded-[2rem] border border-emerald-100 bg-[linear-gradient(160deg,rgba(249,253,250,0.98),rgba(255,255,255,0.98)_45%,rgba(240,253,244,0.96))] p-0 shadow-[0_32px_120px_rgba(15,23,42,0.16)]">
          <DialogHeader className="border-b border-emerald-100 px-6 py-5">
            <DialogTitle className="font-heading text-2xl font-semibold text-emerald-950">
              {latestErrorLog?.title ?? "Request log"}
            </DialogTitle>
            <DialogDescription className="text-emerald-900/65">
              Full request error log. You can copy this message for debugging.
            </DialogDescription>
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
