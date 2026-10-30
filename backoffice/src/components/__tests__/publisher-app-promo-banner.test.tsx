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
    expect(palette.base).toBe("hsl(136 76% 34%)");
    expect(palette.deep).toBe("hsl(143 78% 22%)");
    expect(palette.vivid).toBe("hsl(126 82% 48%)");
    expect(palette.pop).toBe("hsl(118 84% 61%)");
    expect(palette.pale).toBe("hsl(136 24% 96%)");
    expect(palette.mint).toBe("hsl(132 48% 76%)");

    for (const color of [
      palette.base,
      palette.deep,
      palette.vivid,
      palette.pop,
      palette.glow,
      palette.shine,
      palette.pale,
      palette.mint,
      palette.shadow,
    ]) {
      expect(color).toMatch(/^hsl\(/);
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
      "h-[40.2cqw]",
      "w-[21.4cqw]",
      "rounded-[4.25cqw]",
    );
    expect(screen.getByTestId("publisher-app-current-price")).toHaveClass(
      "w-[26.9cqw]",
      "rounded-[2.85cqw]",
    );
    expect(screen.getByTestId("publisher-app-banner-cta")).toHaveClass(
      "bottom-[3.9cqw]",
    );
    expect(screen.getByText("Editar mi app")).toBeTruthy();
  });
});
