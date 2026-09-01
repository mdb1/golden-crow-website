"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  LoaderCircle,
  MapPinned,
  Navigation,
  Route as RouteIcon,
  X,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BACKOFFICE_VERSION } from "@/lib/app-version";
import { appText } from "@/lib/language";
import { cn } from "@/lib/utils";

const PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY =
  "AIzaSyDX5QOmZrG7GekSIMoqFT3oymQP20w2az0";
const ROUTE_REQUEST_TIMEOUT_MS = 15000;
const ROUTES_COMPUTE_ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const ROUTES_COMPUTE_ROUTES_FIELD_MASK =
  "routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline";
const MAPS_STATIC_ENDPOINT = "https://maps.googleapis.com/maps/api/staticmap";
const MAPS_STATIC_IMAGE_SIZE = "640x360";
const MAPS_STATIC_IMAGE_SCALE = "2";
const MINIMUM_ORIGIN_COMMA_COUNT = 2;
const ROUTE_PREVIEW_VIEWPORT_SCALE = 1.5;
const ROUTE_PREVIEW_MIN_BOUNDS_SPAN_DEGREES = 0.002;
const ROUTES_API_IMPLEMENTATION = {
  product: "Routes API",
  transport: "browser fetch",
  method: `POST ${ROUTES_COMPUTE_ROUTES_ENDPOINT}`,
  fieldMask: ROUTES_COMPUTE_ROUTES_FIELD_MASK,
  polylineQuality: "HIGH_QUALITY",
  trafficAware: true,
  mapRenderer: {
    product: "Maps Static API",
    transport: "browser image request",
    endpoint: MAPS_STATIC_ENDPOINT,
    size: MAPS_STATIC_IMAGE_SIZE,
    scale: MAPS_STATIC_IMAGE_SCALE,
    viewportScale: ROUTE_PREVIEW_VIEWPORT_SCALE,
  },
};

type MapsLoadStatus = "idle" | "loading" | "ready" | "error";
type RouteStatus = "idle" | "loading" | "ready" | "error";
type RoutePoint = {
  lat: number;
  lng: number;
};
type RouteEstimate = {
  distance: string;
  duration: string;
  encodedPolyline: string | null;
  staticMapUrl: string | null;
  usesTraffic: boolean;
  path: RoutePoint[];
};
type LockedRoute = {
  key: string;
};
export type PGFlexRouteOriginProvinceDistrict =
  | "Capital Federal"
  | "Provincia de Buenos Aires";
export type PGFlexRouteOriginParts = {
  address: string;
  locality: string;
  provinceDistrict: PGFlexRouteOriginProvinceDistrict;
  country: "Argentina";
};
type GoogleMapsRouteError = Error & {
  pgflexGoogleStatus?: string;
  pgflexGoogleRequest?: unknown;
  pgflexGoogleResult?: unknown;
};

export const PGFLEX_ROUTE_ORIGIN_COUNTRY = "Argentina";
const PGFLEX_ROUTE_ORIGIN_SEPARATOR = ", ";
const PGFLEX_ROUTE_CAPITAL_FEDERAL_SEARCH_VALUE =
  "Ciudad Autónoma de Buenos Aires";
const PGFLEX_ROUTE_ORIGIN_TEXT_PART_MIN_LENGTH = 3;
const PGFLEX_ROUTE_ORIGIN_TEXT_PARTS_MIN_LENGTH_MESSAGE =
  "Address and neighborhood/locality must each have at least 3 characters.";

const PGFLEX_ROUTE_ORIGIN_PROVINCE_OPTIONS: Array<{
  value: PGFlexRouteOriginProvinceDistrict;
  label: string;
}> = [
  { value: "Capital Federal", label: "Capital Federal" },
  {
    value: "Provincia de Buenos Aires",
    label: "Buenos Aires Province",
  },
];

export function sanitizePGFlexRouteOriginTextPart(value: string) {
  return value.replace(/,+/g, " ").replace(/\s{2,}/g, " ");
}

export function validatePGFlexRouteOriginParts(
  parts: PGFlexRouteOriginParts,
) {
  const address = sanitizePGFlexRouteOriginTextPart(parts.address).trim();
  const locality = sanitizePGFlexRouteOriginTextPart(parts.locality).trim();

  if (
    address.length < PGFLEX_ROUTE_ORIGIN_TEXT_PART_MIN_LENGTH ||
    locality.length < PGFLEX_ROUTE_ORIGIN_TEXT_PART_MIN_LENGTH
  ) {
    return PGFLEX_ROUTE_ORIGIN_TEXT_PARTS_MIN_LENGTH_MESSAGE;
  }

  return null;
}

function provinceDistrictFromOriginPart(
  value?: string,
): PGFlexRouteOriginProvinceDistrict {
  const normalized = value?.trim();

  return normalized === "Provincia de Buenos Aires"
    ? "Provincia de Buenos Aires"
    : "Capital Federal";
}

function provinceDistrictSearchValue(
  value: PGFlexRouteOriginProvinceDistrict,
) {
  return value === "Capital Federal"
    ? PGFLEX_ROUTE_CAPITAL_FEDERAL_SEARCH_VALUE
    : value;
}

export function composePGFlexRouteOrigin(parts: PGFlexRouteOriginParts) {
  const address = sanitizePGFlexRouteOriginTextPart(parts.address).trim();
  const locality = sanitizePGFlexRouteOriginTextPart(parts.locality).trim();
  const provinceDistrict = provinceDistrictSearchValue(
    parts.provinceDistrict,
  );

  if (!address || !locality) {
    return "";
  }

  return [
    address,
    locality,
    provinceDistrict,
    PGFLEX_ROUTE_ORIGIN_COUNTRY,
  ].join(PGFLEX_ROUTE_ORIGIN_SEPARATOR);
}

export function splitPGFlexRouteOrigin(origin: string): PGFlexRouteOriginParts {
  const parts = origin
    .split(PGFLEX_ROUTE_ORIGIN_SEPARATOR)
    .map((part) => sanitizePGFlexRouteOriginTextPart(part.trim()));

  return {
    address: parts[0] ?? "",
    locality: parts[1] ?? "",
    provinceDistrict: provinceDistrictFromOriginPart(parts[2]),
    country: PGFLEX_ROUTE_ORIGIN_COUNTRY,
  };
}

