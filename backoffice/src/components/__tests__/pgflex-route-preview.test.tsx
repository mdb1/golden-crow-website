/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const renderer = {
      setDirections: jest.fn(),
      setMap: jest.fn(),
    };

    (window as any).google = {
      maps: {
        DirectionsRenderer: jest.fn(() => renderer),
        DirectionsService: jest.fn(() => ({
          route: jest.fn(),
        })),
        Geocoder: jest.fn(() => ({
          geocode: jest.fn(
            (
              _request: unknown,
              callback: (results: unknown[] | null, status: string) => void,
            ) => callback(null, status),
          ),
        })),
        Map: jest.fn(() => ({})),
        TrafficModel: { BEST_GUESS: "BEST_GUESS" },
        TravelMode: { DRIVING: "DRIVING" },
        UnitSystem: { METRIC: "METRIC" },
      },
    };
  }

  function installBrokenMapRenderMock() {
    const renderer = {
      setDirections: jest.fn(),
      setMap: jest.fn(),
    };

    (window as any).google = {
      maps: {
        DirectionsRenderer: jest.fn(() => renderer),
        DirectionsService: jest.fn(() => ({
          route: jest.fn(),
        })),
        Geocoder: jest.fn(() => ({
          geocode: jest.fn(),
        })),
        Map: jest.fn((container: HTMLElement) => {
          const errorContainer = document.createElement("div");
          errorContainer.className = "gm-err-container";
          errorContainer.textContent =
            "This page can't load Google Maps correctly.";
          container.appendChild(errorContainer);
          return {};
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
    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

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

  it("shows an explicit route calculation alert when Google rejects the route", async () => {
    installRejectingGoogleMapsMock("REQUEST_DENIED");
    renderControlledPreview();
    enterRouteAddresses();

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Google rejected the route services request. This is usually API configuration, not the addresses. Check API key restrictions, billing, and that Geocoding and Directions APIs are enabled.",
    );
    expect(
      screen.getByRole("button", { name: "Change route" }),
    ).toBeInTheDocument();
  });

  it("reports a map render configuration error instead of waiting for timeout", async () => {
    installBrokenMapRenderMock();
    renderControlledPreview();
    enterRouteAddresses();

    fireEvent.click(screen.getByRole("button", { name: "Preview route" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Google Maps loaded but refused to render the map.",
    );
    expect(alert).toHaveTextContent("not an address problem");
    expect(
      screen.getByRole("button", { name: "Change route" }),
    ).toBeInTheDocument();
  });
});
