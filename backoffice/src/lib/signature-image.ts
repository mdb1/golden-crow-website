export const SIGNATURE_IMAGE_OUTPUT_WIDTH = 720;
export const SIGNATURE_IMAGE_OUTPUT_HEIGHT = 240;
export const SIGNATURE_IMAGE_MAX_RASTER_DIMENSION = 2048;

export const DEFAULT_SIGNATURE_IMAGE_OPTIONS = Object.freeze({
  contrast: 1.8,
  threshold: 190,
  padding: 24,
});

export type SignatureImageOptions = {
  contrast?: number;
  threshold?: number;
  padding?: number;
};

export type SignaturePixelSource = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type SignatureInkBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type TransformedSignaturePixels = SignaturePixelSource & {
  bounds: SignatureInkBounds;
  inkPixelCount: number;
};

export type NormalizedSignaturePixels = TransformedSignaturePixels & {
  sourceBounds: SignatureInkBounds;
  sourceWidth: number;
  sourceHeight: number;
};

export type ProcessedSignatureImage = {
  dataUrl: string;
  width: typeof SIGNATURE_IMAGE_OUTPUT_WIDTH;
  height: typeof SIGNATURE_IMAGE_OUTPUT_HEIGHT;
  sourceWidth: number;
  sourceHeight: number;
  rasterWidth: number;
  rasterHeight: number;
  sourceBounds: SignatureInkBounds;
  inkPixelCount: number;
};

export type SignatureRasterDimensions = {
  width: number;
  height: number;
};

const NO_VISIBLE_SIGNATURE_ERROR =
  "The image does not contain a visible signature.";

function clampChannel(value: number) {
  return Math.min(255, Math.max(0, value));
}

function validateSource(source: SignaturePixelSource) {
  if (
    !Number.isInteger(source.width) ||
    !Number.isInteger(source.height) ||
    source.width <= 0 ||
    source.height <= 0
  ) {
    throw new Error("Signature image dimensions must be positive integers.");
  }

  if (source.data.length !== source.width * source.height * 4) {
    throw new Error("Signature image pixels do not match its dimensions.");
  }
}

function resolveOptions(options: SignatureImageOptions = {}) {
  const resolved = {
    ...DEFAULT_SIGNATURE_IMAGE_OPTIONS,
    ...options,
  };

  if (!Number.isFinite(resolved.contrast) || resolved.contrast <= 0) {
    throw new Error("Signature image contrast must be greater than zero.");
  }

  if (
    !Number.isFinite(resolved.threshold) ||
    resolved.threshold < 0 ||
    resolved.threshold > 255
  ) {
    throw new Error("Signature image threshold must be between 0 and 255.");
  }

  if (
    !Number.isInteger(resolved.padding) ||
    resolved.padding < 0 ||
    resolved.padding * 2 >= SIGNATURE_IMAGE_OUTPUT_HEIGHT
  ) {
    throw new Error(
      `Signature image padding must be an integer between 0 and ${
        SIGNATURE_IMAGE_OUTPUT_HEIGHT / 2 - 1
      }.`,
    );
  }

  return resolved;
}

function boundsFromExtremes(
  left: number,
  top: number,
  right: number,
  bottom: number,
): SignatureInkBounds {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

/**
 * Bounds camera-size uploads before canvas pixel extraction. Images that are
 * already small enough retain their dimensions; larger images are scaled so
 * their longest side is exactly the configured maximum.
 */
export function fitSignatureRasterDimensions(
  width: number,
  height: number,
  maxDimension = SIGNATURE_IMAGE_MAX_RASTER_DIMENSION,
): SignatureRasterDimensions {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Signature image dimensions must be positive numbers.");
  }
  if (!Number.isInteger(maxDimension) || maxDimension <= 0) {
    throw new Error("Signature raster limit must be a positive integer.");
  }

  const roundedWidth = Math.max(1, Math.round(width));
  const roundedHeight = Math.max(1, Math.round(height));
  const longestSide = Math.max(roundedWidth, roundedHeight);
  if (longestSide <= maxDimension) {
    return { width: roundedWidth, height: roundedHeight };
  }

  const scale = maxDimension / longestSide;
  return {
    width:
      roundedWidth >= roundedHeight
        ? maxDimension
        : Math.max(1, Math.round(roundedWidth * scale)),
    height:
      roundedHeight >= roundedWidth
        ? maxDimension
        : Math.max(1, Math.round(roundedHeight * scale)),
  };
}

