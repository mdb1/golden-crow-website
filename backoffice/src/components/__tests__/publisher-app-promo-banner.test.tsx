/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import {
  PublisherAppPromoBanner,
  publisherAppIntensePalette,
} from "@/components/publisher-app-promo-banner";

describe("PublisherAppPromoBanner color system", () => {
  it("turns a muted brand color into a saturated palette without changing hue", () => {
    const palette = publisherAppIntensePalette("#657960");

    expect(palette.source).toBe("#657960");
    expect(palette.hue).toBe(108);
    expect(palette.base).toBe("hsl(108 88% 43%)");
    expect(palette.deep).toBe("hsl(108 82% 23%)");
    expect(palette.vivid).toBe("hsl(108 94% 52%)");
    expect(palette.pop).toBe("hsl(108 96% 59%)");

    for (const color of [
      palette.base,
      palette.deep,
      palette.vivid,
      palette.pop,
      palette.glow,
      palette.shine,
      palette.shadow,
    ]) {
      expect(color).toMatch(/^hsl\(108 /);
    }
  });

  it("applies the intense palette while retaining the source tint metadata", () => {
    const palette = publisherAppIntensePalette("#657960");

    render(
      <PublisherAppPromoBanner
        organizationName="DNA Institute"
        organizationTint="#657960"
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
  });
});