function makeAbortError() {
  const error = new Error("Route preview cancelled");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function makeGoogleMapsRouteError({
  request,
  result,
  status,
}: {
  request: unknown;
  result: unknown;
  status: string;
}) {
  const error = new Error(
    status || "Google Maps route request failed",
  ) as GoogleMapsRouteError;
  error.name = "GoogleMapsRouteError";
  error.pgflexGoogleStatus = status;
  error.pgflexGoogleRequest = request;
  error.pgflexGoogleResult = result;
  return error;
}

function serializableError(error: unknown) {
  if (error instanceof Error) {
    const extra = error as Error & {
      code?: unknown;
      endpoint?: unknown;
      status?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(typeof extra.code === "string" ? { code: extra.code } : {}),
      ...(typeof extra.endpoint === "string"
        ? { endpoint: extra.endpoint }
        : {}),
      ...(typeof extra.status === "string" ? { status: extra.status } : {}),
      pgflexGoogleStatus: (error as GoogleMapsRouteError).pgflexGoogleStatus,
      pgflexGoogleRequest: (error as GoogleMapsRouteError).pgflexGoogleRequest,
      pgflexGoogleResult: (error as GoogleMapsRouteError).pgflexGoogleResult,
    };
  }

  return error;
}

function serializableThrownError(error: unknown) {
  if (error instanceof Error) {
    const extra = error as Error & {
      code?: unknown;
      endpoint?: unknown;
      status?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(typeof extra.code === "string" ? { code: extra.code } : {}),
      ...(typeof extra.endpoint === "string"
        ? { endpoint: extra.endpoint }
        : {}),
      ...(typeof extra.status === "string" ? { status: extra.status } : {}),
      pgflexGoogleStatus: (error as GoogleMapsRouteError).pgflexGoogleStatus,
    };
  }

  return error;
}

function cloneLogValue(value: unknown) {
  const serialized = stringifyErrorLog(value);
  return serialized === undefined ? null : JSON.parse(serialized);
}

function googleMapsApiKeyFingerprint(apiKey: string) {
  return {
    length: apiKey.length,
    prefix: apiKey.slice(0, 6),
    suffix: apiKey.slice(-6),
  };
}

function resolveGoogleMapsApiKeyInfo() {
  const candidates = [
    {
      source: "NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY",
      value: normalizeGoogleMapsApiKey(
        process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY,
      ),
    },
    {
      source: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
      value: normalizeGoogleMapsApiKey(
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
      ),
    },
  ];
  const exactConfiguredKey = candidates.find(
    (candidate) => candidate.value === PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY,
  );

  if (exactConfiguredKey?.value) {
    return {
      value: exactConfiguredKey.value,
      source: exactConfiguredKey.source,
      matchesPinnedPGFlexKey: true,
      fingerprint: googleMapsApiKeyFingerprint(exactConfiguredKey.value),
    };
  }

  const ignoredConfiguredKey = candidates.find((candidate) => candidate.value);

  return {
    value: PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY,
    source: "PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY fallback",
    matchesPinnedPGFlexKey: true,
    fingerprint: googleMapsApiKeyFingerprint(
      PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY,
    ),
    ...(ignoredConfiguredKey?.value
      ? {
          ignoredConfiguredKey: {
            source: ignoredConfiguredKey.source,
            fingerprint: googleMapsApiKeyFingerprint(
              ignoredConfiguredKey.value,
            ),
            reason:
              "Configured key did not match the pinned PGFlex browser key, so PGFlex used its explicit fallback key.",
          },
        }
      : {}),
  };
}

function resolveGoogleMapsApiKeySource() {
  return resolveGoogleMapsApiKeyInfo().source;
}

function googleMapsApiKeyDiagnostics(apiKey: string) {
  const resolved = resolveGoogleMapsApiKeyInfo();

  if (resolved.value === apiKey) {
    return {
      present: Boolean(apiKey),
      source: resolved.source,
      matchesPinnedPGFlexKey: resolved.matchesPinnedPGFlexKey,
      fingerprint: resolved.fingerprint,
      ...(resolved.ignoredConfiguredKey
        ? { ignoredConfiguredKey: resolved.ignoredConfiguredKey }
        : {}),
    };
  }

  return {
    present: Boolean(apiKey),
    source: "runtime value",
    matchesPinnedPGFlexKey: apiKey === PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY,
    fingerprint: googleMapsApiKeyFingerprint(apiKey),
  };
}

function googleMapsEnvironmentLog(apiKey: string) {
  return {
    pageUrl: window.location.href,
    userAgent: window.navigator.userAgent,
    configuredApiKey: googleMapsApiKeyDiagnostics(apiKey),
    routeTransport: "browser fetch",
    endpoint: ROUTES_COMPUTE_ROUTES_ENDPOINT,
    fieldMask: ROUTES_COMPUTE_ROUTES_FIELD_MASK,
  };
}

function stringifyErrorLog(value: unknown) {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    value,
    (_key, nextValue) => {
      if (nextValue instanceof Error) {
        return serializableError(nextValue);
      }

      if (typeof nextValue === "function") {
        return `[Function ${nextValue.name || "anonymous"}]`;
      }

      if (nextValue instanceof Element) {
        return `<${nextValue.tagName.toLowerCase()}>`;
      }

      if (nextValue && typeof nextValue === "object") {
        if (seen.has(nextValue)) {
          return "[Circular]";
        }

        seen.add(nextValue);
      }

      return nextValue;
    },
    2,
  );
}

