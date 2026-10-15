"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Braces,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  FileUp,
  Filter,
  GripVertical,
  ListChecks,
  Pencil,
  Pause,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
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
  CrmCategorySelect,
  formatCrmCategory,
} from "@/components/god-mode/crm-category-select";
import { CrmImportRulesDialog } from "@/components/god-mode/crm-import-rules-dialog";
import { CrmTargetSegmentedControl } from "@/components/god-mode/crm-target-segmented-control";
import { appText, type AppLanguage } from "@/lib/language";
import {
  CRM_TEMPLATE_STATUS_OPTIONS,
  createPartnershipCrmUsageEventId,
  DEFAULT_CRM_CATEGORY,
  DEFAULT_CRM_PROFESSIONAL_CATEGORY,
  PARTNERSHIP_CRM_FROM_EMAIL,
  normalizeCrmCategoryKeys,
  normalizeCrmPrimaryCategory,
  parseCrmTemplateCsv,
  templateStatusLabel,
  type ParsedCrmTemplateCsv,
  type PartnershipCrmOrganizationRecord,
  type PartnershipCrmProfessionalRecord,
  type PartnershipCrmTargetRecord,
  type PartnershipCrmTemplateInput,
  type PartnershipCrmTemplateAudience,
  type PartnershipCrmTemplateRecord,
  type PartnershipCrmTemplatesPage,
  type PartnershipCrmTemplateStatus,
} from "@/lib/partnership-crm";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const TEMPLATES_QUERY_KEY = "god-mode-partnership-crm-templates";
const PLANTILLAS_USAGE_LIMIT = 100;
const PLANTILLAS_RESET_RETRY_MS = 5 * 60 * 1000;
const PLANTILLAS_USAGE_STORAGE_KEY = "golden-crow-plantillas-daily-usage-v1";
const PLANTILLAS_SUMMARY_STORAGE_KEY =
  "golden-crow-plantillas-summary-cache-v1";
const PLANTILLAS_SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type PlantillasDailyUsage = {
  surface: "plantillas";
  used: number;
  limit: number;
  percentage: number;
  remaining: number;
  resetAt: string;
  locked: boolean;
};

type PlantillasUsageEnvelope = {
  usage?: PlantillasDailyUsage;
};

class PlantillasRequestNotSentError extends Error {
  constructor() {
    super("Plantillas request was not sent because usage is locked or unverified.");
    this.name = "PlantillasRequestNotSentError";
  }
}

type PlantillasRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

function readStoredUsage(): PlantillasDailyUsage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(PLANTILLAS_USAGE_STORAGE_KEY) ?? "null",
    ) as PlantillasDailyUsage | null;
    const normalized = normalizeUsage(stored);
    if (!normalized) {
      return null;
    }
    const resetAt = Date.parse(normalized.resetAt);
    if (!Number.isFinite(resetAt) || resetAt <= Date.now()) {
      window.sessionStorage.removeItem(PLANTILLAS_USAGE_STORAGE_KEY);
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function plantillasUsageFromError(error: unknown) {
  if (!error || typeof error !== "object" || !("details" in error)) {
    return undefined;
  }
  const details = (error as { details?: unknown }).details;
  if (typeof details !== "string") {
    return undefined;
  }
  const marker = "Response JSON:\n";
  const markerIndex = details.lastIndexOf(marker);
  if (markerIndex === -1) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(details.slice(markerIndex + marker.length)) as {
      usage?: PlantillasDailyUsage;
    };
    return parsed.usage;
  } catch {
    return undefined;
  }
}

function isRateLimitError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: unknown }).status === 429
  );
}

function plantillasErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("details" in error)) {
    return undefined;
  }
  const details = (error as { details?: unknown }).details;
  if (typeof details !== "string") {
    return undefined;
  }
  const marker = "Response JSON:\n";
  const markerIndex = details.lastIndexOf(marker);
  if (markerIndex === -1) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(details.slice(markerIndex + marker.length)) as {
      code?: unknown;
    };
    return typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    return undefined;
  }
}

function isPlantillasRequestKnownNotExecuted(error: unknown) {
  return (
    error instanceof PlantillasRequestNotSentError ||
    isRateLimitError(error) ||
    (error !== null &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status?: unknown }).status === 503 &&
      plantillasErrorCode(error) === "CRM_USAGE_UNAVAILABLE")
  );
}

function storeUsage(usage: PlantillasDailyUsage) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      PLANTILLAS_USAGE_STORAGE_KEY,
      JSON.stringify(usage),
    );
  } catch {
    // The server remains authoritative when browser storage is unavailable.
  }
}

function normalizeUsage(
  value: unknown,
): PlantillasDailyUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<PlantillasDailyUsage>;
  if (
    candidate.surface !== "plantillas" ||
    typeof candidate.used !== "number" ||
    !Number.isFinite(candidate.used) ||
    !Number.isInteger(candidate.used) ||
    candidate.used < 0 ||
    candidate.used > PLANTILLAS_USAGE_LIMIT ||
    typeof candidate.limit !== "number" ||
    !Number.isFinite(candidate.limit) ||
    candidate.limit !== PLANTILLAS_USAGE_LIMIT ||
    typeof candidate.percentage !== "number" ||
    !Number.isFinite(candidate.percentage) ||
    candidate.percentage < 0 ||
    candidate.percentage > 100 ||
    typeof candidate.remaining !== "number" ||
    !Number.isFinite(candidate.remaining) ||
    candidate.remaining < 0 ||
    candidate.remaining > PLANTILLAS_USAGE_LIMIT ||
    typeof candidate.resetAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.resetAt)) ||
    Date.parse(candidate.resetAt) <= Date.now() ||
    typeof candidate.locked !== "boolean"
  ) {
    return null;
  }

  const limit = Math.max(1, candidate.limit);
  const used = Math.min(limit, Math.max(0, candidate.used));
  return {
    surface: "plantillas",
    used,
    limit,
    percentage: Math.round((used / limit) * 100),
    remaining: Math.max(0, limit - used),
    resetAt: candidate.resetAt,
    locked: used >= limit,
  };
}

function withDerivedPlantillasUsage(
  usage: PlantillasDailyUsage,
): PlantillasDailyUsage {
  const limit = PLANTILLAS_USAGE_LIMIT;
  const used = Math.min(limit, Math.max(0, usage.used));
  return {
    ...usage,
    used,
    limit,
    percentage: Math.round((used / limit) * 100),
    remaining: Math.max(0, limit - used),
    locked: used >= limit,
  };
}

export function mergePlantillasUsage(
  current: PlantillasDailyUsage | null,
  incoming: PlantillasDailyUsage,
) {
  if (!current) {
    return withDerivedPlantillasUsage(incoming);
  }

  const currentResetAt = Date.parse(current.resetAt);
  const incomingResetAt = Date.parse(incoming.resetAt);
  if (
    Number.isFinite(incomingResetAt) &&
    (!Number.isFinite(currentResetAt) || incomingResetAt > currentResetAt)
  ) {
    return withDerivedPlantillasUsage(incoming);
  }
  if (
    Number.isFinite(currentResetAt) &&
    (!Number.isFinite(incomingResetAt) || incomingResetAt < currentResetAt)
  ) {
    return withDerivedPlantillasUsage(current);
  }

  const limit = Math.min(current.limit, incoming.limit);
  const used = Math.min(limit, Math.max(current.used, incoming.used));
  return withDerivedPlantillasUsage({
    ...incoming,
    used,
    limit,
  });
}

