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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appText } from "@/lib/language";
import { cn } from "@/lib/utils";

const GOOGLE_MAPS_SCRIPT_ID = "pgflex-google-maps-js-api";
const ROUTE_DEBOUNCE_MS = 700;

type MapsLoadStatus = "idle" | "loading" | "ready" | "error";
type RouteStatus = "idle" | "loading" | "ready" | "error";
type RouteEstimate = {
  distance: string;
  duration: string;
  usesTraffic: boolean;
};
type GoogleMapsWindow = Window &
  typeof globalThis & {
    google?: { maps: any };
    __pgflexGoogleMapsPromise?: Promise<void>;
  };

function getGoogleMapsWindow() {
  return window as GoogleMapsWindow;
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
        () => reject(new Error("Google Maps failed to load")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google Maps failed to load")),
      { once: true },
    );
    document.head.appendChild(script);
  });

  return mapsWindow.__pgflexGoogleMapsPromise;
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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const originInputRef = useRef<HTMLInputElement | null>(null);
  const destinationInputRef = useRef<HTMLInputElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const directionsServiceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const originAutocompleteRef = useRef<any>(null);
  const destinationAutocompleteRef = useRef<any>(null);
  const routeRequestIdRef = useRef(0);
  const [mapsStatus, setMapsStatus] = useState<MapsLoadStatus>("idle");
  const [routeStatus, setRouteStatus] = useState<RouteStatus>("idle");
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);

  useEffect(() => {
    if (!apiKey) {
      setMapsStatus("idle");
      return;
    }

    let cancelled = false;
    setMapsStatus("loading");

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapContainerRef.current) {
          return;
        }

        const maps = getGoogleMapsWindow().google?.maps;

        if (!maps) {
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
      })
      .catch(() => {
        if (!cancelled) {
          setMapsStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (mapsStatus !== "ready") {
      return;
    }

    const maps = getGoogleMapsWindow().google?.maps;

    if (!maps?.places) {
      return;
    }

    if (originInputRef.current && !originAutocompleteRef.current) {
      originAutocompleteRef.current = new maps.places.Autocomplete(
        originInputRef.current,
        {
          fields: ["formatted_address", "geometry", "name"],
        },
      );
      originAutocompleteRef.current.addListener("place_changed", () => {
        const place = originAutocompleteRef.current?.getPlace?.();
        const nextAddress =
          place?.formatted_address ?? place?.name ?? originInputRef.current?.value;

        if (nextAddress) {
          onOriginChange(nextAddress);
        }
      });
    }

    if (destinationInputRef.current && !destinationAutocompleteRef.current) {
      destinationAutocompleteRef.current = new maps.places.Autocomplete(
        destinationInputRef.current,
        {
          fields: ["formatted_address", "geometry", "name"],
        },
      );
      destinationAutocompleteRef.current.addListener("place_changed", () => {
        const place = destinationAutocompleteRef.current?.getPlace?.();
        const nextAddress =
          place?.formatted_address ??
          place?.name ??
          destinationInputRef.current?.value;

        if (nextAddress) {
          onDestinationChange(nextAddress);
        }
      });
    }
  }, [mapsStatus, onDestinationChange, onOriginChange]);

  useEffect(() => {
    const originAddress = origin.trim();
    const destinationAddress = destination.trim();

    if (!originAddress || !destinationAddress) {
      clearRenderedRoute(directionsRendererRef.current, mapRef.current);
      setRouteEstimate(null);
      setRouteStatus("idle");
      return;
    }

    if (mapsStatus !== "ready") {
      return;
    }

    const maps = getGoogleMapsWindow().google?.maps;
    const geocoder = geocoderRef.current;
    const directionsService = directionsServiceRef.current;
    const directionsRenderer = directionsRendererRef.current;

    if (!maps || !geocoder || !directionsService || !directionsRenderer) {
      setRouteStatus("error");
      return;
    }

    const routeRequestId = routeRequestIdRef.current + 1;
    routeRequestIdRef.current = routeRequestId;
    setRouteStatus("loading");

    const timeoutId = window.setTimeout(() => {
      Promise.all([
        geocodeAddress(geocoder, originAddress),
        geocodeAddress(geocoder, destinationAddress),
      ])
        .then(([originLocation, destinationLocation]) =>
          requestRoute({
            directionsService,
            maps,
            origin: originLocation,
            destination: destinationLocation,
          }),
        )
        .then((result) => {
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

          setRouteEstimate({
            distance,
            duration,
            usesTraffic: Boolean(leg?.duration_in_traffic),
          });
          setRouteStatus("ready");
        })
        .catch(() => {
          if (routeRequestIdRef.current !== routeRequestId) {
            return;
          }

          clearRenderedRoute(directionsRenderer, mapRef.current);
          setRouteEstimate(null);
          setRouteStatus("error");
        });
    }, ROUTE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [destination, mapsStatus, origin]);

  const hasBothAddresses = Boolean(origin.trim() && destination.trim());
  const showMapOverlay =
    !apiKey ||
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
            ref={originInputRef}
            id="pgflex-origin"
            value={origin}
            onChange={(event) => onOriginChange(event.target.value)}
            disabled={disabled}
            autoComplete="street-address"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pgflex-destination">{t("Destination")}</Label>
          <Input
            ref={destinationInputRef}
            id="pgflex-destination"
            value={destination}
            onChange={(event) => onDestinationChange(event.target.value)}
            disabled={disabled}
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
                {!apiKey ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                    <p className="text-sm font-medium text-foreground">
                      {t("Google Maps preview is not configured.")}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t("Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable route previews.")}
                    </p>
                  </>
                ) : mapsStatus === "loading" || routeStatus === "loading" ? (
                  <>
                    <LoaderCircle className="h-5 w-5 animate-spin text-violet-600 dark:text-violet-200" />
                    <p className="text-sm font-medium text-foreground">
                      {t("Finding route...")}
                    </p>
                  </>
                ) : mapsStatus === "error" ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <p className="text-sm font-medium text-foreground">
                      {t("Unable to load Google Maps.")}
                    </p>
                  </>
                ) : routeStatus === "error" ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <p className="text-sm font-medium text-foreground">
                      {t("Unable to calculate a route for these addresses.")}
                    </p>
                  </>
                ) : (
                  <>
                    <Navigation className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {hasBothAddresses
                        ? t("Finding route...")
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