function routeErrorLogForFailure({
  apiKey,
  destination,
  error,
  failedAt,
  origin,
  phase,
  requestId,
  startedAt,
}: {
  apiKey: string;
  destination: string;
  error: unknown;
  failedAt: string;
  origin: string;
  phase: string;
  requestId: number;
  startedAt: string;
}) {
  const routeError = error as GoogleMapsRouteError;
  const failedTime = Date.parse(failedAt);
  const startedTime = Date.parse(startedAt);
  const elapsedMs =
    Number.isFinite(failedTime) && Number.isFinite(startedTime)
      ? Math.max(0, failedTime - startedTime)
      : null;
  const environment = googleMapsEnvironmentLog(apiKey);
  const capturedRouteRequest = routeError.pgflexGoogleRequest ?? {
    origin,
    destination,
    note: "No Routes REST request was captured because the failure happened before fetch.",
  };
  const capturedRouteResult = routeError.pgflexGoogleResult ?? null;

  return stringifyErrorLog({
    logType: "pgflex_route_preview_error",
    backofficeVersion: BACKOFFICE_VERSION,
    capturedAt: failedAt,
    component: "PGFlexRoutePreview",
    implementation: ROUTES_API_IMPLEMENTATION,
    requestId,
    phase,
    elapsedMs,
    routeInput: {
      origin,
      destination,
    },
    apiCalls: [
      {
        name: "Routes API REST route calculation",
        provider: "Google Maps Platform",
        call: `POST ${ROUTES_COMPUTE_ROUTES_ENDPOINT}`,
        request: cloneLogValue(capturedRouteRequest),
        response: {
          status: routeError.pgflexGoogleStatus ?? null,
          result: cloneLogValue(capturedRouteResult),
        },
      },
    ],
    googleApiDump: {
      status: routeError.pgflexGoogleStatus,
      request: cloneLogValue(capturedRouteRequest),
      result: cloneLogValue(capturedRouteResult),
    },
    thrownError: serializableThrownError(error),
    environment,
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
  timeoutMessage: string,
  onTimeout?: () => void,
) {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(makeAbortError());
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onTimeout?.();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", abortHandler);
    };
    const abortHandler = () => {
      cleanup();
      reject(makeAbortError());
    };

    signal.addEventListener("abort", abortHandler, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function normalizeGoogleMapsApiKey(value: string | undefined) {
  const normalized = value?.trim().replace(/^["']|["']$/g, "");

  if (!normalized || normalized === "undefined" || normalized === "null") {
    return undefined;
  }

  return normalized;
}

function resolveGoogleMapsApiKey() {
  return resolveGoogleMapsApiKeyInfo().value;
}

function routeStatusFromError(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    const status =
      typeof candidate.code === "string"
        ? candidate.code
        : typeof candidate.status === "string"
          ? candidate.status
          : undefined;

    if (status?.trim()) {
      return status.trim();
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(
    /\b(SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|BILLING_DISABLED|CONSUMER_INVALID|API_KEY_INVALID|REQUEST_DENIED|PERMISSION_DENIED|UNAUTHENTICATED|FAILED_PRECONDITION|ZERO_RESULTS|NOT_FOUND|INVALID_REQUEST|OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|UNKNOWN_ERROR)\b/i,
  );

  return match?.[1]?.toUpperCase() ?? "ROUTES_API_ERROR";
}

function routeStatusFromRestResponse(response: Response, result: unknown) {
  const apiError =
    result && typeof result === "object"
      ? (result as { error?: unknown }).error
      : undefined;
  const details =
    apiError && typeof apiError === "object"
      ? (apiError as { details?: unknown }).details
      : undefined;
  const reason = Array.isArray(details)
    ? details
        .map((detail) =>
          detail && typeof detail === "object"
            ? (detail as { reason?: unknown }).reason
            : undefined,
        )
        .find(
          (value): value is string =>
            typeof value === "string" && Boolean(value.trim()),
        )
    : undefined;
  const status =
    apiError && typeof apiError === "object"
      ? (apiError as { status?: unknown }).status
      : undefined;

  if (reason?.trim()) {
    return reason.trim();
  }

  if (typeof status === "string" && status.trim()) {
    return status.trim();
  }

  if (response.statusText.trim()) {
    return response.statusText.trim().toUpperCase().replace(/\s+/g, "_");
  }

  return `HTTP_${response.status}`;
}

function selectedResponseHeaders(response: Response) {
  return {
    "content-type": response.headers.get("content-type"),
    vary: response.headers.get("vary"),
    "access-control-allow-origin": response.headers.get(
      "access-control-allow-origin",
    ),
  };
}

function parseRoutesApiResponse(text: string) {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      rawText: text,
    };
  }
}

async function requestRoute({
  apiKey,
  origin,
  destination,
  signal,
}: {
  apiKey: string;
  origin: string;
  destination: string;
  signal: AbortSignal;
}) {
  const body = {
    origin: {
      address: origin,
    },
    destination: {
      address: destination,
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    polylineQuality: "HIGH_QUALITY",
    polylineEncoding: "ENCODED_POLYLINE",
    computeAlternativeRoutes: false,
  };
  const loggableRequest = {
    method: "POST",
    endpoint: ROUTES_COMPUTE_ROUTES_ENDPOINT,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": "[redacted]",
      "X-Goog-FieldMask": ROUTES_COMPUTE_ROUTES_FIELD_MASK,
    },
    apiKeySource: resolveGoogleMapsApiKeySource(),
    body,
  };

  try {
    const response = await fetch(ROUTES_COMPUTE_ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": ROUTES_COMPUTE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal,
    });
    const responseText = await response.text();
    const result = parseRoutesApiResponse(responseText);
    const loggableResponse = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: selectedResponseHeaders(response),
      body: result,
    };

    if (!response.ok) {
      throw makeGoogleMapsRouteError({
        request: loggableRequest,
        result: loggableResponse,
        status: routeStatusFromRestResponse(response, result),
      });
    }

    if (Array.isArray(result?.routes) && result.routes.length > 0) {
      return result;
    }

    throw makeGoogleMapsRouteError({
      request: loggableRequest,
      result: loggableResponse,
      status: "ZERO_RESULTS",
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    if ((error as GoogleMapsRouteError).pgflexGoogleStatus) {
      throw error;
    }

    throw makeGoogleMapsRouteError({
      request: loggableRequest,
      result: serializableError(error),
      status: routeStatusFromError(error),
    });
  }
}

function routeKeyFor(origin: string, destination: string) {
  const originAddress = origin.trim();
  const destinationAddress = destination.trim();

  if (!originAddress || !destinationAddress) {
    return "";
  }

  return `${originAddress}\n${destinationAddress}`;
}

function googleMapsDirectionsUrl(origin: string, destination: string) {
  const originAddress = origin.trim();
  const destinationAddress = destination.trim();

  if (!originAddress || !destinationAddress) {
    return null;
  }

  const params = new URLSearchParams({
    api: "1",
    origin: originAddress,
    destination: destinationAddress,
    travelmode: "driving",
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function commaCount(value: string) {
  return value.split(",").length - 1;
}

function hasEnoughOriginAddressContext(origin: string) {
  return commaCount(origin) >= MINIMUM_ORIGIN_COMMA_COUNT;
}

function decodeEncodedPolyline(encodedPolyline: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  function readSignedValue() {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      if (index >= encodedPolyline.length) {
        throw new Error("Routes API encoded polyline is incomplete");
      }

      byte = encodedPolyline.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  }

  while (index < encodedPolyline.length) {
    lat += readSignedValue();
    lng += readSignedValue();
    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return points;
}

function coordinateValue(location: any, key: "lat" | "lng") {
  const candidate =
    typeof location?.[key] === "function" ? location[key]() : location?.[key];
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : null;
}

function routePointFromLatLng(location: any): RoutePoint | null {
  const lat = coordinateValue(location, "lat");
  const lng = coordinateValue(location, "lng");

  return lat === null || lng === null ? null : { lat, lng };
}

function routeEncodedPolylineFromResult(result: any) {
  const route = result?.routes?.[0];
  const encodedPolyline = route?.polyline?.encodedPolyline;

  if (typeof encodedPolyline === "string" && encodedPolyline.trim()) {
    return encodedPolyline.trim();
  }

  return null;
}

function routePathFromResult(result: any): RoutePoint[] {
  const route = result?.routes?.[0];
  const encodedPolyline = routeEncodedPolylineFromResult(result);

  if (encodedPolyline) {
    return decodeEncodedPolyline(encodedPolyline);
  }

  const routePath = Array.isArray(route?.path) ? route.path : [];
  const points = routePath
    .map(routePointFromLatLng)
    .filter((point: RoutePoint | null): point is RoutePoint => Boolean(point));

  if (points.length >= 2) {
    return points;
  }

  const leg = route?.legs?.[0];
  const start = routePointFromLatLng(leg?.startLocation ?? leg?.start_location);
  const end = routePointFromLatLng(leg?.endLocation ?? leg?.end_location);

  return [start, end].filter((point: RoutePoint | null): point is RoutePoint =>
    Boolean(point),
  );
}

function localizedRouteText(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const text = (value as { text?: unknown }).text;

    if (typeof text === "string" && text.trim()) {
      return text.trim();
    }
  }

  return null;
}

function formatRouteDistance(distanceMeters: unknown) {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters)) {
    return null;
  }

  if (distanceMeters < 1000) {
    return `${Math.max(1, Math.round(distanceMeters))} m`;
  }

  const kilometers = distanceMeters / 1000;
  return `${kilometers >= 10 ? kilometers.toFixed(0) : kilometers.toFixed(1)} km`;
}

function routeDurationSeconds(value: unknown) {
  if (typeof value === "string") {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)s$/);
    const seconds = match ? Number(match[1]) : NaN;

    return Number.isFinite(seconds) ? seconds : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value / 1000;
  }

  return null;
}

function formatRouteDuration(duration: unknown) {
  const durationSeconds = routeDurationSeconds(duration);

  if (durationSeconds === null) {
    return null;
  }

  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${totalMinutes} min`;
  }

  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function routeDistanceFromResult(result: any) {
  const route = result?.routes?.[0];
  return (
    localizedRouteText(route?.localizedValues?.distance) ??
    formatRouteDistance(route?.distanceMeters)
  );
}

function routeDurationFromResult(result: any) {
  const route = result?.routes?.[0];
  return (
    localizedRouteText(route?.localizedValues?.duration) ??
    formatRouteDuration(route?.duration) ??
    formatRouteDuration(route?.durationMillis)
  );
}

function routeUsesTrafficFromResult(result: any) {
  const route = result?.routes?.[0];
  const duration = routeDurationSeconds(
    route?.duration ?? route?.durationMillis,
  );
  const staticDuration = routeDurationSeconds(
    route?.staticDuration ?? route?.staticDurationMillis,
  );

  if (duration !== null && staticDuration !== null) {
    return duration !== staticDuration;
  }

  return true;
}

function staticMapCoordinate(point: RoutePoint) {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

function staticMapPathValue({
  color,
  encodedPolyline,
  path,
  weight,
}: {
  color: string;
  encodedPolyline: string | null;
  path: RoutePoint[];
  weight: number;
}) {
  const routeLocation = encodedPolyline
    ? `enc:${encodedPolyline}`
    : path.map(staticMapCoordinate).join("|");

  return `color:${color}|weight:${weight}|${routeLocation}`;
}

function clampStaticMapLatitude(lat: number) {
  return Math.max(-85, Math.min(85, lat));
}

function clampStaticMapLongitude(lng: number) {
  return Math.max(-180, Math.min(180, lng));
}

function staticMapVisibleViewport(path: RoutePoint[]) {
  const minLat = Math.min(...path.map((point) => point.lat));
  const maxLat = Math.max(...path.map((point) => point.lat));
  const minLng = Math.min(...path.map((point) => point.lng));
  const maxLng = Math.max(...path.map((point) => point.lng));
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latSpan = Math.max(
    maxLat - minLat,
    ROUTE_PREVIEW_MIN_BOUNDS_SPAN_DEGREES,
  );
  const lngSpan = Math.max(
    maxLng - minLng,
    ROUTE_PREVIEW_MIN_BOUNDS_SPAN_DEGREES,
  );
  const expandedHalfLat = (latSpan * ROUTE_PREVIEW_VIEWPORT_SCALE) / 2;
  const expandedHalfLng = (lngSpan * ROUTE_PREVIEW_VIEWPORT_SCALE) / 2;
  const south = clampStaticMapLatitude(centerLat - expandedHalfLat);
  const north = clampStaticMapLatitude(centerLat + expandedHalfLat);
  const west = clampStaticMapLongitude(centerLng - expandedHalfLng);
  const east = clampStaticMapLongitude(centerLng + expandedHalfLng);

  return [
    { lat: south, lng: west },
    { lat: south, lng: east },
    { lat: north, lng: west },
    { lat: north, lng: east },
  ];
}

function buildStaticMapUrl({
  apiKey,
  encodedPolyline,
  path,
}: {
  apiKey: string;
  encodedPolyline: string | null;
  path: RoutePoint[];
}) {
  if (path.length < 2) {
    return null;
  }

  const origin = staticMapCoordinate(path[0]!);
  const destination = staticMapCoordinate(path[path.length - 1]!);
  const params = new URLSearchParams({
    key: apiKey,
    size: MAPS_STATIC_IMAGE_SIZE,
    scale: MAPS_STATIC_IMAGE_SCALE,
    format: "jpg-baseline",
    maptype: "roadmap",
    language: "es",
    region: "AR",
  });

  params.append(
    "visible",
    staticMapVisibleViewport(path).map(staticMapCoordinate).join("|"),
  );
  params.append("style", "feature:poi.business|element:labels|visibility:off");
  params.append("style", "feature:transit|visibility:off");
  params.append(
    "style",
    "feature:road|element:geometry|saturation:-22|lightness:14",
  );
  params.append(
    "path",
    staticMapPathValue({
      color: "0x0f172a55",
      encodedPolyline,
      path,
      weight: 9,
    }),
  );
  params.append(
    "path",
    staticMapPathValue({
      color: "0x6d28d9ff",
      encodedPolyline,
      path,
      weight: 5,
    }),
  );
  params.append("markers", `size:mid|color:blue|label:A|${origin}`);
  params.append("markers", `size:mid|color:green|label:B|${destination}`);

  return `${MAPS_STATIC_ENDPOINT}?${params.toString()}`;
}

type RouteSketchPoint = {
  x: number;
  y: number;
};

type RouteSketchGeometry = {
  points: RouteSketchPoint[];
  origin: RouteSketchPoint;
  destination: RouteSketchPoint;
};

const ROUTE_SKETCH_WIDTH = 1000;
const ROUTE_SKETCH_HEIGHT = 430;
const ROUTE_SKETCH_PADDING = {
  top: 56,
  right: 82,
  bottom: 128,
  left: 82,
};

function clampMercatorLat(lat: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function mercatorProject(point: RoutePoint): RouteSketchPoint {
  const lat = (clampMercatorLat(point.lat) * Math.PI) / 180;
  const sinLat = Math.sin(lat);

  return {
    x: (point.lng + 180) / 360,
    y: 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI),
  };
}

function fallbackRouteSketchGeometry(): RouteSketchGeometry {
  const points = [
    { x: 118, y: 256 },
    { x: 268, y: 214 },
    { x: 434, y: 234 },
    { x: 594, y: 166 },
    { x: 782, y: 178 },
    { x: 882, y: 122 },
  ];

  return {
    points,
    origin: points[0]!,
    destination: points[points.length - 1]!,
  };
}

function routeSketchGeometry(path: RoutePoint[]): RouteSketchGeometry {
  if (path.length < 2) {
    return fallbackRouteSketchGeometry();
  }

  const rawPoints = path.map(mercatorProject);
  const minX = Math.min(...rawPoints.map((point) => point.x));
  const maxX = Math.max(...rawPoints.map((point) => point.x));
  const minY = Math.min(...rawPoints.map((point) => point.y));
  const maxY = Math.max(...rawPoints.map((point) => point.y));
  const rawWidth = Math.max(maxX - minX, 0.000001);
  const rawHeight = Math.max(maxY - minY, 0.000001);
  const availableWidth =
    ROUTE_SKETCH_WIDTH - ROUTE_SKETCH_PADDING.left - ROUTE_SKETCH_PADDING.right;
  const availableHeight =
    ROUTE_SKETCH_HEIGHT -
    ROUTE_SKETCH_PADDING.top -
    ROUTE_SKETCH_PADDING.bottom;
  const scale = Math.min(
    availableWidth / rawWidth,
    availableHeight / rawHeight,
  ) / ROUTE_PREVIEW_VIEWPORT_SCALE;
  const fittedWidth = rawWidth * scale;
  const fittedHeight = rawHeight * scale;
  const offsetX =
    ROUTE_SKETCH_PADDING.left + Math.max(0, availableWidth - fittedWidth) / 2;
  const offsetY =
    ROUTE_SKETCH_PADDING.top + Math.max(0, availableHeight - fittedHeight) / 2;
  const points = rawPoints.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
  }));

  return {
    points,
    origin: points[0]!,
    destination: points[points.length - 1]!,
  };
}

function pointsAttribute(points: RouteSketchPoint[]) {
  return points
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
}

function offsetRoutePoints(points: RouteSketchPoint[], offset: number) {
  if (points.length < 2) {
    return points;
  }

  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;

    return {
      x: point.x + (-dy / length) * offset,
      y: point.y + (dx / length) * offset,
    };
  });
}

function RouteEndpointMarker({
  label,
  point,
  tone,
}: {
  label: "A" | "B";
  point: RouteSketchPoint;
  tone: "origin" | "destination";
}) {
  return (
    <g
      data-testid={`pgflex-route-marker-${label.toLowerCase()}`}
      transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`}
    >
      <circle
        r="25"
        fill={tone === "origin" ? "#2563eb" : "#16a34a"}
        opacity="0.16"
      />
      <circle
        r="18"
        fill={tone === "origin" ? "#2563eb" : "#16a34a"}
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="4"
      />
      <text
        y="5"
        textAnchor="middle"
        fill="white"
        fontSize="16"
        fontWeight="800"
      >
        {label}
      </text>
    </g>
  );
}

function RouteAddressCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "origin" | "destination";
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/80 bg-white/90 px-3.5 py-3 shadow-[0_16px_42px_rgba(15,23,42,0.14)] backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-950/82">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm",
            tone === "origin" ? "bg-blue-600" : "bg-emerald-600",
          )}
        >
          {tone === "origin" ? "A" : "B"}
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              "text-[0.62rem] font-semibold uppercase tracking-[0.18em]",
              tone === "origin"
                ? "text-blue-700/80 dark:text-blue-200/80"
                : "text-emerald-700/80 dark:text-emerald-200/80",
            )}
          >
            {label}
          </p>
          <p className="mt-0.5 break-words text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function RouteAddressDock({
  destination,
  origin,
  t,
}: {
  destination: string;
  origin: string;
  t: (text: string) => string;
}) {
  return (
    <div
      data-testid="pgflex-route-address-dock"
      className="pointer-events-none absolute inset-x-3 bottom-3 z-10 grid gap-2 md:grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,1fr)] md:items-center"
    >
      <RouteAddressCard
        label={t("Origin")}
        tone="origin"
        value={origin || t("Origin")}
      />
      <div className="hidden h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-white/86 text-slate-500 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-md md:flex dark:border-slate-700/70 dark:bg-slate-950/80 dark:text-slate-300">
        <RouteIcon className="h-4 w-4" />
      </div>
      <RouteAddressCard
        label={t("Destination")}
        tone="destination"
        value={destination || t("Destination")}
      />
    </div>
  );
}

