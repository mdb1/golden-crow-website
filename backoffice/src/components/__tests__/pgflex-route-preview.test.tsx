/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  PGFlexRoutePreview,
  composePGFlexRouteOrigin,
  splitPGFlexRouteOrigin,
  type PGFlexRouteOriginParts,
} from "@/components/pgflex-route-preview";
import { BACKOFFICE_VERSION } from "@/lib/app-version";

describe("PGFlexRoutePreview", () => {
  const originalGoogleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const originalPGFlexGoogleMapsApiKey =
    process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
  const originalFetch = global.fetch;
  const routesEndpoint =
    "https://routes.googleapis.com/directions/v2:computeRoutes";
  const fieldMask =
    "routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline";

  it("splits saved origin fields on comma-space separators", () => {
    expect(
      splitPGFlexRouteOrigin(
        "Hidalgo 800, Villa Crespo, Provincia de Buenos Aires, Argentina",
      ),
    ).toEqual({
      address: "Hidalgo 800",
      locality: "Villa Crespo",
      provinceDistrict: "Provincia de Buenos Aires",
      country: "Argentina",
    });
  });

  it("splits Ciudad Autonoma de Buenos Aires into the Capital Federal picker shortcut", () => {
    expect(
      splitPGFlexRouteOrigin(
        "Hidalgo 800, Villa Crespo, Ciudad Autónoma de Buenos Aires, Argentina",
      ),
    ).toEqual({
      address: "Hidalgo 800",
      locality: "Villa Crespo",
      provinceDistrict: "Capital Federal",
      country: "Argentina",
    });
  });

  function resetGoogleMapsGlobals() {
    delete (window as Window & { google?: unknown }).google;
  }

  function renderControlledPreview() {
    const onOriginChange = jest.fn();
    const onDestinationChange = jest.fn();

    function ControlledPreview() {
      const [origin, setOrigin] = useState("");
      const [destination, setDestination] = useState("");

      return (
        <PGFlexRoutePreview
          origin={origin}
          destination={destination}
          onOriginChange={(nextOrigin) => {
            onOriginChange(nextOrigin);
            setOrigin(nextOrigin);
          }}
          onDestinationChange={(nextDestination) => {
            onDestinationChange(nextDestination);
            setDestination(nextDestination);
          }}
        />
      );
    }

    render(
      <AppLanguageProvider forcedLanguage="en">
        <ControlledPreview />
      </AppLanguageProvider>,
    );

    return { onDestinationChange, onOriginChange };
  }

  function renderControlledSplitOriginPreview() {
    function ControlledSplitOriginPreview() {
      const [originParts, setOriginParts] = useState<PGFlexRouteOriginParts>({
        address: "",
        locality: "",
        provinceDistrict: "Capital Federal",
        country: "Argentina",
      });
      const [destination, setDestination] = useState("");

      return (
        <PGFlexRoutePreview
          origin={composePGFlexRouteOrigin(originParts)}
          destination={destination}
          originParts={originParts}
          onOriginChange={jest.fn()}
          onOriginPartsChange={setOriginParts}
          onDestinationChange={setDestination}
        />
      );
    }

    render(
      <AppLanguageProvider forcedLanguage="en">
        <ControlledSplitOriginPreview />
      </AppLanguageProvider>,
    );
  }

  function enterRouteAddresses() {
    fireEvent.change(screen.getByLabelText("Origin"), {
      target: { value: "Av. Corrientes 123, Buenos Aires, CABA" },
    });
    fireEvent.change(screen.getByLabelText("Destination"), {
      target: { value: "Hospital Italiano, Buenos Aires" },
    });
  }

  function jsonResponse(body: unknown, status = 200, statusText = "OK") {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: {
        get: jest.fn((name: string) => {
          const normalized = name.toLowerCase();

          if (normalized === "content-type") {
            return "application/json; charset=UTF-8";
          }

          if (normalized === "access-control-allow-origin") {
            return "https://golden-crow-backoffice.vercel.app";
          }

          if (normalized === "vary") {
            return "Origin,Accept-Encoding";
          }

          return null;
        }),
      },
      text: jest.fn(async () => JSON.stringify(body)),
    } as unknown as Response;
  }

  function installRejectingRoutesRestMock(reason = "API_KEY_SERVICE_BLOCKED") {
    const result = {
      error: {
        code: 403,
        message:
          "Requests to this API routes.googleapis.com method google.maps.routing.v2.Routes.ComputeRoutes are blocked.",
        status: "PERMISSION_DENIED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason,
            domain: "googleapis.com",
            metadata: {
              service: "routes.googleapis.com",
              method: "google.maps.routing.v2.Routes.ComputeRoutes",
            },
          },
        ],
      },
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(result, 403, "Forbidden"));
    global.fetch = fetchMock as typeof fetch;

    return fetchMock;
  }

  function installSuccessfulRoutesRestMock() {
    const result = {
      routes: [
        {
          distanceMeters: 6400,
          duration: "1260s",
          staticDuration: "1080s",
          polyline: {
            encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
          },
        },
      ],
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(result));
    global.fetch = fetchMock as typeof fetch;

    return fetchMock;
  }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    delete process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
    global.fetch = jest.fn() as typeof fetch;
    resetGoogleMapsGlobals();
  });

  afterEach(() => {
    resetGoogleMapsGlobals();
  });

  afterAll(() => {
    if (originalGoogleMapsApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
    }

    if (originalPGFlexGoogleMapsApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY =
        originalPGFlexGoogleMapsApiKey;
    }

    global.fetch = originalFetch;
  });

  it("calls Routes REST only after Preview route is clicked", async () => {
    const fetchMock = installSuccessfulRoutesRestMock();
    const { onDestinationChange, onOriginChange } = renderControlledPreview();

    expect(
      document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview route" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Google Maps preview is not configured."),
    ).not.toBeInTheDocument();

    enterRouteAddresses();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]'),
    ).not.toBeInTheDocument();

    expect(onOriginChange).toHaveBeenCalledWith(
      "Av. Corrientes 123, Buenos Aires, CABA",
    );
    expect(onDestinationChange).toHaveBeenCalledWith(
      "Hospital Italiano, Buenos Aires",
    );

    expect(
      within(screen.getByTestId("pgflex-route-header-actions")).queryByRole(
        "button",
        { name: "Preview route" },
      ),
    ).not.toBeInTheDocument();
    const previewButton = screen.getByTestId("pgflex-route-center-preview");
    expect(screen.getByTestId("pgflex-route-overlay-card")).toHaveClass(
      "border-0",
      "bg-transparent",
      "p-0",
      "shadow-none",
    );
    expect(previewButton).toHaveTextContent("Preview route");
    expect(previewButton).toHaveAttribute("data-variant", "default");
    expect(previewButton).toHaveClass("h-12", "w-full", "rounded-2xl");
    fireEvent.click(previewButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        routesEndpoint,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Goog-Api-Key": "AIzaSyDX5QOmZrG7GekSIMoqFT3oymQP20w2az0",
            "X-Goog-FieldMask": fieldMask,
          }),
        }),
      );
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      origin: { address: "Av. Corrientes 123, Buenos Aires, CABA" },
      destination: { address: "Hospital Italiano, Buenos Aires" },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      polylineQuality: "HIGH_QUALITY",
      polylineEncoding: "ENCODED_POLYLINE",
      computeAlternativeRoutes: false,
    });
    expect(
      document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Origin")).toBeDisabled();
    expect(screen.getByLabelText("Destination")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Preview route" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change route" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change route" }));

    expect(screen.getByLabelText("Origin")).not.toBeDisabled();
    expect(screen.getByLabelText("Destination")).not.toBeDisabled();
    expect(
      within(screen.getByTestId("pgflex-route-header-actions")).queryByRole(
        "button",
        { name: "Preview route" },
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("pgflex-route-center-preview"),
    ).toBeInTheDocument();
  });

  it("asks for locality and province before calling Routes when the origin is too vague", () => {
    const fetchMock = installSuccessfulRoutesRestMock();
    renderControlledPreview();

    fireEvent.change(screen.getByLabelText("Origin"), {
      target: { value: "Av. Corrientes 123, Buenos Aires" },
    });
    fireEvent.change(screen.getByLabelText("Destination"), {
      target: { value: "Hospital Italiano, Buenos Aires" },
    });

    fireEvent.click(screen.getByTestId("pgflex-route-center-preview"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Preview route" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add at least locality and province to the origin before previewing the route.",
    );
  });

  it("joins split origin fields before requesting a route", async () => {
    const fetchMock = installSuccessfulRoutesRestMock();
    renderControlledSplitOriginPreview();

    expect(screen.getAllByText("Origin").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Country")).toHaveValue("Argentina");
    expect(screen.getByLabelText("Country")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "Hidalgo, 800" },
    });
    fireEvent.change(screen.getByLabelText("Neighborhood / Locality"), {
      target: { value: "Villa, Crespo" },
    });
    fireEvent.change(screen.getByLabelText("Destination"), {
      target: { value: "Humboldt 2433, CABA" },
    });

    expect(screen.getByLabelText("Address")).toHaveValue("Hidalgo 800");
    expect(screen.getByLabelText("Neighborhood / Locality")).toHaveValue(
      "Villa Crespo",
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(
      expect.objectContaining({
        origin: {
          address:
            "Hidalgo 800, Villa Crespo, Ciudad Autónoma de Buenos Aires, Argentina",
        },
        destination: { address: "Humboldt 2433, CABA" },
      }),
    );
  });

  it("uses the pinned PGFlex browser key when a generic Google Maps env key is stale", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "stale-generic-key";
    const fetchMock = installSuccessfulRoutesRestMock();

    renderControlledPreview();
    enterRouteAddresses();

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        routesEndpoint,
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Goog-Api-Key": "AIzaSyDX5QOmZrG7GekSIMoqFT3oymQP20w2az0",
          }),
        }),
      );
    });
    expect(String(fetchMock.mock.calls[0][1]?.headers)).not.toContain(
      "stale-generic-key",
    );
  });

  it("renders the Routes REST distance and decoded polyline duration", async () => {
    const fetchMock = installSuccessfulRoutesRestMock();
    renderControlledPreview();
    enterRouteAddresses();

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.getByText("6.4 km")).toBeInTheDocument();
    expect(screen.getByText("21 min")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pgflex-route-address-dock")).getByText(
        "Av. Corrientes 123, Buenos Aires, CABA",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pgflex-route-address-dock")).getByText(
        "Hospital Italiano, Buenos Aires",
      ),
    ).toBeInTheDocument();
    const staticMap = screen.getByAltText(
      "Route preview map",
    ) as HTMLImageElement;
    const staticMapSrc = decodeURIComponent(
      staticMap.getAttribute("src") ?? "",
    );
    expect(staticMapSrc).toContain("maps.googleapis.com/maps/api/staticmap");
    expect(staticMapSrc).toContain(
      "visible=37.312000,-128.016250|37.312000,-118.636750|44.440000,-128.016250|44.440000,-118.636750",
    );
    expect(staticMapSrc).not.toContain(
      "visible=38.500000,-120.200000|43.252000,-126.453000",
    );
    expect(staticMapSrc).toContain(
      "path=color:0x6d28d9ff|weight:5|enc:_p~iF~ps|U_ulLnnqC_mqNvxq`@",
    );
    expect(staticMapSrc).toContain("markers=size:mid|color:blue|label:A|");
    expect(staticMapSrc).toContain("markers=size:mid|color:green|label:B|");

    fireEvent.error(staticMap);

    await waitFor(() => {
      expect(
        screen.queryByAltText("Route preview map"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("pgflex-route-marker-a")).not.toHaveAttribute(
      "transform",
      "translate(56 214)",
    );
    expect(screen.getByTestId("pgflex-route-marker-b")).not.toHaveAttribute(
      "transform",
      "translate(584 214)",
    );
    expect(
      document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]'),
    ).not.toBeInTheDocument();
  });

  it("shows a copyable route log dialog when Google rejects the route", async () => {
    const alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => undefined);
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    installRejectingRoutesRestMock("API_KEY_SERVICE_BLOCKED");
    renderControlledPreview();
    enterRouteAddresses();

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "This API key is blocked from using Routes API. Add Routes API to the key API restrictions or remove API restrictions for testing.",
    );
    expect(
      screen.queryByRole("button", { name: "Preview route" }),
    ).not.toBeInTheDocument();
    const changeRouteButtons = screen.getAllByRole("button", {
      name: "Change route",
    });
    expect(changeRouteButtons).toHaveLength(1);
    expect(changeRouteButtons[0]).toHaveAttribute("data-variant", "default");
    const showLogButton = within(alert).getByRole("button", {
      name: "Show log",
    });
    expect(showLogButton).toHaveAttribute("data-variant", "outline");
    fireEvent.click(showLogButton);

    const dialog = await screen.findByRole("dialog", {
      name: "Google Maps route log",
    });
    const logField = within(dialog).getByLabelText(
      "Route error log details",
    ) as HTMLTextAreaElement;
    expect(logField).toHaveClass("overflow-y-auto");
    expect(logField).toHaveClass("[field-sizing:fixed]");
    expect(logField.value).toContain('"phase": "Routes REST computeRoutes"');
    expect(logField.value).toContain(
      `"backofficeVersion": "${BACKOFFICE_VERSION}"`,
    );
    expect(logField.value).toContain('"product": "Routes API"');
    expect(logField.value).toContain('"transport": "browser fetch"');
    expect(logField.value).toContain(`"method": "POST ${routesEndpoint}"`);
    expect(logField.value).toContain(`"call": "POST ${routesEndpoint}"`);
    expect(logField.value).toContain('"X-Goog-Api-Key": "[redacted]"');
    expect(logField.value).toContain(`"X-Goog-FieldMask": "${fieldMask}"`);
    expect(logField.value).toContain('"status": "API_KEY_SERVICE_BLOCKED"');
    expect(logField.value).toContain('"status": 403');
    expect(logField.value).toContain('"status": "PERMISSION_DENIED"');
    expect(logField.value).toContain('"reason": "API_KEY_SERVICE_BLOCKED"');
    expect(logField.value).toContain(
      '"method": "google.maps.routing.v2.Routes.ComputeRoutes"',
    );
    expect(logField.value).toContain('"matchesPinnedPGFlexKey": true');
    expect(logField.value).toContain(
      '"address": "Av. Corrientes 123, Buenos Aires, CABA"',
    );
    expect(logField.value).toContain(
      '"address": "Hospital Italiano, Buenos Aires"',
    );
    expect(logField.value).toContain(
      '"message": "Requests to this API routes.googleapis.com method google.maps.routing.v2.Routes.ComputeRoutes are blocked."',
    );
    expect(logField.value).toContain(routesEndpoint);
    expect(logField.value).not.toContain(["Directions", "Service"].join(""));
    expect(logField.value).not.toContain(["maps/api", "directions"].join("/"));
    expect(logField.value).not.toContain(
      ["google", "maps", "routes", "Route", "computeRoutes"].join("."),
    );
    expect(logField.value).not.toContain(
      ["maps.googleapis.com", "maps/api/js"].join("/"),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Copy log" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('"reason": "API_KEY_SERVICE_BLOCKED"'),
      );
    });
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Copied" }),
      ).toBeInTheDocument();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("uses Routes REST without instantiating the Google Maps JS renderer", async () => {
    const fetchMock = installSuccessfulRoutesRestMock();
    renderControlledPreview();
    enterRouteAddresses();

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    await waitFor(() => expect(screen.getByText("6.4 km")).toBeInTheDocument());
    expect(screen.getByText("21 min")).toBeInTheDocument();
    expect(screen.getByAltText("Route preview map")).toBeInTheDocument();
    expect((window as any).google).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Change route" }));
    expect(
      within(screen.getByTestId("pgflex-route-header-actions")).queryByRole(
        "button",
        { name: "Preview route" },
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("pgflex-route-center-preview")).toHaveAttribute(
      "data-variant",
      "default",
    );
  });
});
