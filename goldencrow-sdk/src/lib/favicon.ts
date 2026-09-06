import { Buffer } from "node:buffer";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";

const MAX_REDIRECTS = 5;
const PAGE_TIMEOUT_MS = 10000;
const ICON_TIMEOUT_MS = 10000;
const MAX_PAGE_BYTES = 1500000;
const MAX_ICON_BYTES = 600 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

type FetchResult = {
  response: Response;
  finalUrl: URL;
};

export type FaviconResult = {
  pageUrl: string;
  faviconUrl: string;
  contentType: string;
  data: Buffer;
  dataUrl: string;
  fileName: string;
};

export class FaviconExtractionError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "FaviconExtractionError";
  }
}

export function normalizePageUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new FaviconExtractionError("Website URL is required.", 400);
  }

  const value = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FaviconExtractionError("Website URL must be valid.", 400);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FaviconExtractionError("Website URL must use HTTP or HTTPS.", 400);
  }

  if (url.username || url.password) {
    throw new FaviconExtractionError("Website URL is not allowed.", 400);
  }

  return url;
}

function sizeScore(value?: string): number {
  if (!value) return 0;
  if (value.toLowerCase() === "any") return 10000;

  return Math.max(
    ...value
      .split(/\s+/)
      .map((size) => Number(size.split("x")[0]))
      .filter(Number.isFinite),
    0,
  );
}

function ipv4FromMappedIpv6(address: string): string | null {
  const match = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return match?.[1] ?? null;
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  if (parts.some((part) => part < 0 || part > 255)) {
    return true;
  }

  const [a, b, c] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const mappedIpv4 = ipv4FromMappedIpv6(address);
  if (mappedIpv4) {
    return isBlockedIpv4(mappedIpv4);
  }

  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8")
  );
}

function isBlockedIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

async function assertSafeFetchUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FaviconExtractionError("URL must use HTTP or HTTPS.", 400);
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new FaviconExtractionError("URL destination is not allowed.", 400);
  }

  const hostname = url.hostname
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal"
  ) {
    throw new FaviconExtractionError("URL destination is not allowed.", 400);
  }

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new FaviconExtractionError("URL destination is not allowed.", 400);
    }
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new FaviconExtractionError("URL destination could not be reached.", 404);
  }
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new FaviconExtractionError("URL destination is not allowed.", 400);
  }
}

async function fetchWithValidatedRedirects(
  initialUrl: URL,
  {
    accept,
    timeoutMs,
  }: {
    accept: string;
    timeoutMs: number;
  },
): Promise<FetchResult> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafeFetchUrl(currentUrl);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: accept,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new FaviconExtractionError("URL destination could not be reached.", 404);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new FaviconExtractionError("Redirect destination is missing.", 400);
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw new FaviconExtractionError("Too many redirects.", 400);
}

async function readLimitedResponse(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new FaviconExtractionError("Downloaded image is too large.", 413);
  }

  if (!response.body) {
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxBytes) {
      throw new FaviconExtractionError("Downloaded image is too large.", 413);
    }
    return data;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      throw new FaviconExtractionError("Downloaded image is too large.", 413);
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

function faviconCandidates(html: string, pageUrl: URL) {
  const $ = cheerio.load(html);
  const candidates = $("link")
    .toArray()
    .map((element) => {
      const rel = ($(element).attr("rel") ?? "").toLowerCase();
      const href = $(element).attr("href");
      const type = ($(element).attr("type") ?? "").toLowerCase();
      const sizes = $(element).attr("sizes");

      if (!href || !rel.includes("icon")) return null;

      try {
        const url = new URL(href, pageUrl).href;
        const score =
          sizeScore(sizes) +
          (type.includes("svg") || url.toLowerCase().includes(".svg") ? 20000 : 0) +
          (rel === "icon" ? 1000 : 0) +
          (rel.includes("apple-touch-icon") ? 500 : 0);

        return { url, score };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is { url: string; score: number } =>
      Boolean(candidate),
    )
    .sort((a, b) => b.score - a.score);

  return [
    ...candidates.map((candidate) => candidate.url),
    new URL("/favicon.ico", pageUrl.origin).href,
  ];
}

function declaredContentType(value: string | null): string | null {
  const normalized = value?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized === "image/jpg") return "image/jpeg";
  return SUPPORTED_IMAGE_TYPES.has(normalized) ? normalized : null;
}

function contentTypeFromExtension(url: string): string | null {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  return null;
}

function contentTypeFromMagicBytes(data: Buffer): string | null {
  if (data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return "image/png";
  }
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }
  if (
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    data.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00])) ||
    data.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x02, 0x00]))
  ) {
    return "image/x-icon";
  }

  const text = data.subarray(0, 300).toString("utf8").trimStart().toLowerCase();
  if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) {
    return "image/svg+xml";
  }

  return null;
}

function detectContentType(
  url: string,
  declaredType: string | null,
  data: Buffer,
): string | null {
  return (
    declaredContentType(declaredType) ||
    contentTypeFromExtension(url) ||
    contentTypeFromMagicBytes(data)
  );
}

function fileNameForFavicon(url: string, contentType: string) {
  const pathname = new URL(url).pathname;
  const rawName = pathname.split("/").filter(Boolean).pop() || "favicon";
  const decodedName = decodeURIComponent(rawName)
    .replace(/[^\w.-]+/g, "-")
    .slice(0, 120);

  if (decodedName.includes(".")) {
    return decodedName;
  }

  return `${decodedName || "favicon"}.${EXTENSION_BY_TYPE[contentType] ?? "img"}`;
}

export async function extractFavicon(input: string): Promise<FaviconResult> {
  const requestedUrl = normalizePageUrl(input);
  const pageResult = await fetchWithValidatedRedirects(requestedUrl, {
    accept: "text/html,application/xhtml+xml",
    timeoutMs: PAGE_TIMEOUT_MS,
  });

  if (!pageResult.response.ok) {
    throw new FaviconExtractionError("Page request failed.", 404);
  }

  const html = (await readLimitedResponse(pageResult.response, MAX_PAGE_BYTES)).toString(
    "utf8",
  );
  const uniqueCandidates = [
    ...new Set(faviconCandidates(html, pageResult.finalUrl)),
  ];

  for (const faviconUrl of uniqueCandidates) {
    try {
      const iconResult = await fetchWithValidatedRedirects(new URL(faviconUrl), {
        accept: "image/*",
        timeoutMs: ICON_TIMEOUT_MS,
      });
      if (!iconResult.response.ok) continue;

      const data = await readLimitedResponse(iconResult.response, MAX_ICON_BYTES);
      if (!data.length) continue;

      const contentType = detectContentType(
        iconResult.finalUrl.href,
        iconResult.response.headers.get("content-type"),
        data,
      );
      if (!contentType) continue;

      return {
        pageUrl: pageResult.finalUrl.href,
        faviconUrl: iconResult.finalUrl.href,
        contentType,
        data,
        dataUrl: `data:${contentType};base64,${data.toString("base64")}`,
        fileName: fileNameForFavicon(iconResult.finalUrl.href, contentType),
      };
    } catch {
      continue;
    }
  }

  throw new FaviconExtractionError("No downloadable favicon found.", 404);
}