function usePlantillasDailyUsage() {
  const [usage, setUsage] = useState<PlantillasDailyUsage | null>(null);
  const usageRef = useRef<PlantillasDailyUsage | null>(null);
  const [usageError, setUsageError] = useState("");
  const usageErrorRef = useRef("");
  const [usageReady, setUsageReady] = useState(false);
  const pageLoadStartedRef = useRef(false);
  const pageLoadEventIdRef = useRef<string | null>(null);

  const updateUsageError = useCallback((message: string) => {
    usageErrorRef.current = message;
    setUsageError(message);
  }, []);

  const acceptUsage = useCallback((next: PlantillasDailyUsage | undefined) => {
    const normalized = normalizeUsage(next);
    if (!normalized) {
      return null;
    }
    const merged = mergePlantillasUsage(usageRef.current, normalized);
    usageRef.current = merged;
    setUsage(merged);
    storeUsage(merged);
    return merged;
  }, []);

  const lockUsage = useCallback(() => {
    const current = usageRef.current;
    const next: PlantillasDailyUsage = {
      surface: "plantillas",
      used: current?.limit ?? PLANTILLAS_USAGE_LIMIT,
      limit: current?.limit ?? PLANTILLAS_USAGE_LIMIT,
      percentage: 100,
      remaining: 0,
      resetAt: current?.resetAt ?? "",
      locked: true,
    };
    usageRef.current = next;
    setUsage(next);
    if (
      next.resetAt &&
      Number.isFinite(Date.parse(next.resetAt)) &&
      Date.parse(next.resetAt) > Date.now()
    ) {
      storeUsage(next);
    } else if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(PLANTILLAS_USAGE_STORAGE_KEY);
    }
  }, []);

  const verifyPageLoad = useCallback(async (): Promise<
    "unlocked" | "locked" | "error"
  > => {
    setUsageReady(false);
    const eventId =
      pageLoadEventIdRef.current ?? createPartnershipCrmUsageEventId();
    pageLoadEventIdRef.current = eventId;
    try {
      const response = await sdkFetch<PlantillasUsageEnvelope>(
        "/admin/partnership-crm/daily-usage/page-load",
        {
          method: "POST",
          headers: {
            "X-CRM-Usage-Surface": "plantillas",
            "X-CRM-Usage-Event-ID": eventId,
          },
          body: JSON.stringify({ surface: "plantillas", eventId }),
        },
      );
      const accepted = acceptUsage(response.usage);
      if (!accepted) {
        updateUsageError(
          "Plantillas usage verification returned no valid usage.",
        );
        return "error";
      }
      updateUsageError("");
      return accepted.locked ? "locked" : "unlocked";
    } catch (error) {
      const serverUsage = plantillasUsageFromError(error);
      if (serverUsage) {
        const accepted = acceptUsage(serverUsage);
        updateUsageError(error instanceof Error ? error.message : String(error));
        return accepted?.locked ? "locked" : "error";
      } else if (isRateLimitError(error)) {
        lockUsage();
        updateUsageError(error instanceof Error ? error.message : String(error));
        return "locked";
      }
      updateUsageError(error instanceof Error ? error.message : String(error));
      return "error";
    } finally {
      setUsageReady(true);
    }
  }, [acceptUsage, lockUsage, updateUsageError]);

  useEffect(() => {
    if (pageLoadStartedRef.current) {
      return;
    }
    pageLoadStartedRef.current = true;

    const stored = readStoredUsage();
    if (stored?.locked) {
      usageRef.current = stored;
      setUsage(stored);
      setUsageReady(true);
      return;
    }
    if (stored) {
      usageRef.current = stored;
      setUsage(stored);
    }

    void verifyPageLoad();
  }, [verifyPageLoad]);

  useEffect(() => {
    if (!usage?.locked || !usage.resetAt) {
      return;
    }

    const resetAt = Date.parse(usage.resetAt);
    if (!Number.isFinite(resetAt)) {
      return;
    }

    let retryTimer: number | undefined;
    let cancelled = false;
    const reverifyUntilUnlocked = async () => {
      const outcome = await verifyPageLoad();
      if (!cancelled && outcome !== "unlocked") {
        retryTimer = window.setTimeout(
          reverifyUntilUnlocked,
          PLANTILLAS_RESET_RETRY_MS,
        );
      }
    };
    const timer = window.setTimeout(() => {
      void reverifyUntilUnlocked();
    }, Math.max(0, resetAt - Date.now() + 1000));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [usage?.locked, usage?.resetAt, verifyPageLoad]);

  const request = useCallback<PlantillasRequest>(
    async <T,>(path: string, init?: RequestInit) => {
      if (!usageReady || usageRef.current?.locked || usageErrorRef.current) {
        throw new PlantillasRequestNotSentError();
      }

      const eventId = createPartnershipCrmUsageEventId();
      const headers = new Headers(init?.headers);
      headers.set("X-CRM-Usage-Surface", "plantillas");
      headers.set("X-CRM-Usage-Event-ID", eventId);

      try {
        const response = await sdkFetch<T & PlantillasUsageEnvelope>(path, {
          ...init,
          headers,
        });
        if (!acceptUsage(response?.usage)) {
          updateUsageError("Plantillas action returned no valid usage.");
        }
        return response;
      } catch (error) {
        const serverUsage = plantillasUsageFromError(error);
        const acceptedUsage = serverUsage
          ? acceptUsage(serverUsage)
          : null;
        if (acceptedUsage) {
          // The failed action still returned an authoritative usage snapshot.
        } else if (isRateLimitError(error)) {
          lockUsage();
          updateUsageError(
            error instanceof Error ? error.message : String(error),
          );
        } else {
          updateUsageError(error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
    },
    [acceptUsage, lockUsage, updateUsageError, usageReady],
  );

  return {
    usage,
    usageError,
    canUseFresh: usageReady && !usage?.locked && !usageError,
    locked: Boolean(usage?.locked),
    request,
    retryUsageVerification: verifyPageLoad,
    usageVerificationPending: !usageReady,
  };
}
const TEMPLATE_IMPORT_CTA_CLASS =
  "h-11 min-w-[11rem] bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.26)] hover:bg-blue-700 focus-visible:ring-blue-500/35 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400";
const ORGANIZATION_TEMPLATE_VARIABLES = [
  {
    key: "contact_name",
    token: "{{contact_name}}",
    label: "Contact name",
    className:
      "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-300/35 dark:bg-sky-400/15 dark:text-sky-100",
    dotClassName: "bg-sky-500",
    recommended: true,
  },
  {
    key: "organization_name",
    token: "{{organization_name}}",
    label: "Organization name",
    className:
      "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-300/35 dark:bg-blue-400/15 dark:text-blue-100",
    dotClassName: "bg-blue-500",
    recommended: true,
  },
  {
    key: "website",
    token: "{{website}}",
    label: "Website",
    className:
      "border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-300/35 dark:bg-orange-400/15 dark:text-orange-100",
    dotClassName: "bg-orange-500",
    recommended: false,
  },
  {
    key: "website_sentence",
    token: "{{website_sentence}}",
    label: "Website sentence",
    className:
      "border-lime-200 bg-lime-50 text-lime-950 dark:border-lime-300/35 dark:bg-lime-400/15 dark:text-lime-100",
    dotClassName: "bg-lime-500",
    recommended: true,
  },
] as const;
const PROFESSIONAL_TEMPLATE_VARIABLES = [
  {
    key: "professional_name",
    token: "{{professional_name}}",
    label: "Professional name",
    className:
      "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-300/35 dark:bg-violet-400/15 dark:text-violet-100",
    dotClassName: "bg-violet-500",
    recommended: true,
  },
  {
    key: "first_name",
    token: "{{first_name}}",
    label: "First name",
    className:
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-300/35 dark:bg-fuchsia-400/15 dark:text-fuchsia-100",
    dotClassName: "bg-fuchsia-500",
    recommended: true,
  },
  {
    key: "primary_affiliation",
    token: "{{primary_affiliation}}",
    label: "Primary affiliation",
    className:
      "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-300/35 dark:bg-indigo-400/15 dark:text-indigo-100",
    dotClassName: "bg-indigo-500",
    recommended: true,
  },
  {
    key: "potential_pocket_genes_editor_fit",
    token: "{{potential_pocket_genes_editor_fit}}",
    label: "Potential Pocket Genes editor fit",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/35 dark:bg-emerald-400/15 dark:text-emerald-100",
    dotClassName: "bg-emerald-500",
    recommended: true,
  },
  {
    key: "email_route",
    token: "{{email_route}}",
    label: "Email route",
    className:
      "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-300/35 dark:bg-amber-400/15 dark:text-amber-100",
    dotClassName: "bg-amber-500",
    recommended: false,
  },
  {
    key: "linkedin_route",
    token: "{{linkedin_route}}",
    label: "LinkedIn route",
    className:
      "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-100",
    dotClassName: "bg-cyan-500",
    recommended: false,
  },
  {
    key: "research_basis",
    token: "{{research_basis}}",
    label: "Research basis",
    className:
      "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-300/35 dark:bg-teal-400/15 dark:text-teal-100",
    dotClassName: "bg-teal-500",
    recommended: false,
  },
  {
    key: "title",
    token: "{{title}}",
    label: "Role / specialty",
    className:
      "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-300/35 dark:bg-rose-400/15 dark:text-rose-100",
    dotClassName: "bg-rose-500",
    recommended: true,
  },
  {
    key: "website",
    token: "{{website}}",
    label: "Website",
    className:
      "border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-300/35 dark:bg-orange-400/15 dark:text-orange-100",
    dotClassName: "bg-orange-500",
    recommended: false,
  },
  {
    key: "website_sentence",
    token: "{{website_sentence}}",
    label: "Website sentence",
    className:
      "border-lime-200 bg-lime-50 text-lime-950 dark:border-lime-300/35 dark:bg-lime-400/15 dark:text-lime-100",
    dotClassName: "bg-lime-500",
    recommended: false,
  },
] as const;

type TemplateVariableDefinition = {
  key: string;
  token: string;
  label: string;
  className: string;
  dotClassName: string;
  recommended: boolean;
};

type TemplateQuickPatch = Partial<
  Pick<
    PartnershipCrmTemplateInput,
    "category" | "status" | "notes" | "is_favorite"
  >
>;

const TEMPLATE_VARIABLE_PATTERN = /\{\{([a-z_]+)\}\}/g;

const TEMPLATE_IMPORT_PREVIEW_LIMIT = 50;
const TEMPLATE_DETAIL_PANEL_MIN_WIDTH_PERCENT = 100 / 3;
const TEMPLATE_DETAIL_PANEL_MAX_WIDTH_PERCENT = 200 / 3;
const TEMPLATE_DETAIL_PANEL_DEFAULT_WIDTH_PERCENT = 50;
const TEMPLATE_DETAIL_PANEL_KEYBOARD_STEP_PERCENT = 4;

function clampTemplateDetailPanelWidthPercent(value: number) {
  return Math.min(
    TEMPLATE_DETAIL_PANEL_MAX_WIDTH_PERCENT,
    Math.max(TEMPLATE_DETAIL_PANEL_MIN_WIDTH_PERCENT, value),
  );
}

const ORGANIZATION_TEMPLATE_IMPORT_SAMPLE_CSV = [
  "name,audience,category,subject,body,status,is_favorite,notes",
  [
    '"Laboratorio - primer contacto"',
    '"organizations"',
    '"org_genetic_testing_laboratories"',
    '"Pocket Genes + {{organization_name}}"',
    '"Hola {{contact_name}},\\n\\nSoy Federico de Pocket Genes. Vi el trabajo de {{organization_name}}{{website_sentence}} y queria coordinar una conversacion corta para explorar colaboracion clinica/genomica.\\n\\nTe parece si agendamos 20 minutos esta semana?"',
    '"active"',
    '"true"',
    '"Usar con laboratorios y centros de genomica."',
  ].join(","),
].join("\n");
const PROFESSIONAL_TEMPLATE_IMPORT_SAMPLE_CSV = [
  "name,audience,category,subject,body,status,is_favorite,notes",
  [
    '"Profesional - primer contacto"',
    '"professionals"',
    '"pro_clinical_geneticists"',
    '"Pocket Genes + {{professional_name}}"',
    '"Hola {{first_name}},\\n\\nSoy Federico de Pocket Genes. Vi tu trabajo como {{title}} en {{primary_affiliation}}{{website_sentence}} y queria coordinar una conversacion corta para explorar colaboracion clinica/genomica.\\n\\nTe parece si agendamos 20 minutos esta semana?"',
    '"active"',
    '"true"',
    '"Usar con profesionales clinicos y referentes de genetica."',
  ].join(","),
].join("\n");

type TemplateFilters = {
  query: string;
  audience: PartnershipCrmTemplateAudience;
  status: "all" | PartnershipCrmTemplateStatus;
  category: string;
};

type TemplateFormState = {
  name: string;
  audience: PartnershipCrmTemplateAudience;
  category: string;
  subject: string;
  body: string;
  status: PartnershipCrmTemplateStatus;
  notes: string;
  is_favorite: boolean;
};

type TemplateImportPreviewRow = {
  rowNumber: number;
  template: PartnershipCrmTemplateInput;
  errors: string[];
  valid: boolean;
};

type TemplateImportResult = {
  rowNumber: number;
  action: "created" | "updated" | "skipped" | "invalid" | "failed";
  templateId?: string;
  template?: PartnershipCrmTemplateRecord;
  error?: string;
  notSent?: boolean;
};

type SequentialBulkResult<T> = {
  completed: T[];
  failure?: {
    itemId: string;
    error: string;
    notSent: boolean;
  };
};

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: "",
  audience: "organizations",
  category: DEFAULT_CRM_CATEGORY,
  subject: "",
  body: "",
  status: "active",
  notes: "",
  is_favorite: false,
};

function defaultTemplateCategory(audience: PartnershipCrmTemplateAudience) {
  return audience === "professionals"
    ? DEFAULT_CRM_PROFESSIONAL_CATEGORY
    : DEFAULT_CRM_CATEGORY;
}

const SAMPLE_ORGANIZATION: PartnershipCrmOrganizationRecord = {
  id: "preview",
  schemaVersion: 1,
  name: "Organizacion Ejemplo",
  category: DEFAULT_CRM_CATEGORY,
  website: "https://example.org/",
  websiteDomain: "example.org",
  country: "Argentina",
  status: "new",
  contactName: "Contacto",
  contactEmail: "contacto@example.org",
  contactLinkedIn: "",
  lastContactAt: null,
  notes: "",
  is_favorite: false,
  normalizedName: "organizacion ejemplo",
};

const SAMPLE_PROFESSIONAL: PartnershipCrmProfessionalRecord = {
  id: "preview-professional",
  schemaVersion: 1,
  name: "Dra. Ana Genoma",
  category: DEFAULT_CRM_PROFESSIONAL_CATEGORY,
  title: "Genetista clinica",
  primaryAffiliation: "Hospital Genomico",
  potentialPocketGenesEditorFit:
    "Clinical genetics, genetic testing, result interpretation and patient education",
  emailRoute:
    "Publicly listed professional or official institutional contact address.",
  linkedInRoute: "Official LinkedIn page of the affiliated organization.",
  researchBasis:
    "Existing verified Pocket Genes partnership dataset, affiliation website and LinkedIn record.",
  website: "https://example.org/",
  websiteDomain: "example.org",
  country: "Argentina",
  status: "new",
  email: "ana@example.org",
  linkedIn: "",
  lastContactAt: null,
  notes: "",
  is_favorite: false,
  normalizedName: "dra ana genoma",
};

function sampleTargetForAudience(
  audience: PartnershipCrmTemplateAudience,
): PartnershipCrmTargetRecord {
  return audience === "professionals"
    ? SAMPLE_PROFESSIONAL
    : SAMPLE_ORGANIZATION;
}

function templateVariablesForAudience(
  audience: PartnershipCrmTemplateAudience,
): readonly TemplateVariableDefinition[] {
  return audience === "professionals"
    ? PROFESSIONAL_TEMPLATE_VARIABLES
    : ORGANIZATION_TEMPLATE_VARIABLES;
}

function sampleVariableValue(
  key: string,
  target: PartnershipCrmTargetRecord,
  audience: PartnershipCrmTemplateAudience,
) {
  const organization = target as PartnershipCrmOrganizationRecord;
  const professional = target as PartnershipCrmProfessionalRecord;
  const website =
    audience === "professionals"
      ? professional.website || professional.websiteDomain
      : organization.website || organization.websiteDomain;

  switch (key) {
    case "contact_name":
      return audience === "professionals"
        ? professional.name || "equipo"
        : organization.contactName || "equipo";
    case "organization_name":
      return audience === "professionals"
        ? professional.primaryAffiliation || professional.name
        : organization.name;
    case "professional_name":
      return audience === "professionals"
        ? professional.name
        : organization.contactName || organization.name;
    case "first_name": {
      const name =
        audience === "professionals"
          ? professional.name
          : organization.contactName || organization.name;
      return name.trim().split(/\s+/)[0] ?? "";
    }
    case "primary_affiliation":
      return audience === "professionals"
        ? professional.primaryAffiliation
        : "";
    case "potential_pocket_genes_editor_fit":
      return audience === "professionals"
        ? professional.potentialPocketGenesEditorFit
        : "";
    case "email_route":
      return audience === "professionals" ? professional.emailRoute : "";
    case "linkedin_route":
      return audience === "professionals" ? professional.linkedInRoute : "";
    case "research_basis":
      return audience === "professionals" ? professional.researchBasis : "";
    case "title":
      return audience === "professionals" ? professional.title : "";
    case "website":
      return website;
    case "website_sentence":
      return target.websiteDomain ? ` (${target.websiteDomain})` : "";
    default:
      return "";
  }
}

function renderTemplatePreviewText(
  value: string,
  target: PartnershipCrmTargetRecord,
  audience: PartnershipCrmTemplateAudience,
) {
  return value.replace(TEMPLATE_VARIABLE_PATTERN, (_, key: string) => {
    const rawValue = sampleVariableValue(key, target, audience);
    return key === "potential_pocket_genes_editor_fit" && rawValue
      ? `"${rawValue}"`
      : rawValue;
  });
}

function renderTemplatePreviewNodes(
  value: string,
  target: PartnershipCrmTargetRecord,
  audience: PartnershipCrmTemplateAudience,
) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    const [token, key] = match;
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(value.slice(cursor, index));
    }

    const rawValue = sampleVariableValue(key, target, audience);
    nodes.push(
      key === "potential_pocket_genes_editor_fit" && rawValue ? (
        <em key={`${key}-${index}`}>{`"${rawValue}"`}</em>
      ) : (
        rawValue
      ),
    );
    cursor = index + token.length;
  }

  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }

  return nodes.length > 0 ? nodes : null;
}

function uniqueTemplateTokens(value: string) {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    const token = match[0];
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens;
}

function templateUsageFor(template: PartnershipCrmTemplateRecord) {
  const subjectTokens = uniqueTemplateTokens(template.subject);
  const bodyTokens = uniqueTemplateTokens(template.body);
  const allTokens = Array.from(new Set([...subjectTokens, ...bodyTokens]));
  const definitions = templateVariablesForAudience(template.audience);
  const definitionByToken = new Map(
    definitions.map((variable) => [variable.token, variable]),
  );
  const knownTokens = allTokens.filter((token) => definitionByToken.has(token));
  const unknownTokens = allTokens.filter(
    (token) => !definitionByToken.has(token),
  );

  return {
    subjectTokens,
    bodyTokens,
    allTokens,
    knownTokens,
    unknownTokens,
    definitions,
    recommendedMissing: definitions.filter(
      (variable) =>
        variable.recommended && !knownTokens.includes(variable.token),
    ),
  };
}

function templateFitAnalysis(template: PartnershipCrmTemplateRecord) {
  const usage = templateUsageFor(template);
  const subjectUsesVariable = usage.subjectTokens.some((token) =>
    usage.knownTokens.includes(token),
  );
  const bodyVariableCount = usage.bodyTokens.filter((token) =>
    usage.knownTokens.includes(token),
  ).length;
  const recommendedUsed = usage.definitions.filter(
    (variable) =>
      variable.recommended && usage.knownTokens.includes(variable.token),
  ).length;
  const recommendedTotal = Math.max(
    usage.definitions.filter((variable) => variable.recommended).length,
    1,
  );
  const score = Math.min(
    100,
    (subjectUsesVariable ? 20 : 0) +
      (bodyVariableCount >= 2 ? 35 : bodyVariableCount === 1 ? 22 : 0) +
      Math.round((recommendedUsed / recommendedTotal) * 30) +
      (template.category ? 10 : 0) +
      (template.is_favorite ? 5 : 0),
  );
  const label =
    score >= 80
      ? "Strong template fit"
      : score >= 55
        ? "Good template fit"
        : "Needs more dynamic variables";

  return {
    ...usage,
    score,
    label,
    recommendedUsed,
    recommendedTotal,
  };
}

function buildTemplateListPath(filters: TemplateFilters, cursor?: string) {
  const params = new URLSearchParams({
    limit: "10",
    audience: filters.audience,
  });
  const category = normalizeCrmPrimaryCategory(
    filters.category,
    filters.audience,
  );
  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (category) {
    params.set("category", category);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  return `/admin/partnership-crm/templates?${params.toString()}`;
}

function templateMatchesAppliedFilters(
  template: PartnershipCrmTemplateRecord,
  filters: TemplateFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase();
  const category = normalizeCrmPrimaryCategory(
    filters.category,
    filters.audience,
  );
  const templateCategories = normalizeCrmCategoryKeys(
    template.category,
    template.audience,
  );
  const searchableSummary = [
    template.id,
    template.name,
    template.audience,
    template.category,
    template.subject,
    template.status,
  ]
    .join(" ")
    .toLocaleLowerCase();

  return (
    template.audience === filters.audience &&
    (filters.status === "all" || template.status === filters.status) &&
    (!category || templateCategories.includes(category)) &&
    (!query || searchableSummary.includes(query))
  );
}

function formatDateTime(
  value: string | null | undefined,
  language: AppLanguage,
) {
  if (!value) {
    return "-";
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

function FavoriteCell({
  isFavorite,
  language,
}: {
  isFavorite: boolean;
  language: AppLanguage;
}) {
  const label = appText(language, isFavorite ? "Favorite" : "Not favorite");

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-6 w-6 items-center justify-center"
    >
      {isFavorite ? (
        <Star
          aria-hidden="true"
          className="h-4 w-4 fill-cyan-400 text-cyan-500"
        />
      ) : (
        <span aria-hidden="true" className="text-xs text-muted-foreground/50">
          -
        </span>
      )}
    </span>
  );
}

function favoriteFirstRecords<T extends { is_favorite?: boolean }>(
  records: T[],
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

function isPartnershipCrmTemplatesPage(
  value: unknown,
): value is PartnershipCrmTemplatesPage {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as { templates?: unknown }).templates)
  );
}

type PlantillasSummaryCache = {
  savedAt: string;
  filters: TemplateFilters;
  page: PartnershipCrmTemplatesPage;
};

function isCachedTemplateFilters(value: unknown): value is TemplateFilters {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<TemplateFilters>;
  return (
    typeof candidate.query === "string" &&
    (candidate.audience === "organizations" ||
      candidate.audience === "professionals") &&
    (candidate.status === "all" ||
      CRM_TEMPLATE_STATUS_OPTIONS.some(
        (option) => option.value === candidate.status,
      )) &&
    typeof candidate.category === "string"
  );
}

