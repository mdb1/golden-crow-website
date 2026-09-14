"use client";

import Link from "next/link";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bold,
  CalendarDays,
  ChevronDown,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Heading2,
  ImageIcon,
  Info,
  Italic,
  Languages,
  Link2,
  LinkIcon,
  List,
  Loader2,
  MapPin,
  Newspaper,
  Plus,
  Quote,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings2,
  Trash2,
  Type,
  UploadCloud,
  Users,
  X,
  XCircle,
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
import { cn } from "@/lib/utils";
import {
  DISCOVER_FEED_TYPES,
  DISCOVER_FEED_TYPE_OPTIONS,
  discoverFeedTypeDefinition,
  discoverTypeLabel,
  getDiscoverPayload,
  stringFromPayload,
  type DiscoverFeedPayloadFieldDefinition,
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
type FeedEntryPayloadState = Record<string, string>;
type FeedEntryPayloadsState = Record<DiscoverFeedType, FeedEntryPayloadState>;

type FeedEntryFormState = {
  publisherOrganizationId: string;
  publisherIndividualId: string;
  type: DiscoverFeedType;
  language: "en" | "es";
  title: string;
  subtitle: string;
  body: string;
  htmlBody: string;
  imageUrl: string;
  imageUploadDataUrl: string;
  imageUploadName: string;
  imageUploadMimeType: string;
  sourceUrl: string;
  sourceButtonText: string;
  payloads: FeedEntryPayloadsState;
};

type PublishDialogState = {
  status: "publishing" | "success" | "error";
  feedItemId?: string;
  message?: string;
};

type ImageUploadStatusTone = "loading" | "success" | "warning" | "error";
type ImageUploadStatus = {
  tone: ImageUploadStatusTone;
  message: string;
  href?: string;
  linkLabel?: string;
};

type ProcessedFeedCoverImageUpload = {
  dataUrl: string;
  name: string;
  mimeType: string;
  compressed: boolean;
};

const DISCOVER_PUBLIC_FEED_ENTRY_BASE_URL =
  "https://goldencrowvs.com/pocket-genes/discover/feed_entries";
const FEED_COVER_IMAGE_UPLOAD_MAX_BYTES = 600 * 1024;
const FEED_COVER_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH = 900000;
const FEED_COVER_IMAGE_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const FEED_COVER_IMAGE_COMPRESSION_MIME_TYPES = [
  "image/webp",
  "image/jpeg",
] as const;
const FEED_COVER_IMAGE_COMPRESSION_QUALITY_STEPS = [
  0.86, 0.76, 0.66, 0.56, 0.46, 0.36,
] as const;
const FEED_COVER_IMAGE_WIDTH = 1024;
const FEED_COVER_IMAGE_HEIGHT = 500;
const IMAGE_REDUCER_URL = "https://squoosh.app/";
const publisherPrimaryButtonClass =
  "h-10 rounded-xl bg-violet-600 px-4 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700";
const publisherSoftButtonClass =
  "h-9 rounded-xl border-violet-200/80 bg-white/78 px-3 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50 dark:hover:bg-violet-500/18";
const publisherFieldSectionClass =
  "flex flex-col gap-4 rounded-2xl border border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(250,250,255,0.94)_58%,rgba(245,243,255,0.86))] px-4 py-4 shadow-[0_18px_56px_-48px_rgba(109,40,217,0.48)] dark:border-violet-400/16 dark:bg-[linear-gradient(145deg,rgba(18,23,40,0.94),rgba(30,24,57,0.86))]";
const publisherInputClass =
  "h-11 rounded-xl border-violet-200/75 bg-white/90 px-4 text-sm shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-300/35 dark:border-violet-400/18 dark:bg-slate-950/45";
const publisherTextareaClass =
  "min-h-24 rounded-xl border-violet-200/75 bg-white/90 px-4 py-3 text-sm shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-300/35 dark:border-violet-400/18 dark:bg-slate-950/45";
const publisherSelectClass =
  "h-11 w-full appearance-none rounded-xl border border-violet-200/75 bg-white/90 py-2 pr-16 pl-6 text-sm text-foreground shadow-sm outline-none transition focus:border-violet-400 focus:ring-3 focus:ring-violet-300/35 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-400/18 dark:bg-slate-950/45";
const publisherSelectCaretClass =
  "pointer-events-none absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-white/55";

type EventSelectOption = {
  value: string;
  label: string;
  description?: string;
};

type EventActionButton = {
  type: string;
  title: string;
  url: string;
};

type EventRegionalTimeRow = {
  countryCode: string;
  startTime: string;
  endTime: string;
  timezone: string;
};

const EVENT_TIME_KIND_OPTIONS: readonly EventSelectOption[] = [
  {
    value: "timed",
    label: "Timed event",
    description: "Use the start and end time fields for a standard scheduled activity.",
  },
  {
    value: "allDay",
    label: "All-day event",
    description: "Use the date anchor, but do not show daily start or end times.",
  },
  {
    value: "dateOnly",
    label: "Date only",
    description: "Show only the event date with no time row.",
  },
  {
    value: "timeTba",
    label: "Time to be announced",
    description: "Tell readers the date is known but the time is still pending.",
  },
  {
    value: "regionalTimes",
    label: "Regional times",
    description: "Use country-specific rows when times vary by region.",
  },
];

const EVENT_KIND_OPTIONS: readonly EventSelectOption[] = [
  { value: "webinar", label: "Webinar" },
  { value: "conference", label: "Conference" },
  { value: "workshop", label: "Workshop" },
  { value: "seminar", label: "Seminar" },
  { value: "supportGroup", label: "Support group" },
  { value: "communityMeetup", label: "Community meetup" },
  { value: "awarenessDay", label: "Awareness day" },
  { value: "course", label: "Course" },
  { value: "training", label: "Training" },
  { value: "fundraiser", label: "Fundraiser" },
  { value: "clinicalSession", label: "Clinical session" },
  { value: "researchSession", label: "Research session" },
  { value: "networking", label: "Networking" },
  { value: "livestream", label: "Livestream" },
  { value: "recordedSession", label: "Recorded session" },
  { value: "other", label: "Other" },
];

const EVENT_ATTENDANCE_MODE_OPTIONS: readonly EventSelectOption[] = [
  { value: "online", label: "Online" },
  { value: "inPerson", label: "In person" },
  { value: "hybrid", label: "Hybrid" },
  { value: "phone", label: "Phone" },
  { value: "onDemand", label: "On demand" },
  { value: "toBeAnnounced", label: "To be announced" },
];

const EVENT_STATUS_OPTIONS: readonly EventSelectOption[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "tentative", label: "Tentative" },
  { value: "postponed", label: "Postponed" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
  { value: "soldOut", label: "Sold out" },
];

const EVENT_ACTION_BUTTON_TYPE_OPTIONS: readonly EventSelectOption[] = [
  { value: "register", label: "Register" },
  { value: "join", label: "Join live" },
  { value: "learnMore", label: "Learn more" },
  { value: "viewAgenda", label: "View agenda" },
  { value: "watchRecording", label: "Watch recording" },
  { value: "downloadMaterials", label: "Download materials" },
  { value: "contactOrganizer", label: "Contact organizer" },
];

const EVENT_ACTION_BUTTON_DEFAULT_TITLES: Record<string, string> = {
  register: "Register",
  join: "Join live",
  learnMore: "Learn more",
  viewAgenda: "View agenda",
  watchRecording: "Watch recording",
  downloadMaterials: "Download materials",
  contactOrganizer: "Contact organizer",
};

const EVENT_RELATIONSHIP_OPTIONS: readonly EventSelectOption[] = [
  { value: "organizer", label: "Organizer" },
  { value: "coOrganizer", label: "Co-organizer" },
  { value: "speaker", label: "Speaker" },
  { value: "sponsor", label: "Sponsor" },
  { value: "partner", label: "Event partner" },
  { value: "participant", label: "Participant" },
  { value: "attendee", label: "Attendee" },
  { value: "mentioning", label: "Mentioning the event" },
  { value: "unknown", label: "Unknown" },
];

const EVENT_AUDIENCE_OPTIONS: readonly EventSelectOption[] = [
  { value: "patients", label: "Patients" },
  { value: "families", label: "Families" },
  { value: "caregivers", label: "Caregivers" },
  { value: "students", label: "Students" },
  { value: "clinicians", label: "Clinicians" },
  { value: "researchers", label: "Researchers" },
  { value: "geneticCounselors", label: "Genetic counselors" },
  { value: "advocates", label: "Advocates" },
  { value: "industry", label: "Industry" },
  { value: "generalPublic", label: "General public" },
];

const EVENT_COST_TYPE_OPTIONS: readonly EventSelectOption[] = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
  { value: "donation", label: "Donation" },
  { value: "varies", label: "Varies" },
  { value: "unknown", label: "Unknown" },
];

