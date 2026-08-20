"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bold,
  ChevronDown,
  Check,
  CheckCircle2,
  Heading2,
  ImageIcon,
  Italic,
  Languages,
  LinkIcon,
  List,
  Loader2,
  MapPin,
  Newspaper,
  Quote,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Type,
  UploadCloud,
  X,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { useAppLanguage } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import {
  DISCOVER_FEED_TYPE_OPTIONS,
  arrayFromPayload,
  discoverTypeLabel,
  getDiscoverPayload,
  stringFromPayload,
  type DiscoverFeedItemRecord,
  type DiscoverFeedStatus,
  type DiscoverFeedType,
  type DiscoverIndividualRecord,
  type DiscoverIndividualsPage,
  type DiscoverOrganizationRecord,
  type DiscoverOrganizationsPage,
} from "@/lib/discover";
import {
  formatDiscoverRegionCodes,
  getDiscoverRegionCountryGroups,
  parseDiscoverRegionCodes,
} from "@/lib/discover-organization-fields";

type BodyMode = "plain" | "rich";

type FeedEntryFormState = {
  publisherOrganizationId: string;
  publisherIndividualId: string;
  type: DiscoverFeedType;
  language: "en" | "es";
  title: string;
  subtitle: string;
  body: string;
  html_body: string;
  image_url: string;
  source_url: string;
  news: {
    category: string;
    region: string;
  };
  research_update: {
    research_topic: string;
    genesText: string;
    conditionsText: string;
    journal: string;
  };
  upcoming_event: {
    date: string;
    location: string;
    max_attendance: string;
    virtual_meeting_link: string;
  };
  opportunity: {
    opportunity_type: string;
    requirements: string;
    eligibility: string;
    location: string;
  };
};

type PublishDialogState = {
  status: "publishing" | "success" | "error";
  feedItemId?: string;
  message?: string;
};

const DISCOVER_OPPORTUNITY_TYPE_OPTIONS = [
  { value: "fellowship", label: "Fellowship" },
  { value: "grant", label: "Grant" },
  { value: "scholarship", label: "Scholarship" },
  { value: "clinical_study", label: "Clinical study" },
  { value: "research_program", label: "Research program" },
  { value: "training", label: "Training" },
  { value: "patient_program", label: "Patient program" },
  { value: "resource", label: "Resource" },
  { value: "job", label: "Job" },
  { value: "volunteer", label: "Volunteer" },
  { value: "dataset", label: "Dataset" },
  { value: "challenge", label: "Challenge" },
  { value: "other", label: "Other" },
] as const;

const DISCOVER_OPPORTUNITY_TYPE_VALUES = new Set<string>(
  DISCOVER_OPPORTUNITY_TYPE_OPTIONS.map((option) => option.value),
);

const DISCOVER_LOCATION_SUGGESTIONS = [
  "Online",
  "Remote",
  "Hybrid",
  "Global",
  "United States",
  "Argentina",
  "Canada",
  "United Kingdom",
  "European Union",
  "Latin America",
  "Buenos Aires, Argentina",
  "New York, United States",
  "Boston, United States",
  "San Francisco, United States",
  "London, United Kingdom",
  "Madrid, Spain",
  "Barcelona, Spain",
  "Mexico City, Mexico",
  "Sao Paulo, Brazil",
  "Santiago, Chile",
] as const;

