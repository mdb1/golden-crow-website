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
import { appText } from "@/lib/language";
import { cn } from "@/lib/utils";

const GOOGLE_MAPS_SCRIPT_ID = "pgflex-google-maps-js-api";
const PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY =
  "AIzaSyDX5QOmZrG7GekSIMoqFT3oymQP20w2az0";
const ROUTE_REQUEST_TIMEOUT_MS = 15000;
const MAP_AUTH_ERROR_CHECK_DELAY_MS = 250;

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
  staticMapUrl: string;
};
type LockedRoute = {
  key: string;
};
type GoogleMapsRouteError = Error & {
  pgflexGoogleStatus?: string;
  pgflexGoogleRequest?: unknown;
  pgflexGoogleResult?: unknown;
};
type GoogleMapsWindow = Window &
  typeof globalThis & {
    google?: { maps: any };
    __pgflexGoogleMapsPromise?: Promise<void>;
    __pgflexGoogleMapsAuthError?: Error;
    gm_authFailure?: () => void;
  };

function getGoogleMapsWindow() {
  return window as GoogleMapsWindow;
}

function makeAbortError() {
  const error = new Error("Route preview cancelled");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function makeGoogleMapsConfigurationError(detail?: string) {
  const error = new Error(
    detail
      ? `Google Maps render authorization failed: ${detail}`
      : "Google Maps render authorization failed",
  );
  error.name = "GoogleMapsConfigurationError";
  return error;
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

function isGoogleMapsConfigurationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "GoogleMapsConfigurationError" ||
    /render authorization failed|route authorization failed|This page can't load Google Maps correctly|Oops! Something went wrong/i.test(
      error.message,
    )
  );
}

function clearGoogleMapsAuthError() {
  delete getGoogleMapsWindow().__pgflexGoogleMapsAuthError;
}

function installGoogleMapsAuthFailureHandler() {
  const mapsWindow = getGoogleMapsWindow();
  const currentHandler = mapsWindow.gm_authFailure as
    ((() => void) & { __pgflexHandler?: boolean }) | undefined;

  if (currentHandler?.__pgflexHandler) {
    return;
  }

  const previousHandler = mapsWindow.gm_authFailure;
  const handler = (() => {
    mapsWindow.__pgflexGoogleMapsAuthError = makeGoogleMapsConfigurationError();
    previousHandler?.();
  }) as (() => void) & { __pgflexHandler?: boolean };
  handler.__pgflexHandler = true;
  mapsWindow.gm_authFailure = handler;
}

function getGoogleMapsAuthError() {
  return getGoogleMapsWindow().__pgflexGoogleMapsAuthError;
}

function serializableError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      pgflexGoogleStatus: (error as GoogleMapsRouteError).pgflexGoogleStatus,
      pgflexGoogleRequest: (error as GoogleMapsRouteError).pgflexGoogleRequest,
      pgflexGoogleResult: (error as GoogleMapsRouteError).pgflexGoogleResult,
    };
  }

  return error;
}

function redactGoogleMapsApiKey(value: string) {
  return value.replace(/([?&]key=)[^&]+/i, "$1[redacted]");
}

function googleMapsScriptUrlForLog(apiKey: string) {
  return redactGoogleMapsApiKey(
    `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`,
  );
}

function resolveGoogleMapsApiKeySource() {
  if (normalizeGoogleMapsApiKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)) {
    return "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY";
  }

  if (
    normalizeGoogleMapsApiKey(process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY)
  ) {
    return "NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY";
  }

  return "PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY fallback";
}