function isCachedTemplateSummary(
  value: unknown,
): value is PartnershipCrmTemplateRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PartnershipCrmTemplateRecord>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.schemaVersion === "number" &&
    Number.isInteger(candidate.schemaVersion) &&
    candidate.schemaVersion >= 1 &&
    typeof candidate.name === "string" &&
    (candidate.audience === "organizations" ||
      candidate.audience === "professionals") &&
    typeof candidate.category === "string" &&
    typeof candidate.subject === "string" &&
    typeof candidate.body === "string" &&
    CRM_TEMPLATE_STATUS_OPTIONS.some(
      (option) => option.value === candidate.status,
    ) &&
    typeof candidate.notes === "string" &&
    typeof candidate.is_favorite === "boolean" &&
    typeof candidate.normalizedName === "string"
  );
}

function isCachedTemplatesPage(
  value: unknown,
): value is PartnershipCrmTemplatesPage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PartnershipCrmTemplatesPage>;
  return (
    Array.isArray(candidate.templates) &&
    candidate.templates.every(isCachedTemplateSummary) &&
    (candidate.nextCursor === undefined ||
      typeof candidate.nextCursor === "string") &&
    (candidate.partial === undefined || typeof candidate.partial === "boolean") &&
    (candidate.scanned === undefined ||
      (typeof candidate.scanned === "number" &&
        Number.isInteger(candidate.scanned) &&
        candidate.scanned >= 0)) &&
    (candidate.asOf === undefined || typeof candidate.asOf === "string")
  );
}

function toTemplateSummary(
  template: PartnershipCrmTemplateRecord,
): PartnershipCrmTemplateRecord {
  return {
    ...template,
    body: "",
    notes: "",
  };
}

function readTemplateSummaryCache(): PlantillasSummaryCache | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = JSON.parse(
      window.sessionStorage.getItem(PLANTILLAS_SUMMARY_STORAGE_KEY) ?? "null",
    ) as PlantillasSummaryCache | null;
    const savedAt = cached ? Date.parse(cached.savedAt) : Number.NaN;
    const now = Date.now();
    if (
      !cached ||
      !isCachedTemplateFilters(cached.filters) ||
      !isCachedTemplatesPage(cached.page) ||
      !Number.isFinite(savedAt) ||
      savedAt > now ||
      now - savedAt >= PLANTILLAS_SUMMARY_CACHE_TTL_MS
    ) {
      window.sessionStorage.removeItem(PLANTILLAS_SUMMARY_STORAGE_KEY);
      return null;
    }
    return cached;
  } catch {
    window.sessionStorage.removeItem(PLANTILLAS_SUMMARY_STORAGE_KEY);
    return null;
  }
}

function storeTemplateSummaryCache(cache: PlantillasSummaryCache) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      PLANTILLAS_SUMMARY_STORAGE_KEY,
      JSON.stringify(cache),
    );
  } catch {
    // The page remains usable without browser storage.
  }
}

function clearTemplateSummaryCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(PLANTILLAS_SUMMARY_STORAGE_KEY);
  } catch {
    // A stale cache cannot be reused when browser storage is unavailable.
  }
}

function updateCachedTemplateListPages(
  queryClient: QueryClient,
  updater: (
    templates: PartnershipCrmTemplateRecord[],
  ) => PartnershipCrmTemplateRecord[],
) {
  queryClient.setQueriesData<unknown>(
    { queryKey: [TEMPLATES_QUERY_KEY] },
    (current: unknown) =>
      isPartnershipCrmTemplatesPage(current)
        ? {
            ...current,
            templates: updater(current.templates),
          }
        : current,
  );

  for (const audience of ["organizations", "professionals"] as const) {
    queryClient.setQueryData<
      InfiniteData<PartnershipCrmTemplatesPage, string>
    >([TEMPLATES_QUERY_KEY, "active", audience], (current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          templates: updater(page.templates).filter(
            (template) =>
              template.status === "active" && template.audience === audience,
          ),
        })),
      };
    });
  }
}

function clearCrmTemplateComposerCache(queryClient: QueryClient) {
  queryClient.removeQueries({
    queryKey: [TEMPLATES_QUERY_KEY, "active"],
  });
}

function templatePayload(
  state: TemplateFormState,
): PartnershipCrmTemplateInput {
  return {
    name: state.name.trim(),
    audience: state.audience,
    category: normalizeCrmPrimaryCategory(state.category, state.audience),
    subject: state.subject.trim(),
    body: state.body.trim(),
    status: state.status,
    notes: state.notes.trim(),
    is_favorite: state.is_favorite,
  };
}

function templateInputFromRecord(
  template: PartnershipCrmTemplateRecord,
  patch: TemplateQuickPatch = {},
): PartnershipCrmTemplateInput {
  const audience = template.audience ?? "organizations";

  return {
    name: template.name,
    audience,
    category: normalizeCrmPrimaryCategory(template.category, audience),
    subject: template.subject,
    body: template.body,
    status: template.status,
    notes: template.notes,
    is_favorite: template.is_favorite,
    ...patch,
  };
}

function toFormState(
  template?: PartnershipCrmTemplateRecord,
): TemplateFormState {
  if (!template) {
    return EMPTY_TEMPLATE_FORM;
  }

  return {
    name: template.name,
    audience: template.audience ?? "organizations",
    category:
      normalizeCrmPrimaryCategory(
        template.category,
        template.audience ?? "organizations",
      ) || defaultTemplateCategory(template.audience ?? "organizations"),
    subject: template.subject,
    body: template.body,
    status: template.status,
    notes: template.notes,
    is_favorite: template.is_favorite,
  };
}

function statusBadgeVariant(status: PartnershipCrmTemplateStatus) {
  if (status === "active") {
    return "success" as const;
  }
  if (status === "inactive") {
    return "warning" as const;
  }
  return "secondary" as const;
}

function templatePreviewRows(
  parsed: ParsedCrmTemplateCsv,
): TemplateImportPreviewRow[] {
  const errorsByRow = parsed.errors.reduce((map, error) => {
    const errors = map.get(error.row) ?? [];
    errors.push(error.message);
    map.set(error.row, errors);
    return map;
  }, new Map<number, string[]>());

  return parsed.rows.map((template, index) => {
    const rowNumber = index + 2;
    const errors = errorsByRow.get(rowNumber) ?? [];
    return {
      rowNumber,
      template,
      errors,
      valid: errors.length === 0,
    };
  });
}

function templateImportResultTone(result: TemplateImportResult) {
  if (result.action === "created" || result.action === "updated") {
    return "success" as const;
  }
  if (result.action === "skipped") {
    return "secondary" as const;
  }
  if (result.action === "invalid") {
    return "warning" as const;
  }
  return "destructive" as const;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
}

function TemplateStatusBadge({
  status,
  language,
}: {
  status: PartnershipCrmTemplateStatus;
  language: AppLanguage;
}) {
  return (
    <Badge variant={statusBadgeVariant(status)}>
      {appText(language, templateStatusLabel(status))}
    </Badge>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {children}
    </p>
  );
}

