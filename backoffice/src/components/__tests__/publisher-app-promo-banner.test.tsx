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
      isWarmScene: false,
      accent: "#00E83C",
      accentDeep: "#038726",
      accentLight: "#7AFF9E",
      backgroundDepthOpacity: 1,
      cornerShadeOpacity: 0.65,
      backgroundBloomOpacity: 0.65,
      backgroundDeep: "#046C20",
      backgroundMid: "#06B234",
      materialLight: "#7AFF9E",
      surface: "#F2F7F4",
      surfaceTop: "#F8FCF9",
      surfaceBottom: "#DCF4E2",
      halo: "#66FF8F",
      highlight: "#FFFFFF",
      ink: "#052E10",
      shadow: "#04240D",
    });
    expect(publisherAppIntensePalette("#123ABC").accent).toMatch(
      /^#[0-9A-F]{6}$/,
    );
  });

  it("keeps a dark orange identity hue while producing a brilliant warm scene", () => {
    const palette = publisherAppIntensePalette("#9A3D16");

    expect(palette).toEqual({
      source: "#9A3D16",
      hue: 18,
      sceneHue: 18,
      isEmeraldScene: false,
      isWarmScene: true,
      accent: "#FF7E47",
      accentDeep: "#872A03",
      accentLight: "#FFA27A",
      backgroundDepthOpacity: 0.18,
      cornerShadeOpacity: 0.36,
      backgroundBloomOpacity: 0.42,
      backgroundDeep: "#CC3C00",
      backgroundMid: "#FF4B00",
      materialLight: "#FFA27A",
      surface: "#F7F4F2",
      surfaceTop: "#FCF9F8",
      surfaceBottom: "#F4E3DC",
      halo: "#FF9366",
      highlight: "#FFFFFF",
      ink: "#2E1105",
      shadow: "#240E04",
    });
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
        organizationImageUrl="https://example.org/dna-institute.png"
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
        accentDeep: "#038726",
        accentLight: "#7AFF9E",
        companyName: "DNA Institute",
        actionLabel: "Editar mi app",
        brandLogoUrl: "https://example.org/dna-institute.png",
        backgroundDepthOpacity: 1,
        cornerShadeOpacity: 0.65,
        backgroundBloomOpacity: 0.65,
        backgroundDeep: "#046C20",
        backgroundMid: "#06B234",
        materialLight: "#7AFF9E",
        surface: "#F2F7F4",
        surfaceTop: "#F8FCF9",
        surfaceBottom: "#DCF4E2",
        halo: "#66FF8F",
        highlight: "#FFFFFF",
        ink: "#052E10",
        shadow: "#04240D",
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
