import { inflateSync } from "node:zlib";

export const SAVED_SIGNATURE_MAX_BYTES = 128_000;
export const SAVED_SIGNATURE_MAX_DATA_URL_LENGTH = 171_000;
export const SAVED_SIGNATURE_MAX_WIDTH = 720;
export const SAVED_SIGNATURE_MAX_HEIGHT = 240;

const SAVED_SIGNATURE_PATTERN =
  /^data:image\/png;base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/;

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_IHDR_DATA_LENGTH = 13;
const PNG_CHUNK_HEADER_LENGTH = 8;
const PNG_CHUNK_CRC_LENGTH = 4;
const PNG_CHUNK_TYPE_PATTERN = /^[A-Za-z]{4}$/;

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

function invalidPng(): never {
  throw new Error("The saved signature image content is invalid.");
}

function hasPngSignature(bytes: Buffer) {
  return (
    bytes.length >= PNG_SIGNATURE.length &&
    bytes.subarray(0, 8).equals(PNG_SIGNATURE)
  );
}

function crc32(bytes: Buffer, start: number, end: number) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validBitDepth(colorType: number, bitDepth: number) {
  if (colorType === 0) return [1, 2, 4, 8, 16].includes(bitDepth);
  if (colorType === 2 || colorType === 4 || colorType === 6) {
    return bitDepth === 8 || bitDepth === 16;
  }
  return colorType === 3 && [1, 2, 4, 8].includes(bitDepth);
}

function readPngMetadata(bytes: Buffer) {
  if (!hasPngSignature(bytes)) invalidPng();

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlaceMethod = -1;
  let seenIhdr = false;
  let seenPlte = false;
  let seenIdat = false;
  let idatEnded = false;
  let idatDataLength = 0;
  let seenIend = false;
  const idatChunks: Buffer[] = [];

  while (offset < bytes.length) {
    const minimumChunkLength = PNG_CHUNK_HEADER_LENGTH + PNG_CHUNK_CRC_LENGTH;
    if (bytes.length - offset < minimumChunkLength) invalidPng();

    const dataLength = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + PNG_CHUNK_HEADER_LENGTH;
    if (dataLength > bytes.length - dataStart - PNG_CHUNK_CRC_LENGTH) {
      invalidPng();
    }

    const dataEnd = dataStart + dataLength;
    const crcOffset = dataEnd;
    const chunkEnd = crcOffset + PNG_CHUNK_CRC_LENGTH;
    const type = bytes.subarray(typeStart, dataStart).toString("ascii");
    if (!PNG_CHUNK_TYPE_PATTERN.test(type)) invalidPng();
    if (crc32(bytes, typeStart, dataEnd) !== bytes.readUInt32BE(crcOffset)) {
      invalidPng();
    }

    if (!seenIhdr) {
      if (type !== "IHDR" || dataLength !== PNG_IHDR_DATA_LENGTH) invalidPng();
      seenIhdr = true;
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8]!;
      colorType = bytes[dataStart + 9]!;
      interlaceMethod = bytes[dataStart + 12]!;
      if (
        width === 0 ||
        height === 0 ||
        !validBitDepth(colorType, bitDepth) ||
        bytes[dataStart + 10] !== 0 ||
        bytes[dataStart + 11] !== 0 ||
        (interlaceMethod !== 0 && interlaceMethod !== 1)
      ) {
        invalidPng();
      }
    } else if (type === "IHDR") {
      invalidPng();
    } else if (type === "PLTE") {
      if (
        seenPlte ||
        seenIdat ||
        dataLength === 0 ||
        dataLength % 3 !== 0 ||
        dataLength > 768 ||
        colorType === 0 ||
        colorType === 4 ||
        (colorType === 3 && dataLength / 3 > 2 ** bitDepth)
      ) {
        invalidPng();
      }
      seenPlte = true;
    } else if (type === "IDAT") {
      if (idatEnded || seenIend) invalidPng();
      seenIdat = true;
      idatDataLength += dataLength;
      idatChunks.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      if (dataLength !== 0 || !seenIdat || seenIend) invalidPng();
      seenIend = true;
      offset = chunkEnd;
      if (offset !== bytes.length) invalidPng();
      break;
    } else {
      if ((bytes[typeStart]! & 0x20) === 0 || seenIend) invalidPng();
      if (seenIdat) idatEnded = true;
    }

    offset = chunkEnd;
  }

  if (
    !seenIhdr ||
    !seenIdat ||
    idatDataLength === 0 ||
    !seenIend ||
    (colorType === 3 && !seenPlte)
  ) {
    invalidPng();
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    interlaceMethod,
    idatData: Buffer.concat(idatChunks, idatDataLength),
  };
}

function validateCanvasPngImageData(
  metadata: ReturnType<typeof readPngMetadata>,
) {
  if (
    metadata.bitDepth !== 8 ||
    metadata.colorType !== 6 ||
    metadata.interlaceMethod !== 0
  ) {
    invalidPng();
  }

  const bytesPerRow = metadata.width * 4;
  const expectedLength = metadata.height * (bytesPerRow + 1);
  let scanlines: Buffer;
  try {
    scanlines = inflateSync(metadata.idatData, {
      maxOutputLength: expectedLength,
    });
  } catch {
    invalidPng();
  }
  if (scanlines.length !== expectedLength) invalidPng();

  for (let row = 0; row < metadata.height; row += 1) {
    const filterType = scanlines[row * (bytesPerRow + 1)];
    if (filterType === undefined || filterType > 4) invalidPng();
  }
}

export function validateSavedSignatureDataUrl(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > SAVED_SIGNATURE_MAX_DATA_URL_LENGTH
  ) {
    throw new Error("The saved signature is not a supported image data URL.");
  }

  const match = SAVED_SIGNATURE_PATTERN.exec(value);
  if (!match) {
    throw new Error("The saved signature is not a supported image data URL.");
  }

  const encoded = match[1]!;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 1 || bytes.length > SAVED_SIGNATURE_MAX_BYTES) {
    throw new Error("The saved signature exceeds the 128 KB limit.");
  }
  if (bytes.toString("base64") !== encoded) {
    throw new Error("The saved signature base64 content is invalid.");
  }
  const metadata = readPngMetadata(bytes);
  const { width, height } = metadata;
  if (
    width < 1 ||
    height < 1 ||
    width > SAVED_SIGNATURE_MAX_WIDTH ||
    height > SAVED_SIGNATURE_MAX_HEIGHT
  ) {
    throw new Error("The saved signature image dimensions are invalid.");
  }
  validateCanvasPngImageData(metadata);

  return value;
}

export function readSavedSignatureDataUrl(value: unknown) {
  try {
    return validateSavedSignatureDataUrl(value);
  } catch {
    return null;
  }
}
