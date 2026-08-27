"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  ExternalLink,
  FileUp,
  Filter,
  Mail,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserRound,
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
import { sdkFetch } from "@/lib/sdk-client";
import { appText, type AppLanguage } from "@/lib/language";
import {
  bestCrmTemplateForOrganization,
  CRM_CATEGORY_OPTIONS,
  CRM_STATUS_OPTIONS,
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
  type PartnershipCrmStatus,
  type PartnershipCrmTemplateRecord,
  type PartnershipCrmTemplatesPage,
} from "@/lib/partnership-crm";
import { cn } from "@/lib/utils";

const ORGANIZATIONS_QUERY_KEY = "god-mode-partnership-crm-organizations";
const ACTIVITIES_QUERY_KEY = "god-mode-partnership-crm-activities";
const TEMPLATES_QUERY_KEY = "god-mode-partnership-crm-templates";
const EMAIL_CTA_CLASS =
  "h-11 min-w-[11rem] bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.26)] hover:bg-blue-700 focus-visible:ring-blue-500/35 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400";
const CRM_IMPORT_CHUNK_SIZE = 100;
const CRM_IMPORT_SESSION_STORAGE_KEY =
  "golden-crow:partnership-crm-import-session:v1";

type EmailState = {
  to: string;
  templateId: string;
  subject: string;
  text: string;
  step: "compose" | "preview";
};

type OrganizationDialogState =
  | { mode: "create"; organization?: undefined }
  | { mode: "edit"; organization: PartnershipCrmOrganizationRecord }
  | null;

type OrganizationFormState = {
  name: string;
  category: string;
  website: string;
  country: string;
  status: PartnershipCrmStatus;
  contactName: string;
  contactEmail: string;
  contactLinkedIn: string;
  lastContactAt: string;
  notes: string;
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

type CrmImportSession = {
  id: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  status: CrmImportSessionStatus;
  stage: CrmImportSessionStage;
  chunkSize: number;
  sourceRows: PartnershipCrmOrganizationInput[];
  previewRows: PartnershipCrmImportPreviewRow[];
  parseErrors: Array<{ row: number; message: string }>;
  totalRows: number;
  previewedRows: number;
  nextImportIndex: number;
  importSummary: PartnershipCrmImportResult["summary"];
  results: PartnershipCrmImportResult["results"];
  lastError?: string;
};

const EMPTY_FORM_STATE: OrganizationFormState = {
  name: "",
  category: "Laboratory / Genomics",
  website: "",
  country: "",
  status: "new",
  contactName: "",
  contactEmail: "",
  contactLinkedIn: "",
  lastContactAt: "",
  notes: "",
};

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
  };
}

function rowsForImportChunk(rows: PartnershipCrmImportPreviewRow[]) {
  return rows
    .filter((row) => row.valid)
    .map((row) => ({
      ...row.organization,
      rowId: row.rowId,
      duplicateAction:
        row.duplicateCandidates.length > 0
          ? (row.duplicateAction ?? "skip")
          : "skip",
      duplicateOrganizationId:
        row.duplicateOrganizationId ?? row.duplicateCandidates[0]?.id,
    }));
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

function validImportSession(value: unknown): CrmImportSession | null {
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
    chunkSize: candidate.chunkSize ?? CRM_IMPORT_CHUNK_SIZE,
    sourceRows: candidate.sourceRows,
    previewRows: candidate.previewRows.map(withDuplicateDefaults),
    parseErrors: Array.isArray(candidate.parseErrors)
      ? candidate.parseErrors
      : [],
    totalRows:
      typeof candidate.totalRows === "number"
        ? candidate.totalRows
        : candidate.sourceRows.length,
    previewedRows:
      typeof candidate.previewedRows === "number"
        ? candidate.previewedRows
        : candidate.previewRows.length,
    nextImportIndex:
      typeof candidate.nextImportIndex === "number"
        ? candidate.nextImportIndex
        : 0,
    importSummary: candidate.importSummary ?? emptyImportSummary(),
    results: Array.isArray(candidate.results) ? candidate.results : [],
    lastError:
      typeof candidate.lastError === "string"
        ? candidate.lastError
        : restoredStatus === "previewing" || restoredStatus === "importing"
          ? "The previous import stopped before finishing."
          : undefined,
  };
}

function loadCrmImportSession() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CRM_IMPORT_SESSION_STORAGE_KEY);
    return raw ? validImportSession(JSON.parse(raw)) : null;
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
      CRM_IMPORT_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
    return true;
  } catch {
    return false;
  }
}

function clearCrmImportSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CRM_IMPORT_SESSION_STORAGE_KEY);
}