function PlantillasDailyUsageBar({
  usage,
  usageError,
  hasCachedData,
  language,
  onRetryVerification,
  verificationPending,
}: {
  usage: PlantillasDailyUsage | null;
  usageError: string;
  hasCachedData: boolean;
  language: AppLanguage;
  onRetryVerification: () => Promise<"unlocked" | "locked" | "error">;
  verificationPending: boolean;
}) {
  const t = (text: string) => appText(language, text);
  const used = usage?.used ?? 0;
  const limit = usage?.limit ?? PLANTILLAS_USAGE_LIMIT;
  const percentage = usage?.percentage ?? Math.round((used / limit) * 100);
  const resetLabel = usage?.resetAt
    ? formatDateTime(usage.resetAt, language)
    : t("the next daily reset");
  const hasKnownFutureReset = Boolean(
    usage?.resetAt &&
      Number.isFinite(Date.parse(usage.resetAt)) &&
      Date.parse(usage.resetAt) > Date.now(),
  );
  const tone =
    percentage >= 100
      ? "bg-red-600"
      : percentage >= 90
        ? "bg-orange-600"
        : percentage >= 70
          ? "bg-amber-500"
          : "bg-cyan-500";

  return (
    <div
      className="rounded-xl border border-border/80 bg-background/60 px-3 py-2.5"
      data-testid="plantillas-daily-usage"
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">
          {t("Plantillas daily usage")}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {used} / {limit} · {percentage}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t("Plantillas daily usage")}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", tone)}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {usage?.locked
          ? hasCachedData
            ? t("Daily limit reached. Cached data remains available until reset.")
            : t(
                "Daily limit reached. Fresh Plantillas data and actions are unavailable until reset.",
              )
          : `${t("Resets at")} ${resetLabel}.`}
      </p>
      {usageError && (!usage?.locked || !hasKnownFutureReset) ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-700 dark:text-amber-300">
          <p>
            {t(
              "Fresh Plantillas actions are unavailable until usage can be verified.",
            )}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={verificationPending}
            onClick={() => void onRetryVerification()}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", verificationPending && "animate-spin")}
            />
            {verificationPending
              ? t("Verifying usage...")
              : t("Retry verification")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function TemplatePreview({
  form,
  language,
}: {
  form: TemplateFormState;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const sampleTarget = sampleTargetForAudience(form.audience);
  const renderedSubject = renderTemplatePreviewText(
    form.subject,
    sampleTarget,
    form.audience,
  );
  const renderedBody = renderTemplatePreviewNodes(
    form.body,
    sampleTarget,
    form.audience,
  );

  return (
    <aside className="rounded-xl border border-border/80 bg-white p-4 text-slate-950 shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:border-white/70 dark:bg-black dark:text-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {t("Preview")}
          </p>
          <h3 className="mt-1 truncate font-heading text-lg font-semibold">
            {renderedSubject || t("No subject")}
          </h3>
        </div>
        <Badge variant="outline">{t("Preview sample")}</Badge>
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
          {form.audience === "professionals"
            ? SAMPLE_PROFESSIONAL.email
            : SAMPLE_ORGANIZATION.contactEmail}
        </p>
      </div>
      <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:border dark:border-white/40 dark:bg-black dark:text-white">
        {renderedBody || t("No message yet.")}
      </div>
    </aside>
  );
}

function TemplateVariablePill({
  variable,
  muted = false,
  title,
  children,
}: {
  variable: TemplateVariableDefinition;
  muted?: boolean;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      title={title ?? variable.token}
      className={cn(
        "inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 font-mono text-[0.72rem] font-semibold leading-5",
        variable.className,
        muted && "opacity-45",
      )}
    >
      {children ?? variable.token}
    </span>
  );
}

function UnknownTemplateVariablePill({ token }: { token: string }) {
  return (
    <span
      title={token}
      className="inline-flex max-w-full items-center rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.72rem] font-semibold leading-5 text-destructive"
    >
      {token}
    </span>
  );
}

function templateVariableDefinitionByToken(
  audience: PartnershipCrmTemplateAudience,
) {
  return new Map(
    templateVariablesForAudience(audience).map(
      (variable) => [variable.token, variable] as const,
    ),
  );
}

function templateVariableUsageForText(
  subject: string,
  body: string,
  audience: PartnershipCrmTemplateAudience,
) {
  const subjectTokens = uniqueTemplateTokens(subject);
  const bodyTokens = uniqueTemplateTokens(body);
  const allTokens = Array.from(new Set([...subjectTokens, ...bodyTokens]));
  const definitions = templateVariablesForAudience(audience);
  const definitionByToken = templateVariableDefinitionByToken(audience);
  const knownTokens = allTokens.filter((token) => definitionByToken.has(token));
  const unknownTokens = allTokens.filter(
    (token) => !definitionByToken.has(token),
  );
  const variables = allTokens.map((token) => ({
    token,
    variable: definitionByToken.get(token),
    usedInSubject: subjectTokens.includes(token),
    usedInBody: bodyTokens.includes(token),
  }));

  return {
    subjectTokens,
    bodyTokens,
    allTokens,
    knownTokens,
    unknownTokens,
    definitions,
    variables,
  };
}

function renderTemplateVariablePillNodes(
  value: string,
  audience: PartnershipCrmTemplateAudience,
) {
  const nodes: React.ReactNode[] = [];
  const target = sampleTargetForAudience(audience);
  const definitionByToken = templateVariableDefinitionByToken(audience);
  let cursor = 0;

  for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    const [token, key] = match;
    const index = match.index ?? 0;

    if (index > cursor) {
      nodes.push(value.slice(cursor, index));
    }

    const variable = definitionByToken.get(token);
    if (variable) {
      const rawValue = sampleVariableValue(key, target, audience);
      const displayedValue =
        key === "potential_pocket_genes_editor_fit" && rawValue
          ? `"${rawValue}"`
          : rawValue;
      nodes.push(
        <TemplateVariablePill
          key={`${token}-${index}`}
          variable={variable}
          title={`${variable.token} - ${variable.label}`}
        >
          {displayedValue || variable.token}
        </TemplateVariablePill>,
      );
    } else {
      nodes.push(
        <UnknownTemplateVariablePill key={`${token}-${index}`} token={token} />,
      );
    }

    cursor = index + token.length;
  }

  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }

  return nodes.length > 0 ? nodes : null;
}

function TemplatePreviewSidePanel({
  template,
  notesDraft,
  onNotesDraftChange,
  onQuickUpdate,
  onDelete,
  onClose,
  pending,
  favoritePending,
  deletePending,
  readOnly,
  language,
}: {
  template: PartnershipCrmTemplateRecord;
  notesDraft: string;
  onNotesDraftChange: (value: string) => void;
  onQuickUpdate: (patch: TemplateQuickPatch) => void;
  onDelete: () => void;
  onClose: () => void;
  pending: boolean;
  favoritePending: boolean;
  deletePending: boolean;
  readOnly: boolean;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const analysis = templateFitAnalysis(template);
  const target = sampleTargetForAudience(template.audience);
  const renderedSubject = renderTemplatePreviewText(
    template.subject,
    target,
    template.audience,
  );
  const renderedBody = renderTemplatePreviewNodes(
    template.body,
    target,
    template.audience,
  );
  const usedVariableDefinitions = analysis.definitions.filter((variable) =>
    analysis.knownTokens.includes(variable.token),
  );
  const notesChanged = notesDraft !== template.notes;

  return (
    <aside
      data-testid="template-preview-panel"
      className="grid gap-4 xl:min-h-0 xl:overflow-y-auto xl:overscroll-auto xl:pl-2"
    >
      <div className="min-w-0 rounded-xl border border-border/80 bg-background/70 p-4">
        <div className="flex items-start gap-3 border-b border-border/70 pb-3">
          <div className="min-w-0 flex-1">
            <h3
              data-testid="template-preview-panel-title"
              className="line-clamp-2 break-words font-heading text-xl font-semibold text-foreground"
            >
              {template.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCrmCategory(
                template.category,
                language,
                template.audience,
              ) || t("No category")}
            </p>
          </div>
          <div
            data-testid="template-preview-panel-actions"
            className="ml-auto flex min-w-max shrink-0 flex-col items-end self-stretch"
          >
            <div
              data-testid="template-preview-panel-action-row"
              className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap"
            >
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="shrink-0"
                aria-label={
                  template.is_favorite
                    ? t("Unmark as favorite")
                    : t("Mark as favorite")
                }
                title={
                  template.is_favorite
                    ? t("Unmark as favorite")
                    : t("Mark as favorite")
                }
                onClick={() =>
                  onQuickUpdate({ is_favorite: !template.is_favorite })
                }
                disabled={favoritePending}
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    template.is_favorite
                      ? "fill-cyan-400 text-cyan-500"
                      : "text-muted-foreground/60",
                  )}
                />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="shrink-0"
                disabled={readOnly}
                asChild
              >
                <Link
                  href={`/god-mode/plantillas/${encodeURIComponent(template.id)}`}
                  aria-label={t("Edit")}
                  title={t("Edit")}
                  aria-disabled={readOnly}
                  onClick={(event) => {
                    if (readOnly) {
                      event.preventDefault();
                    }
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">{t("Edit")}</span>
                </Link>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                className="shrink-0"
                aria-label={t("Delete")}
                title={t("Delete")}
                onClick={onDelete}
                disabled={deletePending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={t("Hide details")}
                title={t("Hide details")}
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div
            data-testid="template-preview-panel-tags"
            className="flex flex-wrap items-center gap-2"
          >
            <TemplateStatusBadge status={template.status} language={language} />
            <Badge variant="outline">
              {template.audience === "professionals"
                ? t("Professionals")
                : t("Organizations")}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <Label>{t("Status")}</Label>
            <Select
              value={template.status}
              onValueChange={(value) =>
                onQuickUpdate({
                  status: value as PartnershipCrmTemplateStatus,
                })
              }
              disabled={pending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="crm-control-dropdown">
                {CRM_TEMPLATE_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-panel-category">{t("Category")}</Label>
            <CrmCategorySelect
              id="template-panel-category"
              value={template.category}
              onChange={(category) => onQuickUpdate({ category })}
              language={language}
              mode="form"
              audience={template.audience}
              disabled={pending}
            />
          </div>
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        className="h-12 w-full bg-blue-600 text-base font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] hover:bg-blue-700 focus-visible:ring-blue-500/35 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400"
        disabled={readOnly}
        asChild
      >
        <Link
          href={`/god-mode/plantillas/${encodeURIComponent(template.id)}`}
          aria-disabled={readOnly}
          onClick={(event) => {
            if (readOnly) {
              event.preventDefault();
            }
          }}
        >
          <Pencil className="h-4 w-4" />
          {t("Edit text")}
        </Link>
      </Button>

      <div className="min-w-0 rounded-xl border border-border/80 bg-white p-4 text-slate-950 shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:border-white/70 dark:bg-black dark:text-white">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {t("Preview")}
            </p>
            <h4
              data-testid="template-preview-panel-subject"
              className="mt-1 line-clamp-2 break-words font-heading text-lg font-semibold"
            >
              {renderedSubject || t("No subject")}
            </h4>
          </div>
          <Badge variant="outline" className="shrink-0">
            {t("Read only")}
          </Badge>
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
            {template.audience === "professionals"
              ? SAMPLE_PROFESSIONAL.email
              : SAMPLE_ORGANIZATION.contactEmail}
          </p>
        </div>
        <div className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:border dark:border-white/40 dark:bg-black dark:text-white">
          {renderedBody || t("No message yet.")}
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-background/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("Template fit")}
            </p>
            <h4 className="mt-1 font-heading text-lg font-semibold">
              {t(analysis.label)}
            </h4>
          </div>
          <div className="rounded-full border border-border/80 bg-muted/30 px-3 py-1 text-sm font-semibold">
            {analysis.score}%
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-blue-600 dark:bg-blue-400"
            style={{ width: `${analysis.score}%` }}
          />
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {analysis.recommendedMissing.length > 0
            ? `${t("Recommended variables missing")}: ${analysis.recommendedMissing
                .map((variable) => variable.token)
                .join(", ")}`
            : t("Uses the recommended dynamic variables for this audience.")}
        </p>
      </div>

      <div
        data-testid="template-preview-variables"
        className="rounded-xl border border-border/80 bg-background/70 p-4"
      >
        <div className="flex items-center gap-2">
          <Braces className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-heading text-sm font-semibold">
            {t("Variables")}
          </h4>
        </div>
        {usedVariableDefinitions.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-border/80">
            <table className="w-full text-left text-xs">
              <tbody>
                {usedVariableDefinitions.map((variable) => {
                  const usedInSubject = analysis.subjectTokens.includes(
                    variable.token,
                  );
                  const usedInBody = analysis.bodyTokens.includes(
                    variable.token,
                  );

                  return (
                    <tr
                      key={variable.token}
                      className="border-b border-border/60 last:border-b-0"
                    >
                      <th className="bg-muted/30 px-2 py-2 align-top">
                        <TemplateVariablePill variable={variable} />
                      </th>
                      <td className="px-2 py-2 align-top text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {usedInSubject ? (
                            <Badge variant="outline">{t("Subject")}</Badge>
                          ) : null}
                          {usedInBody ? (
                            <Badge variant="outline">{t("Message")}</Badge>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState>{t("No variables used in this message.")}</EmptyState>
          </div>
        )}
        {analysis.unknownTokens.length > 0 ? (
          <p className="mt-3 text-sm text-destructive">
            {t("Unknown variables render blank")}:{" "}
            {analysis.unknownTokens.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/80 bg-background/70 p-4">
        <Label htmlFor="template-panel-notes">{t("Notes")}</Label>
        <Textarea
          id="template-panel-notes"
          value={notesDraft}
          onChange={(event) => onNotesDraftChange(event.target.value)}
          className="mt-2 min-h-24"
          disabled={pending}
        />
        <Button
          type="button"
          size="sm"
          className="mt-3"
          onClick={() => onQuickUpdate({ notes: notesDraft })}
          disabled={pending || !notesChanged}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {pending ? t("Saving...") : t("Save notes")}
        </Button>
      </div>
    </aside>
  );
}

function TemplateSummaryOnlySidePanel({
  template,
  quotaLocked,
  freshAccessAvailable,
  verificationPending,
  loading,
  onLoad,
  onRetryVerification,
  onClose,
  language,
}: {
  template: PartnershipCrmTemplateRecord;
  quotaLocked: boolean;
  freshAccessAvailable: boolean;
  verificationPending: boolean;
  loading: boolean;
  onLoad: () => void;
  onRetryVerification: () => void;
  onClose: () => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const verificationUnavailable = !quotaLocked && !freshAccessAvailable;

  return (
    <aside
      data-testid="template-summary-only-panel"
      className="grid content-start gap-4 xl:min-h-0 xl:overflow-y-auto xl:pl-2"
    >
      <div className="rounded-xl border border-border/80 bg-background/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant="outline">{t("Summary only")}</Badge>
            <h3 className="mt-3 font-heading text-xl font-semibold">
              {template.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCrmCategory(
                template.category,
                language,
                template.audience,
              ) || t("No category")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("Hide details")}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-4 rounded-lg border border-border/70 bg-muted/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("Subject")}
          </p>
          <p className="mt-1 text-sm font-medium">
            {template.subject || t("No subject")}
          </p>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {quotaLocked
            ? t(
                "The cached summary does not include the message, notes, or fit score. Details can be loaded after the daily reset.",
              )
            : verificationUnavailable
              ? verificationPending
                ? t(
                    "The cached summary does not include the message, notes, or fit score. Details are unavailable while daily usage is being verified.",
                  )
                : t(
                    "The cached summary does not include the message, notes, or fit score. Details are unavailable because daily usage could not be verified. Retry verification to continue.",
                  )
            : t(
                "The cached summary does not include the message, notes, or fit score. Load details only when needed.",
              )}
        </p>
        <Button
          type="button"
          className="mt-4 w-full"
          onClick={verificationUnavailable ? onRetryVerification : onLoad}
          disabled={quotaLocked || loading || verificationPending}
        >
          {verificationPending
            ? t("Verifying usage...")
            : loading
            ? t("Loading...")
            : quotaLocked
              ? t("Available after daily reset")
              : verificationUnavailable
                ? t("Retry verification")
              : t("Tap to load details")}
        </Button>
      </div>
    </aside>
  );
}

function TemplateImportReviewCard({
  row,
  rowIndex,
  totalRows,
  result,
  importing,
  pauseRequested,
  locked,
  onAdd,
  onSkip,
  onImportAllRemaining,
  onPauseImport,
  onPreviousRow,
  onNextPendingRow,
  hasPreviousRow,
  hasNextPendingRow,
  language,
}: {
  row: TemplateImportPreviewRow;
  rowIndex: number;
  totalRows: number;
  result?: TemplateImportResult;
  importing: boolean;
  pauseRequested: boolean;
  locked: boolean;
  onAdd: () => void;
  onSkip: () => void;
  onImportAllRemaining: () => void;
  onPauseImport: () => void;
  onPreviousRow: () => void;
  onNextPendingRow: () => void;
  hasPreviousRow: boolean;
  hasNextPendingRow: boolean;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const audience = row.template.audience ?? "organizations";
  const usage = templateVariableUsageForText(
    row.template.subject,
    row.template.body,
    audience,
  );
  const resultLabel = result
    ? result.action === "created"
      ? "Row imported"
      : result.action === "updated"
        ? "Row updated"
        : result.action === "skipped"
          ? "Row skipped"
          : result.action === "invalid"
            ? "Row invalid"
            : "Failed"
    : row.valid
      ? "Ready"
      : "Row invalid";
  return (
    <section
      data-testid="template-import-current-row"
      className="grid gap-4 rounded-[1.15rem] border border-border/80 bg-background/75 p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t("Current row")}</Badge>
            <span className="text-sm text-muted-foreground">
              {t("Row")} {rowIndex + 1} {t("of")} {totalRows}
            </span>
            <Badge
              variant={
                result
                  ? templateImportResultTone(result)
                  : row.valid
                    ? "success"
                    : "destructive"
              }
            >
              {t(resultLabel)}
            </Badge>
          </div>
          <h3 className="mt-2 font-heading text-xl font-semibold text-foreground">
            {row.template.name || t("Untitled template")}
          </h3>
          {row.template.notes ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {row.template.notes}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPreviousRow}
            disabled={importing || !hasPreviousRow}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("Previous row")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNextPendingRow}
            disabled={importing || !hasNextPendingRow}
          >
            <ChevronRight className="h-4 w-4" />
            {t("Next pending row")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {audience === "professionals"
              ? t("Professionals")
              : t("Organizations")}
          </Badge>
          <TemplateStatusBadge
            status={row.template.status ?? "active"}
            language={language}
          />
          {row.template.is_favorite ? (
            <Badge
              variant="outline"
              className="border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-100"
            >
              <Star className="h-3.5 w-3.5 fill-cyan-400 text-cyan-500" />
              {t("Favorite")}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("Category")}
          </p>
          <p className="mt-1 text-sm font-medium">
            {formatCrmCategory(
              row.template.category ?? "",
              language,
              audience,
            ) || t("No category")}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("CSV row")}
          </p>
          <p className="mt-1 font-mono text-sm font-medium">{row.rowNumber}</p>
        </div>
      </div>

      {row.errors.length > 0 ? (
        <ErrorBanner>
          {row.errors.map((error) => t(error)).join(" ")}
        </ErrorBanner>
      ) : null}
      {result?.action === "failed" && result.error ? (
        <ErrorBanner>{result.error}</ErrorBanner>
      ) : null}

      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>{t("Subject")}</Label>
          <div className="min-h-11 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm leading-7">
            {renderTemplateVariablePillNodes(row.template.subject, audience) ??
              "-"}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("Message")}</Label>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-background px-3 py-2 text-sm leading-7">
            {renderTemplateVariablePillNodes(row.template.body, audience) ??
              "-"}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <Braces className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-heading text-sm font-semibold">
            {t("Variables used")}
          </h4>
        </div>
        {usage.variables.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-background/70">
            <table className="w-full text-left text-xs">
              <tbody>
                {usage.variables.map((entry) => (
                  <tr
                    key={entry.token}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <th className="w-[15rem] bg-muted/30 px-2 py-2 align-top">
                      {entry.variable ? (
                        <TemplateVariablePill variable={entry.variable} />
                      ) : (
                        <UnknownTemplateVariablePill token={entry.token} />
                      )}
                    </th>
                    <td className="px-2 py-2 align-top text-muted-foreground">
                      <div className="flex flex-wrap gap-1">
                        {entry.usedInSubject ? (
                          <Badge variant="outline">{t("Subject")}</Badge>
                        ) : null}
                        {entry.usedInBody ? (
                          <Badge variant="outline">{t("Message")}</Badge>
                        ) : null}
                        {entry.variable ? null : (
                          <Badge variant="destructive">
                            {t("Unknown variables render blank")}
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("No variables used in this message.")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {importing ? (
          <Button
            type="button"
            variant="outline"
            onClick={onPauseImport}
            disabled={pauseRequested}
          >
            <Pause className="h-4 w-4" />
            {pauseRequested
              ? t("Pausing after current row")
              : t("Pause after current row")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={onSkip}
          disabled={importing || Boolean(result)}
        >
          <X className="h-4 w-4" />
          {t("Skip row")}
        </Button>
        <Button
          type="button"
          onClick={onAdd}
          disabled={
            importing ||
            locked ||
            Boolean(result) ||
            !row.valid
          }
        >
          <Plus className="h-4 w-4" />
          {importing ? t("Importing...") : t("Process row")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onImportAllRemaining}
          disabled={
            importing || locked || Boolean(result)
          }
        >
          <FileUp className="h-4 w-4" />
          {t("Process next 5 rows")}
        </Button>
      </div>
    </section>
  );
}

function TemplateImportDialog({
  open,
  initialAudience,
  onOpenChange,
  onImported,
  onAmbiguousMutation,
  language,
  request,
  locked,
}: {
  open: boolean;
  initialAudience: PartnershipCrmTemplateAudience;
  onOpenChange: (open: boolean) => void;
  onImported: (templates: PartnershipCrmTemplateRecord[]) => void;
  onAmbiguousMutation: () => void;
  language: AppLanguage;
  request: PlantillasRequest;
  locked: boolean;
}) {
  const t = (text: string) => appText(language, text);
  const [audience, setAudience] =
    useState<PartnershipCrmTemplateAudience>(initialAudience);
  const csvTextRef = useRef("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCrmTemplateCsv | null>(null);
  const [importing, setImporting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [results, setResults] = useState<TemplateImportResult[]>([]);
  const importPauseRequestedRef = useRef(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [autoImportPaused, setAutoImportPaused] = useState(false);

  useEffect(() => {
    if (open) {
      setAudience(initialAudience);
    }
  }, [initialAudience, open]);

  useEffect(() => {
    if (open) {
      return;
    }

    setAudience(initialAudience);
    csvTextRef.current = "";
    setFileName("");
    setParsed(null);
    setImporting(false);
    setCompleted(false);
    setActiveRowIndex(0);
    setReviewPanelOpen(false);
    setProcessedCount(0);
    setResults([]);
    importPauseRequestedRef.current = false;
    setPauseRequested(false);
    setAutoImportPaused(false);
  }, [initialAudience, open]);

  const previewRows = useMemo(
    () => (parsed ? templatePreviewRows(parsed) : []),
    [parsed],
  );
  const validRows = useMemo(
    () => previewRows.filter((row) => row.valid),
    [previewRows],
  );
  const visiblePreviewRows = useMemo(
    () => previewRows.slice(0, TEMPLATE_IMPORT_PREVIEW_LIMIT),
    [previewRows],
  );
  const headerErrors = useMemo(
    () => parsed?.errors.filter((error) => error.row < 2) ?? [],
    [parsed],
  );
  const resultByRow = useMemo(
    () => new Map(results.map((result) => [result.rowNumber, result] as const)),
    [results],
  );
  const invalidCount = previewRows.length - validRows.length;
  const createdCount = results.filter(
    (result) => result.action === "created",
  ).length;
  const updatedCount = results.filter(
    (result) => result.action === "updated",
  ).length;
  const failedCount = results.filter(
    (result) => result.action === "failed",
  ).length;
  const skippedCount = results.filter(
    (result) => result.action === "skipped",
  ).length;
  const currentRow = previewRows[activeRowIndex] ?? null;
  const currentRowResult = currentRow
    ? resultByRow.get(currentRow.rowNumber)
    : undefined;
  const hasPendingRows = previewRows.some(
    (row) => !resultByRow.has(row.rowNumber),
  );
  const progressValue =
    previewRows.length > 0
      ? Math.round((processedCount / previewRows.length) * 100)
      : 0;
  const canImportRemaining =
    previewRows.length > 0 &&
    hasPendingRows &&
    !importing &&
    !completed &&
    !locked;

  function resetImportState() {
    csvTextRef.current = "";
    setFileName("");
    setParsed(null);
    setImporting(false);
    setCompleted(false);
    setActiveRowIndex(0);
    setReviewPanelOpen(false);
    setProcessedCount(0);
    setResults([]);
    importPauseRequestedRef.current = false;
    setPauseRequested(false);
    setAutoImportPaused(false);
  }

  function parseCsv(
    text: string,
    nextFileName = "",
    nextAudience: PartnershipCrmTemplateAudience = audience,
  ) {
    csvTextRef.current = text;
    setFileName(nextFileName);
    setParsed(text.trim() ? parseCrmTemplateCsv(text, nextAudience) : null);
    setCompleted(false);
    setActiveRowIndex(0);
    setReviewPanelOpen(false);
    setProcessedCount(0);
    setResults([]);
    importPauseRequestedRef.current = false;
    setPauseRequested(false);
    setAutoImportPaused(false);
  }

  function handleAudienceChange(nextAudience: PartnershipCrmTemplateAudience) {
    setAudience(nextAudience);
    parseCsv(csvTextRef.current, fileName, nextAudience);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      csvTextRef.current = text;
      setFileName(file.name);
      setParsed(parseCrmTemplateCsv(text, audience));
      setCompleted(false);
      setActiveRowIndex(0);
      setReviewPanelOpen(false);
      setProcessedCount(0);
      setResults([]);
      importPauseRequestedRef.current = false;
      setPauseRequested(false);
      setAutoImportPaused(false);
    } catch (error) {
      csvTextRef.current = "";
      setFileName(file.name);
      setParsed({
        rows: [],
        errors: [{ row: 0, message: errorMessage(error) }],
      });
      setCompleted(false);
      setActiveRowIndex(0);
      setReviewPanelOpen(false);
      setProcessedCount(0);
      setResults([]);
      importPauseRequestedRef.current = false;
      setPauseRequested(false);
      setAutoImportPaused(false);
    } finally {
      input.value = "";
    }
  }

  function mergeResult(
    currentResults: TemplateImportResult[],
    nextResult: TemplateImportResult,
  ) {
    return [
      ...currentResults.filter(
        (result) => result.rowNumber !== nextResult.rowNumber,
      ),
      nextResult,
    ].sort((left, right) => left.rowNumber - right.rowNumber);
  }

  function nextUnprocessedRowIndex(
    startIndex: number,
    nextResults: TemplateImportResult[],
  ) {
    const processedRows = new Set(
      nextResults.map((result) => result.rowNumber),
    );

    return previewRows.findIndex(
      (row, index) => index > startIndex && !processedRows.has(row.rowNumber),
    );
  }

  function commitImportProgress(
    rowIndex: number,
    nextResults: TemplateImportResult[],
  ) {
    const failedResult = nextResults.find((result) => result.action === "failed");
    if (failedResult) {
      const failedRowIndex = previewRows.findIndex(
        (row) => row.rowNumber === failedResult.rowNumber,
      );
      setResults(nextResults);
      setProcessedCount(nextResults.length);
      setActiveRowIndex(Math.max(0, failedRowIndex));
      setReviewPanelOpen(true);
      setCompleted(false);
      return;
    }
    const nextRowIndex = nextUnprocessedRowIndex(rowIndex, nextResults);

    setResults(nextResults);
    setProcessedCount(nextResults.length);

    if (nextRowIndex >= 0) {
      setActiveRowIndex(nextRowIndex);
      return;
    }

    setActiveRowIndex(Math.max(0, previewRows.length - 1));
    setReviewPanelOpen(false);
    setCompleted(previewRows.length > 0);
  }

  async function importTemplateFromRow(row: TemplateImportPreviewRow) {
    if (!row.valid) {
      return {
        rowNumber: row.rowNumber,
        action: "invalid" as const,
        error: row.errors.join(" "),
      };
    }

    try {
      const response = await request<{
        action: "created" | "updated";
        template: PartnershipCrmTemplateRecord;
      }>("/admin/partnership-crm/templates/import", {
        method: "POST",
        body: JSON.stringify(row.template),
      });

      return {
        rowNumber: row.rowNumber,
        action: response.action,
        templateId: response.template.id,
        template: response.template,
      };
    } catch (error) {
      const notSent = isPlantillasRequestKnownNotExecuted(error);
      if (!notSent) {
        onAmbiguousMutation();
      }
      return {
        rowNumber: row.rowNumber,
        action: "failed" as const,
        error: notSent
          ? t(
              "This template was not sent because the daily limit was reached or usage could not be verified.",
            )
          : `${t("The failing template outcome is unknown.")} ${errorMessage(error)}`,
        notSent,
      };
    }
  }

  async function handleAddCurrentRow() {
    if (!currentRow || currentRowResult || importing) {
      return;
    }

    setCompleted(false);
    setAutoImportPaused(false);
    setImporting(true);
    const result = await importTemplateFromRow(currentRow);
    const nextResults = mergeResult(results, result);
    setImporting(false);
    commitImportProgress(activeRowIndex, nextResults);

    if (result.action === "created" || result.action === "updated") {
      if (result.template) {
        onImported([result.template]);
      }
    }
  }

  function handleSkipCurrentRow() {
    if (!currentRow || currentRowResult || importing) {
      return;
    }

    const result: TemplateImportResult = currentRow.valid
      ? {
          rowNumber: currentRow.rowNumber,
          action: "skipped",
          error: "Skipped during interactive review.",
        }
      : {
          rowNumber: currentRow.rowNumber,
          action: "invalid",
          error: currentRow.errors.join(" "),
        };

    setAutoImportPaused(false);
    commitImportProgress(activeRowIndex, mergeResult(results, result));
  }

  function handleReviewRemainingOneByOne() {
    if (!canImportRemaining) {
      return;
    }

    const currentIsPending =
      currentRow && !resultByRow.has(currentRow.rowNumber);
    if (currentIsPending) {
      setCompleted(false);
      setAutoImportPaused(false);
      setReviewPanelOpen(true);
      return;
    }

    const nextRowIndex = nextUnprocessedRowIndex(-1, results);
    if (nextRowIndex >= 0) {
      setCompleted(false);
      setAutoImportPaused(false);
      setReviewPanelOpen(true);
      setActiveRowIndex(nextRowIndex);
    }
  }

  function handlePauseImport() {
    if (!importing) {
      return;
    }

    importPauseRequestedRef.current = true;
    setPauseRequested(true);
  }

  function handlePreviousRow() {
    if (importing || activeRowIndex <= 0) {
      return;
    }

    setActiveRowIndex(activeRowIndex - 1);
    setReviewPanelOpen(true);
    setAutoImportPaused(false);
  }

  function handleNextPendingRow() {
    if (importing) {
      return;
    }

    const nextAfterCurrent = nextUnprocessedRowIndex(activeRowIndex, results);
    const firstPending = nextUnprocessedRowIndex(-1, results);
    const nextRowIndex =
      nextAfterCurrent >= 0
        ? nextAfterCurrent
        : firstPending !== activeRowIndex
          ? firstPending
          : -1;

    if (nextRowIndex >= 0) {
      setActiveRowIndex(nextRowIndex);
      setReviewPanelOpen(true);
      setAutoImportPaused(false);
    }
  }

  async function importRowsInSequence({
    startIndex,
  }: {
    startIndex: number;
  }) {
    if (!canImportRemaining) {
      return;
    }

    let workingResults = results;
    const changedTemplates: PartnershipCrmTemplateRecord[] = [];
    let paused = false;
    let failedRowIndex = -1;

    importPauseRequestedRef.current = false;
    setPauseRequested(false);
    setAutoImportPaused(false);
    setCompleted(false);
    setReviewPanelOpen(true);
    setImporting(true);

    let processedThisRun = 0;
    for (
      let rowIndex = startIndex;
      rowIndex < previewRows.length;
      rowIndex += 1
    ) {
      const row = previewRows[rowIndex];
      if (
        !row ||
        workingResults.some((result) => result.rowNumber === row.rowNumber)
      ) {
        continue;
      }

      if (importPauseRequestedRef.current) {
        paused = true;
        break;
      }

      setActiveRowIndex(rowIndex);
      const result = await importTemplateFromRow(row);
      workingResults = mergeResult(workingResults, result);
      if (
        (result.action === "created" || result.action === "updated") &&
        result.template
      ) {
        changedTemplates.push(result.template);
      }
      setResults(workingResults);
      setProcessedCount(workingResults.length);
      processedThisRun += 1;

      if (result.action === "failed") {
        paused = true;
        failedRowIndex = rowIndex;
        break;
      }

      if (importPauseRequestedRef.current || processedThisRun >= 5) {
        paused = true;
        break;
      }
    }

    importPauseRequestedRef.current = false;
    setImporting(false);
    setPauseRequested(false);

    const nextRowIndex = nextUnprocessedRowIndex(-1, workingResults);
    if (failedRowIndex >= 0) {
      setActiveRowIndex(failedRowIndex);
      setReviewPanelOpen(true);
      setCompleted(false);
      setAutoImportPaused(true);
    } else if (paused && nextRowIndex >= 0) {
      setActiveRowIndex(nextRowIndex);
      setReviewPanelOpen(true);
      setCompleted(false);
      setAutoImportPaused(true);
    } else {
      setActiveRowIndex(Math.max(0, previewRows.length - 1));
      setReviewPanelOpen(false);
      setCompleted(previewRows.length > 0);
      setAutoImportPaused(false);
    }

    if (changedTemplates.length > 0) {
      onImported(changedTemplates);
    }
  }

  async function handleImportAll() {
    await importRowsInSequence({ startIndex: 0 });
  }

  async function handleImportAllRemaining() {
    await importRowsInSequence({
      startIndex: activeRowIndex,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!importing) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="crm-control-surface sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("Import templates from CSV")}</DialogTitle>
          <DialogDescription>
            {t("Review each template before submitting it to plantillas.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <CrmTargetSegmentedControl
            value={audience}
            onChange={handleAudienceChange}
            language={language}
            disabled={importing || completed}
          />

          {completed ? (
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
                        {t("Template import finished")}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-emerald-950/72 dark:text-emerald-50/72">
                        {t(
                          "Templates were processed one by one. Refresh the plantillas list only when needed.",
                        )}
                      </p>
                      {fileName ? (
                        <p className="mt-2 truncate text-xs text-emerald-950/60 dark:text-emerald-50/60">
                          {fileName}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant="success" className="h-7 px-3 text-sm">
                    {previewRows.length} {t("rows")}
                  </Badge>
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-emerald-100/85 dark:bg-emerald-950/45">
                  <div className="h-full rounded-full bg-emerald-600" />
                </div>

                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-6">
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Created templates")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {createdCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Updated")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {updatedCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Valid")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {validRows.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Invalid")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {invalidCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Skipped rows")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {skippedCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Failed rows")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{failedCount}</p>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {!completed ? (
            <>
              <div className="grid gap-3 rounded-xl border border-border/80 bg-background/70 p-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,0.7fr)]">
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="crm-template-import-file">
                      {t("CSV file")}
                    </Label>
                    <Input
                      id="crm-template-import-file"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileChange}
                      disabled={importing}
                    />
                    {fileName ? (
                      <p className="text-xs text-muted-foreground">
                        {t("Selected file")}: {fileName}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-3">
                    <p className="text-sm font-medium">
                      {parsed ? t("CSV parsed") : t("No CSV selected")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t(
                        "Raw CSV contents are not rendered. The preview below is capped to protect the UI.",
                      )}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-heading text-sm font-semibold">
                      {t("Sample template CSV")}
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        parseCsv(
                          audience === "professionals"
                            ? PROFESSIONAL_TEMPLATE_IMPORT_SAMPLE_CSV
                            : ORGANIZATION_TEMPLATE_IMPORT_SAMPLE_CSV,
                          "sample-plantillas.csv",
                        )
                      }
                      disabled={importing}
                    >
                      {t("Use sample")}
                    </Button>
                  </div>
                  <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
                    {audience === "professionals"
                      ? PROFESSIONAL_TEMPLATE_IMPORT_SAMPLE_CSV
                      : ORGANIZATION_TEMPLATE_IMPORT_SAMPLE_CSV}
                  </pre>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
                {[
                  { label: "Found", value: previewRows.length },
                  { label: "Valid", value: validRows.length },
                  { label: "Invalid", value: invalidCount },
                  { label: "Created templates", value: createdCount },
                  { label: "Updated", value: updatedCount },
                  { label: "Skipped rows", value: skippedCount },
                  { label: "Failed rows", value: failedCount },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-border/80 bg-background/70 px-3 py-2"
                  >
                    <p className="text-xs text-muted-foreground">
                      {t(item.label)}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{item.value}</p>
                  </div>
                ))}
              </div>

              {parsed && previewRows.length > 0 ? (
                <div className="rounded-xl border border-border/80 bg-background/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {importing
                        ? t("Importing one row at a time")
                        : t("Ready for review")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {processedCount} / {previewRows.length} {t("templates")}
                    </p>
                    {importing ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handlePauseImport}
                        disabled={pauseRequested}
                      >
                        <Pause className="h-4 w-4" />
                        {pauseRequested
                          ? t("Pausing after current row")
                          : t("Pause after current row")}
                      </Button>
                    ) : null}
                  </div>
                  <Progress value={progressValue} className="mt-3 h-2" />
                </div>
              ) : null}

              {parsed && previewRows.length > 0 ? (
                <div
                  className={cn(
                    "rounded-xl border p-3",
                    autoImportPaused
                      ? "border-blue-200 bg-blue-50/85 text-blue-950 dark:border-blue-300/25 dark:bg-blue-400/12 dark:text-blue-50"
                      : "border-border/80 bg-muted/20",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ListChecks className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-semibold">
                          {autoImportPaused
                            ? t("Automatic import paused.")
                            : t("Manual, bounded import")}
                        </p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {autoImportPaused
                          ? t(
                              "Automatic import paused. Review the current row, then continue with pending rows when ready.",
                            )
                          : t(
                              "Selecting a CSV does not scan existing templates. Import rows deliberately, at most five at a time.",
                            )}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t(
                          "The server decides whether each submitted row creates or updates a template.",
                        )}
                      </p>
                    </div>
                    <Badge variant={autoImportPaused ? "default" : "outline"}>
                      {t("Server decides create or update")}
                    </Badge>
                  </div>
                </div>
              ) : null}

              {headerErrors.length > 0 ? (
                <ErrorBanner>
                  {headerErrors.map((error) => t(error.message)).join(" ")}
                </ErrorBanner>
              ) : null}

              {reviewPanelOpen ? (
                currentRow ? (
                  <TemplateImportReviewCard
                    row={currentRow}
                    rowIndex={activeRowIndex}
                    totalRows={previewRows.length}
                    result={currentRowResult}
                    importing={importing}
                    locked={locked}
                    onAdd={handleAddCurrentRow}
                    onSkip={handleSkipCurrentRow}
                    onImportAllRemaining={handleImportAllRemaining}
                    onPauseImport={handlePauseImport}
                    onPreviousRow={handlePreviousRow}
                    onNextPendingRow={handleNextPendingRow}
                    hasPreviousRow={activeRowIndex > 0}
                    hasNextPendingRow={previewRows.some(
                      (row, index) =>
                        index !== activeRowIndex &&
                        !resultByRow.has(row.rowNumber),
                    )}
                    pauseRequested={pauseRequested}
                    language={language}
                  />
                ) : (
                  <EmptyState>{t("No import rows found.")}</EmptyState>
                )
              ) : parsed && previewRows.length === 0 ? (
                <EmptyState>{t("No import rows found.")}</EmptyState>
              ) : null}

              <div className="rounded-xl border border-border/80 bg-background/64 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-heading text-sm font-semibold">
                    {t("Import queue")}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {visiblePreviewRows.length} / {previewRows.length}{" "}
                    {t("rows")}
                  </span>
                </div>
                {visiblePreviewRows.length === 0 ? (
                  <EmptyState>{t("No import rows found.")}</EmptyState>
                ) : (
                  <div className="mt-3 grid max-h-56 gap-2 overflow-auto pr-1">
                    {visiblePreviewRows.map((row, index) => {
                      const result = resultByRow.get(row.rowNumber);
                      const resultLabel = result
                        ? result.action === "created"
                          ? "Row imported"
                          : result.action === "updated"
                            ? "Row updated"
                            : result.action === "skipped"
                              ? "Row skipped"
                              : result.action === "invalid"
                                ? "Row invalid"
                                : "Failed"
                        : row.valid
                          ? "Ready"
                          : "Row invalid";

                      return (
                        <button
                          key={row.rowNumber}
                          type="button"
                          className={cn(
                            "grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                            index === activeRowIndex
                              ? "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-300/35 dark:bg-blue-400/12 dark:text-blue-50"
                              : "border-border/70 bg-background/60 hover:bg-muted/45",
                          )}
                          onClick={() => {
                            setActiveRowIndex(index);
                            setReviewPanelOpen(true);
                            setCompleted(false);
                          }}
                          disabled={importing}
                        >
                          <span className="font-mono text-xs">
                            {t("Row")} {row.rowNumber}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {row.template.name || t("Untitled template")}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {row.template.subject || t("No subject")}
                            </span>
                          </span>
                          <Badge
                            variant={
                              result
                                ? templateImportResultTone(result)
                                : row.valid
                                  ? "success"
                                  : "destructive"
                            }
                          >
                            {t(resultLabel)}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {previewRows.length > visiblePreviewRows.length ? (
                <p className="text-xs text-muted-foreground">
                  {t("Showing first")} {visiblePreviewRows.length} {t("of")}{" "}
                  {previewRows.length} {t("parsed rows")}.
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter className={completed ? "gap-3" : undefined}>
          {completed ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={resetImportState}
                className="h-11"
              >
                <FileUp className="h-4 w-4" />
                {t("Import another CSV")}
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => onOpenChange(false)}
                className={TEMPLATE_IMPORT_CTA_CLASS}
              >
                <CheckCircle2 className="h-4 w-4" />
                {t("Done")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={importing}
              >
                {t("Cancel")}
              </Button>
              {!reviewPanelOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReviewRemainingOneByOne}
                  disabled={!canImportRemaining}
                >
                  <FileText className="h-4 w-4" />
                  {t("Evaluate one by one")}
                </Button>
              ) : null}
              {!reviewPanelOpen ? (
                <Button
                  type="button"
                  size="lg"
                  onClick={handleImportAll}
                  disabled={!canImportRemaining}
                  className={TEMPLATE_IMPORT_CTA_CLASS}
                >
                  <FileUp className="h-4 w-4" />
                  {importing
                    ? t("Importing...")
                    : t("Process next 5 rows")}
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartnershipCrmTemplateBrowser() {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const queryClient = useQueryClient();
  const {
    usage,
    usageError,
    locked,
    canUseFresh,
    request,
    retryUsageVerification,
    usageVerificationPending,
  } = usePlantillasDailyUsage();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [previewPanelOpen, setPreviewPanelOpen] = useState(false);
  const templateSplitPaneRef = useRef<HTMLDivElement | null>(null);
  const [templatePanelWidthPercent, setTemplatePanelWidthPercent] = useState(
    TEMPLATE_DETAIL_PANEL_DEFAULT_WIDTH_PERCENT,
  );
  const [templatePanelResizing, setTemplatePanelResizing] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<PartnershipCrmTemplateRecord | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [filters, setFilters] = useState<TemplateFilters>({
    query: "",
    audience: "organizations",
    status: "all",
    category: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<TemplateFilters>({
    query: "",
    audience: "organizations",
    status: "all",
    category: "",
  });
  const [templatesPage, setTemplatesPage] =
    useState<PartnershipCrmTemplatesPage | null>(null);
  const [summaryCacheAsOf, setSummaryCacheAsOf] = useState("");
  const [templateDetails, setTemplateDetails] = useState<
    Map<string, PartnershipCrmTemplateRecord>
  >(() => new Map());
  const templateDetailInFlightRef = useRef<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importRulesOpen, setImportRulesOpen] = useState(false);
  const cacheHydratedRef = useRef(false);

  useEffect(() => {
    if (cacheHydratedRef.current) {
      return;
    }
    cacheHydratedRef.current = true;
    const cached = readTemplateSummaryCache();
    if (!cached) {
      return;
    }
    setFilters(cached.filters);
    setAppliedFilters(cached.filters);
    setTemplatesPage(cached.page);
    setSummaryCacheAsOf(cached.savedAt);
  }, []);

  const templatesMutation = useMutation({
    mutationFn: ({
      filters: requestedFilters,
      cursor,
      signal,
    }: {
      filters: TemplateFilters;
      cursor?: string;
      signal?: AbortSignal;
    }) =>
      request<PartnershipCrmTemplatesPage>(
        buildTemplateListPath(requestedFilters, cursor),
        { signal },
      ),
    onSuccess: (response, variables) => {
      const received = response.templates;
      const loadedAt = new Date().toISOString();
      const existingCache = variables.cursor
        ? readTemplateSummaryCache()
        : null;
      const savedAt = variables.cursor
        ? summaryCacheAsOf || existingCache?.savedAt || loadedAt
        : loadedAt;
      setAppliedFilters(variables.filters);
      setSummaryCacheAsOf(savedAt);
      setSelectedTemplateIds(new Set());
      setTemplatesPage((current) => {
        const templates = variables.cursor
          ? Array.from(
              new Map(
                [...(current?.templates ?? []), ...received].map((template) => [
                  template.id,
                  template,
                ]),
              ).values(),
            )
          : received;
        const previousScanned = variables.cursor ? (current?.scanned ?? 0) : 0;
        const next: PartnershipCrmTemplatesPage = {
          ...response,
          templates,
          partial: Boolean(response.partial || (variables.cursor && current?.partial)),
          scanned: previousScanned + (response.scanned ?? received.length),
          asOf: variables.cursor
            ? current?.asOf ?? response.asOf ?? savedAt
            : response.asOf ?? savedAt,
        };
        storeTemplateSummaryCache({
          savedAt,
          filters: variables.filters,
          page: {
            ...next,
            templates: next.templates.map(toTemplateSummary),
          },
        });
        return next;
      });
    },
  });

  const templateDetailMutation = useMutation({
    mutationFn: (templateId: string) =>
      request<{ template: PartnershipCrmTemplateRecord }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(templateId)}`,
      ),
    onSuccess: ({ template }) => {
      if (!template) {
        return;
      }
      setTemplateDetails((current) => {
        const next = new Map(current);
        next.set(template.id, template);
        return next;
      });
    },
    onSettled: (_data, _error, templateId) => {
      templateDetailInFlightRef.current.delete(templateId);
    },
  });
  const templates = useMemo(
    () => favoriteFirstRecords(templatesPage?.templates ?? []),
    [templatesPage?.templates],
  );
  const selectedTemplate = selectedTemplateId
    ? (templateDetails.get(selectedTemplateId) ??
      templates.find((template) => template.id === selectedTemplateId) ??
      null)
    : null;
  const selectedTemplateHasFullDetail = Boolean(
    selectedTemplate &&
      (templateDetails.has(selectedTemplate.id) ||
        selectedTemplate.body.trim().length > 0),
  );
  const selectedTemplates = useMemo(
    () => templates.filter((template) => selectedTemplateIds.has(template.id)),
    [selectedTemplateIds, templates],
  );
  const selectedTemplateIdList = useMemo(
    () => Array.from(selectedTemplateIds),
    [selectedTemplateIds],
  );
  const selectedVisibleTemplateCount = selectedTemplates.length;
  const allVisibleTemplatesSelected =
    templates.length > 0 && selectedVisibleTemplateCount === templates.length;
  const someVisibleTemplatesSelected =
    selectedVisibleTemplateCount > 0 &&
    selectedVisibleTemplateCount < templates.length;
  const showPreviewPanel = Boolean(previewPanelOpen && selectedTemplate);
  const templateSplitPaneStyle = showPreviewPanel
    ? ({
        "--crm-template-list-panel-width": `${
          100 - templatePanelWidthPercent
        }fr`,
        "--crm-template-detail-panel-width": `${templatePanelWidthPercent}fr`,
      } as CSSProperties)
    : undefined;
  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        CRM_TEMPLATE_STATUS_OPTIONS.map((option) => [
          option.value,
          templates.filter((template) => template.status === option.value)
            .length,
        ]),
      ) as Record<PartnershipCrmTemplateStatus, number>,
    [templates],
  );

  function patchVisibleTemplates(
    updater: (
      templates: PartnershipCrmTemplateRecord[],
    ) => PartnershipCrmTemplateRecord[],
  ) {
    setTemplatesPage((current) => {
      if (!current) {
        return current;
      }
      const next = {
        ...current,
        templates: updater(current.templates).filter((template) =>
          templateMatchesAppliedFilters(template, appliedFilters),
        ),
      };
      const cached = readTemplateSummaryCache();
      if (cached) {
        storeTemplateSummaryCache({
          ...cached,
          page: {
            ...cached.page,
            templates: updater(cached.page.templates)
              .filter((template) =>
                templateMatchesAppliedFilters(template, cached.filters),
              )
              .map(toTemplateSummary),
          },
        });
      } else {
        clearTemplateSummaryCache();
      }
      return next;
    });
    updateCachedTemplateListPages(queryClient, updater);
  }

  function patchImportedTemplates(
    importedTemplates: PartnershipCrmTemplateRecord[],
  ) {
    const importedById = new Map(
      importedTemplates.map((template) => [template.id, template]),
    );
    const mergeImported = (templates: PartnershipCrmTemplateRecord[]) => [
      ...templates.filter((template) => !importedById.has(template.id)),
      ...importedTemplates,
    ];

    setTemplatesPage((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        templates: mergeImported(current.templates).filter((template) =>
          templateMatchesAppliedFilters(template, appliedFilters),
        ),
      };
    });

    const cached = readTemplateSummaryCache();
    if (cached) {
      storeTemplateSummaryCache({
        ...cached,
        page: {
          ...cached.page,
          templates: mergeImported(cached.page.templates)
            .filter((template) =>
              templateMatchesAppliedFilters(template, cached.filters),
            )
            .map(toTemplateSummary),
        },
      });
    }

    setTemplateDetails((current) => {
      const next = new Map(current);
      for (const template of importedTemplates) {
        next.set(template.id, template);
      }
      return next;
    });
    clearCrmTemplateComposerCache(queryClient);
  }

  function clearCachesAfterAmbiguousTemplateMutation() {
    clearTemplateSummaryCache();
    clearCrmTemplateComposerCache(queryClient);
    setSummaryCacheAsOf("");
    setTemplatesPage(null);
    setTemplateDetails(new Map());
    setSelectedTemplateId(null);
    setSelectedTemplateIds(new Set());
    setPreviewPanelOpen(false);
  }

  const quickUpdateMutation = useMutation({
    mutationFn: ({
      template,
      patch,
    }: {
      template: PartnershipCrmTemplateRecord;
      patch: TemplateQuickPatch;
    }) => {
      if (
        Object.keys(patch).length === 1 &&
        typeof patch.is_favorite === "boolean"
      ) {
        return request<{ template: PartnershipCrmTemplateRecord }>(
          `/admin/partnership-crm/templates/${encodeURIComponent(
            template.id,
          )}/favorite`,
          {
            method: "PATCH",
            body: JSON.stringify({ is_favorite: patch.is_favorite }),
          },
        );
      }

      const fullTemplate = templateDetails.get(template.id);
      if (!fullTemplate) {
        throw new PlantillasRequestNotSentError();
      }

      return request<{ template: PartnershipCrmTemplateRecord }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(template.id)}`,
        {
          method: "PUT",
          body: JSON.stringify(templateInputFromRecord(fullTemplate, patch)),
        },
      );
    },
    onSuccess: (result) => {
      patchVisibleTemplates((templates) =>
        templates.map((template) =>
          template.id === result.template.id
            ? result.template
            : template,
        ),
      );
      setTemplateDetails((current) => {
        const next = new Map(current);
        next.set(result.template.id, result.template);
        return next;
      });
      setSelectedTemplateId(result.template.id);
      setNotesDraft(result.template.notes);
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Template saved."),
      });
    },
    onError: (error) => {
      const notSent = isPlantillasRequestKnownNotExecuted(error);
      if (!notSent) {
        clearCachesAfterAmbiguousTemplateMutation();
      }
      setToast({
        id: Date.now(),
        tone: "error",
        message: notSent
          ? t("Template action was not sent.")
          : t("Unable to save template."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (template: PartnershipCrmTemplateRecord) =>
      request<{ deleted: boolean; templateId: string }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(template.id)}`,
        { method: "DELETE" },
      ),
    onSuccess: (_result, template) => {
      setDeleteTarget(null);
      setSelectedTemplateId((current) =>
        current === template.id ? null : current,
      );
      setPreviewPanelOpen(false);
      patchVisibleTemplates((templates) =>
        templates.filter((candidate) => candidate.id !== template.id),
      );
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Template deleted."),
      });
    },
    onError: (error) => {
      const notSent = isPlantillasRequestKnownNotExecuted(error);
      if (!notSent) {
        clearCachesAfterAmbiguousTemplateMutation();
      }
      setDeleteTarget(null);
      setToast({
        id: Date.now(),
        tone: "error",
        message: notSent
          ? t("Template action was not sent.")
          : t("Unable to delete template."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const deleteSelectedTemplatesMutation = useMutation({
    mutationFn: async (
      templateIds: string[],
    ): Promise<
      SequentialBulkResult<{ deleted: boolean; templateId: string }>
    > => {
      const completed: Array<{ deleted: boolean; templateId: string }> = [];
      for (const templateId of templateIds.slice(0, 10)) {
        try {
          completed.push(
            await request<{ deleted: boolean; templateId: string }>(
              `/admin/partnership-crm/templates/${encodeURIComponent(
                templateId,
              )}`,
              { method: "DELETE" },
            ),
          );
        } catch (error) {
          return {
            completed,
            failure: {
              itemId: templateId,
              error: errorMessage(error),
              notSent: isPlantillasRequestKnownNotExecuted(error),
            },
          };
        }
      }
      return { completed };
    },
    onSuccess: (outcome) => {
      if (outcome.failure && !outcome.failure.notSent) {
        clearCachesAfterAmbiguousTemplateMutation();
      }
      const deletedIds = new Set(
        outcome.completed.map((result) => result.templateId),
      );
      setDeleteSelectedOpen(false);
      setSelectedTemplateIds((current) =>
        new Set(
          Array.from(current).filter((templateId) => !deletedIds.has(templateId)),
        ),
      );
      setDeleteTarget((current) =>
        current && deletedIds.has(current.id) ? null : current,
      );

      if (selectedTemplateId && deletedIds.has(selectedTemplateId)) {
        setSelectedTemplateId(null);
        setPreviewPanelOpen(false);
      }

      if (deletedIds.size > 0) {
        patchVisibleTemplates((templates) =>
          templates.filter((template) => !deletedIds.has(template.id)),
        );
      }
      setToast(
        outcome.failure
          ? {
              id: Date.now(),
              tone: "error",
              message: t("Bulk delete stopped after a partial failure."),
              notice: outcome.failure.notSent
                ? t("The failing template was not sent.")
                : t("The failing template outcome is unknown."),
              details: `${outcome.completed.length} ${t(
                "templates were deleted before the failure.",
              )} ${outcome.failure.error}`,
            }
          : {
              id: Date.now(),
              tone: "success",
              message: `${outcome.completed.length} ${
                outcome.completed.length === 1
                  ? t("template deleted.")
                  : t("templates deleted.")
              }`,
            },
      );
    },
    onError: (error) => {
      const notSent = isPlantillasRequestKnownNotExecuted(error);
      if (!notSent) {
        clearCachesAfterAmbiguousTemplateMutation();
      }
      setToast({
        id: Date.now(),
        tone: "error",
        message: notSent
          ? t("Template action was not sent.")
          : t("Unable to delete selected templates."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const updateSelectedTemplatesFavoriteMutation = useMutation({
    mutationFn: async ({
      templates,
      isFavorite,
    }: {
      templates: PartnershipCrmTemplateRecord[];
      isFavorite: boolean;
    }): Promise<
      SequentialBulkResult<{ template: PartnershipCrmTemplateRecord }>
    > => {
      const completed: Array<{ template: PartnershipCrmTemplateRecord }> = [];
      for (const template of templates.slice(0, 10)) {
        try {
          completed.push(
            await request<{ template: PartnershipCrmTemplateRecord }>(
              `/admin/partnership-crm/templates/${encodeURIComponent(
                template.id,
              )}/favorite`,
              {
                method: "PATCH",
                body: JSON.stringify({ is_favorite: isFavorite }),
              },
            ),
          );
        } catch (error) {
          return {
            completed,
            failure: {
              itemId: template.id,
              error: errorMessage(error),
              notSent: isPlantillasRequestKnownNotExecuted(error),
            },
          };
        }
      }
      return { completed };
    },
    onSuccess: (outcome, { isFavorite }) => {
      if (outcome.failure && !outcome.failure.notSent) {
        clearCachesAfterAmbiguousTemplateMutation();
      }
      const updatedTemplates = new Map(
        outcome.completed.map((result) => [result.template.id, result.template]),
      );

      patchVisibleTemplates((templates) =>
        templates.map(
          (template) =>
            updatedTemplates.has(template.id)
              ? updatedTemplates.get(template.id)!
              : template,
        ),
      );
      setTemplateDetails((current) => {
        const next = new Map(current);
        for (const result of outcome.completed) {
          next.set(result.template.id, result.template);
        }
        return next;
      });
      setToast(
        outcome.failure
          ? {
              id: Date.now(),
              tone: "error",
              message: t("Bulk favorite update stopped after a partial failure."),
              notice: outcome.failure.notSent
                ? t("The failing template was not sent.")
                : t("The failing template outcome is unknown."),
              details: `${outcome.completed.length} ${t(
                "templates were updated before the failure.",
              )} ${outcome.failure.error}`,
            }
          : {
              id: Date.now(),
              tone: "success",
              message: isFavorite
                ? t("Selected templates marked as favorite.")
                : t("Selected templates marked as not favorite."),
            },
      );
    },
    onError: (error) => {
      const notSent = isPlantillasRequestKnownNotExecuted(error);
      if (!notSent) {
        clearCachesAfterAmbiguousTemplateMutation();
      }
      setToast({
        id: Date.now(),
        tone: "error",
        message: notSent
          ? t("Template action was not sent.")
          : t("Unable to update selected templates."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const selectedTemplateActionPending =
    deleteSelectedTemplatesMutation.isPending ||
    updateSelectedTemplatesFavoriteMutation.isPending;

  useEffect(() => {
    if (!selectedTemplateId) {
      return;
    }
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(null);
      setPreviewPanelOpen(false);
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    setNotesDraft(selectedTemplate?.notes ?? "");
  }, [selectedTemplate?.id, selectedTemplate?.notes]);

  useEffect(() => {
    if (selectedTemplateIds.size === 0) {
      return;
    }

    const visibleIds = new Set(templates.map((template) => template.id));
    setSelectedTemplateIds((current) => {
      const next = new Set(
        Array.from(current).filter((templateId) => visibleIds.has(templateId)),
      );

      return next.size === current.size ? current : next;
    });
  }, [selectedTemplateIds.size, templates]);

  useEffect(() => {
    if (!templatePanelResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: PointerEvent) {
      event.preventDefault();
      setTemplatePanelWidthFromClientX(event.clientX);
    }

    function stopResizing() {
      setTemplatePanelResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [templatePanelResizing]);

  function setTemplatePanelWidthFromClientX(clientX: number) {
    const bounds = templateSplitPaneRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) {
      return;
    }

    const nextWidth = ((bounds.right - clientX) / bounds.width) * 100;
    setTemplatePanelWidthPercent(
      clampTemplateDetailPanelWidthPercent(Math.round(nextWidth * 10) / 10),
    );
  }

  function handleTemplatePanelResizePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    setTemplatePanelWidthFromClientX(event.clientX);
    setTemplatePanelResizing(true);
  }

  function adjustTemplatePanelWidth(delta: number) {
    setTemplatePanelWidthPercent((current) =>
      clampTemplateDetailPanelWidthPercent(current + delta),
    );
  }

  function handleTemplatePanelResizeKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustTemplatePanelWidth(TEMPLATE_DETAIL_PANEL_KEYBOARD_STEP_PERCENT);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustTemplatePanelWidth(-TEMPLATE_DETAIL_PANEL_KEYBOARD_STEP_PERCENT);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setTemplatePanelWidthPercent(TEMPLATE_DETAIL_PANEL_MIN_WIDTH_PERCENT);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setTemplatePanelWidthPercent(TEMPLATE_DETAIL_PANEL_MAX_WIDTH_PERCENT);
    }
  }

  function resetCursorsForFilterChange(patch: Partial<TemplateFilters>) {
    setSelectedTemplateIds(new Set());
    setDeleteSelectedOpen(false);
    setFilters((current) => ({ ...current, ...patch }));
  }

  function handleAudienceChange(audience: PartnershipCrmTemplateAudience) {
    setSelectedTemplateId(null);
    setPreviewPanelOpen(false);
    setSelectedTemplateIds(new Set());
    setDeleteSelectedOpen(false);
    resetCursorsForFilterChange({ audience, category: "" });
  }

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId);
    setPreviewPanelOpen(true);
    if (
      canUseFresh &&
      !templateDetails.has(templateId) &&
      !templateDetailInFlightRef.current.has(templateId)
    ) {
      templateDetailInFlightRef.current.add(templateId);
      templateDetailMutation.mutate(templateId);
    }
  }

  function handleQuickUpdate(patch: TemplateQuickPatch) {
    if (!selectedTemplate) {
      return;
    }

    quickUpdateMutation.mutate({ template: selectedTemplate, patch });
  }

  function toggleTemplateSelection(templateId: string) {
    setSelectedTemplateIds((current) => {
      const next = new Set(current);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else if (next.size < 10) {
        next.add(templateId);
      }
      return next;
    });
  }

  function setVisibleTemplatesSelected(selected: boolean) {
    setSelectedTemplateIds((current) => {
      const next = new Set(current);
      for (const template of templates) {
        if (selected) {
          if (next.size < 10) {
            next.add(template.id);
          }
        } else {
          next.delete(template.id);
        }
      }
      return next;
    });
  }

  function clearSelectedTemplates() {
    setSelectedTemplateIds(new Set());
    setDeleteSelectedOpen(false);
  }

  function loadTemplates(cursor?: string) {
    if (!canUseFresh || templatesMutation.isPending) {
      return;
    }
    templatesMutation.mutate({
      filters: cursor ? appliedFilters : filters,
      cursor,
    });
  }

  const shortSearch =
    filters.query.trim().length > 0 && filters.query.trim().length < 3;

  return (
    <section className="glass-panel crm-control-surface flex flex-col gap-5 px-4 py-4 md:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold text-foreground">
            {t("Plantillas")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HeaderUnclutterButton />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadTemplates()}
            disabled={!canUseFresh || templatesMutation.isPending}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                templatesMutation.isPending && "animate-spin",
              )}
            />
            {t("Refresh")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            disabled={!canUseFresh}
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
          <Button type="button" size="sm" disabled={!canUseFresh} asChild>
            <Link
              href="/god-mode/plantillas/new"
              aria-disabled={!canUseFresh}
              onClick={(event) => {
                if (!canUseFresh) {
                  event.preventDefault();
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("Alta de plantilla")}
            </Link>
          </Button>
        </div>
      </div>

      <PlantillasDailyUsageBar
        usage={usage}
        usageError={usageError}
        hasCachedData={Boolean(templatesPage)}
        language={language}
        onRetryVerification={retryUsageVerification}
        verificationPending={usageVerificationPending}
      />

      {locked ? (
        <div className="rounded-xl border border-red-300/70 bg-red-50/80 px-3 py-2 text-sm text-red-900 dark:border-red-300/25 dark:bg-red-400/10 dark:text-red-100">
          {templatesPage
            ? t(
                "Plantillas is cached and read-only because its daily limit has been reached.",
              )
            : t(
                "Plantillas data and actions are unavailable because its daily limit has been reached.",
              )}
        </div>
      ) : null}

      <CrmTargetSegmentedControl
        value={filters.audience}
        onChange={handleAudienceChange}
        language={language}
      />

      <div className="grid gap-3 rounded-xl border border-border/80 bg-background/60 p-3 lg:grid-cols-[minmax(220px,1fr)_180px_220px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(event) =>
              resetCursorsForFilterChange({ query: event.target.value })
            }
            placeholder={t("Search templates...")}
            className="pl-8"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !shortSearch) {
                event.preventDefault();
                loadTemplates();
              }
            }}
          />
        </div>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            resetCursorsForFilterChange({
              status: value as TemplateFilters["status"],
            })
          }
        >
          <SelectTrigger className="w-full">
            <Filter className="h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="crm-control-dropdown">
            <SelectItem value="all">{t("All statuses")}</SelectItem>
            {CRM_TEMPLATE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CrmCategorySelect
          id="crm-template-category-filter"
          value={filters.category}
          onChange={(category) => resetCursorsForFilterChange({ category })}
          language={language}
          mode="filter"
          audience={filters.audience}
        />
        <Button
          type="button"
          onClick={() => loadTemplates()}
          disabled={!canUseFresh || templatesMutation.isPending || shortSearch}
        >
          <Search className="h-4 w-4" />
          {templatesPage ? t("Apply") : t("Load templates")}
        </Button>
      </div>

      {shortSearch ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          {t("Enter at least three characters, then apply the search.")}
        </p>
      ) : summaryCacheAsOf ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          {t("Cached summaries as of")} {formatDateTime(summaryCacheAsOf, language)}. {t("Refresh only when needed.")}
        </p>
      ) : null}

      {templatesPage?.partial ? (
        <p
          role="status"
          data-testid="plantillas-bounded-result-note"
          className="-mt-3 text-xs text-amber-700 dark:text-amber-300"
        >
          {t("Approximate bounded sample")}: {templatesPage.scanned ?? 0}{" "}
          {t("records checked")}. {t("Use See 10 more to continue.")}
          {templatesPage.asOf
            ? ` ${t("As of")} ${formatDateTime(templatesPage.asOf, language)}.`
            : ""}
        </p>
      ) : null}

      <div
        ref={templateSplitPaneRef}
        data-testid="crm-template-split-pane"
        className={cn(
          "grid gap-4",
          showPreviewPanel &&
            "xl:h-[calc(100vh_-_var(--app-header-height)_-_2rem)] xl:min-h-0 xl:grid-cols-[minmax(0,var(--crm-template-list-panel-width))_1rem_minmax(0,var(--crm-template-detail-panel-width))] xl:items-stretch xl:gap-0 xl:overflow-hidden",
        )}
        style={templateSplitPaneStyle}
      >
        <div
          className={cn(
            "grid content-start gap-4",
            showPreviewPanel &&
              "xl:flex xl:min-h-0 xl:flex-col xl:overflow-visible xl:pr-2",
          )}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {CRM_TEMPLATE_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  resetCursorsForFilterChange({ status: option.value })
                }
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40",
                  filters.status === option.value
                    ? "border-foreground/35 bg-muted"
                    : "border-border/80 bg-background/60",
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {t(option.label)}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {statusCounts[option.value]}
                </p>
              </button>
            ))}
          </div>

          {templatesMutation.error ? (
            <ErrorBanner>{t("Failed to load templates.")}</ErrorBanner>
          ) : null}

          <div
            className={cn(
              "overflow-hidden rounded-xl border border-border/80 bg-background/64",
              showPreviewPanel &&
                "xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-auto",
            )}
          >
            {templatesMutation.isPending && templates.length === 0 ? (
              <div className="grid gap-2 p-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : !templatesPage ? (
              <EmptyState>
                <span className="block">
                  {t("Templates load only when you ask for them.")}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => loadTemplates()}
                  disabled={!canUseFresh || shortSearch}
                >
                  {t("Load 10 templates")}
                </Button>
              </EmptyState>
            ) : templates.length === 0 ? (
              <EmptyState>
                <span className="block">
                  {t(
                    templatesPage.partial
                      ? "No matches in this bounded sample."
                      : "No templates found.",
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  asChild
                  className="mt-3"
                  disabled={!canUseFresh}
                >
                  <Link
                    href="/god-mode/plantillas/new"
                    aria-disabled={!canUseFresh}
                    onClick={(event) => {
                      if (!canUseFresh) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("Alta de plantilla")}
                  </Link>
                </Button>
              </EmptyState>
            ) : (
              <>
                {selectedTemplateIds.size > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/35 px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      {selectedTemplateIds.size}{" "}
                      {t(
                        selectedTemplateIds.size === 1
                          ? "template selected"
                          : "templates selected",
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearSelectedTemplates}
                        disabled={selectedTemplateActionPending}
                      >
                        <X className="h-3.5 w-3.5" />
                        {t("Clear selected")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedTemplatesFavoriteMutation.mutate({
                            templates: selectedTemplates,
                            isFavorite: true,
                          })
                        }
                        disabled={
                          selectedTemplateActionPending ||
                          selectedTemplates.length === 0 ||
                          !canUseFresh
                        }
                      >
                        <Star className="h-3.5 w-3.5" />
                        {updateSelectedTemplatesFavoriteMutation.isPending
                          ? t("Updating...")
                          : t("Mark selected as favorite")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedTemplatesFavoriteMutation.mutate({
                            templates: selectedTemplates,
                            isFavorite: false,
                          })
                        }
                        disabled={
                          selectedTemplateActionPending ||
                          selectedTemplates.length === 0 ||
                          !canUseFresh
                        }
                      >
                        <Star className="h-3.5 w-3.5" />
                        {updateSelectedTemplatesFavoriteMutation.isPending
                          ? t("Updating...")
                          : t("Mark selected as not favorite")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteSelectedOpen(true)}
                        disabled={selectedTemplateActionPending || !canUseFresh}
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
                          aria-label={t("Select all visible templates")}
                          checked={
                            allVisibleTemplatesSelected
                              ? true
                              : someVisibleTemplatesSelected
                                ? "indeterminate"
                                : false
                          }
                          disabled={selectedTemplateActionPending || locked}
                          onCheckedChange={(checked) =>
                            setVisibleTemplatesSelected(checked === true)
                          }
                        />
                      </TableHead>
                      <TableHead>{t("Template")}</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">{t("Favorite")}</span>
                      </TableHead>
                      <TableHead>{t("Applies to")}</TableHead>
                      <TableHead>{t("Status")}</TableHead>
                      <TableHead>{t("Category")}</TableHead>
                      <TableHead>{t("Updated")}</TableHead>
                      <TableHead>{t("Notes")}</TableHead>
                      <TableHead className="w-28">
                        <span className="sr-only">{t("Actions")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => {
                      const isSelected =
                        showPreviewPanel &&
                        selectedTemplate?.id === template.id;
                      const isBatchSelected = selectedTemplateIds.has(
                        template.id,
                      );

                      return (
                        <TableRow
                          key={template.id}
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
                          onClick={() => handleTemplateSelect(template.id)}
                        >
                          <TableCell>
                            <Checkbox
                              aria-label={`${t("Select template")}: ${
                                template.name
                              }`}
                              checked={isBatchSelected}
                              disabled={selectedTemplateActionPending || locked}
                              onClick={(event) => event.stopPropagation()}
                              onCheckedChange={() =>
                                toggleTemplateSelection(template.id)
                              }
                            />
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <button
                              type="button"
                              className="block max-w-[320px] text-left"
                            >
                              <span className="block truncate font-medium text-foreground">
                                {template.name}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {template.subject || t("No subject")}
                              </span>
                            </button>
                          </TableCell>
                          <TableCell
                            className={cn(
                              template.is_favorite &&
                                "bg-cyan-50/75 dark:bg-cyan-400/10",
                            )}
                          >
                            <FavoriteCell
                              isFavorite={template.is_favorite}
                              language={language}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {template.audience === "professionals"
                                ? t("Professionals")
                                : t("Organizations")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <TemplateStatusBadge
                              status={template.status}
                              language={language}
                            />
                          </TableCell>
                          <TableCell className="whitespace-normal text-sm text-muted-foreground">
                            {formatCrmCategory(
                              template.category,
                              language,
                              template.audience ?? "organizations",
                            ) || t("No category")}
                          </TableCell>
                          <TableCell className="whitespace-normal text-sm text-muted-foreground">
                            {formatDateTime(template.updatedAt, language)}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <p className="line-clamp-2 max-w-[280px] text-xs text-muted-foreground">
                              {templateDetails.get(template.id)?.notes ||
                                t("Tap to see more")}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled={!canUseFresh}
                              asChild
                            >
                              <Link
                                href={`/god-mode/plantillas/${encodeURIComponent(
                                  template.id,
                                )}`}
                                aria-disabled={!canUseFresh}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (!canUseFresh) {
                                    event.preventDefault();
                                  }
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {t("Edit")}
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {templates.length} {t("templates loaded")}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                templatesPage?.nextCursor &&
                loadTemplates(templatesPage.nextCursor)
              }
              disabled={
                !templatesPage?.nextCursor ||
                templatesMutation.isPending ||
                !canUseFresh
              }
            >
              {t("See 10 more")}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {showPreviewPanel ? (
          <div
            role="separator"
            tabIndex={0}
            aria-label={t("Resize template preview panel")}
            aria-orientation="vertical"
            aria-valuemin={Math.round(TEMPLATE_DETAIL_PANEL_MIN_WIDTH_PERCENT)}
            aria-valuemax={Math.round(TEMPLATE_DETAIL_PANEL_MAX_WIDTH_PERCENT)}
            aria-valuenow={Math.round(templatePanelWidthPercent)}
            className={cn(
              "group hidden cursor-col-resize touch-none select-none items-center justify-center self-stretch rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/45 xl:flex",
              templatePanelResizing && "bg-primary/8",
            )}
            onPointerDown={handleTemplatePanelResizePointerDown}
            onKeyDown={handleTemplatePanelResizeKeyDown}
          >
            <div
              className={cn(
                "flex h-16 w-4 items-center justify-center rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-sm transition-colors group-hover:border-primary/45 group-hover:text-foreground group-focus-visible:border-primary/60",
                templatePanelResizing && "border-primary/60 text-foreground",
              )}
            >
              <GripVertical className="h-4 w-4" />
            </div>
          </div>
        ) : null}

        {showPreviewPanel && selectedTemplate && selectedTemplateHasFullDetail ? (
          <TemplatePreviewSidePanel
            template={selectedTemplate}
            notesDraft={notesDraft}
            onNotesDraftChange={setNotesDraft}
            onQuickUpdate={handleQuickUpdate}
            onDelete={() => setDeleteTarget(selectedTemplate)}
            onClose={() => setPreviewPanelOpen(false)}
            pending={
              quickUpdateMutation.isPending ||
              !canUseFresh ||
              !templateDetails.has(selectedTemplate.id)
            }
            favoritePending={quickUpdateMutation.isPending || !canUseFresh}
            deletePending={deleteMutation.isPending || !canUseFresh}
            readOnly={!canUseFresh}
            language={language}
          />
        ) : showPreviewPanel && selectedTemplate ? (
          <TemplateSummaryOnlySidePanel
            template={selectedTemplate}
            quotaLocked={locked}
            freshAccessAvailable={canUseFresh}
            verificationPending={usageVerificationPending}
            loading={templateDetailInFlightRef.current.has(
              selectedTemplate.id,
            )}
            onLoad={() => handleTemplateSelect(selectedTemplate.id)}
            onRetryVerification={() => void retryUsageVerification()}
            onClose={() => setPreviewPanelOpen(false)}
            language={language}
          />
        ) : null}
      </div>

      <TemplateImportDialog
        open={importOpen}
        initialAudience={filters.audience}
        onOpenChange={setImportOpen}
        onImported={(importedTemplates) => {
          patchImportedTemplates(importedTemplates);
          setToast({
            id: Date.now(),
            tone: "success",
            message: t("Import saved. Refresh the list only when needed."),
          });
        }}
        onAmbiguousMutation={clearCachesAfterAmbiguousTemplateMutation}
        language={language}
        request={request}
        locked={!canUseFresh}
      />
      <CrmImportRulesDialog
        open={importRulesOpen}
        onOpenChange={setImportRulesOpen}
        language={language}
        kind="templates"
        audience={filters.audience}
      />
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="crm-control-surface">
          <DialogHeader>
            <DialogTitle>{t("Delete template")}</DialogTitle>
            <DialogDescription>
              {t("This removes the template from the CRM send flow.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget)
              }
              disabled={!deleteTarget || deleteMutation.isPending || !canUseFresh}
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? t("Deleting...") : t("Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteSelectedOpen}
        onOpenChange={(open) => {
          if (!open && !deleteSelectedTemplatesMutation.isPending) {
            setDeleteSelectedOpen(false);
          }
        }}
      >
        <DialogContent className="crm-control-surface">
          <DialogHeader>
            <DialogTitle>{t("Delete selected templates")}</DialogTitle>
            <DialogDescription>
              {t(
                "This removes every selected template from the CRM send flow.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-sm font-semibold text-foreground">
              {selectedTemplateIds.size}{" "}
              {t(
                selectedTemplateIds.size === 1
                  ? "template selected"
                  : "templates selected",
              )}
            </p>
            <div className="mt-3 grid gap-2">
              {selectedTemplates.map((template) => (
                <div
                  key={template.id}
                  className="rounded-lg border border-border/70 bg-background px-3 py-2"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {template.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {template.subject || t("No subject")}
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
              disabled={deleteSelectedTemplatesMutation.isPending}
            >
              <X className="h-4 w-4" />
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                deleteSelectedTemplatesMutation.mutate(selectedTemplateIdList)
              }
              disabled={
                deleteSelectedTemplatesMutation.isPending ||
                selectedTemplateIdList.length === 0 ||
                !canUseFresh
              }
            >
              <Trash2 className="h-4 w-4" />
              {deleteSelectedTemplatesMutation.isPending
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

export function PartnershipCrmTemplateWorkbench({
  mode,
  templateId,
}: {
  mode: "create" | "edit";
  templateId?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    usage,
    usageError,
    canUseFresh,
    request,
    retryUsageVerification,
    usageVerificationPending,
  } = usePlantillasDailyUsage();
  const [form, setForm] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const isEditing = mode === "edit";

  function clearCachesAfterAmbiguousTemplateMutation() {
    clearTemplateSummaryCache();
    clearCrmTemplateComposerCache(queryClient);
  }

  const templateQuery = useMutation({
    mutationFn: () =>
      request<{ template: PartnershipCrmTemplateRecord }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(
          templateId ?? "",
        )}`,
      ),
    onSuccess: ({ template }) => setForm(toFormState(template)),
  });

  useEffect(() => {
    if (mode === "create") {
      setForm(EMPTY_TEMPLATE_FORM);
      return;
    }

  }, [mode]);

  function update(patch: Partial<TemplateFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateAudience(audience: PartnershipCrmTemplateAudience) {
    setForm((current) => ({
      ...current,
      audience,
      category: defaultTemplateCategory(audience),
    }));
  }

  function insertVariable(token: string) {
    setForm((current) => ({
      ...current,
      body: `${current.body}${current.body.endsWith(" ") || !current.body ? "" : " "}${token}`,
    }));
  }

  const canSave = Boolean(
    form.name.trim() && form.subject.trim() && form.body.trim(),
  );
  const templateVariables =
    form.audience === "professionals"
      ? PROFESSIONAL_TEMPLATE_VARIABLES
      : ORGANIZATION_TEMPLATE_VARIABLES;

  const saveMutation = useMutation({
    mutationFn: (payload: PartnershipCrmTemplateInput) => {
      const path =
        isEditing && templateId
          ? `/admin/partnership-crm/templates/${encodeURIComponent(templateId)}`
          : "/admin/partnership-crm/templates";

      return request<{ template: PartnershipCrmTemplateRecord }>(path, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (result) => {
      clearTemplateSummaryCache();
      clearCrmTemplateComposerCache(queryClient);
      setForm(toFormState(result.template));
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Template saved."),
      });
      if (!isEditing) {
        router.push(`/god-mode/plantillas/${result.template.id}`);
      }
    },
    onError: (error) => {
      const notSent = isPlantillasRequestKnownNotExecuted(error);
      if (!notSent) {
        clearCachesAfterAmbiguousTemplateMutation();
      }
      setToast({
        id: Date.now(),
        tone: "error",
        message: notSent
          ? t("Template action was not sent.")
          : t("Unable to save template."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      request<{ deleted: boolean; templateId: string }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(
          templateId ?? "",
        )}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      clearTemplateSummaryCache();
      clearCrmTemplateComposerCache(queryClient);
      setDeleteOpen(false);
      router.push("/god-mode/plantillas");
    },
    onError: (error) => {
      const notSent = isPlantillasRequestKnownNotExecuted(error);
      if (!notSent) {
        clearCachesAfterAmbiguousTemplateMutation();
      }
      setDeleteOpen(false);
      setToast({
        id: Date.now(),
        tone: "error",
        message: notSent
          ? t("Template action was not sent.")
          : t("Unable to delete template."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    saveMutation.mutate(templatePayload(form));
  }

  return (
    <section className="glass-panel crm-control-surface flex flex-col gap-5 px-4 py-4 md:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/god-mode/plantillas">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("Volver a plantillas")}
            </Link>
          </Button>
          <h2 className="mt-2 font-heading text-xl font-semibold text-foreground">
            {isEditing ? t("Plantilla") : t("Alta de plantilla")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HeaderUnclutterButton />
          <Button
            type="button"
            size="sm"
            className="bg-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)] hover:bg-blue-700 focus-visible:ring-blue-500/35 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400"
            onClick={() => setPreviewOpen(true)}
            disabled={isEditing && !templateQuery.data}
          >
            <Eye className="h-3.5 w-3.5" />
            {t("View preview")}
          </Button>
          {isEditing ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={
                deleteMutation.isPending ||
                !canUseFresh ||
                !templateQuery.data
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("Delete")}
            </Button>
          ) : null}
          <Button
            type="submit"
            form="crm-template-form"
            size="sm"
            disabled={
              !canSave ||
              saveMutation.isPending ||
              !canUseFresh ||
              (isEditing && !templateQuery.data)
            }
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {saveMutation.isPending ? t("Saving...") : t("Save changes")}
          </Button>
        </div>
      </div>

      <PlantillasDailyUsageBar
        usage={usage}
        usageError={usageError}
        hasCachedData={false}
        language={language}
        onRetryVerification={retryUsageVerification}
        verificationPending={usageVerificationPending}
      />

      {templateQuery.error ? (
        <ErrorBanner>{t("Failed to load template.")}</ErrorBanner>
      ) : null}

      {templateQuery.isPending && isEditing && !templateQuery.data ? (
        <div className="grid gap-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : isEditing && !templateQuery.data ? (
        <EmptyState>
          <span className="block">
            {t("Template details load only when you ask for them.")}
          </span>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => templateQuery.mutate()}
            disabled={!canUseFresh || !templateId}
          >
            {t("Load template")}
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          <form
            id="crm-template-form"
            onSubmit={handleSubmit}
            className="grid gap-4"
          >
            <div className="grid gap-3 rounded-xl border border-border/80 bg-background/70 p-3">
              <div className="space-y-1.5">
                <Label>{t("Applies to")}</Label>
                <CrmTargetSegmentedControl
                  value={form.audience}
                  onChange={updateAudience}
                  language={language}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_120px]">
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-name">
                    {t("Template name")}
                  </Label>
                  <Input
                    id="crm-template-name"
                    value={form.name}
                    onChange={(event) => update({ name: event.target.value })}
                    placeholder={t("Template name")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Status")}</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      update({
                        status: value as PartnershipCrmTemplateStatus,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="crm-control-dropdown">
                      {CRM_TEMPLATE_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-is-favorite">
                    {t("Favorite")}
                  </Label>
                  <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
                    <Checkbox
                      id="crm-template-is-favorite"
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
                          ? "fill-cyan-400 text-cyan-500"
                          : "text-muted-foreground/50",
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.58fr)_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-category">{t("Category")}</Label>
                  <CrmCategorySelect
                    id="crm-template-category"
                    value={form.category}
                    onChange={(category) => update({ category })}
                    language={language}
                    mode="form"
                    audience={form.audience}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-subject">{t("Subject")}</Label>
                  <Input
                    id="crm-template-subject"
                    value={form.subject}
                    onChange={(event) =>
                      update({ subject: event.target.value })
                    }
                    placeholder={
                      form.audience === "professionals"
                        ? "Pocket Genes + {{professional_name}}"
                        : "Pocket Genes + {{organization_name}}"
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="crm-template-body">{t("Message")}</Label>
                <Textarea
                  id="crm-template-body"
                  value={form.body}
                  onChange={(event) => update({ body: event.target.value })}
                  className="min-h-80 font-mono text-sm leading-6"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="crm-template-notes">{t("Notes")}</Label>
                <Textarea
                  id="crm-template-notes"
                  value={form.notes}
                  onChange={(event) => update({ notes: event.target.value })}
                  className="min-h-24"
                />
              </div>
            </div>

            <div className="grid gap-3 rounded-xl border border-border/80 bg-background/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-heading text-sm font-semibold">
                  {t("Template variables")}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {templateVariables.map((variable) => (
                  <Button
                    key={variable.token}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => insertVariable(variable.token)}
                    title={t(variable.label)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="font-mono text-xs">{variable.token}</span>
                  </Button>
                ))}
              </div>
            </div>
          </form>
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="crm-control-surface sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Preview")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("Rendered template preview.")}
            </DialogDescription>
          </DialogHeader>
          <TemplatePreview form={form} language={language} />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="crm-control-surface">
          <DialogHeader>
            <DialogTitle>{t("Delete template")}</DialogTitle>
            <DialogDescription>
              {t("This removes the template from the CRM send flow.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={
                deleteMutation.isPending || !templateId || !canUseFresh
              }
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? t("Deleting...") : t("Delete")}
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
