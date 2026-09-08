"use client";

import Link from "next/link";
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
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Link2,
  Loader2,
  PackageOpen,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppLanguage } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { cn } from "@/lib/utils";
import type {
  DiscoverOrganizationProductCatalogItem,
  DiscoverOrganizationRecord,
} from "@/lib/discover";

type CatalogItemFormState = {
  title: string;
  description: string;
  imageUrl: string;
  imageUploadDataUrl: string;
  imageUploadName: string;
  imageUploadMimeType: string;
  productUrl: string;
  callToActionLabel: string;
};

type ImageUploadStatusTone = "loading" | "success" | "warning" | "error";
type ImageUploadStatus = {
  tone: ImageUploadStatusTone;
  message: string;
  href?: string;
  linkLabel?: string;
};

type ProcessedProductImageUpload = {
  dataUrl: string;
  name: string;
  mimeType: string;
  compressed: boolean;
};

const PRODUCT_DESCRIPTION_MIN_LENGTH = 30;
const PRODUCT_DESCRIPTION_RECOMMENDED_MAX_LENGTH = 100;
const PRODUCT_IMAGE_UPLOAD_MAX_BYTES = 600 * 1024;
const PRODUCT_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH = 900000;
const PRODUCT_IMAGE_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const PRODUCT_IMAGE_COMPRESSION_MIME_TYPES = [
  "image/webp",
  "image/jpeg",
] as const;
const PRODUCT_IMAGE_COMPRESSION_DIMENSION_STEPS = [
  1600, 1200, 960, 720, 560, 420, 320,
] as const;
const PRODUCT_IMAGE_COMPRESSION_QUALITY_STEPS = [
  0.86, 0.76, 0.66, 0.56, 0.46, 0.36,
] as const;
const IMAGE_REDUCER_URL = "https://squoosh.app/";
const DEFAULT_ACCENT = "#6D28D9";
const CREATE_REDIRECT_DELAY_MS = 1200;
const publisherFieldPanelClass =
  "rounded-2xl border border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(250,250,255,0.94)_58%,rgba(245,243,255,0.86))] p-5 shadow-[0_18px_56px_-48px_rgba(109,40,217,0.48)] dark:border-violet-400/16 dark:bg-[linear-gradient(145deg,rgba(18,23,40,0.94),rgba(30,24,57,0.86))]";
const publisherPrimaryButtonClass =
  "h-10 rounded-xl bg-violet-600 px-4 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700";
const publisherSoftButtonClass =
  "h-9 rounded-xl border-violet-200/80 bg-white/78 px-3 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50 dark:hover:bg-violet-500/18";
const publisherInputClass =
  "h-11 rounded-xl border-violet-200/75 bg-white/90 shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-300/35 dark:border-violet-400/18 dark:bg-slate-950/45";

function stripUrlScheme(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^https?:\/\//i, "");
}

function toFormState(
  item?: DiscoverOrganizationProductCatalogItem | null,
): CatalogItemFormState {
  const uploadedImage = item?.imageUploadDataUrl ?? "";

  return {
    title: item?.title ?? "",
    description: item?.description ?? "",
    imageUrl: uploadedImage ? "" : stripUrlScheme(item?.imageUrl),
    imageUploadDataUrl: uploadedImage,
    imageUploadName: item?.imageUploadName ?? "",
    imageUploadMimeType: item?.imageUploadMimeType ?? "",
    productUrl: stripUrlScheme(item?.productUrl),
    callToActionLabel: item?.callToActionLabel ?? "",
  };
}