function RouteSketch({
  destination,
  origin,
  routeEstimate,
  showAddressDock = true,
  t,
}: {
  destination: string;
  origin: string;
  routeEstimate: RouteEstimate | null;
  showAddressDock?: boolean;
  t: (text: string) => string;
}) {
  const staticMapUrl = routeEstimate?.staticMapUrl ?? null;
  const [failedStaticMapUrl, setFailedStaticMapUrl] = useState<string | null>(
    null,
  );
  const staticMapFailed = staticMapUrl === failedStaticMapUrl;
  const geometry = routeSketchGeometry(routeEstimate?.path ?? []);
  const routePoints = pointsAttribute(geometry.points);
  const routeShadowPoints = routePoints;
  const arterialNorth = pointsAttribute(
    offsetRoutePoints(geometry.points, -58),
  );
  const arterialSouth = pointsAttribute(offsetRoutePoints(geometry.points, 72));
  const arterialFar = pointsAttribute(offsetRoutePoints(geometry.points, 128));

  useEffect(() => {
    if (!staticMapUrl) {
      setFailedStaticMapUrl(null);
    }
  }, [staticMapUrl]);

  if (staticMapUrl && !staticMapFailed) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-950">
        <img
          src={staticMapUrl}
          alt={t("Route preview map")}
          data-testid="pgflex-route-static-map"
          className="absolute inset-0 h-full w-full object-cover brightness-[1.03] contrast-[1.02] saturate-[0.9]"
          loading="eager"
          decoding="async"
          onError={() => setFailedStaticMapUrl(staticMapUrl)}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_16%,rgba(124,58,237,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0)_42%,rgba(248,250,252,0.24))] dark:bg-[radial-gradient(circle_at_20%_16%,rgba(124,58,237,0.16),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.1),rgba(15,23,42,0)_42%,rgba(15,23,42,0.52))]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white/60 via-white/24 to-transparent dark:from-slate-950/62 dark:via-slate-950/26" />
        {showAddressDock ? (
          <RouteAddressDock destination={destination} origin={origin} t={t} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-950">
      <svg
        aria-hidden="true"
        className="h-full w-full"
        viewBox={`0 0 ${ROUTE_SKETCH_WIDTH} ${ROUTE_SKETCH_HEIGHT}`}
        role="presentation"
      >
        <defs>
          <linearGradient id="pgflex-map-sky" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="50%" stopColor="#eef2ff" />
            <stop offset="100%" stopColor="#ecfeff" />
          </linearGradient>
          <linearGradient id="pgflex-route-line" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="48%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <filter
            id="pgflex-route-glow"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              result="glow"
              values="0 0 0 0 0.38 0 0 0 0 0.24 0 0 0 0 0.92 0 0 0 0.28 0"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern
            id="pgflex-map-grid"
            width="58"
            height="58"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-8)"
          >
            <path
              d="M 58 0 L 0 0 0 58"
              fill="none"
              stroke="rgba(100,116,139,0.08)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect
          width={ROUTE_SKETCH_WIDTH}
          height={ROUTE_SKETCH_HEIGHT}
          fill="url(#pgflex-map-sky)"
        />
        <rect
          width={ROUTE_SKETCH_WIDTH}
          height={ROUTE_SKETCH_HEIGHT}
          fill="url(#pgflex-map-grid)"
        />
        <path
          d="M -40 92 C 160 42 252 140 412 96 S 728 72 1040 132"
          fill="none"
          stroke="rgba(148,163,184,0.24)"
          strokeLinecap="round"
          strokeWidth="22"
        />
        <path
          d="M -56 304 C 126 258 238 344 388 294 S 710 228 1058 284"
          fill="none"
          stroke="rgba(14,165,233,0.13)"
          strokeLinecap="round"
          strokeWidth="30"
        />
        <polyline
          points={arterialNorth}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="16"
        />
        <polyline
          points={arterialSouth}
          fill="none"
          stroke="rgba(14,165,233,0.12)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="18"
        />
        <polyline
          points={arterialFar}
          fill="none"
          stroke="rgba(16,185,129,0.1)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="14"
        />
        <polyline
          points={routeShadowPoints}
          fill="none"
          stroke="rgba(15,23,42,0.16)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="18"
        />
        <polyline
          points={routePoints}
          fill="none"
          filter="url(#pgflex-route-glow)"
          stroke="url(#pgflex-route-line)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="9"
        />
        <polyline
          points={routePoints}
          fill="none"
          stroke="rgba(255,255,255,0.65)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <RouteEndpointMarker label="A" point={geometry.origin} tone="origin" />
        <RouteEndpointMarker
          label="B"
          point={geometry.destination}
          tone="destination"
        />
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(124,58,237,0.13),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0)_40%,rgba(248,250,252,0.52))] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(124,58,237,0.22),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.1),rgba(15,23,42,0)_42%,rgba(15,23,42,0.58))]" />
      {showAddressDock ? (
        <RouteAddressDock destination={destination} origin={origin} t={t} />
      ) : null}
    </div>
  );
}

