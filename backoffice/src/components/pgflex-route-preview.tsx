"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  LoaderCircle,
  MapPinned,
  Navigation,
  Route as RouteIcon,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appText } from "@/lib/language";
import { cn } from "@/lib/utils";

const GOOGLE_MAPS_SCRIPT_ID = "pgflex-google-maps-js-api";
const PGFLEX_GOOGLE_MAPS_BROWSER_API_KEY =
  "AIzaSyDX5QOmZrG7GekSIMoqFT3oymQP20w2az0";
const ROUTE_REQUEST_TIMEOUT_MS = 15000;

type MapsLoadStatus = "idle" | "loading" | "ready" | "error";
type RouteStatus = "idle" | "loading" | "ready" | "error";
type RouteEstimate = {
  distance: string;
  duration: string;
  usesTraffic: boolean;
};
type LockedRoute = {
  key: string;
};
type GoogleMapsWindow = Window &
  typeof globalThis & {
    google?: { maps: any };
    __pgflexGoogleMapsPromise?: Promise<void>;
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

  if (mapsWindow.google?.maps) {
    return Promise.resolve();
  }

  if (mapsWindow.__pgflexGoogleMapsPromise) {
    return mapsWindow.__pgflexGoogleMapsPromise;
  }

  mapsWindow.__pgflexGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
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
  });

  return mapsWindow.__pgflexGoogleMapsPromise;
}

function resetGoogleMapsLoaderIfPending() {
  const mapsWindow = getGoogleMapsWindow();

  if (mapsWindow.google?.maps) {
    return;
  }

  delete mapsWindow.__pgflexGoogleMapsPromise;
  document.getElementById(GOOGLE_MAPS_SCRIPT_ID)?.remove();
}

function geocodeAddress(geocoder: any, address: string) {
  return new Promise<any>((resolve, reject) => {
    geocoder.geocode(
      { address },
      (results: any[] | null, status: string) => {
        const location = results?.[0]?.geometry?.location;

        if (status === "OK" && location) {
          resolve(location);
          return;
        }

        reject(new Error(status));
      },
    );
  });
}

function requestRoute({
  directionsService,
  maps,
  origin,
  destination,
}: {
  directionsService: any;
  maps: any;
  origin: any;
  destination: any;
}) {
  return new Promise<any>((resolve, reject) => {
    directionsService.route(
      {
        origin,
        destination,
        travelMode: maps.TravelMode.DRIVING,
        unitSystem: maps.UnitSystem.METRIC,
        provideRouteAlternatives: false,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: maps.TrafficModel.BEST_GUESS,
        },
      },
      (result: any, status: string) => {
        if (status === "OK" && result) {
          resolve(result);
          return;
        }

        reject(new Error(status));
      },
    );
  });
}

