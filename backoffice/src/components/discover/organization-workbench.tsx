"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  type ChangeEvent,
  type DragEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Check,
  CheckCircle2,
  ImageIcon,
  Loader2,
  Link2,
  Palette,
  PencilLine,
  RotateCcw,
  Save,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { PublisherCategoryMultiSelect } from "@/components/discover/publisher-category-multi-select";
import { PublisherCountryMultiSelect } from "@/components/discover/publisher-country-multi-select";
import { PublisherSocialLinksEditor } from "@/components/discover/publisher-social-links-editor";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppLanguage } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_LOGIN_ROUTE } from "@/lib/publisher-portal-routes";
import { cn } from "@/lib/utils";
import {
  DISCOVER_ORGANIZATION_STATUS_OPTIONS,
  discoverGeneticReportCategoryLabels,
  discoverGeneticReportCategoryProvider,
  type DiscoverIndividualRecord,
  type DiscoverIndividualStatus,
  type DiscoverOrganizationRecord,
  type DiscoverOrganizationStatus,
  type DiscoverPublisherSocialLinks,
} from "@/lib/discover";
import {
  discoverIndividualCategoryProvider,
  discoverOrganizationCategoryProvider,
} from "@/lib/discover-publisher-categories";
import {
  formatDiscoverOrganizationCountries,
  serializeDiscoverOrganizationCountryCodes,
  slugifyDiscoverOrganizationName,
} from "@/lib/discover-organization-fields";

type PublisherKind = "organization" | "individual";
type PublisherRecord = DiscoverOrganizationRecord | DiscoverIndividualRecord;
type DeleteSuccessAction = "list" | "publisher-login";
type ImageUploadStatusTone = "loading" | "success" | "warning" | "error";
type ImageUploadStatus = {
  tone: ImageUploadStatusTone;
  message: string;
  href?: string;
  linkLabel?: string;
};

const PUBLISHER_IMAGE_UPLOAD_MAX_BYTES = 600 * 1024;
const PUBLISHER_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH = 900000;
const PUBLISHER_IMAGE_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const PUBLISHER_IMAGE_COMPRESSION_MIME_TYPES = [
  "image/webp",
  "image/jpeg",
] as const;
const PUBLISHER_IMAGE_COMPRESSION_DIMENSION_STEPS = [
  1600, 1200, 960, 720, 560, 420, 320,
] as const;
const PUBLISHER_IMAGE_COMPRESSION_QUALITY_STEPS = [
  0.86, 0.76, 0.66, 0.56, 0.46, 0.36,
] as const;
const PUBLISHER_BANNER_IMAGE_WIDTH = 1024;
const PUBLISHER_BANNER_IMAGE_HEIGHT = 500;
const IMAGE_REDUCER_URL = "https://squoosh.app/";

type ProcessedPublisherImageUpload = {
  dataUrl: string;
  name: string;
  mimeType: string;
  compressed: boolean;
};

type OrganizationFormState = {
  name: string;
  imageUrl: string;
  imageUploadDataUrl: string;
  imageUploadName: string;
  imageUploadMimeType: string;
  bannerImageUrl: string;
  bannerImageUploadDataUrl: string;
  bannerImageUploadName: string;
  bannerImageUploadMimeType: string;
  status: DiscoverOrganizationStatus | DiscoverIndividualStatus;
  websiteUrl: string;
  description: string;
  descriptionEn: string;
  social: DiscoverPublisherSocialLinks;
  countryCode: string;
  organizationType: string;
  individualType: string;
  colorHex: string;
  verified: boolean;
  isGeneticReportProvider: boolean;
  geneticReportCategory: string;
  isGrcHighlighted: boolean;
  contactEmail: string;
  internalNotes: string;
};

function toFormState(
  publisher?: PublisherRecord | null,
): OrganizationFormState {
  const organization = publisher as
    Partial<DiscoverOrganizationRecord> | undefined;
  const individual = publisher as Partial<DiscoverIndividualRecord> | undefined;
  const isGeneticReportProvider =
    organization?.isGeneticReportProvider ?? false;

  return {
    name: publisher?.name ?? "",
    imageUrl: publisher?.imageUrl ?? "",
    imageUploadDataUrl: publisher?.imageUploadDataUrl ?? "",
    imageUploadName: publisher?.imageUploadName ?? "",
    imageUploadMimeType: publisher?.imageUploadMimeType ?? "",
    bannerImageUrl: organization?.bannerImageUrl ?? "",
    bannerImageUploadDataUrl: organization?.bannerImageUploadDataUrl ?? "",
    bannerImageUploadName: organization?.bannerImageUploadName ?? "",
    bannerImageUploadMimeType: organization?.bannerImageUploadMimeType ?? "",
    status: publisher?.status ?? "active",
    websiteUrl: publisher?.websiteUrl ?? "",
    description: publisher?.description ?? "",
    descriptionEn: publisher?.descriptionEn ?? "",
    social: publisher?.social ?? {},
    countryCode: serializeDiscoverOrganizationCountryCodes(
      publisher?.countryCode ? publisher.countryCode.split(",") : [],
    ),
    organizationType: discoverOrganizationCategoryProvider.normalizeCsv(
      organization?.organizationType,
    ),
    individualType: discoverIndividualCategoryProvider.normalizeCsv(
      individual?.individualType,
    ),
    colorHex: publisher?.colorHex ?? "",
    verified: publisher?.verified ?? false,
    isGeneticReportProvider,
    geneticReportCategory: isGeneticReportProvider
      ? (organization?.geneticReportCategory ?? "")
      : "",
    isGrcHighlighted: organization?.isGrcHighlighted ?? false,
    contactEmail: publisher?.contactEmail ?? "",
    internalNotes: publisher?.internalNotes ?? "",
  };
}

function payloadFromState(
  state: OrganizationFormState,
  publisherKind: PublisherKind,
) {
  const organizationType = discoverOrganizationCategoryProvider.normalizeCsv(
    state.organizationType,
  );
  const individualType = discoverIndividualCategoryProvider.normalizeCsv(
    state.individualType,
  );
  const social = cleanPublisherSocialLinks(state.social);
  const isHighlightedOrganization =
    publisherKind === "organization" && state.isGrcHighlighted;

  return {
    ...state,
    slug: slugifyDiscoverOrganizationName(state.name),
    imageUrl: state.imageUrl || null,
    imageUploadDataUrl:
      state.imageUploadDataUrl || (state.imageUrl.trim() ? null : undefined),
    imageUploadName: state.imageUploadName || undefined,
    imageUploadMimeType: state.imageUploadMimeType || undefined,
    bannerImageUrl:
      publisherKind === "organization"
        ? isHighlightedOrganization
          ? state.bannerImageUrl || null
          : null
        : undefined,
    bannerImageUploadDataUrl:
      publisherKind === "organization"
        ? isHighlightedOrganization
          ? state.bannerImageUploadDataUrl ||
            (state.bannerImageUrl.trim() ? null : undefined)
          : null
        : undefined,
    bannerImageUploadName:
      publisherKind === "organization" && isHighlightedOrganization
        ? state.bannerImageUploadName || undefined
        : undefined,
    bannerImageUploadMimeType:
      publisherKind === "organization" && isHighlightedOrganization
        ? state.bannerImageUploadMimeType || undefined
        : undefined,
    websiteUrl: state.websiteUrl || null,
    social: Object.keys(social).length ? social : undefined,
    countryCode:
      serializeDiscoverOrganizationCountryCodes(state.countryCode.split(",")) ||
      undefined,
    organizationType:
      publisherKind === "organization"
        ? organizationType || undefined
        : undefined,
    individualType:
      publisherKind === "individual" ? individualType || undefined : undefined,
    colorHex: normalizedColorHex(state.colorHex) || undefined,
    isGeneticReportProvider:
      publisherKind === "organization"
        ? state.isGeneticReportProvider
        : undefined,
    geneticReportCategory:
      publisherKind === "organization"
        ? state.isGeneticReportProvider
          ? state.geneticReportCategory || null
          : null
        : undefined,
    isGrcHighlighted:
      publisherKind === "organization" ? state.isGrcHighlighted : undefined,
  };
}

