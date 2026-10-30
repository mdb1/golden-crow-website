"use client";

import { useEffect, useRef } from "react";

const DEFAULT_APP_TINT = "#6D28D9";
const EMERALD_ACCENT = "#00E83C";
const ATOMIC_ASSET_SCRIPT =
  "/open-api/pocketgenes-atomic-banner/asset-library.js";
const ATOMIC_BANNER_SCRIPT = "/open-api/pocketgenes-atomic-banner/banner.js";

type PublisherAppPromoBannerProps = {
  organizationName: string;
  organizationTint?: string;
  ctaLabel?: string;
};

type RGB = {
  red: number;
  green: number;
  blue: number;
};

type AtomicBannerInstance = {
  destroy: () => void;
  update: (values: Record<string, unknown>) => void;
};

type AtomicBannerConfig = {
  accent: string;
  companyName: string;
  actionLabel: string;
};

declare global {
  interface Window {
    ATOMIC_ASSETS?: Record<string, unknown>;
    mountAtomicBanner?: (
      host: HTMLElement,
      config: AtomicBannerConfig,
    ) => AtomicBannerInstance;
  }
}

let atomicRuntimePromise: Promise<void> | undefined;

function normalizedHexColor(value?: string) {
  const trimmed = value?.trim() ?? "";
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash)
    ? withHash.toUpperCase()
    : DEFAULT_APP_TINT;
}

function hexToRgb(value: string): RGB {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function rgbToHsl({ red, green, blue }: RGB) {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  let hue = 0;
  if (delta > 0) {
    if (maximum === normalizedRed) {
      hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
    } else if (maximum === normalizedGreen) {
      hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
    } else {
      hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
    }
  }

  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation: saturation * 100,
  };
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const hueSection = (((hue % 360) + 360) % 360) / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const offset = normalizedLightness - chroma / 2;

  const [red, green, blue] =
    hueSection < 1
      ? [chroma, secondary, 0]
      : hueSection < 2
        ? [secondary, chroma, 0]
        : hueSection < 3
          ? [0, chroma, secondary]
          : hueSection < 4
            ? [0, secondary, chroma]
            : hueSection < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];

  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

/**
 * Converts the publisher tint into the saturated material color expected by
 * the kit. The SVG renderer applies it through currentColor, so its neutral
 * screens, hardware, highlights, and transparent shadows remain untouched.
 */
export function publisherAppIntensePalette(value?: string) {
  const source = normalizedHexColor(value);
  const { hue, saturation } = rgbToHsl(hexToRgb(source));
  const isEmeraldScene = hue >= 72 && hue <= 155;
  const sceneHue = isEmeraldScene ? 136 : hue;
  const accent = isEmeraldScene
    ? EMERALD_ACCENT
    : hslToHex(sceneHue, Math.min(Math.max(saturation, 82), 92), 48);

  return {
    source,
    hue: Math.round(hue),
    sceneHue: Math.round(sceneHue),
    isEmeraldScene,
    accent,
  };
}

function loadScript(id: string, source: string, isReady: () => boolean) {
  if (isReady()) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let existing = document.getElementById(id) as HTMLScriptElement | null;
    if (
      existing?.dataset.atomicLoadState === "error" ||
      existing?.dataset.atomicLoadState === "loaded"
    ) {
      existing.remove();
      existing = null;
    }
    const script = existing ?? document.createElement("script");

    const handleLoad = () => {
      if (isReady()) {
        script.dataset.atomicLoadState = "loaded";
        resolve();
      } else {
        script.dataset.atomicLoadState = "error";
        script.remove();
        reject(
          new Error(`Atomic banner runtime did not initialize: ${source}`),
        );
      }
    };
    const handleError = () => {
      script.dataset.atomicLoadState = "error";
      script.remove();
      reject(new Error(`Unable to load atomic banner runtime: ${source}`));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.id = id;
      script.src = source;
      script.async = true;
      script.dataset.atomicLoadState = "loading";
      document.head.append(script);
    }
  });
}

function loadAtomicBannerRuntime() {
  if (window.ATOMIC_ASSETS && window.mountAtomicBanner) {
    return Promise.resolve();
  }

  atomicRuntimePromise ??= loadScript(
    "pocketgenes-atomic-assets",
    ATOMIC_ASSET_SCRIPT,
    () => Boolean(window.ATOMIC_ASSETS),
  )
    .then(() =>
      loadScript("pocketgenes-atomic-renderer", ATOMIC_BANNER_SCRIPT, () =>
        Boolean(window.mountAtomicBanner),
      ),
    )
    .catch((error) => {
      atomicRuntimePromise = undefined;
      throw error;
    });

  return atomicRuntimePromise;
}

export function PublisherAppPromoBanner({
  organizationName,
  organizationTint,
  ctaLabel = "Crear mi app",
}: PublisherAppPromoBannerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const brandName = organizationName.trim() || "Tu marca";
  const palette = publisherAppIntensePalette(organizationTint);

  useEffect(() => {
    const host = hostRef.current;
    let instance: AtomicBannerInstance | undefined;
    let disposed = false;

    if (!host) {
      return;
    }

    host.dataset.runtimeState = "loading";
    void loadAtomicBannerRuntime()
      .then(() => {
        if (disposed || !window.mountAtomicBanner) {
          return;
        }

        instance = window.mountAtomicBanner(host, {
          accent: palette.accent,
          companyName: brandName,
          actionLabel: ctaLabel,
        });
        host.dataset.runtimeState = "ready";
      })
      .catch((error: unknown) => {
        if (disposed) {
          return;
        }
        host.dataset.runtimeState = "error";
        console.error("Unable to render the PocketGenes atomic banner", error);
      });

    return () => {
      disposed = true;
      instance?.destroy();
    };
  }, [brandName, ctaLabel, palette.accent]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-testid="publisher-app-banner"
      data-accent={palette.source}
      data-atomic-accent={palette.accent}
      data-palette-hue={palette.hue}
      data-renderer="pocketgenes-atomic-banner-kit"
      data-runtime-state="loading"
      className="atomic-host shadow-[0_18px_40px_-28px_rgba(15,23,42,0.65)]"
    >
      <span className="sr-only">La app de {brandName}</span>
      <span className="sr-only">99.99</span>
      <span className="sr-only">59.99</span>
      <span className="sr-only">{ctaLabel}</span>
    </div>
  );
}