function googleMapsEnvironmentLog(apiKey: string) {
  const mapsWindow = getGoogleMapsWindow();
  const script = document.getElementById(
    GOOGLE_MAPS_SCRIPT_ID,
  ) as HTMLScriptElement | null;

  return {
    pageUrl: window.location.href,
    userAgent: window.navigator.userAgent,
    configuredApiKey: {
      present: Boolean(apiKey),
      source: resolveGoogleMapsApiKeySource(),
    },
    script: script
      ? {
          id: script.id,
          present: true,
          src: redactGoogleMapsApiKey(script.src),
          async: script.async,
          defer: script.defer,
          loaded: script.dataset.pgflexLoaded === "true",
        }
      : {
          id: GOOGLE_MAPS_SCRIPT_ID,
          present: false,
          expectedSrc: googleMapsScriptUrlForLog(apiKey),
        },
    googleNamespacePresent: Boolean(mapsWindow.google?.maps),
    directionsServicePresent: Boolean(
      mapsWindow.google?.maps?.DirectionsService,
    ),
    authFailureCaptured: Boolean(mapsWindow.__pgflexGoogleMapsAuthError),
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

  return stringifyErrorLog({
    logType: "pgflex_route_preview_error",
    capturedAt: failedAt,
    component: "PGFlexRoutePreview",
    requestId,
    phase,
    elapsedMs,
    routeInput: {
      origin,
      destination,
    },
    apiCalls: [
      {
        name: "Google Maps JavaScript API loader",
        provider: "Google Maps Platform",
        call: "GET https://maps.googleapis.com/maps/api/js",
        request: {
          scriptId: GOOGLE_MAPS_SCRIPT_ID,
          src:
            environment.script.present && "src" in environment.script
              ? environment.script.src
              : googleMapsScriptUrlForLog(apiKey),
          apiKeySource: resolveGoogleMapsApiKeySource(),
          apiKeyRedacted: true,
          async: true,
          defer: true,
        },
        observed: {
          script: environment.script,
          googleNamespacePresent: environment.googleNamespacePresent,
          directionsServicePresent: environment.directionsServicePresent,
          authFailureCaptured: environment.authFailureCaptured,
        },
      },
      {
        name: "Directions route calculation",
        provider: "Google Maps Platform",
        call: "google.maps.DirectionsService.route",
        request:
          routeError.pgflexGoogleRequest ?? {
            origin,
            destination,
            note: "No DirectionsService.route request was captured because the failure happened before the route callback.",
          },
        response: {
          status: routeError.pgflexGoogleStatus ?? null,
          result: routeError.pgflexGoogleResult ?? null,
        },
      },
    ],
    googleApiDump: {
      status: routeError.pgflexGoogleStatus,
      request: routeError.pgflexGoogleRequest,
      result: routeError.pgflexGoogleResult,
    },
    thrownError: serializableError(error),
    environment,
  });
}

async function assertGoogleMapsAuthIsClean(signal: AbortSignal) {
  const immediateError = getGoogleMapsAuthError();

  if (immediateError) {
    throw immediateError;
  }

  await withTimeout(
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, MAP_AUTH_ERROR_CHECK_DELAY_MS);
    }),
    ROUTE_REQUEST_TIMEOUT_MS,
    signal,
    "Google Maps auth check timed out",
  );

  const delayedError = getGoogleMapsAuthError();

  if (delayedError) {
    throw delayedError;
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
  timeoutMessage: string,
) {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(makeAbortError());
      return;
    }

    const timeoutId = window.setTimeout(() => {
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
  return (
    normalizeGoogleMapsApiKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) ??
    normalizeGoogleMapsApiKey(
      process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY,
    ) ??
    PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY
  );
}

