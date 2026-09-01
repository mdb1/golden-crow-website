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
import { PGFlexRoutePreview } from "@/components/pgflex-route-preview";

describe("PGFlexRoutePreview", () => {
  const originalGoogleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const originalPGFlexGoogleMapsApiKey =
    process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
  const scriptId = "pgflex-google-maps-js-api";

  function resetGoogleMapsLoader() {
    delete (
      window as Window & {
        __pgflexGoogleMapsAuthError?: Error;
        __pgflexGoogleMapsPromise?: Promise<void>;
        gm_authFailure?: () => void;
      }
    ).__pgflexGoogleMapsAuthError;
    delete (
      window as Window & {
        __pgflexGoogleMapsAuthError?: Error;
        __pgflexGoogleMapsPromise?: Promise<void>;
        gm_authFailure?: () => void;
      }
    ).__pgflexGoogleMapsPromise;
    delete (
      window as Window & {
        __pgflexGoogleMapsAuthError?: Error;
        __pgflexGoogleMapsPromise?: Promise<void>;
        gm_authFailure?: () => void;
      }
    ).gm_authFailure;
    delete (window as Window & { google?: unknown }).google;
    document.getElementById(scriptId)?.remove();
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

  function enterRouteAddresses() {
    fireEvent.change(screen.getByLabelText("Origin"), {
      target: { value: "Av. Corrientes 123, Buenos Aires" },
    });
    fireEvent.change(screen.getByLabelText("Destination"), {
      target: { value: "Hospital Italiano, Buenos Aires" },
    });
  }

  function installRejectingGoogleMapsMock(status = "REQUEST_DENIED") {
    (window as any).google = {
      maps: {
        DirectionsService: jest.fn(() => ({
          route: jest.fn(
            (
              _request: unknown,
              callback: (result: unknown | null, status: string) => void,
            ) => callback(null, status),
          ),
        })),
        TrafficModel: { BEST_GUESS: "BEST_GUESS" },
        TravelMode: { DRIVING: "DRIVING" },
        UnitSystem: { METRIC: "METRIC" },
      },
    };
  }

  function installSuccessfulDirectionsMock() {
    const result = {
      routes: [
        {
          overview_path: [
            { lat: () => -34.6037, lng: () => -58.3816 },
            { lat: () => -34.597, lng: () => -58.395 },
            { lat: () => -34.592, lng: () => -58.402 },
          ],
          overview_polyline: { points: "encoded-route" },
          legs: [
            {
              distance: { text: "6.4 km" },
              duration: { text: "18 mins" },
              duration_in_traffic: { text: "21 mins" },
            },
          ],
        },
      ],
    };

    (window as any).google = {
      maps: {
        DirectionsService: jest.fn(() => ({
          route: jest.fn(
            (
              _request: unknown,
              callback: (result: unknown | null, status: string) => void,
            ) => callback(result, "OK"),
          ),
        })),
        Map: jest.fn(() => {
          throw new Error("Interactive map renderer should not be used");
        }),
        TrafficModel: { BEST_GUESS: "BEST_GUESS" },
        TravelMode: { DRIVING: "DRIVING" },
        UnitSystem: { METRIC: "METRIC" },
      },
    };
  }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    delete process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
    resetGoogleMapsLoader();
  });

  afterEach(() => {
    resetGoogleMapsLoader();
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
  });

  it("loads Google Maps only after Preview route is clicked", async () => {
    const { onDestinationChange, onOriginChange } = renderControlledPreview();

    expect(document.getElementById(scriptId)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview route" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Google Maps preview is not configured."),
    ).not.toBeInTheDocument();

    enterRouteAddresses();
    expect(document.getElementById(scriptId)).not.toBeInTheDocument();

    expect(onOriginChange).toHaveBeenCalledWith(
      "Av. Corrientes 123, Buenos Aires",
    );
    expect(onDestinationChange).toHaveBeenCalledWith(
      "Hospital Italiano, Buenos Aires",
    );

    expect(document.getElementById(scriptId)).not.toBeInTheDocument();
    const previewButton = screen.getByRole("button", {
      name: "Preview route",
    });
    expect(previewButton).toHaveAttribute("data-variant", "default");
    fireEvent.click(previewButton);

    await waitFor(() => {
      expect(document.getElementById(scriptId)).toBeInTheDocument();
    });
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
      screen.getByRole("button", { name: "Preview route" }),
    ).toBeInTheDocument();
  });

  it("uses the pinned PGFlex browser key when a generic Google Maps env key is stale", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "stale-generic-key";

    renderControlledPreview();
    enterRouteAddresses();

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    await waitFor(() => {
      const script = document.getElementById(
        scriptId,
      ) as HTMLScriptElement | null;

      expect(script).toBeInTheDocument();
      expect(script?.src).toContain(
        "AIzaSyDX5QOmZrG7GekSIMoqFT3oymQP20w2az0",
      );
      expect(script?.src).not.toContain("stale-generic-key");
    });
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
    installRejectingGoogleMapsMock("REQUEST_DENIED");
    renderControlledPreview();
    enterRouteAddresses();

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Google rejected the route services request. This is usually API configuration, not the addresses. Check API key restrictions, billing, and that Maps JavaScript API and Directions API are enabled.",
    );
    expect(
      screen.getByRole("button", { name: "Change route" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show log" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Google Maps route log",
    });
    const logField = within(dialog).getByLabelText(
      "Route error log details",
    ) as HTMLTextAreaElement;
    expect(logField.value).toContain('"phase": "DirectionsService.route"');
    expect(logField.value).toContain(
      '"call": "google.maps.DirectionsService.route"',
    );
    expect(logField.value).toContain('"status": "REQUEST_DENIED"');
    expect(logField.value).toContain('"matchesPinnedPGFlexKey": true');
    expect(logField.value).toContain(
      '"origin": "Av. Corrientes 123, Buenos Aires"',
    );
    expect(logField.value).toContain(
      '"destination": "Hospital Italiano, Buenos Aires"',
    );
    expect(logField.value).toContain('"result": null');
    expect(logField.value).toContain("maps.googleapis.com/maps/api/js");
    expect(logField.value).toContain('"apiKeyRedacted": true');

    fireEvent.click(within(dialog).getByRole("button", { name: "Copy log" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('"status": "REQUEST_DENIED"'),
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

  it("uses Directions without instantiating the broken interactive map renderer", async () => {
    installSuccessfulDirectionsMock();
    renderControlledPreview();
    enterRouteAddresses();

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    await waitFor(() => expect(screen.getByText("6.4 km")).toBeInTheDocument());
    expect(screen.getByText("21 mins")).toBeInTheDocument();
    expect(screen.getByAltText("Route preview map")).toBeInTheDocument();
    expect((window as any).google.maps.Map).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Change route" }));
    expect(
      screen.getByRole("button", { name: "Preview route" }),
    ).toHaveAttribute("data-variant", "secondary");
  });
});
