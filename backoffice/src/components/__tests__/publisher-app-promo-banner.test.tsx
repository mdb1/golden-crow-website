/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import {
  PublisherAppPromoBanner,
  publisherAppIntensePalette,
} from "@/components/publisher-app-promo-banner";

describe("PublisherAppPromoBanner atomic renderer", () => {
  afterEach(() => {
    delete window.ATOMIC_ASSETS;
    delete window.mountAtomicBanner;
  });

  it("turns a muted green publisher tint into the kit's vivid emerald material", () => {
    const palette = publisherAppIntensePalette("#657960");

    expect(palette).toEqual({
      source: "#657960",
      hue: 108,
      sceneHue: 136,
      isEmeraldScene: true,
      accent: "#00E83C",
    });
    expect(publisherAppIntensePalette("#123ABC").accent).toMatch(
      /^#[0-9A-F]{6}$/,
    );
  });

  it("mounts the PocketGenes kit with live branding and the recolored accent", async () => {
    const destroy = jest.fn();
    const mountAtomicBanner = jest.fn(() => ({
      destroy,
      update: jest.fn(),
    }));
    window.ATOMIC_ASSETS = {};
    window.mountAtomicBanner = mountAtomicBanner;

    const { unmount } = render(
      <PublisherAppPromoBanner
        organizationName="DNA Institute"
        organizationTint="#657960"
        ctaLabel="Editar mi app"
      />,
    );

    const banner = screen.getByTestId("publisher-app-banner");
    expect(banner.dataset.accent).toBe("#657960");
    expect(banner.dataset.atomicAccent).toBe("#00E83C");
    expect(banner.dataset.paletteHue).toBe("108");
    expect(banner.dataset.renderer).toBe("pocketgenes-atomic-banner-kit");
    expect(banner).toHaveClass("atomic-host");

    await waitFor(() =>
      expect(mountAtomicBanner).toHaveBeenCalledWith(banner, {
        accent: "#00E83C",
        companyName: "DNA Institute",
        actionLabel: "Editar mi app",
      }),
    );
    expect(banner.dataset.runtimeState).toBe("ready");
    expect(screen.getByText(/La app de DNA Institute/)).toBeTruthy();
    expect(screen.getByText("59.99")).toBeTruthy();
    expect(screen.getByText("Editar mi app")).toBeTruthy();

    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