/**
 * Converts source pixels into a binary signature mask without using browser
 * APIs. Every retained pixel is opaque black and every discarded pixel is
 * fully transparent. Existing transparent pixels always remain transparent.
 */
export function transformSignaturePixels(
  source: SignaturePixelSource,
  options: SignatureImageOptions = {},
): TransformedSignaturePixels {
  validateSource(source);
  const { contrast, threshold } = resolveOptions(options);
  const data = new Uint8ClampedArray(source.data.length);
  let left = source.width;
  let top = source.height;
  let right = -1;
  let bottom = -1;
  let inkPixelCount = 0;

  for (let pixel = 0; pixel < source.width * source.height; pixel += 1) {
    const offset = pixel * 4;
    const sourceAlpha = source.data[offset + 3];
    let isInk = false;

    if (sourceAlpha > 0) {
      const luminance =
        source.data[offset] * 0.2126 +
        source.data[offset + 1] * 0.7152 +
        source.data[offset + 2] * 0.0722;
      const alpha = sourceAlpha / 255;
      const visibleLuminance = luminance * alpha + 255 * (1 - alpha);
      const contrasted = clampChannel(
        (visibleLuminance - 128) * contrast + 128,
      );
      isInk = contrasted <= threshold;
    }

    if (!isInk) {
      continue;
    }

    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 255;

    const x = pixel % source.width;
    const y = Math.floor(pixel / source.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    inkPixelCount += 1;
  }

  if (inkPixelCount === 0) {
    throw new Error(NO_VISIBLE_SIGNATURE_ERROR);
  }

  return {
    width: source.width,
    height: source.height,
    data,
    bounds: boundsFromExtremes(left, top, right, bottom),
    inkPixelCount,
  };
}

/**
 * Crops the binary ink bounds and centers them in the fixed transparent
 * signature asset. Aspect ratio is preserved and a minimum output pixel is
 * retained for every source ink pixel, so thin pen strokes survive downsizing.
 */
export function normalizeSignaturePixels(
  source: SignaturePixelSource,
  options: SignatureImageOptions = {},
): NormalizedSignaturePixels {
  const resolved = resolveOptions(options);
  const transformed = transformSignaturePixels(source, resolved);
  const { bounds } = transformed;
  const availableWidth = SIGNATURE_IMAGE_OUTPUT_WIDTH - resolved.padding * 2;
  const availableHeight = SIGNATURE_IMAGE_OUTPUT_HEIGHT - resolved.padding * 2;
  const scale = Math.min(
    availableWidth / bounds.width,
    availableHeight / bounds.height,
  );
  const renderedWidth = Math.max(1, Math.round(bounds.width * scale));
  const renderedHeight = Math.max(1, Math.round(bounds.height * scale));
  const offsetX = Math.floor(
    (SIGNATURE_IMAGE_OUTPUT_WIDTH - renderedWidth) / 2,
  );
  const offsetY = Math.floor(
    (SIGNATURE_IMAGE_OUTPUT_HEIGHT - renderedHeight) / 2,
  );
  const output = new Uint8ClampedArray(
    SIGNATURE_IMAGE_OUTPUT_WIDTH * SIGNATURE_IMAGE_OUTPUT_HEIGHT * 4,
  );

  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      if (transformed.data[sourceOffset + 3] === 0) {
        continue;
      }

      const localX = x - bounds.left;
      const localY = y - bounds.top;
      const destinationLeft = offsetX + Math.floor(localX * scale);
      const destinationTop = offsetY + Math.floor(localY * scale);
      const destinationRight = Math.min(
        offsetX + renderedWidth,
        offsetX +
          Math.max(
            destinationLeft - offsetX + 1,
            Math.ceil((localX + 1) * scale),
          ),
      );
      const destinationBottom = Math.min(
        offsetY + renderedHeight,
        offsetY +
          Math.max(
            destinationTop - offsetY + 1,
            Math.ceil((localY + 1) * scale),
          ),
      );

      for (
        let destinationY = destinationTop;
        destinationY < destinationBottom;
        destinationY += 1
      ) {
        for (
          let destinationX = destinationLeft;
          destinationX < destinationRight;
          destinationX += 1
        ) {
          const destinationOffset =
            (destinationY * SIGNATURE_IMAGE_OUTPUT_WIDTH + destinationX) * 4;
          output[destinationOffset] = 0;
          output[destinationOffset + 1] = 0;
          output[destinationOffset + 2] = 0;
          output[destinationOffset + 3] = 255;
        }
      }
    }
  }

  return {
    width: SIGNATURE_IMAGE_OUTPUT_WIDTH,
    height: SIGNATURE_IMAGE_OUTPUT_HEIGHT,
    data: output,
    bounds: boundsFromExtremes(
      offsetX,
      offsetY,
      offsetX + renderedWidth - 1,
      offsetY + renderedHeight - 1,
    ),
    sourceBounds: bounds,
    sourceWidth: source.width,
    sourceHeight: source.height,
    inkPixelCount: transformed.inkPixelCount,
  };
}

