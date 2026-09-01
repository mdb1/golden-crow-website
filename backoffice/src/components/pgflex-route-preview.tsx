"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
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
const ROUTES_API_IMPLEMENTATION = {
  product: "Routes API",
  transport: "browser fetch",
  method: `POST ${ROUTES_COMPUTE_ROUTES_ENDPOINT}`,
  fieldMask: ROUTES_COMPUTE_ROUTES_FIELD_MASK,
  trafficAware: true,
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
  usesTraffic: boolean;
  path: RoutePoint[];
};
type LockedRoute = {
  key: string;
};
type GoogleMapsRouteError = Error & {
  pgflexGoogleStatus?: string;
  pgflexGoogleRequest?: unknown;
  pgflexGoogleResult?: unknown;
};

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

function routePathFromResult(result: any): RoutePoint[] {
  const route = result?.routes?.[0];
  const encodedPolyline = route?.polyline?.encodedPolyline;

  if (typeof encodedPolyline === "string" && encodedPolyline.trim()) {
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

function sketchPolylinePoints(path: RoutePoint[]) {
  if (path.length < 2) {
    return "56,214 320,116 584,214";
  }

  const minLat = Math.min(...path.map((point) => point.lat));
  const maxLat = Math.max(...path.map((point) => point.lat));
  const minLng = Math.min(...path.map((point) => point.lng));
  const maxLng = Math.max(...path.map((point) => point.lng));
  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;
  const padding = 44;
  const width = 640;
  const height = 300;

  return path
    .map((point) => {
      const x =
        padding + ((point.lng - minLng) / lngRange) * (width - padding * 2);
      const y =
        padding +
        (1 - (point.lat - minLat) / latRange) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function RouteSketch({
  destination,
  origin,
  routeEstimate,
}: {
  destination: string;
  origin: string;
  routeEstimate: RouteEstimate | null;
}) {
  const points = sketchPolylinePoints(routeEstimate?.path ?? []);

  return (
    <svg
      aria-hidden="true"
      className="h-full w-full"
      viewBox="0 0 640 300"
      role="presentation"
    >
      <defs>
        <linearGradient id="pgflex-route-line" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="52%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <rect width="640" height="300" fill="rgba(248,250,252,0.72)" />
      <path
        d="M 52 58 C 156 18 236 88 320 54 S 484 38 588 86"
        fill="none"
        stroke="rgba(148,163,184,0.22)"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <path
        d="M 40 230 C 144 188 242 246 332 206 S 502 162 600 210"
        fill="none"
        stroke="rgba(14,165,233,0.14)"
        strokeWidth="24"
        strokeLinecap="round"
      />
      <polyline
        points={points}
        fill="none"
        stroke="rgba(15,23,42,0.14)"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={points}
        fill="none"
        stroke="url(#pgflex-route-line)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="56" cy="214" r="15" fill="#2563eb" />
      <circle cx="584" cy="214" r="15" fill="#16a34a" />
      <text
        x="56"
        y="219"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="700"
      >
        A
      </text>
      <text
        x="584"
        y="219"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="700"
      >
        B
      </text>
      <text x="42" y="278" fill="#334155" fontSize="13" fontWeight="700">
        {origin || "Origen"}
      </text>
      <text
        x="598"
        y="278"
        fill="#334155"
        fontSize="13"
        fontWeight="700"
        textAnchor="end"
      >
        {destination || "Destino"}
      </text>
    </svg>
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
  onOriginChange,
  onDestinationChange,
}: {
  origin: string;
  destination: string;
  showDestinationField?: boolean;
  disabled?: boolean;
  onOriginChange: (origin: string) => void;
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

  useEffect(() => {
    const currentRouteKey = routeKeyFor(origin, destination);

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
      const path = routePathFromResult(result);

      if (!duration || !distance || path.length < 2) {
        throw new Error("Routes API response is incomplete");
      }

      setRouteEstimate({
        distance,
        duration,
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

  const hasBothAddresses = Boolean(origin.trim() && destination.trim());
  const isRouteLocked = Boolean(lockedRoute);
  const isPreviewLoading =
    mapsStatus === "loading" || routeStatus === "loading";
  const showMapOverlay =
    mapsStatus === "loading" ||
    mapsStatus === "error" ||
    routeStatus === "idle" ||
    routeStatus === "loading" ||
    routeStatus === "error";

  return (
    <div className="space-y-4 md:col-span-2">
      <div
        className={cn(
          "grid gap-4",
          showDestinationField ? "md:grid-cols-2" : "md:grid-cols-1",
        )}
      >
        <div className="space-y-2">
          <Label htmlFor="pgflex-origin">{t("Origin")}</Label>
          <Input
            id="pgflex-origin"
            value={origin}
            onChange={(event) => onOriginChange(event.target.value)}
            disabled={disabled || isRouteLocked}
            autoComplete="street-address"
          />
        </div>

        {showDestinationField ? (
          <div className="space-y-2">
            <Label htmlFor="pgflex-destination">{t("Destination")}</Label>
            <Input
              id="pgflex-destination"
              value={destination}
              onChange={(event) => onDestinationChange(event.target.value)}
              disabled={disabled || isRouteLocked}
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

          <div className="flex flex-wrap items-center gap-2">
            {isRouteLocked ? (
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
            ) : hasBothAddresses ? (
              <Button
                type="button"
                variant={mapsStatus === "ready" ? "secondary" : "default"}
                size="sm"
                className="gap-1.5"
                onClick={handlePreviewRoute}
                disabled={disabled || isPreviewLoading}
              >
                {isPreviewLoading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RouteIcon className="h-3.5 w-3.5" />
                )}
                {t("Preview route")}
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

        <div className="relative h-72 overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.18),transparent_28%),linear-gradient(135deg,rgba(148,163,184,0.18),rgba(255,255,255,0.08))]">
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
            />
          </div>

          {showMapOverlay ? (
            <div className="absolute inset-0 flex items-center justify-center px-4">
              <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-border/70 bg-background/88 px-4 py-4 text-center shadow-sm backdrop-blur">
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
                    {routeErrorLog ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleShowRouteLog}
                      >
                        {t("Show log")}
                      </Button>
                    ) : null}
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
                    {routeErrorLog ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleShowRouteLog}
                      >
                        {t("Show log")}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <Navigation className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {hasBothAddresses
                        ? t("Preview route")
                        : t(
                            "Add origin and destination addresses to preview the route.",
                          )}
                    </p>
                  </>
                )}
              </div>
            </div>
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