function loadGoogleMaps(apiKey: string) {
  const mapsWindow = getGoogleMapsWindow();
  installGoogleMapsAuthFailureHandler();

  if (mapsWindow.google?.maps) {
    return Promise.resolve();
  }

  if (mapsWindow.__pgflexGoogleMapsPromise) {
    return mapsWindow.__pgflexGoogleMapsPromise;
  }

  mapsWindow.__pgflexGoogleMapsPromise = new Promise<void>(
    (resolve, reject) => {
      const existingScript = document.getElementById(
        GOOGLE_MAPS_SCRIPT_ID,
      ) as HTMLScriptElement | null;

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), {
          once: true,
        });
        existingScript.addEventListener(
          "error",
          () => {
            delete mapsWindow.__pgflexGoogleMapsPromise;
            existingScript.remove();
            reject(new Error("Google Maps failed to load"));
          },
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.id = GOOGLE_MAPS_SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey,
      )}`;
      script.async = true;
      script.defer = true;
      script.addEventListener(
        "load",
        () => {
          script.dataset.pgflexLoaded = "true";
          resolve();
        },
        { once: true },
      );
      script.addEventListener(
        "error",
        () => {
          delete mapsWindow.__pgflexGoogleMapsPromise;
          script.remove();
          reject(new Error("Google Maps failed to load"));
        },
        { once: true },
      );
      document.head.appendChild(script);
    },
  );

  return mapsWindow.__pgflexGoogleMapsPromise;
}

function resetGoogleMapsLoaderIfPending() {
  const mapsWindow = getGoogleMapsWindow();
  clearGoogleMapsAuthError();

  if (mapsWindow.google?.maps) {
    return;
  }

  delete mapsWindow.__pgflexGoogleMapsPromise;
  document.getElementById(GOOGLE_MAPS_SCRIPT_ID)?.remove();
}

function requestRoute({
  directionsService,
  maps,
  origin,
  destination,
}: {
  directionsService: any;
  maps: any;
  origin: string;
  destination: string;
}) {
  return new Promise<any>((resolve, reject) => {
    const departureTime = new Date();
    const request = {
      origin,
      destination,
      travelMode: maps.TravelMode.DRIVING,
      unitSystem: maps.UnitSystem.METRIC,
      provideRouteAlternatives: false,
      drivingOptions: {
        departureTime,
        trafficModel: maps.TrafficModel.BEST_GUESS,
      },
    };
    const loggableRequest = {
      ...request,
      drivingOptions: {
        departureTime: departureTime.toISOString(),
        trafficModel: maps.TrafficModel.BEST_GUESS,
      },
    };

    directionsService.route(request, (result: any, status: string) => {
      if (status === "OK" && result) {
        resolve(result);
        return;
      }

      reject(
        makeGoogleMapsRouteError({
          request: loggableRequest,
          result,
          status,
        }),
      );
    });
  });
}

function routeKeyFor(origin: string, destination: string) {
  const originAddress = origin.trim();
  const destinationAddress = destination.trim();

  if (!originAddress || !destinationAddress) {
    return "";
  }

  return `${originAddress}\n${destinationAddress}`;
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
  const overviewPath = Array.isArray(route?.overview_path)
    ? route.overview_path
    : [];
  const points = overviewPath
    .map(routePointFromLatLng)
    .filter((point: RoutePoint | null): point is RoutePoint => Boolean(point));

  if (points.length >= 2) {
    return points;
  }

  const leg = route?.legs?.[0];
  const start = routePointFromLatLng(leg?.start_location);
  const end = routePointFromLatLng(leg?.end_location);

  return [start, end].filter((point: RoutePoint | null): point is RoutePoint =>
    Boolean(point),
  );
}

function routePolylineFromResult(result: any) {
  const polyline = result?.routes?.[0]?.overview_polyline?.points;
  return typeof polyline === "string" && polyline.trim()
    ? polyline.trim()
    : null;
}

function staticMapUrlForRoute({
  apiKey,
  destination,
  origin,
  polyline,
}: {
  apiKey: string;
  destination: string;
  origin: string;
  polyline: string | null;
}) {
  const params = new URLSearchParams({
    key: apiKey,
    maptype: "roadmap",
    scale: "2",
    size: "640x360",
  });

  params.append("markers", `color:0x2563eb|label:A|${origin}`);
  params.append("markers", `color:0x16a34a|label:B|${destination}`);

  if (polyline) {
    params.append("path", `color:0x7c3aedff|weight:5|enc:${polyline}`);
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
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
  const [staticMapFailed, setStaticMapFailed] = useState(false);

  useEffect(() => {
    setStaticMapFailed(false);
  }, [routeEstimate?.staticMapUrl]);

  if (routeEstimate?.staticMapUrl && !staticMapFailed) {
    return (
      <img
        src={routeEstimate.staticMapUrl}
        alt="Route preview map"
        className="h-full w-full object-cover"
        onError={() => setStaticMapFailed(true)}
      />
    );
  }

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
        className="max-w-4xl overflow-hidden rounded-[2rem] border border-violet-100 bg-[linear-gradient(160deg,rgba(250,250,255,0.98),rgba(255,255,255,0.98)_48%,rgba(245,243,255,0.96))] p-0 text-slate-950 shadow-[0_32px_120px_rgba(15,23,42,0.18)] dark:border-violet-300/18 dark:bg-slate-950"
      >
        <DialogHeader className="relative border-b border-violet-100 px-6 py-5 pr-16 dark:border-violet-300/18">
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

        <div className="space-y-4 px-6 py-5">
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
            className="min-h-[24rem] resize-none border-violet-100 bg-white/90 font-mono text-xs leading-5 text-slate-950 shadow-inner dark:border-violet-300/18 dark:bg-slate-950 dark:text-violet-50"
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

  if (isGoogleMapsConfigurationError(error)) {
    return translate(
      "Google Maps rejected the route preview before calculation. This is a browser API key, billing, or API enablement problem, not an address problem. Check allowed domains for this deploy URL and that Maps JavaScript API and Directions API are enabled.",
    );
  }

  if (/REQUEST_DENIED/i.test(message)) {
    return translate(
      "Google rejected the route services request. This is usually API configuration, not the addresses. Check API key restrictions, billing, and that Maps JavaScript API and Directions API are enabled.",
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
      "Google Maps did not answer in time. Use Change route and try again. If the map behind this message shows a Google error, check browser API key restrictions, billing, and enabled Google Maps APIs.",
    );
  }

  if (/failed to load|namespace|unavailable/i.test(message)) {
    return translate(
      "Google Maps failed to load. Verify the browser API key, allowed domains, billing, and that Maps JavaScript API is enabled.",
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
  const directionsServiceRef = useRef<any>(null);
  const routeRequestIdRef = useRef(0);
  const activeRouteAbortControllerRef = useRef<AbortController | null>(null);
  const lastPreviewedRouteKeyRef = useRef<string | null>(null);
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
      lastPreviewedRouteKeyRef.current = null;
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
      lastPreviewedRouteKeyRef.current = null;
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

  async function ensureRouteServicesReady(signal: AbortSignal) {
    if (directionsServiceRef.current) {
      await assertGoogleMapsAuthIsClean(signal);
      setMapsStatus("ready");
      return;
    }

    clearGoogleMapsAuthError();
    setMapsStatus("loading");
    await withTimeout(
      loadGoogleMaps(apiKey),
      ROUTE_REQUEST_TIMEOUT_MS,
      signal,
      "Google Maps load timed out",
    );
    const maps = getGoogleMapsWindow().google?.maps;

    if (!maps?.DirectionsService) {
      throw new Error("Google Maps namespace is unavailable");
    }

    directionsServiceRef.current ??= new maps.DirectionsService();
    await assertGoogleMapsAuthIsClean(signal);
    setMapsStatus("ready");
  }

  function handleChangeRoute() {
    activeRouteAbortControllerRef.current?.abort();
    activeRouteAbortControllerRef.current = null;
    routeRequestIdRef.current += 1;
    resetGoogleMapsLoaderIfPending();
    lastPreviewedRouteKeyRef.current = null;
    setLockedRoute(null);
    setRouteEstimate(null);
    setRouteErrorMessage(null);
    setRouteErrorLog(null);
    setRouteErrorLogOpen(false);
    setMapsStatus(directionsServiceRef.current ? "ready" : "idle");
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
    let failurePhase = "Google Maps JavaScript API loader";
    routeRequestIdRef.current = routeRequestId;
    setLockedRoute({
      key: currentRouteKey,
    });
    setRouteEstimate(null);
    setRouteErrorMessage(null);
    setRouteErrorLog(null);
    setRouteErrorLogOpen(false);
    setRouteStatus("loading");

    try {
      await ensureRouteServicesReady(abortController.signal);

      if (routeRequestIdRef.current !== routeRequestId) {
        return;
      }

      const maps = getGoogleMapsWindow().google?.maps;
      const directionsService = directionsServiceRef.current;

      if (!maps || !directionsService) {
        throw new Error("Google Maps route services are unavailable");
      }

      failurePhase = "DirectionsService.route";
      const result = await withTimeout(
        requestRoute({
          directionsService,
          maps,
          origin: originAddress,
          destination: destinationAddress,
        }),
        ROUTE_REQUEST_TIMEOUT_MS,
        abortController.signal,
        "Google Maps directions timed out",
      );

      if (routeRequestIdRef.current !== routeRequestId) {
        return;
      }

      const leg = result.routes?.[0]?.legs?.[0];
      const duration = leg?.duration_in_traffic?.text ?? leg?.duration?.text;
      const distance = leg?.distance?.text;
      const path = routePathFromResult(result);

      if (!duration || !distance || path.length < 2) {
        throw new Error("Route leg is incomplete");
      }

      lastPreviewedRouteKeyRef.current = currentRouteKey;
      setRouteEstimate({
        distance,
        duration,
        path,
        staticMapUrl: staticMapUrlForRoute({
          apiKey,
          destination: destinationAddress,
          origin: originAddress,
          polyline: routePolylineFromResult(result),
        }),
        usesTraffic: Boolean(leg?.duration_in_traffic),
      });
      setRouteErrorLog(null);
      setRouteErrorLogOpen(false);
      setRouteStatus("ready");
    } catch (error) {
      if (isAbortError(error) || routeRequestIdRef.current !== routeRequestId) {
        return;
      }

      const finalError = getGoogleMapsAuthError() ?? error;

      resetGoogleMapsLoaderIfPending();
      if (isGoogleMapsConfigurationError(finalError)) {
        directionsServiceRef.current = null;
      }
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
      setMapsStatus(
        isGoogleMapsConfigurationError(finalError)
          ? "error"
          : directionsServiceRef.current
            ? "ready"
            : "error",
      );
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
                          "Google Maps failed to load. Verify the browser API key, allowed domains, billing, and that Maps JavaScript API is enabled.",
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
