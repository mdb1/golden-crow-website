/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import {
  PublisherAppPromoBanner,
  publisherAppIntensePalette,
} from "@/components/publisher-app-promo-banner";

describe("PublisherAppPromoBanner color system", () => {
  it("turns a muted brand color into a controlled palette without changing hue", () => {
    const palette = publisherAppIntensePalette("#657960");

    expect(palette.source).toBe("#657960");
    expect(palette.hue).toBe(108);
    expect(palette.base).toBe("hsl(108 68% 32%)");
    expect(palette.deep).toBe("hsl(108 56% 10%)");
    expect(palette.vivid).toBe("hsl(108 70% 48%)");
    expect(palette.pop).toBe("hsl(108 72% 55%)");
    expect(palette.pale).toBe("hsl(108 24% 96%)");

    for (const color of [
      palette.base,
      palette.deep,
      palette.vivid,
      palette.pop,
      palette.glow,
      palette.shine,
      palette.pale,
      palette.shadow,
    ]) {
      expect(color).toMatch(/^hsl\(108 /);
    }
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
    expect(banner.style.getPropertyValue("--publisher-app-accent")).toBe(
      palette.base,
    );
    expect(banner.style.getPropertyValue("--publisher-app-accent-deep")).toBe(
      palette.deep,
    );
    expect(banner).toHaveClass("aspect-[256/125]", "rounded-[1.05cqw]");
    expect(screen.getByTestId("publisher-app-banner-headline")).toHaveStyle({
      fontFamily: "var(--font-nunito)",
    });
    expect(screen.getByTestId("publisher-app-phone-scene")).toHaveClass(
      "left-[46.2cqw]",
      "top-[3.65cqw]",
      "w-[52cqw]",
    );
    expect(screen.getByTestId("publisher-app-current-price")).toHaveClass(
      "w-[26.9cqw]",
    );
    expect(screen.getByTestId("publisher-app-banner-cta")).toHaveClass(
      "bottom-[3.9cqw]",
    );
    expect(screen.getByText("Editar mi app")).toBeTruthy();
  });
});
