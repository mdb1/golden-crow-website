/** @jest-environment jsdom */
// processSupportServiceImageUpload (epic #451): type allow-list, the 600 KB
// size gate, and the compression fallback. jsdom has FileReader but no image
// decoding or canvas, so Image + canvas are stubbed per test.

import {
  SUPPORT_SERVICE_MORE_INFORMATION_IMAGE_UPLOAD_MAX_BYTES,
  processSupportServiceImageUpload,
} from "@/lib/support-service-image-upload";

const MAX = SUPPORT_SERVICE_MORE_INFORMATION_IMAGE_UPLOAD_MAX_BYTES;

function fileOf(size: number, type: string, name = "img") {
  return new File([new Uint8Array(size).fill(65)], name, { type });
}

class FakeImage {
  naturalWidth = 3000;
  naturalHeight = 2000;
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static fail = false;
  set src(_value: string) {
    setTimeout(() => (FakeImage.fail ? this.onerror?.() : this.onload?.()), 0);
  }
}

const originalImage = globalThis.Image;
let toBlobSizes: number[];
let toBlobCalls: Array<{ type: string; quality: number; width: number }>;
let getContextSpy: jest.SpyInstance;
let toBlobSpy: jest.SpyInstance;

beforeEach(() => {
  FakeImage.fail = false;
  (globalThis as unknown as { Image: unknown }).Image = FakeImage;
  URL.createObjectURL = jest.fn(() => "blob:fake");
  URL.revokeObjectURL = jest.fn();
  toBlobSizes = [];
  toBlobCalls = [];
  getContextSpy = jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(
      () =>
        ({
          fillRect: jest.fn(),
          drawImage: jest.fn(),
        }) as unknown as CanvasRenderingContext2D,
    );
  toBlobSpy = jest
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
      quality?: number,
    ) {
      toBlobCalls.push({ type: type!, quality: quality!, width: this.width });
      const size = toBlobSizes.length ? toBlobSizes.shift()! : MAX + 1;
      callback(new Blob([new Uint8Array(size).fill(66)], { type }));
    });
});

afterEach(() => {
  (globalThis as unknown as { Image: unknown }).Image = originalImage;
  getContextSpy.mockRestore();
  toBlobSpy.mockRestore();
});

describe("type checks", () => {
  it.each(["image/gif", "image/svg+xml", "application/pdf", "", "image/heic"])(
    "rejects %j with IMAGE_TYPE_UNSUPPORTED",
    async (type) => {
      await expect(processSupportServiceImageUpload(fileOf(10, type))).rejects.toThrow(
        "IMAGE_TYPE_UNSUPPORTED",
      );
    },
  );

  it.each(["image/png", "image/jpeg", "image/webp"])("accepts %s", async (type) => {
    const result = await processSupportServiceImageUpload(fileOf(100, type));
    expect(result.compressed).toBe(false);
    expect(result.dataUrl.startsWith(`data:${type};base64,`)).toBe(true);
  });
});

describe("size checks", () => {
  it("a file exactly at the limit is NOT compressed", async () => {
    const result = await processSupportServiceImageUpload(fileOf(MAX, "image/png"));
    expect(result.compressed).toBe(false);
    expect(toBlobSpy).not.toHaveBeenCalled();
  });

  it("a file one byte over the limit is compressed (webp first)", async () => {
    toBlobSizes = [1024];
    const result = await processSupportServiceImageUpload(fileOf(MAX + 1, "image/png"));
    expect(result.compressed).toBe(true);
    expect(result.dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    expect(toBlobCalls[0]).toEqual({ type: "image/webp", quality: 0.86, width: 3000 });
  });

  it("walks quality then dimension down until a blob fits", async () => {
    // 6 qualities at full size all too big, then the first at 1600px fits.
    toBlobSizes = [MAX + 1, MAX + 1, MAX + 1, MAX + 1, MAX + 1, MAX + 1, 2048];
    const result = await processSupportServiceImageUpload(fileOf(MAX * 2, "image/jpeg"));
    expect(result.compressed).toBe(true);
    expect(toBlobCalls).toHaveLength(7);
    expect(toBlobCalls[6]).toEqual({ type: "image/webp", quality: 0.86, width: 1600 });
  });

  it("falls back to jpeg when no webp attempt fits", async () => {
    // 8 dimensions (3000 + 7 steps) × 6 qualities of webp all too big.
    toBlobSizes = [...Array(48).fill(MAX + 1), 4096];
    const result = await processSupportServiceImageUpload(fileOf(MAX * 2, "image/png"));
    expect(result.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(toBlobCalls[48].type).toBe("image/jpeg");
  });

  it("throws IMAGE_COMPRESSION_FAILED when nothing ever fits", async () => {
    await expect(
      processSupportServiceImageUpload(fileOf(MAX * 2, "image/png")),
    ).rejects.toThrow("IMAGE_COMPRESSION_FAILED");
    expect(toBlobCalls).toHaveLength(96);
  });

  it("empty blobs never count as a fit", async () => {
    toBlobSizes = [0, 512];
    const result = await processSupportServiceImageUpload(fileOf(MAX + 1, "image/png"));
    expect(result.compressed).toBe(true);
    expect(toBlobCalls).toHaveLength(2);
  });

  it("propagates IMAGE_LOAD_FAILED when the browser cannot decode the file", async () => {
    FakeImage.fail = true;
    await expect(
      processSupportServiceImageUpload(fileOf(MAX + 1, "image/png")),
    ).rejects.toThrow("IMAGE_LOAD_FAILED");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("propagates CANVAS_UNAVAILABLE when there is no 2d context", async () => {
    getContextSpy.mockImplementation(() => null);
    await expect(
      processSupportServiceImageUpload(fileOf(MAX + 1, "image/png")),
    ).rejects.toThrow("CANVAS_UNAVAILABLE");
  });
});