function cleanPublisherSocialLinks(social: DiscoverPublisherSocialLinks) {
  return Object.fromEntries(
    Object.entries(social).filter(([, value]) => value.trim()),
  ) as DiscoverPublisherSocialLinks;
}

function normalizedColorHex(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : null;
}

function colorTextValue(value: string) {
  return normalizedColorHex(value) || value.trim();
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

function publisherImageCompressionFileName(file: File, mimeType: string) {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const rawName = file.name || `profile-image.${extension}`;
  const baseName = rawName.replace(/\.[^.]+$/, "") || "profile-image";

  return `${baseName}-compressed.${extension}`;
}

function publisherBannerImageFileName(file: File, mimeType: string) {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const rawName = file.name || `highlight-banner.${extension}`;
  const baseName = rawName.replace(/\.[^.]+$/, "") || "highlight-banner";

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

function imageCompressionDimensions(image: HTMLImageElement) {
  const sourceMax = Math.max(
    image.naturalWidth || image.width || 0,
    image.naturalHeight || image.height || 0,
  );

  if (!sourceMax) {
    return [];
  }

  return Array.from(
    new Set(
      [sourceMax, ...PUBLISHER_IMAGE_COMPRESSION_DIMENSION_STEPS]
        .map((dimension) => Math.min(sourceMax, dimension))
        .filter((dimension) => Number.isFinite(dimension) && dimension > 0),
    ),
  ).sort((a, b) => b - a);
}

function drawCompressedImage(
  image: HTMLImageElement,
  maxDimension: number,
  mimeType: string,
) {
  const sourceWidth = image.naturalWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.height || 0;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
  }

  const sourceMax = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(1, maxDimension / sourceMax);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("CANVAS_UNAVAILABLE");
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  return canvas;
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

function drawBannerImage(image: HTMLImageElement, mimeType: string) {
  const sourceWidth = image.naturalWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.height || 0;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
  }

  const targetAspect =
    PUBLISHER_BANNER_IMAGE_WIDTH / PUBLISHER_BANNER_IMAGE_HEIGHT;
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

  canvas.width = PUBLISHER_BANNER_IMAGE_WIDTH;
  canvas.height = PUBLISHER_BANNER_IMAGE_HEIGHT;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(
      0,
      0,
      PUBLISHER_BANNER_IMAGE_WIDTH,
      PUBLISHER_BANNER_IMAGE_HEIGHT,
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
    PUBLISHER_BANNER_IMAGE_WIDTH,
    PUBLISHER_BANNER_IMAGE_HEIGHT,
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

async function compressPublisherImageFile(file: File) {
  const image = await loadImageElementFromFile(file);
  const dimensions = imageCompressionDimensions(image);

  for (const mimeType of PUBLISHER_IMAGE_COMPRESSION_MIME_TYPES) {
    for (const maxDimension of dimensions) {
      const canvas = drawCompressedImage(image, maxDimension, mimeType);

      for (const quality of PUBLISHER_IMAGE_COMPRESSION_QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, mimeType, quality);

        if (!blob || blob.size === 0) {
          continue;
        }

        if (blob.size <= PUBLISHER_IMAGE_UPLOAD_MAX_BYTES) {
          return new File(
            [blob],
            publisherImageCompressionFileName(file, mimeType),
            {
              type: mimeType,
              lastModified: Date.now(),
            },
          );
        }
      }
    }
  }

  throw new Error("IMAGE_COMPRESSION_FAILED");
}

async function processPublisherImageFile(
  file: File,
): Promise<ProcessedPublisherImageUpload> {
  if (!PUBLISHER_IMAGE_UPLOAD_TYPES.has(file.type)) {
    throw new Error("IMAGE_TYPE_UNSUPPORTED");
  }

  const acceptedFile =
    file.size > PUBLISHER_IMAGE_UPLOAD_MAX_BYTES
      ? await compressPublisherImageFile(file)
      : file;
  let dataUrl = await readFileAsDataUrl(acceptedFile);
  let finalFile = acceptedFile;

  if (
    dataUrl.length > PUBLISHER_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH &&
    acceptedFile === file
  ) {
    finalFile = await compressPublisherImageFile(file);
    dataUrl = await readFileAsDataUrl(finalFile);
  }

  if (dataUrl.length > PUBLISHER_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH) {
    throw new Error("IMAGE_COMPRESSION_FAILED");
  }

  return {
    dataUrl,
    name: finalFile.name,
    mimeType: finalFile.type,
    compressed: finalFile !== file,
  };
}

async function resizePublisherBannerImageFile(file: File) {
  const image = await loadImageElementFromFile(file);

  for (const mimeType of PUBLISHER_IMAGE_COMPRESSION_MIME_TYPES) {
    const canvas = drawBannerImage(image, mimeType);

    for (const quality of PUBLISHER_IMAGE_COMPRESSION_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, mimeType, quality);

      if (!blob || blob.size === 0) {
        continue;
      }

      if (blob.size <= PUBLISHER_IMAGE_UPLOAD_MAX_BYTES) {
        return new File([blob], publisherBannerImageFileName(file, mimeType), {
          type: mimeType,
          lastModified: Date.now(),
        });
      }
    }
  }

  throw new Error("IMAGE_COMPRESSION_FAILED");
}

async function processPublisherBannerImageFile(
  file: File,
): Promise<ProcessedPublisherImageUpload> {
  if (!PUBLISHER_IMAGE_UPLOAD_TYPES.has(file.type)) {
    throw new Error("IMAGE_TYPE_UNSUPPORTED");
  }

  if (!canResizeImagesInBrowser()) {
    return processPublisherImageFile(file);
  }

  const resizedFile = await resizePublisherBannerImageFile(file);
  const dataUrl = await readFileAsDataUrl(resizedFile);

  if (dataUrl.length > PUBLISHER_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH) {
    throw new Error("IMAGE_COMPRESSION_FAILED");
  }

  return {
    dataUrl,
    name: resizedFile.name,
    mimeType: resizedFile.type,
    compressed: true,
  };
}

const DESCRIPTION_LANGUAGE_OPTIONS = [
  { value: "es", label: "Spanish" },
  { value: "en", label: "English" },
] as const;

type DescriptionLanguage =
  (typeof DESCRIPTION_LANGUAGE_OPTIONS)[number]["value"];

function DiscoverPublisherWorkbench({
  publisher,
  publisherKind,
  mode = "edit",
  canManageSystemFields = true,
  canManageGrcHighlight = false,
  canDeletePublisher = false,
  deleteSuccessAction = "list",
  routeBase,
  showListBackLink = true,
}: {
  publisher?: PublisherRecord;
  publisherKind: PublisherKind;
  mode?: "create" | "edit";
  canManageSystemFields?: boolean;
  canManageGrcHighlight?: boolean;
  canDeletePublisher?: boolean;
  deleteSuccessAction?: DeleteSuccessAction;
  routeBase?: string;
  showListBackLink?: boolean;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const [state, setState] = useState(() => toFormState(publisher));
  const [activeDescriptionLanguage, setActiveDescriptionLanguage] =
    useState<DescriptionLanguage>("es");
  const [manualColorMode, setManualColorMode] = useState(false);
  const [manualColorDraft, setManualColorDraft] = useState(() =>
    colorTextValue(toFormState(publisher).colorHex),
  );
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);
  const bannerImageUploadInputRef = useRef<HTMLInputElement>(null);
  const imageUploadTokenRef = useRef(0);
  const bannerImageUploadTokenRef = useRef(0);
  const [manualColorError, setManualColorError] = useState<string | null>(null);
  const [imageUploadStatus, setImageUploadStatus] =
    useState<ImageUploadStatus | null>(null);
  const [imageUploadPending, setImageUploadPending] = useState(false);
  const [imageUploadDragging, setImageUploadDragging] = useState(false);
  const [bannerImageUploadStatus, setBannerImageUploadStatus] =
    useState<ImageUploadStatus | null>(null);
  const [bannerImageUploadPending, setBannerImageUploadPending] =
    useState(false);
  const [bannerImageUploadDragging, setBannerImageUploadDragging] =
    useState(false);
  const [pending, setPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);
  const [isSubmissionEvaluationOpen, setIsSubmissionEvaluationOpen] =
    useState(false);
  const [evaluationPending, setEvaluationPending] = useState<
    "approve" | "reject" | null
  >(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const sourceState = useMemo(() => toFormState(publisher), [publisher]);
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);
  const countryLabel = formatDiscoverOrganizationCountries(
    state.countryCode,
    language,
  );
  const isIndividual = publisherKind === "individual";
  const publisherRouteBase =
    routeBase ??
    (isIndividual ? "/discover/individuals" : "/discover/organizations");
  const publisherListHref = publisherRouteBase;
  const publisherDetailHref = (id: string) => `${publisherRouteBase}/${id}`;
  const endpointBase = isIndividual
    ? "/discover/individuals"
    : "/discover/organizations";
  const categoryProvider = isIndividual
    ? discoverIndividualCategoryProvider
    : discoverOrganizationCategoryProvider;
  const publisherNameLabel = isIndividual
    ? t("Individual publisher name")
    : t("Organization name");
  const colorErrorText = isIndividual
    ? t("Individual publisher color must be a 6-digit hex value.")
    : t("Organization color must be a 6-digit hex value.");
  const colorHex = normalizedColorHex(state.colorHex);
  const appliedColorError =
    state.colorHex.trim() && colorHex === null ? colorErrorText : null;
  const colorError = manualColorError || appliedColorError;
  const visibleColorText = manualColorMode
    ? manualColorDraft
    : colorTextValue(state.colorHex);
  const activeDescriptionId =
    activeDescriptionLanguage === "es"
      ? "discover-org-description"
      : "discover-org-description-en";
  const activeDescriptionValue =
    activeDescriptionLanguage === "es"
      ? state.description
      : state.descriptionEn;
  const showEnglishDescriptionWarning = Boolean(
    state.description.trim() && !state.descriptionEn.trim(),
  );
  const selectedCategoryLabels = categoryProvider.labelsForCsv(
    isIndividual ? state.individualType : state.organizationType,
  );
  const selectedCategoryDisplayLabels = selectedCategoryLabels.map((label) =>
    t(label),
  );
  const selectedGeneticReportCategoryLabels =
    discoverGeneticReportCategoryLabels(
      state.geneticReportCategory || null,
    ).map((label) => t(label));
  const geneticReportCategoryLabel = selectedGeneticReportCategoryLabels.length
    ? selectedGeneticReportCategoryLabels.join(", ")
    : t("No genetic report category");
  const imagePreviewSource = state.imageUrl.trim() || state.imageUploadDataUrl;
  const hasImageUrl = Boolean(state.imageUrl.trim());
  const hasUploadedImage = Boolean(state.imageUploadDataUrl);
  const hasChosenProfileImagePath = hasImageUrl || hasUploadedImage;
  const canEditBannerImage = !isIndividual && state.isGrcHighlighted;
  const bannerImagePreviewSource =
    state.bannerImageUrl.trim() || state.bannerImageUploadDataUrl;
  const hasBannerImageUrl = Boolean(state.bannerImageUrl.trim());
  const hasUploadedBannerImage = Boolean(state.bannerImageUploadDataUrl);
  const hasChosenBannerImagePath = hasBannerImageUrl || hasUploadedBannerImage;
  const imageUploadLimitLabel = formatFileSize(
    PUBLISHER_IMAGE_UPLOAD_MAX_BYTES,
  );
  const bannerImageAspectLabel = `${PUBLISHER_BANNER_IMAGE_WIDTH} × ${PUBLISHER_BANNER_IMAGE_HEIGHT}`;
  const uploadedImageSummary = state.imageUploadName
    ? `${state.imageUploadName}${
        state.imageUploadMimeType ? ` · ${state.imageUploadMimeType}` : ""
      }`
    : t("Using uploaded image");
  const uploadedBannerImageSummary = state.bannerImageUploadName
    ? `${state.bannerImageUploadName}${
        state.bannerImageUploadMimeType
          ? ` · ${state.bannerImageUploadMimeType}`
          : ""
      }`
    : t("Using uploaded banner image");
  const showDangerZone =
    mode === "edit" && Boolean(publisher) && canDeletePublisher;
  const showSubmissionEvaluation =
    mode === "edit" && Boolean(publisher) && canManageSystemFields;
  const publisherDeletionTitle = isIndividual
    ? t("Individual publisher deletion")
    : t("Organization deletion");
  const publisherDeleteButtonLabel = isIndividual
    ? t("Delete individual publisher")
    : t("Delete organization");
  const publisherDeleteDialogTitle = isIndividual
    ? t("Delete individual publisher?")
    : t("Delete organization?");
  const publisherDeleteDescription = isIndividual
    ? t(
        "Delete this individual publisher, every linked Discover feed entry, and every publisher role linked to this individual. Publisher users for this individual will lose access and be signed out. This action is irreversible.",
      )
    : t(
        "Delete this organization, every linked Discover feed entry, and every publisher role linked to this organization. Publisher users for this organization will lose access and be signed out. This action is irreversible.",
      );
  const publisherDeleteDialogDescription = isIndividual
    ? t(
        "This permanently removes this individual publisher from feed_individuals, deletes linked feed_items, and deletes all user_roles tied to this individual. If you are one of those publisher users, your current session will end and you will be sent to the publisher portal login. This cannot be undone.",
      )
    : t(
        "This permanently removes this organization from feed_organizations, deletes linked feed_items, and deletes all user_roles tied to this organization. If you are one of those publisher users, your current session will end and you will be sent to the publisher portal login. This cannot be undone.",
      );
  const evaluationApproveSuccess = isIndividual
    ? t("Individual publisher approved and credentials sent.")
    : t("Organization approved and credentials sent.");
  const evaluationRejectSuccess = isIndividual
    ? t("Individual publisher archived.")
    : t("Organization archived.");
  const evaluationError = isIndividual
    ? t("Unable to evaluate the individual publisher submission.")
    : t("Unable to evaluate the organization submission.");

  function updateState(patch: Partial<OrganizationFormState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  function resetImageUploadInput() {
    if (imageUploadInputRef.current) {
      imageUploadInputRef.current.value = "";
    }
  }

  function resetBannerImageUploadInput() {
    if (bannerImageUploadInputRef.current) {
      bannerImageUploadInputRef.current.value = "";
    }
  }

  function clearUploadedImageSelection() {
    imageUploadTokenRef.current += 1;
    setImageUploadPending(false);
    setImageUploadDragging(false);
    setImageUploadStatus(null);
    resetImageUploadInput();
    updateState({
      imageUploadDataUrl: "",
      imageUploadName: "",
      imageUploadMimeType: "",
    });
  }

  function clearImageUrlSelection() {
    updateState({ imageUrl: "" });
  }

  function clearUploadedBannerImageSelection() {
    bannerImageUploadTokenRef.current += 1;
    setBannerImageUploadPending(false);
    setBannerImageUploadDragging(false);
    setBannerImageUploadStatus(null);
    resetBannerImageUploadInput();
    updateState({
      bannerImageUploadDataUrl: "",
      bannerImageUploadName: "",
      bannerImageUploadMimeType: "",
    });
  }

  function clearBannerImageUrlSelection() {
    updateState({ bannerImageUrl: "" });
  }

  function handleImageUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const imageUrl = event.target.value;
    const clearsUploadedImage = Boolean(imageUrl.trim());

    if (clearsUploadedImage) {
      imageUploadTokenRef.current += 1;
      setImageUploadPending(false);
      setImageUploadDragging(false);
      setImageUploadStatus(null);
      resetImageUploadInput();
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

  function handleBannerImageUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const bannerImageUrl = event.target.value;
    const clearsUploadedBannerImage = Boolean(bannerImageUrl.trim());

    if (clearsUploadedBannerImage) {
      bannerImageUploadTokenRef.current += 1;
      setBannerImageUploadPending(false);
      setBannerImageUploadDragging(false);
      setBannerImageUploadStatus(null);
      resetBannerImageUploadInput();
    }

    updateState({
      bannerImageUrl,
      ...(clearsUploadedBannerImage
        ? {
            bannerImageUploadDataUrl: "",
            bannerImageUploadName: "",
            bannerImageUploadMimeType: "",
          }
        : {}),
    });
  }

  async function handleImageUploadFile(file: File | undefined | null) {
    if (!file) {
      return;
    }

    imageUploadTokenRef.current += 1;
    const token = imageUploadTokenRef.current;
    setImageUploadPending(true);
    setImageUploadDragging(false);
    setImageUploadStatus({
      tone: "loading",
      message:
        file.size > PUBLISHER_IMAGE_UPLOAD_MAX_BYTES
          ? t("Compressing image...")
          : t("Loading image..."),
    });

    try {
      const processed = await processPublisherImageFile(file);
      if (imageUploadTokenRef.current !== token) {
        return;
      }

      updateState({
        imageUrl: "",
        imageUploadDataUrl: processed.dataUrl,
        imageUploadName: processed.name,
        imageUploadMimeType: processed.mimeType,
      });
      setImageUploadStatus({
        tone: "success",
        message: processed.compressed
          ? t("Image compressed and ready.")
          : t("Uploaded image ready."),
      });
    } catch (error) {
      if (imageUploadTokenRef.current !== token) {
        return;
      }

      const unsupported =
        error instanceof Error && error.message === "IMAGE_TYPE_UNSUPPORTED";
      setImageUploadStatus(
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
      if (imageUploadTokenRef.current === token) {
        setImageUploadPending(false);
        resetImageUploadInput();
      }
    }
  }

  async function handleBannerImageUploadFile(file: File | undefined | null) {
    if (!file) {
      return;
    }

    bannerImageUploadTokenRef.current += 1;
    const token = bannerImageUploadTokenRef.current;
    setBannerImageUploadPending(true);
    setBannerImageUploadDragging(false);
    setBannerImageUploadStatus({
      tone: "loading",
      message:
        file.size > PUBLISHER_IMAGE_UPLOAD_MAX_BYTES ||
        canResizeImagesInBrowser()
          ? t("Processing banner image...")
          : t("Loading image..."),
    });

    try {
      const processed = await processPublisherBannerImageFile(file);
      if (bannerImageUploadTokenRef.current !== token) {
        return;
      }

      updateState({
        bannerImageUrl: "",
        bannerImageUploadDataUrl: processed.dataUrl,
        bannerImageUploadName: processed.name,
        bannerImageUploadMimeType: processed.mimeType,
      });
      setBannerImageUploadStatus({
        tone: "success",
        message: processed.compressed
          ? t("Banner image processed and ready.")
          : t("Uploaded image ready."),
      });
    } catch (error) {
      if (bannerImageUploadTokenRef.current !== token) {
        return;
      }

      const unsupported =
        error instanceof Error && error.message === "IMAGE_TYPE_UNSUPPORTED";
      setBannerImageUploadStatus(
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
      if (bannerImageUploadTokenRef.current === token) {
        setBannerImageUploadPending(false);
        resetBannerImageUploadInput();
      }
    }
  }

  function handleImageUploadChange(event: ChangeEvent<HTMLInputElement>) {
    void handleImageUploadFile(event.target.files?.[0]);
  }

  function handleBannerImageUploadChange(event: ChangeEvent<HTMLInputElement>) {
    void handleBannerImageUploadFile(event.target.files?.[0]);
  }

  function imageFileFromDataTransfer(dataTransfer: DataTransfer) {
    const files = [
      ...Array.from(dataTransfer.items || [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file)),
      ...Array.from(dataTransfer.files || []),
    ];

    return (
      files.find((file) => file.type.startsWith("image/")) ?? files[0] ?? null
    );
  }

  function handleImageUploadDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!imageUploadPending) {
      setImageUploadDragging(true);
    }
  }

  function handleImageUploadDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!imageUploadPending) {
      event.dataTransfer.dropEffect = "copy";
      setImageUploadDragging(true);
    }
  }

  function handleImageUploadDragLeave(event: DragEvent<HTMLLabelElement>) {
    const nextTarget =
      event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setImageUploadDragging(false);
    }
  }

  function handleImageUploadDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = imageFileFromDataTransfer(event.dataTransfer);
    setImageUploadDragging(false);
    void handleImageUploadFile(file);
  }

  function handleBannerImageUploadDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!bannerImageUploadPending) {
      setBannerImageUploadDragging(true);
    }
  }

  function handleBannerImageUploadDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!bannerImageUploadPending) {
      event.dataTransfer.dropEffect = "copy";
      setBannerImageUploadDragging(true);
    }
  }

  function handleBannerImageUploadDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget =
      event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setBannerImageUploadDragging(false);
    }
  }

  function handleBannerImageUploadDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const file = imageFileFromDataTransfer(event.dataTransfer);
    setBannerImageUploadDragging(false);
    void handleBannerImageUploadFile(file);
  }

  function handleGrcHighlightChange(checked: boolean) {
    if (!checked) {
      bannerImageUploadTokenRef.current += 1;
      setBannerImageUploadPending(false);
      setBannerImageUploadDragging(false);
      setBannerImageUploadStatus(null);
      resetBannerImageUploadInput();
      updateState({
        isGrcHighlighted: false,
        bannerImageUrl: "",
        bannerImageUploadDataUrl: "",
        bannerImageUploadName: "",
        bannerImageUploadMimeType: "",
      });
      return;
    }

    updateState({ isGrcHighlighted: true });
  }

  function closeManualColorEditor(nextColor: string) {
    setManualColorMode(false);
    setManualColorDraft(colorTextValue(nextColor));
    setManualColorError(null);
  }

  function handleReset() {
    imageUploadTokenRef.current += 1;
    bannerImageUploadTokenRef.current += 1;
    setImageUploadPending(false);
    setImageUploadDragging(false);
    setImageUploadStatus(null);
    setBannerImageUploadPending(false);
    setBannerImageUploadDragging(false);
    setBannerImageUploadStatus(null);
    resetImageUploadInput();
    resetBannerImageUploadInput();
    setState(sourceState);
    closeManualColorEditor(sourceState.colorHex);
  }

  function handleColorPickerChange(value: string) {
    const nextColor = value.toUpperCase();
    updateState({ colorHex: nextColor });
    closeManualColorEditor(nextColor);
  }

  function openColorPicker() {
    const colorPicker = colorPickerRef.current;
    if (!colorPicker) {
      return;
    }

    const colorPickerWithDialog = colorPicker as HTMLInputElement & {
      showPicker?: () => void;
    };
    if (typeof colorPickerWithDialog.showPicker === "function") {
      colorPickerWithDialog.showPicker();
      return;
    }

    colorPicker.click();
  }

  function startManualColorEdit() {
    setManualColorDraft(colorTextValue(state.colorHex));
    setManualColorMode(true);
    setManualColorError(null);
  }

  function applyManualColor() {
    const nextColor = normalizedColorHex(manualColorDraft);
    if (!nextColor) {
      setManualColorError(colorErrorText);
      return;
    }

    updateState({ colorHex: nextColor });
    closeManualColorEditor(nextColor);
  }

  function updateActiveDescription(value: string) {
    updateState(
      activeDescriptionLanguage === "es"
        ? { description: value }
        : { descriptionEn: value },
    );
  }

  async function handleSave() {
    if (imageUploadPending || bannerImageUploadPending) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Wait until the image finishes processing."),
      });
      return;
    }

    if (!state.name.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: isIndividual
          ? t("Individual publisher name is required.")
          : t("Organization name is required."),
      });
      return;
    }

    if (appliedColorError) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: appliedColorError,
      });
      return;
    }

    if (!state.imageUrl.trim() && !state.imageUploadDataUrl.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Profile image is required."),
      });
      return;
    }

    const nextState = {
      ...state,
      colorHex: colorHex || "",
    };

    setPending(true);
    try {
      if (mode === "create") {
        const response = await sdkFetch<
          | { organization: DiscoverOrganizationRecord }
          | { individual: DiscoverIndividualRecord }
        >(endpointBase, {
          method: "POST",
          body: JSON.stringify(payloadFromState(nextState, publisherKind)),
        });
        const saved = isIndividual
          ? (response as { individual: DiscoverIndividualRecord }).individual
          : (response as { organization: DiscoverOrganizationRecord })
              .organization;
        setState(nextState);
        closeManualColorEditor(nextState.colorHex);
        setToast({
          id: Date.now(),
          tone: "success",
          message: isIndividual
            ? t("Individual publisher created.")
            : t("Organization created."),
        });
        router.push(publisherDetailHref(saved.id));
        router.refresh();
        return;
      }

      if (!publisher) {
        return;
      }

      await sdkFetch<
        | { organization: DiscoverOrganizationRecord }
        | { individual: DiscoverIndividualRecord }
      >(`${endpointBase}/${publisher.id}`, {
        method: "PUT",
        body: JSON.stringify(payloadFromState(nextState, publisherKind)),
      });
      setState(nextState);
      closeManualColorEditor(nextState.colorHex);
      setToast({
        id: Date.now(),
        tone: "success",
        message: isIndividual
          ? t("Individual publisher changes saved.")
          : t("Organization changes saved."),
      });
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : isIndividual
              ? t("Unable to save the individual publisher.")
              : t("Unable to save the organization."),
      });
    } finally {
      setPending(false);
    }
  }

  async function handleDeletePublisher() {
    if (!publisher || !showDangerZone || deletePending) {
      return;
    }

    setDeletePending(true);
    try {
      await sdkFetch(`${endpointBase}/${encodeURIComponent(publisher.id)}`, {
        method: "DELETE",
      });
      setToast({
        id: Date.now(),
        tone: "success",
        message: isIndividual
          ? t("Individual publisher deleted.")
          : t("Organization deleted."),
      });
      if (deleteSuccessAction === "publisher-login") {
        try {
          await signOut({
            callbackUrl: PUBLISHER_PORTAL_LOGIN_ROUTE,
            redirect: true,
          });
        } catch {
          router.push(PUBLISHER_PORTAL_LOGIN_ROUTE);
          router.refresh();
        }
        return;
      }
      router.push(publisherListHref);
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: isIndividual
          ? t("Unable to delete the individual publisher.")
          : t("Unable to delete the organization."),
        details: error instanceof Error ? error.message : undefined,
      });
      setDeletePending(false);
    }
  }

  async function handleSubmissionEvaluation(decision: "approve" | "reject") {
    if (!publisher || !showSubmissionEvaluation || evaluationPending) {
      return;
    }

    setEvaluationPending(decision);
    try {
      const response = await sdkFetch<
        | { organization: DiscoverOrganizationRecord }
        | { individual: DiscoverIndividualRecord }
      >(
        `${endpointBase}/${encodeURIComponent(publisher.id)}/submission-evaluation`,
        {
          method: "POST",
          body: JSON.stringify({ decision }),
        },
      );
      const saved = isIndividual
        ? (response as { individual: DiscoverIndividualRecord }).individual
        : (response as { organization: DiscoverOrganizationRecord })
            .organization;
      const nextState = toFormState(saved);
      setState(nextState);
      closeManualColorEditor(nextState.colorHex);
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          decision === "approve"
            ? evaluationApproveSuccess
            : evaluationRejectSuccess,
      });
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: evaluationError,
        details: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setEvaluationPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-52 sm:pb-36 lg:pb-32">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        {showListBackLink ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={publisherListHref}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {isIndividual
                ? t("Back to individual publishers")
                : t("Back to organizations")}
            </Link>
          </Button>
        ) : null}
        {publisher ? (
          <span className="font-mono text-xs text-muted-foreground">
            {publisher.id}
          </span>
        ) : null}
      </div>

      <section
        data-testid="discover-publisher-content-panel"
        className="glass-panel flex flex-col gap-5 px-5 py-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create"
                ? isIndividual
                  ? t("Create individual publisher")
                  : t("Create organization")
                : isIndividual
                  ? t("Individual publisher")
                  : t("Organization")}
            </h2>
            <HeaderUnclutterButton />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-name">{t("Name")}</Label>
              <Input
                id="discover-org-name"
                value={state.name}
                onChange={(event) => updateState({ name: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="discover-org-status">{t("Status")}</Label>
              <select
                id="discover-org-status"
                value={state.status}
                onChange={(event) =>
                  updateState({
                    status: event.target.value as DiscoverOrganizationStatus,
                  })
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                disabled={!canManageSystemFields}
              >
                {DISCOVER_ORGANIZATION_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-country">
                {t("Country coverage")}
              </Label>
              <PublisherCountryMultiSelect
                id="discover-org-country"
                value={state.countryCode}
                onChange={(countryCode) => updateState({ countryCode })}
                language={language}
                t={t}
              />
            </div>
            <PublisherCategoryMultiSelect
              provider={categoryProvider}
              value={
                isIndividual ? state.individualType : state.organizationType
              }
              onChange={(value: string) =>
                updateState(
                  isIndividual
                    ? { individualType: value }
                    : { organizationType: value },
                )
              }
              optionLabel={(option) => t(option.label)}
              label={
                isIndividual
                  ? t("Professional categories")
                  : t("Organization category")
              }
              dialogTitle={
                isIndividual
                  ? t("Select professional categories")
                  : t("Select organization category")
              }
              dialogDescription={t(
                "Choose one or more canonical Discover categories. They will be saved as comma-separated keys.",
              )}
              emptyLabel={t("No categories selected")}
              searchPlaceholder={t("Search categories")}
              clearLabel={t("Clear all")}
              removeLabel={t("Remove")}
              doneLabel={t("Done")}
              selectedCountLabel={(count: number) =>
                `${count} ${count === 1 ? t("category selected") : t("categories selected")}`
              }
              className="md:col-span-2"
            />
            {!isIndividual ? (
              <>
                <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={state.isGeneticReportProvider}
                    onChange={(event) =>
                      updateState({
                        isGeneticReportProvider: event.target.checked,
                        geneticReportCategory: event.target.checked
                          ? state.geneticReportCategory
                          : "",
                      })
                    }
                    disabled={!canManageSystemFields}
                    className="h-4 w-4"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">
                      {t("Genetic report provider")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {state.isGeneticReportProvider ? t("Yes") : t("No")}
                    </span>
                  </span>
                </label>
                {state.isGeneticReportProvider ? (
                  <PublisherCategoryMultiSelect
                    id="discover-org-genetic-report-category"
                    provider={discoverGeneticReportCategoryProvider}
                    value={state.geneticReportCategory}
                    onChange={(geneticReportCategory) =>
                      updateState({ geneticReportCategory })
                    }
                    optionLabel={(option) => t(option.label)}
                    label={t("Genetic report categories")}
                    dialogTitle={t("Select genetic report categories")}
                    dialogDescription={t(
                      "Choose one or more genetic report categories. They will be saved as comma-separated keys.",
                    )}
                    emptyLabel={t("No report categories selected")}
                    searchPlaceholder={t("Search report categories")}
                    clearLabel={t("Clear all")}
                    removeLabel={t("Remove")}
                    doneLabel={t("Done")}
                    selectedCountLabel={(count: number) =>
                      `${count} ${
                        count === 1
                          ? t("report category selected")
                          : t("report categories selected")
                      }`
                    }
                    className="md:col-span-2"
                    disabled={!canManageSystemFields}
                  />
                ) : null}
              </>
            ) : null}
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-color">{t("Accent color")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  ref={colorPickerRef}
                  type="color"
                  value={colorHex || "#4F46E5"}
                  onChange={(event) =>
                    handleColorPickerChange(event.target.value)
                  }
                  className="size-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-input bg-background p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                  aria-label={t("Accent color picker")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openColorPicker}
                >
                  <Palette className="h-3.5 w-3.5" />
                  {t("Open color picker")}
                </Button>
                <Input
                  id="discover-org-color"
                  value={visibleColorText}
                  onChange={(event) => {
                    setManualColorDraft(event.target.value);
                    setManualColorError(null);
                  }}
                  onKeyDown={(event) => {
                    if (manualColorMode && event.key === "Enter") {
                      event.preventDefault();
                      applyManualColor();
                    }
                  }}
                  readOnly={!manualColorMode}
                  placeholder="#4F46E5"
                  aria-invalid={Boolean(colorError)}
                  aria-describedby={
                    colorError ? "discover-org-color-error" : undefined
                  }
                  className={
                    colorError
                      ? "border-destructive focus-visible:ring-destructive"
                      : manualColorMode
                        ? ""
                        : "cursor-default border-transparent bg-transparent px-0 shadow-none hover:border-transparent focus-visible:border-transparent focus-visible:ring-0 read-only:bg-transparent read-only:text-foreground dark:border-transparent dark:bg-transparent dark:read-only:bg-transparent"
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (manualColorMode) {
                      applyManualColor();
                      return;
                    }
                    startManualColorEdit();
                  }}
                  disabled={pending}
                >
                  {manualColorMode ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <PencilLine className="h-3.5 w-3.5" />
                  )}
                  {manualColorMode ? t("Apply") : t("Set manually")}
                </Button>
              </div>
              {colorError ? (
                <p
                  id="discover-org-color-error"
                  className="text-xs font-medium text-destructive"
                >
                  {colorError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-website">{t("Website URL")}</Label>
              <Input
                id="discover-org-website"
                type="url"
                value={state.websiteUrl}
                onChange={(event) =>
                  updateState({ websiteUrl: event.target.value })
                }
                placeholder="https://"
              />
            </div>
            <div
              className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background/70 p-4 shadow-sm md:col-span-2"
              data-testid="discover-org-profile-image-section"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                    <ImageIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {t("Profile image")}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t(
                        "Use an image URL or upload a PNG, JPG, or WebP file. Large files are compressed before saving.",
                      )}
                    </p>
                  </div>
                </div>
                {hasUploadedImage ? (
                  <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200">
                    {t("Using uploaded image")}
                  </span>
                ) : null}
              </div>

              <div
                className={cn(
                  "grid gap-3",
                  hasChosenProfileImagePath
                    ? "lg:grid-cols-1"
                    : "lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.8fr)]",
                )}
              >
                {!hasUploadedImage ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="discover-org-image" className="text-xs">
                      {t("Image URL")}
                    </Label>
                    <div className="relative">
                      <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="discover-org-image"
                        type="url"
                        value={state.imageUrl}
                        onChange={handleImageUrlChange}
                        placeholder="https://"
                        disabled={imageUploadPending}
                        className={cn("pl-9", hasImageUrl && "pr-24")}
                      />
                      {hasImageUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearImageUrlSelection}
                          disabled={pending || imageUploadPending}
                          aria-label={t("Clear image URL")}
                          className="absolute right-1 top-1/2 h-8 -translate-y-1/2 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {t("Clear")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {!hasImageUrl ? (
                  <label
                    htmlFor="discover-org-image-upload"
                    onDragEnter={handleImageUploadDragEnter}
                    onDragOver={handleImageUploadDragOver}
                    onDragLeave={handleImageUploadDragLeave}
                    onDrop={handleImageUploadDrop}
                    className={cn(
                      "relative flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition duration-200",
                      imageUploadDragging
                        ? "border-violet-500 bg-violet-50 shadow-[0_16px_34px_rgba(109,40,217,0.16)] dark:bg-violet-500/12"
                        : "border-violet-300/80 bg-violet-50/45 hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-50 dark:border-violet-400/35 dark:bg-violet-500/8",
                      imageUploadPending && "cursor-progress opacity-80",
                    )}
                  >
                    <input
                      ref={imageUploadInputRef}
                      id="discover-org-image-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageUploadChange}
                      disabled={imageUploadPending}
                      aria-label={t("Upload image file")}
                      className="sr-only"
                    />
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background text-violet-700 shadow-sm dark:bg-background/80 dark:text-violet-200">
                      {imageUploadPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <UploadCloud className="h-5 w-5" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {hasUploadedImage
                          ? t("Replace uploaded image")
                          : t("Upload image file")}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {imageUploadDragging
                          ? t("Drop image to upload")
                          : t(
                              "PNG, JPG, or WebP up to 600 KB. Drop it here or choose a file.",
                            ).replace("600 KB", imageUploadLimitLabel)}
                      </span>
                    </span>
                  </label>
                ) : null}
              </div>

              {hasUploadedImage ? (
                <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/55 px-3 py-2 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100">
                  <span className="min-w-0 truncate">
                    {uploadedImageSummary}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearUploadedImageSelection}
                    disabled={pending || imageUploadPending}
                    className="w-fit text-emerald-900 hover:bg-emerald-100 hover:text-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-500/15"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {t("Remove uploaded image")}
                  </Button>
                </div>
              ) : null}

              {imageUploadStatus ? (
                <p
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-medium leading-5",
                    imageUploadStatus.tone === "success" &&
                      "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200",
                    imageUploadStatus.tone === "loading" &&
                      "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-200",
                    imageUploadStatus.tone === "warning" &&
                      "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100",
                    imageUploadStatus.tone === "error" &&
                      "bg-destructive/10 text-destructive",
                  )}
                >
                  {imageUploadStatus.message}
                  {imageUploadStatus.href && imageUploadStatus.linkLabel ? (
                    <>
                      {" "}
                      <a
                        href={imageUploadStatus.href}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold underline underline-offset-4"
                      >
                        {imageUploadStatus.linkLabel}
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
            {canEditBannerImage ? (
              <div
                className="flex flex-col gap-3 rounded-xl border border-violet-200/80 bg-violet-50/35 p-4 shadow-sm md:col-span-2 dark:border-violet-400/25 dark:bg-violet-500/8"
                data-testid="discover-org-banner-image-section"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                      <ImageIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        {t("GRC highlight banner")}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t(
                          "Shown in the highlighted GRC card. Use a wide 1024 x 500 image URL or upload a PNG, JPG, or WebP file.",
                        ).replace("1024 x 500", bannerImageAspectLabel)}
                      </p>
                    </div>
                  </div>
                  {hasUploadedBannerImage ? (
                    <span className="inline-flex w-fit items-center rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-100">
                      {t("Using uploaded banner image")}
                    </span>
                  ) : null}
                </div>

                <div
                  className={cn(
                    "overflow-hidden rounded-xl border bg-background shadow-sm transition duration-200",
                    bannerImageUploadDragging
                      ? "border-violet-500 bg-violet-50 shadow-[0_18px_42px_rgba(109,40,217,0.18)] dark:bg-violet-500/12"
                      : "border-border",
                    !bannerImagePreviewSource &&
                      "cursor-copy hover:border-violet-300 hover:bg-violet-50/40 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/8",
                    bannerImageUploadPending && "cursor-progress opacity-80",
                  )}
                  onDragEnter={
                    !bannerImagePreviewSource
                      ? handleBannerImageUploadDragEnter
                      : undefined
                  }
                  onDragOver={
                    !bannerImagePreviewSource
                      ? handleBannerImageUploadDragOver
                      : undefined
                  }
                  onDragLeave={
                    !bannerImagePreviewSource
                      ? handleBannerImageUploadDragLeave
                      : undefined
                  }
                  onDrop={
                    !bannerImagePreviewSource
                      ? handleBannerImageUploadDrop
                      : undefined
                  }
                  data-testid="discover-org-banner-preview-dropzone"
                >
                  {bannerImagePreviewSource ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bannerImagePreviewSource}
                      alt=""
                      className="aspect-[1024/500] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[1024/500] flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                        {bannerImageUploadPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <UploadCloud className="h-5 w-5" />
                        )}
                      </span>
                      <span className="font-medium">
                        {bannerImageUploadDragging
                          ? t("Drop image to upload")
                          : t("No GRC banner image")}
                      </span>
                      <span className="max-w-md text-xs leading-5">
                        {t(
                          "Drag a banner image here or use the upload button below.",
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    "grid gap-3",
                    hasChosenBannerImagePath
                      ? "lg:grid-cols-1"
                      : "lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.8fr)]",
                  )}
                >
                  {!hasUploadedBannerImage ? (
                    <div className="flex flex-col gap-2">
                      <Label
                        htmlFor="discover-org-banner-image"
                        className="text-xs"
                      >
                        {t("Banner image URL")}
                      </Label>
                      <div className="relative">
                        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="discover-org-banner-image"
                          type="url"
                          value={state.bannerImageUrl}
                          onChange={handleBannerImageUrlChange}
                          placeholder="https://"
                          disabled={bannerImageUploadPending}
                          className={cn("pl-9", hasBannerImageUrl && "pr-24")}
                        />
                        {hasBannerImageUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearBannerImageUrlSelection}
                            disabled={pending || bannerImageUploadPending}
                            aria-label={t("Clear banner image URL")}
                            className="absolute right-1 top-1/2 h-8 -translate-y-1/2 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {t("Clear")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {!hasBannerImageUrl ? (
                    <label
                      htmlFor="discover-org-banner-image-upload"
                      onDragEnter={handleBannerImageUploadDragEnter}
                      onDragOver={handleBannerImageUploadDragOver}
                      onDragLeave={handleBannerImageUploadDragLeave}
                      onDrop={handleBannerImageUploadDrop}
                      className={cn(
                        "relative flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition duration-200",
                        bannerImageUploadDragging
                          ? "border-violet-500 bg-violet-50 shadow-[0_16px_34px_rgba(109,40,217,0.16)] dark:bg-violet-500/12"
                          : "border-violet-300/80 bg-background/70 hover:-translate-y-0.5 hover:border-violet-400 hover:bg-background dark:border-violet-400/35 dark:bg-background/60",
                        bannerImageUploadPending &&
                          "cursor-progress opacity-80",
                      )}
                    >
                      <input
                        ref={bannerImageUploadInputRef}
                        id="discover-org-banner-image-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleBannerImageUploadChange}
                        disabled={bannerImageUploadPending}
                        aria-label={t("Upload banner file")}
                        className="sr-only"
                      />
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 shadow-sm dark:bg-violet-500/15 dark:text-violet-200">
                        {bannerImageUploadPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <UploadCloud className="h-5 w-5" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">
                          {hasUploadedBannerImage
                            ? t("Replace uploaded banner image")
                            : t("Upload banner file")}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {bannerImageUploadDragging
                            ? t("Drop image to upload")
                            : t(
                                "PNG, JPG, or WebP up to 600 KB. It will be cropped to 1024 x 500.",
                              )
                                .replace("600 KB", imageUploadLimitLabel)
                                .replace("1024 x 500", bannerImageAspectLabel)}
                        </span>
                      </span>
                    </label>
                  ) : null}
                </div>

                {hasUploadedBannerImage ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50/65 px-3 py-2 text-sm text-violet-950 sm:flex-row sm:items-center sm:justify-between dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-100">
                    <span className="min-w-0 truncate">
                      {uploadedBannerImageSummary}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearUploadedBannerImageSelection}
                      disabled={pending || bannerImageUploadPending}
                      className="w-fit text-violet-900 hover:bg-violet-100 hover:text-violet-950 dark:text-violet-100 dark:hover:bg-violet-500/15"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {t("Remove uploaded banner image")}
                    </Button>
                  </div>
                ) : null}

                {bannerImageUploadStatus ? (
                  <p
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs font-medium leading-5",
                      bannerImageUploadStatus.tone === "success" &&
                        "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200",
                      bannerImageUploadStatus.tone === "loading" &&
                        "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-200",
                      bannerImageUploadStatus.tone === "warning" &&
                        "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100",
                      bannerImageUploadStatus.tone === "error" &&
                        "bg-destructive/10 text-destructive",
                    )}
                  >
                    {bannerImageUploadStatus.message}
                    {bannerImageUploadStatus.href &&
                    bannerImageUploadStatus.linkLabel ? (
                      <>
                        {" "}
                        <a
                          href={bannerImageUploadStatus.href}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold underline underline-offset-4"
                        >
                          {bannerImageUploadStatus.linkLabel}
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ) : null}
            <PublisherSocialLinksEditor
              value={state.social}
              onChange={(social) => updateState({ social })}
              t={t}
            />
            <div className="flex flex-col gap-2 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={activeDescriptionId}>{t("Description")}</Label>
                <div
                  role="group"
                  aria-label={t("Description language")}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-muted/50 p-0.5"
                >
                  {DESCRIPTION_LANGUAGE_OPTIONS.map((option) => {
                    const active = activeDescriptionLanguage === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setActiveDescriptionLanguage(option.value)
                        }
                        className={cn(
                          "h-7 rounded-[6px] px-2.5 text-xs font-medium transition-colors",
                          active
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t(option.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Textarea
                id={activeDescriptionId}
                value={activeDescriptionValue}
                onChange={(event) =>
                  updateActiveDescription(event.target.value)
                }
                rows={4}
              />
              {showEnglishDescriptionWarning ? (
                <p className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-2 text-xs font-medium text-violet-900 dark:border-violet-400/30 dark:bg-violet-500/12 dark:text-violet-100">
                  {isIndividual
                    ? t(
                        "Add an English individual publisher description to reach a broader audience.",
                      )
                    : t(
                        "Add an English organization description to reach a broader audience.",
                      )}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="discover-org-contact">{t("Contact email")}</Label>
              <Input
                id="discover-org-contact"
                type="email"
                value={state.contactEmail}
                onChange={(event) =>
                  updateState({ contactEmail: event.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 self-end rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={state.verified}
                onChange={(event) =>
                  updateState({ verified: event.target.checked })
                }
                disabled={!canManageSystemFields}
                className="h-4 w-4"
              />
              {t("Verified publisher")}
            </label>
            {!isIndividual && canManageGrcHighlight ? (
              <label className="flex items-center gap-2 self-end rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm text-violet-950 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100">
                <input
                  type="checkbox"
                  checked={state.isGrcHighlighted}
                  onChange={(event) =>
                    handleGrcHighlightChange(event.target.checked)
                  }
                  disabled={pending}
                  className="h-4 w-4"
                />
                {t("GRC highlighted")}
              </label>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-md border border-border bg-muted/30">
              {imagePreviewSource ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreviewSource}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  {t("No image URL")}
                </div>
              )}
            </div>
            {canEditBannerImage ? (
              <div className="overflow-hidden rounded-md border border-violet-200 bg-violet-50/40 dark:border-violet-400/25 dark:bg-violet-500/8">
                {bannerImagePreviewSource ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bannerImagePreviewSource}
                    alt=""
                    className="aspect-[1024/500] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[1024/500] items-center justify-center px-4 text-center text-xs text-muted-foreground">
                    {t("No GRC banner image")}
                  </div>
                )}
              </div>
            ) : null}
            <div className="rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">
                {state.name || publisherNameLabel}
              </div>
              <div>{state.websiteUrl || t("No website URL")}</div>
              <div>{countryLabel || t("No country")}</div>
              <div>
                {selectedCategoryDisplayLabels.length
                  ? selectedCategoryDisplayLabels.join(", ")
                  : t("No categories selected")}
              </div>
              {!isIndividual ? (
                <>
                  <div>
                    {state.isGeneticReportProvider
                      ? t("Genetic report provider")
                      : t("Not a genetic report provider")}
                  </div>
                  {state.isGeneticReportProvider ? (
                    <div>{geneticReportCategoryLabel}</div>
                  ) : null}
                  {canManageGrcHighlight ? (
                    <div>
                      {state.isGrcHighlighted
                        ? t("GRC highlighted")
                        : t("Not GRC highlighted")}
                    </div>
                  ) : null}
                  {state.isGrcHighlighted ? (
                    <div>
                      {bannerImagePreviewSource
                        ? t("GRC banner ready")
                        : t("No GRC banner image")}
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full border border-border"
                  style={{ backgroundColor: colorHex || "transparent" }}
                />
                <span>{colorHex || t("No accent color")}</span>
              </div>
            </div>
          </div>
        </div>

        {showDangerZone ? (
          <div
            data-testid="discover-publisher-danger-zone"
            className="rounded-md border border-destructive/20 bg-destructive/[0.03] px-4 py-4"
          >
            <button
              type="button"
              className="flex w-full min-w-0 items-start gap-3 text-left"
              onClick={() => setIsDangerZoneOpen((open) => !open)}
              aria-expanded={isDangerZoneOpen}
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-heading text-lg font-semibold text-foreground">
                    {t("Danger zone")}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isDangerZoneOpen && "rotate-180",
                    )}
                  />
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {t(
                    "Irreversible actions that permanently delete this Discover publisher.",
                  )}
                </span>
              </span>
            </button>

            {isDangerZoneOpen ? (
              <div className="mt-4 grid gap-4 border-t border-destructive/15 pt-4 text-sm text-muted-foreground lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    {publisherDeletionTitle}
                  </h4>
                  <p className="mt-1 leading-6">{publisherDeleteDescription}</p>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-fit"
                      disabled={pending || deletePending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {publisherDeleteButtonLabel}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogMedia className="bg-destructive/12 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                      </AlertDialogMedia>
                      <AlertDialogTitle>
                        {publisherDeleteDialogTitle}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {publisherDeleteDialogDescription}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={deletePending}
                        onClick={(event) => {
                          event.preventDefault();
                          void handleDeletePublisher();
                        }}
                      >
                        {deletePending ? t("Deleting...") : t("Delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : null}
          </div>
        ) : null}

        {showSubmissionEvaluation ? (
          <div
            data-testid="discover-publisher-submission-evaluation"
            className="rounded-md border border-violet-200 bg-violet-500/[0.035] px-4 py-4 dark:border-violet-400/25 dark:bg-violet-500/10"
          >
            <button
              type="button"
              className="flex w-full min-w-0 items-start gap-3 text-left"
              onClick={() => setIsSubmissionEvaluationOpen((open) => !open)}
              aria-expanded={isSubmissionEvaluationOpen}
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/20 dark:text-violet-200">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-heading text-lg font-semibold text-foreground">
                    {t("Submission evaluation")}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isSubmissionEvaluationOpen && "rotate-180",
                    )}
                  />
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {t(
                    "Approve to create portal access and email credentials, or reject to archive this publisher.",
                  )}
                </span>
              </span>
            </button>

            {isSubmissionEvaluationOpen ? (
              <div className="mt-4 grid gap-4 border-t border-violet-200/70 pt-4 text-sm text-muted-foreground lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start dark:border-violet-400/20">
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    {t("Approval decision")}
                  </h4>
                  <p className="mt-1 leading-6">
                    {t(
                      "Approval activates the publisher, assigns the correct publisher role, generates a new access key, and emails it as Clave de acceso.",
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || evaluationPending !== null}
                    onClick={() => void handleSubmissionEvaluation("reject")}
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {evaluationPending === "reject"
                      ? t("Rejecting...")
                      : t("Reject")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || evaluationPending !== null}
                    onClick={() => void handleSubmissionEvaluation("approve")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {evaluationPending === "approve"
                      ? t("Approving...")
                      : t("Approve")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div
        data-testid="discover-publisher-save-dock"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-0"
      >
        <div className="pointer-events-auto mx-auto md:ml-[calc(var(--sidebar-width)+1rem)] md:mr-6 lg:mr-8">
          <div className="rounded-[1.25rem] border border-border/70 bg-background/88 p-3 shadow-[0_-10px_38px_rgba(15,23,42,0.12)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/72 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 text-sm text-muted-foreground">
                {changed ? t("Unsaved changes") : t("No unsaved changes")}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleReset}
                  disabled={
                    (!changed && !manualColorMode && !manualColorError) ||
                    pending ||
                    imageUploadPending ||
                    bannerImageUploadPending
                  }
                  className="h-14 justify-center text-base font-semibold sm:min-w-36"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("Reset")}
                </Button>
                <Button
                  size="lg"
                  onClick={() => void handleSave()}
                  disabled={
                    pending ||
                    imageUploadPending ||
                    bannerImageUploadPending ||
                    (!changed && mode === "edit")
                  }
                  className="h-14 min-w-[min(100%,22rem)] justify-center text-base font-semibold"
                >
                  <Save className="h-5 w-5" />
                  {pending
                    ? t("Saving...")
                    : mode === "create"
                      ? isIndividual
                        ? t("Create individual publisher")
                        : t("Create organization")
                      : t("Save changes")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiscoverOrganizationWorkbench({
  organization,
  mode = "edit",
  canManageSystemFields = true,
  canManageGrcHighlight = false,
  canDeletePublisher = false,
  deleteSuccessAction = "list",
  routeBase,
  showListBackLink = true,
}: {
  organization?: DiscoverOrganizationRecord;
  mode?: "create" | "edit";
  canManageSystemFields?: boolean;
  canManageGrcHighlight?: boolean;
  canDeletePublisher?: boolean;
  deleteSuccessAction?: DeleteSuccessAction;
  routeBase?: string;
  showListBackLink?: boolean;
}) {
  return (
    <DiscoverPublisherWorkbench
      publisher={organization}
      publisherKind="organization"
      mode={mode}
      canManageSystemFields={canManageSystemFields}
      canManageGrcHighlight={canManageGrcHighlight}
      canDeletePublisher={canDeletePublisher}
      deleteSuccessAction={deleteSuccessAction}
      routeBase={routeBase}
      showListBackLink={showListBackLink}
    />
  );
}

export function DiscoverIndividualWorkbench({
  individual,
  mode = "edit",
  canManageSystemFields = true,
  canManageGrcHighlight = false,
  canDeletePublisher = false,
  deleteSuccessAction = "list",
  routeBase,
  showListBackLink = true,
}: {
  individual?: DiscoverIndividualRecord;
  mode?: "create" | "edit";
  canManageSystemFields?: boolean;
  canManageGrcHighlight?: boolean;
  canDeletePublisher?: boolean;
  deleteSuccessAction?: DeleteSuccessAction;
  routeBase?: string;
  showListBackLink?: boolean;
}) {
  return (
    <DiscoverPublisherWorkbench
      publisher={individual}
      publisherKind="individual"
      mode={mode}
      canManageSystemFields={canManageSystemFields}
      canManageGrcHighlight={canManageGrcHighlight}
      canDeletePublisher={canDeletePublisher}
      deleteSuccessAction={deleteSuccessAction}
      routeBase={routeBase}
      showListBackLink={showListBackLink}
    />
  );
}