const EVENT_LANGUAGE_OPTIONS: readonly EventSelectOption[] = [
  { value: "es", label: "Spanish" },
  { value: "en", label: "English" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ca", label: "Catalan" },
];

const EVENT_ACCESSIBILITY_OPTIONS: readonly EventSelectOption[] = [
  { value: "captions", label: "Captions" },
  { value: "liveTranscript", label: "Live transcript" },
  { value: "signLanguage", label: "Sign language" },
  { value: "wheelchairAccessible", label: "Wheelchair accessible" },
  { value: "recordingAvailable", label: "Recording available" },
  { value: "quietRoom", label: "Quiet room" },
  { value: "translatedMaterials", label: "Translated materials" },
];

const EVENT_TIMEZONE_OPTIONS = [
  "UTC",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Santiago",
  "America/Mexico_City",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Paris",
  "America/Bogota",
  "America/Lima",
] as const;

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

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${Math.round(kilobytes)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function feedCoverImageFileName(file: File, mimeType: string) {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const rawName = file.name || `feed-cover.${extension}`;
  const baseName = rawName.replace(/\.[^.]+$/, "") || "feed-cover";

  return `${baseName}-1024x500.${extension}`;
}

function readFileAsDataUrl(file: File) {
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

function loadImageElementFromFile(file: File) {
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

function canResizeImagesInBrowser() {
  return (
    typeof document !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.toBlob === "function"
  );
}

function drawFeedCoverImage(image: HTMLImageElement, mimeType: string) {
  const sourceWidth = image.naturalWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.height || 0;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
  }

  const targetAspect = FEED_COVER_IMAGE_WIDTH / FEED_COVER_IMAGE_HEIGHT;
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

  canvas.width = FEED_COVER_IMAGE_WIDTH;
  canvas.height = FEED_COVER_IMAGE_HEIGHT;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, FEED_COVER_IMAGE_WIDTH, FEED_COVER_IMAGE_HEIGHT);
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    FEED_COVER_IMAGE_WIDTH,
    FEED_COVER_IMAGE_HEIGHT,
  );

  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

async function resizeFeedCoverImageFile(file: File) {
  const image = await loadImageElementFromFile(file);

  for (const mimeType of FEED_COVER_IMAGE_COMPRESSION_MIME_TYPES) {
    const canvas = drawFeedCoverImage(image, mimeType);

    for (const quality of FEED_COVER_IMAGE_COMPRESSION_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, mimeType, quality);

      if (!blob || blob.size === 0) {
        continue;
      }

      if (blob.size <= FEED_COVER_IMAGE_UPLOAD_MAX_BYTES) {
        return new File([blob], feedCoverImageFileName(file, mimeType), {
          type: mimeType,
          lastModified: Date.now(),
        });
      }
    }
  }

  throw new Error("IMAGE_COMPRESSION_FAILED");
}

async function processFeedCoverImageFile(
  file: File,
): Promise<ProcessedFeedCoverImageUpload> {
  if (!FEED_COVER_IMAGE_UPLOAD_TYPES.has(file.type)) {
    throw new Error("IMAGE_TYPE_UNSUPPORTED");
  }

  const finalFile = canResizeImagesInBrowser()
    ? await resizeFeedCoverImageFile(file)
    : file;
  const dataUrl = await readFileAsDataUrl(finalFile);

  if (dataUrl.length > FEED_COVER_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH) {
    throw new Error("IMAGE_COMPRESSION_FAILED");
  }

  return {
    dataUrl,
    name: finalFile.name,
    mimeType: finalFile.type,
    compressed: finalFile !== file,
  };
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

function toDateInput(value?: string | null) {
  if (!value) {
    return "";
  }

  const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnlyMatch) {
    const dateText = dateOnlyMatch[1];
    if (fromDateInput(dateText)) {
      return dateText;
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function fromDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const isoDate = `${trimmed}T00:00:00.000Z`;
  const date = new Date(isoDate);

  return Number.isNaN(date.getTime()) || !date.toISOString().startsWith(trimmed)
    ? null
    : isoDate;
}

function publicDiscoverFeedEntryUrl(feedItemId: string) {
  return `${DISCOVER_PUBLIC_FEED_ENTRY_BASE_URL}?id=${encodeURIComponent(feedItemId)}`;
}

function lines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEventCountryCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}

function isValidIsoCountryCode(value: string) {
  return /^[A-Z]{2}$/.test(value.trim().toUpperCase());
}

function isValidTimeOfDay(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

function isValidIanaTimezone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function serializeEventMap(value: unknown) {
  if (!isPlainObject(value)) {
    return "";
  }

  return Object.entries(value)
    .map(([countryCode, mapValue]) => {
      const text = typeof mapValue === "string" ? mapValue.trim() : "";
      return text ? `${countryCode.trim().toUpperCase()}=${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseEventMapText(value: string) {
  const map = new Map<string, string>();

  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const rawCountryCode =
      separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed.slice(0, 2);
    const rawValue =
      separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed.slice(2);
    const countryCode = normalizeEventCountryCode(rawCountryCode);
    const mapValue = rawValue.trim();

    if (countryCode && mapValue) {
      map.set(countryCode, mapValue);
    }
  }

  return map;
}

function eventMapObject(value: string) {
  const entries = [...parseEventMapText(value).entries()];
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseEventActionButtons(value: string): EventActionButton[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isPlainObject)
      .map((button) => ({
        type: stringFromPayload(button.type),
        title: stringFromPayload(button.title),
        url: stringFromPayload(button.url),
      }));
  } catch {
    return [];
  }
}

function serializeEventActionButtons(buttons: EventActionButton[]) {
  const activeButtons = buttons
    .map((button) => ({
      type: button.type.trim(),
      title: button.title.trim(),
      url: button.url.trim(),
    }))
    .filter((button) => button.type || button.title || button.url);

  return activeButtons.length > 0 ? JSON.stringify(activeButtons, null, 2) : "";
}

function eventActionButtonUrlIsValid(button: EventActionButton) {
  const url = button.url.trim();
  if (!url) {
    return true;
  }

  if (button.type === "contactOrganizer" && url.startsWith("mailto:")) {
    return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url);
  }

  return isValidHttpsUrl(url);
}

function parseEventRegionalRows(
  startTimesText: string,
  endTimesText: string,
  timezonesText: string,
): EventRegionalTimeRow[] {
  const startTimes = parseEventMapText(startTimesText);
  const endTimes = parseEventMapText(endTimesText);
  const timezones = parseEventMapText(timezonesText);
  const countryCodes = Array.from(
    new Set([
      ...startTimes.keys(),
      ...endTimes.keys(),
      ...timezones.keys(),
    ]),
  ).sort();

  return countryCodes.map((countryCode) => ({
    countryCode,
    startTime: startTimes.get(countryCode) ?? "",
    endTime: endTimes.get(countryCode) ?? "",
    timezone: timezones.get(countryCode) ?? "",
  }));
}

function serializeEventRegionalRows(rows: EventRegionalTimeRow[]) {
  const cleanRows = rows
    .map((row) => ({
      countryCode: normalizeEventCountryCode(row.countryCode),
      startTime: row.startTime.trim(),
      endTime: row.endTime.trim(),
      timezone: row.timezone.trim(),
    }))
    .filter((row) => row.countryCode && (row.startTime || row.endTime || row.timezone));

  return {
    countryDailyStartTimes: cleanRows
      .filter((row) => row.startTime)
      .map((row) => `${row.countryCode}=${row.startTime}`)
      .join("\n"),
    countryDailyEndTimes: cleanRows
      .filter((row) => row.endTime)
      .map((row) => `${row.countryCode}=${row.endTime}`)
      .join("\n"),
    countryTimezones: cleanRows
      .filter((row) => row.timezone)
      .map((row) => `${row.countryCode}=${row.timezone}`)
      .join("\n"),
  };
}

function eventStringValue(payload: FeedEntryPayloadState, key: string) {
  return (payload[key] ?? "").trim();
}

function eventIntegerValue(payload: FeedEntryPayloadState, key: string) {
  const value = eventStringValue(payload, key);
  return value ? Number(value) : null;
}

function eventOptionalIntegerValue(payload: FeedEntryPayloadState, key: string) {
  const value = eventStringValue(payload, key);
  return value ? Number(value) : undefined;
}

function selectedEventValues(payload: FeedEntryPayloadState, key: string) {
  return lines(payload[key] ?? "");
}

function serializeSelectedEventValues(values: readonly string[]) {
  return values.join("\n");
}

function validateEventActionButtons(buttons: EventActionButton[]) {
  const seen = new Set<string>();

  for (const button of buttons) {
    const hasAnyValue = Boolean(
      button.type.trim() || button.title.trim() || button.url.trim(),
    );
    if (!hasAnyValue) {
      continue;
    }

    if (!button.type.trim()) {
      return "Choose an action type for every event button.";
    }
    if (!button.url.trim()) {
      return "Add a URL for every event button.";
    }
    if (button.title.trim().length > 56) {
      return "Event button titles can be up to 56 characters.";
    }
    if (!eventActionButtonUrlIsValid(button)) {
      return "Event action URLs must use HTTPS. Contact organizer may use mailto.";
    }
    if (seen.has(button.type)) {
      return "Use each event action type only once.";
    }
    seen.add(button.type);
  }

  return null;
}

function validateUpcomingEventPayload(payload: FeedEntryPayloadState) {
  const dailyStartTime = eventStringValue(payload, "dailyStartTime");
  const dailyEndTime = eventStringValue(payload, "dailyEndTime");
  const multiDayLength = eventStringValue(payload, "multiDayLength");
  const priceMinorUnits = eventStringValue(payload, "priceMinorUnits");
  const timezone = eventStringValue(payload, "timezone");
  const organizerName = eventStringValue(payload, "organizerName");
  const publisherDisclosure = eventStringValue(payload, "publisherDisclosure");
  const regionalRows = parseEventRegionalRows(
    payload.countryDailyStartTimes ?? "",
    payload.countryDailyEndTimes ?? "",
    payload.countryTimezones ?? "",
  );
  const actionButtonError = validateEventActionButtons(
    parseEventActionButtons(payload.actionButtons ?? ""),
  );

  if (actionButtonError) {
    return actionButtonError;
  }

  if (dailyStartTime && !isValidTimeOfDay(dailyStartTime)) {
    return "Daily start time must use HH:mm.";
  }
  if (dailyEndTime && !isValidTimeOfDay(dailyEndTime)) {
    return "Daily end time must use HH:mm.";
  }
  if (timezone && !isValidIanaTimezone(timezone)) {
    return "Timezone must be a valid IANA timezone.";
  }
  if (
    multiDayLength &&
    (!Number.isInteger(Number(multiDayLength)) ||
      Number(multiDayLength) < 1 ||
      Number(multiDayLength) > 365)
  ) {
    return "Multi-day length must be between 1 and 365.";
  }
  if (
    priceMinorUnits &&
    (!Number.isInteger(Number(priceMinorUnits)) || Number(priceMinorUnits) < 0)
  ) {
    return "Price in minor units must be zero or a positive integer.";
  }
  if (organizerName.length > 80) {
    return "Organizer name can be up to 80 characters.";
  }
  if (publisherDisclosure.length > 140) {
    return "Publisher disclosure can be up to 140 characters.";
  }

  for (const row of regionalRows) {
    if (!isValidIsoCountryCode(row.countryCode)) {
      return "Regional time rows need two-letter ISO country codes.";
    }
    if (row.startTime && !isValidTimeOfDay(row.startTime)) {
      return "Regional start times must use HH:mm.";
    }
    if (row.endTime && !isValidTimeOfDay(row.endTime)) {
      return "Regional end times must use HH:mm.";
    }
    if (row.timezone && !isValidIanaTimezone(row.timezone)) {
      return "Regional timezones must be valid IANA timezones.";
    }
  }

  return null;
}

function payloadText(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => (typeof entry === "string" ? entry : "")).filter(Boolean).join("\n")
    : stringFromPayload(value);
}

function payloadSourceValue(
  payload: Record<string, unknown>,
  field: DiscoverFeedPayloadFieldDefinition,
) {
  const keys = [field.key, ...(field.aliases ?? [])];

  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) {
      return payload[key];
    }
  }

  return undefined;
}

function payloadDateText(value: unknown) {
  if (typeof value === "string" || value instanceof Date) {
    return toDateTimeInput(value instanceof Date ? value.toISOString() : value);
  }

  return "";
}

function payloadDateOnlyText(value: unknown) {
  if (typeof value === "string" || value instanceof Date) {
    return toDateInput(value instanceof Date ? value.toISOString() : value);
  }

  return "";
}

function payloadFieldText(
  payload: Record<string, unknown>,
  field: DiscoverFeedPayloadFieldDefinition,
) {
  const value = payloadSourceValue(payload, field);

  if (field.key === "actionButtons" && Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }

  if (
    field.key === "countryDailyStartTimes" ||
    field.key === "countryDailyEndTimes" ||
    field.key === "countryTimezones"
  ) {
    return serializeEventMap(value);
  }

  if (field.key === "date") {
    return payloadDateOnlyText(value);
  }

  if (field.kind === "array") {
    return payloadText(value);
  }

  if (field.kind === "timestamp") {
    return payloadDateText(value);
  }

  if (field.kind === "boolean") {
    return value === true ? "true" : value === false ? "false" : "";
  }

  if (field.kind === "integer") {
    return typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : stringFromPayload(value);
  }

  return stringFromPayload(value);
}

function emptyPayloadState(): FeedEntryPayloadsState {
  return Object.fromEntries(
    DISCOVER_FEED_TYPES.map((type) => [
      type,
      Object.fromEntries(
        discoverFeedTypeDefinition(type).fields.map((field) => [field.key, ""]),
      ),
    ]),
  ) as FeedEntryPayloadsState;
}

function payloadsFromItem(item?: DiscoverFeedItemRecord): FeedEntryPayloadsState {
  const payloads = emptyPayloadState();

  if (!item) {
    return payloads;
  }

  for (const type of DISCOVER_FEED_TYPES) {
    const payload = item[type] ?? {};

    for (const field of discoverFeedTypeDefinition(type).fields) {
      payloads[type][field.key] = payloadFieldText(payload, field);
    }
  }

  return payloads;
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
  return {
    publisherOrganizationId: item?.publisherOrganizationId ?? "",
    publisherIndividualId: item?.publisherIndividualId ?? "",
    type: item?.type ?? "news",
    language: item?.language ?? "en",
    title: item?.title ?? "",
    subtitle: item?.subtitle ?? "",
    body: item?.body ?? "",
    htmlBody: item?.htmlBody ?? "",
    imageUrl: item?.imageUrl ?? "",
    imageUploadDataUrl: item?.imageUploadDataUrl ?? "",
    imageUploadName: item?.imageUploadName ?? "",
    imageUploadMimeType: item?.imageUploadMimeType ?? "",
    sourceUrl: item?.sourceUrl ?? "",
    sourceButtonText: item?.sourceButtonText ?? "",
    payloads: payloadsFromItem(item),
  };
}

function payloadForType(state: FeedEntryFormState) {
  const values = state.payloads[state.type] ?? {};

  if (state.type === "upcoming_event") {
    const actionButtons = parseEventActionButtons(values.actionButtons ?? "")
      .filter((button) => button.type.trim() && button.url.trim())
      .map((button) => ({
        type: button.type.trim(),
        ...(button.title.trim() ? { title: button.title.trim() } : {}),
        url: button.url.trim(),
      }));
    const audience = selectedEventValues(values, "audience");
    const languages = selectedEventValues(values, "languages");
    const accessibilityFeatures = selectedEventValues(
      values,
      "accessibilityFeatures",
    );
    const countryDailyStartTimes = eventMapObject(
      values.countryDailyStartTimes ?? "",
    );
    const countryDailyEndTimes = eventMapObject(values.countryDailyEndTimes ?? "");
    const countryTimezones = eventMapObject(values.countryTimezones ?? "");

    return {
      date: fromDateInput(values.date ?? ""),
      location: eventStringValue(values, "location"),
      maxAttendance: eventIntegerValue(values, "maxAttendance"),
      ...(eventStringValue(values, "timeKind")
        ? { timeKind: eventStringValue(values, "timeKind") }
        : {}),
      ...(eventStringValue(values, "timezone")
        ? { timezone: eventStringValue(values, "timezone") }
        : {}),
      ...(eventStringValue(values, "dailyStartTime")
        ? { dailyStartTime: eventStringValue(values, "dailyStartTime") }
        : {}),
      ...(eventStringValue(values, "dailyEndTime")
        ? { dailyEndTime: eventStringValue(values, "dailyEndTime") }
        : {}),
      ...(eventStringValue(values, "multiDayLength")
        ? { multiDayLength: eventOptionalIntegerValue(values, "multiDayLength") }
        : {}),
      ...(countryDailyStartTimes ? { countryDailyStartTimes } : {}),
      ...(countryDailyEndTimes ? { countryDailyEndTimes } : {}),
      ...(countryTimezones ? { countryTimezones } : {}),
      ...(eventStringValue(values, "eventKind")
        ? { eventKind: eventStringValue(values, "eventKind") }
        : {}),
      ...(eventStringValue(values, "attendanceMode")
        ? { attendanceMode: eventStringValue(values, "attendanceMode") }
        : {}),
      ...(eventStringValue(values, "eventStatus")
        ? { eventStatus: eventStringValue(values, "eventStatus") }
        : {}),
      ...(actionButtons.length > 0 ? { actionButtons } : {}),
      ...(eventStringValue(values, "publisherRelationshipToEvent")
        ? {
            publisherRelationshipToEvent: eventStringValue(
              values,
              "publisherRelationshipToEvent",
            ),
          }
        : {}),
      ...(eventStringValue(values, "organizerName")
        ? { organizerName: eventStringValue(values, "organizerName") }
        : {}),
      ...(eventStringValue(values, "publisherDisclosure")
        ? {
            publisherDisclosure: eventStringValue(
              values,
              "publisherDisclosure",
            ),
          }
        : {}),
      ...(audience.length > 0 ? { audience } : {}),
      ...(eventStringValue(values, "costType")
        ? { costType: eventStringValue(values, "costType") }
        : {}),
      ...(eventStringValue(values, "currency")
        ? { currency: eventStringValue(values, "currency").toUpperCase() }
        : {}),
      ...(eventStringValue(values, "priceMinorUnits")
        ? { priceMinorUnits: eventOptionalIntegerValue(values, "priceMinorUnits") }
        : {}),
      ...(languages.length > 0 ? { languages } : {}),
      ...(accessibilityFeatures.length > 0 ? { accessibilityFeatures } : {}),
    };
  }

  return Object.fromEntries(
    discoverFeedTypeDefinition(state.type).fields.map((field) => {
      const value = values[field.key] ?? "";

      if (field.kind === "array") {
        return [field.key, lines(value)];
      }

      if (field.kind === "timestamp") {
        return [field.key, fromDateTimeInput(value)];
      }

      if (field.kind === "integer") {
        return [field.key, value ? Number(value) : null];
      }

      if (field.kind === "boolean") {
        return [field.key, value === "true" ? true : value === "false" ? false : null];
      }

      return [field.key, value.trim()];
    }),
  );
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
    htmlBody: state.htmlBody || null,
    imageUrl: state.imageUrl || null,
    imageUploadDataUrl:
      state.imageUploadDataUrl || (state.imageUrl.trim() ? null : undefined),
    imageUploadName: state.imageUploadName || undefined,
    imageUploadMimeType: state.imageUploadMimeType || undefined,
    sourceUrl: state.sourceUrl || null,
    sourceButtonText: state.sourceUrl ? state.sourceButtonText || null : null,
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
          className={`${publisherInputClass} pl-10`}
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
                  <Check aria-hidden="true" className="h-3.5 w-3.5 text-violet-700 dark:text-violet-200" />
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
            className={`${publisherInputClass} pl-10 font-medium uppercase tracking-[0.08em]`}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls={`${id}-country-picker`}
          className={`${publisherSoftButtonClass} h-11 justify-between rounded-xl px-4 sm:w-52`}
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
  routeBase = "/discover/feed-entries",
}: {
  feedItem?: DiscoverFeedItemRecord;
  mode?: "create" | "edit";
  initialOrganizations: DiscoverOrganizationRecord[];
  initialOrganizationsNextCursor: string | null;
  initialIndividuals?: DiscoverIndividualRecord[];
  initialIndividualsNextCursor?: string | null;
  scopedOrganizationId?: string;
  scopedIndividualId?: string;
  routeBase?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const richEditorRef = useRef<HTMLDivElement | null>(null);
  const coverImageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageUploadTokenRef = useRef(0);
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
    feedItem?.htmlBody ? "rich" : "plain",
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
  const [coverImageUploadPending, setCoverImageUploadPending] = useState(false);
  const [coverImageUploadDragging, setCoverImageUploadDragging] = useState(false);
  const [coverImageUploadStatus, setCoverImageUploadStatus] =
    useState<ImageUploadStatus | null>(null);
  const [publishDialog, setPublishDialog] = useState<PublishDialogState | null>(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [eventActionButtonsOpen, setEventActionButtonsOpen] = useState(false);
  const [eventRegionalTimesOpen, setEventRegionalTimesOpen] = useState(false);
  const [persistedState, setPersistedState] = useState<FeedEntryFormState | null>(null);
  const [publishedFeedItemId, setPublishedFeedItemId] = useState<string | null>(
    feedItem?.status === "published" ? feedItem.id : null,
  );
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
  const savedState = persistedState ?? sourceState;
  const selectedOrganization = organizations.find(
    (organization) => organization.id === state.publisherOrganizationId,
  );
  const selectedIndividual = individuals.find(
    (individual) => individual.id === state.publisherIndividualId,
  );
  const selectedPublisher = selectedOrganization ?? selectedIndividual;
  const changed = JSON.stringify(state) !== JSON.stringify(savedState);
  const bodyCharacterCount = bodyMode === "rich"
    ? htmlToPlainText(state.htmlBody).length
    : state.body.length;
  const sourceUrlError = sourceUrlErrorFor(state.sourceUrl);
  const imageUrlError = imageUrlErrorFor(state.imageUrl);
  const editStatus = feedItem?.status ?? "draft";
  const editPublishedAt = feedItem?.publishedAt ?? null;
  const isWorking = pending || deletePending || coverImageUploadPending;
  const canChangePublisher = !scopedOrganizationId && !scopedIndividualId;
  const hasMorePublishers = Boolean(
    (organizationsNextCursor || individualsNextCursor) && canChangePublisher,
  );
  const publisherSelectValue = state.publisherIndividualId
    ? `individual:${state.publisherIndividualId}`
    : state.publisherOrganizationId
      ? `organization:${state.publisherOrganizationId}`
      : "";
  const publishedAppUrl =
    !changed && publishedFeedItemId
      ? publicDiscoverFeedEntryUrl(publishedFeedItemId)
      : null;
  const coverImagePreviewSource = state.imageUrl.trim() || state.imageUploadDataUrl;
  const hasCoverImageUrl = Boolean(state.imageUrl.trim());
  const hasUploadedCoverImage = Boolean(state.imageUploadDataUrl);
  const hasChosenCoverImagePath = hasCoverImageUrl || hasUploadedCoverImage;
  const coverImageUploadLimitLabel = formatFileSize(
    FEED_COVER_IMAGE_UPLOAD_MAX_BYTES,
  );
  const uploadedCoverImageSummary = state.imageUploadName
    ? `${state.imageUploadName}${
        state.imageUploadMimeType ? ` · ${state.imageUploadMimeType}` : ""
      }`
    : t("Using uploaded image");
  const upcomingEventPayload = state.payloads.upcoming_event ?? {};
  const eventActionButtons = useMemo(
    () => parseEventActionButtons(upcomingEventPayload.actionButtons ?? ""),
    [upcomingEventPayload.actionButtons],
  );
  const eventRegionalRows = useMemo(
    () =>
      parseEventRegionalRows(
        upcomingEventPayload.countryDailyStartTimes ?? "",
        upcomingEventPayload.countryDailyEndTimes ?? "",
        upcomingEventPayload.countryTimezones ?? "",
      ),
    [
      upcomingEventPayload.countryDailyEndTimes,
      upcomingEventPayload.countryDailyStartTimes,
      upcomingEventPayload.countryTimezones,
    ],
  );

  useEffect(() => {
    setPersistedState(null);
    setPublishedFeedItemId(feedItem?.status === "published" ? feedItem.id : null);
  }, [feedItem?.id, feedItem?.status]);

  function updateState(patch: Partial<FeedEntryFormState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  function resetCoverImageUploadInput() {
    if (coverImageUploadInputRef.current) {
      coverImageUploadInputRef.current.value = "";
    }
  }

  function clearUploadedCoverImageSelection() {
    coverImageUploadTokenRef.current += 1;
    setCoverImageUploadPending(false);
    setCoverImageUploadDragging(false);
    setCoverImageUploadStatus(null);
    resetCoverImageUploadInput();
    updateState({
      imageUploadDataUrl: "",
      imageUploadName: "",
      imageUploadMimeType: "",
    });
  }

  function clearCoverImageUrlSelection() {
    updateState({ imageUrl: "" });
  }

  function handleCoverImageUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const imageUrl = event.target.value;
    const clearsUploadedImage = Boolean(imageUrl.trim());

    if (clearsUploadedImage) {
      coverImageUploadTokenRef.current += 1;
      setCoverImageUploadPending(false);
      setCoverImageUploadDragging(false);
      setCoverImageUploadStatus(null);
      resetCoverImageUploadInput();
    }

    updateState({
      imageUrl,
      ...(clearsUploadedImage
        ? {
            imageUploadDataUrl: "",
            imageUploadName: "",
            imageUploadMimeType: "",
          }
        : {}),
    });
  }

  async function handleCoverImageUploadFile(file: File | undefined | null) {
    if (!file) {
      return;
    }

    coverImageUploadTokenRef.current += 1;
    const token = coverImageUploadTokenRef.current;
    setCoverImageUploadPending(true);
    setCoverImageUploadDragging(false);
    setCoverImageUploadStatus({
      tone: "loading",
      message:
        file.size > FEED_COVER_IMAGE_UPLOAD_MAX_BYTES ||
        canResizeImagesInBrowser()
          ? t("Processing banner image...")
          : t("Loading image..."),
    });

    try {
      const processed = await processFeedCoverImageFile(file);
      if (coverImageUploadTokenRef.current !== token) {
        return;
      }

      updateState({
        imageUrl: "",
        imageUploadDataUrl: processed.dataUrl,
        imageUploadName: processed.name,
        imageUploadMimeType: processed.mimeType,
      });
      setCoverImageUploadStatus({
        tone: "success",
        message: processed.compressed
          ? t("Banner image processed and ready.")
          : t("Uploaded image ready."),
      });
    } catch (error) {
      if (coverImageUploadTokenRef.current !== token) {
        return;
      }

      const unsupported =
        error instanceof Error && error.message === "IMAGE_TYPE_UNSUPPORTED";
      setCoverImageUploadStatus(
        unsupported
          ? {
              tone: "error",
              message: t("Only PNG, JPG, or WebP images can be uploaded here."),
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
      if (coverImageUploadTokenRef.current === token) {
        setCoverImageUploadPending(false);
        resetCoverImageUploadInput();
      }
    }
  }

  function handleCoverImageUploadChange(event: ChangeEvent<HTMLInputElement>) {
    void handleCoverImageUploadFile(event.target.files?.[0]);
  }

  function handleCoverImageUploadDragEnter(
    event: DragEvent<HTMLLabelElement>,
  ) {
    event.preventDefault();
    if (!coverImageUploadPending && !hasCoverImageUrl) {
      setCoverImageUploadDragging(true);
    }
  }

  function handleCoverImageUploadDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!coverImageUploadPending && !hasCoverImageUrl) {
      setCoverImageUploadDragging(true);
    }
  }

  function handleCoverImageUploadDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setCoverImageUploadDragging(false);
  }

  function handleCoverImageUploadDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setCoverImageUploadDragging(false);
    if (coverImageUploadPending || hasCoverImageUrl) {
      return;
    }
    void handleCoverImageUploadFile(event.dataTransfer.files?.[0]);
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

  function updatePayloadField(
    type: DiscoverFeedType,
    fieldKey: string,
    value: string,
  ) {
    setState((current) => ({
      ...current,
      payloads: {
        ...current.payloads,
        [type]: {
          ...current.payloads[type],
          [fieldKey]: value,
        },
      },
    }));
  }

  function updateUpcomingEventField(fieldKey: string, value: string) {
    updatePayloadField("upcoming_event", fieldKey, value);
  }

  function updateEventActionButtons(buttons: EventActionButton[]) {
    updateUpcomingEventField(
      "actionButtons",
      serializeEventActionButtons(buttons),
    );
  }

  function updateEventRegionalRows(rows: EventRegionalTimeRow[]) {
    const serialized = serializeEventRegionalRows(rows);

    setState((current) => ({
      ...current,
      payloads: {
        ...current.payloads,
        upcoming_event: {
          ...current.payloads.upcoming_event,
          ...serialized,
        },
      },
    }));
  }

  function toggleEventValues(
    fieldKey: "audience" | "languages" | "accessibilityFeatures",
    value: string,
    checked: boolean,
  ) {
    const currentValues = selectedEventValues(upcomingEventPayload, fieldKey);
    const nextValues = checked
      ? Array.from(new Set([...currentValues, value]))
      : currentValues.filter((entry) => entry !== value);
    updateUpcomingEventField(fieldKey, serializeSelectedEventValues(nextValues));
  }

  function switchBodyMode(nextMode: BodyMode) {
    setBodyMode(nextMode);
    setState((current) => {
      if (nextMode === "rich") {
        const nextHtml = current.htmlBody || plainTextToHtml(current.body);
        window.requestAnimationFrame(() => {
          if (richEditorRef.current) {
            richEditorRef.current.innerHTML = nextHtml;
          }
        });
        return {
          ...current,
          htmlBody: nextHtml,
          body: htmlToPlainText(nextHtml),
        };
      }

      const nextBody = current.body || htmlToPlainText(current.htmlBody);
      return {
        ...current,
        body: nextBody,
        htmlBody: "",
      };
    });
  }

  function syncRichBody() {
    const html = richEditorRef.current?.innerHTML ?? "";
    updateState({
      htmlBody: html,
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
      : t("Main button link must be a valid HTTPS URL.");
  }

  function imageUrlErrorFor(value: string) {
    return isValidHttpsUrl(value)
      ? null
      : t("Cover image URL must be a valid HTTPS URL.");
  }

  function validate(nextState: FeedEntryFormState, status: DiscoverFeedStatus) {
    if (
      (nextState.publisherOrganizationId && nextState.publisherIndividualId) ||
      (!nextState.publisherOrganizationId && !nextState.publisherIndividualId)
    ) {
      return t("Choose one publisher.");
    }

    const nextSourceUrlError = sourceUrlErrorFor(nextState.sourceUrl);
    if (nextSourceUrlError) {
      return nextSourceUrlError;
    }

    const nextImageUrlError = imageUrlErrorFor(nextState.imageUrl);
    if (nextImageUrlError) {
      return nextImageUrlError;
    }

    if (nextState.type === "upcoming_event") {
      const eventPayloadError = validateUpcomingEventPayload(
        nextState.payloads.upcoming_event ?? {},
      );
      if (eventPayloadError) {
        return t(eventPayloadError);
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
      if (!nextState.body.trim() && !nextState.htmlBody.trim()) {
        return t("Body is required before publishing.");
      }
      if (nextState.type === "upcoming_event") {
        if (!nextState.payloads.upcoming_event.date) {
          return t("Event date is required before publishing.");
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
        setPersistedState(state);
        setPublishedFeedItemId(status === "published" ? response.feedItem.id : null);
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
      setPersistedState(state);
      setPublishedFeedItemId(status === "published" ? response.feedItem.id : null);
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
      router.push(`${routeBase}/${saved.id}`);
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
      router.push(routeBase);
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

  function renderEventNotice(
    tone: "info" | "warning",
    title: string,
    message: string,
  ) {
    const isWarning = tone === "warning";

    return (
      <div
        key={`${tone}-${title}`}
        className={[
          "flex gap-3 rounded-xl border px-3 py-3 text-sm leading-5",
          isWarning
            ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-400/24 dark:bg-amber-500/10 dark:text-amber-100"
            : "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-400/24 dark:bg-sky-500/10 dark:text-sky-100",
        ].join(" ")}
      >
        {isWarning ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div>
          <p className="font-semibold">{t(title)}</p>
          <p className="mt-0.5">{t(message)}</p>
        </div>
      </div>
    );
  }

  function renderEventSubsection({
    icon,
    title,
    description,
    children,
    badge,
  }: {
    icon: ReactNode;
    title: string;
    description: string;
    children: ReactNode;
    badge?: string;
  }) {
    return (
      <div className="rounded-xl border border-violet-100/80 bg-white/78 p-4 shadow-sm dark:border-violet-400/14 dark:bg-slate-950/32">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-400/16 dark:bg-violet-500/10 dark:text-violet-100">
              {icon}
            </div>
            <div className="min-w-0">
              <h4 className="font-heading text-base font-semibold text-foreground">
                {t(title)}
              </h4>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {t(description)}
              </p>
            </div>
          </div>
          {badge ? (
            <span className="inline-flex w-fit items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-500/12 dark:text-violet-100">
              {t(badge)}
            </span>
          ) : null}
        </div>
        {children}
      </div>
    );
  }

  function renderCollapsibleEventSubsection({
    icon,
    title,
    description,
    children,
  }: {
    icon: ReactNode;
    title: string;
    description: string;
    children: ReactNode;
  }) {
    return (
      <details className="group rounded-xl border border-violet-100/80 bg-white/78 p-4 shadow-sm dark:border-violet-400/14 dark:bg-slate-950/32">
        <summary className="flex cursor-pointer list-none items-start gap-3 outline-none transition-colors marker:hidden [&::-webkit-details-marker]:hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-400/16 dark:bg-violet-500/10 dark:text-violet-100">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-heading text-base font-semibold text-foreground">
              {t(title)}
            </h4>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t(description)}
            </p>
          </div>
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 border-t border-violet-100/70 pt-4 dark:border-violet-400/12">
          {children}
        </div>
      </details>
    );
  }

  function renderEventSelectField({
    fieldKey,
    label,
    options,
    placeholder = "Not specified",
  }: {
    fieldKey: string;
    label: string;
    options: readonly EventSelectOption[];
    placeholder?: string;
  }) {
    const fieldId = `discover-upcoming-event-${fieldKey}`;

    return (
      <FieldShell label={t(label)} htmlFor={fieldId}>
        <div className="relative">
          <select
            id={fieldId}
            value={upcomingEventPayload[fieldKey] ?? ""}
            onChange={(event) =>
              updateUpcomingEventField(fieldKey, event.target.value)
            }
            className={publisherSelectClass}
          >
            <option value="">{t(placeholder)}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <ChevronDown className={publisherSelectCaretClass} />
        </div>
        {options.find((option) => option.value === upcomingEventPayload[fieldKey])
          ?.description ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              options.find(
                (option) => option.value === upcomingEventPayload[fieldKey],
              )?.description ?? "",
            )}
          </p>
        ) : null}
      </FieldShell>
    );
  }

  function renderEventCheckboxGrid(
    fieldKey: "audience" | "languages" | "accessibilityFeatures",
    options: readonly EventSelectOption[],
  ) {
    const selectedValues = selectedEventValues(upcomingEventPayload, fieldKey);

    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checkboxId = `discover-upcoming-event-${fieldKey}-${option.value}`;

          return (
            <label
              key={option.value}
              htmlFor={checkboxId}
              className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-violet-100/70 bg-white/72 px-3 py-2 text-sm hover:bg-violet-50 dark:border-violet-400/12 dark:bg-slate-950/28 dark:hover:bg-violet-500/10"
            >
              <Checkbox
                id={checkboxId}
                checked={selectedValues.includes(option.value)}
                onCheckedChange={(checked) =>
                  toggleEventValues(fieldKey, option.value, checked === true)
                }
              />
              <span className="min-w-0 flex-1 truncate">{t(option.label)}</span>
            </label>
          );
        })}
      </div>
    );
  }

  function renderEventActionButtonsModal() {
    const buttonTypeCounts = eventActionButtons.reduce<Record<string, number>>(
      (counts, button) => ({
        ...counts,
        [button.type]: (counts[button.type] ?? 0) + 1,
      }),
      {},
    );

    function replaceButton(index: number, patch: Partial<EventActionButton>) {
      const nextButtons = [...eventActionButtons];
      nextButtons[index] = {
        ...(nextButtons[index] ?? { type: "", title: "", url: "" }),
        ...patch,
      };
      updateEventActionButtons(nextButtons);
    }

    return (
      <Dialog open={eventActionButtonsOpen} onOpenChange={setEventActionButtonsOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="font-heading text-xl font-semibold">
              {t("Event action buttons")}
            </DialogTitle>
            <DialogDescription>
              {t("Add event buttons for registration, live access, agendas, recordings, materials, or organizer contact.")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm leading-5 text-sky-950 dark:border-sky-400/24 dark:bg-sky-500/10 dark:text-sky-100">
              {t("Use these buttons when the event needs more than one clear next step, such as registration, agenda, materials, or contact.")}
            </div>

            <div className="flex flex-col gap-3">
              {eventActionButtons.length === 0 ? (
                <div className="rounded-xl border border-dashed border-violet-200 px-4 py-8 text-center text-sm text-muted-foreground dark:border-violet-400/20">
                  {t("No event action buttons configured.")}
                </div>
              ) : (
                eventActionButtons.map((button, index) => {
                  const duplicate = Boolean(
                    button.type && buttonTypeCounts[button.type] > 1,
                  );
                  const invalidUrl = !eventActionButtonUrlIsValid(button);

                  return (
                    <div
                      key={`${button.type}-${index}`}
                      className="rounded-xl border border-violet-100/80 bg-white/82 p-3 dark:border-violet-400/14 dark:bg-slate-950/38"
                    >
                      <div className="grid gap-3 md:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1fr)]">
                        <FieldShell
                          label={t("Action type")}
                          htmlFor={`event-action-type-${index}`}
                        >
                          <div className="relative">
                            <select
                              id={`event-action-type-${index}`}
                              value={button.type}
                              onChange={(event) => {
                                const type = event.target.value;
                                replaceButton(index, {
                                  type,
                                  title:
                                    button.title ||
                                    EVENT_ACTION_BUTTON_DEFAULT_TITLES[type] ||
                                    "",
                                });
                              }}
                              className={publisherSelectClass}
                            >
                              <option value="">{t("Choose type")}</option>
                              {EVENT_ACTION_BUTTON_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {t(option.label)}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className={publisherSelectCaretClass} />
                          </div>
                        </FieldShell>
                        <FieldShell
                          label={t("Button title")}
                          htmlFor={`event-action-title-${index}`}
                        >
                          <Input
                            id={`event-action-title-${index}`}
                            value={button.title}
                            maxLength={56}
                            onChange={(event) =>
                              replaceButton(index, { title: event.target.value })
                            }
                            className={publisherInputClass}
                          />
                        </FieldShell>
                        <FieldShell
                          label={t("Button URL")}
                          htmlFor={`event-action-url-${index}`}
                          error={invalidUrl ? t("Use HTTPS, or mailto for contact organizer.") : null}
                          className="md:col-span-2"
                        >
                          <Input
                            id={`event-action-url-${index}`}
                            type="url"
                            value={button.url}
                            onChange={(event) =>
                              replaceButton(index, { url: event.target.value })
                            }
                            placeholder={
                              button.type === "contactOrganizer"
                                ? "mailto:organizer@example.org"
                                : "https://"
                            }
                            className={`${publisherInputClass} ${invalidUrl ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          />
                        </FieldShell>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        {duplicate ? (
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-200">
                            {t("Use each action type only once.")}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {button.type === "join"
                              ? t("Use Join live only when the access link is ready to share with readers.")
                              : t("Keep each action focused so readers know exactly what to do next.")}
                          </p>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateEventActionButtons(
                              eventActionButtons.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          className={publisherSoftButtonClass}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("Remove")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                updateEventActionButtons([
                  ...eventActionButtons,
                  { type: "register", title: "Register", url: "" },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {t("Add action")}
            </Button>
            <Button type="button" onClick={() => setEventActionButtonsOpen(false)}>
              {t("Done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderEventRegionalTimesModal() {
    function replaceRow(index: number, patch: Partial<EventRegionalTimeRow>) {
      const nextRows = [...eventRegionalRows];
      nextRows[index] = {
        ...(nextRows[index] ?? {
          countryCode: "",
          startTime: "",
          endTime: "",
          timezone: "",
        }),
        ...patch,
      };
      updateEventRegionalRows(nextRows);
    }

    return (
      <Dialog open={eventRegionalTimesOpen} onOpenChange={setEventRegionalTimesOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="font-heading text-xl font-semibold">
              {t("Regional event times")}
            </DialogTitle>
            <DialogDescription>
              {t("Use two-letter country codes with local daily times when the same event is shown differently by region.")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-950 dark:border-amber-400/24 dark:bg-amber-500/10 dark:text-amber-100">
              {t("Use regional rows when the event time changes by country or timezone.")}
            </div>

            <div className="flex flex-col gap-3">
              {eventRegionalRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-violet-200 px-4 py-8 text-center text-sm text-muted-foreground dark:border-violet-400/20">
                  {t("No regional times configured.")}
                </div>
              ) : (
                eventRegionalRows.map((row, index) => {
                  const invalidCountry =
                    row.countryCode.trim() && !isValidIsoCountryCode(row.countryCode);
                  const invalidStart =
                    row.startTime.trim() && !isValidTimeOfDay(row.startTime);
                  const invalidEnd = row.endTime.trim() && !isValidTimeOfDay(row.endTime);
                  const invalidTimezone =
                    row.timezone.trim() && !isValidIanaTimezone(row.timezone);

                  return (
                    <div
                      key={`${row.countryCode}-${index}`}
                      className="rounded-xl border border-violet-100/80 bg-white/82 p-3 dark:border-violet-400/14 dark:bg-slate-950/38"
                    >
                      <div className="grid gap-3 md:grid-cols-[7rem_1fr_1fr_minmax(12rem,1.2fr)]">
                        <FieldShell
                          label={t("Country")}
                          htmlFor={`event-region-country-${index}`}
                          error={invalidCountry ? t("Use two letters.") : null}
                        >
                          <Input
                            id={`event-region-country-${index}`}
                            value={row.countryCode}
                            maxLength={2}
                            onChange={(event) =>
                              replaceRow(index, {
                                countryCode: normalizeEventCountryCode(
                                  event.target.value,
                                ),
                              })
                            }
                            placeholder="AR"
                            className={`${publisherInputClass} uppercase ${invalidCountry ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          />
                        </FieldShell>
                        <FieldShell
                          label={t("Start time")}
                          htmlFor={`event-region-start-${index}`}
                          error={invalidStart ? t("Use HH:mm.") : null}
                        >
                          <Input
                            id={`event-region-start-${index}`}
                            type="time"
                            value={row.startTime}
                            onChange={(event) =>
                              replaceRow(index, { startTime: event.target.value })
                            }
                            className={`${publisherInputClass} ${invalidStart ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          />
                        </FieldShell>
                        <FieldShell
                          label={t("End time")}
                          htmlFor={`event-region-end-${index}`}
                          error={invalidEnd ? t("Use HH:mm.") : null}
                        >
                          <Input
                            id={`event-region-end-${index}`}
                            type="time"
                            value={row.endTime}
                            onChange={(event) =>
                              replaceRow(index, { endTime: event.target.value })
                            }
                            className={`${publisherInputClass} ${invalidEnd ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          />
                        </FieldShell>
                        <FieldShell
                          label={t("Timezone")}
                          htmlFor={`event-region-timezone-${index}`}
                          error={invalidTimezone ? t("Use an IANA timezone.") : null}
                        >
                          <Input
                            id={`event-region-timezone-${index}`}
                            list="discover-event-timezone-options"
                            value={row.timezone}
                            onChange={(event) =>
                              replaceRow(index, { timezone: event.target.value })
                            }
                            placeholder="America/Argentina/Buenos_Aires"
                            className={`${publisherInputClass} ${invalidTimezone ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          />
                        </FieldShell>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateEventRegionalRows(
                              eventRegionalRows.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          className={publisherSoftButtonClass}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("Remove")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                updateEventRegionalRows([
                  ...eventRegionalRows,
                  {
                    countryCode: "AR",
                    startTime: "",
                    endTime: "",
                    timezone:
                      upcomingEventPayload.timezone ||
                      "America/Argentina/Buenos_Aires",
                  },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {t("Add region")}
            </Button>
            <Button type="button" onClick={() => setEventRegionalTimesOpen(false)}>
              {t("Done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderUpcomingEventFields() {
    const timeKind = eventStringValue(upcomingEventPayload, "timeKind");
    const costType = eventStringValue(upcomingEventPayload, "costType");
    const hasDailyTimes = Boolean(
      upcomingEventPayload.dailyStartTime || upcomingEventPayload.dailyEndTime,
    );
    const selectedAudience = selectedEventValues(upcomingEventPayload, "audience");
    const selectedLanguages = selectedEventValues(upcomingEventPayload, "languages");
    const selectedAccessibility = selectedEventValues(
      upcomingEventPayload,
      "accessibilityFeatures",
    );
    const eventNotices: ReactNode[] = [
      renderEventNotice(
        "info",
        "Event date",
        "The event date is required and sets the starting day for multi-day events.",
      ),
      state.sourceUrl.trim()
        ? renderEventNotice(
            "info",
            "Main event link",
            "The main button can stay as the primary event link. Optional actions can add more specific next steps.",
          )
        : null,
      timeKind === "allDay" && hasDailyTimes
        ? renderEventNotice(
            "warning",
            "All-day event",
            "For all-day events, readers see the date without daily start or end times.",
          )
        : null,
      timeKind === "dateOnly" && hasDailyTimes
        ? renderEventNotice(
            "warning",
            "Date-only event",
            "Date-only events should be published without a time row, even if daily times are filled.",
          )
        : null,
      timeKind === "timeTba"
        ? renderEventNotice(
            "info",
            "Time pending",
            "Use this when the date is known but the time is not ready to publish.",
          )
        : null,
      timeKind === "regionalTimes" && eventRegionalRows.length === 0
        ? renderEventNotice(
            "warning",
            "Regional rows missing",
            "Regional times is selected, but no country-specific rows have been configured yet.",
          )
        : null,
      costType === "free" &&
      (upcomingEventPayload.currency || upcomingEventPayload.priceMinorUnits)
        ? renderEventNotice(
            "warning",
            "Free event with price fields",
            "Currency and price are not shown when cost type is Free.",
          )
        : null,
      costType === "paid" && !upcomingEventPayload.priceMinorUnits
        ? renderEventNotice(
            "info",
            "Paid event",
            "Add price and currency when the public cost is known.",
          )
        : null,
      eventActionButtons.some((button) => button.type === "join")
        ? renderEventNotice(
            "info",
            "Join live action",
            "Use Join live only when the access link is ready to share with readers.",
          )
        : null,
    ].filter(Boolean);

    return (
      <div className="flex flex-col gap-4">
        <datalist id="discover-event-timezone-options">
          {EVENT_TIMEZONE_OPTIONS.map((timezone) => (
            <option key={timezone} value={timezone} />
          ))}
        </datalist>
        <div className="grid gap-3">{eventNotices}</div>

        {renderEventSubsection({
          icon: <CalendarDays className="h-4 w-4" />,
          title: "Core event details",
          description:
            "Only this block contains the required event field. Event date is required; location and max attendance remain optional.",
          badge: "Required block",
          children: (
            <div className="grid gap-4 md:grid-cols-3">
              <FieldShell
                label={`${t("Event date")} *`}
                htmlFor="discover-upcoming-event-date"
              >
                <Input
                  id="discover-upcoming-event-date"
                  type="date"
                  value={upcomingEventPayload.date ?? ""}
                  onChange={(event) =>
                    updateUpcomingEventField("date", event.target.value)
                  }
                  className={publisherInputClass}
                />
              </FieldShell>
              <FieldShell label={t("Location")} htmlFor="discover-upcoming-event-location">
                <LocationSuggestInput
                  id="discover-upcoming-event-location"
                  value={upcomingEventPayload.location ?? ""}
                  onChange={(nextValue) =>
                    updateUpcomingEventField("location", nextValue)
                  }
                  t={t}
                />
              </FieldShell>
              <FieldShell
                label={t("Max attendance")}
                htmlFor="discover-upcoming-event-max-attendance"
              >
                <Input
                  id="discover-upcoming-event-max-attendance"
                  type="number"
                  min={1}
                  step={1}
                  value={upcomingEventPayload.maxAttendance ?? ""}
                  onChange={(event) =>
                    updateUpcomingEventField("maxAttendance", event.target.value)
                  }
                  className={publisherInputClass}
                />
              </FieldShell>
            </div>
          ),
        })}

        <section className="rounded-2xl border border-violet-100/80 bg-violet-50/36 p-4 dark:border-violet-400/14 dark:bg-violet-500/6">
          <div className="mb-4 flex flex-col gap-1">
            <h4 className="font-heading text-base font-semibold text-foreground">
              {t("Advanced event configuration (optional)")}
            </h4>
            <p className="text-sm leading-5 text-muted-foreground">
              {t("The following event blocks are optional. They start collapsed and can be expanded when you need to add more detail.")}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {renderCollapsibleEventSubsection({
              icon: <Clock className="h-4 w-4" />,
              title: "Schedule display",
              description:
                "Add optional schedule details when the event needs times, timezone, duration, or country-specific hours.",
              children: (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {renderEventSelectField({
                      fieldKey: "timeKind",
                      label: "Time display",
                      options: EVENT_TIME_KIND_OPTIONS,
                    })}
                    <FieldShell label={t("Timezone")} htmlFor="discover-upcoming-event-timezone">
                      <Input
                        id="discover-upcoming-event-timezone"
                        list="discover-event-timezone-options"
                        value={upcomingEventPayload.timezone ?? ""}
                        onChange={(event) =>
                          updateUpcomingEventField("timezone", event.target.value)
                        }
                        placeholder="America/Argentina/Buenos_Aires"
                        className={publisherInputClass}
                      />
                    </FieldShell>
                    <FieldShell
                      label={t("Daily start time")}
                      htmlFor="discover-upcoming-event-daily-start"
                    >
                      <Input
                        id="discover-upcoming-event-daily-start"
                        type="time"
                        value={upcomingEventPayload.dailyStartTime ?? ""}
                        onChange={(event) =>
                          updateUpcomingEventField("dailyStartTime", event.target.value)
                        }
                        className={publisherInputClass}
                      />
                    </FieldShell>
                    <FieldShell
                      label={t("Daily end time")}
                      htmlFor="discover-upcoming-event-daily-end"
                    >
                      <Input
                        id="discover-upcoming-event-daily-end"
                        type="time"
                        value={upcomingEventPayload.dailyEndTime ?? ""}
                        onChange={(event) =>
                          updateUpcomingEventField("dailyEndTime", event.target.value)
                        }
                        className={publisherInputClass}
                      />
                    </FieldShell>
                    <FieldShell
                      label={t("Multi-day length")}
                      htmlFor="discover-upcoming-event-multi-day-length"
                    >
                      <Input
                        id="discover-upcoming-event-multi-day-length"
                        type="number"
                        min={1}
                        max={365}
                        step={1}
                        value={upcomingEventPayload.multiDayLength ?? ""}
                        onChange={(event) =>
                          updateUpcomingEventField("multiDayLength", event.target.value)
                        }
                        className={publisherInputClass}
                      />
                    </FieldShell>
                    <div className="flex flex-col justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEventRegionalTimesOpen(true)}
                        className={`${publisherSoftButtonClass} h-11 justify-center`}
                      >
                        <Settings2 className="h-4 w-4" />
                        {t("Configure regional times")}
                      </Button>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {eventRegionalRows.length
                          ? `${eventRegionalRows.length} ${t("regional rows configured")}`
                          : t("No regional times configured.")}
                      </p>
                    </div>
                  </div>
                </div>
              ),
            })}

            {renderCollapsibleEventSubsection({
              icon: <Newspaper className="h-4 w-4" />,
              title: "Classification",
              description:
                "Add optional labels that help readers understand the event format, type, and status.",
              children: (
                <div className="grid gap-4 md:grid-cols-3">
                  {renderEventSelectField({
                    fieldKey: "eventKind",
                    label: "Event kind",
                    options: EVENT_KIND_OPTIONS,
                  })}
                  {renderEventSelectField({
                    fieldKey: "attendanceMode",
                    label: "Attendance mode",
                    options: EVENT_ATTENDANCE_MODE_OPTIONS,
                  })}
                  {renderEventSelectField({
                    fieldKey: "eventStatus",
                    label: "Event status",
                    options: EVENT_STATUS_OPTIONS,
                  })}
                </div>
              ),
            })}

            {renderCollapsibleEventSubsection({
              icon: <LinkIcon className="h-4 w-4" />,
              title: "Event actions",
              description:
                "Add optional buttons for registration, live access, agenda, recordings, materials, or organizer contact.",
              children: (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100/70 bg-white/70 px-4 py-3 dark:border-violet-400/12 dark:bg-slate-950/28">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {eventActionButtons.length
                          ? `${eventActionButtons.length} ${t("actions configured")}`
                          : t("No event action buttons configured.")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {eventActionButtons.length
                          ? eventActionButtons
                              .map((button) =>
                                t(
                                  EVENT_ACTION_BUTTON_TYPE_OPTIONS.find(
                                    (option) => option.value === button.type,
                                  )?.label ?? button.type,
                                ),
                              )
                              .join(", ")
                          : t("Add specific event actions when the event has more than one next step.")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEventActionButtonsOpen(true)}
                      className={publisherSoftButtonClass}
                    >
                      <Settings2 className="h-4 w-4" />
                      {t("Configure actions")}
                    </Button>
                  </div>
                </div>
              ),
            })}

            {renderCollapsibleEventSubsection({
              icon: <Users className="h-4 w-4" />,
              title: "Organizer and disclosure",
              description:
                "Clarify who organizes the event and how the publisher is involved.",
              children: (
                <div className="grid gap-4 md:grid-cols-2">
                  {renderEventSelectField({
                    fieldKey: "publisherRelationshipToEvent",
                    label: "Publisher relationship",
                    options: EVENT_RELATIONSHIP_OPTIONS,
                  })}
                  <FieldShell
                    label={t("Organizer name")}
                    htmlFor="discover-upcoming-event-organizer-name"
                  >
                    <Input
                      id="discover-upcoming-event-organizer-name"
                      value={upcomingEventPayload.organizerName ?? ""}
                      maxLength={80}
                      onChange={(event) =>
                        updateUpcomingEventField("organizerName", event.target.value)
                      }
                      className={publisherInputClass}
                    />
                  </FieldShell>
                  <FieldShell
                    label={t("Publisher disclosure")}
                    htmlFor="discover-upcoming-event-publisher-disclosure"
                    className="md:col-span-2"
                  >
                    <Textarea
                      id="discover-upcoming-event-publisher-disclosure"
                      value={upcomingEventPayload.publisherDisclosure ?? ""}
                      maxLength={140}
                      onChange={(event) =>
                        updateUpcomingEventField(
                          "publisherDisclosure",
                          event.target.value,
                        )
                      }
                      className={publisherTextareaClass}
                      rows={2}
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t("Use this note for transparent sponsorship, partnership, speaker, or participation context.")}
                    </p>
                  </FieldShell>
                </div>
              ),
            })}

            {renderCollapsibleEventSubsection({
              icon: <DollarSign className="h-4 w-4" />,
              title: "Audience, cost, language, accessibility",
              description:
                "Use optional metadata to clarify who the event is for and what support is available.",
              children: (
                <div className="flex flex-col gap-5">
                  <div>
                    <Label className="mb-2 block">{t("Audience")}</Label>
                    {renderEventCheckboxGrid("audience", EVENT_AUDIENCE_OPTIONS)}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {selectedAudience.length
                        ? `${selectedAudience.length} ${t("audience groups selected")}`
                        : t("No audience groups selected.")}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {renderEventSelectField({
                      fieldKey: "costType",
                      label: "Cost type",
                      options: EVENT_COST_TYPE_OPTIONS,
                    })}
                    <FieldShell label={t("Currency")} htmlFor="discover-upcoming-event-currency">
                      <Input
                        id="discover-upcoming-event-currency"
                        value={upcomingEventPayload.currency ?? ""}
                        maxLength={3}
                        onChange={(event) =>
                          updateUpcomingEventField(
                            "currency",
                            event.target.value.toUpperCase(),
                          )
                        }
                        placeholder="ARS"
                        className={`${publisherInputClass} uppercase`}
                      />
                    </FieldShell>
                    <FieldShell
                      label={t("Price in minor units")}
                      htmlFor="discover-upcoming-event-price-minor-units"
                    >
                      <Input
                        id="discover-upcoming-event-price-minor-units"
                        type="number"
                        min={0}
                        step={1}
                        value={upcomingEventPayload.priceMinorUnits ?? ""}
                        onChange={(event) =>
                          updateUpcomingEventField(
                            "priceMinorUnits",
                            event.target.value,
                          )
                        }
                        className={publisherInputClass}
                      />
                    </FieldShell>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block">{t("Languages")}</Label>
                      {renderEventCheckboxGrid("languages", EVENT_LANGUAGE_OPTIONS)}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {selectedLanguages.length
                          ? `${selectedLanguages.length} ${t("languages selected")}`
                          : t("No languages selected.")}
                      </p>
                    </div>
                    <div>
                      <Label className="mb-2 block">
                        {t("Accessibility features")}
                      </Label>
                      {renderEventCheckboxGrid(
                        "accessibilityFeatures",
                        EVENT_ACCESSIBILITY_OPTIONS,
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {selectedAccessibility.length
                          ? `${selectedAccessibility.length} ${t("accessibility features selected")}`
                          : t("No accessibility features selected.")}
                      </p>
                    </div>
                  </div>
                </div>
              ),
            })}
          </div>
        </section>

        {renderEventActionButtonsModal()}
        {renderEventRegionalTimesModal()}
      </div>
    );
  }

  function renderSpecificFields() {
    if (state.type === "upcoming_event") {
      return renderUpcomingEventFields();
    }

    const definition = discoverFeedTypeDefinition(state.type);
    const payload = state.payloads[state.type] ?? {};

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {definition.fields.map((field) => {
          const fieldId = `discover-${state.type}-${field.key}`.replace(/_/g, "-");
          const value = payload[field.key] ?? "";
          const label = `${t(field.label)}${field.required ? " *" : ""}`;
          const wide =
            field.kind === "array" ||
            field.control === "textarea" ||
            field.key.includes("summary") ||
            field.key.includes("goal") ||
            field.key.includes("warning");

          if (field.control === "region") {
            return (
              <FieldShell
                key={field.key}
                label={label}
                htmlFor={fieldId}
              >
                <CountryRegionPicker
                  id={fieldId}
                  value={value}
                  onChange={(region) =>
                    updatePayloadField(state.type, field.key, region)
                  }
                  language={language}
                  t={t}
                />
              </FieldShell>
            );
          }

          if (field.control === "location") {
            return (
              <FieldShell
                key={field.key}
                label={label}
                htmlFor={fieldId}
              >
                <LocationSuggestInput
                  id={fieldId}
                  value={value}
                  onChange={(nextValue) =>
                    updatePayloadField(state.type, field.key, nextValue)
                  }
                  t={t}
                />
              </FieldShell>
            );
          }

          if (field.kind === "array") {
            return (
              <FieldShell
                key={field.key}
                label={label}
                htmlFor={fieldId}
                className="md:col-span-2"
              >
                <Textarea
                  id={fieldId}
                  value={value}
                  onChange={(event) =>
                    updatePayloadField(state.type, field.key, event.target.value)
                  }
                  placeholder={t("One per line or comma-separated")}
                  className={publisherTextareaClass}
                  rows={3}
                />
              </FieldShell>
            );
          }

          if (field.kind === "timestamp") {
            return (
              <FieldShell key={field.key} label={label} htmlFor={fieldId}>
                <Input
                  id={fieldId}
                  type="datetime-local"
                  value={value}
                  onChange={(event) =>
                    updatePayloadField(state.type, field.key, event.target.value)
                  }
                  className={publisherInputClass}
                />
              </FieldShell>
            );
          }

          if (field.kind === "integer") {
            return (
              <FieldShell key={field.key} label={label} htmlFor={fieldId}>
                <Input
                  id={fieldId}
                  type="number"
                  min={1}
                  step={1}
                  value={value}
                  onChange={(event) =>
                    updatePayloadField(state.type, field.key, event.target.value)
                  }
                  className={publisherInputClass}
                />
              </FieldShell>
            );
          }

          if (field.kind === "boolean") {
            return (
              <FieldShell key={field.key} label={label} htmlFor={fieldId}>
                <div className="relative">
                  <select
                    id={fieldId}
                    value={value}
                    onChange={(event) =>
                      updatePayloadField(state.type, field.key, event.target.value)
                    }
                    className={publisherSelectClass}
                  >
                    <option value="">{t("Not specified")}</option>
                    <option value="true">{t("Yes")}</option>
                    <option value="false">{t("No")}</option>
                  </select>
                  <ChevronDown className={publisherSelectCaretClass} />
                </div>
              </FieldShell>
            );
          }

          return (
            <FieldShell
              key={field.key}
              label={label}
              htmlFor={fieldId}
              className={wide ? "md:col-span-2" : ""}
            >
              {field.control === "textarea" ? (
                <Textarea
                  id={fieldId}
                  value={value}
                  onChange={(event) =>
                    updatePayloadField(state.type, field.key, event.target.value)
                  }
                  className={publisherTextareaClass}
                  rows={3}
                />
              ) : (
                <Input
                  id={fieldId}
                  value={value}
                  onChange={(event) =>
                    updatePayloadField(state.type, field.key, event.target.value)
                  }
                  className={publisherInputClass}
                />
              )}
            </FieldShell>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-9 rounded-xl text-violet-800 hover:bg-violet-100 hover:text-violet-950 dark:text-violet-100 dark:hover:bg-violet-500/14"
        >
          <Link href={routeBase}>
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("Back to feed entries")}
          </Link>
        </Button>
        {feedItem ? (
          <span className="font-mono text-xs text-muted-foreground">{feedItem.id}</span>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-2xl border border-violet-100/80 bg-white/92 shadow-[0_22px_62px_-46px_rgba(109,40,217,0.46)] dark:border-violet-400/16 dark:bg-slate-950/50">
        <div className="border-b border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.90)_54%,rgba(240,249,255,0.72))] px-5 py-4 dark:border-violet-400/14 dark:bg-[linear-gradient(145deg,rgba(30,24,57,0.94),rgba(12,35,54,0.68))]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-100 text-violet-700 shadow-inner dark:border-violet-400/20 dark:bg-violet-500/14 dark:text-violet-100">
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
                onClick={() => setState(savedState)}
                disabled={!changed || isWorking}
                className={publisherSoftButtonClass}
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
                  className={publisherSoftButtonClass}
                >
                  <Save className="h-3.5 w-3.5" />
                  {t("Save draft")}
                </Button>
              ) : null}
              {mode === "edit" && feedItem ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isWorking}
                      className="h-9 rounded-xl"
                    >
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
                    <div className="relative min-w-0 flex-1">
                      <select
                        id="discover-feed-publisher"
                        value={publisherSelectValue}
                        onChange={(event) =>
                          selectPublisher(event.target.value)
                        }
                        className={publisherSelectClass}
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
                      <ChevronDown className={publisherSelectCaretClass} />
                    </div>
                    {hasMorePublishers ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadMoreOrganizations()}
                        disabled={pending}
                        className={publisherSoftButtonClass}
                      >
                        {t("Load more publishers")}
                      </Button>
                    ) : null}
                  </div>
                </FieldShell>

                <FieldShell label={t("Type")} htmlFor="discover-feed-type">
                  <div className="relative">
                    <select
                      id="discover-feed-type"
                      value={state.type}
                      onChange={(event) =>
                        updateState({ type: event.target.value as DiscoverFeedType })
                      }
                      className={publisherSelectClass}
                    >
                      {DISCOVER_FEED_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.label)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className={publisherSelectCaretClass} />
                  </div>
                </FieldShell>

                <FieldShell label={t("Language")} htmlFor="discover-feed-language">
                  <div className="relative">
                    <select
                      id="discover-feed-language"
                      value={state.language}
                      onChange={(event) =>
                        updateState({ language: event.target.value as "en" | "es" })
                      }
                      className={publisherSelectClass}
                    >
                      <option value="en">{t("English")}</option>
                      <option value="es">{t("Spanish")}</option>
                    </select>
                    <ChevronDown className={publisherSelectCaretClass} />
                  </div>
                </FieldShell>

                <FieldShell label={t("Title")} htmlFor="discover-feed-title" className="md:col-span-2">
                  <Input
                    id="discover-feed-title"
                    value={state.title}
                    onChange={(event) => updateState({ title: event.target.value })}
                    className={`${publisherInputClass} h-12 text-base`}
                  />
                </FieldShell>

                <FieldShell label={t("Subtitle")} htmlFor="discover-feed-subtitle" className="md:col-span-2">
                  <Textarea
                    id="discover-feed-subtitle"
                    value={state.subtitle}
                    onChange={(event) => updateState({ subtitle: event.target.value })}
                    rows={3}
                    className={`${publisherTextareaClass} text-base`}
                  />
                </FieldShell>

                <div className="md:col-span-2">
                  <div className="rounded-2xl border border-violet-100/80 bg-white/74 p-4 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/30">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-400/16 dark:bg-violet-500/10 dark:text-violet-100">
                          <ImageIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">
                            {t("Cover image")}
                          </div>
                          <p
                            id="discover-feed-image-guidance"
                            className="mt-1 text-xs leading-5 text-muted-foreground"
                          >
                            {t("Use an image URL or upload a PNG, JPG, or WebP file. Large files are compressed before saving.")}{" "}
                            {t("Recommended size: 1024 x 500 px, high quality, with no important text or faces close to the edges.")}{" "}
                            <a
                              href="https://goldencrowvs.com/pocket-genes/banner.png"
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-violet-700 underline underline-offset-2 hover:text-violet-900 dark:text-violet-200 dark:hover:text-violet-100"
                            >
                              See example
                            </a>
                          </p>
                        </div>
                      </div>
                      {hasUploadedCoverImage ? (
                        <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200">
                          {t("Using uploaded image")}
                        </span>
                      ) : null}
                    </div>

                    <div
                      className={cn(
                        "grid gap-3",
                        hasChosenCoverImagePath
                          ? "lg:grid-cols-1"
                          : "lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.8fr)]",
                      )}
                    >
                      {!hasUploadedCoverImage ? (
                        <FieldShell
                          label={t("Image URL")}
                          htmlFor="discover-feed-image"
                          error={imageUrlError}
                        >
                          <div className="relative">
                            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="discover-feed-image"
                              type="url"
                              value={state.imageUrl}
                              onChange={handleCoverImageUrlChange}
                              placeholder="https://"
                              disabled={coverImageUploadPending}
                              aria-invalid={Boolean(imageUrlError)}
                              aria-describedby={
                                imageUrlError
                                  ? "discover-feed-image-guidance discover-feed-image-error"
                                  : "discover-feed-image-guidance"
                              }
                              className={cn(
                                publisherInputClass,
                                "pl-10",
                                hasCoverImageUrl && "pr-24",
                                imageUrlError &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            />
                            {hasCoverImageUrl ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={clearCoverImageUrlSelection}
                                disabled={pending || coverImageUploadPending}
                                aria-label={t("Clear image URL")}
                                className="absolute right-1 top-1/2 h-8 -translate-y-1/2 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                {t("Clear")}
                              </Button>
                            ) : null}
                          </div>
                        </FieldShell>
                      ) : null}

                      {!hasCoverImageUrl ? (
                        <label
                          htmlFor="discover-feed-image-upload"
                          onDragEnter={handleCoverImageUploadDragEnter}
                          onDragOver={handleCoverImageUploadDragOver}
                          onDragLeave={handleCoverImageUploadDragLeave}
                          onDrop={handleCoverImageUploadDrop}
                          className={cn(
                            "relative flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition duration-200",
                            coverImageUploadDragging
                              ? "border-violet-500 bg-violet-50 shadow-[0_16px_34px_rgba(109,40,217,0.16)] dark:bg-violet-500/12"
                              : "border-violet-300/80 bg-violet-50/45 hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-50 dark:border-violet-400/35 dark:bg-violet-500/8",
                            coverImageUploadPending && "cursor-progress opacity-80",
                          )}
                        >
                          <input
                            ref={coverImageUploadInputRef}
                            id="discover-feed-image-upload"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleCoverImageUploadChange}
                            disabled={coverImageUploadPending}
                            aria-label={t("Upload image file")}
                            className="sr-only"
                          />
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background text-violet-700 shadow-sm dark:bg-background/80 dark:text-violet-200">
                            {coverImageUploadPending ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <UploadCloud className="h-5 w-5" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground">
                              {hasUploadedCoverImage
                                ? t("Replace uploaded image")
                                : t("Upload image file")}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {coverImageUploadDragging
                                ? t("Drop image to upload")
                                : t(
                                    "PNG, JPG, or WebP up to 600 KB. Drop it here or choose a file.",
                                  ).replace("600 KB", coverImageUploadLimitLabel)}
                            </span>
                          </span>
                        </label>
                      ) : null}
                    </div>

                    {hasUploadedCoverImage ? (
                      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/55 px-3 py-2 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100">
                        <span className="min-w-0 truncate">
                          {uploadedCoverImageSummary}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearUploadedCoverImageSelection}
                          disabled={pending || coverImageUploadPending}
                          className="w-fit text-emerald-900 hover:bg-emerald-100 hover:text-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-500/15"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {t("Remove uploaded image")}
                        </Button>
                      </div>
                    ) : null}

                    {coverImageUploadStatus ? (
                      <div
                        className={cn(
                          "mt-3 rounded-lg border px-3 py-2 text-sm",
                          coverImageUploadStatus.tone === "success" &&
                            "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100",
                          coverImageUploadStatus.tone === "loading" &&
                            "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-100",
                          coverImageUploadStatus.tone === "warning" &&
                            "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100",
                          coverImageUploadStatus.tone === "error" &&
                            "border-destructive/30 bg-destructive/10 text-destructive",
                        )}
                      >
                        {coverImageUploadStatus.message}
                        {coverImageUploadStatus.href ? (
                          <>
                            {" "}
                            <a
                              href={coverImageUploadStatus.href}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold underline underline-offset-2"
                            >
                              {coverImageUploadStatus.linkLabel}
                            </a>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className={publisherFieldSectionClass}>
              <SectionTitle eyebrow={t("Body")} title={t("Write the note")}>
                <div className="inline-flex rounded-xl border border-violet-100/80 bg-white/78 p-1 shadow-sm dark:border-violet-400/16 dark:bg-violet-500/8">
                  {(["plain", "rich"] as BodyMode[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => switchBodyMode(option)}
                      className={[
                        "inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-medium transition-colors",
                        bodyMode === option
                          ? "bg-violet-600 text-white shadow-sm"
                          : "text-muted-foreground hover:bg-violet-50 hover:text-foreground dark:hover:bg-violet-500/10",
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
                  className={`${publisherTextareaClass} min-h-[24rem] resize-y text-base leading-7`}
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-violet-200/75 bg-white shadow-sm dark:border-violet-400/18 dark:bg-slate-950/45">
                  <div className="flex flex-wrap gap-1 border-b border-violet-100/80 bg-violet-50/55 px-2 py-2 dark:border-violet-400/14 dark:bg-violet-500/8">
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
                    className="min-h-[24rem] px-5 py-4 text-base leading-7 outline-none prose-headings:font-heading [&_a]:text-violet-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-violet-300 [&_blockquote]:pl-4 [&_h2]:mb-3 [&_h2]:mt-5 [&_li]:ml-5 [&_ul]:list-disc"
                    dangerouslySetInnerHTML={{
                      __html: state.htmlBody || plainTextToHtml(state.body),
                    }}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{bodyCharacterCount.toLocaleString()} {t("characters")}</span>
                <span>{bodyMode === "rich" ? t("HTML will be sanitized before storage.") : t("Plain body will be stored as body.")}</span>
              </div>
            </section>

            <section className={publisherFieldSectionClass}>
              <SectionTitle
                eyebrow={t("Main button")}
                title={t("Main note button customization")}
              />

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.72fr)]">
                <FieldShell
                  label={t("Main button link")}
                  htmlFor="discover-feed-source"
                  error={sourceUrlError}
                >
                  <Input
                    id="discover-feed-source"
                    type="url"
                    value={state.sourceUrl}
                    onChange={(event) => {
                      const sourceUrl = event.target.value;
                      updateState({
                        sourceUrl: sourceUrl,
                        sourceButtonText: sourceUrl.trim()
                          ? state.sourceButtonText
                          : "",
                      });
                    }}
                    placeholder="https://"
                    aria-invalid={Boolean(sourceUrlError)}
                    aria-describedby={
                      sourceUrlError ? "discover-feed-source-error" : undefined
                    }
                    className={`${publisherInputClass} ${sourceUrlError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                </FieldShell>

                <FieldShell
                  label={t("Main button text")}
                  htmlFor="discover-feed-source-button-text"
                >
                  <Input
                    id="discover-feed-source-button-text"
                    value={state.sourceButtonText}
                    onChange={(event) =>
                      updateState({ sourceButtonText: event.target.value })
                    }
                    placeholder={t("Open organizer website")}
                    disabled={!state.sourceUrl.trim()}
                    className={publisherInputClass}
                  />
                </FieldShell>
              </div>
            </section>

            <section className={publisherFieldSectionClass}>
              <SectionTitle
                eyebrow={t("Specific type fields")}
                title={t(discoverTypeLabel(state.type))}
              />
              {renderSpecificFields()}
            </section>
          </div>

          <aside className="border-t border-violet-100/80 bg-[linear-gradient(180deg,rgba(245,243,255,0.48),rgba(255,255,255,0.74))] px-5 py-5 dark:border-violet-400/14 dark:bg-violet-500/6 xl:border-l xl:border-t-0">
            <div className="sticky top-[calc(var(--app-header-height)+1rem)] flex flex-col gap-4">
              <div className="rounded-2xl border border-violet-100/80 bg-white/88 p-4 shadow-[0_18px_56px_-44px_rgba(109,40,217,0.45)] dark:border-violet-400/16 dark:bg-slate-950/56">
                <div className="mb-4 border-b border-violet-100/80 pb-3 dark:border-violet-400/14">
                  <h3 className="font-heading text-base font-semibold text-foreground">
                    {t("Preview")}
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  {selectedPublisher?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedPublisher.imageUrl}
                      alt=""
                      className="h-10 w-10 rounded-2xl border border-violet-100 object-cover shadow-sm dark:border-violet-400/14"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-700 shadow-sm dark:border-violet-400/14 dark:bg-violet-500/8 dark:text-violet-100">
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

                <div className="mt-4 overflow-hidden rounded-2xl border border-violet-100 bg-violet-50/45 shadow-sm dark:border-violet-400/14 dark:bg-violet-500/8">
                  {coverImagePreviewSource && !imageUrlError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverImagePreviewSource}
                      alt=""
                      className="aspect-[1024/500] w-full object-cover"
                    />
                  ) : state.imageUrl && imageUrlError ? (
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

        <div className="sticky bottom-0 z-20 border-t border-violet-100/80 bg-white/92 px-5 py-4 shadow-[0_-20px_60px_rgba(109,40,217,0.10)] backdrop-blur dark:border-violet-400/14 dark:bg-slate-950/88">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 text-sm text-muted-foreground">
              {changed ? t("Unsaved changes") : t("No unsaved changes")}
            </div>
            {publishedAppUrl ? (
              <Button
                size="lg"
                asChild
                className="h-14 min-w-[min(100%,22rem)] justify-center rounded-xl bg-violet-600 text-base font-semibold text-white shadow-[0_16px_42px_rgba(109,40,217,0.24)] hover:bg-violet-700"
              >
                <a href={publishedAppUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-5 w-5" />
                  {t("View publication in the app")}
                </a>
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={() => void (mode === "edit" ? saveChanges() : publish())}
                disabled={isWorking}
                className="h-14 min-w-[min(100%,22rem)] justify-center rounded-xl bg-violet-600 text-base font-semibold text-white shadow-[0_16px_42px_rgba(109,40,217,0.24)] hover:bg-violet-700"
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
            )}
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
          className="max-w-xl overflow-hidden rounded-[2rem] border border-violet-100 [background:linear-gradient(155deg,rgba(255,255,255,0.98),rgba(245,243,255,0.98)_54%,rgba(240,249,255,0.90))] p-0 text-violet-950 shadow-[0_34px_120px_rgba(109,40,217,0.22)] dark:border-violet-300/22 dark:[background:linear-gradient(150deg,rgba(30,24,57,0.98),rgba(18,23,40,0.96)_48%,rgba(76,29,149,0.20))] dark:text-violet-50"
        >
          <DialogHeader className="border-b border-violet-100 px-6 py-5 dark:border-violet-300/16">
            <DialogTitle className="font-heading text-2xl font-semibold">
              {publishDialog?.status === "success"
                ? t("Published to Discover")
                : publishDialog?.status === "error"
                  ? t("Publish needs attention")
                  : t("Publishing Discover entry")}
            </DialogTitle>
            <DialogDescription className="text-violet-950/70 dark:text-violet-50/70">
              {publishDialog?.message ??
                t("Saving the entry and preparing it for the mobile feed.")}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-6">
            <div className="flex items-start gap-4 rounded-[1.5rem] border border-violet-100 bg-white/75 px-5 py-5 shadow-sm dark:border-violet-300/16 dark:bg-violet-950/24">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm dark:bg-violet-400/12 dark:text-violet-100">
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
                <p className="mt-2 text-sm text-violet-950/70 dark:text-violet-50/70">
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
            <DialogFooter className="gap-3 border-violet-100/90 bg-white/55 px-6 py-5 dark:border-violet-300/14 dark:bg-violet-950/16">
              <Button
                type="button"
                onClick={() => setPublishDialog(null)}
                className={publisherPrimaryButtonClass}
              >
                {t("OK")}
              </Button>
            </DialogFooter>
          ) : publishDialog?.status === "success" ? (
            <DialogFooter className="gap-3 border-violet-100/90 bg-white/55 px-6 py-5 dark:border-violet-300/14 dark:bg-violet-950/16">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPublishDialog(null);
                  router.push(routeBase);
                }}
                className={publisherSoftButtonClass}
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
                    router.push(`${routeBase}/${feedItemId}`);
                  }}
                  className={publisherPrimaryButtonClass}
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