function buildOrganizationListPath(filters: ListFilters, cursor?: string) {
  const params = new URLSearchParams({ limit: "20" });
  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.category.trim()) {
    params.set("category", filters.category.trim());
  }
  if (filters.country.trim()) {
    params.set("country", filters.country.trim());
  }
  if (filters.emailState !== "all") {
    params.set("emailState", filters.emailState);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  return `/admin/partnership-crm/organizations?${params.toString()}`;
}

function organizationPayload(
  state: OrganizationFormState,
): PartnershipCrmOrganizationInput {
  const parsedLastContact = state.lastContactAt
    ? new Date(state.lastContactAt)
    : null;

  return {
    name: state.name.trim(),
    category: state.category.trim(),
    website: state.website.trim(),
    country: state.country.trim(),
    status: state.status,
    contactName: state.contactName.trim(),
    contactEmail: state.contactEmail.trim().toLowerCase(),
    contactLinkedIn: state.contactLinkedIn.trim(),
    lastContactAt:
      parsedLastContact && !Number.isNaN(parsedLastContact.getTime())
        ? parsedLastContact.toISOString()
        : null,
    notes: state.notes.trim(),
  };
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
  organization?: PartnershipCrmOrganizationRecord,
): OrganizationFormState {
  if (!organization) {
    return EMPTY_FORM_STATE;
  }

  return {
    name: organization.name,
    category: organization.category || "Laboratory / Genomics",
    website: organization.website,
    country: organization.country,
    status: organization.status,
    contactName: organization.contactName,
    contactEmail: organization.contactEmail,
    contactLinkedIn: organization.contactLinkedIn,
    lastContactAt: localDateTimeValue(organization.lastContactAt),
    notes: organization.notes,
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

function activityIcon(type: PartnershipCrmActivityRecord["type"]) {
  if (type === "email") {
    return Mail;
  }
  if (type === "status") {
    return CircleDot;
  }
  if (type === "import") {
    return FileUp;
  }
  if (type === "created") {
    return Building2;
  }
  if (type === "updated") {
    return Pencil;
  }
  return NotebookPen;
}

function activityTone(type: PartnershipCrmActivityRecord["type"]) {
  if (type === "email") {
    return "border-sky-200/80 bg-sky-50/80 text-sky-950 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-100";
  }
  if (type === "status") {
    return "border-amber-200/80 bg-amber-50/80 text-amber-950 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100";
  }
  if (type === "import") {
    return "border-violet-200/80 bg-violet-50/80 text-violet-950 dark:border-violet-300/20 dark:bg-violet-400/10 dark:text-violet-100";
  }
  return "border-border/80 bg-background/70 text-foreground";
}

function metricCount(
  organizations: PartnershipCrmOrganizationRecord[],
  status: PartnershipCrmStatus,
) {
  return organizations.filter((organization) => organization.status === status)
    .length;
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

function OrganizationFacts({
  organization,
  language,
}: {
  organization: PartnershipCrmOrganizationRecord;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" />
          {t("Primary contact")}
        </div>
        <p className="mt-2 font-medium text-foreground">
          {organization.contactName || "—"}
        </p>
        <p className="mt-1 break-all text-sm text-muted-foreground">
          {organization.contactEmail || t("No email")}
        </p>
      </div>
      <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {t("Last Contact")}
        </div>
        <p className="mt-2 font-medium text-foreground">
          {formatDate(organization.lastContactAt, language)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {organization.updatedByEmail || t("No owner recorded")}
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
        {organization.contactLinkedIn ? (
          <a
            href={organization.contactLinkedIn}
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
  const Icon = activityIcon(activity.type);
  const subject =
    typeof activity.metadata?.subject === "string"
      ? activity.metadata.subject
      : undefined;
  const to =
    typeof activity.metadata?.to === "string"
      ? activity.metadata.to
      : undefined;

  return (
    <article
      className={cn(
        "rounded-xl border px-3 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.05)]",
        activityTone(activity.type),
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/76 text-current shadow-sm dark:bg-white/10">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="min-w-0 flex-1 truncate font-medium text-foreground">
              {activity.title || t("Activity")}
            </h4>
            <Badge variant="outline">{t(activity.type)}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(
              activity.occurredAt ?? activity.createdAt,
              language,
            )}
            {activity.createdByEmail ? ` · ${activity.createdByEmail}` : ""}
          </p>
          {subject || to ? (
            <div className="mt-2 grid gap-1 rounded-lg border border-border/70 bg-background/70 px-2 py-2 text-xs text-muted-foreground">
              {subject ? (
                <p className="truncate">
                  <span className="font-semibold text-foreground">
                    {t("Subject")}:
                  </span>{" "}
                  {subject}
                </p>
              ) : null}
              {to ? (
                <p className="truncate">
                  <span className="font-semibold text-foreground">
                    {t("Recipient")}:
                  </span>{" "}
                  {to}
                </p>
              ) : null}
            </div>
          ) : null}
          {activity.body ? (
            <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-5 text-foreground/88">
              {activity.body}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function OrganizationDialog({
  state,
  pending,
  onClose,
  onSubmit,
  language,
}: {
  state: OrganizationDialogState;
  pending: boolean;
  onClose: () => void;
  onSubmit: (
    mode: "create" | "edit",
    organizationId: string | undefined,
    payload: PartnershipCrmOrganizationInput,
  ) => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const [form, setForm] = useState<OrganizationFormState>(EMPTY_FORM_STATE);

  useEffect(() => {
    setForm(toFormState(state?.organization));
  }, [state]);

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
      organizationPayload(form),
    );
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === "edit"
              ? t("Edit CRM organization")
              : t("Add CRM organization")}
          </DialogTitle>
          <DialogDescription>
            {t("One organization, one primary contact, and the next action.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <datalist id="crm-category-options">
            {CRM_CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="crm-org-name">{t("Organization name")}</Label>
              <Input
                id="crm-org-name"
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-org-category">{t("Category")}</Label>
              <Input
                id="crm-org-category"
                list="crm-category-options"
                value={form.category}
                onChange={(event) => update({ category: event.target.value })}
              />
            </div>
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
              <Label htmlFor="crm-org-country">{t("Country")}</Label>
              <Input
                id="crm-org-country"
                value={form.country}
                onChange={(event) => update({ country: event.target.value })}
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
  open,
  pending,
  templates,
  templatesLoading,
  onClose,
  onSend,
  language,
}: {
  organization: PartnershipCrmOrganizationRecord | null;
  open: boolean;
  pending: boolean;
  templates: PartnershipCrmTemplateRecord[];
  templatesLoading: boolean;
  onClose: () => void;
  onSend: (state: EmailState) => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const [email, setEmail] = useState<EmailState | null>(null);

  useEffect(() => {
    if (!organization || !open) {
      setEmail(null);
      return;
    }

    const template = bestCrmTemplateForOrganization(organization, templates);
    const rendered = template
      ? renderCrmTemplate(template, organization)
      : { subject: "", body: "" };
    setEmail({
      to: organization.contactEmail,
      templateId: template?.id ?? "",
      subject: rendered.subject,
      text: rendered.body,
      step: "compose",
    });
  }, [open, organization, templates]);

  function update(patch: Partial<EmailState>) {
    setEmail((current) => (current ? { ...current, ...patch } : current));
  }

  function applyTemplate(templateId: string) {
    if (!organization) {
      return;
    }

    const template = templates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }

    const rendered = renderCrmTemplate(template, organization);
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
  const hasTemplates = templates.length > 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("Send CRM email")}</DialogTitle>
          <DialogDescription>
            {t("Individual outreach only. Review the preview before sending.")}
          </DialogDescription>
        </DialogHeader>

        {organization && email ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(320px,0.68fr)]">
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
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                {email.step === "compose" ? (
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
              </div>
            </div>

            <aside className="rounded-xl border border-border/80 bg-white p-4 text-slate-950 shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:bg-slate-950 dark:text-slate-50">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {t("Preview")}
                  </p>
                  <h3 className="mt-1 truncate font-heading text-lg font-semibold">
                    {email.subject || t("No subject")}
                  </h3>
                </div>
                {email.step === "preview" ? (
                  <Badge variant="success">{t("Ready")}</Badge>
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
              <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
                {email.text || t("No message yet.")}
              </div>
            </aside>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            {t("Close")}
          </Button>
        </DialogFooter>
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
        <Badge variant="outline">{importStatusLabel(session, language)}</Badge>
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
        <p className="mt-3 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-300/25 dark:bg-amber-400/10 dark:text-amber-100">
          {t("Last error")}: {session.lastError}
        </p>
      ) : null}
    </section>
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
            {t("Open import")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            {t("Discard checkpoint")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ImportDialog({
  open,
  pending,
  session,
  preview,
  parseErrors,
  onClose,
  onFileChange,
  onPreviewChange,
  onImport,
  onClearSession,
  language,
}: {
  open: boolean;
  pending: boolean;
  session: CrmImportSession | null;
  preview: PartnershipCrmImportPreview | null;
  parseErrors: Array<{ row: number; message: string }>;
  onClose: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPreviewChange: (rows: PartnershipCrmImportPreviewRow[]) => void;
  onImport: () => void;
  onClearSession: () => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const duplicateControlsDisabled =
    pending ||
    session?.status === "completed" ||
    (session?.nextImportIndex ?? 0) > 0;

  function updateDuplicateAction(rowId: string, action: CrmDuplicateAction) {
    if (!preview) {
      return;
    }

    onPreviewChange(
      preview.rows.map((row) =>
        row.rowId === rowId ? { ...row, duplicateAction: action } : row,
      ),
    );
  }

  const validRowsCount = preview?.rows.filter((row) => row.valid).length ?? 0;
  const actionRowsCount =
    preview?.rows.filter((row) => row.valid && row.duplicateAction !== "skip")
      .length ?? 0;
  const importDisabled =
    pending ||
    !preview ||
    validRowsCount === 0 ||
    session?.status === "completed" ||
    session?.status === "previewing";
  const importButtonLabel = pending
    ? session?.stage === "preview"
      ? t("Previewing...")
      : t("Importing...")
    : session?.status === "completed"
      ? t("Import completed")
      : session?.status === "paused"
        ? session.stage === "preview"
          ? t("Resume preview")
          : t("Resume import")
        : `${t("Import")} ${validRowsCount} ${t("rows")}`;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("Import CRM CSV")}</DialogTitle>
          <DialogDescription>
            {t("Missing contact details do not block import.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {session ? (
            <ImportProgressPanel session={session} language={language} />
          ) : null}

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
              name,category,website,country,contact_name,email,linkedin
            </p>
          </div>

          {parseErrors.length > 0 ? (
            <div className="grid gap-2">
              {parseErrors.slice(0, 4).map((error) => (
                <ErrorBanner key={`${error.row}-${error.message}`}>
                  {t("Row")} {error.row}: {t(error.message)}
                </ErrorBanner>
              ))}
            </div>
          ) : null}

          {preview ? (
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-3">
                  <p className="text-xs text-muted-foreground">{t("Found")}</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {preview.summary.total}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-300/40 bg-emerald-50/80 px-3 py-3 text-emerald-950 dark:bg-emerald-400/10 dark:text-emerald-100">
                  <p className="text-xs">{t("Valid")}</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {preview.summary.valid}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-300/50 bg-amber-50/80 px-3 py-3 text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
                  <p className="text-xs">{t("Missing email")}</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {preview.summary.missingEmail}
                  </p>
                </div>
                <div className="rounded-xl border border-violet-300/45 bg-violet-50/80 px-3 py-3 text-violet-950 dark:bg-violet-400/10 dark:text-violet-100">
                  <p className="text-xs">{t("Possible duplicates")}</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {preview.summary.duplicates}
                  </p>
                </div>
              </div>

              <div className="max-h-[44vh] overflow-auto rounded-xl border border-border/80 bg-background/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Organization")}</TableHead>
                      <TableHead>{t("Contact")}</TableHead>
                      <TableHead>{t("Status")}</TableHead>
                      <TableHead>{t("Duplicate handling")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => {
                      const duplicate = row.duplicateCandidates[0];
                      const duplicateAction =
                        row.duplicateAction ?? (duplicate ? "skip" : "import");

                      return (
                        <TableRow key={row.rowId}>
                          <TableCell className="whitespace-normal">
                            <div className="font-medium">
                              {row.organization.name || "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.organization.category || "—"} ·{" "}
                              {row.organization.country || "—"}
                            </div>
                            {!row.valid ? (
                              <p className="mt-1 text-xs text-destructive">
                                {row.errors.map((error) => t(error)).join(", ")}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <div>{row.organization.contactName || "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.organization.contactEmail ||
                                t("Missing email")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={row.organization.status ?? "new"}
                              language={language}
                            />
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {duplicate ? (
                              <div className="grid gap-2">
                                <p className="text-xs text-muted-foreground">
                                  {t("Possible duplicate")}: {duplicate.name}
                                </p>
                                <Select
                                  value={duplicateAction}
                                  disabled={duplicateControlsDisabled}
                                  onValueChange={(value) =>
                                    updateDuplicateAction(
                                      row.rowId,
                                      value as CrmDuplicateAction,
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="skip">
                                      {t("Skip")}
                                    </SelectItem>
                                    <SelectItem value="update">
                                      {t("Update existing")}
                                    </SelectItem>
                                    <SelectItem value="import">
                                      {t("Import anyway")}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : row.valid ? (
                              <Badge variant="success">{t("New record")}</Badge>
                            ) : (
                              <Badge variant="destructive">
                                {t("Invalid")}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
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
          <Button
            type="button"
            onClick={onImport}
            disabled={importDisabled}
            size="lg"
            className={EMAIL_CTA_CLASS}
          >
            <FileUp className="h-4 w-4" />
            {importButtonLabel}
            {!pending && actionRowsCount !== validRowsCount ? (
              <span className="ml-1 text-xs font-medium opacity-90">
                ({actionRowsCount} {t("will change")})
              </span>
            ) : null}
          </Button>
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
  const [filters, setFilters] = useState<ListFilters>({
    query: "",
    status: "all",
    category: "",
    country: "",
    emailState: "all",
  });
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [organizationDialog, setOrganizationDialog] =
    useState<OrganizationDialogState>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<PartnershipCrmOrganizationRecord | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] =
    useState<PartnershipCrmImportPreview | null>(null);
  const [parseErrors, setParseErrors] = useState<
    Array<{ row: number; message: string }>
  >([]);
  const [importSession, setImportSession] = useState<CrmImportSession | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const importStorageWarningShownRef = useRef(false);
  const currentCursor = cursorStack[cursorStack.length - 1];

  const organizationQuery = useQuery({
    queryKey: [ORGANIZATIONS_QUERY_KEY, filters, currentCursor],
    queryFn: () =>
      sdkFetch<PartnershipCrmOrganizationsPage>(
        buildOrganizationListPath(filters, currentCursor),
      ),
  });
  const organizations = organizationQuery.data?.organizations ?? [];
  const templatesQuery = useQuery({
    queryKey: [TEMPLATES_QUERY_KEY],
    queryFn: () =>
      sdkFetch<PartnershipCrmTemplatesPage>(
        "/admin/partnership-crm/templates?status=active&limit=50",
      ),
  });
  const emailTemplates = templatesQuery.data?.templates ?? [];
  const selectedOrganization =
    organizations.find((organization) => organization.id === selectedId) ??
    organizations[0] ??
    null;
  const activitiesQuery = useInfiniteQuery({
    queryKey: [ACTIVITIES_QUERY_KEY, selectedOrganization?.id],
    queryFn: ({ pageParam }) => {
      const cursor = typeof pageParam === "string" ? pageParam : "";
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) {
        params.set("cursor", cursor);
      }

      return sdkFetch<PartnershipCrmActivitiesPage>(
        `/admin/partnership-crm/organizations/${encodeURIComponent(
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

  useEffect(() => {
    const restoredSession = loadCrmImportSession();
    if (!restoredSession) {
      return;
    }

    setImportSession(restoredSession);
    setImportPreview(previewFromImportSession(restoredSession));
    setParseErrors(restoredSession.parseErrors);
  }, []);

  useEffect(() => {
    if (!organizations.length) {
      setSelectedId(null);
      return;
    }

    if (
      !selectedId ||
      !organizations.some((entry) => entry.id === selectedId)
    ) {
      setSelectedId(organizations[0]?.id ?? null);
    }
  }, [organizations, selectedId]);

  function invalidateOrganizations() {
    queryClient.invalidateQueries({ queryKey: [ORGANIZATIONS_QUERY_KEY] });
  }

  function invalidateActivities(organizationId?: string) {
    queryClient.invalidateQueries({
      queryKey: [ACTIVITIES_QUERY_KEY, organizationId],
    });
  }

  const saveOrganizationMutation = useMutation({
    mutationFn: ({
      mode,
      organizationId,
      payload,
    }: {
      mode: "create" | "edit";
      organizationId?: string;
      payload: PartnershipCrmOrganizationInput;
    }) => {
      const path =
        mode === "edit" && organizationId
          ? `/admin/partnership-crm/organizations/${encodeURIComponent(
              organizationId,
            )}`
          : "/admin/partnership-crm/organizations";

      return sdkFetch<{ organization: PartnershipCrmOrganizationRecord }>(
        path,
        {
          method: mode === "edit" ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
    },
    onSuccess: (result) => {
      setOrganizationDialog(null);
      setSelectedId(result.organization.id);
      invalidateOrganizations();
      invalidateActivities(result.organization.id);
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("CRM organization saved."),
      });
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to save CRM organization."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: (organizationId: string) =>
      sdkFetch<{ deleted: boolean; organizationId: string }>(
        `/admin/partnership-crm/organizations/${encodeURIComponent(
          organizationId,
        )}`,
        { method: "DELETE" },
      ),
    onSuccess: (_result, organizationId) => {
      setDeleteTarget(null);
      queryClient.setQueriesData<PartnershipCrmOrganizationsPage>(
        { queryKey: [ORGANIZATIONS_QUERY_KEY] },
        (current) =>
          current
            ? {
                ...current,
                organizations: current.organizations.filter(
                  (organization) => organization.id !== organizationId,
                ),
              }
            : current,
      );
      const nextSelection =
        organizations.find((organization) => organization.id !== organizationId)
          ?.id ?? null;
      setSelectedId(nextSelection);
      void queryClient.invalidateQueries({
        queryKey: [ORGANIZATIONS_QUERY_KEY],
      });
      void queryClient.invalidateQueries({
        queryKey: [ACTIVITIES_QUERY_KEY, organizationId],
      });
      void organizationQuery.refetch();
      router.refresh();
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("CRM organization deleted."),
      });
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to delete CRM organization."),
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
        `/admin/partnership-crm/organizations/${encodeURIComponent(
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
        organization: PartnershipCrmOrganizationRecord;
        activity: PartnershipCrmActivityRecord;
      }>(
        `/admin/partnership-crm/organizations/${encodeURIComponent(
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
      setEmailOpen(false);
      setSelectedId(result.organization.id);
      invalidateOrganizations();
      invalidateActivities(result.organization.id);
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

  function saveImportSession(next: CrmImportSession) {
    const normalized = {
      ...next,
      previewRows: next.previewRows.map(withDuplicateDefaults),
      totalRows: next.totalRows || next.sourceRows.length,
      previewedRows: Math.min(
        next.previewedRows,
        next.totalRows || next.sourceRows.length,
      ),
      nextImportIndex: Math.min(
        next.nextImportIndex,
        next.totalRows || next.sourceRows.length,
      ),
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
    clearCrmImportSession();
    setImportSession(null);
    setImportPreview(null);
    setParseErrors([]);
    setToast({
      id: Date.now(),
      tone: "success",
      message: t("Import checkpoint discarded."),
    });
  }

  async function previewCrmImportSession(session: CrmImportSession) {
    let working = saveImportSession({
      ...session,
      status: "previewing",
      stage: "preview",
      previewRows: session.previewRows.slice(0, session.previewedRows),
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });

    try {
      for (
        let startIndex = working.previewedRows;
        startIndex < working.sourceRows.length;
        startIndex += CRM_IMPORT_CHUNK_SIZE
      ) {
        const chunkEndIndex = Math.min(
          startIndex + CRM_IMPORT_CHUNK_SIZE,
          working.sourceRows.length,
        );
        const chunk = working.sourceRows.slice(startIndex, chunkEndIndex);
        const preview = await sdkFetch<PartnershipCrmImportPreview>(
          "/admin/partnership-crm/import-preview",
          {
            method: "POST",
            body: JSON.stringify({
              organizations: chunk.map((row, index) => ({
                ...row,
                rowId: `row-${startIndex + index + 1}`,
              })),
            }),
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
        stage: "import",
        previewedRows: working.totalRows,
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      });
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("CRM import preview ready."),
      });
      return working;
    } catch (error) {
      saveImportSession({
        ...working,
        status: "paused",
        stage: "preview",
        lastError: errorMessage(error),
        updatedAt: new Date().toISOString(),
      });
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("CRM import paused."),
        details: errorMessage(error),
        durationMs: 18000,
      });
      return null;
    }
  }

  async function runCrmImportSession(session: CrmImportSession | null) {
    if (!session || session.status === "completed") {
      return;
    }

    let working = session;
    if (
      working.stage === "preview" &&
      working.previewedRows < working.totalRows
    ) {
      const previewed = await previewCrmImportSession(working);
      if (!previewed) {
        return;
      }
      working = previewed;
    }

    working = saveImportSession({
      ...working,
      status: "importing",
      stage: "import",
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });

    try {
      for (
        let startIndex = working.nextImportIndex;
        startIndex < working.previewRows.length;
        startIndex += CRM_IMPORT_CHUNK_SIZE
      ) {
        const chunkEndIndex = Math.min(
          startIndex + CRM_IMPORT_CHUNK_SIZE,
          working.previewRows.length,
        );
        const previewChunk = working.previewRows.slice(
          startIndex,
          chunkEndIndex,
        );
        const invalidResults = previewChunk
          .filter((row) => !row.valid)
          .map((row) => ({
            rowId: row.rowId,
            action: "invalid" as const,
            reason: row.errors.join(", ") || "Invalid row.",
          }));
        const invalidSummary = {
          ...emptyImportSummary(),
          total: invalidResults.length,
          invalid: invalidResults.length,
        };
        const importRows = rowsForImportChunk(previewChunk);
        const result =
          importRows.length > 0
            ? await sdkFetch<PartnershipCrmImportResult>(
                "/admin/partnership-crm/import",
                {
                  method: "POST",
                  body: JSON.stringify({ organizations: importRows }),
                },
              )
            : {
                results: [],
                summary: emptyImportSummary(),
              };

        working = saveImportSession({
          ...working,
          nextImportIndex: chunkEndIndex,
          importSummary: importSummaryAdd(
            working.importSummary,
            importSummaryAdd(result.summary, invalidSummary),
          ),
          results: [...working.results, ...result.results, ...invalidResults],
          lastError: undefined,
          updatedAt: new Date().toISOString(),
        });
      }

      working = saveImportSession({
        ...working,
        status: "completed",
        stage: "complete",
        nextImportIndex: working.totalRows,
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      });
      invalidateOrganizations();
      setToast({
        id: Date.now(),
        tone: "success",
        message: `${t("Import complete.")} ${
          working.importSummary.created
        } ${t("created")}, ${working.importSummary.updated} ${t(
          "updated",
        )}, ${working.importSummary.skipped} ${t("skipped")}, ${
          working.importSummary.invalid
        } ${t("invalid")}.`,
      });
    } catch (error) {
      saveImportSession({
        ...working,
        status: "paused",
        stage: "import",
        lastError: errorMessage(error),
        updatedAt: new Date().toISOString(),
      });
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("CRM import paused."),
        details: errorMessage(error),
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
    ? t("No organization selected")
    : activitiesQuery.data
      ? `${activityRows.length} ${t("loaded")}`
      : t("Not loaded");
  const importPending =
    importSession?.status === "previewing" ||
    importSession?.status === "importing";

  function resetCursorsForFilterChange(patch: Partial<ListFilters>) {
    setCursorStack([]);
    setFilters((current) => ({ ...current, ...patch }));
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
    payload: PartnershipCrmOrganizationInput,
  ) {
    saveOrganizationMutation.mutate({ mode, organizationId, payload });
  }

  async function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    clearCrmImportSession();
    try {
      const text = await file.text();
      const parsed = parseCrmCsv(text);
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
        status: "previewing",
        stage: "preview",
        chunkSize: CRM_IMPORT_CHUNK_SIZE,
        sourceRows: parsed.rows,
        previewRows: [],
        parseErrors: parsed.errors,
        totalRows: parsed.rows.length,
        previewedRows: 0,
        nextImportIndex: 0,
        importSummary: emptyImportSummary(),
        results: [],
      };

      await previewCrmImportSession(session);
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

  function handleImportPreviewChange(rows: PartnershipCrmImportPreviewRow[]) {
    const normalizedRows = rows.map(withDuplicateDefaults);
    if (importSession) {
      saveImportSession({
        ...importSession,
        previewRows: normalizedRows,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    setImportPreview({
      rows: normalizedRows,
      summary: summarizePreviewRows(normalizedRows),
    });
  }

  function updateSelectedStatus(status: PartnershipCrmStatus) {
    if (!selectedOrganization) {
      return;
    }

    saveOrganizationMutation.mutate({
      mode: "edit",
      organizationId: selectedOrganization.id,
      payload: {
        ...selectedOrganization,
        status,
      },
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
            size="sm"
            onClick={() => setOrganizationDialog({ mode: "create" })}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("Add Organization")}
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
            placeholder={t("Search organizations...")}
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
        <Input
          value={filters.category}
          onChange={(event) =>
            resetCursorsForFilterChange({ category: event.target.value })
          }
          placeholder={t("Category")}
        />
        <Input
          value={filters.country}
          onChange={(event) =>
            resetCursorsForFilterChange({ country: event.target.value })
          }
          placeholder={t("Country")}
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.72fr)]">
        <div className="grid content-start gap-4">
          <div className="grid items-start gap-2 sm:grid-cols-5">
            {PIPELINE_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => resetCursorsForFilterChange({ status })}
                className={cn(
                  "h-16 self-start rounded-xl border px-3 py-2 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40",
                  filters.status === status
                    ? "border-foreground/35 bg-muted"
                    : "border-border/80 bg-background/60",
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {t(statusLabel(status))}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {pageStatusCounts[status]}
                </p>
              </button>
            ))}
          </div>

          {organizationQuery.error ? (
            <ErrorBanner>{t("Failed to load CRM organizations.")}</ErrorBanner>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border/80 bg-background/64">
            {organizationQuery.isFetching && organizations.length === 0 ? (
              <div className="grid gap-2 p-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : organizations.length === 0 ? (
              <EmptyState>{t("No CRM organizations found.")}</EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Organization")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>{t("Contact")}</TableHead>
                    <TableHead>{t("Last Contact")}</TableHead>
                    <TableHead>{t("Notes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((organization) => {
                    const isSelected =
                      organization.id === selectedOrganization?.id;

                    return (
                      <TableRow
                        key={organization.id}
                        data-state={isSelected ? "selected" : undefined}
                        className={cn(
                          "cursor-pointer",
                          isSelected &&
                            "bg-sky-50/80 hover:bg-sky-50 dark:bg-sky-400/10 dark:hover:bg-sky-400/12",
                        )}
                        onClick={() => setSelectedId(organization.id)}
                      >
                        <TableCell className="whitespace-normal">
                          <button
                            type="button"
                            className="max-w-[260px] text-left"
                            onClick={() => setSelectedId(organization.id)}
                          >
                            <span className="block truncate font-medium text-foreground">
                              {organization.name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {organization.category || t("No category")} ·{" "}
                              {organization.country || t("No country")}
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
                          <div className="max-w-[210px] truncate font-medium">
                            {organization.contactName || "—"}
                          </div>
                          <div className="max-w-[210px] truncate text-xs text-muted-foreground">
                            {organization.contactEmail || t("No email")}
                          </div>
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
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCursorStack((current) => current.slice(0, -1))}
              disabled={
                cursorStack.length === 0 || organizationQuery.isFetching
              }
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t("Previous")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {organizations.length} {t("visible")}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                organizationQuery.data?.nextCursor &&
                setCursorStack((current) => [
                  ...current,
                  organizationQuery.data!.nextCursor!,
                ])
              }
              disabled={
                !organizationQuery.data?.nextCursor ||
                organizationQuery.isFetching
              }
            >
              {t("Load more")}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <aside className="grid gap-4">
          {selectedOrganization ? (
            <>
              <div className="rounded-xl border border-border/80 bg-background/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        status={selectedOrganization.status}
                        language={language}
                      />
                      <Badge variant="outline">
                        {selectedOrganization.category || t("No category")}
                      </Badge>
                    </div>
                    <h3 className="mt-2 truncate font-heading text-xl font-semibold text-foreground">
                      {selectedOrganization.name}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedOrganization.country || t("No country")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => setEmailOpen(true)}
                      disabled={!selectedOrganization.contactEmail}
                      className={EMAIL_CTA_CLASS}
                    >
                      <Mail className="h-4 w-4" />
                      {t("Send Email")}
                    </Button>
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
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t("Pipeline")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[...PIPELINE_STATUSES, ...OUTCOME_STATUSES].map(
                      (status) => (
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
                      ),
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <OrganizationFacts
                    organization={selectedOrganization}
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
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-border/80 bg-background/70 p-8 text-center">
              <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {t("Select an organization to see CRM details.")}
              </p>
            </div>
          )}
        </aside>
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
                      "Expand to load the selected organization activity.",
                    )}`
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
                  <div className="grid gap-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-24 rounded-xl" />
                    ))}
                  </div>
                ) : !activityRows.length ? (
                  <EmptyState>{t("No activity yet.")}</EmptyState>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
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
              {t("Select an organization to see CRM details.")}
            </EmptyState>
          )
        ) : null}
      </section>

      <OrganizationDialog
        state={organizationDialog}
        pending={saveOrganizationMutation.isPending}
        onClose={() => setOrganizationDialog(null)}
        onSubmit={handleOrganizationSubmit}
        language={language}
      />

      <EmailComposerDialog
        organization={selectedOrganization}
        open={emailOpen}
        pending={sendEmailMutation.isPending}
        templates={emailTemplates}
        templatesLoading={templatesQuery.isFetching}
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

      <ImportDialog
        open={importOpen}
        pending={importPending}
        session={importSession}
        preview={importPreview}
        parseErrors={parseErrors}
        onClose={() => setImportOpen(false)}
        onFileChange={handleCsvFileChange}
        onPreviewChange={handleImportPreviewChange}
        onImport={() => void runCrmImportSession(importSession)}
        onClearSession={discardImportCheckpoint}
        language={language}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Delete CRM organization")}</DialogTitle>
            <DialogDescription>
              {t("This removes the organization from the partnership CRM.")}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget ? (
            <div className="rounded-xl border border-border/80 bg-background/70 p-3">
              <p className="font-medium text-foreground">{deleteTarget.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {deleteTarget.contactEmail || t("No email")}
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

      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
    </section>
  );
}