function RouteErrorLogDialog({
  log,
  open,
  onOpenChange,
  t,
}: {
  log: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: (text: string) => string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const logText = log ?? t("No route error log available.");

  useEffect(() => {
    if (open) {
      setCopyStatus("idle");
    }
  }, [logText, open]);

  async function handleCopyLog() {
    try {
      await navigator.clipboard.writeText(logText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setCopyStatus("idle");
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100vh-2rem)] max-w-4xl overflow-hidden rounded-[2rem] border border-violet-100 bg-[linear-gradient(160deg,rgba(250,250,255,0.98),rgba(255,255,255,0.98)_48%,rgba(245,243,255,0.96))] p-0 text-slate-950 shadow-[0_32px_120px_rgba(15,23,42,0.18)] dark:border-violet-300/18 dark:bg-slate-950"
      >
        <DialogHeader className="relative shrink-0 border-b border-violet-100 px-6 py-5 pr-16 dark:border-violet-300/18">
          <DialogTitle className="font-heading text-2xl font-semibold text-slate-950 dark:text-slate-50">
            {t("Google Maps route log")}
          </DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-slate-300">
            {t(
              "Full Google Maps route error log. Copy this JSON and send it for debugging.",
            )}
          </DialogDescription>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-5 top-5 h-9 w-9 rounded-full text-slate-700 hover:bg-violet-100/80 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-violet-400/10"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t("Close route error log")}</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleCopyLog()}
              className="border border-violet-200 bg-[linear-gradient(180deg,rgba(237,233,254,0.98),rgba(221,214,254,0.98))] text-violet-950 shadow-[0_12px_30px_rgba(124,58,237,0.18)] hover:bg-violet-100"
            >
              {copyStatus === "copied" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copyStatus === "copied"
                ? t("Copied")
                : copyStatus === "error"
                  ? t("Copy error")
                  : t("Copy log")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {t("Close")}
            </Button>
            {copyStatus === "error" ? (
              <p role="status" className="text-xs text-destructive">
                {t(
                  "Clipboard copy failed. You can still select the log text and copy it manually.",
                )}
              </p>
            ) : null}
          </div>

          <Textarea
            readOnly
            aria-label={t("Route error log details")}
            value={logText}
            className="h-[min(52vh,30rem)] min-h-0 resize-none overflow-y-auto overscroll-contain border-violet-100 bg-white/90 font-mono text-xs leading-5 text-slate-950 shadow-inner [field-sizing:fixed] dark:border-violet-300/18 dark:bg-slate-950 dark:text-violet-50"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PGFlexRouteSnapshot({
  className,
  destination,
  origin,
}: {
  className?: string;
  destination: string;
  origin: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const apiKey = resolveGoogleMapsApiKey();
  const routeRequestIdRef = useRef(0);
  const activeRouteAbortControllerRef = useRef<AbortController | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>("idle");
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(
    null,
  );
  const googleMapsRouteUrl = googleMapsDirectionsUrl(origin, destination);

  useEffect(() => {
    const originAddress = origin.trim();
    const destinationAddress = destination.trim();
    const currentRouteKey = routeKeyFor(originAddress, destinationAddress);

    activeRouteAbortControllerRef.current?.abort();
    activeRouteAbortControllerRef.current = null;
    routeRequestIdRef.current += 1;
    setRouteEstimate(null);

    if (!currentRouteKey || !hasEnoughOriginAddressContext(originAddress)) {
      setRouteStatus("idle");
      return;
    }

    const abortController = new AbortController();
    const routeRequestId = routeRequestIdRef.current;
    activeRouteAbortControllerRef.current = abortController;
    setRouteStatus("loading");

    void requestRoute({
      apiKey,
      origin: originAddress,
      destination: destinationAddress,
      signal: abortController.signal,
    })
      .then((result) => {
        if (
          routeRequestIdRef.current !== routeRequestId ||
          abortController.signal.aborted
        ) {
          return;
        }

        const duration = routeDurationFromResult(result);
        const distance = routeDistanceFromResult(result);
        const encodedPolyline = routeEncodedPolylineFromResult(result);
        const path = routePathFromResult(result);

        if (!duration || !distance || path.length < 2) {
          setRouteStatus("error");
          return;
        }

        setRouteEstimate({
          distance,
          duration,
          encodedPolyline,
          staticMapUrl: buildStaticMapUrl({ apiKey, encodedPolyline, path }),
          path,
          usesTraffic: routeUsesTrafficFromResult(result),
        });
        setRouteStatus("ready");
      })
      .catch((error) => {
        if (isAbortError(error) || abortController.signal.aborted) {
          return;
        }

        if (routeRequestIdRef.current === routeRequestId) {
          setRouteStatus("error");
        }
      });

    return () => {
      abortController.abort();
    };
  }, [apiKey, destination, origin]);

  return (
    <div
      aria-label={t("Route preview map")}
      data-status={routeStatus}
      data-testid="pgflex-route-snapshot"
      className={cn(
        "relative h-56 overflow-hidden rounded-[1.35rem] border border-sky-100/80 bg-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-sky-300/16 dark:bg-slate-950 md:h-72",
        routeStatus === "loading" && "animate-pulse",
        className,
      )}
    >
      <RouteSketch
        destination={destination}
        origin={origin}
        routeEstimate={routeEstimate}
        showAddressDock={false}
        t={t}
      />
      {googleMapsRouteUrl ? (
        <Button
          asChild
          size="sm"
          className="absolute bottom-3 right-3 z-20 h-9 rounded-full border border-white/55 bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-[0_16px_40px_rgba(37,99,235,0.28)] hover:bg-blue-700"
        >
          <a
            href={googleMapsRouteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("Open in Google Maps")}
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function routeFailureMessage(
  error: unknown,
  translate: (text: string) => string,
) {
  const message = error instanceof Error ? error.message : String(error);

  if (/SERVICE_DISABLED/i.test(message)) {
    return translate(
      "Routes API is disabled for this Google Cloud project. Enable Routes API on the project that owns this browser key.",
    );
  }

  if (/API_KEY_SERVICE_BLOCKED/i.test(message)) {
    return translate(
      "This API key is blocked from using Routes API. Add Routes API to the key API restrictions or remove API restrictions for testing.",
    );
  }

  if (/BILLING_DISABLED/i.test(message)) {
    return translate(
      "Billing is disabled for the Google Cloud project. Enable billing before calculating PGFlex routes.",
    );
  }

  if (/CONSUMER_INVALID/i.test(message)) {
    return translate(
      "Google could not match this API key to a valid consumer project. Check that the deployed key belongs to the expected Google Cloud project.",
    );
  }

  if (/API_KEY_INVALID/i.test(message)) {
    return translate(
      "Google rejected the API key as invalid. Check the deployed key value character by character.",
    );
  }

  if (/REQUEST_DENIED|PERMISSION_DENIED/i.test(message)) {
    return translate(
      "Google denied the Routes REST request. Open Show log to copy the raw Google response with HTTP status, headers and body.",
    );
  }

  if (/ZERO_RESULTS|NOT_FOUND/i.test(message)) {
    return translate(
      "Google could not find a drivable route for these addresses. Use full street, city, province, and country, then try again.",
    );
  }

  if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED/i.test(message)) {
    return translate(
      "Google Maps quota rejected this route request. Check project quota and billing before trying again.",
    );
  }

  if (/timed out|timeout/i.test(message)) {
    return translate(
      "Routes API did not answer in time. Use Change route and try again; the running request is cancelled when the route is changed.",
    );
  }

  if (/failed to fetch|network|cors/i.test(message)) {
    return translate(
      "The browser could not reach Routes API. Check network access, CORS, allowed referrers and the deployed browser key.",
    );
  }

  return translate(
    "Google Maps could not calculate this route. Check both addresses and try again with Preview route.",
  );
}

export function PGFlexRoutePreview({
  origin,
  destination,
  showDestinationField = true,
  disabled = false,
  originParts,
  onOriginChange,
  onOriginPartsChange,
  onDestinationChange,
}: {
  origin: string;
  destination: string;
  showDestinationField?: boolean;
  disabled?: boolean;
  originParts?: PGFlexRouteOriginParts;
  onOriginChange: (origin: string) => void;
  onOriginPartsChange?: (originParts: PGFlexRouteOriginParts) => void;
  onDestinationChange: (destination: string) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const apiKey = resolveGoogleMapsApiKey();
  const routeRequestIdRef = useRef(0);
  const activeRouteAbortControllerRef = useRef<AbortController | null>(null);
  const [mapsStatus, setMapsStatus] = useState<MapsLoadStatus>("idle");
  const [routeStatus, setRouteStatus] = useState<RouteStatus>("idle");
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(
    null,
  );
  const [lockedRoute, setLockedRoute] = useState<LockedRoute | null>(null);
  const [routeErrorMessage, setRouteErrorMessage] = useState<string | null>(
    null,
  );
  const [routeErrorLog, setRouteErrorLog] = useState<string | null>(null);
  const [routeErrorLogOpen, setRouteErrorLogOpen] = useState(false);
  const [routeValidationMessage, setRouteValidationMessage] = useState<
    string | null
  >(null);

  useEffect(() => {
    const currentRouteKey = routeKeyFor(origin, destination);
    setRouteValidationMessage(null);

    if (!currentRouteKey) {
      routeRequestIdRef.current += 1;
      activeRouteAbortControllerRef.current?.abort();
      activeRouteAbortControllerRef.current = null;
      setLockedRoute(null);
      setRouteEstimate(null);
      setRouteErrorMessage(null);
      setRouteErrorLog(null);
      setRouteErrorLogOpen(false);
      setRouteStatus("idle");
      return;
    }

    if (lockedRoute && lockedRoute.key !== currentRouteKey) {
      routeRequestIdRef.current += 1;
      activeRouteAbortControllerRef.current?.abort();
      activeRouteAbortControllerRef.current = null;
      setLockedRoute(null);
      setRouteEstimate(null);
      setRouteErrorMessage(null);
      setRouteErrorLog(null);
      setRouteErrorLogOpen(false);
      setRouteStatus("idle");
    }
  }, [destination, lockedRoute, origin]);

  useEffect(
    () => () => {
      activeRouteAbortControllerRef.current?.abort();
      activeRouteAbortControllerRef.current = null;
    },
    [],
  );

  function handleChangeRoute() {
    activeRouteAbortControllerRef.current?.abort();
    activeRouteAbortControllerRef.current = null;
    routeRequestIdRef.current += 1;
    setLockedRoute(null);
    setRouteEstimate(null);
    setRouteErrorMessage(null);
    setRouteErrorLog(null);
    setRouteErrorLogOpen(false);
    setRouteValidationMessage(null);
    setMapsStatus("idle");
    setRouteStatus("idle");
  }

  async function handlePreviewRoute() {
    const originAddress = origin.trim();
    const destinationAddress = destination.trim();
    const currentRouteKey = routeKeyFor(originAddress, destinationAddress);

    if (!currentRouteKey) {
      return;
    }

    const originPartsValidationMessage = originParts
      ? validatePGFlexRouteOriginParts(originParts)
      : null;
    if (originPartsValidationMessage) {
      activeRouteAbortControllerRef.current?.abort();
      activeRouteAbortControllerRef.current = null;
      routeRequestIdRef.current += 1;
      setLockedRoute(null);
      setRouteEstimate(null);
      setRouteErrorMessage(null);
      setRouteErrorLog(null);
      setRouteErrorLogOpen(false);
      setRouteValidationMessage(t(originPartsValidationMessage));
      setMapsStatus("idle");
      setRouteStatus("idle");
      return;
    }

    if (!hasEnoughOriginAddressContext(originAddress)) {
      activeRouteAbortControllerRef.current?.abort();
      activeRouteAbortControllerRef.current = null;
      routeRequestIdRef.current += 1;
      setLockedRoute(null);
      setRouteEstimate(null);
      setRouteErrorMessage(null);
      setRouteErrorLog(null);
      setRouteErrorLogOpen(false);
      setRouteValidationMessage(
        t(
          "Add at least locality and province to the origin before previewing the route.",
        ),
      );
      setMapsStatus("idle");
      setRouteStatus("idle");
      return;
    }

    activeRouteAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    activeRouteAbortControllerRef.current = abortController;
    const routeRequestId = routeRequestIdRef.current + 1;
    const requestStartedAt = new Date().toISOString();
    let failurePhase = "Routes REST computeRoutes";
    routeRequestIdRef.current = routeRequestId;
    setLockedRoute({
      key: currentRouteKey,
    });
    setRouteEstimate(null);
    setRouteErrorMessage(null);
    setRouteErrorLog(null);
    setRouteErrorLogOpen(false);
    setRouteValidationMessage(null);
    setMapsStatus("loading");
    setRouteStatus("loading");

    try {
      failurePhase = "Routes REST computeRoutes";
      const result = await withTimeout(
        requestRoute({
          apiKey,
          origin: originAddress,
          destination: destinationAddress,
          signal: abortController.signal,
        }),
        ROUTE_REQUEST_TIMEOUT_MS,
        abortController.signal,
        "Google Maps Routes REST API timed out",
        () => abortController.abort(),
      );

      if (routeRequestIdRef.current !== routeRequestId) {
        return;
      }

      const duration = routeDurationFromResult(result);
      const distance = routeDistanceFromResult(result);
      const encodedPolyline = routeEncodedPolylineFromResult(result);
      const path = routePathFromResult(result);

      if (!duration || !distance || path.length < 2) {
        throw new Error("Routes API response is incomplete");
      }

      setRouteEstimate({
        distance,
        duration,
        encodedPolyline,
        staticMapUrl: buildStaticMapUrl({ apiKey, encodedPolyline, path }),
        path,
        usesTraffic: routeUsesTrafficFromResult(result),
      });
      setRouteErrorLog(null);
      setRouteErrorLogOpen(false);
      setMapsStatus("ready");
      setRouteStatus("ready");
    } catch (error) {
      if (isAbortError(error) || routeRequestIdRef.current !== routeRequestId) {
        return;
      }

      const finalError = error;

      setRouteEstimate(null);
      setRouteErrorMessage(routeFailureMessage(finalError, t));
      setRouteErrorLog(
        routeErrorLogForFailure({
          apiKey,
          destination: destinationAddress,
          error: finalError,
          failedAt: new Date().toISOString(),
          origin: originAddress,
          phase: failurePhase,
          requestId: routeRequestId,
          startedAt: requestStartedAt,
        }),
      );
      setMapsStatus("error");
      setRouteStatus("error");
    } finally {
      if (routeRequestIdRef.current === routeRequestId) {
        activeRouteAbortControllerRef.current = null;
      }
    }
  }

  function handleShowRouteLog() {
    setRouteErrorLogOpen(true);
  }

  function handleOriginPartsChange(
    next: Partial<Omit<PGFlexRouteOriginParts, "country">>,
  ) {
    if (!originParts || !onOriginPartsChange) {
      return;
    }

    onOriginPartsChange({
      ...originParts,
      ...("address" in next && typeof next.address === "string"
        ? { address: sanitizePGFlexRouteOriginTextPart(next.address) }
        : {}),
      ...("locality" in next && typeof next.locality === "string"
        ? { locality: sanitizePGFlexRouteOriginTextPart(next.locality) }
        : {}),
      ...("provinceDistrict" in next
        ? { provinceDistrict: next.provinceDistrict }
        : {}),
      country: PGFLEX_ROUTE_ORIGIN_COUNTRY,
    });
  }

  const hasBothAddresses = Boolean(origin.trim() && destination.trim());
  const isRouteLocked = Boolean(lockedRoute);
  const routeFieldDisabled = disabled || isRouteLocked;
  const usesSplitOrigin = Boolean(originParts && onOriginPartsChange);
  const isPreviewLoading =
    mapsStatus === "loading" || routeStatus === "loading";
  const hasRoutePreviewError =
    mapsStatus === "error" || routeStatus === "error";
  const showMapOverlay =
    mapsStatus === "loading" ||
    mapsStatus === "error" ||
    routeStatus === "idle" ||
    routeStatus === "loading" ||
    routeStatus === "error";
  const showCenterPreviewButton =
    !isPreviewLoading &&
    !hasRoutePreviewError &&
    !routeValidationMessage &&
    hasBothAddresses;
  const googleMapsRouteUrl = routeEstimate
    ? googleMapsDirectionsUrl(origin, destination)
    : null;

  return (
    <div className="space-y-4 md:col-span-2">
      <div className="grid gap-4 md:grid-cols-2">
        {usesSplitOrigin && originParts ? (
          <fieldset className="rounded-2xl border border-border/70 bg-muted/14 p-4 md:col-span-2">
            <legend className="px-1 text-sm font-medium text-foreground">
              {t("Origin")}
            </legend>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pgflex-origin-address">{t("Address")}</Label>
                <Input
                  id="pgflex-origin-address"
                  value={originParts.address}
                  onChange={(event) =>
                    handleOriginPartsChange({ address: event.target.value })
                  }
                  disabled={routeFieldDisabled}
                  minLength={PGFLEX_ROUTE_ORIGIN_TEXT_PART_MIN_LENGTH}
                  autoComplete="street-address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pgflex-origin-locality">
                  {t("Neighborhood / Locality")}
                </Label>
                <Input
                  id="pgflex-origin-locality"
                  value={originParts.locality}
                  onChange={(event) =>
                    handleOriginPartsChange({ locality: event.target.value })
                  }
                  disabled={routeFieldDisabled}
                  minLength={PGFLEX_ROUTE_ORIGIN_TEXT_PART_MIN_LENGTH}
                  autoComplete="address-level2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pgflex-origin-province-district">
                  {t("Province / District")}
                </Label>
                <Select
                  value={originParts.provinceDistrict}
                  onValueChange={(value) =>
                    handleOriginPartsChange({
                      provinceDistrict:
                        value as PGFlexRouteOriginProvinceDistrict,
                    })
                  }
                  disabled={routeFieldDisabled}
                >
                  <SelectTrigger
                    id="pgflex-origin-province-district"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PGFLEX_ROUTE_ORIGIN_PROVINCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pgflex-origin-country">{t("Country")}</Label>
                <Input
                  id="pgflex-origin-country"
                  value={PGFLEX_ROUTE_ORIGIN_COUNTRY}
                  disabled
                  autoComplete="country-name"
                />
              </div>
            </div>
          </fieldset>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="pgflex-origin">{t("Origin")}</Label>
            <Input
              id="pgflex-origin"
              value={origin}
              onChange={(event) => onOriginChange(event.target.value)}
              disabled={routeFieldDisabled}
              autoComplete="street-address"
            />
          </div>
        )}

        {showDestinationField ? (
          <div className={cn("space-y-2", usesSplitOrigin && "md:col-span-2")}>
            <Label htmlFor="pgflex-destination">{t("Destination")}</Label>
            <Input
              id="pgflex-destination"
              value={destination}
              onChange={(event) => onDestinationChange(event.target.value)}
              disabled={routeFieldDisabled}
              autoComplete="street-address"
            />
          </div>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-muted/20">
        <div className="flex flex-col gap-3 border-b border-border/70 bg-background/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-200/80 bg-violet-500/10 text-violet-600 dark:border-violet-300/20 dark:text-violet-200">
              <MapPinned className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t("Route preview")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("Best driving route with approximate time.")}
              </p>
            </div>
          </div>

          <div
            data-testid="pgflex-route-header-actions"
            className="flex flex-wrap items-center gap-2"
          >
            {isRouteLocked && !hasRoutePreviewError ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleChangeRoute}
                disabled={disabled}
              >
                <RouteIcon className="h-3.5 w-3.5" />
                {t("Change route")}
              </Button>
            ) : null}
            {routeEstimate ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  <RouteIcon className="h-3 w-3" />
                  {routeEstimate.distance}
                </Badge>
                <Badge variant="secondary" className="gap-1.5">
                  <Clock3 className="h-3 w-3" />
                  {routeEstimate.duration}
                </Badge>
                {routeEstimate.usesTraffic ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-200/80 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/25 dark:text-emerald-200"
                  >
                    {t("Traffic aware")}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative h-[23rem] overflow-hidden bg-slate-100 sm:h-[24rem] dark:bg-slate-950">
          <div
            className={cn(
              "h-full w-full transition-opacity duration-300",
              showMapOverlay ? "opacity-25" : "opacity-100",
            )}
          >
            <RouteSketch
              destination={destination}
              origin={origin}
              routeEstimate={routeEstimate}
              t={t}
            />
          </div>

          {showMapOverlay ? (
            <div className="absolute inset-0 flex items-center justify-center px-4">
              <div
                data-testid="pgflex-route-overlay-card"
                className={cn(
                  "flex max-w-sm flex-col items-center gap-2 rounded-2xl text-center",
                  showCenterPreviewButton
                    ? "border-0 bg-transparent p-0 shadow-none backdrop-blur-0"
                    : "border border-border/70 bg-background/88 px-4 py-4 shadow-sm backdrop-blur",
                )}
              >
                {mapsStatus === "loading" || routeStatus === "loading" ? (
                  <>
                    <LoaderCircle className="h-5 w-5 animate-spin text-violet-600 dark:text-violet-200" />
                    <p className="text-sm font-medium text-foreground">
                      {t("Finding route...")}
                    </p>
                  </>
                ) : mapsStatus === "error" ? (
                  <div
                    role="alert"
                    className="flex flex-col items-center gap-2"
                  >
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <p className="text-sm font-medium text-foreground">
                      {t("Google Maps route preview is unavailable.")}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {routeErrorMessage ??
                        t(
                          "The browser could not reach Routes API. Check network access, CORS, allowed referrers and the deployed browser key.",
                        )}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="gap-1.5"
                        onClick={handleChangeRoute}
                        disabled={disabled}
                      >
                        <RouteIcon className="h-3.5 w-3.5" />
                        {t("Change route")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleShowRouteLog}
                      >
                        {t("Show log")}
                      </Button>
                    </div>
                  </div>
                ) : routeStatus === "error" ? (
                  <div
                    role="alert"
                    className="flex flex-col items-center gap-2"
                  >
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <p className="text-sm font-medium text-foreground">
                      {t("Unable to calculate a route for these addresses.")}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {routeErrorMessage}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="gap-1.5"
                        onClick={handleChangeRoute}
                        disabled={disabled}
                      >
                        <RouteIcon className="h-3.5 w-3.5" />
                        {t("Change route")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleShowRouteLog}
                      >
                        {t("Show log")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full flex-col items-center gap-2">
                    {routeValidationMessage ? (
                      <div
                        role="alert"
                        className="flex flex-col items-center gap-2"
                      >
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                        <p className="text-sm font-medium text-foreground">
                          {t("Complete origin address")}
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {routeValidationMessage}
                        </p>
                      </div>
                    ) : hasBothAddresses ? (
                      <Button
                        type="button"
                        variant="default"
                        size="lg"
                        data-testid="pgflex-route-center-preview"
                        className="h-12 w-full min-w-[13rem] rounded-2xl gap-1.5 px-5 shadow-[0_14px_34px_rgba(37,99,235,0.28)]"
                        onClick={handlePreviewRoute}
                        disabled={disabled || isPreviewLoading}
                      >
                        <RouteIcon className="h-3.5 w-3.5" />
                        {t("Preview route")}
                      </Button>
                    ) : (
                      <>
                        <Navigation className="h-5 w-5 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">
                          {t(
                            "Add origin and destination addresses to preview the route.",
                          )}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {googleMapsRouteUrl && !showMapOverlay ? (
            <Button
              asChild
              size="sm"
              className="absolute bottom-44 right-3 z-20 h-9 rounded-full border border-white/55 bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-[0_16px_40px_rgba(37,99,235,0.28)] hover:bg-blue-700 md:bottom-24"
            >
              <a
                href={googleMapsRouteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("Open in Google Maps")}
              </a>
            </Button>
          ) : null}
        </div>
      </section>
      <RouteErrorLogDialog
        log={routeErrorLog}
        open={routeErrorLogOpen}
        onOpenChange={setRouteErrorLogOpen}
        t={t}
      />
    </div>
  );
}
