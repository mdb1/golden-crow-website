const PRODUCTION_BACKOFFICE_HOST = "golden-crow-backoffice.vercel.app";
const PRODUCTION_SDK_URL = "https://golden-crow-sdk.vercel.app";
const LOCAL_SDK_URL = "http://localhost:3000";

function normalizeBaseUrl(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return value.trim().replace(/\/$/, "");
}

function getUrlHost(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function isLikelyBackofficeUrl(value?: string, currentHost?: string) {
  const normalizedHost = getUrlHost(value);
  if (!normalizedHost) {
    return false;
  }

  return (
    normalizedHost === currentHost?.toLowerCase() ||
    normalizedHost === PRODUCTION_BACKOFFICE_HOST ||
    normalizedHost === "localhost:3001" ||
    normalizedHost === "127.0.0.1:3001"
  );
}

export function resolveSdkBaseUrl(options?: { currentHost?: string }) {
  const currentHost = options?.currentHost?.toLowerCase();
  const configuredSdkBaseUrl =
    normalizeBaseUrl(process.env.GOLDENCROW_SDK_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_SDK_URL);

  if (currentHost === PRODUCTION_BACKOFFICE_HOST) {
    return PRODUCTION_SDK_URL;
  }

  if (configuredSdkBaseUrl && !isLikelyBackofficeUrl(configuredSdkBaseUrl, currentHost)) {
    return configuredSdkBaseUrl;
  }

  return process.env.NODE_ENV === "production" ? PRODUCTION_SDK_URL : LOCAL_SDK_URL;
}
