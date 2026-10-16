import { deflateSync } from "node:zlib";
import {
  SAVED_SIGNATURE_MAX_BYTES,
  readSavedSignatureDataUrl,
  validateSavedSignatureDataUrl,
} from "../lib/saved-signature.js";

const ONE_PIXEL_PNG =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

function toDataUrl(bytes: Buffer) {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function onePixelBytes() {
  return Buffer.from(ONE_PIXEL_PNG.split(",")[1]!, "base64");
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngWithDimensions(width: number, height: number) {
  const bytes = onePixelBytes();
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
  return toDataUrl(bytes);
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function pngWithIdatData(idatData: Buffer) {
  const bytes = onePixelBytes();
  const chunks = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset < bytes.length) {
    const dataLength = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const chunkEnd = offset + 12 + dataLength;
    chunks.push(
      type === "IDAT"
        ? pngChunk(type, idatData)
        : bytes.subarray(offset, chunkEnd),
    );
    offset = chunkEnd;
  }
  return toDataUrl(Buffer.concat(chunks));
}

function pngHeaderOnly(width: number, height: number, byteLength = 24) {
  const bytes = Buffer.alloc(byteLength);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  Buffer.from("IHDR", "ascii").copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return toDataUrl(bytes);
}

describe("saved signature data", () => {
  it("accepts a structurally complete canonical PNG", () => {
    expect(validateSavedSignatureDataUrl(ONE_PIXEL_PNG)).toBe(ONE_PIXEL_PNG);
  });

  it.each([
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/webp;base64,UklGRgQAAABXRUJQ",
    "data:image/png;base64,not-valid-base64",
    "data:image/png;base64,SGVsbG8=",
  ])("rejects an unsafe or mislabeled image: %s", (value) => {
    expect(() => validateSavedSignatureDataUrl(value)).toThrow();
    expect(readSavedSignatureDataUrl(value)).toBeNull();
  });

  it.each([
    ["header-only data", () => pngHeaderOnly(1, 1)],
    [
      "a truncated final chunk",
      () => toDataUrl(onePixelBytes().subarray(0, -1)),
    ],
    ["a missing IEND chunk", () => toDataUrl(onePixelBytes().subarray(0, -12))],
    [
      "a corrupt chunk length",
      () => {
        const bytes = onePixelBytes();
        bytes.writeUInt32BE(14, 8);
        return toDataUrl(bytes);
      },
    ],
    [
      "a corrupt CRC",
      () => {
        const bytes = onePixelBytes();
        bytes[32] = bytes[32]! ^ 0xff;
        return toDataUrl(bytes);
      },
    ],
    [
      "bytes after IEND",
      () => toDataUrl(Buffer.concat([onePixelBytes(), Buffer.from([0])])),
    ],
  ])("rejects %s", (_, makeValue) => {
    const value = makeValue();
    expect(() => validateSavedSignatureDataUrl(value)).toThrow("content");
    expect(readSavedSignatureDataUrl(value)).toBeNull();
  });

  it.each([
    ["a non-decodable IDAT stream", Buffer.from([0x78, 0x9c, 0x00])],
    [
      "an unexpected decompressed scanline length",
      deflateSync(Buffer.from([0, 0, 0, 0])),
    ],
    ["an invalid PNG filter byte", deflateSync(Buffer.from([5, 0, 0, 0, 0]))],
  ])("rejects %s even with a valid IDAT chunk CRC", (_, idatData) => {
    expect(() =>
      validateSavedSignatureDataUrl(pngWithIdatData(idatData)),
    ).toThrow("content");
  });

  it("rejects images beyond the normalized 720 by 240 canvas", () => {
    expect(() =>
      validateSavedSignatureDataUrl(pngWithDimensions(721, 240)),
    ).toThrow("dimensions");
    expect(() =>
      validateSavedSignatureDataUrl(pngWithDimensions(720, 241)),
    ).toThrow("dimensions");
  });

  it("rejects a PNG beyond the dedicated byte budget", () => {
    expect(() =>
      validateSavedSignatureDataUrl(
        pngHeaderOnly(720, 240, SAVED_SIGNATURE_MAX_BYTES + 1),
      ),
    ).toThrow("128 KB");
  });
});
