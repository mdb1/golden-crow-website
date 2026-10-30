/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import {
  PublisherAppPromoBanner,
  publisherAppIntensePalette,
} from "@/components/publisher-app-promo-banner";

describe("PublisherAppPromoBanner color system", () => {
  it("turns a muted green brand color into the vivid emerald scene used by the app offer", () => {
    const palette = publisherAppIntensePalette("#657960");

    expect(palette.source).toBe("#657960");
    expect(palette.hue).toBe(108);
    expect(palette.sceneHue).toBe(136);
    expect(palette.isEmeraldScene).toBe(true);
    expect(palette.base).toBe("#109A38");
    expect(palette.deep).toBe("#056B30");
    expect(palette.vivid).toBe("#35C745");
    expect(palette.pop).toBe("#B2F66A");
    expect(palette.glow).toBe("#7AE85E");
    expect(palette.shine).toBe("#E8F7E3");
    expect(palette.pale).toBe("#F6FAF1");
    expect(palette.mint).toBe("#A8E3B4");

    for (const color of [
      palette.base,
      palette.deep,
      palette.vivid,
      palette.pop,
      palette.glow,
      palette.shine,
      palette.pale,
      palette.mint,
    ]) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(palette.shadow).toMatch(/^hsl\(/);
  });

  it("applies the brand palette while retaining the source tint metadata", () => {
    const palette = publisherAppIntensePalette("#657960");

    render(
      <PublisherAppPromoBanner
        organizationName="DNA Institute"
        organizationTint="#657960"
        ctaLabel="Editar mi app"
      />,
    );

    const banner = screen.getByTestId("publisher-app-banner");
    expect(banner.dataset.accent).toBe("#657960");
    expect(banner.dataset.paletteHue).toBe("108");
    expect(banner.dataset.sceneHue).toBe("136");
    expect(banner.style.getPropertyValue("--publisher-app-accent")).toBe(
      palette.base,
    );
    expect(banner.style.getPropertyValue("--publisher-app-accent-deep")).toBe(
      palette.deep,
    );
    expect(banner.style.getPropertyValue("--publisher-app-mint")).toBe(
      palette.mint,
    );
    expect(banner).toHaveClass("aspect-[256/125]", "rounded-[1.05cqw]");
    expect(screen.getByTestId("publisher-app-banner-headline")).toHaveStyle({
      fontFamily: "var(--font-fredoka)",
    });
    expect(screen.getByTestId("publisher-app-phone-scene")).toHaveClass(
      "left-[46.2cqw]",
      "top-[3.65cqw]",
      "w-[52cqw]",
    );
    expect(screen.getByTestId("publisher-app-main-phone")).toHaveClass(
      "bottom-[1.3cqw]",
      "left-[42%]",
      "h-[40.4cqw]",
      "w-[20.2cqw]",
      "rounded-[4.1cqw]",
    );
    expect(screen.getByTestId("publisher-app-current-price")).toHaveClass(
      "w-[26.9cqw]",
      "rounded-[2.85cqw]",
    );
    expect(screen.getByTestId("publisher-app-banner-cta")).toHaveClass(
      "bottom-[4.6cqw]",
    );
    expect(screen.getByText("Editar mi app")).toBeTruthy();
  });
});
