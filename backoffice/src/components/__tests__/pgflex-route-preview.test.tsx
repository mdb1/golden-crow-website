/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PGFlexRoutePreview } from "@/components/pgflex-route-preview";

describe("PGFlexRoutePreview", () => {
  const originalGoogleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const originalPGFlexGoogleMapsApiKey =
    process.env.NEXT_PUBLIC_PGFLEX_GOOGLE_MAPS_API_KEY;
  const scriptId = "pgflex-google-maps-js-api";

  function resetGoogleMapsLoader() {
    delete (window as Window & { __pgflexGoogleMapsPromise?: Promise<void> })
      .__pgflexGoogleMapsPromise;
    document.getElementById(scriptId)?.remove();
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

  it("uses the PGFlex Google Maps fallback key when the env key is missing", async () => {
    const onOriginChange = jest.fn();
    const onDestinationChange = jest.fn();

    render(
      <AppLanguageProvider forcedLanguage="en">
        <PGFlexRoutePreview
          origin=""
          destination=""
          onOriginChange={onOriginChange}
          onDestinationChange={onDestinationChange}
        />
      </AppLanguageProvider>,
    );

    await waitFor(() => {
      expect(document.getElementById(scriptId)).toBeInTheDocument();
    });
    expect(
      screen.queryByText("Google Maps preview is not configured."),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Origin"), {
      target: { value: "Av. Corrientes 123, Buenos Aires" },
    });
    fireEvent.change(screen.getByLabelText("Destination"), {
      target: { value: "Hospital Italiano, Buenos Aires" },
    });

    expect(onOriginChange).toHaveBeenCalledWith(
      "Av. Corrientes 123, Buenos Aires",
    );
    expect(onDestinationChange).toHaveBeenCalledWith(
      "Hospital Italiano, Buenos Aires",
    );
  });
});
