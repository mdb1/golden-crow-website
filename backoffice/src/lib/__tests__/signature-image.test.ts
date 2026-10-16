import {
  DEFAULT_SIGNATURE_IMAGE_OPTIONS,
  fitSignatureRasterDimensions,
  normalizeSignaturePixels,
  SIGNATURE_IMAGE_MAX_RASTER_DIMENSION,
  SIGNATURE_IMAGE_OUTPUT_HEIGHT,
  SIGNATURE_IMAGE_OUTPUT_WIDTH,
  transformSignaturePixels,
} from "@/lib/signature-image";

function pixels(
  width: number,
  height: number,
  values: Array<[number, number, number, number]>,
) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(values.flat()),
  };
}

describe("signature image processing", () => {
  it("bounds large rasters to 2048 pixels without changing aspect ratio", () => {
    expect(fitSignatureRasterDimensions(4032, 3024)).toEqual({
      width: SIGNATURE_IMAGE_MAX_RASTER_DIMENSION,
      height: 1536,
    });
    expect(fitSignatureRasterDimensions(1000, 3000)).toEqual({
      width: 683,
      height: SIGNATURE_IMAGE_MAX_RASTER_DIMENSION,
    });
    expect(fitSignatureRasterDimensions(720, 240)).toEqual({
      width: 720,
      height: 240,
    });
  });

  it("turns retained ink pure black and the white background transparent", () => {
    const result = transformSignaturePixels(
      pixels(2, 1, [
        [12, 24, 32, 255],
        [255, 255, 255, 255],
      ]),
    );

    expect(Array.from(result.data)).toEqual([0, 0, 0, 255, 0, 0, 0, 0]);
    expect(result.bounds).toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 1,
      height: 1,
    });
    expect(result.inkPixelCount).toBe(1);
  });

  it("never revives a pre-existing transparent pixel", () => {
    const result = transformSignaturePixels(
      pixels(2, 1, [
        [0, 0, 0, 0],
        [0, 0, 0, 255],
      ]),
    );

    expect(Array.from(result.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(result.data.slice(4))).toEqual([0, 0, 0, 255]);
    expect(result.inkPixelCount).toBe(1);
  });

  it("supports explicit contrast and black/white threshold controls", () => {
    const grayPixel = pixels(1, 1, [[110, 110, 110, 255]]);

    expect(() =>
      transformSignaturePixels(grayPixel, { contrast: 1, threshold: 100 }),
    ).toThrow("The image does not contain a visible signature.");
    expect(
      transformSignaturePixels(grayPixel, { contrast: 2, threshold: 100 })
        .inkPixelCount,
    ).toBe(1);
  });

  it("rejects an image with no visible signature", () => {
    expect(() =>
      transformSignaturePixels(
        pixels(2, 1, [
          [255, 255, 255, 255],
          [0, 0, 0, 0],
        ]),
      ),
    ).toThrow("The image does not contain a visible signature.");
  });

  it("auto-crops and centers ink in a padded 720 by 240 transparent asset", () => {
    const result = normalizeSignaturePixels(
      pixels(6, 4, [
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
      ]),
    );

    expect(result.width).toBe(SIGNATURE_IMAGE_OUTPUT_WIDTH);
    expect(result.height).toBe(SIGNATURE_IMAGE_OUTPUT_HEIGHT);
    expect(result.sourceBounds).toEqual({
      left: 1,
      top: 1,
      right: 4,
      bottom: 2,
      width: 4,
      height: 2,
    });
    expect(result.bounds).toEqual({
      left: 168,
      top: DEFAULT_SIGNATURE_IMAGE_OPTIONS.padding,
      right: 551,
      bottom: 215,
      width: 384,
      height: 192,
    });

    const cornerAlpha = result.data[3];
    const inkAlpha =
      result.data[
        (result.bounds.top * SIGNATURE_IMAGE_OUTPUT_WIDTH +
          result.bounds.left) *
          4 +
          3
      ];
    expect(cornerAlpha).toBe(0);
    expect(inkAlpha).toBe(255);
  });

  it("validates pixel dimensions and processing options", () => {
    expect(() =>
      transformSignaturePixels({
        width: 2,
        height: 2,
        data: new Uint8ClampedArray(4),
      }),
    ).toThrow("Signature image pixels do not match its dimensions.");
    expect(() =>
      transformSignaturePixels(pixels(1, 1, [[0, 0, 0, 255]]), {
        threshold: 256,
      }),
    ).toThrow("Signature image threshold must be between 0 and 255.");
  });
});