function normalizeHttpsUrlInput(value: string) {
  const stripped = stripUrlScheme(value);
  if (!stripped) {
    return "";
  }

  try {
    const url = new URL(`https://${stripped}`);
    return url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

function payloadFromState(state: CatalogItemFormState) {
  const imageUrl = normalizeHttpsUrlInput(state.imageUrl);
  const productUrl = normalizeHttpsUrlInput(state.productUrl);

  return {
    title: state.title.trim(),
    description: state.description.trim(),
    imageUrl: imageUrl || null,
    imageUploadDataUrl:
      state.imageUploadDataUrl || (state.imageUrl.trim() ? null : undefined),
    imageUploadName: state.imageUploadName || undefined,
    imageUploadMimeType: state.imageUploadMimeType || undefined,
    productUrl: productUrl || null,
    callToActionLabel: productUrl
      ? state.callToActionLabel.trim() || null
      : null,
  };
}

function previewUrlLabel(value: string) {
  const stripped = stripUrlScheme(value).replace(/\/$/, "");
  return stripped.length > 34 ? `${stripped.slice(0, 31)}...` : stripped;
}

function isValidOptionalHttpsUrl(value: string) {
  return !value.trim() || Boolean(normalizeHttpsUrlInput(value));
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

function productImageCompressionFileName(file: File, mimeType: string) {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const rawName = file.name || `catalog-image.${extension}`;
  const baseName = rawName.replace(/\.[^.]+$/, "") || "catalog-image";

  return `${baseName}-compressed.${extension}`;
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
      [sourceMax, ...PRODUCT_IMAGE_COMPRESSION_DIMENSION_STEPS]
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

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

async function compressProductImageFile(file: File) {
  const image = await loadImageElementFromFile(file);
  const dimensions = imageCompressionDimensions(image);

  for (const mimeType of PRODUCT_IMAGE_COMPRESSION_MIME_TYPES) {
    for (const maxDimension of dimensions) {
      const canvas = drawCompressedImage(image, maxDimension, mimeType);

      for (const quality of PRODUCT_IMAGE_COMPRESSION_QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, mimeType, quality);

        if (!blob || blob.size === 0) {
          continue;
        }

        if (blob.size <= PRODUCT_IMAGE_UPLOAD_MAX_BYTES) {
          return new File(
            [blob],
            productImageCompressionFileName(file, mimeType),
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

async function processProductImageFile(
  file: File,
): Promise<ProcessedProductImageUpload> {
  if (!PRODUCT_IMAGE_UPLOAD_TYPES.has(file.type)) {
    throw new Error("IMAGE_TYPE_UNSUPPORTED");
  }

  const acceptedFile =
    file.size > PRODUCT_IMAGE_UPLOAD_MAX_BYTES && canResizeImagesInBrowser()
      ? await compressProductImageFile(file)
      : file;
  let dataUrl = await readFileAsDataUrl(acceptedFile);
  let finalFile = acceptedFile;

  if (
    dataUrl.length > PRODUCT_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH &&
    acceptedFile === file &&
    canResizeImagesInBrowser()
  ) {
    finalFile = await compressProductImageFile(file);
    dataUrl = await readFileAsDataUrl(finalFile);
  }

  if (dataUrl.length > PRODUCT_IMAGE_UPLOAD_DATA_URL_MAX_LENGTH) {
    throw new Error("IMAGE_COMPRESSION_FAILED");
  }

  return {
    dataUrl,
    name: finalFile.name,
    mimeType: finalFile.type,
    compressed: finalFile !== file,
  };
}

function imageStatusClassName(tone: ImageUploadStatusTone) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (tone === "error") {
    return "border-destructive/30 bg-destructive/8 text-destructive";
  }

  return "border-brand/25 bg-brand/8 text-brand";
}

function ProductUrlInput({
  id,
  label,
  value,
  placeholder,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex h-11 overflow-hidden rounded-xl border border-violet-200/75 bg-white/90 shadow-sm focus-within:border-violet-400 focus-within:ring-3 focus-within:ring-violet-300/35 dark:border-violet-400/18 dark:bg-slate-950/45">
        <span className="flex shrink-0 items-center border-r border-violet-100/80 bg-violet-50/70 px-3 text-sm font-medium text-violet-700 dark:border-violet-400/16 dark:bg-violet-500/8 dark:text-violet-100">
          https://
        </span>
        <input
          id={id}
          value={stripUrlScheme(value)}
          onChange={(event) => onChange(stripUrlScheme(event.target.value))}
          placeholder={placeholder}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-white/70 disabled:text-muted-foreground"
        />
      </div>
    </div>
  );
}

function ProductPreview({
  organization,
  state,
  imagePreviewSource,
}: {
  organization: DiscoverOrganizationRecord;
  state: CatalogItemFormState;
  imagePreviewSource: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const accent = organization.colorHex || DEFAULT_ACCENT;
  const productHref = normalizeHttpsUrlInput(state.productUrl) || "";
  const label = state.callToActionLabel.trim() || t("View product");

  return (
    <aside className="xl:sticky xl:top-24">
      <div className="overflow-hidden rounded-2xl border border-violet-100/80 bg-white/92 shadow-[0_22px_62px_-46px_rgba(109,40,217,0.46)] dark:border-violet-400/16 dark:bg-slate-950/50">
        <div className="relative min-h-[180px] bg-[radial-gradient(circle_at_top_left,rgba(109,40,217,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.95),rgba(245,243,255,0.86)_54%,rgba(240,249,255,0.74))] p-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.20),transparent_34%),linear-gradient(135deg,rgba(30,24,57,0.94),rgba(12,35,54,0.68))]">
          <div
            className="absolute right-6 top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
            style={{ backgroundColor: accent }}
          />
          <div className="relative flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm font-bold text-white shadow-lg"
              style={{ backgroundColor: accent }}
            >
              {organization.imageUploadDataUrl || organization.imageUrl ? (
                <img
                  src={organization.imageUploadDataUrl || organization.imageUrl || ""}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                organization.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("Catalog preview")}
              </p>
              <h3 className="truncate font-heading text-lg font-semibold text-foreground">
                {organization.name}
              </h3>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="overflow-hidden rounded-2xl border border-violet-100 bg-violet-50/45 shadow-sm dark:border-violet-400/14 dark:bg-violet-500/8">
            <div className="aspect-[4/3] bg-background">
              {imagePreviewSource ? (
                <img
                  src={imagePreviewSource}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <PackageOpen className="h-8 w-8" />
                </div>
              )}
            </div>
          </div>
          <h4 className="mt-4 font-heading text-2xl font-semibold leading-tight text-foreground">
            {state.title.trim() || t("Product title")}
          </h4>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
            {state.description.trim() ||
              t("The product description will appear here.")}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {productHref ? (
              <a
                href={productHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-lg"
                style={{ backgroundColor: accent }}
              >
                {label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <Badge variant="outline">{t("No product URL")}</Badge>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function DiscoverOrganizationProductCatalogWorkbench({
  organization,
  item,
  mode = "edit",
  routeBase,
  organizationHref,
}: {
  organization: DiscoverOrganizationRecord;
  item?: DiscoverOrganizationProductCatalogItem;
  mode?: "create" | "edit";
  routeBase: string;
  organizationHref: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadTokenRef = useRef(0);
  const [state, setState] = useState(() => toFormState(item));
  const [persistedState, setPersistedState] = useState(() =>
    toFormState(item),
  );
  const [pending, setPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [imageUploadPending, setImageUploadPending] = useState(false);
  const [imageUploadDragging, setImageUploadDragging] = useState(false);
  const [imageUploadStatus, setImageUploadStatus] =
    useState<ImageUploadStatus | null>(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const hasImageUrl = Boolean(state.imageUrl.trim());
  const hasUploadedImage = Boolean(state.imageUploadDataUrl);
  const imagePreviewSource =
    state.imageUploadDataUrl || normalizeHttpsUrlInput(state.imageUrl) || "";
  const changed = JSON.stringify(state) !== JSON.stringify(persistedState);
  const titleReady = state.title.trim().length >= 2;
  const descriptionLength = state.description.trim().length;
  const descriptionReady = descriptionLength >= PRODUCT_DESCRIPTION_MIN_LENGTH;
  const descriptionTooLong =
    descriptionLength > PRODUCT_DESCRIPTION_RECOMMENDED_MAX_LENGTH;
  const descriptionBadgeVariant = descriptionTooLong
    ? "warning"
    : descriptionReady
      ? "success"
      : "outline";
  const imageUrlValid = isValidOptionalHttpsUrl(state.imageUrl);
  const productUrlValid = isValidOptionalHttpsUrl(state.productUrl);
  const canSave =
    titleReady &&
    descriptionReady &&
    imageUrlValid &&
    productUrlValid &&
    !pending &&
    !imageUploadPending &&
    (mode === "create" || changed);
  const saveLabel = mode === "create" ? t("Create product") : t("Save changes");
  const saveHint = !titleReady
    ? t("Add a product title to continue.")
    : !descriptionReady
      ? t("Write at least 30 characters in the description.")
      : !imageUrlValid
        ? t("Use a valid image URL.")
        : !productUrlValid
          ? t("Use a valid product URL.")
          : changed
            ? t("Ready to save.")
            : t("No unsaved changes.");

  const imageStatus = useMemo(() => {
    if (!imageUploadStatus) {
      return null;
    }

    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
          imageStatusClassName(imageUploadStatus.tone),
        )}
      >
        {imageUploadStatus.tone === "loading" ? (
          <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
        ) : imageUploadStatus.tone === "success" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4" />
        ) : (
          <ImageIcon className="mt-0.5 h-4 w-4" />
        )}
        <div>
          <span>{imageUploadStatus.message}</span>
          {imageUploadStatus.href ? (
            <>
              {" "}
              <a
                href={imageUploadStatus.href}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                {imageUploadStatus.linkLabel}
              </a>
            </>
          ) : null}
        </div>
      </div>
    );
  }, [imageUploadStatus]);

  function updateState(patch: Partial<CatalogItemFormState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  async function processUpload(file: File) {
    const token = uploadTokenRef.current + 1;
    uploadTokenRef.current = token;
    setImageUploadDragging(false);
    setImageUploadPending(true);
    setImageUploadStatus({
      tone: "loading",
      message:
        file.size > PRODUCT_IMAGE_UPLOAD_MAX_BYTES
          ? t("Compressing uploaded product image...")
          : t("Preparing uploaded product image..."),
    });

    try {
      const upload = await processProductImageFile(file);
      if (uploadTokenRef.current !== token) {
        return;
      }

      updateState({
        imageUrl: "",
        imageUploadDataUrl: upload.dataUrl,
        imageUploadName: upload.name,
        imageUploadMimeType: upload.mimeType,
      });
      setImageUploadStatus({
        tone: "success",
        message: upload.compressed
          ? t("Image compressed and ready.")
          : t("Image ready."),
      });
    } catch (error) {
      if (uploadTokenRef.current !== token) {
        return;
      }

      const message =
        error instanceof Error && error.message === "IMAGE_TYPE_UNSUPPORTED"
          ? t("Use a PNG, JPG, or WebP image.")
          : t("The image is still too large after compression.");
      setImageUploadStatus({
        tone:
          error instanceof Error && error.message === "IMAGE_TYPE_UNSUPPORTED"
            ? "error"
            : "warning",
        message,
        href:
          error instanceof Error && error.message === "IMAGE_TYPE_UNSUPPORTED"
            ? undefined
            : IMAGE_REDUCER_URL,
        linkLabel: t("Compress it for free"),
      });
    } finally {
      if (uploadTokenRef.current === token) {
        setImageUploadPending(false);
      }
    }
  }

  function handleUploadInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void processUpload(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const file = Array.from(event.dataTransfer.files).find((entry) =>
      PRODUCT_IMAGE_UPLOAD_TYPES.has(entry.type),
    );
    if (file) {
      void processUpload(file);
    } else {
      setImageUploadDragging(false);
      setImageUploadStatus({
        tone: "error",
        message: t("Use a PNG, JPG, or WebP image."),
      });
    }
  }

  function clearImage() {
    uploadTokenRef.current += 1;
    setImageUploadPending(false);
    setImageUploadStatus(null);
    updateState({
      imageUrl: "",
      imageUploadDataUrl: "",
      imageUploadName: "",
      imageUploadMimeType: "",
    });
  }

  async function save() {
    if (!canSave) {
      setToast({ id: Date.now(), tone: "error", message: saveHint });
      return;
    }

    setPending(true);
    let keepPendingForRedirect = false;
    try {
      const endpoint =
        mode === "create"
          ? `/discover/organizations/${encodeURIComponent(
              organization.id,
            )}/product-catalog`
          : `/discover/organizations/${encodeURIComponent(
              organization.id,
            )}/product-catalog/${encodeURIComponent(item!.id)}`;
      const response = await sdkFetch<{
        catalogItem: DiscoverOrganizationProductCatalogItem;
      }>(endpoint, {
        method: mode === "create" ? "POST" : "PUT",
        body: JSON.stringify(payloadFromState(state)),
      });
      const nextState = toFormState(response.catalogItem);
      setState(nextState);
      setPersistedState(nextState);
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          mode === "create"
            ? t("Product added.")
            : t("Product saved."),
      });
      router.refresh();
      if (mode === "create") {
        keepPendingForRedirect = true;
        window.setTimeout(() => {
          router.push(routeBase);
        }, CREATE_REDIRECT_DELAY_MS);
      }
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("Unable to save product."),
      });
    } finally {
      if (!keepPendingForRedirect) {
        setPending(false);
      }
    }
  }

  async function deleteCatalogItem() {
    if (!item) {
      return;
    }

    setDeletePending(true);
    try {
      await sdkFetch<{ deleted: boolean; catalogItemId: string }>(
        `/discover/organizations/${encodeURIComponent(
          organization.id,
        )}/product-catalog/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      router.refresh();
      router.push(routeBase);
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("Unable to delete the product."),
      });
      setDeletePending(false);
    }
  }

  return (
    <section className="pb-28">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div
          data-testid="product-catalog-workbench-title"
          className="min-w-0"
        >
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate font-heading text-xl font-semibold text-foreground">
              {mode === "create"
                ? t("Add product to catalog")
                : state.title.trim() || t("Product item")}
            </h2>
            <HeaderUnclutterButton />
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {organization.name}
          </p>
        </div>

        <nav
          aria-label="Product catalog navigation"
          data-testid="product-catalog-workbench-navigation"
          className="flex w-full flex-col gap-1 rounded-2xl border border-violet-200/70 bg-white/86 p-1.5 shadow-[0_18px_46px_-38px_rgba(109,40,217,0.45)] sm:w-auto lg:min-w-60 dark:border-violet-400/18 dark:bg-violet-500/8"
        >
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-9 justify-start rounded-xl text-violet-800 hover:bg-violet-100 hover:text-violet-950 dark:text-violet-100 dark:hover:bg-violet-500/14"
          >
            <Link href={routeBase}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("Back to product catalog")}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-9 justify-start rounded-xl text-violet-800 hover:bg-violet-100 hover:text-violet-950 dark:text-violet-100 dark:hover:bg-violet-500/14"
          >
            <Link href={organizationHref}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("Back to organization")}
            </Link>
          </Button>
        </nav>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className={publisherFieldPanelClass}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="brand">{t("Catalog")}</Badge>
              <Badge variant={descriptionBadgeVariant}>
                {descriptionLength}/{PRODUCT_DESCRIPTION_RECOMMENDED_MAX_LENGTH}
              </Badge>
            </div>
            <div
              data-testid="product-catalog-primary-fields"
              className="mt-4 flex flex-col gap-4"
            >
              <div className="space-y-2">
                <Label htmlFor="catalog-title">{t("Product title")}</Label>
                <Input
                  id="catalog-title"
                  value={state.title}
                  onChange={(event) =>
                    updateState({ title: event.target.value.slice(0, 180) })
                  }
                  placeholder={t("Example: Full genome report")}
                  className={publisherInputClass}
                />
                <p className="text-xs text-muted-foreground">
                  {t("Use the public-facing product name.")}
                </p>
              </div>

              <ProductUrlInput
                id="catalog-product-url"
                label={t("Product URL")}
                value={state.productUrl}
                placeholder="example.com/products/full-genome"
                onChange={(value) => updateState({ productUrl: value })}
              />
              {!productUrlValid ? (
                <p className="text-sm text-destructive">
                  {t("Use a valid product URL.")}
                </p>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="catalog-cta">{t("Button label")}</Label>
                <Input
                  id="catalog-cta"
                  value={state.callToActionLabel}
                  onChange={(event) =>
                    updateState({
                      callToActionLabel: event.target.value.slice(0, 80),
                    })
                  }
                  placeholder={t("View product")}
                  disabled={!state.productUrl.trim()}
                  className={publisherInputClass}
                />
                <p className="text-xs text-muted-foreground">
                  {state.productUrl.trim()
                    ? t("Optional. Used as the product link label.")
                    : t("Add a product URL to enable this label.")}
                </p>
              </div>
            </div>
          </div>

          <div className={publisherFieldPanelClass}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {t("Product image")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("Use a URL or upload a small PNG, JPG, or WebP file.")}
                </p>
              </div>
              {hasImageUrl || hasUploadedImage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearImage}
                  className={publisherSoftButtonClass}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("Choose another image")}
                </Button>
              ) : null}
            </div>

            <input
              ref={uploadInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleUploadInput}
            />

            <div className="mt-4">
              {hasUploadedImage ? (
                <div className="relative overflow-hidden rounded-3xl border border-violet-200/70 bg-[linear-gradient(145deg,rgba(245,243,255,0.8),rgba(255,255,255,0.92))] p-5 shadow-inner dark:border-violet-400/16 dark:bg-violet-500/8">
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-red-300/50 dark:bg-red-600 dark:text-white dark:hover:bg-red-500"
                    aria-label={t("Remove image")}
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                  <div className="mx-auto flex max-w-sm flex-col items-center text-center">
                    <div className="relative">
                      <div className="absolute inset-0 animate-pulse rounded-[2rem] bg-violet-400/22 blur-2xl" />
                      <div className="relative h-48 w-48 overflow-hidden rounded-[2rem] border border-white/80 bg-background shadow-2xl">
                        <img
                          src={state.imageUploadDataUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                    <Badge variant="success" className="mt-4">
                      <Sparkles className="h-3 w-3" />
                      {t("Image ready")}
                    </Badge>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {state.imageUploadName
                        ? `${state.imageUploadName} · ${state.imageUploadMimeType}`
                        : t("Uploaded image selected.")}
                    </p>
                  </div>
                </div>
              ) : hasImageUrl ? (
                <div className="grid gap-3">
                  <ProductUrlInput
                    id="catalog-image-url"
                    label={t("Image URL")}
                    value={state.imageUrl}
                    placeholder="example.com/product.png"
                    onChange={(value) => {
                      updateState({
                        imageUrl: value,
                        imageUploadDataUrl: "",
                        imageUploadName: "",
                        imageUploadMimeType: "",
                      });
                    }}
                  />
                  {!imageUrlValid ? (
                    <p className="text-sm text-destructive">
                      {t("Use a valid image URL.")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <ProductUrlInput
                    id="catalog-image-url"
                    label={t("Image URL")}
                    value={state.imageUrl}
                    placeholder="example.com/product.png"
                    onChange={(value) =>
                      updateState({
                        imageUrl: value,
                        imageUploadDataUrl: "",
                        imageUploadName: "",
                        imageUploadMimeType: "",
                      })
                    }
                  />

                  <div
                    role="button"
                    tabIndex={0}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setImageUploadDragging(true);
                    }}
                    onDragLeave={() => setImageUploadDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => uploadInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        uploadInputRef.current?.click();
                      }
                    }}
                    className={cn(
                      "flex min-h-32 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-violet-300/70 bg-violet-50/55 p-4 shadow-inner transition-all hover:border-violet-400 hover:bg-violet-50 focus:outline-none focus:ring-3 focus:ring-violet-300/35 dark:border-violet-400/24 dark:bg-violet-500/8",
                      imageUploadDragging && "scale-[1.01] border-violet-500 bg-violet-100/70 dark:bg-violet-500/14",
                    )}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm dark:bg-violet-500/12 dark:text-violet-100">
                      {imageUploadPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <UploadCloud className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium text-foreground">
                        {t("Upload product image")}
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("Drop it here or choose a file up to 600 KB.")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        PNG, JPG, WebP · {formatFileSize(PRODUCT_IMAGE_UPLOAD_MAX_BYTES)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {imageStatus ? <div className="mt-3">{imageStatus}</div> : null}
          </div>

          <div className={publisherFieldPanelClass}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {t("Product description")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("Explain what the product is, who it helps, and what happens after opening it.")}
                </p>
              </div>
              <Badge variant={descriptionBadgeVariant}>
                {descriptionLength}/{PRODUCT_DESCRIPTION_RECOMMENDED_MAX_LENGTH}
              </Badge>
            </div>
            <Textarea
              value={state.description}
              onChange={(event) =>
                updateState({ description: event.target.value.slice(0, 5000) })
              }
              placeholder={t("Describe this product for people browsing Pocket Genes.")}
              className="mt-4 min-h-48 resize-y rounded-xl border-violet-200/75 bg-white/90 shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-300/35 dark:border-violet-400/18 dark:bg-slate-950/45"
            />
            {descriptionTooLong ? (
              <div
                role="alert"
                className="mt-3 flex gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {t(
                    "Product descriptions appear in small cards alongside other products. We suggest keeping this under 100 characters so the content displays clearly.",
                  )}
                </p>
              </div>
            ) : null}
          </div>

          {mode === "edit" && item ? (
            <div className="glass-panel border-destructive/20 p-5">
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {t("Danger zone")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Delete this product from the organization profile.")}
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="mt-4 rounded-xl"
                    disabled={deletePending}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletePending ? t("Deleting...") : t("Delete product")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("Delete product?")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t(
                        "This removes the product from the organization catalog. This action cannot be undone.",
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => void deleteCatalogItem()}
                    >
                      {t("Delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}
        </div>

        <ProductPreview
          organization={organization}
          state={state}
          imagePreviewSource={imagePreviewSource}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-violet-100/80 bg-white/92 px-4 py-3 shadow-[0_-20px_60px_rgba(109,40,217,0.10)] backdrop-blur dark:border-violet-400/14 dark:bg-slate-950/88">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center text-sm text-muted-foreground">
            <span className="truncate">{saveHint}</span>
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            {state.productUrl.trim() && normalizeHttpsUrlInput(state.productUrl) ? (
              <Button
                variant="outline"
                size="sm"
                asChild
                className={publisherSoftButtonClass}
              >
                <a
                  href={normalizeHttpsUrlInput(state.productUrl) || "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {previewUrlLabel(state.productUrl)}
                </a>
              </Button>
            ) : null}
            <Button
              onClick={() => void save()}
              disabled={!canSave}
              className={publisherPrimaryButtonClass}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {pending ? t("Saving...") : saveLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
