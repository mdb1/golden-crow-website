import {
  SUPPORT_SERVICE_MORE_INFORMATION_IMAGE_DATA_URL_MAX_LENGTH,
  isSupportServiceMoreInformationImageDataUrl,
} from "@/lib/support-services";

export const SUPPORT_SERVICE_MORE_INFORMATION_IMAGE_UPLOAD_MAX_BYTES =
  600 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const COMPRESSION_MIME_TYPES = ["image/webp", "image/jpeg"] as const;
const COMPRESSION_DIMENSIONS = [1600, 1200, 960, 720, 560, 420, 320];
const COMPRESSION_QUALITY_STEPS = [
  0.86, 0.76, 0.66, 0.56, 0.46, 0.36,
];

export type ProcessedSupportServiceImageUpload = {
  dataUrl: string;
  compressed: boolean;
};

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

function loadImage(file: File) {
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

function imageDimensions(image: HTMLImageElement) {
  const sourceMax = Math.max(
    image.naturalWidth || image.width || 0,
    image.naturalHeight || image.height || 0,
  );
  if (!sourceMax) {
    return [];
  }
  return Array.from(
    new Set(
      [sourceMax, ...COMPRESSION_DIMENSIONS]
        .map((dimension) => Math.min(sourceMax, dimension))
        .filter((dimension) => Number.isFinite(dimension) && dimension > 0),
    ),
  ).sort((a, b) => b - a);
}

function drawImage(
  image: HTMLImageElement,
  maxDimension: number,
  mimeType: string,
) {
  const sourceWidth = image.naturalWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.height || 0;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
  }

  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
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

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

async function compressImage(file: File) {
  const image = await loadImage(file);
  for (const mimeType of COMPRESSION_MIME_TYPES) {
    for (const dimension of imageDimensions(image)) {
      const canvas = drawImage(image, dimension, mimeType);
      for (const quality of COMPRESSION_QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, mimeType, quality);
        if (
          blob &&
          blob.size > 0 &&
          blob.size <=
            SUPPORT_SERVICE_MORE_INFORMATION_IMAGE_UPLOAD_MAX_BYTES
        ) {
          return new File([blob], "illustrated-segment-image", {
            type: mimeType,
            lastModified: Date.now(),
          });
        }
      }
    }
  }
  throw new Error("IMAGE_COMPRESSION_FAILED");
}

export async function processSupportServiceImageUpload(
  file: File,
): Promise<ProcessedSupportServiceImageUpload> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("IMAGE_TYPE_UNSUPPORTED");
  }

  const acceptedFile =
    file.size > SUPPORT_SERVICE_MORE_INFORMATION_IMAGE_UPLOAD_MAX_BYTES
      ? await compressImage(file)
      : file;
  let finalFile = acceptedFile;
  let dataUrl = await readFileAsDataUrl(finalFile);
  if (
    dataUrl.length >
      SUPPORT_SERVICE_MORE_INFORMATION_IMAGE_DATA_URL_MAX_LENGTH &&
    acceptedFile === file
  ) {
    finalFile = await compressImage(file);
    dataUrl = await readFileAsDataUrl(finalFile);
  }

  if (!isSupportServiceMoreInformationImageDataUrl(dataUrl)) {
    throw new Error("IMAGE_COMPRESSION_FAILED");
  }
  return { dataUrl, compressed: finalFile !== file };
}