function clearRenderedRoute(directionsRenderer: any, map: any) {
  if (!directionsRenderer) {
    return;
  }

  directionsRenderer.setMap(null);

  if (map) {
    directionsRenderer.setMap(map);
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

function routeFailureMessage(
  error: unknown,
  translate: (text: string) => string,
) {
  const message = error instanceof Error ? error.message : String(error);

  if (/REQUEST_DENIED/i.test(message)) {
    return translate(
      "Google rejected this route request. Verify API key restrictions, billing, and that Maps JavaScript, Geocoding, and Directions APIs are enabled.",
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
      "Google Maps did not answer in time. Use Change route and try again, or verify the Google APIs and billing configuration.",
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
  disabled = false,
  onOriginChange,
  onDestinationChange,
}: {
  origin: string;
  destination: string;
  disabled?: boolean;
  onOriginChange: (origin: string) => void;
  onDestinationChange: (destination: string) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const apiKey = resolveGoogleMapsApiKey();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const directionsServiceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const routeRequestIdRef = useRef(0);
  const activeRouteAbortControllerRef = useRef<AbortController | null>(null);
  const lastPreviewedRouteKeyRef = useRef<string | null>(null);
  const [mapsStatus, setMapsStatus] = useState<MapsLoadStatus>("idle");
  const [routeStatus, setRouteStatus] = useState<RouteStatus>("idle");
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);
  const [lockedRoute, setLockedRoute] = useState<LockedRoute | null>(null);
  const [routeErrorMessage, setRouteErrorMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const currentRouteKey = routeKeyFor(origin, destination);

    if (!currentRouteKey) {
      routeRequestIdRef.current += 1;
      activeRouteAbortControllerRef.current?.abort();
      activeRouteAbortControllerRef.current = null;
      clearRenderedRoute(directionsRendererRef.current, mapRef.current);
      setLockedRoute(null);
      lastPreviewedRouteKeyRef.current = null;
      setRouteEstimate(null);
      setRouteErrorMessage(null);
      setRouteStatus("idle");
      return;
    }

    if (lockedRoute && lockedRoute.key !== currentRouteKey) {
      routeRequestIdRef.current += 1;
      activeRouteAbortControllerRef.current?.abort();
      activeRouteAbortControllerRef.current = null;
      clearRenderedRoute(directionsRendererRef.current, mapRef.current);
      setLockedRoute(null);
      lastPreviewedRouteKeyRef.current = null;
      setRouteEstimate(null);
      setRouteErrorMessage(null);
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

  async function ensureMapReady(signal: AbortSignal) {
    if (
      mapRef.current &&
      geocoderRef.current &&
      directionsServiceRef.current &&
      directionsRendererRef.current
    ) {
      setMapsStatus("ready");
      return;
    }

    setMapsStatus("loading");
    await withTimeout(
      loadGoogleMaps(apiKey),
      ROUTE_REQUEST_TIMEOUT_MS,
      signal,
      "Google Maps load timed out",
    );
    const maps = getGoogleMapsWindow().google?.maps;

    if (!maps || !mapContainerRef.current) {
      throw new Error("Google Maps namespace is unavailable");
    }

    if (!mapRef.current) {
      mapRef.current = new maps.Map(mapContainerRef.current, {
        center: { lat: -34.6037, lng: -58.3816 },
        zoom: 11,
        clickableIcons: false,
        disableDefaultUI: true,
        gestureHandling: "cooperative",
        styles: [
          {
            featureType: "poi",
            stylers: [{ visibility: "off" }],
          },
          {
            featureType: "transit",
            stylers: [{ visibility: "off" }],
          },
        ],
      });
    }

    if (!directionsRendererRef.current) {
      directionsRendererRef.current = new maps.DirectionsRenderer({
        map: mapRef.current,
        preserveViewport: false,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: "#7c3aed",
          strokeOpacity: 0.82,
          strokeWeight: 5,
        },
      });
    }

    geocoderRef.current ??= new maps.Geocoder();
    directionsServiceRef.current ??= new maps.DirectionsService();
    setMapsStatus("ready");
  }

  function handleChangeRoute() {
    activeRouteAbortControllerRef.current?.abort();
    activeRouteAbortControllerRef.current = null;
    routeRequestIdRef.current += 1;
    resetGoogleMapsLoaderIfPending();
    clearRenderedRoute(directionsRendererRef.current, mapRef.current);
    lastPreviewedRouteKeyRef.current = null;
    setLockedRoute(null);
    setRouteEstimate(null);
    setRouteErrorMessage(null);
    setMapsStatus(mapRef.current ? "ready" : "idle");
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
    routeRequestIdRef.current = routeRequestId;
    setLockedRoute({
      key: currentRouteKey,
    });
    setRouteEstimate(null);
    setRouteErrorMessage(null);
    setRouteStatus("loading");

    try {
      await ensureMapReady(abortController.signal);

      if (routeRequestIdRef.current !== routeRequestId) {
        return;
      }

      const maps = getGoogleMapsWindow().google?.maps;
      const geocoder = geocoderRef.current;
      const directionsService = directionsServiceRef.current;
      const directionsRenderer = directionsRendererRef.current;

      if (!maps || !geocoder || !directionsService || !directionsRenderer) {
        throw new Error("Google Maps route services are unavailable");
      }

      const [originLocation, destinationLocation] = await withTimeout(
        Promise.all([
          geocodeAddress(geocoder, originAddress),
          geocodeAddress(geocoder, destinationAddress),
        ]),
        ROUTE_REQUEST_TIMEOUT_MS,
        abortController.signal,
        "Google Maps geocoding timed out",
      );
      const result = await withTimeout(
        requestRoute({
          directionsService,
          maps,
          origin: originLocation,
          destination: destinationLocation,
        }),
        ROUTE_REQUEST_TIMEOUT_MS,
        abortController.signal,
        "Google Maps directions timed out",
      );

      if (routeRequestIdRef.current !== routeRequestId) {
        return;
      }

      directionsRenderer.setDirections(result);
      const leg = result.routes?.[0]?.legs?.[0];
      const duration = leg?.duration_in_traffic?.text ?? leg?.duration?.text;
      const distance = leg?.distance?.text;

      if (!duration || !distance) {
        throw new Error("Route leg is incomplete");
      }

      lastPreviewedRouteKeyRef.current = currentRouteKey;
      setRouteEstimate({
        distance,
        duration,
        usesTraffic: Boolean(leg?.duration_in_traffic),
      });
      setRouteStatus("ready");
    } catch (error) {
      if (
        isAbortError(error) ||
        routeRequestIdRef.current !== routeRequestId
      ) {
        return;
      }

      resetGoogleMapsLoaderIfPending();
      clearRenderedRoute(directionsRendererRef.current, mapRef.current);
      setRouteEstimate(null);
      setRouteErrorMessage(routeFailureMessage(error, t));
      setMapsStatus(mapRef.current ? "ready" : "error");
      setRouteStatus("error");
    } finally {
      if (routeRequestIdRef.current === routeRequestId) {
        activeRouteAbortControllerRef.current = null;
      }
    }
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
      <div className="grid gap-4 md:grid-cols-2">
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
                Change route
              </Button>
            ) : hasBothAddresses ? (
              <Button
                type="button"
                variant="secondary"
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
                Preview route
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
            ref={mapContainerRef}
            className={cn(
              "h-full w-full transition-opacity duration-300",
              showMapOverlay ? "opacity-25" : "opacity-100",
            )}
          />

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
                  <div role="alert" className="flex flex-col items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <p className="text-sm font-medium text-foreground">
                      {t("Unable to load Google Maps.")}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {routeErrorMessage ??
                        t(
                          "Google Maps failed to load. Verify the browser API key, allowed domains, billing, and that Maps JavaScript API is enabled.",
                        )}
                    </p>
                  </div>
                ) : routeStatus === "error" ? (
                  <div role="alert" className="flex flex-col items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <p className="text-sm font-medium text-foreground">
                      {t("Unable to calculate a route for these addresses.")}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {routeErrorMessage}
                    </p>
                  </div>
                ) : (
                  <>
                    <Navigation className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {hasBothAddresses
                        ? "Preview route"
                        : t("Add origin and destination addresses to preview the route.")}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
