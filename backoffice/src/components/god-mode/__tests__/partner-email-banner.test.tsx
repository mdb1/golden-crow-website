/** @jest-environment jsdom */

import { act } from "@testing-library/react";
import { toJpeg } from "html-to-image";
import { PublisherAppPromoBanner } from "@/components/publisher-app-promo-banner";
import { renderPartnerEmailBanner } from "@/components/god-mode/partner-email-banner";
import type { PartnerEmailPreview } from "@/lib/partner-email";

jest.mock("html-to-image", () => ({ toJpeg: jest.fn() }));
jest.mock("@/components/publisher-app-promo-banner", () => ({
  PublisherAppPromoBanner: jest.fn(() => (
    <div data-runtime-state="ready">
      <span className="atomic-raster" />
      <span className="atomic-raster" />
      <span className="atomic-raster" />
    </div>
  )),
}));

const brand = {
  name: "DNA INSTITUTE",
  tint: "#657960",
  imageUrl: "",
  contextHash: "a".repeat(64),
};
const dataUrl = "data:image/jpeg;base64,YmFubmVy";
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

beforeAll(() => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
});
afterAll(() => {
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else delete (document as unknown as { fonts?: unknown }).fonts;
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(toJpeg).mockResolvedValue(dataUrl);
});

it.each(["organizationWithoutApp", "individualWithoutApp"] as const)(
  "captures %s without pricing or an internal action in either language",
  async (category) => {
    for (const language of ["es", "en"] as const) {
      let rendering!: ReturnType<typeof renderPartnerEmailBanner>;
      act(() => {
        rendering = renderPartnerEmailBanner(
          brand,
          language,
          category,
          new AbortController().signal,
        );
      });
      let result: Awaited<typeof rendering> | undefined;
      await act(async () => {
        result = await rendering;
      });
      expect(result).toEqual({ contextHash: brand.contextHash, dataUrl });
      expect(
        jest.mocked(PublisherAppPromoBanner).mock.calls.at(-1)?.[0],
      ).toMatchObject({
        organizationName: brand.name,
        organizationTint: brand.tint,
        language,
        showPricing: false,
        showAction: false,
      });
      expect(toJpeg).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ width: 1024 }),
      );
      expect(document.querySelector("[data-email-banner-capture]")).toBeNull();
    }
  },
);

it.each(["freeApp", "contract"] satisfies PartnerEmailPreview["category"][])(
  "preserves the existing %s banner presentation",
  async (category) => {
    let rendering!: ReturnType<typeof renderPartnerEmailBanner>;
    act(() => {
      rendering = renderPartnerEmailBanner(
        brand,
        "es",
        category,
        new AbortController().signal,
      );
    });
    await act(async () => {
      await rendering;
    });
    expect(
      jest.mocked(PublisherAppPromoBanner).mock.calls.at(-1)?.[0],
    ).toMatchObject({ showPricing: true, showAction: true });
  },
);