function isRasterImageDataUrl(value: string) {
  return /^data:image\/(?!svg\+xml)[^;,]+(?:;[^,]*)?,/i.test(value);
}

function loadDataUrlImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("The signature image could not be loaded."));
    image.src = dataUrl;
  });
}

/**
 * Browser entry point used by upload UIs. It rasterizes an image data URL,
 * applies the pure processing pipeline, and emits a fixed transparent PNG.
 */
export async function processSignatureImageDataUrl(
  dataUrl: string,
  options: SignatureImageOptions = {},
): Promise<ProcessedSignatureImage> {
  if (!isRasterImageDataUrl(dataUrl)) {
    throw new Error("The signature must be a raster image data URL.");
  }
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("Signature image processing requires a browser.");
  }

  const image = await loadDataUrlImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("The signature image has invalid dimensions.");
  }
  const raster = fitSignatureRasterDimensions(sourceWidth, sourceHeight);

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = raster.width;
  sourceCanvas.height = raster.height;
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sourceContext) {
    throw new Error("The signature image canvas is not available.");
  }
  sourceContext.clearRect(0, 0, raster.width, raster.height);
  sourceContext.drawImage(image, 0, 0, raster.width, raster.height);
  const sourcePixels = sourceContext.getImageData(
    0,
    0,
    raster.width,
    raster.height,
  );
  const normalized = normalizeSignaturePixels(
    {
      width: raster.width,
      height: raster.height,
      data: sourcePixels.data,
    },
    options,
  );

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = SIGNATURE_IMAGE_OUTPUT_WIDTH;
  outputCanvas.height = SIGNATURE_IMAGE_OUTPUT_HEIGHT;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) {
    throw new Error("The signature image canvas is not available.");
  }
  const outputPixels = outputContext.createImageData(
    SIGNATURE_IMAGE_OUTPUT_WIDTH,
    SIGNATURE_IMAGE_OUTPUT_HEIGHT,
  );
  outputPixels.data.set(normalized.data);
  outputContext.putImageData(outputPixels, 0, 0);

  return {
    dataUrl: outputCanvas.toDataURL("image/png"),
    width: SIGNATURE_IMAGE_OUTPUT_WIDTH,
    height: SIGNATURE_IMAGE_OUTPUT_HEIGHT,
    sourceWidth,
    sourceHeight,
    rasterWidth: raster.width,
    rasterHeight: raster.height,
    sourceBounds: normalized.sourceBounds,
    inkPixelCount: normalized.inkPixelCount,
  };
}