function locationSuggestionsFor(value: string) {
  const query = value.trim().toLowerCase();

  if (query.length < 3) {
    return [];
  }

  return DISCOVER_LOCATION_SUGGESTIONS.map((location) => ({
    location,
    index: location.toLowerCase().indexOf(query),
  }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index || a.location.localeCompare(b.location))
    .slice(0, 6)
    .map((entry) => entry.location);
}

function isValidHttpsUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function toDateTimeInput(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function lines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function payloadText(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => (typeof entry === "string" ? entry : "")).filter(Boolean).join("\n")
    : stringFromPayload(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function plainTextToHtml(value: string) {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length
    ? paragraphs
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("")
    : "<p><br></p>";
}

function htmlToPlainText(value: string) {
  if (typeof document === "undefined") {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const element = document.createElement("div");
  element.innerHTML = value;
  return element.textContent?.replace(/\s+\n/g, "\n").trim() ?? "";
}

function toFormState(item?: DiscoverFeedItemRecord): FeedEntryFormState {
  const news = item?.news ?? {};
  const research = item?.research_update ?? {};
  const event = item?.upcoming_event ?? {};
  const opportunity = item?.opportunity ?? {};
  const opportunityType =
    stringFromPayload(opportunity.opportunity_type) ||
    stringFromPayload(opportunity.opportunityType);

  return {
    publisherOrganizationId: item?.publisherOrganizationId ?? "",
    publisherIndividualId: item?.publisherIndividualId ?? "",
    type: item?.type ?? "news",
    language: item?.language ?? "en",
    title: item?.title ?? "",
    subtitle: item?.subtitle ?? "",
    body: item?.body ?? "",
    html_body: item?.html_body ?? "",
    image_url: item?.image_url ?? "",
    source_url: item?.source_url ?? "",
    news: {
      category: stringFromPayload(news.category),
      region: stringFromPayload(news.region),
    },
    research_update: {
      research_topic:
        stringFromPayload(research.research_topic) || stringFromPayload(research.topic),
      genesText: arrayFromPayload(research.genes).join("\n"),
      conditionsText: arrayFromPayload(research.conditions).join("\n"),
      journal:
        stringFromPayload(research.journal) || stringFromPayload(research.journalName),
    },
    upcoming_event: {
      date: toDateTimeInput(
        stringFromPayload(event.date) || stringFromPayload(event.startsAt),
      ),
      location:
        stringFromPayload(event.location) || stringFromPayload(event.locationName),
      max_attendance:
        typeof event.max_attendance === "number"
          ? String(event.max_attendance)
          : stringFromPayload(event.max_attendance),
      virtual_meeting_link:
        stringFromPayload(event.virtual_meeting_link) ||
        stringFromPayload(event.virtualMeetingLink) ||
        stringFromPayload(event.meeting_url) ||
        stringFromPayload(event.meetingUrl),
    },
    opportunity: {
      opportunity_type: DISCOVER_OPPORTUNITY_TYPE_VALUES.has(opportunityType)
        ? opportunityType
        : opportunityType
          ? "other"
          : "",
      requirements: payloadText(opportunity.requirements),
      eligibility: stringFromPayload(opportunity.eligibility),
      location:
        stringFromPayload(opportunity.location) ||
        stringFromPayload(opportunity.locationName),
    },
  };
}

function payloadForType(state: FeedEntryFormState) {
  if (state.type === "news") {
    return {
      category: state.news.category,
      region: state.news.region,
    };
  }

  if (state.type === "research_update") {
    return {
      research_topic: state.research_update.research_topic,
      genes: lines(state.research_update.genesText),
      conditions: lines(state.research_update.conditionsText),
      journal: state.research_update.journal,
    };
  }

  if (state.type === "upcoming_event") {
    return {
      date: fromDateTimeInput(state.upcoming_event.date),
      location: state.upcoming_event.location,
      max_attendance: state.upcoming_event.max_attendance
        ? Number(state.upcoming_event.max_attendance)
        : null,
      virtual_meeting_link: state.upcoming_event.virtual_meeting_link || null,
    };
  }

  return {
    opportunity_type: state.opportunity.opportunity_type,
    requirements: state.opportunity.requirements,
    eligibility: state.opportunity.eligibility,
    location: state.opportunity.location,
  };
}

function payloadFromState(
  state: FeedEntryFormState,
  status: DiscoverFeedStatus,
  publishedAt: string | null,
) {
  return {
    publisherOrganizationId: state.publisherOrganizationId || undefined,
    publisherIndividualId: state.publisherIndividualId || undefined,
    type: state.type,
    status,
    publishedAt,
    language: state.language,
    title: state.title,
    subtitle: state.subtitle,
    body: state.body,
    html_body: state.html_body || null,
    image_url: state.image_url || null,
    source_url: state.source_url || null,
    [state.type]: payloadForType(state),
  };
}

function FieldShell({
  label,
  htmlFor,
  error,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LocationSuggestInput({
  id,
  value,
  onChange,
  t,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  t: (text: string) => string;
}) {
  const [focused, setFocused] = useState(false);
  const suggestions = locationSuggestionsFor(value);
  const normalizedValue = value.trim().toLowerCase();
  const completion =
    suggestions.find(
      (suggestion) =>
        suggestion.toLowerCase().startsWith(normalizedValue) &&
        suggestion.toLowerCase() !== normalizedValue,
    ) ?? suggestions.find((suggestion) => suggestion.toLowerCase() !== normalizedValue);
  const shouldShowSuggestions =
    focused && normalizedValue.length >= 3 && suggestions.length > 0;

  return (
    <div className="relative">
      <div className="relative">
        <MapPin
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          value={value}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          autoComplete="off"
          className="h-10 pl-9"
          aria-autocomplete="list"
          aria-expanded={shouldShowSuggestions}
          aria-controls={`${id}-suggestions`}
        />
      </div>
      {focused && normalizedValue.length >= 3 && completion ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange(completion);
            setFocused(false);
          }}
          className="mt-2 inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span className="font-medium text-foreground">{t("Complete")}</span>
          <span className="truncate">{completion}</span>
        </button>
      ) : null}
      {shouldShowSuggestions ? (
        <div
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 overflow-hidden rounded-md border border-border bg-background shadow-lg"
        >
          {suggestions.map((suggestion) => {
            const selected = suggestion.toLowerCase() === normalizedValue;

            return (
              <button
                key={suggestion}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(suggestion);
                  setFocused(false);
                }}
                className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                <MapPin
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{suggestion}</span>
                {selected ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CountryRegionPicker({
  id,
  value,
  onChange,
  language,
  t,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  language: "en" | "es";
  t: (text: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const countryGroups = useMemo(
    () => getDiscoverRegionCountryGroups(language),
    [language],
  );
  const selectedCodes = useMemo(() => parseDiscoverRegionCodes(value), [value]);
  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = countryGroups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) =>
          !normalizedQuery ||
          option.regionCode.toLowerCase().includes(normalizedQuery) ||
          option.label.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.options.length > 0);
  const displayValue = formatDiscoverRegionCodes(selectedCodes) || value.trim();

  function toggleCountry(regionCode: string) {
    const nextCodes = selectedSet.has(regionCode)
      ? selectedCodes.filter((code) => code !== regionCode)
      : [...selectedCodes, regionCode];
    onChange(formatDiscoverRegionCodes(nextCodes));
  }

  return (
    <div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <MapPin
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={id}
            value={displayValue}
            readOnly
            placeholder={t("Select countries")}
            className="h-10 pl-9 font-medium uppercase tracking-[0.08em]"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls={`${id}-country-picker`}
          className="h-10 justify-between sm:w-44"
        >
          {t("Choose countries")}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          id={`${id}-country-picker`}
          className="overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="font-heading text-xl font-semibold">
              {t("Select countries")}
            </DialogTitle>
            <DialogDescription>
              {selectedCodes.length > 0
                ? `${selectedCodes.length} ${t("countries selected")}: ${displayValue}`
                : t("No countries selected")}
            </DialogDescription>
          </DialogHeader>

          <div className="px-5">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search countries")}
                aria-label={t("Search countries")}
                className="h-10 pl-9"
              />
            </div>

            <div className="mt-4 max-h-[52vh] overflow-y-auto pr-1">
              {visibleGroups.length === 0 ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  {t("No countries match")}
                </div>
              ) : (
                visibleGroups.map((group) => (
                  <div key={group.key} className="mb-4 last:mb-0">
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {t(group.label)}
                    </p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {group.options.map((option) => {
                        const checkboxId = `${id}-${option.regionCode}`;

                        return (
                          <label
                            key={option.regionCode}
                            htmlFor={checkboxId}
                            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted"
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={selectedSet.has(option.regionCode)}
                              onCheckedChange={() => toggleCountry(option.regionCode)}
                              aria-label={option.label}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {option.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="px-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange("")}
              disabled={!displayValue}
            >
              <X className="h-3.5 w-3.5" />
              {t("Clear all")}
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              {t("Done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {eyebrow}
        </p>
        <h3 className="mt-1 font-heading text-lg font-semibold text-foreground">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

export function DiscoverFeedEntryWorkbench({
  feedItem,
  mode = "edit",
  initialOrganizations,
  initialOrganizationsNextCursor,
  initialIndividuals = [],
  initialIndividualsNextCursor = null,
  scopedOrganizationId,
  scopedIndividualId,
}: {
  feedItem?: DiscoverFeedItemRecord;
  mode?: "create" | "edit";
  initialOrganizations: DiscoverOrganizationRecord[];
  initialOrganizationsNextCursor: string | null;
  initialIndividuals?: DiscoverIndividualRecord[];
  initialIndividualsNextCursor?: string | null;
  scopedOrganizationId?: string;
  scopedIndividualId?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const richEditorRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState(() => {
    const initialState = toFormState(feedItem);
    if (mode === "create" && scopedOrganizationId) {
      return {
        ...initialState,
        publisherOrganizationId: scopedOrganizationId,
        publisherIndividualId: "",
      };
    }
    if (mode === "create" && scopedIndividualId) {
      return {
        ...initialState,
        publisherOrganizationId: "",
        publisherIndividualId: scopedIndividualId,
      };
    }
    return initialState;
  });
  const [bodyMode, setBodyMode] = useState<BodyMode>(
    feedItem?.html_body ? "rich" : "plain",
  );
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [organizationsNextCursor, setOrganizationsNextCursor] = useState(
    initialOrganizationsNextCursor,
  );
  const [individuals, setIndividuals] = useState(initialIndividuals);
  const [individualsNextCursor, setIndividualsNextCursor] = useState(
    initialIndividualsNextCursor,
  );
  const [pending, setPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [publishDialog, setPublishDialog] = useState<PublishDialogState | null>(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const sourceState = useMemo(() => {
    const initialState = toFormState(feedItem);
    if (mode === "create" && scopedOrganizationId) {
      return {
        ...initialState,
        publisherOrganizationId: scopedOrganizationId,
        publisherIndividualId: "",
      };
    }
    if (mode === "create" && scopedIndividualId) {
      return {
        ...initialState,
        publisherOrganizationId: "",
        publisherIndividualId: scopedIndividualId,
      };
    }
    return initialState;
  }, [feedItem, mode, scopedIndividualId, scopedOrganizationId]);
  const selectedOrganization = organizations.find(
    (organization) => organization.id === state.publisherOrganizationId,
  );
  const selectedIndividual = individuals.find(
    (individual) => individual.id === state.publisherIndividualId,
  );
  const selectedPublisher = selectedOrganization ?? selectedIndividual;
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);
  const bodyCharacterCount = bodyMode === "rich"
    ? htmlToPlainText(state.html_body).length
    : state.body.length;
  const sourceUrlError = sourceUrlErrorFor(state.source_url);
  const imageUrlError = imageUrlErrorFor(state.image_url);
  const virtualMeetingLinkError = virtualMeetingLinkErrorFor(
    state.upcoming_event.virtual_meeting_link,
  );
  const editStatus = feedItem?.status ?? "draft";
  const editPublishedAt = feedItem?.publishedAt ?? null;
  const isWorking = pending || deletePending;
  const canChangePublisher = !scopedOrganizationId && !scopedIndividualId;
  const hasMorePublishers = Boolean(
    (organizationsNextCursor || individualsNextCursor) && canChangePublisher,
  );
  const publisherSelectValue = state.publisherIndividualId
    ? `individual:${state.publisherIndividualId}`
    : state.publisherOrganizationId
      ? `organization:${state.publisherOrganizationId}`
      : "";

  function updateState(patch: Partial<FeedEntryFormState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  function selectPublisher(value: string) {
    const [kind, id] = value.split(":", 2);
    if (kind === "organization" && id) {
      updateState({
        publisherOrganizationId: id,
        publisherIndividualId: "",
      });
      return;
    }
    if (kind === "individual" && id) {
      updateState({
        publisherOrganizationId: "",
        publisherIndividualId: id,
      });
      return;
    }
    updateState({
      publisherOrganizationId: "",
      publisherIndividualId: "",
    });
  }

  function updatePayload<T extends DiscoverFeedType>(
    type: T,
    patch: Partial<FeedEntryFormState[T]>,
  ) {
    setState((current) => ({
      ...current,
      [type]: {
        ...current[type],
        ...patch,
      },
    }));
  }

  function switchBodyMode(nextMode: BodyMode) {
    setBodyMode(nextMode);
    setState((current) => {
      if (nextMode === "rich") {
        const nextHtml = current.html_body || plainTextToHtml(current.body);
        window.requestAnimationFrame(() => {
          if (richEditorRef.current) {
            richEditorRef.current.innerHTML = nextHtml;
          }
        });
        return {
          ...current,
          html_body: nextHtml,
          body: htmlToPlainText(nextHtml),
        };
      }

      const nextBody = current.body || htmlToPlainText(current.html_body);
      return {
        ...current,
        body: nextBody,
        html_body: "",
      };
    });
  }

  function syncRichBody() {
    const html = richEditorRef.current?.innerHTML ?? "";
    updateState({
      html_body: html,
      body: htmlToPlainText(html),
    });
  }

  function runRichCommand(command: string, value?: string) {
    richEditorRef.current?.focus();
    document.execCommand(command, false, value);
    syncRichBody();
  }

  function createRichLink() {
    const url = window.prompt(t("Paste a HTTPS URL"));
    if (!url) {
      return;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        throw new Error("HTTPS required");
      }
      runRichCommand("createLink", parsed.toString());
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Links must use a valid HTTPS URL."),
      });
    }
  }

  async function loadMoreOrganizations() {
    if (!hasMorePublishers) {
      return;
    }

    setPending(true);
    try {
      if (organizationsNextCursor) {
        const params = new URLSearchParams({
          cursor: organizationsNextCursor,
          limit: "50",
        });
        const page = await sdkFetch<DiscoverOrganizationsPage>(
          `/discover/organizations?${params.toString()}`,
        );
        setOrganizations((current) => [...current, ...page.organizations]);
        setOrganizationsNextCursor(page.nextCursor);
      }

      if (individualsNextCursor) {
        const params = new URLSearchParams({
          cursor: individualsNextCursor,
          limit: "50",
        });
        const page = await sdkFetch<DiscoverIndividualsPage>(
          `/discover/individuals?${params.toString()}`,
        );
        setIndividuals((current) => [...current, ...page.individuals]);
        setIndividualsNextCursor(page.nextCursor);
      }
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to load more publishers."),
      });
    } finally {
      setPending(false);
    }
  }

  function sourceUrlErrorFor(value: string) {
    return isValidHttpsUrl(value)
      ? null
      : t("Source URL must be a valid HTTPS URL.");
  }

  function imageUrlErrorFor(value: string) {
    return isValidHttpsUrl(value)
      ? null
      : t("Cover image URL must be a valid HTTPS URL.");
  }

  function virtualMeetingLinkErrorFor(value: string) {
    return isValidHttpsUrl(value)
      ? null
      : t("Virtual meeting link must be a valid HTTPS URL.");
  }

  function validate(nextState: FeedEntryFormState, status: DiscoverFeedStatus) {
    if (
      (nextState.publisherOrganizationId && nextState.publisherIndividualId) ||
      (!nextState.publisherOrganizationId && !nextState.publisherIndividualId)
    ) {
      return t("Choose one publisher.");
    }

    const nextSourceUrlError = sourceUrlErrorFor(nextState.source_url);
    if (nextSourceUrlError) {
      return nextSourceUrlError;
    }

    const nextImageUrlError = imageUrlErrorFor(nextState.image_url);
    if (nextImageUrlError) {
      return nextImageUrlError;
    }

    if (nextState.type === "upcoming_event") {
      const nextVirtualMeetingLinkError = virtualMeetingLinkErrorFor(
        nextState.upcoming_event.virtual_meeting_link,
      );
      if (nextVirtualMeetingLinkError) {
        return nextVirtualMeetingLinkError;
      }
    }

    if (status === "published" && selectedPublisher?.status !== "active") {
      return t("Only active publishers can publish feed entries.");
    }

    if (status === "published") {
      if (!nextState.title.trim()) {
        return t("Title is required before publishing.");
      }
      if (!nextState.subtitle.trim()) {
        return t("Subtitle is required before publishing.");
      }
      if (!nextState.body.trim() && !nextState.html_body.trim()) {
        return t("Body is required before publishing.");
      }
      if (nextState.type === "upcoming_event") {
        if (!nextState.upcoming_event.date) {
          return t("Event date is required before publishing.");
        }
        if (!nextState.upcoming_event.location.trim()) {
          return t("Event location is required before publishing.");
        }
      }
      if (nextState.type === "opportunity") {
        if (!nextState.opportunity.opportunity_type.trim()) {
          return t("Opportunity type is required before publishing.");
        }
        if (!nextState.opportunity.requirements.trim()) {
          return t("Opportunity requirements are required before publishing.");
        }
        if (!nextState.opportunity.eligibility.trim()) {
          return t("Opportunity eligibility is required before publishing.");
        }
        if (!nextState.opportunity.location.trim()) {
          return t("Opportunity location is required before publishing.");
        }
      }
    }

    return null;
  }

  async function persist(status: DiscoverFeedStatus, publishedAt: string | null = null) {
    const validationError = validate(state, status);
    if (validationError) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: validationError,
      });
      return null;
    }

    setPending(true);
    try {
      if (mode === "create") {
        const response = await sdkFetch<{ feedItem: DiscoverFeedItemRecord }>(
          "/discover/feed-items",
          {
            method: "POST",
            body: JSON.stringify(payloadFromState(state, status, publishedAt)),
          },
        );
        router.refresh();
        return response.feedItem;
      }

      if (!feedItem) {
        return null;
      }

      const response = await sdkFetch<{ feedItem: DiscoverFeedItemRecord }>(
        `/discover/feed-items/${feedItem.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payloadFromState(state, status, publishedAt)),
        },
      );
      router.refresh();
      return response.feedItem;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("Unable to save the feed entry.");
      setToast({
        id: Date.now(),
        tone: "error",
        message,
      });
      return null;
    } finally {
      setPending(false);
    }
  }

  async function saveDraft() {
    const saved = await persist("draft");
    if (!saved) {
      return;
    }

    setToast({
      id: Date.now(),
      tone: "success",
      message: t("Draft saved."),
    });
    if (mode === "create") {
      router.push(`/discover/feed-entries/${saved.id}`);
    }
  }

  async function publish() {
    setPublishDialog({ status: "publishing" });
    const publishedAt = new Date().toISOString();
    const published = await persist("published", publishedAt);
    if (!published) {
      setPublishDialog({
        status: "error",
        message: t("Publishing stopped. Review the highlighted requirement and try again."),
      });
      return;
    }

    setPublishDialog({
      status: "success",
      feedItemId: published.id,
      message: t("This entry is now published in Discover."),
    });
  }

  async function saveChanges() {
    if (mode !== "edit" || !feedItem) {
      return;
    }

    const saved = await persist(editStatus, editPublishedAt);
    if (!saved) {
      return;
    }

    setToast({
      id: Date.now(),
      tone: "success",
      message: t("Changes saved."),
    });
  }

  async function deleteFeedEntry() {
    if (!feedItem) {
      return;
    }

    setDeletePending(true);
    try {
      await sdkFetch<{ deleted: boolean; feedItemId: string }>(
        `/discover/feed-items/${feedItem.id}`,
        { method: "DELETE" },
      );
      router.refresh();
      router.push("/discover/feed-entries");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("Unable to delete the feed entry.");
      setToast({
        id: Date.now(),
        tone: "error",
        message,
      });
    } finally {
      setDeletePending(false);
    }
  }

  function renderSpecificFields() {
    if (state.type === "news") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <FieldShell label={t("Category")} htmlFor="discover-news-category">
            <Input
              id="discover-news-category"
              value={state.news.category}
              onChange={(event) =>
                updatePayload("news", { category: event.target.value })
              }
            />
          </FieldShell>
          <FieldShell label={t("Region")} htmlFor="discover-news-region">
            <CountryRegionPicker
              id="discover-news-region"
              value={state.news.region}
              onChange={(region) => updatePayload("news", { region })}
              language={language}
              t={t}
            />
          </FieldShell>
        </div>
      );
    }

    if (state.type === "research_update") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <FieldShell label={t("Research topic")} htmlFor="discover-research-topic">
            <Input
              id="discover-research-topic"
              value={state.research_update.research_topic}
              onChange={(event) =>
                updatePayload("research_update", {
                  research_topic: event.target.value,
                })
              }
            />
          </FieldShell>
          <FieldShell label={t("Journal")} htmlFor="discover-research-journal">
            <Input
              id="discover-research-journal"
              value={state.research_update.journal}
              onChange={(event) =>
                updatePayload("research_update", { journal: event.target.value })
              }
            />
          </FieldShell>
          <FieldShell label={t("Genes")} htmlFor="discover-research-genes">
            <Textarea
              id="discover-research-genes"
              value={state.research_update.genesText}
              onChange={(event) =>
                updatePayload("research_update", { genesText: event.target.value })
              }
              rows={4}
            />
          </FieldShell>
          <FieldShell label={t("Conditions")} htmlFor="discover-research-conditions">
            <Textarea
              id="discover-research-conditions"
              value={state.research_update.conditionsText}
              onChange={(event) =>
                updatePayload("research_update", {
                  conditionsText: event.target.value,
                })
              }
              rows={4}
            />
          </FieldShell>
        </div>
      );
    }

    if (state.type === "upcoming_event") {
      return (
        <div className="grid gap-4 md:grid-cols-3">
          <FieldShell label={t("Event date")} htmlFor="discover-event-date">
            <Input
              id="discover-event-date"
              type="datetime-local"
              value={state.upcoming_event.date}
              onChange={(event) =>
                updatePayload("upcoming_event", { date: event.target.value })
              }
            />
          </FieldShell>
          <FieldShell label={t("Location")} htmlFor="discover-event-location">
            <LocationSuggestInput
              id="discover-event-location"
              value={state.upcoming_event.location}
              onChange={(value) => updatePayload("upcoming_event", { location: value })}
              t={t}
            />
          </FieldShell>
          <FieldShell label={t("Max attendance")} htmlFor="discover-event-attendance">
            <Input
              id="discover-event-attendance"
              type="number"
              min={1}
              value={state.upcoming_event.max_attendance}
              onChange={(event) =>
                updatePayload("upcoming_event", {
                  max_attendance: event.target.value,
                })
              }
            />
          </FieldShell>
          <FieldShell
            label={t("Virtual meeting link")}
            htmlFor="discover-event-virtual-meeting"
            error={virtualMeetingLinkError}
            className="md:col-span-3"
          >
            <Input
              id="discover-event-virtual-meeting"
              type="url"
              value={state.upcoming_event.virtual_meeting_link}
              onChange={(event) =>
                updatePayload("upcoming_event", {
                  virtual_meeting_link: event.target.value,
                })
              }
              placeholder="https://meet.google.com/..."
              aria-invalid={Boolean(virtualMeetingLinkError)}
              aria-describedby={
                virtualMeetingLinkError
                  ? "discover-event-virtual-meeting-error"
                  : undefined
              }
              className={`h-11 ${virtualMeetingLinkError ? "border-destructive focus-visible:ring-destructive" : ""}`}
            />
          </FieldShell>
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <FieldShell label={t("Opportunity type")} htmlFor="discover-opportunity-type">
          <select
            id="discover-opportunity-type"
            value={state.opportunity.opportunity_type}
            onChange={(event) =>
              updatePayload("opportunity", {
                opportunity_type: event.target.value,
              })
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("Choose type")}</option>
            {DISCOVER_OPPORTUNITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </FieldShell>
        <FieldShell label={t("Location")} htmlFor="discover-opportunity-location">
          <LocationSuggestInput
            id="discover-opportunity-location"
            value={state.opportunity.location}
            onChange={(value) => updatePayload("opportunity", { location: value })}
            t={t}
          />
        </FieldShell>
        <FieldShell label={t("Requirements")} htmlFor="discover-opportunity-requirements">
          <Textarea
            id="discover-opportunity-requirements"
            value={state.opportunity.requirements}
            onChange={(event) =>
              updatePayload("opportunity", { requirements: event.target.value })
            }
            rows={4}
          />
        </FieldShell>
        <FieldShell label={t("Eligibility")} htmlFor="discover-opportunity-eligibility">
          <Textarea
            id="discover-opportunity-eligibility"
            value={state.opportunity.eligibility}
            onChange={(event) =>
              updatePayload("opportunity", { eligibility: event.target.value })
            }
            rows={4}
          />
        </FieldShell>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/discover/feed-entries">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("Back to feed entries")}
          </Link>
        </Button>
        {feedItem ? (
          <span className="font-mono text-xs text-muted-foreground">{feedItem.id}</span>
        ) : null}
      </div>

      <section className="glass-panel overflow-hidden">
        <div className="border-b border-border/75 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-200">
                <Newspaper className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-semibold text-foreground">
                  {mode === "create" ? t("Create feed entry") : t("Edit feed entry")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedPublisher?.name ?? t("Publisher draft")}
                </p>
              </div>
              <HeaderUnclutterButton />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setState(sourceState)}
                disabled={!changed || isWorking}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("Reset")}
              </Button>
              {mode === "create" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void saveDraft()}
                  disabled={isWorking}
                >
                  <Save className="h-3.5 w-3.5" />
                  {t("Save draft")}
                </Button>
              ) : null}
              {mode === "edit" && feedItem ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isWorking}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("Delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("Delete feed entry?")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("This permanently deletes the feed entry from Discover. It will be fully erased from the feed and cannot be restored.")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deletePending}>
                        {t("Cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void deleteFeedEntry()}
                        disabled={deletePending}
                      >
                        {deletePending ? t("Deleting...") : t("Delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-7 px-5 py-5">
            <section className="flex flex-col gap-4">
              <SectionTitle eyebrow={t("Generic information")} title={t("Feed setup")} />
              <div className="grid gap-4 md:grid-cols-2">
                <FieldShell label={t("Publisher")} htmlFor="discover-feed-publisher" className="md:col-span-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      id="discover-feed-publisher"
                      value={publisherSelectValue}
                      onChange={(event) =>
                        selectPublisher(event.target.value)
                      }
                      className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      disabled={!canChangePublisher}
                    >
                      <option value="">{t("Choose publisher")}</option>
                      {organizations.length > 0 ? (
                        <optgroup label={t("Organizations")}>
                          {organizations.map((organization) => (
                            <option
                              key={organization.id}
                              value={`organization:${organization.id}`}
                            >
                              {organization.name} ({t(organization.status)})
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {individuals.length > 0 ? (
                        <optgroup label={t("Individual Publishers")}>
                          {individuals.map((individual) => (
                            <option
                              key={individual.id}
                              value={`individual:${individual.id}`}
                            >
                              {individual.name} ({t(individual.status)})
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                    {hasMorePublishers ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadMoreOrganizations()}
                        disabled={pending}
                      >
                        {t("Load more publishers")}
                      </Button>
                    ) : null}
                  </div>
                </FieldShell>

                <FieldShell label={t("Type")} htmlFor="discover-feed-type">
                  <select
                    id="discover-feed-type"
                    value={state.type}
                    onChange={(event) =>
                      updateState({ type: event.target.value as DiscoverFeedType })
                    }
                    className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {DISCOVER_FEED_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.label)}
                      </option>
                    ))}
                  </select>
                </FieldShell>

                <FieldShell label={t("Language")} htmlFor="discover-feed-language">
                  <select
                    id="discover-feed-language"
                    value={state.language}
                    onChange={(event) =>
                      updateState({ language: event.target.value as "en" | "es" })
                    }
                    className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="en">{t("English")}</option>
                    <option value="es">{t("Spanish")}</option>
                  </select>
                </FieldShell>

                <FieldShell
                  label={t("Source URL")}
                  htmlFor="discover-feed-source"
                  error={sourceUrlError}
                >
                  <Input
                    id="discover-feed-source"
                    type="url"
                    value={state.source_url}
                    onChange={(event) =>
                      updateState({ source_url: event.target.value })
                    }
                    placeholder="https://"
                    aria-invalid={Boolean(sourceUrlError)}
                    aria-describedby={
                      sourceUrlError ? "discover-feed-source-error" : undefined
                    }
                    className={`h-11 ${sourceUrlError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                </FieldShell>

                <FieldShell label={t("Title")} htmlFor="discover-feed-title" className="md:col-span-2">
                  <Input
                    id="discover-feed-title"
                    value={state.title}
                    onChange={(event) => updateState({ title: event.target.value })}
                    className="h-12 text-base"
                  />
                </FieldShell>

                <FieldShell label={t("Subtitle")} htmlFor="discover-feed-subtitle" className="md:col-span-2">
                  <Textarea
                    id="discover-feed-subtitle"
                    value={state.subtitle}
                    onChange={(event) => updateState({ subtitle: event.target.value })}
                    rows={3}
                    className="text-base"
                  />
                </FieldShell>

                <FieldShell
                  label={t("Cover image URL")}
                  htmlFor="discover-feed-image"
                  error={imageUrlError}
                  className="md:col-span-2"
                >
                  <Input
                    id="discover-feed-image"
                    type="url"
                    value={state.image_url}
                    onChange={(event) =>
                      updateState({ image_url: event.target.value })
                    }
                    placeholder="https://"
                    aria-invalid={Boolean(imageUrlError)}
                    aria-describedby={
                      imageUrlError ? "discover-feed-image-error" : undefined
                    }
                    className={`h-11 ${imageUrlError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                </FieldShell>
              </div>
            </section>

            <section className="flex flex-col gap-4 rounded-md border border-sky-200/70 bg-sky-50/45 px-4 py-4 dark:border-sky-300/16 dark:bg-sky-400/8">
              <SectionTitle eyebrow={t("Body")} title={t("Write the note")}>
                <div className="inline-flex rounded-md border border-border bg-background p-1">
                  {(["plain", "rich"] as BodyMode[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => switchBodyMode(option)}
                      className={[
                        "inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-medium transition-colors",
                        bodyMode === option
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      ].join(" ")}
                    >
                      {option === "plain" ? (
                        <Type className="h-3.5 w-3.5" />
                      ) : (
                        <Heading2 className="h-3.5 w-3.5" />
                      )}
                      {option === "plain" ? t("Simple text") : t("Rich text")}
                    </button>
                  ))}
                </div>
              </SectionTitle>

              {bodyMode === "plain" ? (
                <Textarea
                  id="discover-feed-body"
                  value={state.body}
                  onChange={(event) => updateState({ body: event.target.value })}
                  rows={16}
                  className="min-h-[24rem] resize-y border-sky-200/80 bg-white/90 text-base leading-7 shadow-sm dark:border-sky-300/18 dark:bg-slate-950/50"
                />
              ) : (
                <div className="overflow-hidden rounded-md border border-sky-200/80 bg-white shadow-sm dark:border-sky-300/18 dark:bg-slate-950/50">
                  <div className="flex flex-wrap gap-1 border-b border-border/70 bg-muted/40 px-2 py-2">
                    <Button type="button" variant="ghost" size="icon-sm" title={t("Heading")} aria-label={t("Heading")} onClick={() => runRichCommand("formatBlock", "h2")}>
                      <Heading2 className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" title={t("Bold")} aria-label={t("Bold")} onClick={() => runRichCommand("bold")}>
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" title={t("Italic")} aria-label={t("Italic")} onClick={() => runRichCommand("italic")}>
                      <Italic className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" title={t("Bulleted list")} aria-label={t("Bulleted list")} onClick={() => runRichCommand("insertUnorderedList")}>
                      <List className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" title={t("Quote")} aria-label={t("Quote")} onClick={() => runRichCommand("formatBlock", "blockquote")}>
                      <Quote className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" title={t("Link")} aria-label={t("Link")} onClick={createRichLink}>
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </div>
                  <div
                    ref={richEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={syncRichBody}
                    onBlur={syncRichBody}
                    className="min-h-[24rem] px-5 py-4 text-base leading-7 outline-none prose-headings:font-heading [&_a]:text-sky-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-sky-300 [&_blockquote]:pl-4 [&_h2]:mb-3 [&_h2]:mt-5 [&_li]:ml-5 [&_ul]:list-disc"
                    dangerouslySetInnerHTML={{
                      __html: state.html_body || plainTextToHtml(state.body),
                    }}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{bodyCharacterCount.toLocaleString()} {t("characters")}</span>
                <span>{bodyMode === "rich" ? t("HTML will be sanitized before storage.") : t("Plain body will be stored as body.")}</span>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <SectionTitle
                eyebrow={t("Specific type fields")}
                title={t(discoverTypeLabel(state.type))}
              />
              {renderSpecificFields()}
            </section>
          </div>

          <aside className="border-t border-border/75 bg-muted/22 px-5 py-5 xl:border-l xl:border-t-0">
            <div className="sticky top-[calc(var(--app-header-height)+1rem)] flex flex-col gap-4">
              <div className="rounded-md border border-border bg-background/86 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  {selectedPublisher?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedPublisher.imageUrl}
                      alt=""
                      className="h-10 w-10 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                      <Languages className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {selectedPublisher?.name ?? t("Publisher")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedPublisher?.status
                        ? t(selectedPublisher.status)
                        : t("No publisher selected")}
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-md border border-border bg-muted/30">
                  {state.image_url && !imageUrlError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={state.image_url}
                      alt=""
                      className="aspect-[1024/500] w-full object-cover"
                    />
                  ) : state.image_url && imageUrlError ? (
                    <div className="flex aspect-[1024/500] items-center justify-center px-4 text-center text-sm text-destructive">
                      <ImageIcon className="mr-2 h-4 w-4" />
                      {t("Enter a valid cover image URL to preview.")}
                    </div>
                  ) : (
                    <div className="flex aspect-[1024/500] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                      <ImageIcon className="mr-2 h-4 w-4" />
                      {t("No cover image")}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="brand">{t(discoverTypeLabel(state.type))}</Badge>
                  <Badge variant="outline">{state.language}</Badge>
                  <Badge variant={selectedPublisher?.status === "active" ? "success" : "warning"}>
                    {selectedPublisher?.status
                      ? t(selectedPublisher.status)
                      : t("publisher")}
                  </Badge>
                </div>

                <h3 className="mt-3 font-heading text-lg font-semibold leading-6 text-foreground">
                  {state.title || t("Untitled feed entry")}
                </h3>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">
                  {state.subtitle || t("No subtitle")}
                </p>
              </div>
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 z-20 border-t border-border bg-background/94 px-5 py-4 shadow-[0_-18px_42px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 text-sm text-muted-foreground">
              {changed ? t("Unsaved changes") : t("No unsaved changes")}
            </div>
            <Button
              size="lg"
              onClick={() => void (mode === "edit" ? saveChanges() : publish())}
              disabled={isWorking}
              className="h-14 min-w-[min(100%,22rem)] justify-center text-base font-semibold"
            >
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : mode === "edit" ? (
                <Save className="h-5 w-5" />
              ) : (
                <UploadCloud className="h-5 w-5" />
              )}
              {mode === "edit"
                ? pending
                  ? t("Saving...")
                  : t("Save changes")
                : pending
                  ? t("Publishing...")
                  : t("Publish to Discover")}
            </Button>
          </div>
        </div>
      </section>

      <Dialog
        open={Boolean(publishDialog)}
        onOpenChange={(open) => {
          if (!open && publishDialog?.status !== "publishing") {
            setPublishDialog(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={publishDialog?.status !== "publishing"}
          className="max-w-xl overflow-hidden rounded-[2rem] border border-sky-100 [background:linear-gradient(155deg,rgba(249,253,255,0.98),rgba(240,249,255,0.98)_54%,rgba(207,250,254,0.94))] p-0 text-sky-950 shadow-[0_34px_120px_rgba(14,165,233,0.24)] dark:border-sky-300/22 dark:[background:linear-gradient(150deg,rgba(8,28,39,0.98),rgba(12,38,55,0.96)_48%,rgba(14,165,233,0.18))] dark:text-sky-50"
        >
          <DialogHeader className="border-b border-sky-100 px-6 py-5 dark:border-sky-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold">
              {publishDialog?.status === "success"
                ? t("Published to Discover")
                : publishDialog?.status === "error"
                  ? t("Publish needs attention")
                  : t("Publishing Discover entry")}
            </DialogTitle>
            <DialogDescription className="text-sky-950/70 dark:text-sky-50/70">
              {publishDialog?.message ??
                t("Saving the entry and preparing it for the mobile feed.")}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-6">
            <div className="flex items-start gap-4 rounded-[1.5rem] border border-sky-100 bg-white/75 px-5 py-5 dark:border-sky-300/16 dark:bg-sky-950/24">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sky-700 shadow-sm dark:bg-sky-400/12 dark:text-sky-100">
                {publishDialog?.status === "success" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : publishDialog?.status === "error" ? (
                  <Send className="h-5 w-5" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-heading text-lg font-semibold">
                  {publishDialog?.status === "success"
                    ? state.title || t("Discover entry")
                    : publishDialog?.status === "error"
                      ? t("Nothing was published")
                      : t("Publishing in progress")}
                </p>
                <p className="mt-2 text-sm text-sky-950/70 dark:text-sky-50/70">
                  {publishDialog?.status === "success"
                    ? t("The item is saved with status published and will appear wherever the app reads the published Discover feed.")
                    : publishDialog?.status === "error"
                      ? t("The entry stayed unchanged. Fix the form requirement and publish again.")
                      : t("Validating the publisher, content fields, and compact payload.")}
                </p>
              </div>
            </div>
          </div>

          {publishDialog?.status === "error" ? (
            <DialogFooter className="gap-3 border-sky-100/90 bg-white/55 px-6 py-5 dark:border-sky-300/14 dark:bg-sky-950/16">
              <Button type="button" onClick={() => setPublishDialog(null)}>
                {t("OK")}
              </Button>
            </DialogFooter>
          ) : publishDialog?.status === "success" ? (
            <DialogFooter className="gap-3 border-sky-100/90 bg-white/55 px-6 py-5 dark:border-sky-300/14 dark:bg-sky-950/16">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPublishDialog(null);
                  router.push("/discover/feed-entries");
                }}
              >
                {t("Back to feed entries")}
              </Button>
              {publishDialog?.feedItemId ? (
                <Button
                  type="button"
                  onClick={() => {
                    const feedItemId = publishDialog?.feedItemId;
                    if (!feedItemId) {
                      return;
                    }
                    setPublishDialog(null);
                    router.push(`/discover/feed-entries/${feedItemId}`);
                  }}
                >
                  {t("Open entry")}
                </Button>
              ) : null}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
